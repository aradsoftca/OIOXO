/**
 * The old xonvert served ~3.8k converter pages at the ROOT (`/cfg-to-txt`,
 * `/ani-to-cur`…). Google indexed them; the rewrite dropped them all to 404
 * and search traffic went with them. Each old URL now 308s to the closest
 * living page: its /convert pair, else the tool the conversion matrix routes
 * FROM→TO to, else a tool that handles FROM at all, else the /convert hub.
 */
import { TOOLS } from '@/lib/registry';
import { getPair } from '@/lib/convert/pairs';
import { targetsFor } from '@/lib/convert/matrix';

export const LEGACY_PAIR_RE = /^([a-z0-9]{1,12})-to-([a-z0-9]{1,12})$/;

const ALIASES: Record<string, string[]> = {
  jpg: ['jpg', 'jpeg'], jpeg: ['jpg', 'jpeg'], tif: ['tif', 'tiff'], tiff: ['tif', 'tiff'],
  htm: ['htm', 'html'], html: ['htm', 'html'], md: ['md', 'markdown'], yml: ['yml', 'yaml'],
  yaml: ['yml', 'yaml'], mpg: ['mpg', 'mpeg'], txt: ['txt', 'plain'],
};

/** Spelling the /convert pages use for an aliased extension (jpeg-to-png → jpg-to-png). */
const CANONICAL: Record<string, string> = { jpeg: 'jpg', tif: 'tiff', htm: 'html', mpeg: 'mpg', yml: 'yaml', markdown: 'md' };

/** Old slugs that are not `{ext}-to-{ext}` (or whose spelling differs from the page). */
const SPECIAL: Record<string, string> = {
  'word-to-pdf': '/convert/docx-to-pdf',
  'pdf-to-word': '/convert/pdf-to-docx',
  'pdf-to-docx': '/convert/pdf-to-docx',
  'pdf-to-doc': '/convert/pdf-to-docx',
};

function names(ext: string): string[] {
  return ALIASES[ext] ?? [ext];
}

/** Does a manifest accepts/produces entry ('.dwg', 'dwg', 'image/png', 'image/*') name this format? */
function entryMatches(entry: string, ext: string): boolean {
  const e = entry.toLowerCase().trim();
  return names(ext).some((n) => e === n || e === `.${n}` || e.endsWith(`/${n}`) || e.endsWith(`/x-${n}`) || e.endsWith(`.${n}`));
}

function handles(list: string[] | undefined, ext: string): boolean {
  return !!list?.some((x) => entryMatches(x, ext));
}

export function legacyDestination(slug: string): string {
  const m = LEGACY_PAIR_RE.exec(slug.toLowerCase());
  if (!m) return '/convert';
  const special = SPECIAL[slug.toLowerCase()];
  if (special) return special;
  const [, from, to] = m;
  if (getPair(`${from}-to-${to}`)) return `/convert/${from}-to-${to}`;
  const canon = `${CANONICAL[from] ?? from}-to-${CANONICAL[to] ?? to}`;
  if (getPair(canon)) return `/convert/${canon}`;
  const live = (id: string) => TOOLS.some((t) => t.id === id);
  const routes = targetsFor(from).filter((t) => live(t.toolId));
  const direct = routes.find((t) => names(to).includes(t.to));
  if (direct) return `/tools/${direct.toolId}`;
  if (routes.length) {
    const any = routes.find((t) => t.toolId === 'convert-anything') ?? routes[0];
    return `/tools/${any.toolId}`;
  }
  // Only converters: "any tool that accepts mp4" sent mp4-to-mp3 to noise removal.
  const takes = TOOLS.filter((t) => t.id.includes('convert') && handles(t.accepts, from));
  const exact = takes.find((t) => handles((t as { produces?: string[] }).produces, to));
  if (exact) return `/tools/${exact.id}`;
  if (takes.length) return `/tools/${takes[0].id}`;
  return '/convert';
}
