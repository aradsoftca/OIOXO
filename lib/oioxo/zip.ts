/**
 * oioxo Agentic IDE — export a Temp project as a .zip the user can download (one
 * way to "take it with you" alongside the GitHub/native backends). Pure browser:
 * fflate zips in-tab, no server. Dynamically imported so it only loads on use.
 */
import type { CodeFile } from './codeloop';

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');

/** Zip the project files and trigger a download. */
export async function downloadFilesZip(files: CodeFile[], name = 'oioxo-project.zip'): Promise<void> {
  const { zipSync, strToU8 } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[norm(f.path)] = strToU8(f.content);
  const bytes = zipSync(entries, { level: 6 });
  // copy into a fresh, exactly-sized ArrayBuffer-backed view for Blob typing
  const buf = new Uint8Array(bytes.length);
  buf.set(bytes);
  const blob = new Blob([buf], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke — mobile Safari/Firefox can abort the download if the blob
  // URL is torn down before the stream starts. 60s is plenty for any zip
  // size; the URL is GC'd at tab close anyway.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
