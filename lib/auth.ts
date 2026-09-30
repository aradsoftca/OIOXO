import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { EMAIL_NOT_VERIFIED, needsVerification } from './email-verify';

// Google is only registered when its credentials are present, so a build or a
// dev instance without OAuth secrets still boots (credentials login keeps
// working). Migrated Google users link automatically: the adapter matches the
// existing Account row by (provider, providerAccountId) copied from France.
const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Email',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password) return null;
      const user = await prisma.user.findUnique({ where: { email: credentials.email } });
      // Always run bcrypt.compare — including against a dummy hash when no
      // user / no password — so response time is constant regardless of
      // whether the email exists. Otherwise an attacker times the response
      // (~100ms with bcrypt vs ~1ms without) to enumerate registered emails.
      // The dummy must be a structurally valid bcrypt hash — `bcrypt.compare`
      // throws on a malformed prefix, which would itself create a timing
      // signal. This one is a real hash of an arbitrary string that no real
      // password will ever match.
      const DUMMY_HASH = '$2a$10$DidcYOGX/AZsHDBveDEtd.Iw0oYZOV8e76fxDGJoDetKAlDhuR2Qy';
      const hash = user?.password || DUMMY_HASH;
      const ok = await bcrypt.compare(credentials.password, hash);
      if (!user?.password || !ok) return null;
      // Right password but the email isn't confirmed yet: tell the sign-in page (res.error)
      // so it can offer to resend the link. Only reached with the correct password.
      if (needsVerification(user)) throw new Error(EMAIL_NOT_VERIFIED);
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Existing France users were created with this provider; allow linking a
      // returning Google identity to the migrated account by verified email.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as never,
  session: { strategy: 'jwt' },
  pages: { signIn: '/auth/sign-in' },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      // Keep plan fresh on the token so the UI reflects upgrades/downgrades.
      // Also pull subscriptionEndsAt so the session callback can apply the
      // same fail-safe the API gates use (Pass 73): if Stripe's deletion
      // webhook never lands, the stored plan stays PRO forever — past-period
      // users must gate as FREE in the client UI too, otherwise they see
      // Pro features that the server then denies.
      if (token.uid) {
        const u = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { plan: true, role: true, subscriptionEndsAt: true },
        });
        token.plan = u?.plan ?? 'FREE';
        token.role = u?.role ?? 'USER';
        token.subEndsAt = u?.subscriptionEndsAt ? u.subscriptionEndsAt.getTime() : null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        const u = session.user as { id?: string; plan?: string; role?: string };
        u.id = token.uid as string;
        const subEndsAt = token.subEndsAt as number | null | undefined;
        // 24h buffer matches the API-side fail-safe so a webhook running a
        // few hours late doesn't strand a paying user.
        const expired = typeof subEndsAt === 'number' && subEndsAt + 24 * 60 * 60 * 1000 < Date.now();
        u.plan = expired ? 'FREE' : ((token.plan as string) ?? 'FREE');
        u.role = (token.role as string) ?? 'USER';
      }
      return session;
    },
  },
};
