#!/usr/bin/env node
/**
 * Tell IndexNow (Bing, Yandex, Seznam, Naver…) about every URL in the live
 * sitemap, so changed pages are recrawled in hours instead of weeks. Bing's
 * index also feeds ChatGPT / Copilot search. Run after a successful deploy
 * (scripts/arad_build_deploy.sh does). Never fails the caller: prints a line.
 *
 *   node scripts/indexnow.mjs [baseUrl=https://xonvert.com]
 *
 * The key is public by design: IndexNow verifies ownership by fetching
 * <base>/<key>.txt (public/<key>.txt) and comparing its content.
 */
const BASE = (process.argv[2] || 'https://xonvert.com').replace(/\/$/, '');
const KEY = '89a4f51feee745899969c329d9cff14b';

// Right after a deploy the site is still restarting, so a first fetch can fail ("fetch failed").
// Try up to 4 times, 20 s apart, before giving up.
async function submit() {
  const host = new URL(BASE).host;
  const keyBody = await (await fetch(`${BASE}/${KEY}.txt`, { cache: 'no-store' })).text();
  if (keyBody.trim() !== KEY) throw new Error(`key file not served at ${BASE}/${KEY}.txt`);
  const xml = await (await fetch(`${BASE}/sitemap.xml?indexnow=${Date.now()}`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => new URL(u).host === host);
  if (!urls.length) throw new Error('sitemap has no URLs');
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: KEY, keyLocation: `${BASE}/${KEY}.txt`, urlList: urls.slice(0, 10000) }),
  });
  // 200/202 = accepted. 422 = URLs don't match host/key; 429 = too many submissions.
  console.log(`indexnow: ${res.status} for ${urls.length} URLs`);
}

for (let attempt = 1; ; attempt++) {
  try {
    await submit();
    break;
  } catch (e) {
    if (attempt >= 4) { console.log(`indexnow: skipped after ${attempt} tries (${e.message})`); break; }
    await new Promise((r) => setTimeout(r, 20_000));
  }
}
