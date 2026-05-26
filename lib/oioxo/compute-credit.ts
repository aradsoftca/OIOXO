/**
 * oioxo Compute Mesh — COMPUTE CREDIT (OIOXO_COMPUTE_MESH.md, stage 1). The pure
 * token economy that lets a user lift the usage limit on a weak device by serving the
 * work on a strong device they own. A PROVIDER signs a `WorkReceipt` for each job it
 * runs; a CONSUMER banks receipts and redeems them into credit seconds against the
 * limit ledger (`usage-client.ts`). Nothing here touches the network — the receipt is
 * the only thing that ever reaches our server, and only at report-time.
 *
 * Crypto is INJECTED (a `Signer`/`Verifier` pair) so this module is host-independent
 * and Node-testable: the browser wires Web Crypto (ECDSA/Ed25519) + a per-device key
 * bound to the account; tests pass a trivial fake. The canonical serialization that
 * gets signed lives here so issuer and verifier agree byte-for-byte.
 *
 * Anti-abuse is structural, not heuristic: receipts are account-bound (you can only
 * credit your own account), replay-proofed by a monotonic per-device `seq` + `nonce`,
 * tied to real work by a `jobHash`, and CLAMPED per-receipt + per-day. The daily cap
 * is the business lever — generous to self-hosters (they cost us nothing) while Pro
 * keeps its value via no-cap + priority + frontier escalation.
 */

/** Schema version — bump on any change to the signed field set. */
export const RECEIPT_V = 1 as const;

export interface WorkReceipt {
  v: typeof RECEIPT_V;
  /** Provider's account-bound device key id (public). */
  deviceId: string;
  /** Monotonic per-device counter. The ledger dedupes on (deviceId, seq). */
  seq: number;
  /** Random nonce — extra replay guard, also makes equal jobs distinct receipts. */
  nonce: string;
  /** Fingerprint of (task + input files + output edits): ties credit to real work. */
  jobHash: string;
  /** Wall-seconds the provider spent serving the job (the primary credit metric). */
  servedSec: number;
  /** Output tokens generated (secondary metric / sanity bound). */
  tokensOut: number;
  /** Epoch ms when issued. */
  issuedAt: number;
  /** Signature over canonicalPayload(receipt) — proves the provider device authored it. */
  sig: string;
}

/** The receipt minus its signature — exactly the bytes that get signed. */
export type ReceiptPayload = Omit<WorkReceipt, 'sig'>;

/** Sign arbitrary bytes (string). Browser: Web Crypto with the device key. */
export type Signer = (canonical: string) => Promise<string> | string;
/** Verify a signature against the canonical bytes, for a given deviceId. */
export type Verifier = (canonical: string, sig: string, deviceId: string) => Promise<boolean> | boolean;

/**
 * Deterministic, key-ordered serialization of the signed fields. MUST be identical on
 * the issuer and every verifier — so it is hand-built (not `JSON.stringify` of the
 * whole object) with a fixed field order and no signature field.
 */
export function canonicalPayload(p: ReceiptPayload): string {
  return JSON.stringify([
    p.v,
    p.deviceId,
    p.seq,
    p.nonce,
    p.jobHash,
    p.servedSec,
    p.tokensOut,
    p.issuedAt,
  ]);
}

export interface IssueInput {
  deviceId: string;
  seq: number;
  jobHash: string;
  servedSec: number;
  tokensOut: number;
  /** Injected clock (tests) — defaults to Date.now. */
  now?: () => number;
  /** Injected nonce (tests) — defaults to crypto random hex. */
  nonce?: () => string;
}

/** Build + sign a receipt for one served job. */
export async function issueReceipt(input: IssueInput, sign: Signer): Promise<WorkReceipt> {
  const payload: ReceiptPayload = {
    v: RECEIPT_V,
    deviceId: input.deviceId,
    seq: input.seq,
    nonce: (input.nonce ?? randomNonce)(),
    jobHash: input.jobHash,
    servedSec: Math.max(0, Math.round(input.servedSec)),
    tokensOut: Math.max(0, Math.round(input.tokensOut)),
    issuedAt: (input.now ?? Date.now)(),
  };
  const sig = await sign(canonicalPayload(payload));
  return { ...payload, sig };
}

/** Structural validity (shape + ranges) — cheap pre-check before signature verify. */
export function isWellFormed(r: unknown): r is WorkReceipt {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    x.v === RECEIPT_V &&
    typeof x.deviceId === 'string' && x.deviceId.length > 0 &&
    typeof x.seq === 'number' && Number.isFinite(x.seq) && x.seq >= 0 &&
    typeof x.nonce === 'string' && x.nonce.length > 0 &&
    typeof x.jobHash === 'string' && x.jobHash.length > 0 &&
    typeof x.servedSec === 'number' && Number.isFinite(x.servedSec) && x.servedSec >= 0 &&
    typeof x.tokensOut === 'number' && Number.isFinite(x.tokensOut) && x.tokensOut >= 0 &&
    typeof x.issuedAt === 'number' && Number.isFinite(x.issuedAt) &&
    typeof x.sig === 'string' && x.sig.length > 0
  );
}

export interface CreditPolicy {
  /** Credit seconds granted per second the provider served (e.g. 1 = full reimbursement). */
  secPerServedSec: number;
  /** Extra credit seconds per output token (small; keeps short-but-heavy jobs fair). */
  secPerToken: number;
  /** Hard clamp on a single receipt's credit (guards a runaway / inflated servedSec). */
  maxPerReceiptSec: number;
  /** Max credit seconds granted per day from this mechanism (the Pro lever). */
  dailyCapSec: number;
  /** Reject receipts older than this many ms (stale-receipt guard). Default 7 days. */
  maxAgeMs?: number;
}

/** Default policy: full time-reimbursement, 5 min/receipt, 1 h/day free via own compute. */
export const DEFAULT_POLICY: CreditPolicy = {
  secPerServedSec: 1,
  secPerToken: 0.02,
  maxPerReceiptSec: 300,
  dailyCapSec: 3600,
  maxAgeMs: 7 * 24 * 3600 * 1000,
};

/** Uncapped credit value of a receipt (before per-day budgeting). */
export function creditForReceipt(r: WorkReceipt, policy: CreditPolicy): number {
  const raw = r.servedSec * policy.secPerServedSec + r.tokensOut * policy.secPerToken;
  return Math.max(0, Math.min(policy.maxPerReceiptSec, Math.round(raw)));
}

export type RedeemReason =
  | 'granted'
  | 'malformed'
  | 'bad-signature'
  | 'duplicate'
  | 'expired'
  | 'daily-cap';

export interface RedeemResult {
  /** Credit seconds actually granted (0 unless reason === 'granted'). */
  granted: number;
  reason: RedeemReason;
}

/**
 * Pure, stateful accumulator that turns verified receipts into credit seconds while
 * enforcing replay protection and the daily cap. One instance per account-day context;
 * the server constructs it from the persisted (seenKeys, grantedToday) for the current
 * UTC day. Verification is injected so the same ledger serves server and client.
 */
export class CreditLedger {
  private readonly policy: CreditPolicy;
  private readonly now: () => number;
  private readonly seen: Set<string>;
  private granted: number;

  constructor(
    policy: CreditPolicy = DEFAULT_POLICY,
    opts: { now?: () => number; seenKeys?: Iterable<string>; grantedTodaySec?: number } = {},
  ) {
    this.policy = policy;
    this.now = opts.now ?? Date.now;
    this.seen = new Set(opts.seenKeys ?? []);
    this.granted = Math.max(0, opts.grantedTodaySec ?? 0);
  }

  /** Replay key for a receipt. */
  static key(r: Pick<WorkReceipt, 'deviceId' | 'seq'>): string {
    return `${r.deviceId}:${r.seq}`;
  }

  /** Credit seconds granted so far in this ledger's window. */
  grantedTodaySec(): number {
    return this.granted;
  }

  /** Replay keys consumed so far (persist alongside grantedTodaySec). */
  seenKeys(): string[] {
    return [...this.seen];
  }

  /**
   * Verify + redeem one receipt. Idempotent on duplicates. `verify` checks the
   * signature against the canonical payload; pass an always-true verifier only in
   * trusted/test contexts. Partial grants happen when the daily cap is nearly full.
   */
  async redeem(r: WorkReceipt, verify: Verifier): Promise<RedeemResult> {
    if (!isWellFormed(r)) return { granted: 0, reason: 'malformed' };

    const maxAge = this.policy.maxAgeMs ?? DEFAULT_POLICY.maxAgeMs!;
    if (this.now() - r.issuedAt > maxAge) return { granted: 0, reason: 'expired' };

    const key = CreditLedger.key(r);
    if (this.seen.has(key)) return { granted: 0, reason: 'duplicate' };

    const ok = await verify(canonicalPayload(stripSig(r)), r.sig, r.deviceId);
    if (!ok) return { granted: 0, reason: 'bad-signature' };

    // Reserve the key even on a cap-blocked grant so a later replay can't sneak through.
    this.seen.add(key);

    const room = this.policy.dailyCapSec - this.granted;
    if (room <= 0) return { granted: 0, reason: 'daily-cap' };

    // Room remains, so the receipt is accepted (and its key reserved above). A tiny
    // sub-second job can legitimately be worth 0 — that's still 'granted', not capped.
    const value = Math.min(creditForReceipt(r, this.policy), room);
    this.granted += value;
    return { granted: value, reason: 'granted' };
  }
}

/** Strip the signature to recover the signed payload (for re-canonicalization). */
function stripSig(r: WorkReceipt): ReceiptPayload {
  const { sig: _sig, ...rest } = r;
  return rest;
}

/** Default nonce source — 8 random bytes as hex. Works in browser + Node 18+. */
function randomNonce(): string {
  const b = new Uint8Array(8);
  (globalThis.crypto ?? (globalThis as { crypto?: Crypto }).crypto)?.getRandomValues(b);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}
