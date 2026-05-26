/**
 * oioxo Code — REMOTE CODER (the "any device" keystone). On a no-WebGPU device the
 * loop is cheap to RUN (type-check / WebContainer work anywhere) but expensive to
 * GENERATE (the CPU/WASM model is slow + weak). So offload only the GENERATION: the
 * weak device drives the verified loop locally and asks a stronger source for the
 * edits —
 *   • a PEER with a GPU over the WebRTC channel (Gem 5 sibling, host-nothing), or
 *   • an HTTP inference endpoint (e.g. the Iceland GPU server) for a metered tier.
 * Either returns a GenerateFn that drops straight into runCodeLoop / buildOrFix.
 * Pure protocol over an injectable transport (loopback/fake-fetch tested).
 */
import { connectPeer, makeRoomCode, type Peer, type PeerState, type PeerHandlers } from '@/lib/p2p/peer';
import type { GenContext, Edit, GenerateFn } from './codeloop';

export type ConnectFn = (role: 's' | 'r', room: string, h: PeerHandlers) => Peer;

/** The wire form of a generation request (the loop's context, files trimmed by
 *  the caller as needed). The responder runs a model and returns full-file edits. */
interface GenReq { task: string; files: { path: string; content: string }[]; error?: string; attempt: number }

/* ── HTTP coder: offload to an inference endpoint (server tier) ──────────────── */

/**
 * A GenerateFn that POSTs the loop context to an inference endpoint and expects
 * `{ edits: [{path, content}] }` back. The endpoint runs the model (e.g. on the
 * Iceland GPU). `fetch` is injectable for tests. Throws on a non-OK response so the
 * loop treats it as a failed attempt (never hangs); empty edits = no change.
 */
export function makeHttpCoder(
  endpoint: string,
  opts: { fetchImpl?: typeof fetch; headers?: Record<string, string>; maxFiles?: number } = {},
): GenerateFn {
  const f = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
  return async (ctx: GenContext): Promise<Edit[]> => {
    const body: GenReq = {
      task: ctx.task,
      files: ctx.files.slice(0, opts.maxFiles ?? 40).map((x) => ({ path: x.path, content: x.content })),
      error: ctx.error,
      attempt: ctx.attempt,
    };
    const res = await f(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('remote coder HTTP ' + res.status);
    const data = (await res.json()) as { edits?: unknown };
    return Array.isArray(data?.edits)
      ? (data.edits as Edit[]).filter((e) => e && typeof e.path === 'string' && typeof e.content === 'string')
      : [];
  };
}

/* ── Peer coder: borrow a connected device's model over WebRTC ───────────────── */

type CoderMsg =
  | { kind: 'gen'; id: number; req: GenReq }
  // `receipt` (optional) is a compute-mesh WorkReceipt minted by the provider for the
  // work just served — banked by the consumer to earn credit. Opaque here (kept
  // decoupled from compute-credit); undefined when receipts aren't configured.
  | { kind: 'edits'; id: number; edits: Edit[]; receipt?: unknown };

export interface PeerCoderHandle {
  /** Code to give the GPU peer that will serve generation. */
  room: string;
  /** Drop into runCodeLoop / buildOrFix as the generator. */
  generate: GenerateFn;
  state(): PeerState;
  cancel(): void;
}

/** The weak (driver) side: opens a room and returns a GenerateFn that asks the
 *  connected GPU peer for edits. Times out to empty edits (a failed attempt, never
 *  a hang) if no peer answers. */
export function makePeerCoder(opts: { onState?: (s: PeerState) => void; timeoutMs?: number; connect?: ConnectFn; onReceipt?: (receipt: unknown) => void } = {}): PeerCoderHandle {
  const room = makeRoomCode();
  const pending = new Map<number, (e: Edit[]) => void>();
  let state: PeerState = 'connecting';
  let seq = 0;
  let peer: Peer | null = null;
  peer = (opts.connect ?? connectPeer)('s', room, {
    onState: (s) => { state = s; opts.onState?.(s); },
    onMessage: (m: CoderMsg) => {
      if (m?.kind === 'edits' && pending.has(m.id)) {
        // Bank the provider's receipt (if any) before resolving the generation.
        if (m.receipt !== undefined) { try { opts.onReceipt?.(m.receipt); } catch { /* banking never blocks the loop */ } }
        pending.get(m.id)!(Array.isArray(m.edits) ? m.edits : []);
        pending.delete(m.id);
      }
    },
  });
  const timeoutMs = opts.timeoutMs ?? 120000;
  const generate: GenerateFn = (ctx) =>
    new Promise<Edit[]>((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      const req: GenReq = { task: ctx.task, files: ctx.files.map((x) => ({ path: x.path, content: x.content })), error: ctx.error, attempt: ctx.attempt };
      peer!.send({ kind: 'gen', id, req } satisfies CoderMsg);
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve([]); } }, timeoutMs);
    });
  return { room, generate, state: () => state, cancel: () => peer?.close() };
}

export interface ServeCoderHandle { state(): PeerState; cancel(): void; }

/** The GPU (worker) side: joins the driver's room and answers each generation
 *  request by running ITS local generator (its on-device coder), returning edits. */
/** Mints a signed WorkReceipt for one served job. The work metrics are measured by
 *  serveCoder; the callback (app layer) fingerprints + signs it. Returns null to skip. */
export type IssueReceiptFn = (
  ctx: GenContext,
  edits: Edit[],
  meta: { servedSec: number; tokensOut: number },
) => Promise<unknown> | unknown;

export function serveCoder(
  room: string,
  localGenerate: GenerateFn,
  opts: { onState?: (s: PeerState) => void; onJob?: (task: string) => void; connect?: ConnectFn; issueReceipt?: IssueReceiptFn } = {},
): ServeCoderHandle {
  let state: PeerState = 'connecting';
  let peer: Peer | null = null;
  peer = (opts.connect ?? connectPeer)('r', room, {
    onState: (s) => { state = s; opts.onState?.(s); },
    onMessage: async (m: CoderMsg) => {
      if (m?.kind !== 'gen') return;
      opts.onJob?.(m.req.task);
      const ctx = { ...m.req, files: m.req.files } as GenContext;
      let edits: Edit[] = [];
      const t0 = Date.now();
      try { edits = (await localGenerate(ctx)) ?? []; }
      catch { edits = []; }
      // Mint a receipt for the compute just spent (compute-mesh credit), if configured.
      let receipt: unknown;
      if (opts.issueReceipt) {
        const meta = { servedSec: (Date.now() - t0) / 1000, tokensOut: estimateTokens(edits) };
        try { receipt = await opts.issueReceipt(ctx, edits, meta); } catch { receipt = undefined; }
      }
      peer!.send({ kind: 'edits', id: m.id, edits, receipt } satisfies CoderMsg);
    },
  });
  return { state: () => state, cancel: () => peer?.close() };
}

/** Coarse output-token estimate from generated edits (~4 chars/token). The provider
 *  measures the metric so the receipt's claim is grounded in what was actually sent. */
function estimateTokens(edits: Edit[]): number {
  const chars = edits.reduce((n, e) => n + (e.content?.length ?? 0), 0);
  return Math.ceil(chars / 4);
}
