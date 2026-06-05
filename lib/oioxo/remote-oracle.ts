/**
 * oioxo Code — DISTRIBUTED ORACLE over P2P (Gem 5: "the room is the computer").
 * The heavy part of the loop is VERIFICATION — running tests, a full build, a big
 * type-check — not generation. So let a weak device DRIVE the loop while a stronger
 * nearby peer (laptop/desktop) does the verifying, over the same WebRTC channel as
 * Xonvert Send. The phone plans + edits; the desktop judges. Zero servers, near-zero
 * egress — exactly the platform economics.
 *
 * `remoteRun` returns a RunFn that ships {files, cmd} to the worker and resolves
 * with its verdict — it plugs straight into runCodeLoop as the `run` oracle.
 * `serveOracle` is the worker: it answers verify requests with its local RunFn
 * (WebContainer/tests). Pure protocol over an injectable transport (loopback-tested
 * here; the real connectPeer is already battle-tested by Send/clipboard/chat).
 */
import { connectPeer, makeRoomCode, type Peer, type PeerState, type PeerHandlers } from '@/lib/p2p/peer';
import type { CodeFile, RunFn, RunResult } from './codeloop';

export type ConnectFn = (role: 's' | 'r', room: string, h: PeerHandlers) => Peer;

type OracleMsg =
  | { kind: 'verify'; id: number; files: CodeFile[]; cmd: string }
  | { kind: 'result'; id: number; ok: boolean; output: string; errors: string };

export interface DriverHandle {
  /** The code to give the worker device. */
  room: string;
  /** A RunFn that verifies on the remote worker — drop into runCodeLoop. */
  run: RunFn;
  state(): PeerState;
  cancel(): void;
}

/**
 * The DRIVER side (weak device). Opens a room, returns a RunFn that asks the worker
 * to verify each candidate. Falls back to a clear timeout error (the loop treats it
 * as a failed attempt, never hangs) when no worker answers.
 */
export function driveWithRemoteOracle(opts: {
  onState?: (s: PeerState) => void;
  timeoutMs?: number;
  connect?: ConnectFn;
} = {}): DriverHandle {
  const room = makeRoomCode();
  const pending = new Map<number, (r: RunResult) => void>();
  let state: PeerState = 'connecting';
  let seq = 0;
  let peer: Peer | null = null;
  peer = (opts.connect ?? connectPeer)('s', room, {
    onState: (s) => { state = s; opts.onState?.(s); },
    onMessage: (m: OracleMsg) => {
      if (m?.kind === 'result' && pending.has(m.id)) {
        pending.get(m.id)!({ ok: m.ok, output: m.output, errors: m.errors });
        pending.delete(m.id);
      }
    },
  });
  const timeoutMs = opts.timeoutMs ?? 60000;
  const run: RunFn = (files, cmd) =>
    new Promise<RunResult>((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      peer!.send({ kind: 'verify', id, files, cmd } satisfies OracleMsg);
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); resolve({ ok: false, output: '', errors: 'remote oracle timed out' }); }
      }, timeoutMs);
    });
  return { room, run, state: () => state, cancel: () => peer?.close() };
}

export interface WorkerHandle { state(): PeerState; cancel(): void; }

/**
 * The WORKER side (stronger device). Joins the driver's room and answers each
 * verify request by running its LOCAL oracle (`localRun` — e.g. the WebContainer
 * test runner) and posting the verdict back. Stays open for the whole session.
 */
export function serveOracle(
  room: string,
  localRun: RunFn,
  opts: { onState?: (s: PeerState) => void; onJob?: (cmd: string) => void; connect?: ConnectFn } = {},
): WorkerHandle {
  let state: PeerState = 'connecting';
  let peer: Peer | null = null;
  peer = (opts.connect ?? connectPeer)('r', room, {
    onState: (s) => { state = s; opts.onState?.(s); },
    onMessage: async (m: OracleMsg) => {
      if (m?.kind !== 'verify') return;
      opts.onJob?.(m.cmd);
      let res: RunResult;
      try { res = await localRun(m.files, m.cmd); }
      catch (e) { res = { ok: false, output: '', errors: String((e as Error)?.message || e) }; }
      peer!.send({ kind: 'result', id: m.id, ok: res.ok, output: res.output, errors: res.errors } satisfies OracleMsg);
    },
  });
  return { state: () => state, cancel: () => peer?.close() };
}
