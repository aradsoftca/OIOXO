// Live check of the mobile-app mode (lib/app-bridge.ts) with a fake native bridge.
// Run on arad: node scripts/live_app_mode.mjs [base]   (needs /root/cadtest/samples)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] || 'https://xonvert.com';
const SAMPLES = '/root/cadtest/samples';
const CHROME = process.env.CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
let fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fail = 1; };

const b = await chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({
  acceptDownloads: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 XonvertApp/2.0',
  viewport: { width: 390, height: 844 },
});
// The Flutter JavaScriptChannel stand-in: record every message the page sends.
await ctx.addInitScript(() => {
  window.__msgs = [];
  window.XonvertBridge = { postMessage: (m) => window.__msgs.push(JSON.parse(m)) };
});
const p = await ctx.newPage();
let nativeDownloads = 0;
p.on('download', () => nativeDownloads++);

// 1. site chrome hidden
await p.goto(BASE + '/convert/png-to-jpg', { waitUntil: 'networkidle' });
check('html flagged data-app', (await p.evaluate(() => document.documentElement.dataset.app)) === '1');
check('site header hidden', !(await p.locator('header').first().isVisible()));
check('site footer hidden', !(await p.locator('footer').first().isVisible()));

// 2. file IN from the app (share sheet / picker) → the page converts it
const png = fs.readFileSync(`${SAMPLES}/test.png`).toString('base64');
await p.evaluate((data) => window.__xonvertAppEvent({ type: 'files', files: [{ name: 'shared.png', mime: 'image/png', data }] }), png);
await p.waitForTimeout(4000);
// (checked below: the result the page hands back is named after the shared file)

// 3. result OUT goes to the app, not a browser download
const dl = p.locator('main button:visible, main a:visible', { hasText: /download|\.jpg/i }).first();
if (await dl.count()) await dl.click().catch(() => {});
await p.waitForTimeout(4000);
const saved = await p.evaluate(() => window.__msgs.filter((m) => m.type === 'saveFile').map((m) => ({ name: m.name, mime: m.mime, len: m.data.length })));
check('result sent to the app (saveFile)', saved.length > 0, JSON.stringify(saved));
check('shared file went in and came back converted', saved.some((s) => s.name.startsWith('shared')));
check('JPEG bytes in the message', saved.some((s) => /jpe?g/.test(s.mime) && s.len > 100));
check('no browser download fired', nativeDownloads === 0, String(nativeDownloads));

// 4. tool manifest for the app's home screen
const man = await (await ctx.request.get(BASE + '/app-manifest.json')).json();
const nTools = man.categories.reduce((n, c) => n + c.tools.length, 0);
check('app-manifest lists the tools', nTools > 300, `${man.categories.length} categories, ${nTools} tools, ${man.apps.length} apps`);
check('app-manifest has no disabled studio', !JSON.stringify(man).includes('/tools/image-studio'));

// 5. ad unlock endpoints
const tk = await (await ctx.request.post(BASE + '/api/usage/ad-ticket', { data: { category: 'video' } })).json();
check('ad-ticket issued', typeof tk.ticket === 'string' && tk.ticket.includes('.'));
const bad = await ctx.request.get(BASE + '/api/usage/ad-reward?custom_data=x&signature=AAAA&key_id=1');
check('forged ad-reward callback refused', bad.status() === 400, String(bad.status()));

// 6. the web (no app UA) is unchanged
const web = await b.newPage();
await web.goto(BASE + '/convert/png-to-jpg', { waitUntil: 'networkidle' });
check('web still shows its header', await web.locator('header').first().isVisible());

await b.close();
console.log(fail ? 'APP_MODE_FAIL' : 'APP_MODE_PASS');
process.exit(fail);
