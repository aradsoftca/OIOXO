/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Peer-to-peer AUDIO/VIDEO connector, sharing the same /api/signal relay + STUN
 * as Send and the Universal Clipboard. Unlike peer.ts (data only), this carries
 * real-time media tracks: used for live screen-share / "watch together" and the
 * no-signup video call. Media streams browser-to-browser, encrypted; the relay
 * only carries the SDP/ICE handshake.
 */

import { getIceServers } from './ice';

export type MediaState = 'connecting' | 'connected' | 'closed' | 'failed';

export interface MediaHandlers {
  /** Local tracks to publish (e.g. screen, or camera+mic). Omit for receive-only. */
  localStream?: MediaStream | null;
  onRemoteStream?: (stream: MediaStream) => void;
  onState?: (s: MediaState) => void;
  /** Text/emoji received over the side data channel (in-call chat). */
  onMessage?: (text: string) => void;
}

export interface MediaPeer {
  close: () => void;
  /** Send a short text/emoji to the peer over the data channel. */
  send: (text: string) => void;
  /** Swap the outgoing video track (e.g. raw camera ⇄ virtual-background canvas). */
  replaceVideoTrack: (track: MediaStreamTrack | null) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function connectMedia(role: 's' | 'r', room: string, h: MediaHandlers): MediaPeer {
  let pc: RTCPeerConnection | null = null;
  const remote = new MediaStream();
  let cursor = 0;
  let stopped = false;
  let haveRemote = false;
  let connected = false;
  let chan: RTCDataChannel | null = null;
  const iceQueue: RTCIceCandidateInit[] = [];

  // Side channel for in-call text/emoji. Offerer creates it; answerer receives it.
  const wireChannel = (dc: RTCDataChannel) => {
    chan = dc;
    dc.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      // Cap inbound text — a hostile peer could ship a multi-MB string and
      // freeze the receiver's UI rendering it. In-call chat messages are
      // short by nature; 8KB is generous for an emoji-and-text line.
      if (e.data.length > 8_000) return;
      h.onMessage?.(e.data);
    };
  };

  const markConnected = () => { connected = true; clearTimeout(watchdog); h.onState?.('connected'); };
  const watchdog = setTimeout(() => { if (!connected && !stopped) h.onState?.('failed'); }, 20_000);

  const post = (data: any) =>
    fetch(`/api/signal/${encodeURIComponent(room)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: role, data }),
    }).catch(() => {});

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

  (async () => {
    const iceServers = await getIceServers();
    if (stopped) return;
    pc = new RTCPeerConnection({ iceServers });

    if (h.localStream) for (const t of h.localStream.getTracks()) pc.addTrack(t, h.localStream);
    else { try { pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' }); } catch { /* */ } }

    // In-call chat data channel: the offerer opens it, the answerer listens.
    if (role === 's') { try { wireChannel(pc.createDataChannel('chat')); } catch { /* */ } }
    else pc.ondatachannel = (e) => wireChannel(e.channel);

    pc.ontrack = (e) => { remote.addTrack(e.track); h.onRemoteStream?.(remote); };
    pc.onicecandidate = (e) => { if (e.candidate) void post({ kind: 'ice', cand: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') markConnected();
      else if (pc.connectionState === 'failed') { clearTimeout(watchdog); h.onState?.('failed'); }
      // `disconnected` is transient — a brief network blip that often
      // recovers to `connected` within seconds. Emitting 'closed' here
      // would tear down the viewer's player on every Wi-Fi micro-outage.
      // Only `closed` (terminal) maps to onState('closed'); 'failed' has
      // its own branch above.
      else if (pc.connectionState === 'closed') { if (!stopped) h.onState?.('closed'); }
    };

    if (role === 's') {
      try {
        const o = await pc.createOffer();
        await pc.setLocalDescription(o);
        await post({ kind: 'sdp', sdp: pc.localDescription });
      } catch { h.onState?.('failed'); }
    }

    let backoff = 900;
    while (!stopped) {
      try {
        const r = await fetch(`/api/signal/${encodeURIComponent(room)}?from=${role}&after=${cursor}&_=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`signal ${r.status}`);
        const j = (await r.json()) as { messages?: { seq: number; data: any }[]; cursor?: number };
        for (const m of j.messages ?? []) await handle(m.data);
        if (j.cursor) cursor = j.cursor;
        backoff = 900;
      } catch {
        // Exponential backoff so a failing signal endpoint doesn't get
        // hammered at 900ms forever by every media session in flight.
        backoff = Math.min(backoff * 2, 15_000);
      }
      await sleep(backoff);
    }
  })();

  h.onState?.('connecting');
  return {
    close: () => { stopped = true; clearTimeout(watchdog); try { chan?.close(); } catch { /* */ } try { pc?.close(); } catch { /* */ } },
    send: (text: string) => { try { if (chan && chan.readyState === 'open') chan.send(text); } catch { /* */ } },
    replaceVideoTrack: (track) => {
      try {
        const sender = pc?.getSenders().find((s) => s.track?.kind === 'video') ?? pc?.getSenders().find((s) => !s.track);
        void sender?.replaceTrack(track);
      } catch { /* */ }
    },
  };
}
