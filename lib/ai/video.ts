/**
 * oioxo AI — video search + transcript-as-evidence (ANSWER_BRAIN.md §5).
 *
 * The frontier-beater: a text chat model can't WATCH a video, but we can read
 * what's SAID in one. For how-to / explain questions we find a relevant video,
 * pull its transcript/description as TEXT (just another source), let the answer
 * use it (cited, with a link), and embed the player. We never run a vision model
 * — we show and transcribe media, we don't "see" pixels.
 *
 * Everything is best-effort and degrades to nothing: video hosting + CORS make
 * transcripts unreliable, so the answer never depends on them.
 */
import { searchWeb, readPageText } from './web-read';
import type { SearchSource } from './search';

export interface VideoHit {
  title: string;
  url: string;
  site: string;
  /** Thumbnail URL when we can derive one (YouTube), else undefined. */
  thumbnail?: string;
}

const VIDEO_HOST = /(?:^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)$/i;

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Pull a YouTube video id from any of its URL forms, for the thumbnail. */
function youtubeId(url: string): string | null {
  const m = url.match(/[?&]v=([\w-]{6,})/) || url.match(/youtu\.be\/([\w-]{6,})/) || url.match(/\/embed\/([\w-]{6,})/);
  return m ? m[1] : null;
}

/**
 * Find relevant videos for a query. Searches the web and keeps results on known
 * video hosts; derives a YouTube thumbnail where possible. The "watch a tutorial"
 * affordance for how-to/explain answers.
 */
export async function findVideos(query: string, n = 2): Promise<VideoHit[]> {
  const results = await searchWeb(`${query} video tutorial`, 12).catch(() => []);
  const out: VideoHit[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const site = hostOf(r.url);
    if (!VIDEO_HOST.test(site) || seen.has(r.url)) continue;
    seen.add(r.url);
    const id = youtubeId(r.url);
    out.push({ title: r.title, url: r.url, site, thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined });
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Best-effort transcript/description for a video as plain text (read through the
 * reader). Returns the text + a citation, or null. The answer can fold this into
 * its brief like any other source — but never depends on it.
 */
export async function videoTranscript(v: VideoHit): Promise<{ text: string; source: SearchSource } | null> {
  const page = await readPageText(v.url, 9000).catch(() => null);
  if (!page) return null;
  // Keep the substantial prose lines (drop nav/markdown chrome); a transcript or
  // a rich description gives the answer real spoken/explanatory content.
  const lines = page
    .split('\n')
    .map((l) => l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`|]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 50 && /[a-z]/i.test(l) && !/^(http|url source|title|subscribe|sign in|cookie|menu|skip to)/i.test(l));
  const text = lines.join(' ').slice(0, 1200);
  if (text.length < 120) return null;
  return { text, source: { title: v.title, url: v.url, site: v.site } };
}

/**
 * Does this question benefit from a video? A how-to / process / "show me how"
 * request is the clear case. THIN floor — the trained encoder's media-need flag
 * refines it. Structural, not a topic list.
 */
export function wantsVideo(text: string, shape?: string): boolean {
  if (shape === 'howto' || shape === 'recipe') return true;
  return /\b(how (to|do|can|does)|tutorial|step by step|show me how|guide to|learn to)\b/i.test(text);
}
