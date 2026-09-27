#!/usr/bin/env node
/**
 * Copy OpenCV.js from node_modules to public/vendor/opencv.js so it is served
 * same-origin (works under our COEP/COOP isolation). engines/opencv loads it
 * for the document scanner and object remover — it used to 404 because nothing
 * produced this file (found by the live sweep, 2026-09-27).
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js');
const DST = path.join(ROOT, 'public', 'vendor', 'opencv.js');

try {
  await stat(SRC);
} catch {
  console.error(`[copy-opencv] MISSING ${SRC} — run npm ci`);
  process.exit(1);
}
await mkdir(path.dirname(DST), { recursive: true });
await copyFile(SRC, DST);
const { size } = await stat(DST);
console.log(`[copy-opencv] public/vendor/opencv.js (${(size / 1048576).toFixed(1)} MB)`);
