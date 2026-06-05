/**
 * oioxo runtime mirror of lib/skills/crypto.ts — keep in sync.
 * Exposes window.oioxoSkills.crypto = { getPrice, resolveCoinId, COIN_IDS, SUPPORTED_FIAT }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.crypto) return;

  const COIN_IDS = {
    btc:'bitcoin', bitcoin:'bitcoin',
    eth:'ethereum', ethereum:'ethereum', ether:'ethereum',
    usdt:'tether', tether:'tether', usdc:'usd-coin',
    bnb:'binancecoin', binance:'binancecoin',
    xrp:'ripple', ripple:'ripple',
    sol:'solana', solana:'solana',
    ada:'cardano', cardano:'cardano',
    doge:'dogecoin', dogecoin:'dogecoin',
    shib:'shiba-inu', shiba:'shiba-inu', shibainu:'shiba-inu',
    avax:'avalanche-2', avalanche:'avalanche-2',
    dot:'polkadot', polkadot:'polkadot',
    matic:'matic-network', polygon:'matic-network',
    trx:'tron', tron:'tron',
    ltc:'litecoin', litecoin:'litecoin',
    link:'chainlink', chainlink:'chainlink',
    uni:'uniswap', uniswap:'uniswap',
    atom:'cosmos', cosmos:'cosmos',
    xlm:'stellar', stellar:'stellar',
    bch:'bitcoin-cash', xmr:'monero', monero:'monero',
    arb:'arbitrum', arbitrum:'arbitrum',
    op:'optimism', optimism:'optimism',
    apt:'aptos', aptos:'aptos',
    near:'near', sui:'sui', ton:'the-open-network',
    pepe:'pepe', etc:'ethereum-classic',
    algo:'algorand', algorand:'algorand',
    icp:'internet-computer', fil:'filecoin', filecoin:'filecoin',
  };
  const SUPPORTED_FIAT = ['usd','eur','gbp','jpy','aud','cad','chf','cny','inr','krw','rub','btc','eth'];
  const CACHE_KEY = 'xonvert.skill.crypto.cache.v1';
  const TTL = 60 * 1000;

  function resolveCoinId(input){ return COIN_IDS[(input || '').trim().toLowerCase()] || null; }
  function readCache(coin, fiat){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const j = JSON.parse(raw);
      const e = j && j[coin + ':' + fiat];
      if (e && Date.now() - e.t < TTL) return e.d;
    } catch {}
    return null;
  }
  function writeCache(coin, fiat, data){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const j = raw ? JSON.parse(raw) : {};
      j[coin + ':' + fiat] = { t: Date.now(), d: data };
      const keys = Object.keys(j);
      if (keys.length > 100) for (const k of keys.slice(0, keys.length - 100)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j));
    } catch {}
  }
  async function getPrice(coin, fiat, opts){
    const id = resolveCoinId(coin);
    if (!id) return null;
    const vs = ((fiat || 'usd') + '').toLowerCase();
    if (SUPPORTED_FIAT.indexOf(vs) < 0) return null;
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(id, vs); if (c) return c; }
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=' + vs + '&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true');
      if (!r.ok) return null;
      const j = await r.json();
      if (!j[id] || j[id][vs] === undefined) return null;
      const data = {
        price: j[id][vs],
        change24h: j[id][vs + '_24h_change'] || 0,
        vol24h: j[id][vs + '_24h_vol'] || 0,
        marketCap: j[id][vs + '_market_cap'] || 0,
      };
      if (useCache) writeCache(id, vs, data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.crypto = { getPrice, resolveCoinId, COIN_IDS, SUPPORTED_FIAT };
})();
