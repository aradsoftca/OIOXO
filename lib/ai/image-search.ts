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

/**
 * Find SEVERAL related images for a query — the little thumbnail row shown under
 * an answer (like a frontier model's image strip). Source doesn't matter; we use
 * Openverse (free, keyless, CORS-enabled) which aggregates many providers for
 * broad coverage on ANY query, and fall back to Wikimedia Commons. Returns clean
 * thumbnail URLs in relevance order. Always degrades to [] on any failure.
 */
export async function findImages(query: string, n = 4): Promise<FoundImage[]> {
  const q0 = query.trim();
  if (!q0) return [];
  const out: FoundImage[] = [];
  const seen = new Set<string>();
  const push = (img: FoundImage | null) => {
    if (img && img.url && !seen.has(img.url)) {
      seen.add(img.url);
      out.push(img);
    }
  };

  // 1) UNDERSTAND the subject first: resolve to a canonical Wikipedia title,
  //    which fixes typos/casing ("michel jordan" → "Michael Jordan") and
  //    disambiguates — so we search for the RIGHT thing, not a literal keyword.
  const os = await getJson(
    'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&redirects=resolve&origin=*&search=' +
      encodeURIComponent(q0), WIKI_HEADERS);
  const title = Array.isArray(os) && Array.isArray(os[1]) && os[1][0] ? String(os[1][0]) : q0;

  // 2) The CANONICAL image of the entity, first (its real photo).
  push(await findImage(q0));

  // 3) More real photos of the corrected entity — Wikimedia Commons.
  const commons = await getJson(
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
      '&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=' + encodeURIComponent(title) +
      '&prop=imageinfo&iiprop=url|mime&iiurlwidth=400', WIKI_HEADERS);
  const pages = commons?.query?.pages;
  if (pages) {
    const rows = (Object.values(pages) as any[]).filter((p) => p?.imageinfo?.[0]).sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9));
    for (const p of rows) {
      const info = p.imageinfo[0];
      if (!/^image\/(jpeg|png|webp|jpg)$/i.test(String(info.mime ?? ''))) continue;
      push({ url: info.thumburl || info.url, title: String(p.title ?? '').replace(/^File:/, ''), source: 'Wikimedia Commons', pageUrl: String(info.descriptionurl ?? '') });
      if (out.length >= n) break;
    }
  }

  // 4) Supplement with Openverse (broad, keyless) for variety / non-entity queries.
  if (out.length < n) {
    const ov = await getJson('https://api.openverse.org/v1/images/?page_size=' + (n + 8) + '&q=' + encodeURIComponent(title));
    for (const r of Array.isArray(ov?.results) ? ov.results : []) {
      push({ url: r?.thumbnail || r?.url, title: String(r.title ?? title), source: String(r.source ?? 'web'), pageUrl: String(r.foreign_landing_url ?? r.url ?? '') });
      if (out.length >= n) break;
    }
  }
  return out.slice(0, n);
}
