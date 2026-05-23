/**
 * Xonvert AI — live market quotes (exact numbers, browser-side).
 *
 * The hard part of "what's the bitcoin price" is that the number is rendered by
 * JavaScript on finance sites — a static page read returns no figure. The clean,
 * GENERAL fix (not a scraper per site): one data source that returns a real-time
 * quote for ANY symbol — stock, crypto, forex, index, commodity — as plain CSV,
 * read through the same open-web reader that shims CORS for us.
 *
 *   reader → stooq.com/q/l/?s=<symbol>&f=sd2t2ohlcv&e=csv
 *          → "AAPL.US,2026-05-22,22:00:19,306.12,311.4,305.84,308.82,43624811"
 *
 * So a single endpoint + a small name→symbol resolver covers the whole asset
 * universe. Anything we can't resolve falls back to the web answer engine.
 */

import type { SearchAnswer } from './search';

const READER_BASE = 'https://r.jina.ai/';
const STOOQ = 'https://stooq.com/q/l/?f=sd2t2ohlcv&e=csv&s=';

// Common crypto names → Stooq symbols (<coin>usd). The long tail is handled by
// the generic "<token>usd" guess below, so this is just the friendly aliases.
const CRYPTO: Record<string, string> = {
  bitcoin: 'btcusd', btc: 'btcusd', ethereum: 'ethusd', eth: 'ethusd',
  dogecoin: 'dogeusd', doge: 'dogeusd', solana: 'solusd', sol: 'solusd',
  cardano: 'adausd', ada: 'adausd', ripple: 'xrpusd', xrp: 'xrpusd',
  litecoin: 'ltcusd', ltc: 'ltcusd', polkadot: 'dotusd', dot: 'dotusd',
  bnb: 'bnbusd', tron: 'trxusd', trx: 'trxusd', avalanche: 'avaxusd', avax: 'avaxusd',
};

// Popular companies → US tickers. A bare ticker in the query also works directly.
const COMPANY: Record<string, string> = {
  apple: 'aapl.us', tesla: 'tsla.us', microsoft: 'msft.us', amazon: 'amzn.us',
  google: 'googl.us', alphabet: 'googl.us', meta: 'meta.us', facebook: 'meta.us',
  nvidia: 'nvda.us', netflix: 'nflx.us', intel: 'intc.us', amd: 'amd.us',
  ibm: 'ibm.us', oracle: 'orcl.us', disney: 'dis.us', boeing: 'ba.us',
  coinbase: 'coin.us', nike: 'nke.us', starbucks: 'sbux.us', uber: 'uber.us',
};

export interface ResolvedSymbol { symbol: string; label: string; kind: 'crypto' | 'stock' | 'forex'; }

// A request is a quote only if it actually mentions price/value/quote/trading.
const QUOTE_CUE = /\b(price|quote|worth|value|trading at|stock|shares?|how much (is|are)|cost of|exchange rate|convert)\b/i;

// ISO-4217 codes we recognise in "usd to cad" / "eur/usd" currency questions.
const CCY = new Set(['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'chf', 'cny', 'inr', 'nzd', 'sek', 'nok', 'mxn', 'brl', 'zar', 'rub', 'try', 'krw', 'sgd', 'hkd', 'aed', 'pln', 'dkk']);

/** Map a natural request to a Stooq symbol, or null if we can't name one. */
export function resolveSymbol(text: string): ResolvedSymbol | null {
  const t = text.toLowerCase();

  // Currency pair ("usd to cad", "eur/usd", "100 usd in gbp") — self-evidently a
  // quote, so it doesn't need a separate price cue. Stooq symbol = <base><quote>.
  const fx = t.match(/\b([a-z]{3})\s*(?:to|in|\/|-|vs|→|=)\s*([a-z]{3})\b/);
  if (fx && CCY.has(fx[1]) && CCY.has(fx[2])) {
    return { symbol: `${fx[1]}${fx[2]}`, label: `${fx[1].toUpperCase()}/${fx[2].toUpperCase()}`, kind: 'forex' };
  }

  if (!QUOTE_CUE.test(text)) return null;

  // Named crypto / company first (most reliable).
  for (const [name, sym] of Object.entries(CRYPTO)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) return { symbol: sym, label: cap(name), kind: 'crypto' };
  }
  for (const [name, sym] of Object.entries(COMPANY)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) return { symbol: sym, label: cap(name), kind: 'stock' };
  }

  // A bare ticker in CAPS ("AAPL stock", "what's TSLA at") → US stock.
  const tick = text.match(/\b([A-Z]{1,5})\b/);
  if (tick && /\b(stock|shares?|ticker|price|quote)\b/i.test(t)) {
    return { symbol: `${tick[1].toLowerCase()}.us`, label: tick[1], kind: 'stock' };
  }

  // "<word> coin/crypto price" → try <word>usd as a crypto symbol.
  const crypto = t.match(/\b([a-z]{2,5})\s*(?:coin|token|crypto)\b/);
  if (crypto) return { symbol: `${crypto[1]}usd`, label: cap(crypto[1]), kind: 'crypto' };

  return null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fmtNum(n: number): string {
  if (!isFinite(n)) return '—';
  const dp = n >= 1000 ? 2 : n >= 1 ? 2 : 6; // crisp for $75,797.10 and $0.123456
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp });
}

/**
 * Fetch and format a live quote. Returns a `SearchAnswer` so the existing UI
 * renders it (with the Stooq citation); null on any failure → caller falls back.
 */
export async function liveQuote(text: string): Promise<SearchAnswer | null> {
  const res = resolveSymbol(text);
  if (!res) return null;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  let csv = '';
  try {
    const r = await fetch(READER_BASE + STOOQ + encodeURIComponent(res.symbol), { signal: ctl.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!r.ok) return null;
    csv = (await r.text()).trim();
  } catch { return null; } finally { clearTimeout(timer); }

  // Find the data line: SYMBOL,date,time,open,high,low,close,volume
  const line = csv.split('\n').map((l) => l.trim()).find((l) => /^[A-Z][A-Z0-9.]*,\d{4}-\d{2}-\d{2},/.test(l));
  if (!line) return null;
  const [, date, time, open, high, low, close] = line.split(',');
  const price = Number(close);
  if (!isFinite(price) || price <= 0) return null;

  const unit = res.kind === 'crypto' || res.kind === 'stock' ? '$' : '';
  const head = res.kind === 'forex'
    ? `${res.label} — ${fmtNum(price)} (1 ${res.label.split('/')[0]} = ${fmtNum(price)} ${res.label.split('/')[1]})`
    : `${res.label} — ${unit}${fmtNum(price)}`;
  const parts = [head];
  if (open && high && low) parts.push(`Open ${unit}${fmtNum(Number(open))} · High ${unit}${fmtNum(Number(high))} · Low ${unit}${fmtNum(Number(low))}`);
  parts.push(`As of ${date} ${time} (market time).`);

  return {
    answer: parts.join('. ').replace('. As of', '. As of'),
    query: `${res.label} quote`,
    sources: [{ title: `${res.label} quote — Stooq`, url: `https://stooq.com/q/?s=${encodeURIComponent(res.symbol)}`, site: 'Stooq' }],
  };
}
