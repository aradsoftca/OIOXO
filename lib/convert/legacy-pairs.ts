/**
 * Dedicated /convert pages for conversions the OLD site ranked for at the root
 * (`/vob-to-avi`, `/pem-to-der`…). Their 308 used to land on a generic hub,
 * which Google reads as a soft 404; now each lands on a page about exactly
 * that conversion (legacyDestination() prefers an existing pair).
 *
 * Every entry is a route that lib/convert/matrix.ts targetsFor(from) offers
 * AND that convertFile() really executes (see scripts/legacy_pair_plan.ts,
 * which regenerates the candidate list from scripts/legacy_pairs_gsc.json).
 * convert-anything runs convertFile() for any matrix target and preselects the
 * page's target, so it backs all of them.
 *
 * Deliberately NOT here although the matrix lists them (LEGACY_EXCLUDED):
 *   - fonts: targetsFor offers ttf/otf/woff/woff2 but convertFile has no
 *     'font' case (it throws), and font-convert only writes opentype.js output.
 *   - html/md/tex → image/pdf: the text renderer strips tags and draws the
 *     SOURCE text; people searching these want the rendered page/formula.
 *   - ts: the matrix treats .ts as TypeScript text, the searches mean MPEG-TS.
 *   - key: an old-site "key" is usually Keynote; a private key → .crt is not a thing.
 */
import type { ConvertPair } from '@/lib/convert/pairs';
import type { Category } from '@/lib/registry/types';

/** Human name of each format, used in titles and descriptions. */
const NAMES: Record<string, string> = {
  '7z': '7-Zip archive', zip: 'ZIP archive', lzh: 'LZH archive',
  ai: 'Adobe Illustrator artwork', psb: 'Photoshop large document', ico: 'Windows icon',
  jpg: 'JPG image', png: 'PNG image', gif: 'GIF', tiff: 'TIFF image', avif: 'AVIF image',
  aiff: 'AIFF audio', m4a: 'M4A audio', mp3: 'MP3 audio', wav: 'WAV audio', oga: 'Ogg audio',
  opus: 'Opus audio', flac: 'FLAC audio', aac: 'AAC audio', wma: 'Windows Media Audio',
  asf: 'ASF video', avi: 'AVI video', '3gp': '3GP mobile video', mkv: 'MKV video', mp4: 'MP4 video',
  divx: 'DivX video', flv: 'FLV video', m2ts: 'Blu-ray M2TS video', m4v: 'M4V video',
  mov: 'QuickTime MOV video', mpg: 'MPEG video', mts: 'AVCHD MTS video', ogv: 'Ogg video',
  rm: 'RealMedia video', vob: 'DVD VOB video', webm: 'WebM video', wmv: 'Windows Media Video',
  cer: 'CER certificate', crt: 'CRT certificate', pem: 'PEM certificate', der: 'DER certificate',
  conf: 'config file', ini: 'INI settings file', sql: 'SQL script', yaml: 'YAML file',
  pdf: 'PDF', txt: 'plain text', csv: 'CSV', json: 'JSON',
  docx: 'Word document', odt: 'OpenDocument text', xlsx: 'Excel spreadsheet', eml: 'email message',
  ics: 'iCalendar file', vcs: 'vCalendar file', vcf: 'vCard contacts', vcard: 'vCard contacts',
  ldif: 'LDIF directory export',
};

const IMAGE = new Set(['ai', 'psb', 'ico', 'tiff', 'png', 'avif']);
const AUDIO = new Set(['aiff', 'oga', 'opus', 'wma']);
const VIDEO = new Set(['asf', 'avi', 'divx', 'flv', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpg', 'mts', 'ogv', 'rm', 'vob', 'webm', 'wmv']);
const TEXT_RENDER = new Set(['conf', 'ini', 'sql', 'yaml']);
const CERT = new Set(['cer', 'crt', 'pem', 'der']);

/** [from, to] — historical Search Console pairs the product really performs. */
export const LEGACY_PAIR_LIST: ReadonlyArray<readonly [string, string]> = [
  ['7z', 'zip'], ['lzh', 'zip'],
  ['ai', 'jpg'], ['psb', 'jpg'], ['ico', 'gif'], ['png', 'tiff'], ['tiff', 'jpg'],
  ['avif', 'mp4'], ['tiff', 'mp4'],
  ['aiff', 'm4a'], ['oga', 'mp3'], ['opus', 'flac'], ['wma', 'wav'],
  ['asf', 'mp3'], ['mp4', 'wav'], ['mts', 'wav'], ['rm', 'aac'], ['webm', 'opus'],
  ['avi', '3gp'], ['avi', 'mkv'], ['divx', 'flv'], ['divx', 'mp4'], ['flv', '3gp'],
  ['m2ts', 'avi'], ['m2ts', 'mkv'], ['m4v', 'avi'], ['m4v', 'mkv'], ['mkv', 'flv'], ['mov', 'mkv'],
  ['mpg', 'avi'], ['mpg', 'mov'], ['mts', 'avi'], ['ogv', 'mkv'], ['vob', 'avi'], ['wmv', 'flv'],
  ['divx', 'gif'], ['wmv', 'gif'],
  ['cer', 'crt'], ['cer', 'pem'], ['crt', 'cer'], ['crt', 'pem'], ['der', 'cer'], ['der', 'pem'],
  ['pem', 'cer'], ['pem', 'crt'], ['pem', 'der'],
  ['conf', 'jpg'], ['conf', 'pdf'], ['conf', 'png'], ['ini', 'jpg'], ['sql', 'jpg'], ['sql', 'png'],
  ['yaml', 'jpg'], ['yaml', 'png'],
  ['docx', 'pdf'], ['odt', 'pdf'], ['xlsx', 'csv'], ['eml', 'txt'],
  ['ics', 'csv'], ['ics', 'json'], ['ics', 'txt'], ['vcs', 'csv'], ['vcs', 'txt'],
  ['vcard', 'json'], ['vcard', 'txt'], ['vcf', 'json'], ['vcf', 'txt'], ['ldif', 'csv'], ['ldif', 'json'],
];

/** Matrix routes kept OUT on purpose (reason shown by scripts/legacy_pair_plan.ts). */
export function legacyExclusion(from: string, to: string): string | null {
  const font = ['ttf', 'otf', 'woff', 'woff2'];
  if (font.includes(from) || font.includes(to)) return 'font: convertFile has no font handler';
  if (['html', 'htm', 'md', 'markdown', 'tex'].includes(from)) return 'markup rendered as source text, not as a page';
  if (from === 'ts') return '.ts is read as TypeScript text, the search means MPEG-TS video';
  if (from === 'key') return '"key" searches mean Keynote';
  return null;
}

const upper = (s: string): string => s.toUpperCase();
const name = (s: string): string => NAMES[s] ?? `${upper(s)} file`;

function category(from: string, to: string): Category {
  if (VIDEO.has(from)) return 'video';
  if (AUDIO.has(from)) return 'audio';
  if (IMAGE.has(from) && to !== 'mp4') return 'image';
  if (to === 'mp4') return 'video';
  return 'convert';
}

function note(from: string, to: string): string | undefined {
  if (TEXT_RENDER.has(from)) return `Renders the file's text as ${to === 'pdf' ? 'a PDF' : 'an image'} — ideal for sharing code or config.`;
  if (CERT.has(from)) return 'Re-encodes between PEM (Base64) and DER (binary) — the certificate itself is unchanged.';
  if (VIDEO.has(from) && ['mp3', 'wav', 'aac', 'opus', 'm4a', 'flac'].includes(to)) return 'Extracts the audio track.';
  if (to === 'zip') return 'Extracts the archive and re-packs every file as a .zip.';
  return undefined;
}

export const LEGACY_PAIRS: ConvertPair[] = LEGACY_PAIR_LIST.map(([from, to]) => ({
  from, to, toolId: 'convert-anything', category: category(from, to),
  title: `Convert ${upper(from)} to ${upper(to)}`,
  metaTitle: `Convert ${upper(from)} to ${upper(to)} — ${name(from)} to ${name(to)}, free in your browser`,
  blurb: `Convert ${name(from)} (.${from}) files to ${name(to)} (.${to}) right in your browser — no upload, no signup.`,
  note: note(from, to),
  popular: true,
}));
