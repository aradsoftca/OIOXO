/**
 * oioxo Compute Mesh — SINGLE-CHANNEL SESSION (stage 9 wiring). Serverless QR pairing
 * (local-peer.ts) gives ONE data channel between two devices, but the work is several
 * conversations — generate, verify, receipts, capability hello. This multiplexes them
 * over that one channel so a paired device can be BOTH a provider and a consumer at
 * once (the mesh ideal: any device helps, any device asks).
 *
 * Transport-agnostic + Node-testable: `send` is injected (prod: peer.send) and incoming
 * messages are fed to `handleMessage` (prod: the peer's onMessage handler). Two sessions
 * wired send<->handleMessage form a loopback with no real WebRTC, which is how it's
 * tested. The consumer side exposes a `GenerateFn` + `RunFn` that drop into the loop or
 * the pools (via mesh-wire); the provider side answers using injected local engines and
 * mints a receipt per job (mesh-receipt + device-key).
 */
import type { GenContext, Edit, GenerateFn, RunFn, RunResult, CodeFile } from './codeloop';
import type { HelperProfile } from './mesh';

export type MeshMsg =
  | { t: 'hello'; profile: HelperProfile }
  | { t: 'gen'; id: number; ctx: GenContext }
  | { t: 'edits'; id: number; edits: Edit[]; receipt?: unknown }
  | { t: 'verify'; id: number; files: CodeFile[]; cmd: string }
  | { t: 'result'; id: number; res: RunResult };

export interface MeshSessionOpts {
  /** Provider side: how this device generates edits when a peer asks. */
  localGenerate?: GenerateFn;
  /** Provider side: how this device verifies when a peer asks. */
  localRun?: RunFn;
  /** Provider side: mint a receipt for the work just served (mesh-receipt issuer). */
  issueReceipt?: (ctx: GenContext, edits: Edit[], meta: { servedSec: number; tokensOut: number }) => Promise<unknown> | unknown;
  /** Consumer side: bank a receipt that arrived with edits. */
  onReceipt?: (receipt: unknown) => void;
  /** This device's capability profile, announced on connect. */
  profile?: HelperProfile;
  /** Consumer side: a peer announced its profile (register it as a helper). */
  onPeerProfile?: (profile: HelperProfile) => void;
  /** Request deadline before a borrowed call gives up (failed attempt, never hangs). */
  timeoutMs?: number;
  now?: () => number;
}

export interface MeshSession {
  /** Feed every incoming message here (wire to peer.onMessage). */
  handleMessage: (msg: unknown) => void;
  /** Consumer GenerateFn over this peer (drop into a pool / the loop). */
  generate: GenerateFn;
  /** Consumer RunFn over this peer. */
  run: RunFn;
  /** Send this device's capability profile to the peer. */
  announce: () => void;
}

function estimateTokens(edits: Edit[]): number {
  return Math.ceil(edits.reduce((n, e) => n + (e.content?.length ?? 0), 0) / 4);
}

/** Build a multiplexed mesh session over one bidirectional channel. */
export function meshSession(send: (msg: MeshMsg) => void, opts: MeshSessionOpts = {}): MeshSession {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const now = opts.now ?? Date.now;
  let seq = 0;
  const pendingEdits = new Map<number, (e: Edit[]) => void>();
  const pendingRes = new Map<number, (r: RunResult) => void>();

  const handleMessage = async (raw: unknown): Promise<void> => {
    const msg = raw as MeshMsg;
    if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') return;
    switch (msg.t) {
      case 'hello':
        opts.onPeerProfile?.(msg.profile);
        break;

      case 'gen': {
        // PROVIDER: generate, then mint a receipt for the compute spent.
        let edits: Edit[] = [];
        const t0 = now();
        try { edits = (await opts.localGenerate?.(msg.ctx)) ?? []; } catch { edits = []; }
        let receipt: unknown;
        if (opts.issueReceipt) {
          const meta = { servedSec: (now() - t0) / 1000, tokensOut: estimateTokens(edits) };
          try { receipt = await opts.issueReceipt(msg.ctx, edits, meta); } catch { receipt = undefined; }
        }
        send({ t: 'edits', id: msg.id, edits, receipt });
        break;
      }

      case 'edits': {
        // CONSUMER: bank the receipt, resolve the pending generation.
        const resolve = pendingEdits.get(msg.id);
        if (resolve) {
          if (msg.receipt !== undefined) { try { opts.onReceipt?.(msg.receipt); } catch { /* never blocks */ } }
          pendingEdits.delete(msg.id);
          resolve(Array.isArray(msg.edits) ? msg.edits : []);
        }
        break;
      }

      case 'verify': {
        // PROVIDER: verify with the local oracle.
        let res: RunResult;
        try { res = (await opts.localRun?.(msg.files, msg.cmd)) ?? { ok: false, output: '', errors: 'no local runner' }; }
        catch (e) { res = { ok: false, output: '', errors: String((e as Error)?.message || e) }; }
        send({ t: 'result', id: msg.id, res });
        break;
      }

      case 'result': {
        const resolve = pendingRes.get(msg.id);
        if (resolve) { pendingRes.delete(msg.id); resolve(msg.res); }
        break;
      }
    }
  };

  const generate: GenerateFn = (ctx) =>
    new Promise<Edit[]>((resolve) => {
      const id = ++seq;
      pendingEdits.set(id, resolve);
      send({ t: 'gen', id, ctx });
      setTimeout(() => { if (pendingEdits.has(id)) { pendingEdits.delete(id); resolve([]); } }, timeoutMs);
    });

  const run: RunFn = (files, cmd) =>
    new Promise<RunResult>((resolve) => {
      const id = ++seq;
      pendingRes.set(id, resolve);
      send({ t: 'verify', id, files, cmd });
      setTimeout(() => { if (pendingRes.has(id)) { pendingRes.delete(id); resolve({ ok: false, output: '', errors: 'peer verify timed out' }); } }, timeoutMs);
    });

  const announce = () => { if (opts.profile) send({ t: 'hello', profile: opts.profile }); };

  return { handleMessage, generate, run, announce };
}
