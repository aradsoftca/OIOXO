/**
 * oioxo runtime mirror of lib/skills/pageviews.ts. Exposes
 * window.oioxoSkills.pageviews = { getPageviews, buildSparklinePath }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.pageviews) return;

  const CACHE_KEY = 'xonvert.skill.pageviews.cache.v1';
  const TTL = 6 * 60 * 60 * 1000;

  function readCache(q){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); const e = j && j[q.toLowerCase()];
      if (e && Date.now() - e.t < TTL) return e.d; } catch {} return null;
  }
  function writeCache(q, data){
    try { const raw = localStorage.getItem(CACHE_KEY); const j = raw ? JSON.parse(raw) : {};
      j[q.toLowerCase()] = { t: Date.now(), d: data };
      const keys = Object.keys(j); if (keys.length > 100) for (const k of keys.slice(0, keys.length-100)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch {}
  }
  function fmt(d){ return d.getUTCFullYear() + String(d.getUTCMonth()+1).padStart(2,'0') + String(d.getUTCDate()).padStart(2,'0'); }

  async function getPageviews(query, opts){
    const q = (query || '').trim();
    if (!q || q.length > 80) return null;
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(q); if (c) return c; }
    let title;
    try {
      const r = await fetch('https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&origin=*&search=' + encodeURIComponent(q));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j[1] || !j[1].length) return null;
      title = j[1][0];
    } catch { return null; }
    const days = Math.max(14, Math.min(180, (opts && opts.days) || 60));
    const end = new Date(Date.now() - 24*3600*1000);
    const start = new Date(end.getTime() - days*24*3600*1000);
    let samples;
    try {
      const url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/' + encodeURIComponent(title.replace(/ /g,'_')) + '/daily/' + fmt(start) + '/' + fmt(end);
      const r = await fetch(url);
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.items || j.items.length < 14) return null;
      samples = j.items.map(it => ({ date: it.timestamp.slice(0,8), views: it.views }));
    } catch { return null; }
    const views = samples.map(s => s.views);
    const max = Math.max(...views), min = Math.min(...views);
    const peakI = views.indexOf(max);
    const peakDate = samples[peakI].date.slice(0,4) + '-' + samples[peakI].date.slice(4,6) + '-' + samples[peakI].date.slice(6,8);
    const last7 = views.slice(-7).reduce((a,b)=>a+b,0) / 7;
    const prior7 = views.slice(-14,-7).reduce((a,b)=>a+b,0) / 7;
    const trendPct = prior7 ? ((last7 - prior7) / prior7) * 100 : 0;
    const data = { title, samples, max, min, last: views[views.length-1], peakDate, trendPct };
    if (useCache) writeCache(q, data);
    return data;
  }
  function buildSparklinePath(views, width, height, pad){
    width = width || 280; height = height || 64; pad = pad || 4;
    if (views.length < 2) return { line: '', fill: '' };
    const max = Math.max(...views), min = Math.min(...views);
    const range = Math.max(1, max - min);
    const stepX = (width - pad*2) / (views.length - 1);
    const pts = views.map((v, i) => (pad + i*stepX).toFixed(1) + ',' + (height - pad - ((v - min) / range) * (height - pad*2)).toFixed(1)).join(' ');
    return { line: pts, fill: pad + ',' + (height - pad) + ' ' + pts + ' ' + (width - pad) + ',' + (height - pad) };
  }
  window.oioxoSkills.pageviews = { getPageviews, buildSparklinePath };
})();
