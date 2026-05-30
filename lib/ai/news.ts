/**
 * news — today's headlines, in the user's language, from a CORS-clean source.
 *
 * Embodies the locale vision: our sources are thin in many languages (the Arabic
 * Wikimedia "news" feed is often EMPTY), so we fetch the RICH English feed and let
 * the respond() translation shell render it in the user's language — a Riyadh user
 * gets today's world news in Arabic, sourced from English. GDELT (true geo-local
 * news) is CORS-blocked; the Wikimedia featured feed is CORS-open (ACAO:*), no key.
 *
 * General news only ("news", "headlines", "what's happening"). "news ABOUT X" is
 * topical and falls through to the researcher's recency + cross-lingual gather.
 */

const NEWS_RE = /\b(latest news|today'?s news|breaking news|the news|world news|headlines?|current events|what(?:'?s| is) happening|whats happening|any news)\b/i;
const TOPICAL = /\bnews\s+(about|on|regarding|of|for)\s+\S/i;

/** Is this a request for general headlines (not "news about <topic>")? */
export function isNewsQuery(q: string): boolean {
  const t = q.trim();
  if (TOPICAL.test(t)) return false;                         // topical → researcher
  if (NEWS_RE.test(t)) return true;
  return /^\s*news\b/i.test(t) || /\bnews\s*$/i.test(t);      // bare "news"
}

const strip = (s?: string) => (s || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

async function feed(lang: string, date: Date): Promise<string[]> {
  const d = date.toISOString().slice(0, 10).replace(/-/g, '/');
  try {
    const r = await fetch(`https://api.wikimedia.org/feed/v1/wikipedia/${lang}/featured/${d}`, {
      cache: 'no-store', headers: { 'Api-User-Agent': 'oioxo/1.0 (https://oioxo.com)' },
    });
    if (!r.ok) return [];
    const j = await r.json() as { news?: { story?: string }[] };
    return (j.news ?? []).map((n) => strip(n.story)).filter((s) => s.length > 25);
  } catch { return []; }
}

/** Today's headlines as a short list (English; the shell translates to the user's
 *  language). Tries the rich English feed; falls back a day if today is empty. null
 *  when nothing → normal flow. */
export async function newsAnswer(query: string): Promise<{ text: string; source: { title: string; url: string; site: string } } | null> {
  if (!isNewsQuery(query)) return null;
  const now = new Date();
  let stories = await feed('en', now);
  if (!stories.length) stories = await feed('en', new Date(now.getTime() - 864e5)); // yesterday
  if (!stories.length) return null;
  const list = stories.slice(0, 6).map((s) => `• ${s}`).join('\n');
  return {
    text: `Here are today's top headlines:\n${list}`,
    source: { title: 'In the news — Wikipedia', url: 'https://en.wikipedia.org/wiki/Portal:Current_events', site: 'wikipedia.org' },
  };
}
