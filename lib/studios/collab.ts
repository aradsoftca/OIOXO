export interface CollabPeer {
  id: string;
  name: string;
  color: string;
  cursor?: { line: number; col: number };
}

export interface CollabMessage {
  type: 'sync-doc' | 'op' | 'awareness' | 'hello' | 'ping';
  from: string;
  payload: any;
  ts: number;
  vector?: Record<string, number>;
}

export interface DocOp {
  id: string;
  type: 'insert' | 'delete' | 'set';
  pos?: number;
  text?: string;
  len?: number;
  key?: string;
  value?: any;
  author: string;
  ts: number;
  vector: Record<string, number>;
}

export class CrdtDoc {
  private localId: string;
  private vector: Record<string, number> = {};
  private oplog: DocOp[] = [];
  private state: string = '';
  private listeners: Array<(state: string, op?: DocOp) => void> = [];

  constructor(localId: string) {
    this.localId = localId;
    this.vector[localId] = 0;
  }

  getState(): string { return this.state; }
  getVector(): Record<string, number> { return { ...this.vector }; }
  getOpLog(): DocOp[] { return [...this.oplog]; }

  onUpdate(fn: (state: string, op?: DocOp) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify(op?: DocOp) {
    for (const l of this.listeners) l(this.state, op);
  }

  private nextVector(): Record<string, number> {
    this.vector[this.localId] = (this.vector[this.localId] ?? 0) + 1;
    return { ...this.vector };
  }

  insert(pos: number, text: string): DocOp {
    const op: DocOp = {
      id: `${this.localId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'insert', pos, text,
      author: this.localId, ts: Date.now(),
      vector: this.nextVector(),
    };
    this.applyLocal(op);
    return op;
  }

  delete(pos: number, len: number): DocOp {
    const op: DocOp = {
      id: `${this.localId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'delete', pos, len,
      author: this.localId, ts: Date.now(),
      vector: this.nextVector(),
    };
    this.applyLocal(op);
    return op;
  }

  setState(text: string) {
    this.state = text;
    this.oplog = [];
    this.notify();
  }

  private applyLocal(op: DocOp) {
    this.oplog.push(op);
    if (op.type === 'insert') this.state = this.state.slice(0, op.pos!) + op.text! + this.state.slice(op.pos!);
    else if (op.type === 'delete') this.state = this.state.slice(0, op.pos!) + this.state.slice((op.pos!) + (op.len ?? 0));
    this.notify(op);
  }

  applyRemote(op: DocOp): boolean {
    if (this.oplog.find(o => o.id === op.id)) return false;
    // Sanity-cap peer-supplied fields. Without this a hostile peer could send
    // {type:'insert', text: <50MB string>} and the receiver's doc state would
    // grow unboundedly; or `len` of 1e9 on delete would freeze the slice. The
    // caps are generous (256k chars per op) — well above any legitimate edit.
    if (op.type === 'insert') {
      if (typeof op.text !== 'string' || op.text.length > 256_000) return false;
    } else if (op.type === 'delete') {
      if (typeof op.len !== 'number' || !Number.isFinite(op.len) || op.len < 0 || op.len > 1_000_000) return false;
    }
    if (typeof op.pos !== 'number' || !Number.isFinite(op.pos) || op.pos < 0) return false;
    this.oplog.push(op);
    for (const k of Object.keys(op.vector)) {
      this.vector[k] = Math.max(this.vector[k] ?? 0, op.vector[k]);
    }
    let pos = op.pos ?? 0;
    for (const existing of this.oplog) {
      if (existing.id === op.id) continue;
      if (!isConcurrent(existing, op)) continue;
      if (existing.type === 'insert' && existing.pos! <= pos) {
        const tie = existing.author < op.author;
        if (existing.pos! < pos || tie) pos += existing.text!.length;
      } else if (existing.type === 'delete' && existing.pos! < pos) {
        pos -= Math.min(existing.len ?? 0, pos - existing.pos!);
      }
    }
    if (op.type === 'insert') this.state = this.state.slice(0, pos) + op.text! + this.state.slice(pos);
    else if (op.type === 'delete') this.state = this.state.slice(0, pos) + this.state.slice(pos + (op.len ?? 0));
    // Cap the oplog so a peer can't flood us into OOM. We keep the latest
    // window for concurrent-op handling; older ops have been incorporated
    // into `state` already, so dropping them only affects future merges of
    // ops with very stale vectors (rare in practice).
    const OPLOG_MAX = 10_000;
    if (this.oplog.length > OPLOG_MAX) this.oplog.splice(0, this.oplog.length - OPLOG_MAX);
    this.notify(op);
    return true;
  }
}

function isConcurrent(a: DocOp, b: DocOp): boolean {
  let aHappensBefore = true;
  let bHappensBefore = true;
  for (const k of Object.keys({ ...a.vector, ...b.vector })) {
    const av = a.vector[k] ?? 0;
    const bv = b.vector[k] ?? 0;
    if (av > bv) bHappensBefore = false;
    if (bv > av) aHappensBefore = false;
  }
  return !aHappensBefore && !bHappensBefore;
}

export interface SignalSender {
  send(payload: string): void;
  onMessage(handler: (payload: string) => void): void;
  close(): void;
}

export class CollabSession {
  readonly self: CollabPeer;
  private peers = new Map<string, CollabPeer>();
  private channels = new Map<string, RTCDataChannel>();
  private connections = new Map<string, RTCPeerConnection>();
  private doc: CrdtDoc;
  private signal?: SignalSender;
  private awarenessListeners: Array<(peers: CollabPeer[]) => void> = [];

  constructor(name: string, color = '#22d3ee') {
    this.self = { id: `u_${Math.random().toString(36).slice(2, 10)}`, name, color };
    this.doc = new CrdtDoc(this.self.id);
  }

  getDoc(): CrdtDoc { return this.doc; }

  attachSignal(signal: SignalSender) {
    this.signal = signal;
    signal.onMessage((raw) => this.onSignalMessage(raw));
  }

  onPeers(fn: (peers: CollabPeer[]) => void): () => void {
    this.awarenessListeners.push(fn);
    return () => { this.awarenessListeners = this.awarenessListeners.filter(l => l !== fn); };
  }

  updateCursor(line: number, col: number) {
    this.self.cursor = { line, col };
    this.broadcast({ type: 'awareness', from: this.self.id, payload: this.self, ts: Date.now() });
  }

  private notifyPeers() {
    const all = [this.self, ...Array.from(this.peers.values())];
    for (const l of this.awarenessListeners) l(all);
  }

  async addPeer(peerId: string, initiator: boolean) {
    if (this.connections.has(peerId)) return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.connections.set(peerId, pc);

    let dc: RTCDataChannel;
    if (initiator) {
      dc = pc.createDataChannel('collab', { ordered: true });
      this.bindChannel(peerId, dc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signal?.send(JSON.stringify({ type: 'offer', to: peerId, from: this.self.id, sdp: offer }));
    } else {
      pc.ondatachannel = (e) => this.bindChannel(peerId, e.channel);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal?.send(JSON.stringify({ type: 'ice', to: peerId, from: this.self.id, candidate: e.candidate }));
    };
  }

  private bindChannel(peerId: string, dc: RTCDataChannel) {
    this.channels.set(peerId, dc);
    dc.onopen = () => {
      const helloPayload = { peer: this.self, vector: this.doc.getVector(), oplog: this.doc.getOpLog(), state: this.doc.getState() };
      dc.send(JSON.stringify({ type: 'hello', from: this.self.id, payload: helloPayload, ts: Date.now() }));
    };
    dc.onmessage = (e) => {
      try { this.handleMessage(JSON.parse(e.data) as CollabMessage); } catch {}
    };
    dc.onclose = () => {
      this.channels.delete(peerId);
      this.connections.delete(peerId);
      this.peers.delete(peerId);
      this.notifyPeers();
    };
  }

  private async onSignalMessage(raw: string) {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.to && msg.to !== this.self.id) return;
    const from = msg.from;
    if (msg.type === 'offer') {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      this.connections.set(from, pc);
      pc.ondatachannel = (e) => this.bindChannel(from, e.channel);
      pc.onicecandidate = (e) => { if (e.candidate) this.signal?.send(JSON.stringify({ type: 'ice', to: from, from: this.self.id, candidate: e.candidate })); };
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signal?.send(JSON.stringify({ type: 'answer', to: from, from: this.self.id, sdp: answer }));
    } else if (msg.type === 'answer') {
      const pc = this.connections.get(from);
      if (pc) await pc.setRemoteDescription(msg.sdp);
    } else if (msg.type === 'ice') {
      const pc = this.connections.get(from);
      if (pc) try { await pc.addIceCandidate(msg.candidate); } catch {}
    } else if (msg.type === 'join' && msg.from !== this.self.id) {
      this.addPeer(msg.from, true);
    }
  }

  private handleMessage(msg: CollabMessage) {
    if (msg.type === 'hello') {
      const p = msg.payload as { peer: CollabPeer; vector: Record<string, number>; oplog: DocOp[]; state: string };
      this.peers.set(p.peer.id, p.peer);
      if (this.doc.getOpLog().length === 0 && p.oplog.length > 0) {
        this.doc.setState(p.state);
        for (const op of p.oplog) this.doc.applyRemote(op);
      } else {
        for (const op of p.oplog) this.doc.applyRemote(op);
      }
      this.notifyPeers();
    } else if (msg.type === 'op') {
      const op = msg.payload as DocOp;
      this.doc.applyRemote(op);
    } else if (msg.type === 'awareness') {
      const peer = msg.payload as CollabPeer;
      this.peers.set(peer.id, peer);
      this.notifyPeers();
    }
  }

  broadcastOp(op: DocOp) {
    this.broadcast({ type: 'op', from: this.self.id, payload: op, ts: Date.now() });
  }

  private broadcast(msg: CollabMessage) {
    const data = JSON.stringify(msg);
    for (const dc of this.channels.values()) {
      if (dc.readyState === 'open') try { dc.send(data); } catch {}
    }
  }

  announce() {
    this.signal?.send(JSON.stringify({ type: 'join', from: this.self.id, name: this.self.name, color: this.self.color }));
  }

  close() {
    for (const dc of this.channels.values()) try { dc.close(); } catch {}
    for (const pc of this.connections.values()) try { pc.close(); } catch {}
    this.signal?.close();
  }
}

export function makeBroadcastChannelSignal(roomId: string): SignalSender {
  if (typeof BroadcastChannel === 'undefined') {
    return { send: () => {}, onMessage: () => {}, close: () => {} };
  }
  const bc = new BroadcastChannel(`xstudios-collab-${roomId}`);
  let handler: ((s: string) => void) | null = null;
  bc.onmessage = (e) => handler?.(e.data);
  return {
    send: (p) => bc.postMessage(p),
    onMessage: (h) => { handler = h; },
    close: () => bc.close(),
  };
}

/**
 * Real CROSS-DEVICE signaling over the same-origin HTTP relay (/api/collab).
 * This is what makes Studio collaboration / watch-party actually work between
 * two different machines — BroadcastChannel only connects tabs in ONE browser
 * on ONE device, so attaching makeBroadcastChannelSignal made the advertised
 * "collaborate with your team over the internet" impossible.
 *
 * The relay forwards ONLY the WebRTC handshake (opaque SDP/ICE/awareness JSON);
 * the document/media/chat never touch it (they go peer-to-peer over the data
 * channels). Transport is HTTP long-poll — no WebSocket server. `peerId` MUST be
 * this client's CollabSession.self.id so the relay can exclude our own messages.
 */
export function makeHttpSignal(roomId: string, peerId: string): SignalSender {
  if (typeof fetch === 'undefined') {
    return { send: () => {}, onMessage: () => {}, close: () => {} };
  }
  const base = `/api/collab/${encodeURIComponent(roomId)}`;
  let handler: ((s: string) => void) | null = null;
  let cursor = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const POLL_MS = 700;

  const poll = async () => {
    if (stopped) return;
    let backoff = POLL_MS;
    try {
      const res = await fetch(`${base}?peer=${encodeURIComponent(peerId)}&after=${cursor}&_=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json() as { messages: { seq: number; data: unknown }[]; cursor: number };
        for (const m of json.messages) {
          // The relay carries the JSON payload; collab expects a string.
          try { handler?.(typeof m.data === 'string' ? m.data : JSON.stringify(m.data)); } catch { /* one bad message must not kill the poll */ }
        }
        if (typeof json.cursor === 'number') cursor = Math.max(cursor, json.cursor);
        backoff = POLL_MS;
      } else {
        backoff = Math.min(backoff * 2, 10_000);
      }
    } catch {
      backoff = Math.min(backoff * 2, 10_000);
    }
    if (!stopped) timer = setTimeout(poll, backoff);
  };
  void poll();

  return {
    send: (payload: string) => {
      // The collab layer hands us a JSON string; forward it as opaque data.
      let data: unknown = payload;
      try { data = JSON.parse(payload); } catch { /* keep as string */ }
      void fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer: peerId, data }),
        cache: 'no-store',
      }).catch(() => { /* transient — next action / poll recovers */ });
    },
    onMessage: (h) => { handler = h; },
    close: () => { stopped = true; if (timer) clearTimeout(timer); },
  };
}

const PEER_COLORS = ['#22d3ee', '#a855f7', '#f59e0b', '#22c55e', '#ec4899', '#3b82f6', '#ef4444', '#84cc16'];
export function pickPeerColor(seed: string): string {
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return PEER_COLORS[n % PEER_COLORS.length];
}
