/**
 * oioxo Compute Mesh — SERVER credit application (stage 7 backend). Bridges the pure
 * reconciler (credit-server.reconcileReceipts) to Postgres: verify a batch of receipts
 * against the ACCOUNT's registered device keys (device-key.makeVerifier), redeem them
 * with replay-protection + the daily cap, and persist the running per-day state. The
 * usage route adds the returned credit seconds to that day's free allowance.
 *
 * Server-only (imports prisma). Everything trust-related lives in the tested pure cores;
 * this is the thin IO shell around them.
 */
import { prisma } from '@/lib/db';
import { makeVerifier } from './device-key';
import { reconcileReceipts } from './credit-server';
import type { WorkReceipt } from './compute-credit';

/** Today at UTC midnight — matches the @db.Date column + the usage service. */
function utcToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Credit seconds already earned today (added to the free allowance). 0 on any error. */
export async function currentMeshCredit(userId: string): Promise<number> {
  try {
    const row = await prisma.meshCreditDay.findUnique({ where: { userId_date: { userId, date: utcToday() } } });
    return row?.grantedSec ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Verify + redeem a batch of receipts for an account, persist the new day state, and
 * return the day's total credit seconds. Fails open to the current total on any error
 * (never blocks the meter). Only receipts signed by a key registered to THIS account
 * verify; replays across reports grant nothing.
 */
export async function applyMeshReceipts(userId: string, receipts: unknown[]): Promise<number> {
  try {
    const date = utcToday();
    const [keys, prior] = await Promise.all([
      prisma.deviceKey.findMany({ where: { userId }, select: { deviceId: true, publicKeyJwk: true } }),
      prisma.meshCreditDay.findUnique({ where: { userId_date: { userId, date } } }),
    ]);
    const keyMap = new Map(keys.map((k) => [k.deviceId, k.publicKeyJwk as unknown as JsonWebKey]));
    const verify = makeVerifier((id) => keyMap.get(id) ?? null);

    const result = await reconcileReceipts((receipts ?? []) as WorkReceipt[], verify, {
      prior: { seenKeys: prior?.seenKeys ?? [], grantedTodaySec: prior?.grantedSec ?? 0 },
    });

    await prisma.meshCreditDay.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, grantedSec: result.state.grantedTodaySec, seenKeys: result.state.seenKeys },
      update: { grantedSec: result.state.grantedTodaySec, seenKeys: result.state.seenKeys },
    });
    return result.state.grantedTodaySec;
  } catch {
    return currentMeshCredit(userId);
  }
}
