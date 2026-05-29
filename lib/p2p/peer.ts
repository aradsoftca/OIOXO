/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Minimal persistent peer-to-peer text channel, reusing the same same-origin
 * /api/signal relay and STUN servers as Xonvert Send. Unlike the file transfer
 * (one-shot stream), this keeps a bidirectional data channel open so two
 * devices can sync small JSON messages (e.g. clipboard text) both ways.
 *
 * The relay only carries the WebRTC handshake; messages flow directly between
 * the two browsers over the encrypted data channel.
 */

import { getIceServers } from './ice';

export type PeerState = 'connecting' | 'connected' | 'closed' | 'failed';

export interface PeerHandlers {
  onState?: (s: PeerState) => void;
  onMessage?: (data: any) => void;
  /** Raw binary chunk received over the channel (file transfer). */
  onBinary?: (buf: ArrayBuffer) => void;
}

export interface Peer {
  send: (data: any) => boolean;
  sendBinary: (buf: ArrayBuffer) => boolean;
  close: () => void;
}

/** Give up trying to form a direct path after this long → surface a clear failure. */
const CONNECT_TIMEOUT = 20_000;

export function makeRoomCode(): string {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const rand = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) s += a[rand[i] % a.length];
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function connectPeer(role: 's' | 'r', room: string, h: PeerHandlers): Peer {
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let cursor = 0;
  let stopped = false;
  let haveRemote = false;
  let connected = false;
  const iceQueue: RTCIceCandidateInit[] = [];

  const markConnected = () => { connected = true; clearTimeout(watchdog); h.onState?.('connected'); };
  const watchdog = setTimeout(() => { if (!connected && !stopped) h.onState?.('failed'); }, CONNECT_TIMEOUT);

  const post = (data: any) =>
    fetch(`/api/signal/${encodeURIComponent(room)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: role, data }),
    }).catch(() => {});

  const wireChannel = (channel: RTCDataChannel) => {
    dc = channel;
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => markConnected();
    dc.onclose = () => { if (!stopped) h.onState?.('closed'); };
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        // Cap inbound text — a hostile peer could ship a multi-MB JSON
        // payload to OOM us via JSON.parse, or just hand the receiver an
        // unbounded blob to render. WebRTC's own SCTP cap is ~256KB per
        // message in Chrome, but a peer could still send right at that
        // ceiling repeatedly; bound the parsed payload anyway.
        if (e.data.length > 256_000) return;
        try { h.onMessage?.(JSON.parse(e.data)); } catch { /* ignore */ }
      }
      else h.onBinary?.(e.data as ArrayBuffer);
    };
  };

  const handle = async (data: any) => {
    if (!data || !pc) return;
    if (data.kind === 'sdp' && data.sdp) {
      await pc.setRemoteDescription(data.sdp).catch(() => {});
      haveRemote = true;
      for (const c of iceQueue.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (data.sdp.type === 'offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        void post({ kind: 'sdp', sdp: pc.localDescription });
      }
    } else if (data.kind === 'ice' && data.cand) {
      if (haveRemote) await pc.addIceCandidate(data.cand).catch(() => {});
      else iceQueue.push(data.cand);
    }
  };

  // Async init: load ICE servers (same source as Send) before building the PC.
  (async () => {
    const iceServers = await getIceServers();
    if (stopped) return;
    pc = new RTCPeerConnection({ iceServers });
    // If close() ran between the await above and now, the close() call
    // earlier saw pc=null and skipped — we must tear down the just-created
    // RTCPeerConnection so it doesn't leak with open ICE candidates.
    if (stopped) { try { pc.close(); } catch { /* */ } pc = null; return; }

    pc.onicecandidate = (e) => { if (e.candidate) void post({ kind: 'ice', cand: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') markConnected();
      else if (pc.connectionState === 'failed') { clearTimeout(watchdog); h.onState?.('failed'); }
    };

    if (role === 's') {
      wireChannel(pc.createDataChannel('clip', { ordered: true }));
      try {
        const o = await pc.createOffer();
        await pc.setLocalDescription(o);
        await post({ kind: 'sdp', sdp: pc.localDescription });
      } catch { h.onState?.('failed'); }
    } else {
      pc.ondatachannel = (e) => wireChannel(e.channel);
    }

    let backoff = 900;
    while (!stopped) {
      try {
        const r = await fetch(`/api/signal/${encodeURIComponent(room)}?from=${role}&after=${cursor}&_=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`signal ${r.status}`);
        const j = (await r.json()) as { messages?: { seq: number; data: any }[]; cursor?: number };
        for (const m of j.messages ?? []) await handle(m.data);
        if (j.cursor) cursor = j.cursor;
        backoff = 900; // reset on success
      } catch {
        // Back off on errors so a 500ing signal endpoint doesn't get
        // hammered at 900ms forever by every browser in every room.
        backoff = Math.min(backoff * 2, 15_000);
      }
      await sleep(backoff);
    }
  })();

  h.onState?.('connecting');

  return {
    // Wrap send in try/catch — dc.send throws synchronously on oversize
    // payloads (SCTP message > ~256KB) or when bufferedAmount is past the
    // SCTP queue limit. Without the catch, a single oversize push surfaces
    // as an unhandled exception in the caller's onClick / onMessage handler
    // instead of a simple `false` return.
    send: (data) => {
      if (!dc || dc.readyState !== 'open') return false;
      try { dc.send(JSON.stringify(data)); return true; } catch { return false; }
    },
    sendBinary: (buf) => {
      if (!dc || dc.readyState !== 'open') return false;
      try { dc.send(buf); return true; } catch { return false; }
    },
    close: () => { stopped = true; clearTimeout(watchdog); try { dc?.close(); } catch { /* */ } try { pc?.close(); } catch { /* */ } },
  };
}
