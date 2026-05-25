/**
 * oioxo Code (OIOXO_CODE.md §2 step 2) — SEARCH to solve problems the model
 * doesn't know. When the loop is stuck on an error, we search the web for it and
 * fold the findings back into the repair context — so a small on-device model can
 * resolve real, unfamiliar errors (the "magical" capability: small model + search).
 *
 * Browser web search reuses the platform's CORS-clean reader (lib/ai/web-read).
 * `errorQuery` (pure) turns a raw error into a good query; Node-testable.
 */
import { searchWeb, readPageText } from '@/lib/ai/web-read';

/** Turn a raw compiler/runtime error into a concise, searchable query: the most
 *  salient line, with file paths / line numbers / quotes stripped. */
export function errorQuery(error: string): string {
  const lines = error.split('\n').map((l) => l.trim()).filter(Boolean);
  const salient =
    lines.find((l) => /\b(error|not defined|is not a function|cannot find|undefined|unexpected|TypeError|ReferenceError|SyntaxError|RangeError|TS\d{3,})\b/i.test(l)) ||
    lines[0] || '';
  return salient
    .replace(/\s+@\s*\S+/g, '')          // drop "@ file:line"
    .replace(/\(?\/?[\w./-]+:\d+(:\d+)?\)?/g, '') // drop path:line:col
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Search the web for a stuck error and return a compact digest (top results +
 * a readable extract from the best one) to fold into the next repair. Narrates
 * each step via `onNote` so the user watches it research. Bounded + safe.
 */
export async function searchForError(error: string, onNote?: (s: string) => void): Promise<string> {
  const q = errorQuery(error);
  if (!q) return '';
  onNote?.(`\n🔎 stuck — searching the web: "${q}"\n`);
  const results = await searchWeb(q, 4).catch(() => []);
  if (!results.length) { onNote?.('  no results found\n'); return ''; }
  for (const r of results.slice(0, 3)) onNote?.(`  • ${r.title}\n`);
  let detail = '';
  try {
    const page = await readPageText(results[0].url);
    if (page) detail = page.slice(0, 1200);
  } catch { /* */ }
  const digest =
    results.slice(0, 3).map((r) => `- ${r.title}: ${r.snippet}`).join('\n') +
    (detail ? `\n\nFrom ${results[0].url}:\n${detail}` : '');
  onNote?.('  applying what I found…\n');
  return digest.slice(0, 1800);
}
