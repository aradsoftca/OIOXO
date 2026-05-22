import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from './db';

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
      if (!user?.password) return null;
      const ok = await bcrypt.compare(credentials.password, user.password);
      if (!ok) return null;
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
      if (token.uid) {
        const u = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { plan: true, role: true },
        });
        token.plan = u?.plan ?? 'FREE';
        token.role = u?.role ?? 'USER';
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        const u = session.user as { id?: string; plan?: string; role?: string };
        u.id = token.uid as string;
        u.plan = (token.plan as string) ?? 'FREE';
        u.role = (token.role as string) ?? 'USER';
      }
      return session;
    },
  },
};
