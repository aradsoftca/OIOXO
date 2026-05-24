import { chromium } from 'playwright';
const URL = 'http://localhost:3210/oioxo';
async function ready(ms = 200000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if ((await fetch('http://localhost:3210/api/geo?q=paris')).ok) return true; } catch {} await new Promise(r => setTimeout(r, 2000)); } return false; }
if (!(await ready())) { console.log('server not ready'); process.exit(1); }
// confirm the geocode route works
const geo = await (await fetch('http://localhost:3210/api/geo?q=London')).json();
console.log('GEO /api/geo?q=London ->', JSON.stringify(geo));
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await p.waitForTimeout(1500);
const ta = p.locator('textarea').first();
await ta.fill('how far is paris from london');
await ta.press('Enter');
// wait for the assistant text + the leaflet map to appear
await p.waitForSelector('.leaflet-container', { timeout: 60000 }).catch(() => console.log('no .leaflet-container'));
await p.waitForTimeout(3500);
await p.screenshot({ path: '_geo-shot.png' });
const txt = await p.evaluate(() => {
  const els = [...document.querySelectorAll('*')].map(e => e.textContent || '');
  return els.find(t => /apart in a straight line|km \(/.test(t))?.slice(0, 160) || '(answer text not found)';
});
console.log('ANSWER:', txt);
console.log('has map:', await p.locator('.leaflet-container').count());
await b.close();
