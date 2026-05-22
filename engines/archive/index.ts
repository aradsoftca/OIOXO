/**
 * Archive engine — extract zip/7z/rar/tar/gz/bz2/xz/iso/cab and friends in the
 * browser via libarchive.js (WASM in a worker), and create zip via fflate.
 * No server, no GPU. Worker + wasm are served from /public/libarchive/.
 */

export interface ArchiveEntry {
  path: string;   // folder prefix, e.g. "src/"
  name: string;
  size: number;
  /** Lazily extract just this entry to a File. */
  extract: () => Promise<File>;
}

interface CompressedFile { name: string; size: number; extract: () => Promise<File> }
interface ArchiveHandle {
  getFilesArray: () => Promise<{ file: CompressedFile; path: string }[]>;
  hasEncryptedData: () => Promise<boolean | null>;
  usePassword: (pw: string) => Promise<void>;
  close: () => Promise<void>;
}

let inited = false;
async function lib() {
  const mod = await import('libarchive.js');
  const Archive = (mod as unknown as { Archive: { init: (o: unknown) => void; open: (f: File) => Promise<ArchiveHandle> } }).Archive;
  if (!inited) {
    Archive.init({ workerUrl: '/libarchive/worker-bundle.js' });
    inited = true;
  }
  return Archive;
}

export async function openArchive(file: File): Promise<ArchiveHandle> {
  const Archive = await lib();
  return Archive.open(file);
}

/** List entries (fast — does not decompress file bodies). Keeps the archive open. */
export async function listArchive(archive: ArchiveHandle): Promise<ArchiveEntry[]> {
  const arr = await archive.getFilesArray();
  return arr.map(({ file, path }) => ({
    path: path || '',
    name: file.name,
    size: file.size ?? 0,
    extract: () => file.extract(),
  }));
}

/** Bundle a set of in-memory files into a single ZIP via fflate. Uses the
 *  async API, which compresses in fflate's own worker thread — so a large
 *  bundle doesn't block the main thread the way the old zipSync did. */
export async function zipFiles(files: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const { zip } = await import('fflate');
  const tree: Record<string, Uint8Array> = {};
  for (const f of files) tree[f.name] = f.data;
  const packed = await new Promise<Uint8Array>((resolve, reject) => {
    zip(tree, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
  return new Blob([packed as unknown as BlobPart], { type: 'application/zip' });
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
