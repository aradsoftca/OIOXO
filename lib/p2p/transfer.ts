/**
 * Browser-to-browser file transfer over an encrypted WebRTC data channel.
 *
 * The file never touches a server: it streams directly between the two peers.
 * A small same-origin HTTP relay (/api/signal) only carries the WebRTC
 * handshake so the peers can find each other. NAT traversal uses public STUN
 * (discovery only, no relay). Strict-NAT cases that need a TURN relay are not
 * covered yet — those connections will fail rather than fall back.
 */

// ICE servers are fetched from /api/turn at runtime so the relay (TURN) can be
// configured server-side without shipping credentials in the bundle. We start
// with a safe STUN-only default and upgrade in place once the fetch resolves.
// STUN is discovery-only (no bandwidth); TURN, when present, is tried LAST by
// ICE — direct P2P still wins whenever possible and the relay only carries the
// cases that have no direct path (blocking extension / VPN / strict NAT).
let iceServers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

let icePromise: Promise<void> | null = null;
function ensureIce(): Promise<void> {
  if (icePromise) return icePromise;
  icePromise = (async () => {
    try {
      const res = await fetch('/api/turn', { cache: 'no-store' });
      const json = (await res.json()) as { iceServers?: RTCIceServer[] };
      if (Array.isArray(json.iceServers) && json.iceServers.length) iceServers = json.iceServers;
    } catch { /* keep STUN-only default */ }
  })();
  return icePromise;
}
// Warm the config at module load so it's ready before the user acts.
if (typeof window !== 'undefined') void ensureIce();

function newPC(): RTCPeerConnection {
  // No candidate pool: gathering then starts only at setLocalDescription, so an
  // empty "complete" unambiguously means this device produced no path (rather
  // than a pre-gather artifact that could false-trigger the blocked check).
  return new RTCPeerConnection({ iceServers });
}

const CHUNK = 64 * 1024;          // bytes per data-channel send
const BUFFER_HIGH = 8 * 1024 * 1024; // pause sending above 8 MB buffered
const BUFFER_LOW = 1 * 1024 * 1024;  // resume once drained to 1 MB
const POLL_MS = 800;
const CONNECT_TIMEOUT = 15_000;   // try a direct path this long, then ICE-restart
const OFFER_TIMEOUT = 15_000;     // receiver: no offer means the link is dead

/** Failure codes the UI maps to friendly copy. */
export const ERR_NO_DIRECT = 'no-direct'; // couldn't establish a direct P2P path
export const ERR_EXPIRED = 'expired';     // receiver: sender not there / link dead
export const ERR_BLOCKED = 'blocked';     // THIS device emitted no network paths (VPN/firewall/extension)

export type Phase = 'waiting' | 'connecting' | 'transferring' | 'done' | 'error';

export interface FileMeta { name: string; size: number; mime: string }
export interface Progress {
  index: number;       // 0-based file index
  name: string;
  bytes: number;       // bytes done for this file
  total: number;       // size of this file
  filesDone: number;
  filesTotal: number;
  bytesPerSec: number;
}
/** Live connection diagnostics — surfaced in the UI so failures are visible. */
export interface Stat {
  gathering: string;   // iceGatheringState: new | gathering | complete
  ice: string;         // iceConnectionState: new | checking | connected | failed | …
  conn: string;        // connectionState
  local: string;       // local candidate type tally, e.g. "host:2 srflx:1"
  remote: string;      // remote candidate type tally
  mdns: boolean;       // any local host candidate is an mDNS .local name
}
export interface Handlers {
  onPhase?: (p: Phase, detail?: string) => void;
  onProgress?: (p: Progress) => void;
  /** Receiver only: a fully-received file, ready to save. */
  onFile?: (file: { name: string; blob: Blob }) => void;
  /** Live ICE/connection diagnostics. */
  onStat?: (s: Stat) => void;
}

// --- receive sink (memory-bounded) ------------------------------------------
// A FileSink writes incoming chunks to a backing store and hands back a Blob at
// the end. Two implementations:
//   • OpfsSink   — streams each chunk to the Origin Private File System
//                  (navigator.storage, no user gesture needed), so peak memory
//                  is ONE chunk, not the whole file. This is what lets Send
//                  receive files larger than available RAM without crashing —
//                  the old path buffered every ArrayBuffer in an array and then
//                  called new Blob(chunks), which OOM'd past ~2 GB.
//   • MemorySink — the original in-memory fallback for browsers without a
//                  writable OPFS (older Safari/Firefox); unchanged behaviour.
interface FileSink {
  write(chunk: ArrayBuffer): Promise<void>;
  finish(mime: string): Promise<Blob>;
  discard(): Promise<void>;
}

/** True when we can stream received chunks to disk instead of buffering in RAM. */
function opfsAvailable(): boolean {
  try {
    const g = globalThis as any;
    return typeof navigator !== 'undefined'
      && !!navigator.storage?.getDirectory
      // createWritable is the streaming API; without it OPFS can't append cheaply.
      // Reach via globalThis so a missing constructor is undefined, not a ReferenceError.
      && typeof g.FileSystemFileHandle?.prototype?.createWritable === 'function';
  } catch { return false; }
}

class OpfsSink implements FileSink {
  private writable: FileSystemWritableFileStream | null = null;
  private handle: FileSystemFileHandle | null = null;
  private dir: FileSystemDirectoryHandle | null = null;
  private name: string;
  constructor(name: string) {
    // Unique temp name so concurrent/aborted transfers never collide.
    const rnd = crypto.getRandomValues(new Uint32Array(2));
    this.name = `recv-${rnd[0].toString(36)}${rnd[1].toString(36)}-${name}`.slice(0, 200);
  }
  private async ensure(): Promise<FileSystemWritableFileStream> {
    if (this.writable) return this.writable;
    this.dir = await navigator.storage.getDirectory();
    this.handle = await this.dir.getFileHandle(this.name, { create: true });
    this.writable = await this.handle.createWritable();
    return this.writable;
  }
  async write(chunk: ArrayBuffer): Promise<void> {
    const w = await this.ensure();
    await w.write(chunk);
  }
  async finish(_mime: string): Promise<Blob> {
    void _mime; // OPFS File carries its own type; the receiver only needs bytes.
    if (this.writable) { await this.writable.close(); this.writable = null; }
    if (!this.handle) return new Blob([]);
    const file = await this.handle.getFile();
    // The browser keeps the bytes on disk; the Blob is a thin handle over the
    // OPFS file, so reading it for download does not re-buffer the whole file.
    return file;
  }
  async discard(): Promise<void> {
    try { if (this.writable) await this.writable.close(); } catch { /* */ }
    this.writable = null;
    try { await this.dir?.removeEntry(this.name); } catch { /* best-effort */ }
  }
}

class MemorySink implements FileSink {
  private chunks: ArrayBuffer[] = [];
  // Accepts (and ignores) the name so both sinks share makeSink(name)'s shape.
  constructor(_name: string) { void _name; }
  async write(chunk: ArrayBuffer): Promise<void> { this.chunks.push(chunk); }
  async finish(mime: string): Promise<Blob> {
    const blob = new Blob(this.chunks, { type: mime || 'application/octet-stream' });
    this.chunks = [];
    return blob;
  }
  async discard(): Promise<void> { this.chunks = []; }
}

function makeSink(name: string): FileSink {
  return opfsAvailable() ? new OpfsSink(name) : new MemorySink(name);
}

/** Pull the `typ X` token (host/srflx/prflx/relay) out of a candidate line. */
function candType(c?: string): string {
  const m = c && /(?:^|\s)typ (\w+)/.exec(c);
  return m ? m[1] : 'unknown';
}
function isMdns(c?: string): boolean {
  return !!c && /\b[0-9a-f-]+\.local\b/i.test(c);
}

/**
 * Track candidate types + connection state and push a Stat snapshot whenever
 * anything changes. This is the eyes-on-the-handshake that turns "stuck on
 * connecting" into a concrete diagnosis.
 */
function makeStats(pc: RTCPeerConnection, onStat?: (s: Stat) => void, onBlocked?: () => void) {
  const local: Record<string, number> = {};
  const remote: Record<string, number> = {};
  let mdns = false;
  let localCount = 0;
  let blockedFired = false;
  let sawGathering = false;
  const tally = (r: Record<string, number>) =>
    Object.entries(r).map(([k, v]) => `${k}:${v}`).join(' ') || '—';
  const push = () => onStat?.({
    gathering: pc.iceGatheringState,
    ice: pc.iceConnectionState,
    conn: pc.connectionState,
    local: tally(local),
    remote: tally(remote),
    mdns,
  });
  // Gathering finished but we produced no candidate of our own → this device is
  // blocking WebRTC (VPN / firewall / privacy extension / corporate policy).
  // Without a single local path there is nothing to connect to — fail fast with
  // accurate guidance instead of hanging until the generic timeout.
  const onGather = () => {
    if (pc.iceGatheringState === 'gathering') sawGathering = true;
    // Only a genuine attempt (new → gathering → complete) that yields nothing is
    // a real block. A jump straight to "complete" is an artifact, not a block.
    if (pc.iceGatheringState === 'complete' && sawGathering && localCount === 0 && !blockedFired) {
      blockedFired = true;
      onBlocked?.();
    }
  };
  pc.addEventListener('icegatheringstatechange', onGather);
  if (onStat) {
    pc.addEventListener('icegatheringstatechange', push);
    pc.addEventListener('iceconnectionstatechange', push);
    pc.addEventListener('connectionstatechange', push);
    setTimeout(push, 0);
  }
  return {
    addLocal(c?: string) { localCount++; const t = candType(c); local[t] = (local[t] || 0) + 1; if (isMdns(c)) mdns = true; push(); },
    addRemote(c?: string) { const t = candType(c); remote[t] = (remote[t] || 0) + 1; push(); },
  };
}

export interface Transfer { cancel: () => void }

// --- signaling client -------------------------------------------------------
class Signal {
  private cursor = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private room: string, private role: 's' | 'r') {}

  async post(data: unknown): Promise<void> {
    try {
      await fetch(`/api/signal/${encodeURIComponent(this.room)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.role, data }),
        cache: 'no-store',
      });
    } catch { /* transient — next poll recovers */ }
  }

  start(onMessage: (data: unknown) => void): void {
    let backoff = POLL_MS;
    const tick = async () => {
      if (this.stopped) return;
      try {
        const res = await fetch(
          // `_` cache-buster: makes every poll a unique URL so no proxy/CDN
          // (Cloudflare sits in front) can replay a stale "empty" response.
          `/api/signal/${encodeURIComponent(this.room)}?from=${this.role}&after=${this.cursor}&_=${Date.now()}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error(`signal ${res.status}`);
        const json = await res.json() as { messages: { seq: number; data: unknown }[]; cursor: number };
        for (const m of json.messages) onMessage(m.data);
        if (typeof json.cursor === 'number') this.cursor = Math.max(this.cursor, json.cursor);
        backoff = POLL_MS; // reset on success
      } catch {
        // Exponential backoff so a failing signal endpoint doesn't get hit
        // every POLL_MS forever by every Send/Receive pair in flight.
        backoff = Math.min(backoff * 2, 15_000);
      }
      if (!this.stopped) this.timer = setTimeout(tick, backoff);
    };
    void tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}

/** Buffer ICE candidates until the remote description is set, then flush. */
function makeIceQueue(pc: RTCPeerConnection) {
  const pending: RTCIceCandidateInit[] = [];
  let remoteReady = false;
  return {
    async add(c: RTCIceCandidateInit) {
      if (remoteReady) { try { await pc.addIceCandidate(c); } catch { /* ignore */ } }
      else pending.push(c);
    },
    async flush() {
      remoteReady = true;
      for (const c of pending.splice(0)) { try { await pc.addIceCandidate(c); } catch { /* ignore */ } }
    },
  };
}

function randomCode(): string {
  // Avoid look-alike chars; 8 chars ≈ 40 bits — fine for an ephemeral room.
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  for (const b of rnd) s += alphabet[b % alphabet.length];
  return s;
}

async function drain(dc: RTCDataChannel): Promise<void> {
  if (dc.bufferedAmount <= BUFFER_HIGH) return;
  await new Promise<void>((resolve) => {
    // Resolve on EITHER bufferedamountlow OR close — without the close path
    // a channel that died mid-send would hang the sender forever waiting for
    // an event the dead channel will never emit.
    const cleanup = () => {
      dc.removeEventListener('bufferedamountlow', onLow);
      dc.removeEventListener('close', onClose);
      dc.removeEventListener('error', onClose);
      resolve();
    };
    const onLow = () => cleanup();
    const onClose = () => cleanup();
    dc.addEventListener('bufferedamountlow', onLow);
    dc.addEventListener('close', onClose);
    dc.addEventListener('error', onClose);
    // Safety check: if the channel state already changed before we attached
    // the listeners, resolve immediately.
    if (dc.readyState !== 'open' || dc.bufferedAmount <= BUFFER_HIGH) cleanup();
  });
}

// --- sender -----------------------------------------------------------------
export function startSend(files: File[], handlers: Handlers): { code: string; transfer: Transfer } {
  const code = randomCode();
  const signal = new Signal(code, 's');
  let pc: RTCPeerConnection;
  let ice: ReturnType<typeof makeIceQueue>;
  let dc: RTCDataChannel;
  let cancelled = false;
  let connected = false;
  let restarted = false;
  let watch: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    cancelled = true;
    if (watch) { clearTimeout(watch); watch = null; }
    signal.stop();
    try { dc?.close(); } catch { /* ignore */ }
    try { pc?.close(); } catch { /* ignore */ }
  };
  const fail = (codeOrMsg: string) => {
    if (cancelled || connected) return;
    handlers.onPhase?.('error', codeOrMsg);
    cleanup();
  };
  const markConnected = () => { connected = true; if (watch) { clearTimeout(watch); watch = null; } };

  // If a direct path doesn't form in time, try ONE ICE restart (fresh
  // candidates, possibly a different route) before giving up. This is the one
  // "magic" trick that genuinely recovers some failures — at zero cost.
  const onConnectTimeout = async () => {
    if (cancelled || connected) return;
    if (!restarted) {
      restarted = true;
      try {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        await signal.post({ kind: 'offer', sdp: pc.localDescription });
        watch = setTimeout(onConnectTimeout, CONNECT_TIMEOUT);
      } catch { fail(ERR_NO_DIRECT); }
    } else {
      fail(ERR_NO_DIRECT);
    }
  };

  const onChannelOpen = async () => {
    markConnected();
    signal.stop(); // handshake done
    handlers.onPhase?.('transferring');
    try {
      const meta: FileMeta[] = files.map((f) => ({ name: f.name, size: f.size, mime: f.type || 'application/octet-stream' }));
      dc.send(JSON.stringify({ t: 'meta', files: meta }));
      const totalBytes = files.reduce((s, f) => s + f.size, 0);
      let sentAll = 0;
      const t0 = performance.now();
      for (let i = 0; i < files.length; i++) {
        if (cancelled) return;
        const f = files[i];
        dc.send(JSON.stringify({ t: 'file', i }));
        let sent = 0;
        for (let off = 0; off < f.size; off += CHUNK) {
          if (cancelled) return;
          await drain(dc);
          const buf = await f.slice(off, off + CHUNK).arrayBuffer();
          dc.send(buf);
          sent += buf.byteLength; sentAll += buf.byteLength;
          const secs = (performance.now() - t0) / 1000;
          handlers.onProgress?.({
            index: i, name: f.name, bytes: sent, total: f.size,
            filesDone: i, filesTotal: files.length,
            bytesPerSec: secs > 0 ? sentAll / secs : 0,
          });
        }
        dc.send(JSON.stringify({ t: 'fileend', i }));
      }
      // Wait for the buffer to flush before signalling end + closing.
      // Bail if the channel dies mid-drain — a dead channel can hold bytes
      // in bufferedAmount forever, hanging the sender on a useless poll.
      const drainStart = performance.now();
      while (dc.bufferedAmount > 0 && !cancelled && dc.readyState === 'open') {
        if (performance.now() - drainStart > 30_000) break; // hard 30s drain cap
        await new Promise((r) => setTimeout(r, 100));
      }
      if (dc.readyState === 'open') dc.send(JSON.stringify({ t: 'end' }));
      // Wait for the receiver's ACK before declaring Done, so "Done ✓" means the
      // bytes actually landed on the other device (and were flushed to disk),
      // not just that our own send buffer drained. Fall back to Done after a
      // grace period if the ack never arrives (older receiver / channel closed
      // right after the last byte) — never hang on a missing ack.
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => { if (settled) return; settled = true; cleanupAck(); resolve(); };
        const onMsg = (e: MessageEvent) => {
          if (typeof e.data !== 'string') return;
          try { if ((JSON.parse(e.data) as { t?: string }).t === 'ack') finish(); } catch { /* ignore */ }
        };
        const cleanupAck = () => {
          dc.removeEventListener('message', onMsg);
          dc.removeEventListener('close', finish);
          clearTimeout(timer);
        };
        const timer = setTimeout(finish, 8000); // grace fallback
        dc.addEventListener('message', onMsg);
        dc.addEventListener('close', finish);
      });
      handlers.onPhase?.('done');
      void totalBytes;
    } catch (err) {
      handlers.onPhase?.('error', (err as Error).message);
    }
  };

  (async () => {
    try {
      await ensureIce(); // load TURN/STUN config before building the connection
      if (cancelled) return;
      pc = newPC();
      ice = makeIceQueue(pc);
      const stats = makeStats(pc, handlers.onStat, () => fail(ERR_BLOCKED));

      dc = pc.createDataChannel('xonvert-send', { ordered: true });
      dc.binaryType = 'arraybuffer';
      dc.bufferedAmountLowThreshold = BUFFER_LOW;
      dc.onopen = onChannelOpen;

      pc.onicecandidate = (e) => {
        if (e.candidate) { stats.addLocal(e.candidate.candidate); void signal.post({ kind: 'ice', candidate: e.candidate.toJSON() }); }
      };
      pc.onconnectionstatechange = () => {
        // Only the data channel opening counts as "connected" — a half-open ICE
        // state must NOT cancel the watchdog, or the UI can hang on "connecting".
        if (pc.connectionState === 'failed') fail(ERR_NO_DIRECT);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await signal.post({ kind: 'offer', sdp: pc.localDescription });
      handlers.onPhase?.('waiting'); // waiting for the receiver to open the link (no timeout — could be minutes)
      signal.start(async (data) => {
        const m = data as { kind: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
        if (m.kind === 'answer' && m.sdp) {
          // The receiver has joined — now we're negotiating a direct path.
          handlers.onPhase?.('connecting');
          await pc.setRemoteDescription(m.sdp);
          await ice.flush();
          if (!connected && !watch) watch = setTimeout(onConnectTimeout, CONNECT_TIMEOUT);
        } else if (m.kind === 'ice' && m.candidate) {
          stats.addRemote(m.candidate.candidate);
          await ice.add(m.candidate);
        }
      });
    } catch (err) {
      fail((err as Error).message);
    }
  })();

  return { code, transfer: { cancel: cleanup } };
}

// --- receiver ---------------------------------------------------------------
export function startReceive(code: string, handlers: Handlers): Transfer {
  const signal = new Signal(code, 'r');
  let pc: RTCPeerConnection;
  let ice: ReturnType<typeof makeIceQueue>;
  let stats: ReturnType<typeof makeStats>;
  let cancelled = false;
  let connected = false;
  let gotOffer = false;
  let offerWatch: ReturnType<typeof setTimeout> | null = null;
  let connectWatch: ReturnType<typeof setTimeout> | null = null;

  let meta: FileMeta[] = [];
  let cur = -1;
  // Per-file streaming sink (OPFS when available, else in-memory). Chunks are
  // written as they arrive so peak memory is one chunk, not the whole file.
  let sink: FileSink | null = null;
  // Serialize the async sink writes: data-channel onmessage is synchronous and
  // delivers chunks in order, but sink.write() is async. We chain each write
  // onto the previous so they commit in arrival order and a fileend awaits them.
  let writeChain: Promise<void> = Promise.resolve();
  let dcRef: RTCDataChannel | null = null;
  // Running per-file byte count. Used to be `chunks.reduce(...)` recomputed on
  // every chunk and every progress event — O(n²) over a 1 GB transfer
  // (16384 chunks × 16384 iters = 268M ops). A counter makes it O(1) per chunk.
  let curBytes = 0;
  let received = 0;
  let filesDone = 0;
  const t0 = { v: 0 };

  const clearTimers = () => {
    if (offerWatch) { clearTimeout(offerWatch); offerWatch = null; }
    if (connectWatch) { clearTimeout(connectWatch); connectWatch = null; }
  };
  const cleanup = () => {
    cancelled = true; clearTimers(); signal.stop();
    // Drop any half-written streaming sink so we don't leave orphaned OPFS temp
    // files behind on cancel/failure.
    if (sink) { void sink.discard(); sink = null; }
    try { pc?.close(); } catch { /* ignore */ }
  };
  const fail = (codeOrMsg: string) => {
    if (cancelled || connected) return;
    handlers.onPhase?.('error', codeOrMsg);
    cleanup();
  };
  const markConnected = () => { connected = true; clearTimers(); };

  // No offer within the window → the sender's tab is gone or the link expired.
  offerWatch = setTimeout(() => { if (!gotOffer) fail(ERR_EXPIRED); }, OFFER_TIMEOUT);

  const onDataChannel = (ev: RTCDataChannelEvent) => {
    const dc = ev.channel;
    dcRef = dc;
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => { markConnected(); handlers.onPhase?.('transferring'); };
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        let msg: { t: string; files?: FileMeta[]; i?: number };
        try {
          msg = JSON.parse(e.data) as { t: string; files?: FileMeta[]; i?: number };
        } catch {
          // A malformed control message would otherwise throw out of the
          // handler and silently desync the receiver state. Surface and bail.
          handlers.onPhase?.('error', 'protocol error');
          cleanup();
          return;
        }
        // Validate the shape of msg.files defensively — a hostile peer could
        // send {"t":"meta","files":"oops"} which would otherwise be assigned
        // to `meta` as a string and confuse every later access.
        if (msg.t === 'meta') {
          // Cap declared size at 10 GiB per file — anything beyond is almost
          // certainly a hostile peer trying to make the receiver allocate
          // unbounded buffers ahead of fileend. Also clamp name length so a
          // 1MB filename can't be used as a download-path attack.
          const MAX_DECL = 10 * 1024 * 1024 * 1024;
          // Sanitize the peer-supplied filename. Browsers' <a download> attribute
          // SHOULD strip path separators per spec, but coverage isn't uniform —
          // and the name also feeds tools/listings that don't go through that
          // sanitizer. Strip path separators, NULs, and control chars; collapse
          // to "file" if the result is empty.
          const safeName = (raw: string): string => {
            const trimmed = raw
              .replace(/[\\/\x00-\x1f]/g, '_')
              // Reject leading dots that some OS hide / interpret specially.
              .replace(/^\.+/, '')
              .slice(0, 255)
              .trim();
            return trimmed || 'file';
          };
          meta = Array.isArray(msg.files) ? msg.files.filter((f): f is FileMeta =>
            !!f && typeof (f as FileMeta).name === 'string' && typeof (f as FileMeta).size === 'number'
            && (f as FileMeta).size >= 0 && (f as FileMeta).size <= MAX_DECL
          ).map((f) => ({ ...f, name: safeName(f.name as string) })) : [];
          if (!t0.v) t0.v = performance.now();
        }
        else if (msg.t === 'file') {
          const i = typeof msg.i === 'number' ? msg.i : 0;
          cur = i >= 0 && i < meta.length ? i : -1;
          // Discard any half-written sink from an aborted previous file, then
          // open a fresh streaming sink for this one.
          if (sink) { void sink.discard(); sink = null; }
          if (cur >= 0) sink = makeSink(meta[cur]?.name || `file-${cur + 1}`);
          writeChain = Promise.resolve();
          curBytes = 0;
        }
        else if (msg.t === 'fileend') {
          if (cur < 0 || !sink) { curBytes = 0; return; }
          const fm = meta[cur];
          const theSink = sink;
          sink = null;
          curBytes = 0;
          filesDone += 1;
          // Wait for all queued chunk writes to commit, THEN finalize the blob.
          // Done off the sync handler so we don't block the data channel.
          void writeChain
            .then(() => theSink.finish(fm?.mime || 'application/octet-stream'))
            .then((blob) => handlers.onFile?.({ name: fm?.name || `file-${cur + 1}`, blob }))
            .catch((err) => { handlers.onPhase?.('error', (err as Error).message || 'save failed'); cleanup(); });
        } else if (msg.t === 'end') {
          // The sender has sent everything. Only NOW — after the last file's
          // writes have flushed to disk — do we ack + show "done", so the
          // sender's Done is truthful (it waits for this ack). Previously the
          // sender declared Done on its own buffer draining, before the receiver
          // had necessarily written anything.
          void writeChain
            .catch(() => { /* a failed write already surfaced via fileend */ })
            .then(() => {
              try { if (dcRef?.readyState === 'open') dcRef.send(JSON.stringify({ t: 'ack', received: filesDone })); } catch { /* */ }
              handlers.onPhase?.('done');
              signal.stop();
            });
        }
      } else {
        // Binary chunk arrived before any valid 'file' control message — drop
        // it rather than push into a phantom file the user never sees. Without
        // this, a peer that skips the meta/file header would silently leak
        // chunks into chunks[] indefinitely (memory blow-up on a bad peer).
        if (cur < 0 || !sink) return;
        const buf = e.data as ArrayBuffer;
        const fm0 = meta[cur];
        // Reject overrun: a peer claiming a 100KB file then streaming 100GB
        // would otherwise stream all of it before fileend.
        const max = (fm0?.size || 0) + 64 * 1024; // allow one chunk of slack
        if (curBytes + buf.byteLength > max) {
          handlers.onPhase?.('error', 'sender exceeded declared size');
          cleanup();
          return;
        }
        // Stream the chunk to the sink. Chain writes so they commit in arrival
        // order; a write failure (e.g. disk full) surfaces as an error.
        const theSink = sink;
        writeChain = writeChain.then(() => theSink.write(buf)).catch((err) => {
          handlers.onPhase?.('error', (err as Error)?.message || 'could not write to disk');
          cleanup();
        });
        curBytes += buf.byteLength;
        received += buf.byteLength;
        const fm = meta[cur];
        const secs = (performance.now() - t0.v) / 1000;
        handlers.onProgress?.({
          index: cur, name: fm?.name || '', bytes: curBytes, total: fm?.size || 0,
          filesDone, filesTotal: meta.length, bytesPerSec: secs > 0 ? received / secs : 0,
        });
      }
    };
  };

  handlers.onPhase?.('connecting'); // show progress immediately while config loads

  (async () => {
    await ensureIce(); // load TURN/STUN config before building the connection
    if (cancelled) return;
    pc = newPC();
    ice = makeIceQueue(pc);
    stats = makeStats(pc, handlers.onStat, () => fail(ERR_BLOCKED));

    pc.onicecandidate = (e) => {
      if (e.candidate) { stats.addLocal(e.candidate.candidate); void signal.post({ kind: 'ice', candidate: e.candidate.toJSON() }); }
    };
    pc.onconnectionstatechange = () => {
      // Data-channel open is the real success signal (see sender note above).
      if (pc.connectionState === 'failed') fail(ERR_NO_DIRECT);
    };
    pc.ondatachannel = onDataChannel;

    signal.start(async (data) => {
      const m = data as { kind: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      try {
        if (m.kind === 'offer' && m.sdp) {
          gotOffer = true;
          if (offerWatch) { clearTimeout(offerWatch); offerWatch = null; }
          handlers.onPhase?.('connecting');
          await pc.setRemoteDescription(m.sdp);
          await ice.flush();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await signal.post({ kind: 'answer', sdp: pc.localDescription });
          // (Re)arm the watchdog. A second offer = the sender's ICE-restart retry,
          // so reset it and wait a bit longer rather than giving up underneath them.
          if (connectWatch) clearTimeout(connectWatch);
          if (!connected) connectWatch = setTimeout(() => fail(ERR_NO_DIRECT), CONNECT_TIMEOUT * 2 + 4000);
        } else if (m.kind === 'ice' && m.candidate) {
          stats.addRemote(m.candidate.candidate);
          await ice.add(m.candidate);
        }
      } catch (err) {
        fail((err as Error).message);
      }
    });
  })();

  return { cancel: cleanup };
}

// --- connection self-test ---------------------------------------------------
export interface SelfTest {
  host: number;        // local-network candidates (your Wi-Fi/LAN card)
  srflx: number;       // public candidates discovered via STUN (UDP to internet works)
  relay: number;       // TURN relay candidates (we use none)
  mdns: boolean;       // host candidates are mDNS .local names
  candidates: string[];// sample raw candidate lines
  errors: string[];    // STUN gathering errors (code + text)
  gathering: string;   // final iceGatheringState
  durationMs: number;
  verdict: 'ok' | 'no-local' | 'no-internet' | 'none';
}

/**
 * Run a bare WebRTC gathering probe — no signaling, no peer, no relay. It just
 * asks the browser "what network paths can you expose?" and reports back. This
 * isolates a device-level block (extension / firewall / VPN adapter / policy)
 * from anything in the transfer flow.
 */
export async function runSelfTest(timeoutMs = 8000): Promise<SelfTest> {
  const res: SelfTest = {
    host: 0, srflx: 0, relay: 0, mdns: false, candidates: [], errors: [],
    gathering: 'new', durationMs: 0, verdict: 'none',
  };
  await ensureIce();
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const pc = new RTCPeerConnection({ iceServers });
  pc.createDataChannel('probe');
  pc.onicecandidate = (e) => {
    const c = e.candidate?.candidate;
    if (!c) return;
    const t = candType(c);
    if (t === 'host') res.host++; else if (t === 'srflx') res.srflx++; else if (t === 'relay') res.relay++;
    if (isMdns(c)) res.mdns = true;
    if (res.candidates.length < 12) res.candidates.push(c);
  };
  pc.addEventListener('icecandidateerror', (ev) => {
    const e = ev as RTCPeerConnectionIceErrorEvent;
    const line = `${e.errorCode}${e.errorText ? ' ' + e.errorText : ''}${e.url ? ' @ ' + e.url : ''}`.trim();
    if (res.errors.length < 8 && !res.errors.includes(line)) res.errors.push(line);
  });
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise<void>((resolve) => {
      const finish = () => { res.gathering = pc.iceGatheringState; resolve(); };
      const timer = setTimeout(finish, timeoutMs);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(timer); finish(); }
      });
    });
  } catch (err) {
    res.errors.push(`create-offer: ${(err as Error).message}`);
  }
  res.durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  try { pc.close(); } catch { /* ignore */ }
  res.verdict =
    res.relay > 0 ? 'ok'                        // relay reachable → will connect even if direct is blocked
    : (res.host > 0 && res.srflx > 0) ? 'ok'    // full direct path available
    : res.host === 0 ? 'no-local'               // browser exposes no local path at all
    : 'no-internet';                            // local OK, but UDP to the internet is blocked
  return res;
}

export function formatBytes(b: number): string {
  if (b <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let v = b, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
