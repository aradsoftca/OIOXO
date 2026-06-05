/**
 * oioxo engine: date math + holidays-relative + weekday lookup.
 *
 * Pure on-device, zero network. Same parser planned for
 * app/calculators/date-difference. Handles "days until christmas",
 * "days between A and B", "30 days from today", "what day is X".
 *
 * Exposes window.oioxoEngines.datemath = {
 *   parseDate, daysUntil, daysBetween, addDays, weekdayOf
 * }
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoEngines = window.oioxoEngines || {};
  if (window.oioxoEngines.datemath) return;

  const HOLIDAYS = {
    'christmas':'12-25', 'xmas':'12-25', 'christmas day':'12-25', 'christmas eve':'12-24',
    'new year':'01-01', 'new years':'01-01', "new year's":'01-01', 'new years day':'01-01',
    'halloween':'10-31', 'valentine':'02-14', 'valentines':'02-14', "valentine's day":'02-14',
    'independence day':'07-04', 'july 4th':'07-04', '4th of july':'07-04', 'fourth of july':'07-04',
    'bastille day':'07-14', 'canada day':'07-01',
    'st patricks day':'03-17', "st patrick's day":'03-17',
    'cinco de mayo':'05-05', 'boxing day':'12-26', 'april fools':'04-01', 'earth day':'04-22',
  };
  const MONTHS = {
    january:0, jan:0, february:1, feb:1, march:2, mar:2, april:3, apr:3,
    may:4, june:5, jun:5, july:6, jul:6, august:7, aug:7,
    september:8, sep:8, sept:8, october:9, oct:9,
    november:10, nov:10, december:11, dec:11,
  };

  function startOfTodayUTC(){
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  function parseDate(input){
    if (!input) return null;
    let s = String(input).trim().toLowerCase().replace(/\s+/g, ' ').replace(/(\d+)(?:st|nd|rd|th)\b/g, '$1');
    const today = startOfTodayUTC();
    const cy = today.getUTCFullYear();
    if (s === 'today') return new Date(today);
    if (s === 'tomorrow') return new Date(today.getTime() + 86400000);
    if (s === 'yesterday') return new Date(today.getTime() - 86400000);
    if (HOLIDAYS[s]){
      const [mm, dd] = HOLIDAYS[s].split('-').map(Number);
      let d = new Date(Date.UTC(cy, mm - 1, dd));
      if (d < today) d = new Date(Date.UTC(cy + 1, mm - 1, dd));
      return d;
    }
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
    m = s.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
    if (m && m[1] in MONTHS){
      const y = m[3] ? +m[3] : cy;
      return new Date(Date.UTC(y, MONTHS[m[1]], +m[2]));
    }
    m = s.match(/^(\d{1,2})\s+([a-z]+)(?:,?\s+(\d{4}))?$/);
    if (m && m[2] in MONTHS){
      const y = m[3] ? +m[3] : cy;
      return new Date(Date.UTC(y, MONTHS[m[2]], +m[1]));
    }
    return null;
  }

  function daysUntil(target){
    const d = parseDate(target);
    if (!d) return null;
    const today = startOfTodayUTC();
    return Math.round((+d - +today) / 86400000);
  }

  function daysBetween(a, b){
    const da = parseDate(a), db = parseDate(b);
    if (!da || !db) return null;
    return Math.abs(Math.round((+db - +da) / 86400000));
  }

  function addDays(n, fromIso){
    const base = fromIso ? parseDate(fromIso) : startOfTodayUTC();
    if (!base) return null;
    return new Date(+base + n * 86400000);
  }

  function weekdayOf(target){
    const d = parseDate(target);
    if (!d) return null;
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(d);
  }

  function formatDate(d){
    if (!d) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  }

  window.oioxoEngines.datemath = { parseDate, daysUntil, daysBetween, addDays, weekdayOf, formatDate, HOLIDAYS };
})();
