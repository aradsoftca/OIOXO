/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Small-group P2P layer (3+ people) on top of the 1:1 peer + /api/signal relay.
 *
 * Topology is a STAR: the host opens a separate 1:1 encrypted channel to each
 * guest (reusing connectPeer) and relays messages between them. Everything is
 * still browser-to-browser — the relay is the host's own browser, never our
 * server. Good for small private rooms; the host must stay connected.
 *
 *   - Guests announce themselves in the base room ({kind:'join', peerId}).
 *   - The host discovers each join and connects on a derived room
 *     `${room}-${peerId}`, then rebroadcasts any message to the other guests.
 */

import { connectPeer, makeRoomCode, type Peer } from './peer';

export type GroupState = 'connecting' | 'connected' | 'failed';

export interface GroupHandlers {
  onState?: (s: GroupState) => void;
  onMessage?: (data: any) => void;
  onRoster?: (count: number) => void;
  onBinary?: (buf: ArrayBuffer) => void;
}

export interface Group {
  send: (data: any) => void;
  sendBinary: (buf: ArrayBuffer) => void;
  close: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function joinGroup(room: string, isHost: boolean, name: string, h: GroupHandlers): Group {
  let stopped = false;

  if (isHost) {
    const peers = new Map<string, Peer>();
    const connectedIds = new Set<string>();
    let cursor = 0;

    const addGuest = (peerId: string) => {
      const peer = connectPeer('s', `${room}-${peerId}`, {
        onState: (s) => {
          if (s === 'connected') { connectedIds.add(peerId); h.onState?.('connected'); h.onRoster?.(peers.size + 1); }
          else if (s === 'failed') {
            // Remove the dead peer so the roster doesn't keep counting a
            // guest that never actually arrived. Previously the failed
            // peer stayed in the map forever, inflating the count by 1
            // per failed join attempt.
            try { peers.get(peerId)?.close(); } catch { /* */ }
            peers.delete(peerId);
            if (connectedIds.size === 0) h.onState?.('failed');
            h.onRoster?.(peers.size + 1);
          }
          else if (s === 'closed') { peers.delete(peerId); connectedIds.delete(peerId); h.onRoster?.(peers.size + 1); }
        },
        // Relay every message (chat + file metadata) and binary chunk to the OTHER guests.
        onMessage: (data) => {
          h.onMessage?.(data);
          for (const [id, p] of peers) if (id !== peerId) p.send(data);
        },
        onBinary: (buf) => {
          h.onBinary?.(buf);
          for (const [id, p] of peers) if (id !== peerId) p.sendBinary(buf);
        },
      });
      peers.set(peerId, peer);
      h.onRoster?.(peers.size + 1);
    };

    (async () => {
      let backoff = 900;
      while (!stopped) {
        try {
          const r = await fetch(`/api/signal/${encodeURIComponent(room)}?from=s&after=${cursor}&_=${Date.now()}`, { cache: 'no-store' });
          if (!r.ok) throw new Error(`signal ${r.status}`);
          const j = (await r.json()) as { messages?: { seq: number; data: any }[]; cursor?: number };
          for (const m of j.messages ?? []) {
            const d = m.data;
            // Validate peerId shape: a hostile client could post 1MB ids or
            // thousands of distinct ids to make the host spawn unbounded
            // RTCPeerConnections (each ~1-5 MB of buffers + ICE sockets).
            // Same DoS class fixed in mesh.ts on Pass 66.
            if (d?.kind !== 'join' || typeof d.peerId !== 'string') continue;
            if (d.peerId.length === 0 || d.peerId.length > 64) continue;
            if (peers.has(d.peerId)) continue;
            if (peers.size >= 32) continue; // hard guest cap
            addGuest(d.peerId);
          }
          if (j.cursor) cursor = j.cursor;
          backoff = 900;
        } catch {
          // Exponential backoff so a failing signal endpoint doesn't get
          // hit every 900ms by every host browser forever.
          backoff = Math.min(backoff * 2, 15_000);
        }
        await sleep(backoff);
      }
    })();

    h.onState?.('connecting');
    return {
      send: (data) => { for (const p of peers.values()) p.send(data); },
      sendBinary: (buf) => { for (const p of peers.values()) p.sendBinary(buf); },
      close: () => { stopped = true; for (const p of peers.values()) p.close(); peers.clear(); },
    };
  }

  // ---- Guest ----
  const peerId = makeRoomCode();
  const peer = connectPeer('r', `${room}-${peerId}`, {
    onState: (s) => h.onState?.(s === 'connected' ? 'connected' : s === 'failed' ? 'failed' : 'connecting'),
    onMessage: (data) => h.onMessage?.(data),
    onBinary: (buf) => h.onBinary?.(buf),
  });

  // Announce ourselves a few times until the host has surely seen us.
  (async () => {
    for (let i = 0; i < 8 && !stopped; i++) {
      await fetch(`/api/signal/${encodeURIComponent(room)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: 'r', data: { kind: 'join', peerId, name } }),
      }).catch(() => {});
      await sleep(1300);
    }
  })();

  h.onState?.('connecting');
  return {
    send: (data) => { peer.send(data); },
    sendBinary: (buf) => { peer.sendBinary(buf); },
    close: () => { stopped = true; peer.close(); },
  };
}
