/**
 * Self-host the online IDE's editor assets so NOTHING loads from a third-party CDN
 * (fixes the "editor never appears" failure on strict-CSP/offline/slow networks and
 * keeps oioxo's host-nothing promise):
 *   - `monaco-editor/min/vs`      → `public/monaco/vs`       (the editor + workers)
 *   - `typescript/lib/lib*.d.ts`  → `public/monaco/ts-libs`  (the TYPE oracle libs,
 *     so in-browser diagnostics work without fetching lib.d.ts from a CDN)
 * Runs on predev/prebuild; skips when the target already matches the installed
 * monaco+typescript versions.
 */
import { cp, mkdir, readFile, writeFile, access, readdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const monacoVersion = require('monaco-editor/package.json').version;
const tsVersion = require('typescript/package.json').version;
const want = `monaco ${monacoVersion} + ts ${tsVersion}`;

const vsSrc = path.join(root, 'node_modules', 'monaco-editor', 'min', 'vs');
const tsLibSrc = path.join(root, 'node_modules', 'typescript', 'lib');
const destDir = path.join(root, 'public', 'monaco');
const vsDest = path.join(destDir, 'vs');
const tsLibDest = path.join(destDir, 'ts-libs');
const stamp = path.join(destDir, '.version');

async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function main() {
  if (!(await exists(vsSrc))) {
    console.warn('[copy-monaco] monaco-editor/min/vs not found — is monaco-editor installed?');
    return;
  }
  const current = (await exists(stamp)) ? (await readFile(stamp, 'utf8')).trim() : '';
  if (current === want && (await exists(path.join(vsDest, 'loader.js'))) && (await exists(tsLibDest))) {
    console.log(`[copy-monaco] up to date (${want})`);
    return;
  }
  await mkdir(destDir, { recursive: true });
  // 1) Monaco editor + workers
  await cp(vsSrc, vsDest, { recursive: true });
  // 2) TypeScript standard libs (only the lib*.d.ts the type oracle needs)
  await mkdir(tsLibDest, { recursive: true });
  let libCount = 0;
  for (const name of await readdir(tsLibSrc)) {
    if (/^lib\..*\.d\.ts$/.test(name) || name === 'lib.d.ts') {
      await copyFile(path.join(tsLibSrc, name), path.join(tsLibDest, name));
      libCount++;
    }
  }
  await writeFile(stamp, want);
  console.log(`[copy-monaco] copied Monaco ${monacoVersion} → public/monaco/vs and ${libCount} TS libs → public/monaco/ts-libs`);
}

main().catch((e) => { console.error('[copy-monaco] failed:', e); process.exitCode = 1; });
