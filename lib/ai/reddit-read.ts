/**
 * reddit-read — read Reddit from the user's device, no install, no proxy.
 *
 * Reddit doesn't send CORS for its JSON, but it DOES support JSONP, and a
 * <script> tag bypasses CORS entirely (see ./jsonp). So we search Reddit and
 * read whole threads' comments on-device — the real owner/forum opinions that a
 * frozen model can't have. This is the "answer hidden in a forum" source.
 *
 * Rate limits are per the user's own IP (each browser is a separate client), so
 * this scales with users instead of funnelling through one of our keys.
 */
import { jsonpGet } from './jsonp';

export interface RedditPost {
  title: string;
  selftext: string;
  permalink: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
}
export interface RedditComment { body: string; score: number; }

interface Listing<T> { data?: { children?: { kind: string; data: T }[] } }

/** Search Reddit, newest-relevant first. Keeps posts with real discussion. */
export async function redditSearch(query: string, opts: { limit?: number; sort?: 'relevance' | 'top' | 'comments'; minComments?: number } = {}): Promise<RedditPost[]> {
  const { limit = 8, sort = 'relevance', minComments = 3 } = opts;
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=${sort}&t=all`;
  try {
    const j = await jsonpGet<Listing<RedditPost>>(url, { extra: { raw_json: '1' } });
    return (j.data?.children ?? [])
      .map((c) => c.data)
      .filter((p) => p && p.num_comments >= minComments)
      .sort((a, b) => b.num_comments - a.num_comments);
  } catch {
    return [];
  }
}

/** Pull the top real comments of a thread (by its permalink). */
export async function redditComments(permalink: string, opts: { limit?: number } = {}): Promise<RedditComment[]> {
  const { limit = 40 } = opts;
  const url = `https://www.reddit.com${permalink}.json?limit=${limit}&sort=top`;
  try {
    // The thread endpoint returns [postListing, commentListing].
    const j = await jsonpGet<[unknown, Listing<RedditComment & { body?: string }>]>(url, { extra: { raw_json: '1' } });
    const children = j?.[1]?.data?.children ?? [];
    return children
      .map((c) => c.data)
      .filter((d): d is RedditComment => !!d && typeof d.body === 'string' && d.body.length > 40 && d.body !== '[deleted]' && d.body !== '[removed]')
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export interface RedditEvidence { text: string; score: number; source: { title: string; url: string; site: string } }

/**
 * The high-level "what do real people say about X" gatherer: search → read the
 * top few threads' comments → return them as evidence (text + score + citation)
 * for the reading machine to rank/extract. All on-device via JSONP.
 */
export async function redditOpinions(query: string, opts: { threads?: number; perThread?: number } = {}): Promise<RedditEvidence[]> {
  const { threads = 3, perThread = 6 } = opts;
  const posts = await redditSearch(query, { limit: 10 });
  const top = posts.slice(0, threads);
  const out: RedditEvidence[] = [];
  await Promise.all(
    top.map(async (p) => {
      const src = { title: p.title, url: `https://www.reddit.com${p.permalink}`, site: `reddit.com/r/${p.subreddit}` };
      // the post's own self-text is evidence too (the question / OP's take)
      if (p.selftext && p.selftext.length > 60) out.push({ text: p.selftext, score: p.score, source: src });
      const comments = await redditComments(p.permalink, { limit: perThread });
      for (const c of comments) out.push({ text: c.body, score: c.score, source: src });
    }),
  );
  return out;
}
