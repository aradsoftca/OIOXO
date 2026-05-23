/**
 * Xonvert AI — inline time tools.
 *
 * Pure date/time answers in the chat: explain a cron expression (+ next runs),
 * convert a Unix timestamp to a date, give the current timestamp, or the current
 * time in ISO-8601. Pattern-matched like the calculators (runs before the
 * general-question guard so these don't get sent to the chat model). Pure /
 * DOM-free and Node-testable.
 */

import { describeCron, nextRuns } from '@/engines/time';

export const TIME_IDS = ['time-cron', 'time-unix-timestamp', 'time-iso-8601', 'time-world-clock', 'time-timezone'];
export function isTimeOp(id: string): boolean { return TIME_IDS.includes(id); }

// Common cities → IANA zones for "what time is it in …".
const TZ: Record<string, string> = {
  utc: 'UTC', gmt: 'UTC', london: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin',
  madrid: 'Europe/Madrid', rome: 'Europe/Rome', moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul',
  'new york': 'America/New_York', chicago: 'America/Chicago', denver: 'America/Denver',
  'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', toronto: 'America/Toronto',
  'sao paulo': 'America/Sao_Paulo', tokyo: 'Asia/Tokyo', seoul: 'Asia/Seoul', beijing: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai', 'hong kong': 'Asia/Hong_Kong', singapore: 'Asia/Singapore', dubai: 'Asia/Dubai',
  mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', tehran: 'Asia/Tehran', sydney: 'Australia/Sydney', auckland: 'Pacific/Auckland',
};
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

const pad = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

export function tryTime(text: string): { tool: string; result: string } | null {
  const lc = text.toLowerCase();

  // Cron: "explain cron */5 * * * *" → description + next runs.
  if (/\bcron\b|schedule expression/.test(lc)) {
    const m = text.match(/([\d*/,\-]+\s+[\d*/,\-]+\s+[\d*/,\-]+\s+[\d*/,\-]+\s+[\d*/,\-]+)/);
    if (m) {
      try {
        const expr = m[1].trim();
        const next = nextRuns(expr, Date.now(), 3).map((d) => d.toISOString().slice(0, 16).replace('T', ' '));
        return { tool: 'time-cron', result: `${describeCron(expr)}\nNext runs: ${next.join(' · ')}` };
      } catch { /* not a valid cron — fall through */ }
    }
  }

  // Unix timestamp → date.
  const ts = text.match(/\b(\d{9,13})\b/);
  if (ts && /(timestamp|unix|epoch|to (?:a )?date|to datetime|as a date)/i.test(lc)) {
    const n = ts[1].length <= 10 ? +ts[1] * 1000 : +ts[1];
    const d = new Date(n);
    if (!isNaN(+d)) return { tool: 'time-unix-timestamp', result: `${ts[1]} = ${pad(d)}` };
  }

  // Current timestamp.
  if (/(current|now|today).*(timestamp|unix|epoch)|\b(timestamp now|unix time(?:stamp)?)\b/i.test(lc)) {
    return { tool: 'time-unix-timestamp', result: `Current Unix timestamp: ${Math.floor(Date.now() / 1000)}` };
  }

  // Current time in ISO-8601.
  if (/iso ?-?8601|iso date|iso time|now in iso|current time in iso/i.test(lc)) {
    return { tool: 'time-iso-8601', result: new Date().toISOString() };
  }

  // World clock: "what time is it in Tokyo".
  if (/\btime\b|world clock|time ?zone/.test(lc)) {
    for (const [city, zone] of Object.entries(TZ)) {
      if (new RegExp(`\\b${city}\\b`).test(lc)) {
        const t = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date());
        return { tool: 'time-world-clock', result: `${titleCase(city)}: ${t} (${zone})` };
      }
    }
  }

  return null;
}
