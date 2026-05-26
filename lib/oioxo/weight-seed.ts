/**
 * oioxo Compute Mesh — PEER WEIGHT SEEDING (stage 5). The onboarding magic: a new
 * device shouldn't re-download the model from the internet when a sibling on the same
 * Wi-Fi already has it cached. The device with the model advertises the `weights` role
 * (capability.ts); a new device fetches the files FROM ITS SIBLINGS, in parallel across
 * however many seeders are present — aggregate LAN bandwidth, works offline, costs us
 * zero.
 *
 * This is the pure, transport-agnostic core: split a model manifest into chunks and
 * schedule them across multiple seeders, tolerating a seeder that drops mid-transfer
 * (its in-flight chunks return to the pool for someone else). The actual byte movement
 * (WebRTC binary via peer.sendBinary, or LAN HTTP range requests) is the injected
 * layer on top. Pure + Node-testable.
 */

/** One file in the model (transformers.js layout: config, tokenizer, .onnx weights…). */
export interface WeightFile {
  path: string;
  size: number;
  /** Content hash for integrity verification after assembly. */
  hash: string;
}

export type WeightManifest = WeightFile[];

export interface Chunk {
  /** Stable id `${path}#${offset}`. */
  id: string;
  path: string;
  offset: number;
  len: number;
}

export const DEFAULT_CHUNK = 4 * 1024 * 1024; // 4 MiB

/** Split a manifest into transfer chunks (last chunk per file carries the remainder). */
export function planChunks(manifest: WeightManifest, chunkSize: number = DEFAULT_CHUNK): Chunk[] {
  const out: Chunk[] = [];
  for (const f of manifest) {
    if (f.size === 0) { out.push({ id: `${f.path}#0`, path: f.path, offset: 0, len: 0 }); continue; }
    for (let off = 0; off < f.size; off += chunkSize) {
      const len = Math.min(chunkSize, f.size - off);
      out.push({ id: `${f.path}#${off}`, path: f.path, offset: off, len });
    }
  }
  return out;
}

interface Assignment { chunk: Chunk; sourceId: string; at: number }

export interface Progress {
  doneChunks: number;
  totalChunks: number;
  bytesDone: number;
  bytesTotal: number;
  /** 0..1. */
  fraction: number;
}

/**
 * Multi-source, churn-tolerant chunk scheduler. Hand it the planned chunks; ask `next`
 * for work to give a particular seeder; report `complete` when a chunk arrives and
 * verifies; `fail` a seeder that drops (its outstanding chunks go back to the pool).
 * `reclaim` returns chunks that have been in-flight too long (a stalled seeder).
 */
export class ChunkScheduler {
  private readonly pool: Chunk[];                  // unassigned, waiting
  private readonly inflight = new Map<string, Assignment>(); // chunkId → assignment
  private readonly done = new Set<string>();       // chunkId
  private readonly byId = new Map<string, Chunk>();
  private readonly bytesTotal: number;
  private readonly now: () => number;

  constructor(chunks: Chunk[], opts: { now?: () => number } = {}) {
    this.pool = [...chunks];
    for (const c of chunks) this.byId.set(c.id, c);
    this.bytesTotal = chunks.reduce((n, c) => n + c.len, 0);
    this.now = opts.now ?? Date.now;
  }

  /** Hand up to `max` waiting chunks to `sourceId` (marks them in-flight to it). */
  next(sourceId: string, max = 1): Chunk[] {
    const take: Chunk[] = [];
    while (take.length < max && this.pool.length) {
      const c = this.pool.shift()!;
      this.inflight.set(c.id, { chunk: c, sourceId, at: this.now() });
      take.push(c);
    }
    return take;
  }

  /** A chunk arrived + verified. Idempotent. */
  complete(chunkId: string): void {
    if (this.done.has(chunkId)) return;
    this.inflight.delete(chunkId);
    if (this.byId.has(chunkId)) this.done.add(chunkId);
  }

  /** A seeder dropped — return all its in-flight (not-yet-done) chunks to the pool. */
  fail(sourceId: string): void {
    for (const [id, a] of [...this.inflight]) {
      if (a.sourceId === sourceId) { this.inflight.delete(id); this.pool.push(a.chunk); }
    }
  }

  /** Return chunks in-flight longer than `maxAgeMs` to the pool (a stalled seeder). */
  reclaim(maxAgeMs: number): Chunk[] {
    const t = this.now();
    const reclaimed: Chunk[] = [];
    for (const [id, a] of [...this.inflight]) {
      if (t - a.at > maxAgeMs) { this.inflight.delete(id); this.pool.push(a.chunk); reclaimed.push(a.chunk); }
    }
    return reclaimed;
  }

  isComplete(): boolean {
    return this.done.size === this.byId.size;
  }

  /** Chunks neither done nor in-flight (work still available to hand out). */
  remaining(): number {
    return this.pool.length;
  }

  progress(): Progress {
    let bytesDone = 0;
    for (const id of this.done) bytesDone += this.byId.get(id)!.len;
    const totalChunks = this.byId.size;
    return {
      doneChunks: this.done.size,
      totalChunks,
      bytesDone,
      bytesTotal: this.bytesTotal,
      fraction: this.bytesTotal === 0 ? (this.isComplete() ? 1 : 0) : bytesDone / this.bytesTotal,
    };
  }
}

/** Verify an assembled file against its manifest hash (hashing injected). */
export async function verifyFile(
  file: WeightFile,
  bytes: { byteLength: number },
  hash: (f: WeightFile) => Promise<string> | string,
): Promise<boolean> {
  if (bytes.byteLength !== file.size) return false;
  return (await hash(file)) === file.hash;
}
