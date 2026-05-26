/**
 * oioxo Compute Mesh — RECEIPT GLUE (stage 2). Ties the transport (`remote-coder.ts`,
 * which is decoupled and only sees an opaque receipt) to the economy
 * (`compute-credit.ts`). The PROVIDER builds an issuer here and passes its `.issue`
 * to `serveCoder({ issueReceipt })`; the CONSUMER passes a banking callback to
 * `makePeerCoder({ onReceipt })` and later redeems banked receipts via a CreditLedger.
 *
 * The job fingerprint is deterministic and computed identically on both sides, so a
 * consumer can RECOMPUTE it from what it sent + received and reject a receipt whose
 * `jobHash` doesn't match the actual work (a forged/inflated claim). Hashing is
 * injected (browser: SHA-256 via Web Crypto; tests: a trivial fn), keeping this pure
 * and Node-testable.
 */
import type { GenContext, Edit } from './codeloop';
import { issueReceipt, type Signer, type WorkReceipt } from './compute-credit';

/** Hash a string → hex/opaque digest. Browser wires SHA-256; tests pass a fake. */
export type HashFn = (s: string) => Promise<string> | string;

/**
 * Canonical, order-independent fingerprint of a job: the task + its input files +
 * the output edits, each sorted by path so the issuer and verifier agree byte-for-byte.
 */
export async function jobFingerprint(ctx: GenContext, edits: Edit[], hash: HashFn): Promise<string> {
  const sortByPath = <T extends { path: string }>(xs: T[]) => [...xs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const canonical = JSON.stringify({
    task: ctx.task,
    files: sortByPath(ctx.files).map((f) => [f.path, f.content]),
    edits: sortByPath(edits).map((e) => [e.path, e.content]),
  });
  return hash(canonical);
}

export interface ReceiptIssuerOpts {
  /** This provider device's account-bound key id (public). */
  deviceId: string;
  /** Signs the canonical receipt payload (browser: Web Crypto with the device key). */
  sign: Signer;
  /** Job fingerprint hash (browser: SHA-256). */
  hash: HashFn;
  /** Starting seq (resume the monotonic counter across sessions). Default 0. */
  startSeq?: number;
}

export interface ReceiptIssuer {
  /** Pass this straight to `serveCoder({ issueReceipt })`. */
  issue: (ctx: GenContext, edits: Edit[], meta: { servedSec: number; tokensOut: number }) => Promise<WorkReceipt>;
  /** Next seq that will be used (for persistence). */
  nextSeq: () => number;
}

/** Build a provider-side issuer with a monotonic seq counter bound to the device key. */
export function makeReceiptIssuer(opts: ReceiptIssuerOpts): ReceiptIssuer {
  let seq = opts.startSeq ?? 0;
  return {
    nextSeq: () => seq,
    issue: async (ctx, edits, meta) => {
      const jobHash = await jobFingerprint(ctx, edits, opts.hash);
      const r = await issueReceipt(
        { deviceId: opts.deviceId, seq, jobHash, servedSec: meta.servedSec, tokensOut: meta.tokensOut },
        opts.sign,
      );
      seq += 1;
      return r;
    },
  };
}

/**
 * Consumer-side guard: confirm a banked receipt actually corresponds to the job the
 * consumer sent + got back, by recomputing the fingerprint. Pair this with a signature
 * check (CreditLedger.redeem's verifier) for full trust. Returns true when it matches.
 */
export async function receiptMatchesJob(
  receipt: Pick<WorkReceipt, 'jobHash'>,
  ctx: GenContext,
  edits: Edit[],
  hash: HashFn,
): Promise<boolean> {
  return receipt.jobHash === (await jobFingerprint(ctx, edits, hash));
}
