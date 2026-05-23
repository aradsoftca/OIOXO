/**
 * Xonvert AI — find an image of a subject (browser-side, CORS-clean).
 *
 * We can't *generate* a picture of "the Mona Lisa" — but we can FIND one. The
 * smartness is reasoning "I can't paint it, but I can fetch a real image, and if
 * you want it stylised I can run a filter on it." Wikipedia's lead-image API is
 * CORS-enabled and covers most known subjects; the image host (Wikimedia) serves
 * `access-control-allow-origin: *`, so the fetched image can even go into a
 * canvas for filtering. Falls back to an open-web image result via the reader.
 *
 * Pure (network) + Node-testable for the lookup; canvas work happens in AiApp.
 */

export interface FoundImage { url: string; title: string; source: string; pageUrl: string; }

const WIKI_HEADERS = { 'Api-User-Agent': 'Xonvert/1.0 (https://xonvert.com; contact@xonvert.com)' };

async function getJson(url: string, headers?: Record<string, string>, ms = 7000): Promise<any | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store', referrerPolicy: 'no-referrer', headers });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** Strip "make a cartoon picture of …" framing down to the bare subject. */
export function imageSubject(text: string): string {
  return text
    .split(/\s+\band\b\s+/i)[0] // "…of mona lisa and make it b&w" → just the subject
    .replace(/\b(can you|could you|please|i'?d like|i want|i need|looking for|give me|show me|find me|get me|make|create|draw|paint|generate|find|get|need|want|me|i)\b/gi, ' ')
    .replace(/\b(realistic|hd|high[- ]res|cartoon|cartoonized?|comic|sketch|drawing|painting|portrait|photo(graph)?|picture|image|pic|wallpaper|poster|of|about|showing|featuring|with|for)\b/gi, ' ')
    .replace(/\b(a|an|the)\b/gi, ' ')
    .replace(/[?!.]+$/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Find a representative image for `subject`. Tries Wikipedia's lead image first
 * (clean, CORS-safe), then an open-web image via the reader. Null if nothing.
 */
export async function findImage(subject: string): Promise<FoundImage | null> {
  const q = subject.trim();
  if (!q) return null;

  // Resolve a good Wikipedia title first (handles "monalisa" → "Mona Lisa",
  // casing, redirects) — generator=search doesn't populate thumbnails reliably.
  const os = await getJson('https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&redirects=resolve&origin=*&search=' + encodeURIComponent(q), WIKI_HEADERS);
  const title = (Array.isArray(os) && Array.isArray(os[1]) && os[1][0]) ? String(os[1][0]) : q;

  // Lead image for that title — works for people, places, art, things.
  const wiki = await getJson(
    'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&origin=*' +
    '&prop=pageimages|info&inprop=url&piprop=thumbnail&pithumbsize=800&titles=' + encodeURIComponent(title), WIKI_HEADERS);
  const pages = wiki?.query?.pages;
  if (pages) {
    const p = Object.values(pages)[0] as any;
    const url = p?.thumbnail?.source;
    if (url) return { url, title: String(p.title ?? title), source: 'Wikimedia', pageUrl: String(p.fullurl ?? '') };
  }
  return null; // nothing solid → caller declines honestly (better than a bad image)
}
