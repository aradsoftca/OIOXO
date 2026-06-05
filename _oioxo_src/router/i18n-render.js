/**
 * Locale-aware rendering helpers — formats numbers, currencies, dates,
 * times in the user's locale via the native Intl API. Pure browser, no
 * external library.
 *
 *   number(value, lang)      → "1.234,56" for de, "1,234.56" for en
 *   currency(value, code, lang)
 *   date(date, lang, options)
 *   time(date, lang, options)
 *   relativeTime(date, lang)  → "3 hours ago"
 *
 * Exposes window.oioxoI18nRender = { number, currency, date, time,
 *                                     relativeTime, listFormat }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoI18nRender) return;

  function safe(fn, fallback){
    try { return fn(); } catch { return fallback; }
  }

  function number(value, lang){
    return safe(() => new Intl.NumberFormat(lang || 'en').format(value), String(value));
  }

  function currency(value, code, lang){
    return safe(() => new Intl.NumberFormat(lang || 'en', { style: 'currency', currency: code || 'USD' }).format(value),
      (code || '$') + ' ' + value);
  }

  function date(d, lang, options){
    const dt = d instanceof Date ? d : new Date(d);
    return safe(() => new Intl.DateTimeFormat(lang || 'en', Object.assign({ year: 'numeric', month: 'short', day: 'numeric' }, options || {})).format(dt),
      dt.toISOString().slice(0, 10));
  }

  function time(d, lang, options){
    const dt = d instanceof Date ? d : new Date(d);
    return safe(() => new Intl.DateTimeFormat(lang || 'en', Object.assign({ hour: 'numeric', minute: '2-digit' }, options || {})).format(dt),
      dt.toISOString().slice(11, 16));
  }

  function relativeTime(d, lang){
    const dt = d instanceof Date ? d : new Date(d);
    const dtMs = Date.now() - dt.getTime();
    const abs = Math.abs(dtMs);
    const sign = dtMs < 0 ? 1 : -1;  // future = +, past = -
    const intervals = [
      ['year',   365 * 24 * 3600 * 1000],
      ['month',  30 * 24 * 3600 * 1000],
      ['week',   7 * 24 * 3600 * 1000],
      ['day',    24 * 3600 * 1000],
      ['hour',   3600 * 1000],
      ['minute', 60 * 1000],
      ['second', 1000],
    ];
    for (const [unit, ms] of intervals){
      if (abs >= ms){
        const value = Math.floor(abs / ms) * sign;
        return safe(() => new Intl.RelativeTimeFormat(lang || 'en', { numeric: 'auto' }).format(value, unit),
          Math.abs(value) + ' ' + unit + (Math.abs(value) === 1 ? '' : 's') + (sign < 0 ? ' ago' : ' from now'));
      }
    }
    return 'just now';
  }

  function listFormat(items, lang, type){
    return safe(() => new Intl.ListFormat(lang || 'en', { style: 'long', type: type || 'conjunction' }).format(items),
      items.join(', '));
  }

  window.oioxoI18nRender = { number, currency, date, time, relativeTime, listFormat };
})();
