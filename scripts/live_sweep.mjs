#!/usr/bin/env node
/**
 * Live breakage sweep: visits EVERY /tools/<id> page (from sitemap.xml) and every indexable
 * /convert/<pair> page, records load health, and where a sample fits the tool's `accepts`
 * uploads it, presses the obvious action button and validates the download.
 *
 *   node scripts/live_sweep.mjs [baseUrl=https://xonvert.com]
 *   env SAMPLES_DIR   (default /root/cadtest/samples; scripts/live_e2e_samples.sh fills it, plus test.jpg)
 *   env CHROMIUM_PATH (default /root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome)
 *   env REPO          (default: this script's repo) - read for tools/<id>/manifest.ts `accepts`
 *   env OUT_JSON      (default /root/cadtest/sweep.json)
 *   env ONLY          (optional regex over the path, e.g. "^/tools/image-")
 *   env CONCURRENCY   (default 3)
 * In WSL without IPv6 also set NODE_OPTIONS=--dns-result-order=ipv4first.
 * Status per page: OK | LOAD-ERROR | NO-UI | UPLOAD-FAIL | UPLOAD-OK | SKIPPED (+ reason).
 * Exit 1 when any page is LOAD-ERROR, NO-UI or UPLOAD-FAIL.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'https://xonvert.com').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const SAMPLES = process.env.SAMPLES_DIR || '/root/cadtest/samples';
const CHROME = process.env.CHROMIUM_PATH || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const REPO = process.env.REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = process.env.OUT_JSON || '/root/cadtest/sweep.json';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const UI_TIMEOUT = 15_000;
const DL_TIMEOUT = 45_000;
const DL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'xonvert-sweep-'));

// Samples in preference order: first one the tool accepts wins.
const SAMPLE_TYPES = [
  { file: 'test.png',         mime: 'image/png',       exts: ['png'] },
  { file: 'test.jpg',         mime: 'image/jpeg',      exts: ['jpg', 'jpeg'] },
  { file: 'two-page.pdf',     mime: 'application/pdf', exts: ['pdf'] },
  { file: 'tone.wav',         mime: 'audio/wav',       exts: ['wav'], alt: ['audio/x-wav'] },
  { file: 'clip.mp4',         mime: 'video/mp4',       exts: ['mp4'] },
  { file: 'box.obj',          mime: 'model/obj',       exts: ['obj'] },
  { file: 'box.fbx',          mime: 'model/fbx',       exts: ['fbx'] },
  { file: 'as1-oc-214.step',  mime: 'model/step',      exts: ['step', 'stp'] },
  { file: 'example_2000.dwg', mime: 'image/vnd.dwg',   exts: ['dwg'] },
].filter((s) => fs.existsSync(path.join(SAMPLES, s.file)));

const ACTION_RE = /^(convert|compress|apply|extract|merge|export|process|download|save|generate|render|resize|crop|rotate|split|encode|run|start|create|make|optimi[sz]e|remove|flip|trim|cut|join|combine|enhance|upscale|blur|sharpen|protect|unlock|sign|watermark|reverse|normalize|mix|denoise)/i;
// Never press anything that starts an account, a purchase or a share.
const NOT_ACTION_RE = /change file|replace|add more|clear|reset|remove file|pin|search|upgrade|sign in|sign up|log in|register|subscribe|buy|checkout|pay|pro\b|share|invite|cancel|back/i;
const HW_RE = /\b(camera|webcam|microphone|record (your|from)|mic\b|screen record)/i;

// Studios intentionally disabled on this brand (they 307 to /tools); stale CDN sitemaps still list them.
const DISABLED = new Set((() => { try { return JSON.parse(fs.readFileSync(path.join(REPO, 'lib/studios/disabled-ids.json'), 'utf8')).ids || []; } catch { return []; } })());

// ---------- manifests ----------
function readAccepts(id) {
  const f = path.join(REPO, 'tools', id, 'manifest.ts');
  if (!fs.existsSync(f)) return null;
  const s = fs.readFileSync(f, 'utf8');
  const m = s.match(/accepts:\s*\[([^\]]*)\]/);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => (x[1] || x[2]).toLowerCase());
}
function acceptsSample(accepts, s) {
  return accepts.some((a) => {
    if (a.startsWith('.')) return s.exts.includes(a.slice(1));
    if (a.endsWith('/*')) return s.mime.startsWith(a.slice(0, -1));
    return a === s.mime || (s.alt || []).includes(a) || s.exts.some((e) => a.endsWith('/' + e));
  });
}
function pickSample(url, accepts) {
  const pair = url.match(/^\/convert\/([a-z0-9]+)-to-([a-z0-9]+)$/);
  if (pair) return SAMPLE_TYPES.find((s) => s.exts.includes(pair[1])) || null;
  if (!accepts || !accepts.length) return null;
  return SAMPLE_TYPES.find((s) => acceptsSample(accepts, s)) || null;
}

// ---------- output validation ----------
function magicKind(b) {
  if (!b.length) return null;
  const h = b.subarray(0, 16).toString('latin1');
  const hex = b.subarray(0, 4).toString('hex');
  if (h.startsWith('%PDF-')) return 'pdf';
  if (hex.startsWith('89504e47')) return 'png';
  if (hex.startsWith('ffd8ff')) return 'jpeg';
  if (h.startsWith('RIFF')) return 'riff:' + h.slice(8, 12).trim();
  if (h.startsWith('GIF8')) return 'gif';
  if (h.startsWith('glTF')) return 'glb';
  if (h.slice(4, 8) === 'ftyp') return 'isobmff:' + h.slice(8, 12);
  if (hex === '1a45dfa3') return 'webm/mkv';
  if (h.startsWith('OggS')) return 'ogg';
  if (h.startsWith('fLaC')) return 'flac';
  if (h.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3/aac';
  if (hex === '504b0304') return 'zip';
  if (h.startsWith('BM')) return 'bmp';
  if (hex === '00000100') return 'ico';
  if (h.startsWith('wOF2') || h.startsWith('wOFF') || hex === '00010000' || h.startsWith('OTTO')) return 'font';
  if (h.startsWith('II*') || h.startsWith('MM')) return 'tiff';
  // text-ish outputs (svg, json, csv, srt, dxf, obj, stl, txt)
  const head = b.subarray(0, 512);
  let bin = 0;
  for (const c of head) if (c === 0 || (c < 9)) bin++;
  if (bin === 0) return 'text';
  return null;
}

// ---------- page run ----------
async function runPage(browser, url) {
  const rec = { url, status: 'OK', reasons: [], pageErrors: [], consoleErrors: [], http: [], red: [], ui: false, sample: null, output: null, ms: 0 };
  const t0 = Date.now();
  const sid = (url.match(/^\/tools\/([^/?#]+)/) || [])[1];
  if (sid && DISABLED.has(sid)) { rec.status = 'SKIPPED'; rec.reasons.push('disabled studio (lib/studios/disabled-ids.json)'); return rec; }
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      const orig = md.getUserMedia.bind(md);
      md.getUserMedia = (...a) => { window.__wantsMedia = true; return orig(...a); };
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => rec.pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') rec.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('response', (r) => {
    try { if (r.status() >= 400 && new URL(r.url()).origin === ORIGIN) rec.http.push(`${r.status()} ${r.url().replace(ORIGIN, '')}`); } catch {}
  });
  let download = null;
  page.on('download', (d) => { download = d; });
  try {
    const resp = await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!resp || resp.status() >= 400) { rec.status = 'LOAD-ERROR'; rec.reasons.push('document HTTP ' + (resp ? resp.status() : 'none')); return rec; }
    // UI rendered? file input, textarea, canvas/video, or an enabled button in <main>.
    const uiSel = 'input[type=file], main textarea, main input[type=text], main canvas, main video, main button, main [contenteditable=true]';
    rec.ui = await page.waitForSelector(uiSel, { state: 'attached', timeout: UI_TIMEOUT }).then(() => true).catch(() => false);
    await page.waitForTimeout(1500);
    rec.red = (await page.locator('.text-red-600:visible, [role=alert]:visible').allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean).slice(0, 3);
    if (!rec.ui) { rec.status = 'NO-UI'; rec.reasons.push('no file input / main UI within 15s'); return rec; }

    const id = (url.match(/^\/tools\/([^/?#]+)/) || [])[1];
    const accepts = id ? readAccepts(id) : null;
    const hasFileInput = (await page.locator('input[type=file]').count()) > 0;
    const text = (await page.locator('main').innerText().catch(() => '')).slice(0, 4000);
    const sample = pickSample(url, accepts);
    if (!hasFileInput || !sample) {
      rec.status = 'SKIPPED';
      rec.reasons.push(!hasFileInput ? (HW_RE.test(text) ? 'needs camera/mic' : 'no file input (text/interactive tool)') : `no sample for accepts=${JSON.stringify(accepts)}`);
      return finish(rec);
    }
    rec.sample = sample.file;
    const multiple = await page.locator('input[type=file]').first().getAttribute('multiple');
    const files = [path.join(SAMPLES, sample.file)];
    if (multiple !== null && sample.file.endsWith('.pdf') && fs.existsSync(path.join(SAMPLES, 'one-page.pdf'))) files.push(path.join(SAMPLES, 'one-page.pdf'));
    await page.locator('input[type=file]').first().setInputFiles(files);
    await page.waitForTimeout(2000);

    const clicked = new Set();
    const deadline = Date.now() + DL_TIMEOUT;
    while (!download && Date.now() < deadline) {
      const btns = page.locator('button:visible, a[download]:visible, a:visible:has-text("Download")');
      const n = await btns.count();
      let acted = false;
      const dlFirst = page.locator('button:visible, a:visible', { hasText: /^\s*download/i }).first();
      if (await dlFirst.count() && !(await dlFirst.isDisabled().catch(() => true))) {
        clicked.add('Download'); await dlFirst.click({ timeout: 3000 }).catch(() => {}); acted = true;
      }
      for (let i = 0; i < n && !acted; i++) {
        const b = btns.nth(i);
        const t = (await b.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (!t || t.length > 40 || !ACTION_RE.test(t) || (NOT_ACTION_RE.test(t) && !/^download/i.test(t))) continue;
        if (await b.isDisabled().catch(() => true)) continue;
        const isDl = /^download/i.test(t);
        if (!isDl && clicked.has(t)) continue; // press each action once; re-press Download
        clicked.add(t);
        await b.click({ timeout: 3000 }).catch(() => {});
        acted = true;
      }
      await page.waitForTimeout(acted ? 1500 : 750);
      // The daily free-export quota is enforced per visitor server-side; a fresh context does not reset it.
      if (await page.getByText(/free limit reached/i).first().isVisible().catch(() => false)) { rec.quota = true; break; }
      const red = (await page.locator('.text-red-600:visible, [role=alert]:visible').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
      if (red.length && !download) { rec.red = red.slice(0, 3); break; }
    }
    rec.clicked = [...clicked];
    if (!download && rec.quota) { rec.status = 'SKIPPED'; rec.reasons.push('daily free-export limit reached (quota modal) - output not testable today'); return finish(rec); }
    if (!download) {
      const wantsMedia = await page.evaluate(() => !!window.__wantsMedia).catch(() => false);
      if (wantsMedia || (!clicked.size && HW_RE.test(text))) { rec.status = 'SKIPPED'; rec.reasons.push('needs camera/mic'); return finish(rec); }
      if (!clicked.size) { rec.status = 'SKIPPED'; rec.reasons.push('uploaded, but no recognisable action/download button'); return finish(rec); }
      rec.status = 'UPLOAD-FAIL';
      rec.reasons.push(rec.red.length ? 'error shown: ' + rec.red[0].slice(0, 160) : `no download within ${DL_TIMEOUT / 1000}s`);
      return finish(rec);
    }
    const out = path.join(DL_DIR, url.replace(/\W+/g, '_') + '-' + download.suggestedFilename());
    await download.saveAs(out);
    const b = fs.readFileSync(out);
    const kind = magicKind(b);
    rec.output = { name: download.suggestedFilename(), bytes: b.length, magic: b.subarray(0, 8).toString('hex'), kind };
    if (!b.length) { rec.status = 'UPLOAD-FAIL'; rec.reasons.push('empty download'); }
    else if (!kind) { rec.status = 'UPLOAD-FAIL'; rec.reasons.push('unrecognised output magic ' + rec.output.magic); }
    else rec.status = 'UPLOAD-OK';
    return finish(rec);
  } catch (e) {
    rec.status = 'LOAD-ERROR';
    rec.reasons.push(String(e.message || e).split('\n')[0].slice(0, 200));
    return rec;
  } finally {
    rec.ms = Date.now() - t0;
    await ctx.close().catch(() => {});
  }
}
// A page that "works" but threw is still reported, as OK-with-errors -> LOAD-ERROR only when it has a pageerror.
function finish(rec) {
  if ((rec.status === 'OK' || rec.status === 'SKIPPED') && rec.pageErrors.length) {
    rec.reasons.unshift('pageerror: ' + rec.pageErrors[0].slice(0, 160));
    rec.status = 'LOAD-ERROR';
  }
  return rec;
}

// ---------- URL list ----------
async function urlList() {
  const xml = await (await fetch(BASE + '/sitemap.xml')).text();
  let locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  // follow a sitemap index one level
  const nested = locs.filter((l) => /\.xml(\?|$)/.test(l));
  for (const n of nested) {
    const x = await (await fetch(n.replace(/^https?:\/\/[^/]+/, BASE))).text().catch(() => '');
    locs.push(...[...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
  }
  const paths = [...new Set(locs.map((l) => { try { return new URL(l).pathname.replace(/\/$/, ''); } catch { return ''; } }))];
  const tools = paths.filter((p) => /^\/tools\/[^/]+$/.test(p));
  const pairs = paths.filter((p) => /^\/convert\/[^/]+-to-[^/]+$/.test(p));
  return [...tools, ...pairs].filter((p) => !ONLY || ONLY.test(p));
}

// ---------- main ----------
const urls = await urlList();
console.error(`sweeping ${urls.length} pages against ${BASE} (concurrency ${CONCURRENCY})`);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const results = [];
let next = 0;
async function worker() {
  while (next < urls.length) {
    const u = urls[next++];
    const r = await runPage(browser, u);
    results.push(r);
    const why = r.reasons[0] ? ' - ' + r.reasons[0] : '';
    const out = r.output ? ` ${r.output.kind} ${r.output.bytes}B` : '';
    console.log(`${r.status.padEnd(11)} ${u}${out}${why}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();

results.sort((a, b) => a.url.localeCompare(b.url));
const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
// root-cause signatures: first pageerror, else first same-origin 4xx/5xx, else first reason
const sig = (r) => (r.pageErrors[0] ? 'pageerror: ' + r.pageErrors[0].replace(/\d+/g, 'N').slice(0, 120)
  : r.http[0] ? 'http: ' + r.http[0].replace(/\?.*$/, '')
  : r.red[0] ? 'red: ' + r.red[0].slice(0, 120) : r.reasons[0] || '?');
const groups = {};
for (const r of results) if (['LOAD-ERROR', 'NO-UI', 'UPLOAD-FAIL'].includes(r.status)) (groups[sig(r)] ||= []).push(r.url);
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify({ base: BASE, at: new Date().toISOString(), counts, signatures: groups, results }, null, 2));

console.log('\n==== summary ====');
for (const [k, v] of Object.entries(counts)) console.log(`${k.padEnd(12)} ${v}`);
console.log('\n==== failure signatures (count, pages) ====');
for (const [s, list] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(list.length).padStart(3)}  ${s}`);
  console.log('       ' + list.slice(0, 8).join(' ') + (list.length > 8 ? ` ... +${list.length - 8}` : ''));
}
console.log(`\nreport: ${OUT_JSON}   downloads: ${DL_DIR}`);
process.exit(Object.keys(groups).length ? 1 : 0);
