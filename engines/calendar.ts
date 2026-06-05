/**
 * Calendar / contact conversion (web-based, no library): iCalendar (.ics/.vcs)
 * and vCard (.vcf/.vcard) are line-based text formats — parse their records and
 * emit JSON / CSV / plain text. Handles RFC line-folding and \-escaping.
 */

type Rec = Record<string, string>;

function unfold(text: string): string[] {
  // RFC 5545/2426: a CRLF followed by space/tab continues the previous line.
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function val(v: string): string {
  // Single-pass unescape so `\\n` (escaped backslash + literal n) doesn't get
  // mis-interpreted as `\n` (newline). The previous sequence-of-replaces
  // resolved `\\` last, so any preceding pass that matched `\<letter>` ate
  // the backslash that was meant to be a real one.
  return v.replace(/\\([\\nN,;])/g, (_, c: string) =>
    c === 'n' || c === 'N' ? '\n' : c
  ).trim();
}

/** Parse VEVENT/VTODO (ics) or VCARD (vcf) blocks into flat records. */
export function parseCalendar(text: string): Rec[] {
  const lines = unfold(text);
  const recs: Rec[] = [];
  let cur: Rec | null = null;
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9-]+)(;[^:]*)?:(.*)$/);
    if (!m) continue;
    const key = m[1].toUpperCase();
    const v = m[3];
    if (key === 'BEGIN' && (v === 'VEVENT' || v === 'VTODO' || v === 'VCARD' || v === 'VJOURNAL')) { cur = {}; continue; }
    if (key === 'END' && cur) { if (Object.keys(cur).length) recs.push(cur); cur = null; continue; }
    if (cur && key !== 'BEGIN' && key !== 'END') {
      // keep first occurrence; append extras with an index suffix
      cur[key] = cur[key] === undefined ? val(v) : cur[key];
    }
  }
  return recs;
}

export function toJson(recs: Rec[]): string {
  return JSON.stringify(recs, null, 2);
}

export function toCsv(recs: Rec[]): string {
  const cols = Array.from(new Set(recs.flatMap((r) => Object.keys(r))));
  // CSV-injection guard: a field starting with =, +, -, @ is interpreted as a
  // FORMULA by Excel/LibreOffice when the file is opened. A malicious .vcs
  // with a name like `=cmd|'/c calc'!A1` would then execute. Prefix a single
  // quote — Excel's documented neutralizer — to render it as literal text.
  const esc = (s: string) => {
    const needsPrefix = s.length > 0 && /^[=+\-@\t\r]/.test(s);
    const safe = needsPrefix ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = recs.map((r) => cols.map((c) => esc(r[c] ?? '')).join(','));
  return [cols.join(','), ...rows].join('\n');
}

export function toTxt(recs: Rec[]): string {
  return recs.map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join('\n')).join('\n\n———\n\n');
}
