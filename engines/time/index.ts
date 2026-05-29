/**
 * Cron expression parser + next-run calculator. Supports standard 5-field
 * (minute hour day month day-of-week) syntax with *, lists, ranges, steps.
 */

interface CronField {
  values: Set<number>;
  any: boolean;
}

function parseField(spec: string, min: number, max: number): CronField {
  if (spec === '*') return { values: new Set(), any: true };
  const values = new Set<number>();
  for (const part of spec.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    let baseSpec = part;
    let step = 1;
    if (stepMatch) {
      baseSpec = stepMatch[1];
      step = parseInt(stepMatch[2], 10);
      // Guard against `*/0` — without this the iterator loop below spins
      // forever (v += 0) and hangs the tab on a malformed cron expression.
      if (!Number.isFinite(step) || step <= 0) step = 1;
    }
    let lo = min, hi = max;
    if (baseSpec === '*') {
      // covers full range
    } else if (baseSpec.includes('-')) {
      const [a, b] = baseSpec.split('-').map(Number);
      lo = a; hi = b;
    } else {
      lo = hi = parseInt(baseSpec, 10);
    }
    for (let v = lo; v <= hi; v += step) {
      if (v >= min && v <= max) values.add(v);
    }
  }
  return { values, any: false };
}

export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  day: CronField;
  month: CronField;
  weekday: CronField;
}

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('Cron must have 5 fields: minute hour day month weekday');
  return {
    minute:  parseField(parts[0], 0, 59),
    hour:    parseField(parts[1], 0, 23),
    day:     parseField(parts[2], 1, 31),
    month:   parseField(parts[3], 1, 12),
    weekday: parseField(parts[4], 0, 6),
  };
}

function fieldMatches(field: CronField, value: number): boolean {
  return field.any || field.values.has(value);
}

export function nextRuns(expr: string, fromMs: number, count: number, tz?: string): Date[] {
  void tz; // future: timezone-aware computation
  const parsed = parseCron(expr);
  const runs: Date[] = [];
  const start = new Date(Math.ceil(fromMs / 60_000) * 60_000);
  const cursor = new Date(start);
  // hard cap iteration to one year worth of minutes
  for (let i = 0; i < 525_960 && runs.length < count; i++) {
    if (
      fieldMatches(parsed.minute,  cursor.getMinutes()) &&
      fieldMatches(parsed.hour,    cursor.getHours()) &&
      fieldMatches(parsed.day,     cursor.getDate()) &&
      fieldMatches(parsed.month,   cursor.getMonth() + 1) &&
      fieldMatches(parsed.weekday, cursor.getDay())
    ) {
      runs.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return runs;
}

export function describeCron(expr: string): string {
  try {
    parseCron(expr);
    const [m, h, d, mo, w] = expr.trim().split(/\s+/);
    const parts: string[] = [];
    if (m === '0' && h === '0' && d === '*' && mo === '*' && w === '*') return 'Every day at midnight';
    if (m === '*' && h === '*' && d === '*' && mo === '*' && w === '*') return 'Every minute';
    if (m === '0' && h === '*' && d === '*' && mo === '*' && w === '*') return 'Every hour, on the hour';
    if (h === '*' && d === '*' && mo === '*' && w === '*') return `Every hour at minute ${m}`;
    parts.push(m === '*' ? 'every minute' : `at minute ${m}`);
    if (h !== '*') parts.push(`hour ${h}`);
    if (d !== '*') parts.push(`day ${d}`);
    if (mo !== '*') parts.push(`month ${mo}`);
    if (w !== '*') parts.push(`weekday ${w}`);
    return parts.join(', ');
  } catch {
    return '— invalid expression —';
  }
}
