import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Resolve the current admin user, or null. Gates on role=ADMIN, with ADMIN_EMAIL
 * as an env-configured fallback (matches the old stack). Always re-checks the DB
 * rather than trusting the session token alone.
 */
export async function getAdmin(): Promise<{ id: string; email: string | null } | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } });
  if (!user) return null;
  const adminEmail = process.env.ADMIN_EMAIL?.replace(/^"|"$/g, '').toLowerCase();
  if (user.role === 'ADMIN' || (adminEmail && user.email?.toLowerCase() === adminEmail)) {
    return { id: user.id, email: user.email };
  }
  return null;
}

/** Record an admin mutation in the AuditLog (best-effort). */
export async function logAudit(
  admin: { id: string; email: string | null },
  action: string,
  entity: string,
  entityId?: string,
  details?: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        adminEmail: admin.email ?? 'unknown',
        action,
        entity,
        entityId,
        details: (details as object) ?? undefined,
      },
    });
  } catch (e) {
    console.error('[audit] failed to log:', (e as Error).message);
  }
}
