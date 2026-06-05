/**
 * oioxo engine: citation formatter. Pure on-device. Given a list of
 * `{ url, title? }` sources, returns APA / MLA / Chicago strings. Honest
 * about gaps — when author + date are unknown, the publisher (hostname)
 * stands in and we date the citation by today's accessed-on, never
 * fabricating an author.
 *
 * Exposes window.oioxoEngines.citations = { format, formatOne }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoEngines = window.oioxoEngines || {};
  if (window.oioxoEngines.citations) return;

  function host(url){ try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
  function publisher(h){
    const root = h.split('.').slice(0, -1).join('.') || h;
    return root.replace(/\b\w/g, c => c.toUpperCase());
  }
  function cleanTitle(t, h){
    let s = (t || h || '').trim();
    // strip trailing "| Publisher" / " · Publisher" suffix
    s = s.replace(/\s*[|·–—]\s*[^|·–—]+$/, '').trim();
    return s;
  }
  function fmtMlaDate(d){
    return d.getUTCDate() + ' ' +
      ['Jan','Feb','Mar','Apr','May','June','July','Aug','Sept','Oct','Nov','Dec'][d.getUTCMonth()] + '. ' +
      d.getUTCFullYear();
  }
  function fmtApaDate(d){
    return d.getUTCFullYear() + ', ' +
      ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getUTCMonth()] + ' ' +
      d.getUTCDate();
  }

  function formatOne(source, today){
    const day = today || new Date();
    const h = host(source.url);
    const t = cleanTitle(source.title, h);
    const p = publisher(h);
    return {
      apa: `${p}. (n.d.). ${t}. Retrieved ${fmtApaDate(day)}, from ${source.url}`,
      mla: `"${t}." ${p}, ${source.url}. Accessed ${fmtMlaDate(day)}.`,
      chi: `${p}. "${t}." Accessed ${fmtMlaDate(day)}. ${source.url}.`,
      url: source.url,
      host: h,
      title: t,
    };
  }

  /** Format an array of `{url, title}` sources for all three styles. */
  function format(sources){
    if (!Array.isArray(sources) || !sources.length) return [];
    const today = new Date();
    return sources.map(s => formatOne(s, today));
  }

  window.oioxoEngines.citations = { format, formatOne };
})();
