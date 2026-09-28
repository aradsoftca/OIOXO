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
const CASE_TIMEOUT = 120_000; // video cases may pay a 30 s MT-stall fallback
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
function isPdf(minPages) {
  return (b) => {
    const s = b.toString('latin1');
    if (!s.startsWith('%PDF-')) return 'not PDF (magic ' + b.subarray(0, 5).toString('hex') + ')';
    if (!s.includes('%%EOF')) return 'PDF has no %%EOF';
    // Page objects may sit inside compressed object streams; only judge when visible.
    const pages = (s.match(/\/Type\s*\/Page(?!s)/g) || []).length;
    if (pages && pages < minPages) return `PDF has ${pages} pages, expected >= ${minPages}`;
    return null;
  };
}
function isMp3(b) {
  const h = b.subarray(0, 3).toString('latin1');
  return h === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) ? null : 'not MP3 (magic ' + b.subarray(0, 4).toString('hex') + ')';
}
function isSrt(b) { return /^\s*1\s*\r?\n\d\d:\d\d:\d\d,\d{3} --> /.test(b.toString('utf8')) ? null : 'not SRT (' + JSON.stringify(b.toString('utf8').slice(0, 40)) + ')'; }
function isWebm(b) { return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 ? null : 'not WebM (magic ' + b.subarray(0, 4).toString('hex') + ')'; }
function isVideo(b) { return isWebm(b) === null || b.subarray(4, 8).toString('latin1') === 'ftyp' ? null : 'not MP4/WebM (magic ' + b.subarray(0, 8).toString('hex') + ')'; }
function isAudio(b) {
  const h = b.subarray(0, 12).toString('latin1');
  if (h.startsWith('ID3')) return null; // mp3 with tag
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return null; // mp3 / ADTS aac frame sync
  if (h.slice(4, 8) === 'ftyp') return null; // m4a
  if (h.startsWith('RIFF') && h.slice(8, 12) === 'WAVE') return null;
  if (h.startsWith('OggS') || h.startsWith('fLaC')) return null;
  return 'not audio (magic ' + b.subarray(0, 4).toString('hex') + ')';
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
  // image-compress runs as soon as the file is added — no action button, just Download.
  { name: 'image-compress',  url: '/tools/image-compress',   file: 'test.png',         check: isSmallImage },
  { name: 'audio-volume',    url: '/tools/audio-volume',     file: 'tone.wav',         check: isWav,  click: /^(apply|convert|export|process)/i },
  { name: 'pdf-compress',    url: '/tools/pdf-compress',     file: 'two-page.pdf',     check: isPdf(2), click: /^compress$/i },
  { name: 'pdf-merge',       url: '/tools/pdf-merge',        file: ['two-page.pdf', 'one-page.pdf'], check: isPdf(3), click: /^merge/i },
  { name: 'video-extract-audio', url: '/tools/video-extract-audio', file: 'clip.mp4',  check: isMp3, click: /^extract/i },
  // image-resize renders the result on upload; the runner then presses its Download button.
  // Goes through the ffmpeg worker — broken in prod by the obfuscator's domainLock until 2026-09-27.
  { name: 'wav-to-mp3',      url: '/convert/wav-to-mp3',     file: 'tone.wav',         check: isMp3,  click: /^convert/i },
  // Video encodes hung on the multi-thread ffmpeg core (live sweep 2026-09-27); the engine
  // now falls back to single-thread after 30 s of silence — these must finish.
  { name: 'mp4-to-webm',     url: '/convert/mp4-to-webm',    file: 'clip.mp4',         check: isWebm, click: /^convert/i },
  { name: 'video-compress',  url: '/tools/video-compress',   file: 'clip.mp4',         check: isVideo, click: /^compress/i },
  // AVI is not decodable by Chrome's <video>; VideoDrop used to reject it before ffmpeg ran.
  { name: 'avi-to-mp4',      url: '/convert/avi-to-mp4',     file: 'clip.avi',         check: isVideo, click: /^convert/i },
  // HEIC page added 2026-09-28; the tool must preselect JPEG from the pair.
  { name: 'heic-to-jpg',     url: '/convert/heic-to-jpg',    file: 'example.heic',     check: isJpeg, click: /^convert/i },
  { name: 'image-resize',    url: '/tools/image-resize',     file: 'test.png',         check: isSmallImage },
  // Whisper on transformers v3 (input shape fixed 2026-09-27). A tone has no speech,
  // so the SRT is tiny — the check is that a well-formed cue comes out at all.
  { name: 'subtitle-generate', url: '/tools/subtitle-generate', file: 'tone.wav',     check: isSrt,  click: /^generate/i },
];

async function runCase(browser, c) {
  const page = CTX ? await CTX.newPage() : await browser.newPage({ acceptDownloads: true });
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
    const sample = [].concat(c.file).map((f) => path.join(SAMPLES, f));
    for (const f of sample) if (!fs.existsSync(f)) throw new Error('missing sample ' + f);
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
      // Subtitle downloads are labelled ".srt" / ".vtt" / ".txt".
      const dl = page.locator('button:visible, a:visible', { hasText: /^\s*(download|\.(srt|vtt|txt)\b)/i }).first();
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

// Sign in as the Pro QA account (credentials in QA_ENV_FILE, arad only) so the
// daily free quota can't turn the gate red — an anonymous run after a sweep
// failed 8/15 on "Daily free limit reached". ANON=1 tests the free path.
const QA_ENV_FILE = process.env.QA_ENV_FILE || '/root/cadtest/.qa_pro';
let CTX = null;
function readQa() {
  if (process.env.ANON === '1' || !fs.existsSync(QA_ENV_FILE)) return null;
  const kv = {};
  for (const line of fs.readFileSync(QA_ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*(QA_EMAIL|QA_PASS)\s*=\s*(.*)$/);
    if (m) kv[m[1]] = m[2].trim();
  }
  return kv.QA_EMAIL && kv.QA_PASS ? { email: kv.QA_EMAIL, pass: kv.QA_PASS } : null;
}
async function signIn(browser, qa) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/auth/sign-in', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const form = page.locator('form').filter({ has: page.locator('input[type=password]') }).first();
  await form.locator('input[type=email]').fill(qa.email);
  await form.locator('input[type=password]').fill(qa.pass);
  await form.locator('button[type=submit]').click();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const j = await (await ctx.request.get(BASE + '/api/auth/session')).json().catch(() => ({}));
    if (j?.user?.email === qa.email) { await page.close(); return ctx; }
  }
  throw new Error('QA sign-in failed (session never showed the QA user)');
}

const browser = await chromium.launch({ executablePath: CHROME });
const qa = readQa();
if (qa) { CTX = await signIn(browser, qa); console.log(`signed in as ${qa.email}`); } else console.log('anonymous run');
let failed = 0;
try {
  for (const c of CASES) if (!(await runCase(browser, c))) failed++;
} finally {
  await browser.close();
}
console.log(`${CASES.length - failed}/${CASES.length} passed against ${BASE} (downloads in ${OUT})`);
process.exit(failed ? 1 : 0);
