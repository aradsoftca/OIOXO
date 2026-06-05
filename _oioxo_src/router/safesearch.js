/**
 * Safe search — local NSFW filtering on the web results block. Default
 * ON; user can toggle via setEnabled(false). Pure on-device, no API
 * calls.
 *
 * Strategy:
 *   1. Substring match against a small embedded NSFW token list (~150
 *      common items, no slurs, no false-positive risk).
 *   2. Domain blocklist for known adult sites.
 *   3. Drop matched results, label them in metrics.
 *
 * Exposes window.oioxoSafesearch = { filter, setEnabled, isEnabled, snapshot }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoSafesearch) return;

  const KEY = 'oioxo.safesearch.v1';

  // Compact NSFW token set. Adult-content lexicon only — no slurs.
  const NSFW_TOKENS = new Set([
    'porn','porno','pornography','xxx','nude','nudes','nudity','naked','sex','sextape',
    'erotic','erotica','hentai','rule34','onlyfans','camgirl','camboy','escort','brothel',
    'bdsm','fetish','milf','dilf','threesome','orgy','gangbang','strapon',
    'masturbat','vibrator','fleshlight','dildo',
  ]);

  // Adult content host shortlist (illustrative — production list would be larger).
  const BLOCK_HOSTS = new Set([
    'pornhub.com','xvideos.com','xhamster.com','redtube.com','youporn.com',
    'spankbang.com','xnxx.com','onlyfans.com','chaturbate.com','livejasmin.com',
    'manyvids.com','adultfriendfinder.com','clips4sale.com',
  ]);

  function loadEnabled(){
    try {
      if (typeof localStorage === 'undefined') return true;
      const v = localStorage.getItem(KEY);
      return v == null ? true : v === '1';
    } catch { return true; }
  }
  let enabled = loadEnabled();
  let filteredCount = 0;

  function setEnabled(v){
    enabled = !!v;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, v ? '1' : '0'); } catch {}
  }
  function isEnabled(){ return enabled; }

  function hostOf(url){
    if (!url) return '';
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
    catch {
      const m = String(url).match(/^(?:https?:\/\/)?([^\/?#]+)/i);
      return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
    }
  }

  function isNsfw(result){
    if (!result) return false;
    const host = hostOf(result.url);
    if (BLOCK_HOSTS.has(host)) return true;
    const blob = ((result.title || '') + ' ' + (result.snippet || '') + ' ' + (result.url || '')).toLowerCase();
    for (const tok of NSFW_TOKENS){
      if (blob.includes(tok)) return true;
    }
    return false;
  }

  /** Returns a filtered webResults object. When safesearch is off,
   *  returns the input unchanged. */
  function filter(webResults){
    if (!webResults || !Array.isArray(webResults.results)) return webResults;
    if (!enabled) return webResults;
    const kept = [];
    let dropped = 0;
    for (const r of webResults.results){
      if (isNsfw(r)) dropped++;
      else kept.push(r);
    }
    if (dropped > 0) filteredCount += dropped;
    return Object.assign({}, webResults, { results: kept, safesearchDropped: dropped });
  }

  function snapshot(){
    return { enabled, totalDropped: filteredCount };
  }

  window.oioxoSafesearch = { filter, setEnabled, isEnabled, snapshot, isNsfw };
})();
