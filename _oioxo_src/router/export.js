/**
 * Telemetry export — turns the in-memory metrics snapshot into a
 * downloadable CSV or JSON file the user can open in Excel / send to a
 * teammate / analyse offline.
 *
 *   toJSON(opts)        — full snapshot as a pretty JSON string
 *   toCSV(opts)         — per-stage latency + per-category counts + clicks
 *   download(format)    — trigger a browser download of the export
 *
 * Nothing is sent to a server. The user clicks the export button; we build
 * a Blob and an <a download> in-memory, then click it. The file lives in
 * the user's downloads folder, end of story.
 *
 * Exposes window.oioxoExport = { toJSON, toCSV, download }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoExport) return;

  function snap(){
    return window.oioxoMetrics && typeof window.oioxoMetrics.snapshot === 'function'
      ? window.oioxoMetrics.snapshot()
      : null;
  }

  function toJSON(opts){
    opts = opts || {};
    const s = snap();
    if (!s) return '{}';
    const out = Object.assign({
      generatedAt: new Date().toISOString(),
      uri: typeof location !== 'undefined' ? location.host : '',
      version: window.oioxoLoader && window.oioxoLoader.version && window.oioxoLoader.version() || null,
    }, s);
    return JSON.stringify(out, null, opts.compact ? 0 : 2);
  }

  function csvEscape(v){
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(opts){
    opts = opts || {};
    const s = snap();
    if (!s) return '';
    const lines = [];

    lines.push('# oioxo metrics export');
    lines.push('# generated_at,' + new Date().toISOString());
    lines.push('# uptime_ms,' + s.uptimeMs);
    lines.push('# total_resolves,' + s.totalResolves);
    lines.push('# cache_hit_rate,' + s.cacheHitRate.toFixed(4));
    lines.push('# no_result_rate,' + s.noResultRate.toFixed(4));
    lines.push('');

    lines.push('# per-stage latency (ms)');
    lines.push('stage,p50,p99,samples');
    for (const [stage, v] of Object.entries(s.perStage || {})){
      lines.push([csvEscape(stage), v.p50, v.p99, v.samples].join(','));
    }
    lines.push('');

    lines.push('# per-classification category');
    lines.push('category,count,p50_ms,p99_ms');
    for (const [cat, v] of Object.entries(s.byCategory || {})){
      lines.push([csvEscape(cat), v.count, v.p50ms, v.p99ms].join(','));
    }
    lines.push('');

    lines.push('# per-intent kind');
    lines.push('kind,count');
    for (const [k, c] of Object.entries(s.byKind || {})){
      lines.push([csvEscape(k), c].join(','));
    }
    lines.push('');

    if (s.byVariant && Object.keys(s.byVariant).length){
      lines.push('# A/B variant attribution');
      lines.push('variant,count');
      for (const [v, c] of Object.entries(s.byVariant)) lines.push([csvEscape(v), c].join(','));
      lines.push('');
    }

    lines.push('# top clicks');
    lines.push('slug,count,last_click_iso');
    for (const c of s.topClicks || []){
      lines.push([csvEscape(c.slug), c.count, new Date(c.lastClick).toISOString()].join(','));
    }
    lines.push('');

    if (!opts.skipQueries && s.recentQueries){
      lines.push('# recent queries');
      lines.push('ts_iso,q,intent_kind,intent_slug,duration_ms,cached,variant');
      for (const q of s.recentQueries){
        lines.push([
          new Date(q.ts || 0).toISOString(),
          csvEscape(q.q),
          csvEscape(q.kind),
          csvEscape(q.slug),
          q.durationMs,
          q.cached ? '1' : '0',
          csvEscape(q.variant),
        ].join(','));
      }
    }
    return lines.join('\n');
  }

  /** Trigger a real browser download. Returns true when initiated, false
   *  in non-browser environments. Format defaults to JSON. */
  function download(format, opts){
    format = (format || 'json').toLowerCase();
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return false;
    const data = format === 'csv' ? toCSV(opts) : toJSON(opts);
    const mime = format === 'csv' ? 'text/csv' : 'application/json';
    const blob = new Blob([data], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oioxo-metrics-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + format;
    if (a.style) a.style.display = 'none';
    if (document.body) document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
      try { if (document.body) document.body.removeChild(a); } catch {}
    }, 100);
    return true;
  }

  window.oioxoExport = { toJSON, toCSV, download };
})();
