/**
 * "What can I do with this file?" — the brain behind the homepage launcher.
 *
 * Given a dropped file it returns BOTH:
 *   - convert: every format the file can be turned into in the browser
 *     (the universal conversion matrix), and
 *   - tools: every tool that accepts this file type (matched against each
 *     tool's `accepts` manifest field), so a photo also surfaces blur / resize
 *     / crop, a PDF surfaces merge / split, a .txt surfaces the text tools, etc.
 *
 * Old xonvert only offered conversion here; surfacing the tools too is the
 * upgrade. The picked tool opens with the file already loaded via the file
 * hand-off (see lib/ai/handoff).
 */

import { TOOLS } from '@/lib/registry';
import type { ToolManifest } from '@/lib/registry/types';
import { detectFormat, targetsFor, extOf, type Target, type ConvCategory } from '@/lib/convert/matrix';

/** Best-effort MIME for an extension when the browser leaves file.type empty. */
const EXT_MIME: Record<string, string> = {
  // images
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
  heic: 'image/heic', tiff: 'image/tiff', tif: 'image/tiff',
  // audio
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', opus: 'audio/opus',
  // video
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', flv: 'video/x-flv', m4v: 'video/x-m4v', wmv: 'video/x-ms-wmv',
  '3gp': 'video/3gpp', mpg: 'video/mpeg', mpeg: 'video/mpeg', ts: 'video/mp2t',
  // docs
  pdf: 'application/pdf',
  // fonts
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  // text / code / data (all text/* so text tools match)
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', log: 'text/plain',
  csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json',
  xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml', html: 'text/html',
  htm: 'text/html', css: 'text/css', js: 'text/javascript', ts_code: 'text/typescript',
  sql: 'text/plain', srt: 'text/plain', vtt: 'text/vtt',
};

/** Resolve the MIME to match against, falling back to the extension table. */
function mimeOf(file: { name: string; type?: string }): string {
  if (file.type) return file.type;
  return EXT_MIME[extOf(file.name)] ?? '';
}

/** Does a tool's `accepts` patterns admit this file? */
export function toolAccepts(accepts: string[] | undefined, file: { name: string; type?: string }): boolean {
  if (!accepts || accepts.length === 0) return false;
  const mime = mimeOf(file);
  const ext = extOf(file.name);
  return accepts.some((a) => {
    const pat = a.trim().toLowerCase();
    if (pat === '*/*' || pat === '*') return true;
    if (pat.endsWith('/*')) return !!mime && mime.startsWith(pat.slice(0, -1)); // "image/*"
    if (pat.includes('/')) return mime === pat;                                 // exact MIME
    return pat.replace(/^\./, '') === ext;                                      // ".ext" / "ext"
  });
}

export interface FileActions {
  ext: string;
  /** Broad conversion category, if the converter recognizes the format. */
  category: ConvCategory | null;
  mime: string;
  /** In-browser format conversions for this file. */
  convert: Target[];
  /** Tools that accept this file, ready to open with it pre-loaded. */
  tools: ToolManifest[];
}

/** Everything the app can do with a given file. */
export function actionsForFile(file: { name: string; type?: string }): FileActions {
  const { ext, category } = detectFormat(file);
  const convert = targetsFor(ext);
  const tools = TOOLS.filter(
    (t) => t.id !== 'convert-anything' && toolAccepts(t.accepts, file),
  );
  return { ext, category, mime: mimeOf(file), convert, tools };
}
