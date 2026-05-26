/**
 * oioxo Compute Mesh — SERVER RECONCILIATION (stage 7). The ONLY place the mesh touches
 * our server: when a consumer reports usage, it attaches the receipts it banked from its
 * own provider devices. This turns a batch of receipts into granted credit seconds,
 * enforcing the daily cap + replay protection via CreditLedger. No model, no files, no
 * relay — just signed receipts, verified against the account's registered device keys.
 *
 * Pure: `verify` is injected (prod: device-key.makeVerifier over the account's key map),
 * as is the clock + the prior persisted state (so the route just loads/saves the
 * per-account, per-UTC-day {seenKeys, grantedTodaySec}).
 */
import { CreditLedger, DEFAULT_POLICY, type CreditPolicy, type WorkReceipt, type Verifier, type RedeemReason } from './compute-credit';

export interface ReconcileState {
  /** Replay keys already consumed this day (persist with the account/day row). */
  seenKeys: string[];
  /** Credit seconds already granted this day. */
  grantedTodaySec: number;
}

export interface ReconcileResult {
  /** New credit seconds to add to the account's allowance from this batch. */
  grantedSec: number;
  /** Per-receipt outcome (for telemetry / debugging). */
  perReceipt: { key: string; granted: number; reason: RedeemReason }[];
  /** The state to persist back (replaces the prior day row). */
  state: ReconcileState;
}

/**
 * Reconcile a batch of receipts into credit. Idempotent across calls via the persisted
 * `seenKeys` (a replayed receipt grants 0). Order-independent within the cap.
 */
export async function reconcileReceipts(
  receipts: WorkReceipt[],
  verify: Verifier,
  opts: { policy?: CreditPolicy; now?: () => number; prior?: ReconcileState } = {},
): Promise<ReconcileResult> {
  const policy = opts.policy ?? DEFAULT_POLICY;
  const led = new CreditLedger(policy, {
    now: opts.now,
    seenKeys: opts.prior?.seenKeys,
    grantedTodaySec: opts.prior?.grantedTodaySec,
  });

  let grantedSec = 0;
  const perReceipt: ReconcileResult['perReceipt'] = [];
  for (const r of Array.isArray(receipts) ? receipts : []) {
    const res = await led.redeem(r, verify);
    grantedSec += res.granted;
    perReceipt.push({ key: keyOf(r), granted: res.granted, reason: res.reason });
  }

  return { grantedSec, perReceipt, state: { seenKeys: led.seenKeys(), grantedTodaySec: led.grantedTodaySec() } };
}

/** Best-effort replay key for telemetry (mirrors CreditLedger.key; tolerates junk). */
function keyOf(r: Partial<WorkReceipt>): string {
  return `${r?.deviceId ?? '?'}:${r?.seq ?? '?'}`;
}
