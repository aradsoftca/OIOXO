/**
 * oioxo search-providers — the migrated IA provider implementations carved
 * out of search.html so they ship ENCRYPTED (oioxo/protected/search-providers.enc).
 *
 * Decrypted + eval'd by oioxoLoader.getProviders() at runtime. References
 * search.html globals (esc, _loadEngine, _loadSkill, _loadToolCatalog,
 * _detectToolIntent, _enginePromises) which exist in the same global scope
 * after eval; no module/import semantics. Cross-origin clones fail the
 * /api/search-key handshake and never see these bytes.
 *
 * Generated from search.html — do not hand-edit. To update, modify search.html
 * and re-run scripts/extract-providers.mjs followed by scripts/encrypt-search.mjs.
 */
// =============================================================================
// PR281 — UNIT CONVERTER CARD. Detect natural-language unit conversions in the
// query ("5 miles in km", "100 kg to lb", "70 °F in c", "1 cup to ml") and
// compute instantly with zero network. Covers length, mass, temperature,
// volume, speed, time. Google has this; ours runs even offline.
async function iaUnitConvert(rawQ){
  if (!rawQ || rawQ.length < 4 || rawQ.length > 60) return null;
  const eng = await _loadEngine('units');
  if (!eng || typeof eng.parse !== 'function') return null;
  const parsed = eng.parse(rawQ);
  if (!parsed) return null;
  const result = eng.convert(parsed.value, parsed.from, parsed.to);
  if (result === null || result === undefined || !isFinite(result)) return null;
  const fmt = eng.format(result);
  const toolLink = 'https://oioxo.com/calculators/unit-converter?q=' + encodeURIComponent(rawQ.trim());
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">↔ Unit conversion</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${esc(parsed.value + ' ' + parsed.from)}</div>
    <div style="font-size:30px;font-weight:800;line-height:1.1;color:var(--ink);margin-bottom:8px">${esc(fmt)} <span style="font-size:18px;color:var(--muted);font-weight:600">${esc(parsed.to)}</span></div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Computed on-device · same engine as oioxo.com/calculators/unit-converter</div>`;
  return { kind: 'unit-convert', title: 'Conversion', html, priority: 99 };
}

// =============================================================================
// PR282 — LIVE CURRENCY CONVERTER. Detects "100 USD to EUR" / "50 eur in jpy"
// and pulls ECB rates from api.frankfurter.app (free, no key, CORS-open).
// Rates cached in localStorage for 4h to spare the public endpoint.
// On-device math, single tiny network hit. Frankfurter only covers ~30 fiat
// currencies — if either side is unknown, we silently skip.
async function iaCurrency(rawQ){
  if (!rawQ || rawQ.length < 6 || rawQ.length > 60) return null;
  const m = rawQ.trim().toLowerCase().replace(/,/g,'').match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-z$€£¥]{1,4})\s+(?:to|in|=|->)\s+([a-z$€£¥]{1,4})\??$/i);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  if (!isFinite(amount) || amount <= 0) return null;
  const skill = await _loadSkill('currency');
  if (!skill || typeof skill.convert !== 'function') return null;
  const res = await skill.convert(amount, m[2], m[3]);
  if (!res) return null;
  const fmt = (n) => {
    if (Math.abs(n) >= 1e6) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return Number(n.toFixed(6)).toString();
  };
  const sym = ({USD:'$',EUR:'€',GBP:'£',JPY:'¥'})[res.to] || '';
  const fromSym = ({USD:'$',EUR:'€',GBP:'£',JPY:'¥'})[res.from] || '';
  const toolLink = 'https://oioxo.com/datatools/currency-converter?amount=' + encodeURIComponent(amount) + '&from=' + encodeURIComponent(res.from) + '&to=' + encodeURIComponent(res.to);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">💱 Currency conversion</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${esc(fromSym + fmt(amount) + ' ' + res.from)}</div>
    <div style="font-size:30px;font-weight:800;line-height:1.1;color:var(--ink);margin-bottom:4px">${esc(sym)}${esc(fmt(res.result))} <span style="font-size:18px;color:var(--muted);font-weight:600">${esc(res.to)}</span></div>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Rate: 1 ${esc(res.from)} = ${fmt(res.rate)} ${esc(res.to)} · ECB ${esc(res.date)}</div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/currency-converter</div>`;
  return { kind: 'currency', title: 'Currency', html, priority: 99 };
}

// =============================================================================
// PR283 — PRONOUNCE-IT. For short word/name queries (1–3 tokens, alphabetic)
// pull the IPA from en.wiktionary's REST html endpoint and surface it next
// to a 🔊 button that speaks the word via SpeechSynthesis. Perfect for
// foreign names, places, technical terms. Wiktionary REST is CORS-open
// and runs without an API key.
async function iaPronounce(rawQ){
  if (!rawQ || rawQ.length < 2 || rawQ.length > 40) return null;
  if (!('speechSynthesis' in window)) return null;
  const skill = await _loadSkill('pronounce');
  if (!skill || typeof skill.getPronunciation !== 'function') return null;
  const data = await skill.getPronunciation(rawQ.trim());
  if (!data || !data.ipa) return null;
  const safeQ = data.word.replace(/[`'"\\]/g, '');
  const toolLink = 'https://oioxo.com/texttools/pronounce?word=' + encodeURIComponent(data.word);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🗣 Pronunciation (${esc(data.langTag)})</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <button type="button" onclick="(function(){try{var u=new SpeechSynthesisUtterance('${esc(safeQ)}');u.lang='${esc(data.langTag)}';u.rate=0.85;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);}catch(_){}})()" style="display:flex;align-items:center;justify-content:center;width:42px;height:42px;border:none;border-radius:50%;background:var(--accent);color:var(--ink);font-size:18px;cursor:pointer;flex-shrink:0" title="Play">▶</button>
      <div style="flex:1;min-width:0">
        <div style="font-size:18px;font-weight:700;line-height:1.2;color:var(--ink);margin-bottom:3px">${esc(data.word)}</div>
        <div style="font-size:14px;color:var(--muted);font-family:'SF Mono',Menlo,Consolas,monospace">${esc(data.ipa)}</div>
      </div>
    </div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">IPA from Wiktionary · audio on-device · same skill as oioxo.com/texttools/pronounce</div>`;
  return { kind: 'pronounce', title: 'Pronounce', html, priority: 78 };
}

// =============================================================================
// PR284 — GITHUB REPO SNAPSHOT. For library/tool/framework queries (single
// word or hyphenated name, OR query mentions code/library/framework/sdk),
// hit api.github.com/search/repositories (CORS-open, anonymous = 10 req/min).
// Surface the top repo as a card with stars, language, last push, description,
// open issues. Cached for 6h to keep us under the anon rate-limit.
async function iaGitHubRepo(rawQ){
  if (!rawQ || rawQ.length < 2 || rawQ.length > 60) return null;
  const q = rawQ.trim();
  const looksLikeLib = /^[a-z0-9][a-z0-9\-_.]{1,30}$/i.test(q)
    || /\b(library|framework|sdk|cli|github|repo|npm|pypi|cargo|opensource|open[- ]source)\b/i.test(q);
  if (!looksLikeLib) return null;
  if (/^(how|why|what|when|where|which|who|is|are)\b/i.test(q)) return null;
  const skill = await _loadSkill('github');
  if (!skill || typeof skill.searchTopRepo !== 'function') return null;
  const repo = await skill.searchTopRepo(q);
  if (!repo) return null;
  const ago = (iso) => {
    if (!iso) return '';
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 0) return '';
    if (d < 86400) return Math.floor(d/3600) + 'h ago';
    if (d < 86400*30) return Math.floor(d/86400) + 'd ago';
    if (d < 86400*365) return Math.floor(d/86400/30) + 'mo ago';
    return Math.floor(d/86400/365) + 'y ago';
  };
  const k = (n) => n >= 1000 ? (n/1000).toFixed(n>=10000?0:1) + 'k' : String(n);
  const toolLink = 'https://oioxo.com/devtools/github-repo?q=' + encodeURIComponent(q);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">⌨ Top GitHub repo</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <a href="${esc(repo.url)}" target="_blank" rel="noopener" style="display:block;padding:11px 13px;background:var(--surface);border-radius:6px;text-decoration:none;color:var(--ink);border:1px solid var(--border)">
      <div style="font-size:14px;font-weight:700;line-height:1.3;margin-bottom:4px">${esc(repo.name)}</div>
      ${repo.desc ? `<div style="font-size:11px;color:var(--muted);line-height:1.4;margin-bottom:7px">${esc(repo.desc.slice(0,180))}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--muted)">
        <span>★ ${esc(k(repo.stars))}</span>
        <span>⑂ ${esc(k(repo.forks))}</span>
        ${repo.lang ? `<span>● ${esc(repo.lang)}</span>` : ''}
        <span>${esc(k(repo.issues))} issues</span>
        ${repo.pushed ? `<span>updated ${esc(ago(repo.pushed))}</span>` : ''}
      </div>
      ${repo.topics.length ? `<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:4px">${repo.topics.map(t=>`<span style="font-size:9px;background:var(--ink);color:var(--bg);padding:2px 6px;border-radius:8px">${esc(t)}</span>`).join('')}</div>` : ''}
    </a>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/devtools/github-repo</div>`;
  return { kind: 'github-repo', title: 'GitHub repo', html, priority: 75 };
}

// =============================================================================
// PR285 — ETYMOLOGY CARD. For single-word noun queries pull the "Etymology"
// section text from en.wiktionary's REST html endpoint. Surfaces the origin,
// language path, and earliest attestation — a small but delightful card no
// general search engine ships. CORS-open, no key.
async function iaEtymology(rawQ){
  if (!rawQ || rawQ.length < 3 || rawQ.length > 30) return null;
  const q = rawQ.trim();
  if (!/^[a-zA-Z]{3,30}$/.test(q)) return null;
  if (/^(api|sdk|cli|css|html|json|http|https|tcp|udp|dns)$/i.test(q)) return null;
  const skill = await _loadSkill('etymology');
  if (!skill || typeof skill.getEtymology !== 'function') return null;
  const data = await skill.getEtymology(q);
  if (!data) return null;
  const toolLink = 'https://oioxo.com/texttools/etymology?word=' + encodeURIComponent(data.word);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">📜 Etymology · ${esc(data.word)}</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="font-size:13px;line-height:1.55;color:var(--ink)">${esc(data.text)}</div>
    ${data.attestedYear ? `<div style="margin-top:8px;display:inline-block;padding:3px 8px;background:var(--accent);color:var(--ink);border-radius:10px;font-size:10px;font-weight:700">First attested: ${esc(data.attestedYear)}</div>` : ''}
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;margin-left:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/texttools/etymology · cached 30d</div>`;
  return { kind: 'etymology', title: 'Etymology', html, priority: 50 };
}

// =============================================================================
// PR286 — LOCAL TIME / WORLD CLOCK. Detects "time in Tokyo", "Berlin time",
// or a bare well-known city query, maps the city to an IANA timezone via a
// curated 100-city table, and renders the current local time + day-of-week
// + UTC offset using Intl.DateTimeFormat. Pure on-device, zero network.
function iaLocalTime(rawQ){
  if (!rawQ || rawQ.length < 3 || rawQ.length > 60) return null;
  const norm = rawQ.trim().toLowerCase();
  // Match "time in X", "X time", "what time is it in X", "current time X"
  let city = null;
  let m = norm.match(/^(?:what\s+(?:is\s+the\s+)?(?:current\s+)?time\s+(?:is\s+it\s+)?(?:in\s+)?|current\s+time\s+(?:in\s+)?|time\s+(?:in|at)\s+|local\s+time\s+(?:in\s+)?)([a-z .'\-]{2,40})\??$/);
  if (m) city = m[1].trim();
  else {
    m = norm.match(/^([a-z .'\-]{2,40})\s+(?:time|local\s+time|now)\??$/);
    if (m) city = m[1].trim();
  }
  if (!city) return null;
  const TZ = {
    'tokyo':'Asia/Tokyo','osaka':'Asia/Tokyo','kyoto':'Asia/Tokyo',
    'seoul':'Asia/Seoul','beijing':'Asia/Shanghai','shanghai':'Asia/Shanghai','hong kong':'Asia/Hong_Kong','hongkong':'Asia/Hong_Kong','taipei':'Asia/Taipei',
    'singapore':'Asia/Singapore','kuala lumpur':'Asia/Kuala_Lumpur','jakarta':'Asia/Jakarta','bangkok':'Asia/Bangkok','manila':'Asia/Manila','ho chi minh':'Asia/Ho_Chi_Minh','hanoi':'Asia/Ho_Chi_Minh',
    'mumbai':'Asia/Kolkata','delhi':'Asia/Kolkata','bangalore':'Asia/Kolkata','new delhi':'Asia/Kolkata','chennai':'Asia/Kolkata','kolkata':'Asia/Kolkata',
    'karachi':'Asia/Karachi','islamabad':'Asia/Karachi','lahore':'Asia/Karachi',
    'dubai':'Asia/Dubai','abu dhabi':'Asia/Dubai','doha':'Asia/Qatar','riyadh':'Asia/Riyadh','tehran':'Asia/Tehran','baghdad':'Asia/Baghdad',
    'istanbul':'Europe/Istanbul','ankara':'Europe/Istanbul',
    'moscow':'Europe/Moscow','st petersburg':'Europe/Moscow','saint petersburg':'Europe/Moscow','kyiv':'Europe/Kyiv','kiev':'Europe/Kyiv',
    'london':'Europe/London','dublin':'Europe/Dublin','edinburgh':'Europe/London','manchester':'Europe/London',
    'paris':'Europe/Paris','lyon':'Europe/Paris','marseille':'Europe/Paris',
    'berlin':'Europe/Berlin','munich':'Europe/Berlin','hamburg':'Europe/Berlin','frankfurt':'Europe/Berlin',
    'amsterdam':'Europe/Amsterdam','brussels':'Europe/Brussels','vienna':'Europe/Vienna','zurich':'Europe/Zurich','geneva':'Europe/Zurich',
    'madrid':'Europe/Madrid','barcelona':'Europe/Madrid','lisbon':'Europe/Lisbon','rome':'Europe/Rome','milan':'Europe/Rome','venice':'Europe/Rome',
    'athens':'Europe/Athens','warsaw':'Europe/Warsaw','prague':'Europe/Prague','budapest':'Europe/Budapest','stockholm':'Europe/Stockholm','oslo':'Europe/Oslo','copenhagen':'Europe/Copenhagen','helsinki':'Europe/Helsinki','reykjavik':'Atlantic/Reykjavik',
    'cairo':'Africa/Cairo','lagos':'Africa/Lagos','nairobi':'Africa/Nairobi','johannesburg':'Africa/Johannesburg','cape town':'Africa/Johannesburg','casablanca':'Africa/Casablanca',
    'new york':'America/New_York','nyc':'America/New_York','boston':'America/New_York','philadelphia':'America/New_York','miami':'America/New_York','atlanta':'America/New_York','washington':'America/New_York','dc':'America/New_York','toronto':'America/Toronto','montreal':'America/Toronto','quebec':'America/Toronto',
    'chicago':'America/Chicago','dallas':'America/Chicago','houston':'America/Chicago','minneapolis':'America/Chicago','mexico city':'America/Mexico_City',
    'denver':'America/Denver','phoenix':'America/Phoenix','salt lake city':'America/Denver',
    'los angeles':'America/Los_Angeles','la':'America/Los_Angeles','san francisco':'America/Los_Angeles','sf':'America/Los_Angeles','seattle':'America/Los_Angeles','vancouver':'America/Vancouver','san diego':'America/Los_Angeles','portland':'America/Los_Angeles',
    'anchorage':'America/Anchorage','honolulu':'Pacific/Honolulu','hawaii':'Pacific/Honolulu',
    'sao paulo':'America/Sao_Paulo','rio de janeiro':'America/Sao_Paulo','rio':'America/Sao_Paulo','buenos aires':'America/Argentina/Buenos_Aires','santiago':'America/Santiago','lima':'America/Lima','bogota':'America/Bogota',
    'sydney':'Australia/Sydney','melbourne':'Australia/Melbourne','brisbane':'Australia/Brisbane','perth':'Australia/Perth','auckland':'Pacific/Auckland','wellington':'Pacific/Auckland',
    'utc':'UTC','gmt':'UTC',
  };
  const tz = TZ[city];
  if (!tz) return null;
  let timeStr, dateStr, offset;
  try {
    const now = new Date();
    timeStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
    dateStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(now);
    const off = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now).find(p => p.type === 'timeZoneName');
    offset = off ? off.value : '';
  } catch { return null; }
  const cityTitle = city.replace(/\b\w/g, c => c.toUpperCase());
  const html = `
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px">🕒 Local time in ${esc(cityTitle)}</div>
    <div style="font-size:36px;font-weight:800;line-height:1;color:var(--ink);margin-bottom:6px;letter-spacing:-1px">${esc(timeStr)}</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:4px">${esc(dateStr)}</div>
    <div style="display:inline-block;padding:3px 8px;background:var(--surface);border:1px solid var(--border);border-radius:10px;font-size:10px;font-weight:600;color:var(--muted)">${esc(tz)} · ${esc(offset)}</div>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Computed on-device · zero network</div>`;
  return { kind: 'local-time', title: 'Local time', html, priority: 99 };
}

// =============================================================================
// PR287 — WIKIPEDIA PAGEVIEWS SPARKLINE. For entity queries, locate the
// matching Wikipedia article via opensearch then pull 60 days of pageview
// counts from the Wikimedia pageviews REST. Renders a tiny SVG sparkline +
// today's count + peak day. Tells you whether interest is currently up or
// down — a public-attention signal no general search engine shows.
async function iaPageviews(rawQ){
  if (!rawQ || rawQ.length < 3 || rawQ.length > 60) return null;
  const q = rawQ.trim();
  if (/^https?:\/\//i.test(q)) return null;
  if (/^(how|why|when|where|what is|what does|is|are|can|does|do)\b/i.test(q)) return null;
  if (q.split(/\s+/).length > 4) return null;
  const skill = await _loadSkill('pageviews');
  if (!skill || typeof skill.getPageviews !== 'function') return null;
  const data = await skill.getPageviews(q);
  if (!data) return null;
  const views = data.samples.map(s => s.views);
  const sl = skill.buildSparklinePath(views, 280, 64, 4);
  const trend = data.trendPct > 20 ? ['↗ trending up', '#16a34a'] : data.trendPct < -20 ? ['↘ trending down', '#dc2626'] : ['→ stable', 'var(--muted)'];
  const k = (n) => n >= 1000 ? (n/1000).toFixed(n>=10000?0:1) + 'k' : String(n);
  const toolLink = 'https://oioxo.com/datatools/wikipedia-pageviews?q=' + encodeURIComponent(q);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">📈 Wikipedia interest · last 60 days</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <svg viewBox="0 0 280 64" width="100%" height="64" style="display:block;margin-bottom:8px">
      <polyline points="${sl.line}" fill="none" stroke="#E2B24A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="${sl.fill}" fill="rgba(226,178,74,0.15)" stroke="none"/>
    </svg>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
      <div><span style="font-size:18px;font-weight:800;color:var(--ink)">${esc(k(data.last))}</span><span style="font-size:11px;color:var(--muted);margin-left:6px">views yesterday</span></div>
      <span style="font-size:11px;font-weight:600;color:${trend[1]}">${esc(trend[0])}</span>
    </div>
    <div style="font-size:10px;color:var(--muted)">Peak: ${esc(k(data.max))} on ${esc(data.peakDate)} · ${esc(data.title)}</div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/wikipedia-pageviews · cached 6h</div>`;
  return { kind: 'pageviews', title: 'Public interest', html, priority: 45 };
}

// =============================================================================
// PR288 — DATE MATH CARD. Handles "days until X" / "X days from today" /
// "days between A and B" / "what day is X". Parses ISO dates, "January 5
// 2027" / "5 January 2027", numeric mm/dd/yyyy, and a curated set of US/EU
// holidays. Pure on-device, instant answer, zero network.
async function iaDateMath(rawQ){
  if (!rawQ || rawQ.length < 5 || rawQ.length > 80) return null;
  const q = rawQ.trim().toLowerCase();
  const eng = await _loadEngine('datemath');
  if (!eng) return null;
  const today = new Date(); today.setUTCHours(0,0,0,0);
  let mode = null, payload = null;
  let m = q.match(/^(?:how\s+many\s+)?days?\s+(?:until|till|to)\s+(.+?)\??$/);
  if (m){ mode = 'until'; payload = m[1].trim(); }
  if (!mode){ m = q.match(/^(?:how\s+many\s+)?days?\s+between\s+(.+?)\s+and\s+(.+?)\??$/); if (m){ mode = 'between'; payload = [m[1].trim(), m[2].trim()]; } }
  if (!mode){ m = q.match(/^(\d{1,5})\s+days?\s+(from\s+today|from\s+now|ago)\??$/); if (m){ mode = 'shift'; payload = { n: parseInt(m[1],10), dir: m[2].startsWith('ago')?-1:1 }; } }
  if (!mode){ m = q.match(/^what\s+day(?:\s+of\s+the\s+week)?\s+is\s+(.+?)\??$/); if (m){ mode = 'weekday'; payload = m[1].trim(); } }
  if (!mode) return null;
  const toolLink = 'https://oioxo.com/calculators/date-difference?q=' + encodeURIComponent(rawQ.trim());
  const chip = '<span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>';
  const openBtn = `<a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a><div style="margin-top:6px;font-size:10px;color:var(--muted)">Computed on-device · same engine as oioxo.com/calculators/date-difference</div>`;
  if (mode === 'until'){
    const diff = eng.daysUntil(payload);
    if (diff === null) return null;
    const d = eng.parseDate(payload);
    const label = payload.replace(/\b\w/g, c=>c.toUpperCase());
    const big = (Math.abs(diff)) + ' day' + (Math.abs(diff)===1?'':'s');
    const verdict = diff > 0 ? 'until ' + esc(label) : diff < 0 ? 'since ' + esc(label) + ' (already passed)' : 'is today';
    const html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;color:var(--muted)">📅 Days until</span>${chip}</div>
      <div style="font-size:36px;font-weight:800;line-height:1;color:var(--ink);margin-bottom:6px">${esc(big)}</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:6px">${verdict}</div>
      <div style="display:inline-block;padding:3px 8px;background:var(--surface);border:1px solid var(--border);border-radius:10px;font-size:10px;font-weight:600;color:var(--muted)">${esc(eng.formatDate(d))}</div>${openBtn}`;
    return { kind: 'date-math', title: 'Date math', html, priority: 99 };
  }
  if (mode === 'between'){
    const diff = eng.daysBetween(payload[0], payload[1]);
    if (diff === null) return null;
    const html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;color:var(--muted)">📅 Days between</span>${chip}</div>
      <div style="font-size:36px;font-weight:800;line-height:1;color:var(--ink);margin-bottom:6px">${diff} day${diff===1?'':'s'}</div>
      <div style="font-size:11px;color:var(--muted)">${esc(payload[0])} → ${esc(payload[1])}</div>${openBtn}`;
    return { kind: 'date-math', title: 'Date math', html, priority: 99 };
  }
  if (mode === 'shift'){
    const d = eng.addDays(payload.dir * payload.n);
    if (!d) return null;
    const html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;color:var(--muted)">📅 Date math</span>${chip}</div>
      <div style="font-size:26px;font-weight:800;line-height:1.1;color:var(--ink);margin-bottom:6px">${esc(eng.formatDate(d))}</div>
      <div style="font-size:12px;color:var(--muted)">${payload.n} day${payload.n===1?'':'s'} ${payload.dir<0?'ago':'from today'}</div>${openBtn}`;
    return { kind: 'date-math', title: 'Date math', html, priority: 99 };
  }
  if (mode === 'weekday'){
    const wk = eng.weekdayOf(payload);
    if (!wk) return null;
    const d = eng.parseDate(payload);
    const html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;color:var(--muted)">📅 Weekday</span>${chip}</div>
      <div style="font-size:30px;font-weight:800;line-height:1;color:var(--ink);margin-bottom:6px">${esc(wk)}</div>
      <div style="font-size:12px;color:var(--muted)">${esc(eng.formatDate(d))}</div>${openBtn}`;
    return { kind: 'date-math', title: 'Weekday', html, priority: 99 };
  }
  return null;
}

// =============================================================================
// PR289 — CITATION GENERATOR. For factual queries with 3+ SERP results, emit
// the top 3 hits as ready-to-paste citations in APA, MLA, and Chicago format.
// Each has a one-click "Copy" button. We don't have author/date, so we fall
// back to hostname-as-publisher + accessed-today — honest about the gap.
// Search engines never give you the citation; we hand it over pre-formatted.
async function iaCitations(rawQ){
  if (!rawQ || rawQ.length < 6 || rawQ.length > 120) return null;
  if (/^https?:\/\//i.test(rawQ)) return null;
  if (typeof _searxQuery !== 'function') return null;
  let cands = null;
  try { cands = await _searxQuery(rawQ); } catch {}
  if (!cands || cands.length < 3) return null;
  const top = cands.slice(0, 3);
  const eng = await _loadEngine('citations');
  if (!eng || typeof eng.format !== 'function') return null;
  const items = eng.format(top.map(c => ({ url: c.url, title: c.title })));
  if (!items.length) return null;
  const styles = [['apa','APA'], ['mla','MLA'], ['chi','Chicago']];
  const fmtBlocks = styles.map(([style, label], si) => `
    <details style="margin-bottom:6px"${si===0?' open':''}>
      <summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--accent);padding:5px 0">${label}</summary>
      <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px">
        ${items.map((it, ii) => `<div style="padding:8px 10px;background:var(--surface);border-radius:5px;font-size:11px;line-height:1.55;color:var(--ink);position:relative">
          <button type="button" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(it[style])}')).then(()=>{this.textContent='✓';setTimeout(()=>{this.textContent='Copy';},1500);})" style="position:absolute;top:6px;right:6px;padding:2px 8px;font-size:9px;font-weight:700;background:var(--ink);color:var(--bg);border:none;border-radius:3px;cursor:pointer">Copy</button>
          <div style="padding-right:50px;font-family:'SF Mono',Menlo,Consolas,monospace">${esc(it[style])}</div>
        </div>`).join('')}
      </div>
    </details>
  `).join('');
  const toolLink = 'https://oioxo.com/devtools/citation-generator?urls=' + encodeURIComponent(top.map(c=>c.url).join('\n'));
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">📎 Citations for top sources</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    ${fmtBlocks}
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Computed on-device · same engine as oioxo.com/devtools/citation-generator · author/date not detected</div>`;
  return { kind: 'citations', title: 'Cite as', html, priority: 25 };
}

// =============================================================================
// PR290 — COLOR CARD. Detect a CSS color in the query (hex #RRGGBB / #RGB,
// rgb(), rgba(), hsl(), or a named CSS color) and render a 100×100 swatch
// plus all formats + WCAG contrast vs black & white. Off-canvas resolver
// lets the browser do named-color parsing for us — no curated table needed.
async function iaColorCard(rawQ){
  if (!rawQ || rawQ.length < 3 || rawQ.length > 50) return null;
  const eng = await _loadEngine('color');
  if (!eng || typeof eng.parse !== 'function') return null;
  const rgb = eng.parse(rawQ);
  if (!rgb) return null;
  const hex = eng.toHex(rgb);
  const rgbStr = eng.toRgb(rgb);
  const hsl = eng.toHsl(rgb);
  const c = eng.contrast(rgb);
  const toolLink = 'https://oioxo.com/generators/color-converter?color=' + encodeURIComponent(hex);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🎨 Color</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
      <div style="width:84px;height:84px;border-radius:8px;background:${esc(hex)};border:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:${c.preferredText};font-weight:800;font-size:11px">${esc(hex)}</div>
      <div style="flex:1;min-width:0;font-size:11px;line-height:1.7;font-family:'SF Mono',Menlo,Consolas,monospace">
        <div><span style="color:var(--muted)">HEX</span> ${esc(hex)}</div>
        <div><span style="color:var(--muted)">RGB</span> ${esc(rgbStr)}</div>
        <div><span style="color:var(--muted)">HSL</span> ${esc(hsl)}</div>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <div style="flex:1;padding:6px 8px;background:#000;color:#fff;border-radius:4px;text-align:center;font-size:11px">on black<br><b>${c.onBlack}:1</b></div>
      <div style="flex:1;padding:6px 8px;background:#fff;color:#000;border-radius:4px;text-align:center;font-size:11px;border:1px solid var(--border)">on white<br><b>${c.onWhite}:1</b></div>
    </div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Computed on-device · same engine as oioxo.com/generators/color-converter · WCAG AA needs 4.5:1</div>`;
  return { kind: 'color', title: 'Color', html, priority: 96 };
}

// =============================================================================
// PR291 — CRYPTO PRICE CARD. Detect "btc price", "ethereum to usd",
// "dogecoin price in eur" etc. Hits api.coingecko.com /simple/price
// (free, no key, CORS-open). Curated symbol→id map for the top 30 coins.
// Renders price, 24h change (colored), and 24h volume. Cached 60s.
// PR291 (MIGRATED) — now driven by `oioxoSkills.crypto` (mirror of
// lib/skills/crypto.ts, also powering app/datatools/crypto-price). Card adds
// the gold OIOXO TOOL chip + "Open full tool →" deep-link.
async function iaCrypto(rawQ){
  if (!rawQ || rawQ.length < 3 || rawQ.length > 50) return null;
  const q = rawQ.trim().toLowerCase();
  let coinRaw = null, vsRaw = 'usd';
  let m = q.match(/^(?:price\s+of\s+|how\s+much\s+is\s+|current\s+price\s+(?:of\s+)?)?([a-z]{2,12})(?:\s+price)?(?:\s+(?:to|in)\s+([a-z]{3}))?\??$/);
  if (m){ coinRaw = m[1]; if (m[2]) vsRaw = m[2]; }
  if (!coinRaw) return null;
  const skill = await _loadSkill('crypto');
  if (!skill || typeof skill.getPrice !== 'function') return null;
  const coinId = skill.resolveCoinId(coinRaw);
  if (!coinId) return null;
  if (skill.SUPPORTED_FIAT.indexOf(vsRaw) < 0) vsRaw = 'usd';
  const data = await skill.getPrice(coinRaw, vsRaw);
  if (!data) return null;
  const fmtPrice = (n) => {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
  };
  const k = (n) => {
    if (!n) return '—';
    if (n >= 1e12) return (n/1e12).toFixed(2)+'T';
    if (n >= 1e9) return (n/1e9).toFixed(2)+'B';
    if (n >= 1e6) return (n/1e6).toFixed(2)+'M';
    if (n >= 1e3) return (n/1e3).toFixed(2)+'k';
    return n.toFixed(2);
  };
  const ch = data.change24h || 0;
  const chColor = ch >= 0 ? '#16a34a' : '#dc2626';
  const arrow = ch >= 0 ? '▲' : '▼';
  const sym = ({usd:'$',eur:'€',gbp:'£',jpy:'¥'})[vsRaw] || '';
  const coinDisplay = coinId.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  const toolLink = 'https://oioxo.com/datatools/crypto-price?coin=' + encodeURIComponent(coinRaw) + '&fiat=' + encodeURIComponent(vsRaw);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">₿ ${esc(coinDisplay)} · ${esc(vsRaw.toUpperCase())}</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">
      <div style="font-size:30px;font-weight:800;line-height:1;color:var(--ink)">${esc(sym)}${esc(fmtPrice(data.price))}</div>
      <div style="font-size:13px;font-weight:700;color:${chColor}">${arrow} ${Math.abs(ch).toFixed(2)}%</div>
    </div>
    <div style="display:flex;gap:6px;font-size:10px;color:var(--muted);margin-bottom:8px">
      <div style="flex:1;padding:5px 8px;background:var(--surface);border-radius:4px">24h vol<br><b style="color:var(--ink);font-size:12px">${esc(sym + k(data.vol24h))}</b></div>
      <div style="flex:1;padding:5px 8px;background:var(--surface);border-radius:4px">Market cap<br><b style="color:var(--ink);font-size:12px">${esc(sym + k(data.marketCap))}</b></div>
    </div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/crypto-price</div>`;
  return { kind: 'crypto', title: 'Crypto price', html, priority: 99 };
}

// =============================================================================
// PR292 (MIGRATED) — WEATHER NOW. Now driven by the shared skill module
// `oioxoSkills.weather` (lazy-loaded from /skills/weather.js, mirror of
// lib/skills/weather.ts which also powers app/datatools/weather). Inline
// preview unchanged; footer adds "Open full tool →" deep-link to the
// xonvert tool page so deeper looks have a home.
function _loadSkill(name){
  if (window.oioxoSkills && window.oioxoSkills[name]) return Promise.resolve(window.oioxoSkills[name]);
  // Protected path: if /loader.js is live, route through the ECDHE-gated unlock
  // (same lock as /api/tool-key). Cross-origin clones get a 403 → null. The
  // plaintext fallback below only fires when the loader isn't present (dev /
  // pre-encryption deploys).
  if (window.oioxoLoader && typeof window.oioxoLoader.getSkill === 'function'){
    _enginePromises['__skill__' + name] = _enginePromises['__skill__' + name]
      || window.oioxoLoader.getSkill(name).catch(() => null);
    return _enginePromises['__skill__' + name];
  }
  _enginePromises['__skill__' + name] = _enginePromises['__skill__' + name] || new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = '/skills/' + name + '.js';
    s.async = true;
    s.onload = () => resolve((window.oioxoSkills && window.oioxoSkills[name]) || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _enginePromises['__skill__' + name];
}
async function iaWeather(rawQ){
  if (!rawQ || rawQ.length < 4 || rawQ.length > 60) return null;
  const q = rawQ.trim().toLowerCase();
  let city = null;
  let m = q.match(/^(?:weather|forecast|temperature|temp)\s+(?:in|at|for)\s+([a-z .'\-]{2,40})\??$/);
  if (m) city = m[1].trim();
  else { m = q.match(/^([a-z .'\-]{2,40})\s+(?:weather|forecast|temperature|temp)\??$/); if (m) city = m[1].trim(); }
  if (!city) return null;
  const skill = await _loadSkill('weather');
  if (!skill || typeof skill.getWeather !== 'function') return null;
  const data = await skill.getWeather(city);
  if (!data) return null;
  const [icon, label] = skill.describeWMO(data.cur.weather_code);
  const temp = Math.round(data.cur.temperature_2m);
  const feels = Math.round(data.cur.apparent_temperature);
  const hi = data.daily && data.daily.temperature_2m_max ? Math.round(data.daily.temperature_2m_max[0]) : null;
  const lo = data.daily && data.daily.temperature_2m_min ? Math.round(data.daily.temperature_2m_min[0]) : null;
  const wind = Math.round(data.cur.wind_speed_10m);
  const hum = Math.round(data.cur.relative_humidity_2m);
  const toolLink = 'https://oioxo.com/datatools/weather?city=' + encodeURIComponent(city);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">${esc(icon)} Weather · ${esc(data.geo.name)}${data.geo.country?', '+esc(data.geo.country):''}</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
      <div style="font-size:48px;line-height:1;flex-shrink:0">${esc(icon)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:32px;font-weight:800;line-height:1;color:var(--ink)">${temp}°C</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">${esc(label)} · feels ${feels}°</div>
      </div>
    </div>
    <div style="display:flex;gap:6px;font-size:10px;color:var(--muted);margin-bottom:8px">
      ${hi !== null ? `<div style="flex:1;padding:5px 8px;background:var(--surface);border-radius:4px">High / Low<br><b style="color:var(--ink);font-size:12px">${hi}° / ${lo}°</b></div>` : ''}
      <div style="flex:1;padding:5px 8px;background:var(--surface);border-radius:4px">Wind<br><b style="color:var(--ink);font-size:12px">${wind} km/h</b></div>
      <div style="flex:1;padding:5px 8px;background:var(--surface);border-radius:4px">Humidity<br><b style="color:var(--ink);font-size:12px">${hum}%</b></div>
    </div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/weather</div>`;
  return { kind: 'weather', title: 'Weather', html, priority: 99 };
}

// =============================================================================
// PR293 — RANDOM / DICE / PICK. "roll a die" / "roll 2d6" / "flip a coin" /
// "random number 1 to 100" / "pick from a, b, c, d" — pure on-device, runs
// crypto-secure where available. A tiny utility no general search engine
// ships natively (Google has a die widget but no batch rolls, no pick-from).
async function iaRandom(rawQ){
  if (!rawQ || rawQ.length < 4 || rawQ.length > 200) return null;
  const q = rawQ.trim().toLowerCase();
  const eng = await _loadEngine('random');
  if (!eng) return null;
  const toolLink = 'https://oioxo.com/generators/random-data?q=' + encodeURIComponent(rawQ.trim());
  const chip = '<span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>';
  const openBtn = `<a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a><div style="margin-top:6px;font-size:10px;color:var(--muted)">Cryptographically random · same engine as oioxo.com/generators/random-data</div>`;
  let m;
  m = q.match(/^(?:flip|toss)\s+(?:a\s+)?coin\??$/);
  if (m){
    const face = eng.flip();
    const icon = face === 'Heads' ? '👑' : '🪙';
    const html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;color:var(--muted)">🪙 Coin flip</span>${chip}</div>
      <div style="display:flex;align-items:center;gap:14px"><div style="font-size:48px">${icon}</div><div style="font-size:32px;font-weight:800;color:var(--ink)">${esc(face)}</div></div>${openBtn}`;
    return { kind: 'random', title: 'Coin flip', html, priority: 99 };
  }
  m = q.match(/^roll\s+(?:a\s+)?(?:(\d+)\s*d\s*(\d+)|die|dice|d(\d+))\??$/);
  if (m){
    const count = m[1] ? parseInt(m[1], 10) : 1;
    const sides = m[2] ? parseInt(m[2], 10) : (m[3] ? parseInt(m[3], 10) : 6);
    const result = eng.roll(count, sides);
    if (!result) return null;
    const html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;color:var(--muted)">🎲 ${result.count}d${result.sides}</span>${chip}</div>
      <div style="font-size:36px;font-weight:800;color:var(--ink);line-height:1;margin-bottom:8px">${result.total}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${result.rolls.map(r => `<span style="display:inline-block;min-width:32px;text-align:center;padding:6px 10px;background:var(--surface);border-radius:4px;font-weight:700;font-size:14px;color:var(--ink)">${r}</span>`).join('')}</div>${openBtn}`;
    return { kind: 'random', title: 'Dice roll', html, priority: 99 };
  }
  m = q.match(/^random(?:\s+(?:integer|int|number))?\s+(?:from\s+)?(-?\d+)\s*(?:to|-|–)\s*(-?\d+)\??$/);
  if (m){
    const r = eng.between(parseInt(m[1],10), parseInt(m[2],10));
    if (r === null) return null;
    const a = Math.min(parseInt(m[1],10), parseInt(m[2],10));
    const b = Math.max(parseInt(m[1],10), parseInt(m[2],10));
    const html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;color:var(--muted)">🎯 Random ${a}–${b}</span>${chip}</div>
      <div style="font-size:48px;font-weight:800;color:var(--ink);line-height:1">${r}</div>${openBtn}`;
    return { kind: 'random', title: 'Random', html, priority: 99 };
  }
  m = q.match(/^(?:pick|choose|select)\s+(?:one\s+)?(?:from\s+)?(.+)$/);
  if (m){
    const items = m[1].split(/\s*(?:,|\bor\b)\s*/).map(s => s.trim().replace(/[?.!]+$/,'')).filter(s => s.length >= 1 && s.length <= 80);
    if (items.length < 2 || items.length > 30) return null;
    const choice = eng.pick(items);
    if (!choice) return null;
    const html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;color:var(--muted)">🎰 Picked from ${items.length}</span>${chip}</div>
      <div style="font-size:26px;font-weight:800;color:var(--ink);line-height:1.2;margin-bottom:8px">${esc(choice)}</div>
      <div style="font-size:11px;color:var(--muted)">Other options: ${items.filter(x=>x!==choice).slice(0,5).map(esc).join(', ')}${items.length>6?', …':''}</div>${openBtn}`;
    return { kind: 'random', title: 'Picked', html, priority: 99 };
  }
  return null;
}

// =============================================================================
// PR294 — ASTRONOMY CARD. "sunrise in tokyo", "moon phase today", "sunset
// paris". Sunrise/sunset come from Open-Meteo daily endpoint; moon phase is
// computed on-device from a Meeus synodic-month algorithm (29.53059d cycle,
// reference new moon 2000-01-06). Renders ☀ sunrise + 🌇 sunset + day-length
// + moon phase icon + illumination %. CORS-open, no key.
async function iaAstro(rawQ){
  if (!rawQ || rawQ.length < 4 || rawQ.length > 60) return null;
  const q = rawQ.trim().toLowerCase();
  // Moon-phase only — on-device engine, no city needed
  if (/^(?:moon\s+phase|current\s+moon|phase\s+of\s+(?:the\s+)?moon|moon\s+today)\??$/.test(q)){
    const eng = await _loadEngine('moon');
    if (!eng) return null;
    const mp = eng.phase();
    const html = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:11px;color:var(--muted)">${esc(mp.icon)} Moon phase</span>
        <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px">
        <div style="font-size:56px;line-height:1">${esc(mp.icon)}</div>
        <div style="flex:1">
          <div style="font-size:22px;font-weight:800;line-height:1;color:var(--ink)">${esc(mp.name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">${mp.illum}% illuminated · day ${mp.age.toFixed(1)} of 29.5</div>
        </div>
      </div>
      <a href="https://oioxo.com/datatools/astronomy" target="_blank" rel="noopener" style="display:inline-block;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
      <div style="margin-top:6px;font-size:10px;color:var(--muted)">Computed on-device · same engine as oioxo.com/datatools/astronomy</div>`;
    return { kind: 'astro', title: 'Moon phase', html, priority: 99 };
  }
  // Sunrise/sunset for a city
  let city = null;
  let m = q.match(/^(?:sunrise|sunset|sun\s+(?:rise|set)|daylight|day\s+length)\s+(?:in|at|for)\s+([a-z .'\-]{2,40})\??$/);
  if (m) city = m[1].trim();
  if (!city){ m = q.match(/^([a-z .'\-]{2,40})\s+(?:sunrise|sunset|daylight)\??$/); if (m) city = m[1].trim(); }
  if (!city) return null;
  const skill = await _loadSkill('astro');
  if (!skill || typeof skill.getAstro !== 'function') return null;
  const data = await skill.getAstro(city);
  if (!data) return null;
  const moonEng = await _loadEngine('moon');
  const mp = moonEng ? moonEng.phase() : null;
  const t = (iso) => iso ? iso.slice(11, 16) : '—';
  const hours = Math.floor(data.daylight / 3600);
  const mins = Math.floor((data.daylight % 3600) / 60);
  const toolLink = 'https://oioxo.com/datatools/astronomy?city=' + encodeURIComponent(city);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🌅 Today · ${esc(data.geo.name)}${data.geo.country?', '+esc(data.geo.country):''}</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <div style="flex:1;padding:9px 11px;background:var(--surface);border-radius:5px;text-align:center"><div style="font-size:11px;color:var(--muted);margin-bottom:3px">☀ Sunrise</div><div style="font-size:18px;font-weight:800;color:var(--ink)">${esc(t(data.sunrise))}</div></div>
      <div style="flex:1;padding:9px 11px;background:var(--surface);border-radius:5px;text-align:center"><div style="font-size:11px;color:var(--muted);margin-bottom:3px">🌇 Sunset</div><div style="font-size:18px;font-weight:800;color:var(--ink)">${esc(t(data.sunset))}</div></div>
    </div>
    ${mp ? `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 11px;background:var(--surface);border-radius:5px">
        <span style="font-size:24px">${esc(mp.icon)}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--ink)">${esc(mp.name)} · ${mp.illum}%</div>
          <div style="font-size:10px;color:var(--muted)">Daylight today: ${hours}h ${mins}m</div>
        </div>
      </div>
    ` : ''}
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill+engine as oioxo.com/datatools/astronomy</div>`;
  return { kind: 'astro', title: 'Astronomy', html, priority: 80 };
}

// =============================================================================
// PR295 — REGEX TESTER. Detect "/pattern/flags" followed by a test string,
// or "regex X test Y". Compiles the pattern in a try/catch (rejecting
// malformed regex), runs .matchAll, renders the test string with matches
// highlighted in gold plus a list of captured groups per match.
async function iaRegexTester(rawQ){
  if (!rawQ || rawQ.length < 6 || rawQ.length > 300) return null;
  const eng = await _loadEngine('regex');
  if (!eng || typeof eng.parsePattern !== 'function') return null;
  const parsed = eng.parsePattern(rawQ);
  if (!parsed) return null;
  const result = eng.test(parsed);
  if (!result || result.compileError) return null;
  // Highlight matches in the subject
  let highlighted = '';
  let last = 0;
  for (const mm of result.matches){
    highlighted += esc(result.subject.slice(last, mm.index));
    highlighted += `<mark style="background:var(--accent);color:var(--ink);padding:1px 3px;border-radius:2px;font-weight:700">${esc(mm.match)}</mark>`;
    last = mm.index + mm.match.length;
  }
  highlighted += esc(result.subject.slice(last));
  const verdict = result.matches.length === 0
    ? `<span style="color:#dc2626;font-weight:700">No matches</span>`
    : `<span style="color:#16a34a;font-weight:700">${result.matches.length} match${result.matches.length===1?'':'es'}</span>`;
  const groupsHtml = result.matches.slice(0, 6).map((mm, i) => {
    if (!mm.groups || !mm.groups.length) return '';
    const groups = mm.groups.map((g, gi) => `<code style="font-size:10px;background:var(--surface);padding:1px 5px;border-radius:3px">$${gi+1}=${esc(String(g===null?'(none)':g))}</code>`).join(' ');
    return `<div style="font-size:11px;color:var(--muted);line-height:1.6">match ${i+1}: ${groups}</div>`;
  }).join('');
  const toolLink = 'https://oioxo.com/devtools/regex-tester?pattern=' + encodeURIComponent(parsed.pattern) + '&flags=' + encodeURIComponent(parsed.flags) + '&test=' + encodeURIComponent(parsed.test);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🔍 Regex test</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="font-size:11px;color:var(--muted);font-family:'SF Mono',Menlo,Consolas,monospace;margin-bottom:4px">/${esc(parsed.pattern)}/${esc(parsed.flags)}</div>
    <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.7;padding:9px 11px;background:var(--surface);border-radius:5px;word-break:break-all;margin-bottom:8px">${highlighted}</div>
    <div style="font-size:12px;margin-bottom:6px">${verdict}</div>
    ${groupsHtml}
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">JavaScript-flavor regex · same engine as oioxo.com/devtools/regex-tester</div>`;
  return { kind: 'regex-tester', title: 'Regex test', html, priority: 99 };
}

// =============================================================================
// PR296 — AIR QUALITY CARD. "air quality in delhi", "aqi tokyo", "pollution
// london". Reuses Open-Meteo geocoding then the air-quality endpoint
// (CORS-open, no key) for European AQI, PM2.5, PM10, O3, NO2. Colored AQI
// chip + breakdown bars. Cached 30min per city.
async function iaAirQuality(rawQ){
  if (!rawQ || rawQ.length < 4 || rawQ.length > 60) return null;
  const q = rawQ.trim().toLowerCase();
  let city = null;
  let m = q.match(/^(?:air\s+quality|aqi|pollution|air\s+pollution|smog)\s+(?:in|at|for)\s+([a-z .'\-]{2,40})\??$/);
  if (m) city = m[1].trim();
  if (!city){ m = q.match(/^([a-z .'\-]{2,40})\s+(?:air\s+quality|aqi|pollution|smog)\??$/); if (m) city = m[1].trim(); }
  if (!city) return null;
  const skill = await _loadSkill('airquality');
  if (!skill || typeof skill.getAirQuality !== 'function') return null;
  const data = await skill.getAirQuality(city);
  if (!data) return null;
  const aqi = Math.round(data.cur.european_aqi || 0);
  const verdict = skill.describeAqi(aqi);
  const toolLink = 'https://oioxo.com/datatools/air-quality?city=' + encodeURIComponent(city);
  const bar = (val, max, label, unit) => {
    const pct = Math.min(100, (val / max) * 100);
    const color = pct < 33 ? '#16a34a' : pct < 66 ? '#ca8a04' : '#dc2626';
    return `<div style="margin-bottom:5px">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:2px"><span>${esc(label)}</span><span><b style="color:var(--ink)">${val.toFixed(1)}</b> ${esc(unit)}</span></div>
      <div style="height:5px;background:var(--surface);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct.toFixed(1)}%;background:${color}"></div></div>
    </div>`;
  };
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🌫 Air quality · ${esc(data.geo.name)}${data.geo.country?', '+esc(data.geo.country):''}</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
      <div style="width:84px;height:84px;border-radius:50%;background:${verdict.color};display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;flex-shrink:0">
        <div style="font-size:28px;font-weight:800;line-height:1">${aqi}</div>
        <div style="font-size:9px;font-weight:700;opacity:.85">EAQI</div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:18px;font-weight:800;color:${verdict.color};line-height:1.1">${esc(verdict.label)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.4">${esc(verdict.advice)}</div>
      </div>
    </div>
    ${bar(data.cur.pm2_5 || 0, 60, 'PM2.5', 'µg/m³')}
    ${bar(data.cur.pm10 || 0, 100, 'PM10', 'µg/m³')}
    ${bar(data.cur.ozone || 0, 200, 'Ozone (O₃)', 'µg/m³')}
    ${bar(data.cur.nitrogen_dioxide || 0, 200, 'NO₂', 'µg/m³')}
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/air-quality · European AQI scale</div>`;
  return { kind: 'air-quality', title: 'Air quality', html, priority: 90 };
}

// =============================================================================
// PR297 — HOLIDAY CALENDAR. "holidays in japan", "us holidays 2026", "next
// holiday france". Pulls from Nager.Date REST (date.nager.at, CORS-open, no
// key) which covers public holidays for ~100 countries. Renders the next 5
// upcoming holidays + days-until each. Cached 24h per country.
// PR297 (MIGRATED) — now driven by `oioxoSkills.holidays` (mirror of
// lib/skills/holidays.ts, also powering app/datatools/holidays). Same
// inline preview; gold OIOXO TOOL chip + deep-link to the tool page.
async function iaHolidays(rawQ){
  if (!rawQ || rawQ.length < 6 || rawQ.length > 60) return null;
  const q = rawQ.trim().toLowerCase();
  let country = null, year = new Date().getFullYear();
  let m = q.match(/^(?:public\s+)?holidays?\s+(?:in|of|for)\s+([a-z .'\-]{2,30})(?:\s+(20\d{2}))?\??$/);
  if (m){ country = m[1].trim(); if (m[2]) year = parseInt(m[2], 10); }
  if (!country){ m = q.match(/^([a-z .'\-]{2,30})\s+(?:public\s+)?holidays(?:\s+(20\d{2}))?\??$/); if (m){ country = m[1].trim(); if (m[2]) year = parseInt(m[2], 10); } }
  if (!country){ m = q.match(/^next\s+holiday\s+(?:in\s+)?([a-z .'\-]{2,30})\??$/); if (m) country = m[1].trim(); }
  if (!country) return null;
  const skill = await _loadSkill('holidays');
  if (!skill || typeof skill.getHolidays !== 'function') return null;
  const data = await skill.getHolidays(country, year);
  if (!data) return null;
  const today = new Date(); today.setUTCHours(0,0,0,0);
  let upcoming = data.upcoming.map(h => ({ ...h, dt: new Date(h.date + 'T00:00:00Z') }));
  if (!upcoming.length){
    upcoming = data.holidays.slice(0,5).map(h => ({ ...h, dt: new Date(h.date + 'T00:00:00Z') }));
  }
  const countryTitle = data.country.replace(/\b\w/g, c => c.toUpperCase());
  const toolLink = 'https://oioxo.com/datatools/holidays?country=' + encodeURIComponent(country) + '&year=' + data.year;
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🎉 Upcoming holidays · ${esc(countryTitle)} ${data.year}</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${upcoming.map(h => {
        const days = Math.round((h.dt - today) / 86400000);
        const dateStr = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(h.dt);
        const inLabel = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 0 ? `in ${days}d` : `${Math.abs(days)}d ago`;
        const accent = days >= 0 && days <= 7 ? 'var(--accent)' : 'var(--muted)';
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:var(--surface);border-radius:5px">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;color:var(--ink);line-height:1.2">${esc(h.localName)}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:1px">${esc(dateStr)}${h.global===false?' · regional':''}</div>
          </div>
          <span style="font-size:10px;font-weight:700;color:${accent};white-space:nowrap">${inLabel}</span>
        </div>`;
      }).join('')}
    </div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/holidays · ${data.holidays.length} this year</div>`;
  return { kind: 'holidays', title: 'Holidays', html, priority: 75 };
}

// =============================================================================
// PR299 — COUNTRY PROFILE. Single-word country queries ("japan", "france",
// "australia") pull from restcountries.com /name/X (CORS-open, no key) and
// render flag + capital + currency + population + area + driving side +
// languages + calling code. Curated stop-list against obvious non-country
// short queries.
async function iaCountry(rawQ){
  if (!rawQ || rawQ.length < 3 || rawQ.length > 30) return null;
  const q = rawQ.trim().toLowerCase();
  if (!/^[a-z]+(?:\s+[a-z]+)?$/.test(q)) return null;
  // Block obvious non-country short words
  if (/^(the|and|for|but|not|all|any|new|old|big|red|sun|moon|map|web|app|home|news|video|music|game|food|tools|test)$/i.test(q)) return null;
  const skill = await _loadSkill('country');
  if (!skill || typeof skill.getCountry !== 'function') return null;
  const data = await skill.getCountry(q);
  if (!data) return null;
  const toolLink = 'https://oioxo.com/datatools/country-profile?country=' + encodeURIComponent(q);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🗺 Country profile</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      <div style="font-size:42px;line-height:1;flex-shrink:0">${esc(data.flag)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:18px;font-weight:800;color:var(--ink);line-height:1.2">${esc(data.name.common)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(data.name.official)}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px">
      <div style="padding:7px 9px;background:var(--surface);border-radius:4px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Capital</div><div style="color:var(--ink);font-weight:700">${esc(data.capital)}</div></div>
      <div style="padding:7px 9px;background:var(--surface);border-radius:4px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Population</div><div style="color:var(--ink);font-weight:700">${esc(data.population)}</div></div>
      <div style="padding:7px 9px;background:var(--surface);border-radius:4px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Area</div><div style="color:var(--ink);font-weight:700">${esc(data.area)}</div></div>
      <div style="padding:7px 9px;background:var(--surface);border-radius:4px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Currency</div><div style="color:var(--ink);font-weight:700">${esc(data.currencies)}</div></div>
      <div style="padding:7px 9px;background:var(--surface);border-radius:4px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Languages</div><div style="color:var(--ink);font-weight:700">${esc(data.languages)}</div></div>
      <div style="padding:7px 9px;background:var(--surface);border-radius:4px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Region</div><div style="color:var(--ink);font-weight:700">${esc(data.region)}</div></div>
      ${data.callingCode ? `<div style="padding:7px 9px;background:var(--surface);border-radius:4px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Calling code</div><div style="color:var(--ink);font-weight:700">${esc(data.callingCode)}</div></div>` : ''}
      ${data.drivingSide ? `<div style="padding:7px 9px;background:var(--surface);border-radius:4px"><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Driving side</div><div style="color:var(--ink);font-weight:700">${esc(data.drivingSide)}</div></div>` : ''}
    </div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/country-profile</div>`;
  return { kind: 'country', title: 'Country', html, priority: 85 };
}

// =============================================================================
// PR300 — TRANSLATE CARD. "translate hello to spanish", "hello in french",
// "say goodbye in japanese". Hits MyMemory (api.mymemory.translated.net,
// CORS-open, no key, ~5000 words/day anonymous). Curated language-name → ISO
// code map for the top 35 languages. Renders source + translation big +
// quality match score. Cached 24h per pair.
async function iaTranslate(rawQ){
  if (!rawQ || rawQ.length < 8 || rawQ.length > 200) return null;
  const skill = await _loadSkill('translate');
  if (!skill || typeof skill.translate !== 'function') return null;
  let source = null, target = null;
  let m = rawQ.match(/^translate\s+(?:"([^"]+)"|'([^']+)'|(.+?))\s+(?:to|into)\s+([a-z]+)\??$/i);
  if (m){ source = (m[1]||m[2]||m[3]).trim(); target = m[4].toLowerCase(); }
  if (!source){
    m = rawQ.match(/^(?:how\s+do\s+you\s+say\s+|how\s+to\s+say\s+|say\s+)?(?:"([^"]+)"|'([^']+)'|(.+?))\s+in\s+([a-z]+)\??$/i);
    if (m){ source = (m[1]||m[2]||m[3]).trim(); target = m[4].toLowerCase(); }
  }
  if (!source || !target) return null;
  const data = await skill.translate(source, target);
  if (!data) return null;
  const langName = (code) => (skill.LANG_NAMES && skill.LANG_NAMES[code]) || code;
  const fromName = langName(data.from), toName = langName(data.to);
  const matchPct = Math.round((data.match || 0) * 100);
  const toolLink = 'https://oioxo.com/texttools/translate?text=' + encodeURIComponent(source) + '&from=' + encodeURIComponent(data.from) + '&to=' + encodeURIComponent(data.to);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🌐 ${esc(fromName)} → ${esc(toName)}</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="padding:9px 11px;background:var(--surface);border-radius:5px;margin-bottom:6px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px">${esc(data.from.toUpperCase())}</div>
      <div style="font-size:14px;color:var(--ink);line-height:1.4" dir="auto">${esc(data.source)}</div>
    </div>
    <div style="padding:9px 11px;background:var(--accent);border-radius:5px;margin-bottom:6px">
      <div style="font-size:11px;color:var(--ink);opacity:.7;margin-bottom:3px">${esc(data.to.toUpperCase())}</div>
      <div style="font-size:18px;font-weight:700;color:var(--ink);line-height:1.4" dir="auto">${esc(data.translation)}</div>
    </div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/texttools/translate · match ${matchPct}%</div>`;
  return { kind: 'translate', title: 'Translation', html, priority: 99 };
}

// =============================================================================
// PR301 — WORD RELATIONS. "rhymes with X", "synonyms of X", "antonyms of X",
// "words like X", "anagrams of X". Hits api.datamuse.com (CORS-open, no key,
// no limits). For anagrams uses the *=X spelled-like query with length match.
// Renders up to 20 results as compact word chips.
async function iaWordRelations(rawQ){
  if (!rawQ || rawQ.length < 6 || rawQ.length > 60) return null;
  const q = rawQ.trim().toLowerCase();
  let mode = null, word = null;
  let m = q.match(/^(?:words?\s+that\s+)?rhyme(?:s)?\s+with\s+([a-z'\-]{2,30})\??$/);
  if (m){ mode = 'rhy'; word = m[1]; }
  if (!mode){ m = q.match(/^synonyms?\s+(?:of|for)\s+([a-z'\-]{2,30})\??$/); if (m){ mode = 'syn'; word = m[1]; } }
  if (!mode){ m = q.match(/^antonyms?\s+(?:of|for)\s+([a-z'\-]{2,30})\??$/); if (m){ mode = 'ant'; word = m[1]; } }
  if (!mode){ m = q.match(/^words?\s+like\s+([a-z'\-]{2,30})\??$/); if (m){ mode = 'ml'; word = m[1]; } }
  if (!mode){ m = q.match(/^words?\s+(?:starting|beginning)\s+with\s+([a-z'\-]{2,15})\??$/); if (m){ mode = 'sp_start'; word = m[1]; } }
  if (!mode){ m = q.match(/^words?\s+(?:ending|ending\s+in|that\s+end\s+(?:with|in))\s+([a-z'\-]{2,15})\??$/); if (m){ mode = 'sp_end'; word = m[1]; } }
  if (!mode){ m = q.match(/^words?\s+(?:containing|with)\s+([a-z'\-]{2,15})\??$/); if (m){ mode = 'sp_contain'; word = m[1]; } }
  if (!mode){ m = q.match(/^anagrams?\s+(?:of|for)\s+([a-z]{3,15})\??$/); if (m){ mode = 'ana'; word = m[1]; } }
  if (!mode){ m = q.match(/^homophones?\s+(?:of|for)\s+([a-z'\-]{2,20})\??$/); if (m){ mode = 'hom'; word = m[1]; } }
  if (!mode || !word) return null;
  const skill = await _loadSkill('wordrel');
  if (!skill || typeof skill.lookup !== 'function') return null;
  const result = await skill.lookup(mode, word, { limit: 20 });
  if (!result) return null;
  const toolLink = 'https://oioxo.com/texttools/word-relations?word=' + encodeURIComponent(word) + '&mode=' + encodeURIComponent(mode);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">${esc(result.icon)} ${esc(result.label)}</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px">
      ${result.words.map(w => `<span style="display:inline-block;padding:5px 10px;background:var(--surface);border:1px solid var(--border);border-radius:14px;font-size:12px;color:var(--ink);font-weight:600">${esc(w)}</span>`).join('')}
    </div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/texttools/word-relations · ${result.words.length} results</div>`;
  return { kind: 'word-rel', title: 'Word relations', html, priority: 99 };
}

// =============================================================================
// PR302 — LYRICS FINDER. Detect "lyrics of X by Y" or "song X by Y lyrics".
// Hits api.lyrics.ovh (free, no key, CORS-open). Renders the full lyrics in
// a scrollable monospace panel with artist/song header. Single track only —
// search and disambiguation stay to the rest of the SERP.
async function iaLyrics(rawQ){
  if (!rawQ || rawQ.length < 10 || rawQ.length > 120) return null;
  const q = rawQ.trim();
  let artist = null, song = null;
  let m = q.match(/^lyrics\s+(?:of\s+|to\s+|for\s+)?(?:"([^"]+)"|'([^']+)'|(.+?))\s+by\s+(.+?)\??$/i);
  if (m){ song = (m[1]||m[2]||m[3]).trim(); artist = m[4].trim(); }
  if (!song){
    m = q.match(/^(?:"([^"]+)"|'([^']+)'|(.+?))\s+by\s+(.+?)\s+lyrics\??$/i);
    if (m){ song = (m[1]||m[2]||m[3]).trim(); artist = m[4].trim(); }
  }
  if (!song || !artist) return null;
  const skill = await _loadSkill('lyrics');
  if (!skill || typeof skill.getLyrics !== 'function') return null;
  const data = await skill.getLyrics(artist, song);
  if (!data) return null;
  const toolLink = 'https://oioxo.com/datatools/lyrics?artist=' + encodeURIComponent(artist) + '&title=' + encodeURIComponent(song);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🎶 Lyrics</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:2px">${esc(data.title)}</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px">by ${esc(data.artist)}</div>
    <div style="font-size:12px;line-height:1.7;color:var(--ink);white-space:pre-wrap;max-height:340px;overflow-y:auto;padding:10px 12px;background:var(--surface);border-radius:5px;font-family:Georgia,'Times New Roman',serif">${esc(data.lyrics)}</div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/lyrics · cached 30d</div>`;
  return { kind: 'lyrics', title: 'Lyrics', html, priority: 98 };
}

// =============================================================================
// PR303 — RECIPE CARD. "recipe for carbonara", "how to make miso soup",
// "pad thai recipe". Hits TheMealDB (CORS-open, free public key "1") for the
// top match, renders the dish photo + ingredient grid + collapsible step
// list + cuisine/category chips. Cached 7d per query.
async function iaRecipe(rawQ){
  if (!rawQ || rawQ.length < 6 || rawQ.length > 80) return null;
  const q = rawQ.trim();
  let dish = null;
  let m = q.match(/^(?:recipe\s+for\s+|how\s+(?:do\s+i\s+|to)\s+(?:make|cook)\s+|how\s+(?:do\s+i\s+|to)\s+bake\s+)(.+?)\??$/i);
  if (m) dish = m[1].trim();
  if (!dish){ m = q.match(/^(.+?)\s+recipe\??$/i); if (m) dish = m[1].trim(); }
  if (!dish || dish.length < 3 || dish.length > 50) return null;
  const skill = await _loadSkill('recipe');
  if (!skill || typeof skill.searchRecipe !== 'function') return null;
  const data = await skill.searchRecipe(dish);
  if (!data) return null;
  const stepsHtml = data.steps.slice(0, 12).map(s => `<li style="margin-bottom:5px">${esc(s.slice(0, 320))}</li>`).join('');
  const toolLink = 'https://oioxo.com/datatools/recipe?dish=' + encodeURIComponent(dish);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🍽 Recipe</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      ${data.thumb ? `<img src="${esc(data.thumb)}" alt="" referrerpolicy="no-referrer" loading="lazy" style="width:72px;height:72px;border-radius:8px;object-fit:cover;flex-shrink:0">` : ''}
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800;color:var(--ink);line-height:1.2">${esc(data.name)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">
          ${data.area ? `<span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">${esc(data.area)}</span>` : ''}
          ${data.category ? `<span style="font-size:9px;background:var(--surface);color:var(--muted);padding:2px 7px;border-radius:8px;font-weight:600">${esc(data.category)}</span>` : ''}
        </div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Ingredients · ${data.ingredients.length}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;margin-bottom:10px">
      ${data.ingredients.map(it => `<div style="font-size:11px;color:var(--ink);line-height:1.4">${esc(it.measure?it.measure+' ':'')}<span style="color:var(--muted)">${esc(it.ingredient)}</span></div>`).join('')}
    </div>
    <details>
      <summary style="cursor:pointer;font-size:11px;font-weight:700;color:var(--accent);padding:4px 0">Steps · ${data.steps.length}</summary>
      <ol style="margin:6px 0 0 0;padding-left:22px;font-size:12px;line-height:1.55;color:var(--ink)">${stepsHtml}</ol>
    </details>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/recipe</div>`;
  return { kind: 'recipe', title: 'Recipe', html, priority: 95 };
}

// =============================================================================
// PR304 — BOOK CARD. "book harry potter", "harry potter book", "book by
// author X", or quoted title. Hits OpenLibrary search.json (CORS-open, no
// key) for the top match — cover, author, year, subjects, ratings, edition
// count. Cover loaded direct from covers.openlibrary.org. Cached 7d.
async function iaBook(rawQ){
  if (!rawQ || rawQ.length < 5 || rawQ.length > 80) return null;
  const q = rawQ.trim();
  let title = null;
  let m = q.match(/^(?:book\s+(?:title\s+)?|the\s+book\s+)["'`]?(.+?)["'`]?\??$/i);
  if (m) title = m[1].trim();
  if (!title){ m = q.match(/^["'`]?(.+?)["'`]?\s+book\??$/i); if (m) title = m[1].trim(); }
  if (!title){ m = q.match(/^["'`]?(.+?)["'`]?\s+by\s+([a-z .\-]{2,40})\s+book\??$/i); if (m) title = m[1].trim() + ' ' + m[2].trim(); }
  if (!title || title.length < 3 || title.length > 70) return null;
  if (/^(amazon|kindle|ebook|pdf|recipe)/i.test(title)) return null;
  const skill = await _loadSkill('book');
  if (!skill || typeof skill.searchBook !== 'function') return null;
  const data = await skill.searchBook(title);
  if (!data) return null;
  const toolLink = 'https://oioxo.com/datatools/book-lookup?q=' + encodeURIComponent(title);
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">📚 Book</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:10px">
      ${data.coverUrl ? `<img src="${esc(data.coverUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy" style="width:64px;height:96px;border-radius:4px;object-fit:cover;flex-shrink:0;background:var(--surface)">` : ''}
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800;color:var(--ink);line-height:1.25">${esc(data.title)}</div>
        ${data.authors.length ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">by ${esc(data.authors.join(', '))}</div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
          ${data.firstPublishYear ? `<span style="font-size:9px;background:var(--surface);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">First: ${data.firstPublishYear}</span>` : ''}
          ${data.editionCount ? `<span style="font-size:9px;background:var(--surface);color:var(--muted);padding:2px 7px;border-radius:8px">${data.editionCount} edition${data.editionCount===1?'':'s'}</span>` : ''}
          ${data.languages.length ? `<span style="font-size:9px;background:var(--surface);color:var(--muted);padding:2px 7px;border-radius:8px">${esc(data.languages.join(' · '))}</span>` : ''}
        </div>
      </div>
    </div>
    ${data.subjects.length ? `<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">Subjects</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
      ${data.subjects.slice(0,6).map(s => `<span style="font-size:10px;background:var(--surface);color:var(--ink);padding:3px 8px;border-radius:10px">${esc(s)}</span>`).join('')}
    </div>` : ''}
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/book-lookup</div>`;
  return { kind: 'book', title: 'Book', html, priority: 85 };
}

// =============================================================================
// PR305 — PERIODIC ELEMENT CARD. Single-word element name ("carbon", "gold",
// "tungsten"), element symbol ("Fe", "Au", "U"), or "element 12". Static
// 118-element table embedded inline — zero network, works offline. Renders
// big symbol tile + name + atomic number + mass + group/period + category
// color + first-ionization-energy and melting/boiling-point chips.
async function iaElement(rawQ){
  if (!rawQ || rawQ.length < 1 || rawQ.length > 30) return null;
  const eng = await _loadEngine('element');
  if (!eng || typeof eng.lookup !== 'function') return null;
  const el = eng.lookup(rawQ.trim());
  if (!el) return null;
  const color = eng.categoryColor(el.cat);
  const ip = el.ip != null ? el.ip + ' eV' : '—';
  const mp = el.mp != null ? el.mp + ' K' : '—';
  const bp = el.bp != null ? el.bp + ' K' : '—';
  const toolLink = 'https://oioxo.com/calculators/periodic-element?q=' + encodeURIComponent(rawQ.trim());
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">⚛ Periodic element</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:10px">
      <div style="width:96px;height:96px;background:${color};border-radius:8px;color:#fff;padding:6px 8px;display:flex;flex-direction:column;justify-content:space-between;flex-shrink:0;font-family:'SF Mono',Menlo,Consolas,monospace">
        <div style="font-size:11px;font-weight:700;opacity:.85">${el.num}</div>
        <div style="font-size:36px;font-weight:800;line-height:1;text-align:center">${esc(el.sym)}</div>
        <div style="font-size:10px;font-weight:700;opacity:.85;text-align:right">${el.mass}</div>
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between">
        <div>
          <div style="font-size:20px;font-weight:800;color:var(--ink);line-height:1.1">${esc(el.name)}</div>
          <div style="font-size:11px;color:${color};font-weight:700;margin-top:3px">${esc(el.cat)}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;font-size:9px">
          <span style="background:var(--surface);color:var(--ink);padding:2px 7px;border-radius:8px">Group ${esc(el.group||'—')}</span>
          <span style="background:var(--surface);color:var(--ink);padding:2px 7px;border-radius:8px">Period ${el.period}</span>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:10px;color:var(--muted)">
      <div style="padding:5px 8px;background:var(--surface);border-radius:4px"><div style="font-size:8px;text-transform:uppercase;letter-spacing:.3px">Melting</div><b style="color:var(--ink);font-size:11px">${esc(mp)}</b></div>
      <div style="padding:5px 8px;background:var(--surface);border-radius:4px"><div style="font-size:8px;text-transform:uppercase;letter-spacing:.3px">Boiling</div><b style="color:var(--ink);font-size:11px">${esc(bp)}</b></div>
      <div style="padding:5px 8px;background:var(--surface);border-radius:4px"><div style="font-size:8px;text-transform:uppercase;letter-spacing:.3px">Ionization</div><b style="color:var(--ink);font-size:11px">${esc(ip)}</b></div>
    </div>
    <a href="${esc(toolLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Computed on-device · same engine as oioxo.com/calculators/periodic-element</div>`;
  return { kind: 'element', title: 'Element', html, priority: 99 };
}


// =============================================================================
// PR306 — NASA APOD. "nasa picture today", "astronomy picture of the day",
// "apod". Hits api.nasa.gov/planetary/apod with the public DEMO_KEY
// (rate-limited but no signup, CORS-open). Renders today's space image +
// title + author + explanation. Falls back to embed for video APODs.
async function iaNasaApod(rawQ){
  if (!rawQ || rawQ.length < 4 || rawQ.length > 60) return null;
  const q = rawQ.trim().toLowerCase();
  if (!/^(?:nasa\s+(?:picture|image|photo)(?:\s+(?:of\s+the\s+day|today))?|(?:astronomy|astro)\s+(?:picture|image|photo)(?:\s+of\s+the\s+day)?|apod|nasa\s+apod|space\s+(?:picture|image|photo)\s+(?:of\s+the\s+day|today)?|picture\s+of\s+the\s+day)\??$/.test(q)) return null;
  const skill = await _loadSkill('nasa');
  if (!skill || typeof skill.getApod !== 'function') return null;
  const data = await skill.getApod();
  if (!data) return null;
  const mediaHtml = data.media_type === 'video'
    ? `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:6px;overflow:hidden;margin-bottom:10px;background:#000"><iframe src="${esc(data.url)}" allowfullscreen referrerpolicy="no-referrer" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0"></iframe></div>`
    : `<img src="${esc(data.url)}" alt="${esc(data.title)}" referrerpolicy="no-referrer" loading="lazy" style="width:100%;height:auto;max-height:280px;object-fit:cover;border-radius:6px;margin-bottom:10px;background:#000">`;
  const expl = (data.explanation || '').slice(0, 480) + ((data.explanation || '').length > 480 ? '…' : '');
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🪐 NASA · Astronomy Picture of the Day · ${esc(data.date||'')}</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    ${mediaHtml}
    <div style="font-size:14px;font-weight:800;color:var(--ink);line-height:1.3;margin-bottom:4px">${esc(data.title)}</div>
    ${data.copyright ? `<div style="font-size:10px;color:var(--muted);margin-bottom:6px">© ${esc(data.copyright.trim())}</div>` : ''}
    <div style="font-size:12px;line-height:1.55;color:var(--ink)">${esc(expl)}</div>
    ${data.hdurl ? `<a href="${esc(data.hdurl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:11px;color:var(--accent);font-weight:600;text-decoration:none">View HD →</a>` : ''}
    <a href="https://oioxo.com/datatools/nasa-apod" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;margin-left:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/datatools/nasa-apod</div>`;
  return { kind: 'apod', title: 'NASA APOD', html, priority: 99 };
}

// =============================================================================
// PR307 — HACKER NEWS TOP. "hn top", "hacker news today", "top hn stories",
// "tech news today". Hits hacker-news.firebaseio.com (CORS-open, no key)
// for top story IDs then fetches the first 6 in parallel. Renders score,
// title (links to URL or HN), domain, comment count, age. Cached 10min.
async function iaHnTop(rawQ){
  if (!rawQ || rawQ.length < 4 || rawQ.length > 50) return null;
  const q = rawQ.trim().toLowerCase();
  if (!/^(?:hn(?:\s+top)?|hacker\s*news(?:\s+(?:top|today))?|top\s+hn(?:\s+stories)?|top\s+hacker\s*news|tech\s+news(?:\s+today)?)\??$/.test(q)) return null;
  const skill = await _loadSkill('hn');
  if (!skill || typeof skill.getTopStories !== 'function') return null;
  const stories = await skill.getTopStories({ limit: 6 });
  if (!stories || !stories.length) return null;
  const ago = (ts) => { const d = Date.now()/1000 - ts; if (d < 3600) return Math.floor(d/60) + 'm'; if (d < 86400) return Math.floor(d/3600) + 'h'; return Math.floor(d/86400) + 'd'; };
  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🟠 Hacker News · top stories</span>
      <span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">OIOXO TOOL</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px">
      ${stories.map(s => {
        let host = '';
        try { if (s.url) host = new URL(s.url).hostname.replace(/^www\./,''); } catch {}
        const hnUrl = 'https://news.ycombinator.com/item?id=' + s.id;
        const titleUrl = s.url || hnUrl;
        return `<a href="${esc(titleUrl)}" target="_blank" rel="noopener" style="display:block;padding:8px 10px;background:var(--surface);border-radius:5px;text-decoration:none;color:var(--ink)">
          <div style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--muted);margin-bottom:3px">
            <span style="font-weight:700;color:var(--accent)">↑ ${s.score||0}</span>
            <span>·</span>
            <a href="${esc(hnUrl)}" target="_blank" rel="noopener" style="color:var(--muted);text-decoration:none">💬 ${s.descendants||0}</a>
            <span>·</span>
            <span>${ago(s.time)}</span>
            ${host ? `<span>·</span><span>${esc(host)}</span>` : ''}
          </div>
          <div style="font-size:13px;font-weight:600;line-height:1.4">${esc(s.title)}</div>
        </a>`;
      }).join('')}
    </div>
    <a href="https://oioxo.com/socialtools/hn-top" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Open full tool →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Inline preview · same skill as oioxo.com/socialtools/hn-top · cached 10min</div>`;
  return { kind: 'hn-top', title: 'Hacker News', html, priority: 92 };
}

// =============================================================================
// MIGRATION-1 — TOOL CATALOG RESOLVER. Replaces standalone tool-duplicating
// providers (starting with QR / PR308) with a generic resolver that:
//   1. loads /catalog.json (386 xonvert tools, generated from app/*)
//   2. matches the query intent against a slug
//   3. lazy-loads the matching engine from /engines/{name}.js (same lib that
//      powers the xonvert tool page — single source of truth)
//   4. renders an inline preview + a deep-link to the full xonvert tool with
//      the query pre-filled via the tool's paramKey
//
// One provider, many tool intents — add a new pattern to _detectToolIntent
// to cover another tool. New engines drop into oioxo/engines/{name}.js.
let _toolCatalog = null;
let _toolCatalogPromise = null;
function _loadToolCatalog(){
  if (_toolCatalog) return Promise.resolve(_toolCatalog);
  if (_toolCatalogPromise) return _toolCatalogPromise;
  // Protected path: go through the loader so the catalog is also encrypted
  // (the 390-tool routing map is part of the search engine's IP). Fall back
  // to plaintext /catalog.json only when the loader isn't present (dev).
  if (window.oioxoLoader && typeof window.oioxoLoader.getCatalog === 'function'){
    _toolCatalogPromise = window.oioxoLoader.getCatalog()
      .then((j) => { _toolCatalog = j; return j; })
      .catch(() => null);
    return _toolCatalogPromise;
  }
  _toolCatalogPromise = fetch('/catalog.json')
    .then(r => r.ok ? r.json() : null)
    .then(j => { _toolCatalog = j; return j; })
    .catch(() => null);
  return _toolCatalogPromise;
}

const _enginePromises = {};
function _loadEngine(name){
  if (window.oioxoEngines && window.oioxoEngines[name]) return Promise.resolve(window.oioxoEngines[name]);
  if (_enginePromises[name]) return _enginePromises[name];
  // Protected path: ECDHE-gated unlock for engine-{name}.enc. Cross-origin
  // clones get a 403 from /api/search-key → null. Plaintext fallback for
  // pre-encryption / dev only.
  if (window.oioxoLoader && typeof window.oioxoLoader.getEngine === 'function'){
    _enginePromises[name] = window.oioxoLoader.getEngine(name).catch(() => null);
    return _enginePromises[name];
  }
  _enginePromises[name] = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = '/engines/' + name + '.js';
    s.async = true;
    s.onload = () => resolve((window.oioxoEngines && window.oioxoEngines[name]) || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return _enginePromises[name];
}

function _detectToolIntent(rawQ){
  if (!rawQ) return null;
  // QR code: "qr code for X" / "qr X" / "generate qr for X"
  let m = rawQ.match(/^(?:qr(?:\s*code)?|qrcode|generate\s+qr(?:\s*code)?|create\s+qr)\s+(?:for\s+|of\s+)?["']?(.+?)["']?\??$/i);
  if (m) return { slug: 'qr-code', target: m[1].trim(), title: 'QR code', icon: '▦' };
  // My IP — no target needed
  if (/^(?:my\s+ip|what(?:'?s|\s+is)\s+my\s+ip|whats\s+my\s+ip|public\s+ip|ip\s+address)\??$/i.test(rawQ)){
    return { slug: 'my-ip', target: '', title: 'My IP', icon: '🌐', summary: "We don't fetch your IP in the search engine — open the full tool for the answer (privacy-preserving, runs on the page you open)." };
  }
  // IP lookup: "ip 8.8.8.8" / "where is 1.1.1.1" / bare IPv4
  m = rawQ.match(/^(?:ip|geolocate|locate|whois|lookup|where\s+is)\s+((?:\d{1,3}\.){3}\d{1,3}|[a-f0-9:]{2,39})\??$/i);
  if (m) return { slug: 'ip-lookup', target: m[1], title: 'IP lookup', icon: '🌐' };
  m = rawQ.match(/^((?:\d{1,3}\.){3}\d{1,3})$/);
  if (m) return { slug: 'ip-lookup', target: m[1], title: 'IP lookup', icon: '🌐' };
  // More tool intents land here as we wire engines for them.
  return null;
}

// =============================================================================
// iaRouter (UNIFIED INTENT ROUTER)
// Delegates to oioxoRouter + oioxoCardRenderer (encrypted at
// /protected/router-{intents,card-renderer}.enc) for a single, data-driven
// pipeline that resolves any query to the best tool/app/studio/conversion/
// operation match across all 424 catalog entries. Replaces the older
// iaToolCatalog (specific patterns) + iaToolMatch (fuzzy fallback) — both
// stages now live inside the router module.
// One-shot per page: catalog + router unlock. Memoized so multiple iaRouter
// calls during a single query don't redo the work; the `ensure*` promises
// settle once and then resolve immediately on every later await.
let _routerDegraded = null; // { stage, reason } when an unlock fails permanently
let _routerEnsurePromise = null;
// Router modules — load every chained module in parallel. Each is
// encrypted under the same ECDHE gate as the engines/skills. Plain-text
// fallback for dev. The order matches the dependency chain (foundation
// → cards → resolution → aggregation → orchestration).
const ROUTER_MODULES = [
  // Foundation
  'graph', 'history', 'memory', 'rewriter', 'multilingual', 'entities', 'variants',
  'profile', 'bookmarks', 'breaker', 'prefetch', 'bandit', 'thumbs',
  'operators', 'feedback',
  // Acceleration
  'compute', 'i18n', 'metrics', 'voice', 'index', 'federation',
  // Instant-answer cards
  'timecard', 'definition', 'translate-card', 'finance', 'news',
  'factcard', 'numparse',
  'imagecard', 'mapcard', 'bookcard', 'academiccard', 'recipecard',
  'lyricscard', 'sportscard', 'flightcard', 'triviacard', 'capabilities',
  // Web + synthesis
  'webresults', 'aianswer', 'disambiguation', 'highlight', 'clusters',
  'tfidf', 'qa-pattern', 'authority', 'operators-apply', 'safesearch',
  // Core resolution
  'brain', 'planner', 'intents', 'classifier', 'followup',
  // Aggregation + presentation
  'suggest', 'ranker', 'knowledge', 'related', 'snippets', 'explain',
  'export', 'sync', 'autocomplete', 'a11y',
  'perfbudget', 'rtl', 'i18n-render', 'shortcuts',
  // Orchestration + UI
  'serp', 'stream', 'voice-stream', 'card-renderer',
];
async function _ensureRouter(){
  if (window.oioxoRouter && window.oioxoCardRenderer) return true;
  if (_routerEnsurePromise) return _routerEnsurePromise;
  _routerEnsurePromise = (async () => {
    try {
      if (window.oioxoLoader && typeof window.oioxoLoader.getRouter === 'function'){
        await Promise.all(ROUTER_MODULES.map((m) =>
          window.oioxoLoader.getRouter(m).catch((e) => {
            _routerDegraded = { stage: m, reason: String(e && e.message || e) };
          })
        ));
      } else {
        await Promise.all(ROUTER_MODULES.map((m) => new Promise((res) => {
          const s = document.createElement('script');
          s.src = '/router/' + m + '.js'; s.async = true;
          s.onload = () => res(true);
          s.onerror = () => { _routerDegraded = { stage: m, reason: 'plaintext fallback 404' }; res(false); };
          document.head.appendChild(s);
        })));
      }
    } catch (e) {
      _routerDegraded = { stage:'unknown', reason: String(e && e.message || e) };
    }
    return !!(window.oioxoRouter && window.oioxoCardRenderer);
  })();
  return _routerEnsurePromise;
}

/** Snapshot the page-level ResolverContext for this query. Reads from the
 *  loader's entitlement claims (tier), the URL (surface hint), the locale,
 *  device capabilities, and the in-flight history layer. The router doesn't
 *  trust ANY of these for security gates — those are server-enforced. */
function _routerContext(){
  const ctx = { surface: 'search' };
  try {
    if (window.oioxoLoader && typeof window.oioxoLoader.getTier === 'function'){
      ctx.tier = window.oioxoLoader.getTier();
    }
  } catch {}
  try {
    // If embedded into a chat surface (oioxoLoader sets a global hint).
    if (window.oioxoSurface) ctx.surface = window.oioxoSurface;
  } catch {}
  try { ctx.locale = navigator.language || 'en'; } catch {}
  try {
    const recent = (window.oioxoHistory && window.oioxoHistory.recent && window.oioxoHistory.recent(5)) || [];
    if (recent.length) ctx.recentTools = recent.map((e) => e.slug);
  } catch {}
  return ctx;
}

// Degraded-state card. Shown ONLY when the user's query couldn't be
// resolved AND the router failed to unlock — so it explains why the rich
// tool routing isn't available instead of silently returning nothing.
function _degradedCard(reason){
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:11px;color:#b45309;font-weight:700">⚠ Search engine degraded</span>
    </div>
    <div style="font-size:12px;line-height:1.5;color:var(--ink);margin-bottom:8px">
      Tool routing isn't available right now (${esc(reason || 'unknown reason')}). Web answers and live data cards still work.
    </div>
    <a href="https://oioxo.com" target="_blank" rel="noopener" style="display:inline-block;padding:6px 12px;font-size:11px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">Visit oioxo.com directly →</a>
  `;
}

async function iaRouter(rawQ){
  if (!rawQ || rawQ.length < 2 || rawQ.length > 300) return null;
  const cat = await _loadToolCatalog();
  // Catalog itself failed to unlock — keep silent (other providers may still
  // produce answers) UNLESS the query clearly wants a tool (long enough +
  // verb-shaped). Don't be noisy on every Wikipedia query.
  if (!cat) return null;
  const ok = await _ensureRouter();
  if (!ok || !window.oioxoRouter || !window.oioxoCardRenderer) {
    // Router degraded. Show a one-off explanatory card only when the query
    // shape strongly implies the user wants a tool / app / converter — we
    // don't want a "degraded" warning on every search.
    const looksToolish = /\b(convert|compress|merge|split|rotate|extract|trim|app|tool|studio|maker)\b/i.test(rawQ)
      || /\bto\s+[a-z]{2,5}\b/i.test(rawQ);
    if (!looksToolish) return null;
    return { kind: 'router-degraded', title: 'Tool routing unavailable', html: _degradedCard(_routerDegraded && _routerDegraded.reason), priority: 30 };
  }
  const context = _routerContext();
  let intent = null;
  try {
    // 1. Try a multi-step plan first (cheap; returns null when query has
    //    only one segment). Plans get rendered as their own card kind.
    if (typeof window.oioxoRouter.plan === 'function'){
      intent = window.oioxoRouter.plan(rawQ, cat, { context });
    }
    // 2. Then synchronous resolve (the 6 fast stages).
    if (!intent) intent = window.oioxoRouter.resolve(rawQ, cat, { context });
    // 3. Last resort: async brain escalation (no-op when conductor isn't
    //    loaded). Skip in the catalog-fuzzy floor zone so the user isn't
    //    kept waiting for an LLM call that's likely to fail.
    if (!intent && typeof window.oioxoRouter.resolveAsync === 'function'){
      intent = await window.oioxoRouter.resolveAsync(rawQ, cat, { context });
    }
    // 4. Record successful intents in the history layer so the recency
    //    boost reflects what the user actually used.
    if (intent && intent.tool && window.oioxoHistory && typeof window.oioxoHistory.record === 'function'){
      try { window.oioxoHistory.record(intent.tool.slug, { source: intent.kind }); } catch {}
    }
  } catch (e) {
    if (typeof window.oioxoRouter.onResolve === 'function'){
      try { window.oioxoRouter.onResolve({ q: rawQ, error: String(e && e.message || e) }); } catch {}
    }
    return null;
  }
  if (!intent) return null;
  // Plans pass through; for single intents require a tool.
  if (intent.kind !== 'plan' && !intent.tool) return null;
  let html = '';
  try {
    html = window.oioxoCardRenderer.render({ intent, esc, context });
  } catch (e) {
    return null;
  }
  if (!html) return null;
  // Confidence → priority. Apps + specific intents win the top sidebar slot;
  // catalog matches sit just under. The migrated specific providers (weather,
  // crypto, etc.) still run at higher priority because they predate this layer.
  // Conversion-fallback gets a lower slot so it sits below confident matches.
  const conf = typeof intent.confidence === 'number' ? intent.confidence : 0.5;
  const isFallback = intent.kind === 'conversion-fallback';
  const priority = isFallback ? 55 : Math.round(80 + conf * 19);
  return { kind: 'router-' + intent.kind, title: intent.title || intent.tool.name, html, priority };
}

