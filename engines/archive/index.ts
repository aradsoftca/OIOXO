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

/**
 * Strip path-traversal segments + absolute-path roots from an archive entry's
 * declared location. A malicious source archive can otherwise carry entries
 * like `../../etc/passwd` which we'd faithfully re-pack into our output ZIP —
 * and the user's downstream extractor would then write outside the intended
 * folder (zip-slip). We collapse `..` / `.` segments, drop leading `/` or
 * `C:\`, and replace `\` with `/`.
 */
function safeArchivePath(raw: string): string {
  if (!raw) return '';
  // Normalise separators and drop any Windows drive letter or UNC root.
  let p = raw.replace(/\\/g, '/').replace(/^[a-zA-Z]:\/+/, '').replace(/^\/+/, '');
  // Resolve `.` / `..` segments without ever climbing above the root.
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (parts.length) parts.pop(); continue; }
    parts.push(seg);
  }
  p = parts.join('/');
  // Preserve the "folder prefix" semantic of the original `path` field.
  return p ? p + '/' : '';
}

function safeEntryName(raw: string): string {
  // Drop any embedded path separators — the folder structure lives in `path`,
  // and a malicious archive could otherwise smuggle `../` past the path
  // sanitiser by sticking it into the name field.
  return raw.replace(/[\\/]/g, '_') || 'unnamed';
}

/** List entries (fast — does not decompress file bodies). Keeps the archive open. */
export async function listArchive(archive: ArchiveHandle): Promise<ArchiveEntry[]> {
  const arr = await archive.getFilesArray();
  return arr.map(({ file, path }) => ({
    path: safeArchivePath(path || ''),
    name: safeEntryName(file.name),
    size: file.size ?? 0,
    extract: () => file.extract(),
  }));
}

/** Bundle a set of in-memory files into a single ZIP via fflate. Uses the
 *  async API, which compresses in fflate's own worker thread — so a large
 *  bundle doesn't block the main thread the way the old zipSync did.
 *  Names are sanitised against path traversal as a final guard — listArchive
 *  already cleans names it produces, but a direct caller passing tainted
 *  names should not be able to ship a zip-slip-laden bundle. */
export async function zipFiles(files: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const { zip } = await import('fflate');
  const tree: Record<string, Uint8Array> = {};
  const seen = new Set<string>();
  for (const f of files) {
    // Strip absolute roots and `..` segments. Empty / fully traversal-only
    // names collapse to a placeholder so we never silently drop a file.
    let name = f.name.replace(/\\/g, '/').replace(/^[a-zA-Z]:\/+/, '').replace(/^\/+/, '');
    const parts: string[] = [];
    for (const seg of name.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') { if (parts.length) parts.pop(); continue; }
      parts.push(seg);
    }
    name = parts.join('/') || 'unnamed';
    // De-dupe in case sanitisation collided two entries onto the same path.
    let unique = name;
    let n = 1;
    while (seen.has(unique)) {
      const dot = name.lastIndexOf('.');
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      unique = `${base}-${n}${ext}`;
      n++;
    }
    seen.add(unique);
    tree[unique] = f.data;
  }
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
