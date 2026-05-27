/**
 * stack-read — read real Q&A ANSWERS on the user's device from the Stack Exchange
 * network (Stack Overflow, Super User, Server Fault, Ask Ubuntu, …) via its
 * CORS-open API. `api.stackexchange.com` sends `Access-Control-Allow-Origin: *` and,
 * with `filter=withbody`, returns the full HTML body of the top-voted/accepted
 * answer — so the browser reads the ACTUAL answer, not a snippet or a Wikipedia
 * definition. No proxy, no key, no server of ours (keyless quota is per-IP, ~300/day
 * — plenty for one user). This is the reliable reader for the "how do I … (code /
 * error / config)" family, where the answer lives in a Stack answer.
 *
 * Why a site API and not Common Crawl: CC's index server is frequently overloaded
 * (reads hang/miss), so for the highest-value source we use its own fast API and
 * keep CC as the general best-effort fallback elsewhere.
 */

export interface StackAnswer {
  title: string;
  /** Clean plain text of the top answer (code blocks kept inline). */
  text: string;
  url: string;
  site: string;
  /** Answer score (upvotes) — a ranking signal, like Reddit votes. */
  score: number;
}

interface SeSearchItem { question_id: number; title: string; link: string; score: number; is_answered: boolean; accepted_answer_id?: number; }
interface SeAnswerItem { question_id: number; answer_id: number; body?: string; score: number; is_accepted: boolean; }
interface SeWrap<T> { items?: T[]; }

/** Strip answer HTML to readable text, keeping code/list content as plain prose. */
function htmlToText(html: string): string {
  return html
    .replace(/<pre[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi, ' $1 ')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, ' $1 ')
    .replace(/<\/(p|li|h\d|div|blockquote)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#?[a-z0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

const API = 'https://api.stackexchange.com/2.3';

async function getJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', signal });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Read the best answers for a query from a Stack Exchange site. Two CORS-open calls:
 * search the top questions, then fetch their top-voted answer bodies. Returns one
 * StackAnswer per question (its strongest answer), newest signal = highest score.
 * Best-effort: any failure yields []. `site` defaults to stackoverflow (programming).
 */
export async function stackExchangeRead(
  query: string,
  opts: { site?: string; max?: number; timeoutMs?: number } = {},
): Promise<StackAnswer[]> {
  const { site = 'stackoverflow', max = 3, timeoutMs = 8000 } = opts;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const sUrl =
      `${API}/search/advanced?order=desc&sort=relevance&answers=1&site=${site}` +
      `&q=${encodeURIComponent(query)}&pagesize=${max}&filter=default`;
    const search = await getJson<SeWrap<SeSearchItem>>(sUrl, ctl.signal);
    const questions = (search?.items ?? []).filter((q) => q.is_answered).slice(0, max);
    if (!questions.length) return [];

    const ids = questions.map((q) => q.question_id).join(';');
    const aUrl =
      `${API}/questions/${ids}/answers?order=desc&sort=votes&site=${site}` +
      `&pagesize=${max * 3}&filter=withbody`;
    const ans = await getJson<SeWrap<SeAnswerItem>>(aUrl, ctl.signal);
    const answers = ans?.items ?? [];
    if (!answers.length) return [];

    // Best answer per question: accepted first, else highest score.
    const best = new Map<number, SeAnswerItem>();
    for (const a of answers) {
      const cur = best.get(a.question_id);
      if (!cur || (a.is_accepted && !cur.is_accepted) || (a.is_accepted === cur.is_accepted && a.score > cur.score)) {
        best.set(a.question_id, a);
      }
    }

    const out: StackAnswer[] = [];
    for (const q of questions) {
      const a = best.get(q.question_id);
      if (!a?.body) continue;
      const text = htmlToText(a.body);
      if (text.length < 60) continue;
      out.push({ title: q.title, text: text.slice(0, 4000), url: q.link, site: `${site}.com`, score: a.score });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
