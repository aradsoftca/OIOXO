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
      if (typeof e.data === 'string') { try { h.onMessage?.(JSON.parse(e.data)); } catch { /* ignore */ } }
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

    while (!stopped) {
      try {
        const r = await fetch(`/api/signal/${encodeURIComponent(room)}?from=${role}&after=${cursor}&_=${Date.now()}`, { cache: 'no-store' });
        const j = (await r.json()) as { messages?: { seq: number; data: any }[]; cursor?: number };
        for (const m of j.messages ?? []) await handle(m.data);
        if (j.cursor) cursor = j.cursor;
      } catch { /* keep polling */ }
      await sleep(900);
    }
  })();

  h.onState?.('connecting');

  return {
    send: (data) => { if (dc && dc.readyState === 'open') { dc.send(JSON.stringify(data)); return true; } return false; },
    sendBinary: (buf) => { if (dc && dc.readyState === 'open') { dc.send(buf); return true; } return false; },
    close: () => { stopped = true; clearTimeout(watchdog); try { dc?.close(); } catch { /* */ } try { pc?.close(); } catch { /* */ } },
  };
}
