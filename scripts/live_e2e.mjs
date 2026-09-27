#!/usr/bin/env node
/**
 * Post-deploy live gate: drives real xonvert pages in Chromium (playwright-core),
 * uploads a sample, converts, captures the download and validates its bytes.
 *
 *   node scripts/live_e2e.mjs [baseUrl=https://xonvert.com]
 *   env SAMPLES_DIR   (default /root/cadtest/samples; fill it with scripts/live_e2e_samples.sh)
 *   env CHROMIUM_PATH (default /root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome)
 * In WSL without IPv6 also set NODE_OPTIONS=--dns-result-order=ipv4first.
 * Exit 1 if any case fails.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.argv[2] || 'https://xonvert.com').replace(/\/$/, '');
const SAMPLES = process.env.SAMPLES_DIR || '/root/cadtest/samples';
const CHROME = process.env.CHROMIUM_PATH || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const CASE_TIMEOUT = 60_000;
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'xonvert-e2e-'));

// ---- validators: return null when OK, else a reason string ----
const isJpeg = (b) => (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? null : 'not JPEG (magic ' + b.subarray(0, 4).toString('hex') + ')');
function isGlb(b) {
  if (b.subarray(0, 4).toString('latin1') !== 'glTF') return 'not GLB (magic ' + b.subarray(0, 4).toString('hex') + ')';
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  return (j.meshes || []).length > 0 ? null : 'GLB has no meshes';
}
function isGltf(b) {
  // Multi-file output (.gltf + .bin) arrives as a zip; a single .gltf as JSON.
  if (b[0] === 0x50 && b[1] === 0x4b) {
    const s = b.toString('latin1');
    return /\.gltf/.test(s) && /\.bin/.test(s) ? null : 'zip lacks .gltf/.bin entries';
  }
  try { const j = JSON.parse(b.toString('utf8')); return (j.meshes || []).length > 0 ? null : 'glTF has no meshes'; }
  catch { return 'neither zip nor glTF JSON (magic ' + b.subarray(0, 4).toString('hex') + ')'; }
}
function isStl(b) {
  const s = b.toString('latin1');
  const facets = (s.match(/facet normal/g) || []).length;
  if (facets) return null;
  if (b.length > 84 && b.readUInt32LE(80) > 0 && b.length === 84 + 50 * b.readUInt32LE(80)) return null; // binary STL
  return 'STL has no facets';
}
function isObj(b) {
  const s = b.toString('utf8');
  return /^v /m.test(s) && /^f /m.test(s) ? null : 'OBJ lacks v/f lines';
}
function isDxf(b) {
  const s = b.toString('latin1');
  return s.includes('SECTION') && s.includes('ENTITIES') ? null : 'DXF lacks SECTION/ENTITIES';
}
function isSmallImage(b) {
  const h = b.subarray(0, 12).toString('latin1');
  if (h.startsWith('RIFF') && h.slice(8, 12) === 'WEBP') return null;
  if (b[0] === 0xff && b[1] === 0xd8) return null;
  if (b[0] === 0x89 && h.slice(1, 4) === 'PNG') return null;
  return 'not an image (magic ' + b.subarray(0, 4).toString('hex') + ')';
}
const isWav = (b) => (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE' && b.length > 44 ? null : 'not WAV (magic ' + b.subarray(0, 4).toString('hex') + ')');

// click: optional button-text regex pressed once after upload (the page's own action).
// png-to-jpg deliberately has none: the pair page must preselect JPEG by itself.
const CASES = [
  { name: 'png-to-jpg',      url: '/convert/png-to-jpg',     file: 'test.png',         check: isJpeg },
  { name: 'fbx-to-glb',      url: '/convert/fbx-to-glb',     file: 'box.fbx',          check: isGlb,  click: /^convert to/i },
  { name: 'obj-to-gltf',     url: '/convert/obj-to-gltf',    file: 'box.obj',          check: isGltf, click: /^convert to/i },
  { name: 'step-to-stl',     url: '/convert/step-to-stl',    file: 'as1-oc-214.step',  check: isStl,  click: /^convert to/i },
  { name: 'step-to-obj',     url: '/convert/step-to-obj',    file: 'as1-oc-214.step',  check: isObj,  click: /^convert to/i },
  { name: 'dwg-to-dxf',      url: '/convert/dwg-to-dxf',     file: 'example_2000.dwg', check: isDxf,  click: /^(convert to|dwg\s*dxf)/i },
  { name: 'image-compress',  url: '/tools/image-compress',   file: 'test.png',         check: isSmallImage, click: /^compress/i },
  { name: 'audio-volume',    url: '/tools/audio-volume',     file: 'tone.wav',         check: isWav,  click: /^(apply|convert|export|process)/i },
];

async function runCase(browser, c) {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.message || String(e))));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  let download = null;
  page.on('download', (d) => { download = d; });
  const deadline = Date.now() + CASE_TIMEOUT;
  const left = () => Math.max(1000, deadline - Date.now());
  const firstErr = () => (errors[0] ? ' | ' + errors[0].replace(/\s+/g, ' ').slice(0, 240) : '');
  try {
    const sample = path.join(SAMPLES, c.file);
    if (!fs.existsSync(sample)) throw new Error('missing sample ' + sample);
    await page.goto(BASE + c.url, { waitUntil: 'networkidle', timeout: left() });
    await page.locator('input[type=file]').first().setInputFiles(sample, { timeout: left() });
    await page.waitForTimeout(1500);
    if (c.click) {
      const btns = page.locator('button:visible');
      const texts = (await btns.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
      const i = texts.findIndex((t) => c.click.test(t));
      if (i < 0) throw new Error(`no button matching ${c.click} (saw ${JSON.stringify(texts.filter((t) => t && t.length < 40))})`);
      await btns.nth(i).click({ timeout: left() });
    }
    while (!download && Date.now() < deadline) {
      const red = (await page.locator('.text-red-600:visible').allInnerTexts().catch(() => [])).filter(Boolean);
      if (red.length) throw new Error('page error: ' + red[0].slice(0, 200));
      const dl = page.locator('button:visible, a:visible', { hasText: /^\s*download/i }).first();
      if (await dl.count()) { await dl.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1500); }
      else await page.waitForTimeout(500);
    }
    if (!download) throw new Error('no download within ' + CASE_TIMEOUT / 1000 + 's');
    const file = path.join(OUT, c.name + '-' + download.suggestedFilename());
    await download.saveAs(file);
    const bytes = fs.readFileSync(file);
    const bad = c.check(bytes);
    if (bad) throw new Error(`${bad} [${download.suggestedFilename()}, ${bytes.length} B]`);
    console.log(`ok  ${c.name} ${bytes.length}`);
    return true;
  } catch (e) {
    console.log(`FAIL ${c.name} ${String(e.message || e).split('\n')[0]}${firstErr()}`);
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

const browser = await chromium.launch({ executablePath: CHROME });
let failed = 0;
try {
  for (const c of CASES) if (!(await runCase(browser, c))) failed++;
} finally {
  await browser.close();
}
console.log(`${CASES.length - failed}/${CASES.length} passed against ${BASE} (downloads in ${OUT})`);
process.exit(failed ? 1 : 0);
