/**
 * Domain clustering for web results — groups raw results by source host
 * so the SERP can render "from wikipedia.org (3)" / "from reddit.com (2)"
 * accordions instead of a flat soup.
 *
 *   cluster(webResults) → { clusters: [...], flat: [...] }
 *
 * Each cluster has:
 *   { host, count, label, results: [...], topScore }
 *
 * Hosts are canonicalised — www. prefix dropped, lowercase, trailing
 * slash stripped. Reddit subreddits are grouped under "reddit.com" with
 * a sub-label like "r/news".
 *
 * Exposes window.oioxoClusters = { cluster, hostOf }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoClusters) return;

  function hostOf(url){
    if (!url) return null;
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      // Fallback for malformed URLs — strip protocol + path manually.
      const m = String(url).match(/^(?:https?:\/\/)?([^\/?#]+)/i);
      return m ? m[1].replace(/^www\./, '').toLowerCase() : null;
    }
  }

  function labelFor(host){
    if (!host) return 'unknown';
    // Cosmetic — strip TLD for display ("wikipedia" instead of
    // "wikipedia.org") but keep host as the key.
    const parts = host.split('.');
    if (parts.length <= 2) return parts[0];
    // Subdomains: keep more.
    return parts.slice(0, parts.length - 1).join('.');
  }

  function cluster(webResults){
    if (!webResults || !Array.isArray(webResults.results)){
      return { clusters: [], flat: [] };
    }
    const byHost = new Map();
    for (const r of webResults.results){
      const host = hostOf(r.url) || 'other';
      if (!byHost.has(host)){
        byHost.set(host, { host, label: labelFor(host), count: 0, results: [], topScore: 0 });
      }
      const c = byHost.get(host);
      c.count++;
      c.results.push(r);
      if ((r.score || 0) > c.topScore) c.topScore = r.score || 0;
    }
    const clusters = Array.from(byHost.values()).sort((a, b) => b.topScore - a.topScore);
    return { clusters, flat: webResults.results.slice() };
  }

  window.oioxoClusters = { cluster, hostOf, labelFor };
})();
