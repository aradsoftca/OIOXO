/**
 * Finance card — crypto prices via CoinGecko (free, CORS-clean, no key)
 * and stocks via Stooq (free CSV with permissive CORS). Currency lives
 * in compute.js already and is unchanged.
 *
 * Triggers:
 *   "bitcoin price" / "btc price" → crypto
 *   "ethereum"                    → crypto (top symbol)
 *   "aapl stock" / "tsla price"   → stock
 *   "stock AAPL"                  → stock
 *
 * Exposes window.oioxoFinance = { tryCard, parsePattern, fetchCrypto,
 *                                  fetchStock }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoFinance) return;

  const BUDGET_MS = 700;
  const cache = new Map(); // key → { result, ts }
  const CACHE_TTL = 60 * 1000;

  const CRYPTO_SYMBOLS = {
    btc: 'bitcoin', bitcoin: 'bitcoin',
    eth: 'ethereum', ethereum: 'ethereum', ether: 'ethereum',
    sol: 'solana', solana: 'solana',
    bnb: 'binancecoin', binance: 'binancecoin',
    xrp: 'ripple', ripple: 'ripple',
    ada: 'cardano', cardano: 'cardano',
    doge: 'dogecoin', dogecoin: 'dogecoin',
    dot: 'polkadot', polkadot: 'polkadot',
    matic: 'matic-network', polygon: 'matic-network',
    avax: 'avalanche-2', avalanche: 'avalanche-2',
    link: 'chainlink', chainlink: 'chainlink',
    ltc: 'litecoin', litecoin: 'litecoin',
    trx: 'tron', tron: 'tron',
    shib: 'shiba-inu', 'shiba inu': 'shiba-inu',
    uni: 'uniswap', uniswap: 'uniswap',
    atom: 'cosmos', cosmos: 'cosmos',
  };

  const CRYPTO_PATTERN = /^(?:price\s+of\s+)?([a-z]{2,12}(?:\s+[a-z]+)?)\s*(?:price|usd|value)?$/i;
  const STOCK_PATTERN = /^(?:stock\s+|price\s+of\s+)?([A-Z]{1,5})(?:\s+stock|\s+price|\s+usd)?$/;
  // File extensions and other common ALL-CAPS words that LOOK like stock
  // symbols but aren't. Without this list, "PDF" / "MP4" / "AVI" / "PNG"
  // would fire the stock card.
  const FAKE_TICKERS = new Set([
    'PDF','DOC','DOCX','XLS','XLSX','PPT','PPTX','TXT','CSV','JSON','XML','HTML','SVG',
    'PNG','JPG','JPEG','GIF','WEBP','HEIC','BMP','TIFF','AVIF','RAW','ICO','PSD',
    'MP4','AVI','MOV','MKV','WMV','FLV','WEBM','M4V','MPG','MPEG','OGV','3GP',
    'MP3','WAV','FLAC','AAC','OGG','OPUS','WMA','M4A',
    'ZIP','RAR','7Z','TAR','GZ','BZ2','XZ',
    'EXE','DMG','APK','IPA','ISO','BIN',
    'TTF','OTF','WOFF','EOT',
    'YAML','YML','TOML','MD','RST',
    'C','H','HPP','JS','TS','CSS','SQL','SH','PY','RB','GO','RS','JAVA',
    'UTC','GMT','PST','EST','CST','MST','PDT','EDT',
    'API','URL','URI','UUID','GUID','SDK','SaaS','SAAS','PaaS','PAAS','IaaS','IAAS',
    'AI','ML','LLM','CPU','GPU','RAM','SSD','HDD','USB','HDMI','OS','UI','UX',
  ]);

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    // Crypto: any matching alias.
    const crypto = s.toLowerCase().replace(/(price|usd|value)$/, '').trim();
    if (CRYPTO_SYMBOLS[crypto]) return { kind: 'crypto', symbol: CRYPTO_SYMBOLS[crypto], label: crypto };
    const mC = s.toLowerCase().match(CRYPTO_PATTERN);
    if (mC){
      const guess = mC[1].trim();
      if (CRYPTO_SYMBOLS[guess]) return { kind: 'crypto', symbol: CRYPTO_SYMBOLS[guess], label: guess };
    }
    // Stock: 1-5 capital letters + optional "stock" / "price". Bare
    // ALL-CAPS without "stock" / "price" suffix must NOT be a known
    // file-format / tech acronym (PDF, MP4, JS, AI, …) — those would
    // produce false-positive finance cards.
    const mS = s.match(STOCK_PATTERN);
    if (mS){
      const sym = mS[1].toUpperCase();
      // Block fake tickers — unless the user explicitly typed "stock" or
      // "price" hinting they really do mean a ticker.
      const hasHint = /\b(stock|price|usd|nasdaq|nyse)\b/i.test(s);
      if (!hasHint && FAKE_TICKERS.has(sym)) return null;
      return { kind: 'stock', symbol: sym };
    }
    return null;
  }

  function withinBudget(p){
    return Promise.race([p, new Promise((res) => setTimeout(() => res(null), BUDGET_MS))]);
  }

  async function fetchCrypto(id){
    if (!id) return null;
    const key = 'crypto:' + id;
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL) return c.result;
    if (typeof fetch === 'undefined') return null;
    try {
      const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(id);
      const r = await withinBudget(fetch(url).then((r) => r.json()));
      if (!Array.isArray(r) || !r[0]) return null;
      const v = r[0];
      const result = {
        symbol: v.symbol.toUpperCase(),
        name: v.name,
        priceUsd: v.current_price,
        change24h: v.price_change_percentage_24h,
        marketCap: v.market_cap,
        image: v.image,
        ts: Date.now(),
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  /** Stooq returns a CSV: Symbol,Date,Time,Open,High,Low,Close,Volume.
   *  CORS is permissive on stooq.com — no key needed. */
  async function fetchStock(symbol){
    if (!symbol) return null;
    const key = 'stock:' + symbol;
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL) return c.result;
    if (typeof fetch === 'undefined') return null;
    try {
      const url = 'https://stooq.com/q/l/?s=' + symbol.toLowerCase() + '.us&i=d&f=sd2t2ohlcv&h&e=csv';
      const text = await withinBudget(fetch(url).then((r) => r.text()));
      if (!text || typeof text !== 'string') return null;
      const lines = text.trim().split('\n');
      if (lines.length < 2) return null;
      const cols = lines[1].split(',');
      const close = parseFloat(cols[6]);
      const open = parseFloat(cols[3]);
      if (!Number.isFinite(close) || !Number.isFinite(open)) return null;
      const change = ((close - open) / open) * 100;
      const result = {
        symbol: cols[0].toUpperCase(),
        price: close,
        change24h: change,
        date: cols[1],
        open,
        high: parseFloat(cols[4]),
        low: parseFloat(cols[5]),
        volume: parseFloat(cols[7]),
        ts: Date.now(),
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const parsed = parsePattern(query);
    if (!parsed) return null;
    if (parsed.kind === 'crypto'){
      const v = await fetchCrypto(parsed.symbol);
      if (!v) return null;
      return {
        kind: 'finance',
        title: v.name + ' (' + v.symbol + ')',
        icon: '🪙',
        confidence: 0.9,
        formatted: '$' + v.priceUsd.toLocaleString(),
        change24h: v.change24h,
        marketCap: v.marketCap,
        image: v.image,
        summary: (v.change24h >= 0 ? '+' : '') + (v.change24h ? v.change24h.toFixed(2) : '0') + '% in 24h',
        citation: { source: 'coingecko', url: 'https://www.coingecko.com/en/coins/' + parsed.symbol },
        inputType: 'none',
      };
    }
    if (parsed.kind === 'stock'){
      const v = await fetchStock(parsed.symbol);
      if (!v) return null;
      return {
        kind: 'finance',
        title: v.symbol + ' (US)',
        icon: '📈',
        confidence: 0.85,
        formatted: '$' + v.price.toFixed(2),
        change24h: v.change24h,
        date: v.date,
        summary: (v.change24h >= 0 ? '+' : '') + v.change24h.toFixed(2) + '% intraday',
        citation: { source: 'stooq', url: 'https://stooq.com/q/?s=' + parsed.symbol.toLowerCase() + '.us' },
        inputType: 'none',
      };
    }
    return null;
  }

  window.oioxoFinance = { tryCard, parsePattern, fetchCrypto, fetchStock };
})();
