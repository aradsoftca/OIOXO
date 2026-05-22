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
    const tick = async () => {
      if (this.stopped) return;
      try {
        const res = await fetch(
          // `_` cache-buster: makes every poll a unique URL so no proxy/CDN
          // (Cloudflare sits in front) can replay a stale "empty" response.
          `/api/signal/${encodeURIComponent(this.room)}?from=${this.role}&after=${this.cursor}&_=${Date.now()}`,
          { cache: 'no-store' },
        );
        const json = await res.json() as { messages: { seq: number; data: unknown }[]; cursor: number };
        for (const m of json.messages) onMessage(m.data);
        if (typeof json.cursor === 'number') this.cursor = Math.max(this.cursor, json.cursor);
      } catch { /* ignore, retry */ }
      if (!this.stopped) this.timer = setTimeout(tick, POLL_MS);
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
    const handler = () => { dc.removeEventListener('bufferedamountlow', handler); resolve(); };
    dc.addEventListener('bufferedamountlow', handler);
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
      while (dc.bufferedAmount > 0 && !cancelled) await new Promise((r) => setTimeout(r, 100));
      dc.send(JSON.stringify({ t: 'end' }));
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
  let chunks: ArrayBuffer[] = [];
  let received = 0;
  let filesDone = 0;
  const t0 = { v: 0 };

  const clearTimers = () => {
    if (offerWatch) { clearTimeout(offerWatch); offerWatch = null; }
    if (connectWatch) { clearTimeout(connectWatch); connectWatch = null; }
  };
  const cleanup = () => { cancelled = true; clearTimers(); signal.stop(); try { pc?.close(); } catch { /* ignore */ } };
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
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => { markConnected(); handlers.onPhase?.('transferring'); };
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data) as { t: string; files?: FileMeta[]; i?: number };
        if (msg.t === 'meta') { meta = msg.files || []; if (!t0.v) t0.v = performance.now(); }
        else if (msg.t === 'file') { cur = msg.i ?? 0; chunks = []; }
        else if (msg.t === 'fileend') {
          const fm = meta[cur];
          const blob = new Blob(chunks, { type: fm?.mime || 'application/octet-stream' });
          chunks = [];
          filesDone += 1;
          handlers.onFile?.({ name: fm?.name || `file-${cur + 1}`, blob });
        } else if (msg.t === 'end') {
          handlers.onPhase?.('done');
          signal.stop();
        }
      } else {
        const buf = e.data as ArrayBuffer;
        chunks.push(buf);
        received += buf.byteLength;
        const fm = meta[cur];
        const secs = (performance.now() - t0.v) / 1000;
        const fileBytes = chunks.reduce((s, c) => s + c.byteLength, 0);
        handlers.onProgress?.({
          index: cur, name: fm?.name || '', bytes: fileBytes, total: fm?.size || 0,
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
