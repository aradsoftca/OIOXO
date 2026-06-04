export type CrdtPath = (string | number)[];

export interface ObjectOp {
  id: string;
  path: CrdtPath;
  kind: 'set' | 'delete';
  value?: any;
  author: string;
  vector: Record<string, number>;
  ts: number;
}

function pathKey(path: CrdtPath): string {
  return path.map(p => typeof p === 'number' ? `[${p}]` : `/${p}`).join('');
}

function getAt(obj: any, path: CrdtPath): any {
  let cur = obj;
  for (const p of path) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setAt(obj: any, path: CrdtPath, value: any): any {
  if (!path.length) return value;
  const head = path[0];
  const rest = path.slice(1);
  if (Array.isArray(obj)) {
    const next = [...obj];
    const idx = typeof head === 'number' ? head : parseInt(String(head), 10);
    next[idx] = rest.length ? setAt(next[idx] ?? {}, rest, value) : value;
    return next;
  }
  const base = (obj && typeof obj === 'object') ? obj : {};
  return { ...base, [head]: rest.length ? setAt(base[head] ?? {}, rest, value) : value };
}

function deleteAt(obj: any, path: CrdtPath): any {
  if (!path.length) return undefined;
  const head = path[0];
  const rest = path.slice(1);
  if (Array.isArray(obj)) {
    const next = [...obj];
    const idx = typeof head === 'number' ? head : parseInt(String(head), 10);
    if (rest.length) next[idx] = deleteAt(next[idx], rest);
    else next.splice(idx, 1);
    return next;
  }
  if (!obj || typeof obj !== 'object') return obj;
  if (rest.length) return { ...obj, [head]: deleteAt(obj[head], rest) };
  const { [head]: _drop, ...remaining } = obj;
  return remaining;
}

export class ObjectCrdt {
  private state: any;
  private vector: Record<string, number> = {};
  private opLog: ObjectOp[] = [];
  private lastAcceptedTs = new Map<string, number>();
  private listeners: Array<(state: any, op?: ObjectOp) => void> = [];

  constructor(private localId: string, initialState: any = {}) {
    this.state = initialState;
    this.vector[localId] = 0;
  }

  getState(): any { return this.state; }
  setState(s: any): void {
    this.state = s;
    this.lastAcceptedTs.clear();
    this.opLog = [];
    this.notify();
  }

  onChange(fn: (state: any, op?: ObjectOp) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify(op?: ObjectOp) {
    for (const l of this.listeners) l(this.state, op);
  }

  private nextVector(): Record<string, number> {
    this.vector[this.localId] = (this.vector[this.localId] ?? 0) + 1;
    return { ...this.vector };
  }

  set(path: CrdtPath, value: any): ObjectOp {
    const op: ObjectOp = {
      id: `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      path, kind: 'set', value,
      author: this.localId, ts: Date.now(),
      vector: this.nextVector(),
    };
    this.applyLocal(op);
    return op;
  }

  delete(path: CrdtPath): ObjectOp {
    const op: ObjectOp = {
      id: `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      path, kind: 'delete',
      author: this.localId, ts: Date.now(),
      vector: this.nextVector(),
    };
    this.applyLocal(op);
    return op;
  }

  private applyLocal(op: ObjectOp) {
    this.opLog.push(op);
    this.state = op.kind === 'set' ? setAt(this.state, op.path, op.value) : deleteAt(this.state, op.path);
    this.lastAcceptedTs.set(pathKey(op.path), op.ts);
    this.notify(op);
  }

  applyRemote(op: ObjectOp): boolean {
    if (this.opLog.find(o => o.id === op.id)) return false;
    // Sanity-cap peer-supplied fields. Without this a hostile peer could
    // send a 100k-deep path (stack overflow in setAt/deleteAt recursion) or
    // a 50MB value (memory blowup). Depth 64 covers any legitimate nested
    // doc; value cap matches the collab text-op cap.
    if (!Array.isArray(op.path) || op.path.length > 64) return false;
    if (op.kind === 'set') {
      try {
        const s = JSON.stringify(op.value ?? null);
        if (s.length > 256_000) return false;
      } catch { return false; } // circular / non-serializable
    }
    const key = pathKey(op.path);
    const lastTs = this.lastAcceptedTs.get(key) ?? 0;
    if (op.ts < lastTs) {
      this.opLog.push(op);
      for (const k of Object.keys(op.vector)) this.vector[k] = Math.max(this.vector[k] ?? 0, op.vector[k]);
      return false;
    }
    if (op.ts === lastTs && op.author < this.localId) {
      this.opLog.push(op);
      return false;
    }
    this.opLog.push(op);
    for (const k of Object.keys(op.vector)) this.vector[k] = Math.max(this.vector[k] ?? 0, op.vector[k]);
    this.state = op.kind === 'set' ? setAt(this.state, op.path, op.value) : deleteAt(this.state, op.path);
    this.lastAcceptedTs.set(key, op.ts);
    // Cap the oplog so a flood of ops can't OOM the receiver. See collab.ts
    // for the same fix on the text CRDT.
    if (this.opLog.length > 10_000) this.opLog.splice(0, this.opLog.length - 10_000);
    this.notify(op);
    return true;
  }

  getOpLog(): ObjectOp[] { return [...this.opLog]; }
  getVector(): Record<string, number> { return { ...this.vector }; }
}
