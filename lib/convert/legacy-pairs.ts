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
 *   - X → zip for single files: the matrix offers it for every format, but one
 *     page (json-to-zip, the most searched) is enough; the rest redirect to
 *     convert-anything, which does it.
 *   - html/md/tex → image/pdf: the text renderer strips tags and draws the
 *     SOURCE text; people searching these want the rendered page/formula.
 *   - ts: the matrix treats .ts as TypeScript text, the searches mean MPEG-TS.
 *   - key: an old-site "key" is usually Keynote; a private key → .crt is not a thing.
 */
import type { ConvertPair } from '@/lib/convert/pairs';
import type { Category } from '@/lib/registry/types';
import { FORMAT_CATEGORY } from '@/lib/convert/matrix';

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
  ani: 'Windows animated cursor', cur: 'Windows cursor', sbv: 'YouTube SBV subtitles',
  srt: 'SRT subtitles', vtt: 'WebVTT subtitles', ssa: 'SubStation Alpha subtitles',
  plist: 'Apple property list', xml: 'XML', stl: 'STL 3D model', scad: 'OpenSCAD file',
  dat: 'DAT data file', woff: 'WOFF web font', otf: 'OpenType font',
  woff2: 'WOFF2 web font', ttf: 'TrueType font', glb: 'GLB 3D model', gltf: 'glTF 3D model',
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
  // Converters added for the top unserved searches (lib/convert/formats/*).
  ['ani', 'png'], ['ani', 'gif'], ['ani', 'cur'], ['ani', 'ico'],
  ['sbv', 'txt'], ['sbv', 'srt'], ['sbv', 'vtt'], ['srt', 'sbv'], ['vtt', 'txt'], ['ssa', 'txt'],
  ['plist', 'txt'], ['plist', 'json'], ['plist', 'xml'],
  ['mp3', 'jpg'], ['mp3', 'png'],
  ['json', 'zip'], ['stl', 'scad'], ['dat', 'txt'], ['woff', 'otf'],
  // PDF → Word (lib/convert/formats/pdf-docx), WOFF2 (formats/woff2), 3D render (formats/model-render).
  ['pdf', 'docx'],
  ['woff2', 'otf'], ['woff2', 'ttf'], ['otf', 'woff2'], ['ttf', 'woff2'],
  ['glb', 'gif'], ['glb', 'png'], ['gltf', 'png'],
];

/** Pages whose generic "Convert X to Y" wording would mislead. */
const OVERRIDES: Record<string, Partial<Pick<ConvertPair, 'title' | 'metaTitle' | 'blurb' | 'note' | 'category'>>> = {
  'ani-to-png': { category: 'image', blurb: 'Turn a Windows animated cursor (.ani) into a transparent PNG of its first frame — right in your browser, no upload.' },
  'ani-to-gif': { category: 'image', title: 'Convert ANI to animated GIF', blurb: 'Turn a Windows animated cursor (.ani) into a looping animated GIF with every frame and its original timing — no upload.', note: 'GIF transparency is on/off, so soft cursor shadows become hard edges.' },
  'ani-to-cur': { category: 'image', blurb: 'Save the first frame of a Windows animated cursor (.ani) as a static .cur cursor, hotspot kept — no upload.' },
  'ani-to-ico': { category: 'image', blurb: 'Save the first frame of a Windows animated cursor (.ani) as a .ico icon — no upload.' },
  'mp3-to-jpg': { category: 'audio', title: 'Extract MP3 cover art as JPG', metaTitle: 'MP3 to JPG — extract the album cover art from an MP3, free in your browser', blurb: 'Save the album art embedded in an MP3’s ID3 tag as a JPG image. Nothing is uploaded.', note: 'Works when the MP3 has cover art embedded; an MP3 without a picture has nothing to extract.' },
  'mp3-to-png': { category: 'audio', title: 'Extract MP3 cover art as PNG', metaTitle: 'MP3 to PNG — extract the album cover art from an MP3, free in your browser', blurb: 'Save the album art embedded in an MP3’s ID3 tag as a PNG image. Nothing is uploaded.', note: 'Works when the MP3 has cover art embedded; an MP3 without a picture has nothing to extract.' },
  'plist-to-txt': { blurb: 'Read an Apple .plist — XML or binary (bplist) — as a clean indented text outline, in your browser.' },
  'plist-to-json': { blurb: 'Convert an Apple .plist — XML or binary (bplist) — to pretty JSON. Dates become ISO strings, data becomes Base64.' },
  'plist-to-xml': { title: 'Convert binary PLIST to XML', metaTitle: 'PLIST to XML — decode a binary plist to readable XML, free in your browser', blurb: 'Decode a binary .plist (bplist00) into the standard XML plist format Xcode reads — no Mac or plutil needed.' },
  'stl-to-scad': { blurb: 'Turn an STL mesh (ASCII or binary) into an OpenSCAD polyhedron() you can open, transform and combine in OpenSCAD.', note: 'The result is the mesh as a polyhedron, not editable parametric CSG.' },
  'dat-to-txt': { title: 'Open a DAT file as text', metaTitle: 'DAT to TXT — view any .dat file as text or a hex dump, free in your browser', blurb: '.dat is a generic extension any program can use. See what is inside: text is shown as text, binary data as a readable hex dump.', note: 'A .dat file has no single format, so nothing is “converted” — you see the actual contents.' },
  'json-to-zip': { title: 'Compress JSON to ZIP', blurb: 'Pack a .json file into a .zip archive in your browser — JSON typically shrinks by 80–90%.', note: 'Compresses the file into a standard .zip.' },
  'woff-to-otf': { blurb: 'Unpack a WOFF web font back into an installable OpenType font. The font tables are restored exactly — no re-drawing of glyphs.' },
  'pdf-to-docx': {
    category: 'pdf', title: 'Convert PDF to Word (DOCX)',
    metaTitle: 'PDF to Word — convert PDF to editable DOCX, free in your browser, no upload',
    blurb: 'Turn a PDF into an editable Word document. Paragraphs, headings and page breaks are rebuilt from the PDF’s text — on your device, nothing is uploaded.',
    note: 'Works on PDFs with selectable text; the layout is simplified to flowing paragraphs (no images, tables or columns). A scanned PDF has no text to extract — run it through PDF OCR (/tools/pdf-ocr) first.',
  },
  'woff2-to-otf': { blurb: 'Decode a WOFF2 web font into an installable OpenType font, in your browser.', note: 'A WOFF2 of a TrueType font stays TrueType inside; most systems install it fine with either extension.' },
  'woff2-to-ttf': { blurb: 'Decode a WOFF2 web font into an installable TrueType (.ttf) font, in your browser — no upload.', note: 'A WOFF2 made from a CFF (OpenType) font decodes to CFF outlines; save it as .otf if your system prefers.' },
  'otf-to-woff2': { blurb: 'Compress an OpenType font to WOFF2 — the smallest web font format, supported by every modern browser. Runs in your browser.' },
  'ttf-to-woff2': { blurb: 'Compress a TrueType font to WOFF2 for the web — typically 30–50% smaller than TTF. Runs in your browser, nothing is uploaded.' },
  'glb-to-png': { category: 'image', title: 'Render GLB to PNG', metaTitle: 'GLB to PNG — render a 3D model to an image, free in your browser', blurb: 'Render a GLB 3D model to a 1024px PNG with a transparent background — auto-framed and evenly lit, on your own GPU. Nothing is uploaded.', note: 'Draco-compressed models are not supported yet.' },
  'gltf-to-png': { category: 'image', title: 'Render glTF to PNG', metaTitle: 'glTF to PNG — render a 3D model to an image, free in your browser', blurb: 'Render a glTF 3D model to a 1024px PNG with a transparent background — auto-framed and evenly lit, in your browser.', note: 'The .gltf must have its data embedded; one that points to separate .bin/texture files needs the .glb version instead.' },
  'glb-to-gif': { category: 'image', title: 'Convert GLB to animated GIF', metaTitle: 'GLB to GIF — 360° turntable animation of a 3D model, free in your browser', blurb: 'Turn a GLB 3D model into a looping 360° turntable GIF (24 frames, 512px, white background) — rendered on your device, no upload.', note: 'Draco-compressed models are not supported yet.' },
  'sbv-to-txt': { blurb: 'Turn YouTube .sbv captions into plain text — just the lines, no timestamps — in your browser.' },
  'vtt-to-txt': { blurb: 'Turn WebVTT captions into plain text — just the lines, no timestamps — in your browser.' },
  'ssa-to-txt': { blurb: 'Turn SubStation Alpha (.ssa/.ass) subtitles into plain text, styling codes removed.' },
};

/** Matrix routes kept OUT on purpose (reason shown by scripts/legacy_pair_plan.ts). */
export function legacyExclusion(from: string, to: string): string | null {
  if (to === 'zip' && from !== 'json' && FORMAT_CATEGORY[from] !== 'archive') return 'single-file zip: only json-to-zip gets a page, the rest land on convert-anything';
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
  ...OVERRIDES[`${from}-to-${to}`],
}));
