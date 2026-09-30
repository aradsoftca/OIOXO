/**
 * Universal client-side conversion matrix — the browser-based answer to old
 * xonvert's server dispatcher. Instead of a queue + CLI per pair, we map each
 * source format to the target formats achievable IN THE BROWSER, and route to
 * the engine that already exists in this app. No server, no GPU.
 *
 *   detectFormat(file)  -> { ext, category }
 *   targetsFor(ext)     -> Target[]      (everything you can turn it into)
 *   convertFile(file, target, opts) -> ConvertOutput   (the dispatcher)
 */

import { startJob, updateJob, endJob } from '@/lib/compute/progressBus';

export type ConvCategory = 'image' | 'audio' | 'video' | 'pdf' | 'subtitle' | 'font' | 'data' | 'model3d' | 'document' | 'ebook' | 'cad' | 'presentation' | 'text' | 'archive' | 'calendar' | 'email' | 'certificate' | 'structured' | 'binary';

/** Which engine performs a given conversion. */
export type HandlerId =
  | 'image'        // raster re-encode via canvas/codecs
  | 'audio'        // Web Audio decode → wav/mp3
  | 'video'        // ffmpeg.wasm transcode
  | 'video-gif'    // video → animated gif
  | 'video-audio'  // pull audio track out of video (→ mp3)
  | 'img-pdf'      // image(s) → pdf
  | 'img-video'    // image(s) → mp4 slideshow
  | 'pdf-img'      // pdf pages → images (zip)
  | 'pdf-txt'      // pdf text layer → txt
  | 'pdf-docx'     // pdf text layer → Word .docx (paragraphs/headings rebuilt)
  | 'ocr'          // image → text
  | 'transcribe'   // audio → text
  | 'subtitle'     // srt/vtt/ass interconvert
  | 'font'         // ttf/otf/woff/woff2
  | 'model3d'      // obj/stl/fbx/… → glb/gltf
  | 'model-render' // glb/gltf → png snapshot / gif turntable (three.js)
  | 'docx'         // word → pdf/html/txt
  | 'sheet'        // xlsx/ods/csv → csv/xlsx/html/json
  | 'ebook'        // epub → pdf/html/txt
  | 'cad'          // step/iges/brep → stl/obj
  | 'office'       // doc/odt/pptx/ppt/odp → pdf/html/txt (light extraction)
  | 'text-img'     // any text/code/rtf/html → rendered image
  | 'text-pdf'     // any text/code/rtf/html → rendered pdf
  | 'text-video'   // text → rendered image → short video ("impossible" bridge)
  | 'archive-repack' // any archive (rar/7z/tar/gz…) → extracted, re-packed as zip
  | 'calendar'     // ics/vcf/vcard → json/csv/txt
  | 'psd'          // photoshop psd/psb → png/jpg/webp/pdf (ag-psd composite)
  | 'ai'           // illustrator .ai (pdf-compatible) → png/jpg/pdf
  | 'pdf-raster'   // rasterize a single pdf-like page → image
  | 'msg'          // outlook .msg → eml/txt/html
  | 'email'        // .eml / .mbox → html/txt/eml
  | 'cert'         // x.509 cert/key pem↔der
  | 'dwg'          // autocad .dwg → .dxf (libredwg wasm)
  | 'ani'          // windows animated cursor → png/gif/ico/cur
  | 'cover-art'    // mp3 ID3 APIC picture → jpg/png
  | 'plist'        // apple property list (xml/binary) → json/txt/xml
  | 'stl-scad'     // stl → openscad polyhedron()
  | 'dat-text'     // unknown .dat → text, or a hex dump
  | 'zip'          // any single file → .zip
  | 'gz'           // any single file → .gz (gzip)
  | 'img-ico'      // image → .ico / .cur (PNG-in-ICO, sizes up to 256)
  | 'img-svg'      // image → .svg wrapping the picture (no vector tracing)
  | 'img-html'     // image → .html page with the picture embedded
  | 'img-docx'     // image → .docx with the picture embedded
  | 'video-frames' // video → one image per second (zip)
  | 'audio-video'  // audio → video with a still title card / cover art
  | 'audio-wave'   // audio → waveform picture
  | 'transcribe-sub' // audio/video speech → timed .srt / .vtt
  | 'to-doc'       // text/doc/pdf/ebook/slides → docx/html/md/rtf/epub (paragraph model)
  | 'doc-img'      // doc/slides → pdf → page images (zip)
  | 'data'         // json/yaml/xml ⇄ each other and → csv/tsv/xlsx/md
  | 'archive-tar'  // any archive → .tar / .tgz
  | 'font-img'     // font → sample-sheet .png
  | 'model-img'    // any 3D model → glb → png / gif render
  | 'mail-pdf';    // eml/mbox/msg → pdf

export interface Target {
  to: string;
  handler: HandlerId;
  /** Tool slug that owns the richer UI for this conversion. */
  toolId: string;
  note?: string;
}

export interface ConvertOutput {
  /** Single-file result. */
  blob?: Blob;
  /** Multi-file result (e.g. pdf → images) gets zipped by the caller. */
  files?: { name: string; blob: Blob }[];
  /** Text result (ocr / transcribe / pdf-txt). */
  text?: string;
  filename: string;
}

// --- Format → category (browser-achievable formats only) -------------------
const IMAGE_IN = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tif', 'ico'];
// png/jpg/webp/avif via the jsquash codec worker; gif/bmp/tiff via ffmpeg.wasm.
const IMAGE_OUT = ['png', 'jpg', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tga', 'ppm'];
const IMAGE_FF = new Set(['gif', 'bmp', 'tiff', 'tif', 'tga', 'ppm']);   // routed through ffmpeg, not jsquash
const AUDIO_IN = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus', 'wma', 'aiff', 'amr', 'webm'];
// mp3/wav via the light Web-Audio path; the rest via ffmpeg.wasm.
const AUDIO_OUT = ['mp3', 'wav', 'm4a', 'aac', 'opus', 'flac', 'ogg', 'wma', 'aiff', 'ac3'];
const VIDEO_IN = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'm4v', 'wmv', '3gp', 'mpg', 'mpeg', 'ts', 'ogv', 'rm', 'rmvb', 'vob', 'asf', 'm2ts', 'mts', 'divx', 'f4v'];
const VIDEO_OUT = ['mp4', 'webm', 'mov', 'mkv', 'avi', '3gp', 'm4v', 'flv', 'wmv', 'mpg', 'ogv'];  // all via ffmpeg.wasm

/** ffmpeg audio encoder args per target extension (codecs present in our core). */
const AUDIO_CODEC: Record<string, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-b:a', '192k'],
  m4a: ['-c:a', 'aac', '-b:a', '192k'],
  aac: ['-c:a', 'aac', '-b:a', '192k'],
  // libopus fails to open in the bundled core (measured 09-30); ffmpeg's native Opus encoder works at 48 kHz.
  opus: ['-c:a', 'opus', '-strict', '-2', '-b:a', '128k', '-ar', '48000', '-ac', '2'],
  flac: ['-c:a', 'flac'],
  wav: ['-c:a', 'pcm_s16le'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '5'],
  wma: ['-c:a', 'wmav2', '-b:a', '192k'],
  aiff: ['-c:a', 'pcm_s16be'],
  ac3: ['-c:a', 'ac3', '-b:a', '192k'],
};
/** ffmpeg video codec args per target container (h264/aac or vp9/opus or mpeg4/mp3). */
const VIDEO_CODEC: Record<string, string[]> = {
  mp4: ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart'],
  m4v: ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart'],
  mov: ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart'],
  mkv: ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac'],
  flv: ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac'],
  '3gp': ['-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'],
  // VP8 realtime + Vorbis: VP9 in wasm fails/stalls and libopus won't open in this core (measured 09-30).
  webm: ['-c:v', 'libvpx', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p', '-c:a', 'libvorbis', '-q:a', '5'],
  avi: ['-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', '5', '-c:a', 'libmp3lame', '-b:a', '192k'],
  wmv: ['-c:v', 'wmv2', '-b:v', '2M', '-c:a', 'wmav2', '-b:a', '192k'],
  mpg: ['-c:v', 'mpeg2video', '-q:v', '4', '-c:a', 'mp2', '-b:a', '192k'],
  ogv: ['-c:v', 'libtheora', '-q:v', '7', '-pix_fmt', 'yuv420p', '-c:a', 'libvorbis', '-q:a', '5'],
};
/** Video codec args for a video made from ONE still picture (no audio). */
const STILL_VCODEC: Record<string, string[]> = {
  mp4: ['-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  m4v: ['-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  mov: ['-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  mkv: ['-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p'],
  flv: ['-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p'],
  '3gp': ['-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p'],
  // VP8 realtime: wasm VP9 at default speed can take minutes (or never return) even for a still.
  webm: ['-c:v', 'libvpx', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p'],
  avi: ['-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', '3'],
  wmv: ['-c:v', 'wmv2', '-b:v', '2M'],
  mpg: ['-c:v', 'mpeg2video', '-q:v', '3'],
  ogv: ['-c:v', 'libtheora', '-q:v', '7', '-pix_fmt', 'yuv420p'],
};
/** Audio codec that each video container carries when we ADD audio (audio → video). */
const AV_AUDIO: Record<string, string[]> = {
  mp4: ['-c:a', 'aac', '-b:a', '192k'], mov: ['-c:a', 'aac', '-b:a', '192k'], mkv: ['-c:a', 'aac', '-b:a', '192k'],
  webm: ['-c:a', 'libvorbis', '-q:a', '5'], avi: ['-c:a', 'libmp3lame', '-b:a', '192k'],
};
/** Containers whose audio the browser decodes natively (Web Audio / Whisper input). */
const WEB_DECODABLE = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus', 'webm', 'mp4', 'mov', 'm4v']);
// Subtitles: srt/vtt/sbv/ass/ssa in (lib/convert/formats/subtitle); ass/ssa are read-only.
const SUBTITLE = ['srt', 'vtt', 'sbv', 'ass', 'ssa'];
const SUBTITLE_OUT = ['srt', 'vtt', 'sbv', 'txt'];
// Fonts: WOFF 1.0 ⇄ TTF/OTF is a lossless table (de)compression (lib/convert/formats/woff);
// WOFF2 ⇄ TTF/OTF uses Google's woff2 encoder/decoder as wasm (lib/convert/formats/woff2).
const FONT = ['ttf', 'otf', 'woff', 'woff2'];
const MODEL3D = ['obj', 'stl', 'fbx', 'dae', 'ply', '3ds', 'gltf', 'glb', '3mf'];
const MODEL3D_OUT = ['glb', 'gltf'];
const SHEET = ['xlsx', 'xls', 'ods', 'csv', 'tsv'];
const SHEET_OUT = ['csv', 'xlsx', 'html', 'json'];
const CAD = ['step', 'stp', 'iges', 'igs', 'brep', 'dwg'];
const CAD_OUT = ['stl', 'obj'];
// Any text-like / code / markup file — rendered to image/pdf/video ("impossible"
// conversions). Excludes csv/tsv/json/xml (those stay in the data category).
const TEXT_IN = [
  'txt', 'text', 'md', 'markdown', 'rtf', 'log', 'nfo', 'tex', 'html', 'htm',
  'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go',
  'rs', 'rb', 'php', 'swift', 'kt', 'sql', 'sh', 'bash', 'yaml', 'yml', 'ini',
  'conf', 'toml', 'css', 'scss',
];
// Archives — extracted + re-packed as zip via libarchive.js + JSZip (engines/archive).
const ARCHIVE_IN = ['zip', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tbz', 'tbz2', 'xz', 'txz', 'rar', 'cab', 'iso', 'lzh', 'arj', 'lz', 'lzma', 'z', 'zipx', 'cpio'];
// Calendar / contacts — parsed to json/csv/txt (engines/calendar, no library).
const CAL_IN = ['ics', 'vcs', 'vcf', 'vcard', 'ldif'];
// Proprietary raster/vector art — Photoshop (ag-psd) + Illustrator (pdf.js raster).
const PSD_IN = ['psd', 'psb'];
// Email — Outlook .msg (msgreader) + RFC-822 .eml / .mbox (postal-mime).
const EMAIL_IN = ['eml', 'mbox', 'msg'];
// X.509 certificates / keys — PEM ↔ DER, pure base64 (engines/cert, no library).
const CERT_IN = ['pem', 'crt', 'cer', 'der', 'key'];

export const FORMAT_CATEGORY: Record<string, ConvCategory> = {};
for (const f of IMAGE_IN) FORMAT_CATEGORY[f] = 'image';
for (const f of AUDIO_IN) FORMAT_CATEGORY[f] = 'audio';
for (const f of VIDEO_IN) FORMAT_CATEGORY[f] = 'video';
for (const f of SUBTITLE) FORMAT_CATEGORY[f] = 'subtitle';
for (const f of FONT) FORMAT_CATEGORY[f] = 'font';
for (const f of MODEL3D) FORMAT_CATEGORY[f] = 'model3d';
for (const f of SHEET) FORMAT_CATEGORY[f] = 'data';
for (const f of CAD) FORMAT_CATEGORY[f] = 'cad';
for (const f of ['docx', 'doc', 'odt']) FORMAT_CATEGORY[f] = 'document';
for (const f of ['pptx', 'ppt', 'odp']) FORMAT_CATEGORY[f] = 'presentation';
for (const f of TEXT_IN) FORMAT_CATEGORY[f] = 'text';
for (const f of ARCHIVE_IN) FORMAT_CATEGORY[f] = 'archive';
for (const f of CAL_IN) FORMAT_CATEGORY[f] = 'calendar';
for (const f of PSD_IN) FORMAT_CATEGORY[f] = 'image';   // psd/psb routed to the ag-psd handler in targetsFor
for (const f of EMAIL_IN) FORMAT_CATEGORY[f] = 'email';
for (const f of CERT_IN) FORMAT_CATEGORY[f] = 'certificate';
FORMAT_CATEGORY['ai'] = 'image';   // Illustrator (pdf-compatible) → rasterized in targetsFor
FORMAT_CATEGORY['pdf'] = 'pdf';
FORMAT_CATEGORY['epub'] = 'ebook';
FORMAT_CATEGORY['ani'] = 'image';        // animated cursor → special-cased in targetsFor
FORMAT_CATEGORY['json'] = 'structured';
FORMAT_CATEGORY['plist'] = 'structured';
FORMAT_CATEGORY['dat'] = 'binary';
FORMAT_CATEGORY['xml'] = 'structured';   // json/yaml/csv/xlsx via the data handler
// 'webm' is both audio and video; treat as video by default (above loop order keeps video).

export function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  const e = m ? m[1] : '';
  return e === 'jpeg' ? 'jpg' : e;
}

export function detectFormat(file: { name: string; type?: string }): { ext: string; category: ConvCategory | null } {
  const ext = extOf(file.name);
  return { ext, category: FORMAT_CATEGORY[ext] ?? null };
}

/** Every conversion this source format can undergo in the browser. */
export function targetsFor(ext: string): Target[] {
  const cat = FORMAT_CATEGORY[ext];
  const out = routesFor(ext);
  // Any single recognised file can be zipped / gzipped (archives are handled by archive-repack / archive-tar).
  if (cat && cat !== 'archive' && !out.some((t) => t.to === 'zip')) {
    out.push({ to: 'zip', handler: 'zip', toolId: 'convert-anything', note: 'Compresses the file into a .zip' });
  }
  if (cat && cat !== 'archive') {
    out.push({ to: 'gz', handler: 'gz', toolId: 'convert-anything', note: 'Compresses the file with gzip' });
  }
  return out;
}

/** Output formats of the paragraph model (text / documents / pdf / ebooks / slides). */
const DOC_OUT = ['docx', 'html', 'md', 'rtf', 'epub'];
/** Output formats of the data model (json / yaml / xml). */
const DATA_OUT = ['json', 'yaml', 'xml', 'csv', 'tsv', 'xlsx', 'md'];

function push(out: Target[], to: string, handler: HandlerId, note?: string, toolId = 'convert-anything'): void {
  if (!out.some((t) => t.to === to && t.handler === handler)) out.push({ to, handler, toolId, note });
}

function routesFor(ext: string): Target[] {
  const cat = FORMAT_CATEGORY[ext];
  const out: Target[] = [];
  if (ext === 'ani') {
    out.push({ to: 'png', handler: 'ani', toolId: 'convert-anything', note: 'First frame of the animated cursor' });
    out.push({ to: 'gif', handler: 'ani', toolId: 'convert-anything', note: 'Every frame, with the cursor’s own timing' });
    out.push({ to: 'cur', handler: 'ani', toolId: 'convert-anything', note: 'First frame as a static cursor' });
    out.push({ to: 'ico', handler: 'ani', toolId: 'convert-anything', note: 'First frame as an icon' });
    return out;
  }
  if (cat === 'image') {
    // Photoshop: composite via ag-psd, then any raster + pdf.
    if (ext === 'psd' || ext === 'psb') {
      for (const to of ['png', 'jpg', 'webp']) out.push({ to, handler: 'psd', toolId: 'convert-anything', note: 'Flattens the Photoshop file' });
      out.push({ to: 'pdf', handler: 'psd', toolId: 'convert-anything' });
      return out;
    }
    // Illustrator: modern .ai is PDF-compatible — rasterize the artboard / pass to pdf.
    if (ext === 'ai') {
      out.push({ to: 'png', handler: 'pdf-raster', toolId: 'convert-anything', note: 'Rasterizes the artwork' });
      out.push({ to: 'jpg', handler: 'pdf-raster', toolId: 'convert-anything' });
      out.push({ to: 'pdf', handler: 'ai', toolId: 'convert-anything' });
      return out;
    }
    for (const to of IMAGE_OUT) if (to !== ext && !(ext === 'tif' && to === 'tiff')) out.push({ to, handler: 'image', toolId: 'image-convert-format' });
    out.push({ to: 'pdf', handler: 'img-pdf', toolId: 'images-to-pdf' });
    out.push({ to: 'mp4', handler: 'img-video', toolId: 'images-to-video' });
    out.push({ to: 'txt', handler: 'ocr', toolId: 'image-ocr', note: 'Reads text inside the image' });
    if (ext !== 'ico') push(out, 'ico', 'img-ico', 'Windows icon with 16–256 px sizes');
    push(out, 'cur', 'img-ico', 'Windows cursor (hotspot top-left)');
    push(out, 'svg', 'img-svg', 'SVG that embeds the picture (not traced to vectors)');
    push(out, 'docx', 'img-docx', 'Word document with the picture on the page');
    push(out, 'html', 'img-html', 'Web page with the picture embedded');
    for (const to of VIDEO_OUT) if (to !== 'mp4') push(out, to, 'img-video', '5-second video of the still picture');
  } else if (cat === 'audio') {
    for (const to of AUDIO_OUT) if (to !== ext) out.push({ to, handler: 'audio', toolId: 'audio-convert-format' });
    out.push({ to: 'txt', handler: 'transcribe', toolId: 'audio-to-text', note: 'Transcribes speech' });
    if (ext === 'mp3') {
      out.push({ to: 'jpg', handler: 'cover-art', toolId: 'convert-anything', note: 'Extracts the embedded cover art' });
      out.push({ to: 'png', handler: 'cover-art', toolId: 'convert-anything', note: 'Extracts the embedded cover art' });
    }
    push(out, 'srt', 'transcribe-sub', 'Timed subtitles from the speech');
    push(out, 'vtt', 'transcribe-sub', 'Timed subtitles from the speech');
    push(out, 'png', 'audio-wave', 'Picture of the waveform');
    for (const to of Object.keys(AV_AUDIO)) push(out, to, 'audio-video', 'Video with a still title card (or the cover art) over the sound');
  } else if (cat === 'video') {
    for (const to of VIDEO_OUT) if (to !== ext && !(ext === 'mpeg' && to === 'mpg')) out.push({ to, handler: 'video', toolId: 'video-convert-format' });
    out.push({ to: 'gif', handler: 'video-gif', toolId: 'video-to-gif' });
    // Extract the audio track to any audio format (3gp → m4a, mp4 → flac, …).
    for (const to of ['mp3', 'm4a', 'aac', 'wav', 'opus', 'flac']) {
      out.push({ to, handler: 'video-audio', toolId: 'video-extract-audio', note: 'Extracts the audio' });
    }
    for (const to of ['ogg', 'wma', 'aiff', 'ac3']) push(out, to, 'video-audio', 'Extracts the audio');
    push(out, 'jpg', 'video-frames', 'One picture per second (up to 120), zipped');
    push(out, 'png', 'video-frames', 'One picture per second (up to 120), zipped');
    push(out, 'txt', 'transcribe', 'Transcribes the speech');
    push(out, 'srt', 'transcribe-sub', 'Timed subtitles from the speech');
    push(out, 'vtt', 'transcribe-sub', 'Timed subtitles from the speech');
  } else if (cat === 'pdf') {
    out.push({ to: 'jpg', handler: 'pdf-img', toolId: 'pdf-to-images' });
    out.push({ to: 'png', handler: 'pdf-img', toolId: 'pdf-to-images' });
    out.push({ to: 'txt', handler: 'pdf-txt', toolId: 'pdf-to-text' });
    out.push({ to: 'docx', handler: 'pdf-docx', toolId: 'convert-anything', note: 'Editable Word text; scanned PDFs need OCR first' });
    for (const to of DOC_OUT) if (to !== 'docx') push(out, to, 'to-doc', 'Rebuilt from the PDF text layer; scanned PDFs need OCR first');
  } else if (cat === 'subtitle') {
    for (const to of SUBTITLE_OUT) if (to !== ext) {
      const plain = ext === 'srt' || ext === 'vtt';
      out.push({ to, handler: 'subtitle', toolId: plain && to !== 'txt' && to !== 'sbv' ? 'subtitle-cleaner' : 'convert-anything', note: to === 'txt' ? 'Just the spoken lines, no timings' : undefined });
    }
  } else if (cat === 'font') {
    // WOFF2 routes are off: wawoff2's Emscripten runtime never starts in the
    // browser bundle ("The WOFF2 engine failed to start", measured 09-29).
    // lib/convert/formats/woff2.ts is kept for when that is fixed.
    if (ext === 'woff') {
      out.push({ to: 'ttf', handler: 'font', toolId: 'convert-anything', note: 'Unpacks the WOFF tables losslessly' });
      out.push({ to: 'otf', handler: 'font', toolId: 'convert-anything', note: 'Unpacks the WOFF tables losslessly' });
    } else if (ext === 'ttf' || ext === 'otf') {
      out.push({ to: 'woff', handler: 'font', toolId: 'convert-anything', note: 'Compresses the font tables (WOFF 1.0)' });
    }
    // The browser's own FontFace loader reads ttf/otf/woff/woff2, so a sample sheet works for all four.
    push(out, 'png', 'font-img', 'Sample sheet of the typeface');
  } else if (cat === 'model3d') {
    for (const to of MODEL3D_OUT) if (to !== ext) out.push({ to, handler: 'model3d', toolId: 'model-3d-convert' });
    if (ext === 'glb' || ext === 'gltf') {
      out.push({ to: 'png', handler: 'model-render', toolId: 'convert-anything', note: '1024px snapshot, transparent background' });
      out.push({ to: 'gif', handler: 'model-render', toolId: 'convert-anything', note: '360° turntable animation' });
    } else {
      push(out, 'png', 'model-img', '1024px snapshot, transparent background');
      push(out, 'gif', 'model-img', '360° turntable animation');
    }
    if (ext === 'stl') out.push({ to: 'scad', handler: 'stl-scad', toolId: 'convert-anything', note: 'OpenSCAD polyhedron() of the mesh' });
  } else if (cat === 'structured') {
    if (ext === 'plist') {
      out.push({ to: 'json', handler: 'plist', toolId: 'convert-anything', note: 'XML or binary plist → JSON' });
      out.push({ to: 'txt', handler: 'plist', toolId: 'convert-anything', note: 'Readable indented outline' });
      out.push({ to: 'xml', handler: 'plist', toolId: 'convert-anything', note: 'XML plist (decodes binary plists)' });
    } else {
      for (const to of DATA_OUT) if (to !== ext) push(out, to, 'data', ['csv', 'tsv', 'xlsx', 'md'].includes(to) ? 'As a table: one row per record, nested fields flattened' : undefined);
    }
  } else if (cat === 'binary') {
    out.push({ to: 'txt', handler: 'dat-text', toolId: 'convert-anything', note: 'Shows the contents as text, or a hex dump if binary' });
  } else if (cat === 'data') {
    for (const to of SHEET_OUT) if (to !== ext) out.push({ to, handler: 'sheet', toolId: 'sheet-convert' });
    for (const to of ['tsv', 'ods', 'xls', 'xml', 'yaml', 'md', 'pdf']) if (to !== ext) push(out, to, 'sheet', to === 'md' ? 'Markdown table' : undefined);
  } else if (cat === 'document') {
    const h: HandlerId = ext === 'docx' ? 'docx' : 'office';
    out.push({ to: 'pdf', handler: h, toolId: 'doc-convert' });
    out.push({ to: 'html', handler: h, toolId: 'doc-convert' });
    out.push({ to: 'txt', handler: h, toolId: 'doc-convert' });
    for (const to of DOC_OUT) if (to !== ext && to !== 'html') push(out, to, 'to-doc', to === 'docx' ? 'Text, headings and lists; layout is simplified' : undefined);
    push(out, 'jpg', 'doc-img', 'Each page as a picture, zipped');
    push(out, 'png', 'doc-img', 'Each page as a picture, zipped');
  } else if (cat === 'presentation') {
    out.push({ to: 'pdf', handler: 'office', toolId: 'slides-convert' });
    out.push({ to: 'html', handler: 'office', toolId: 'slides-convert' });
    out.push({ to: 'txt', handler: 'office', toolId: 'slides-convert' });
    for (const to of DOC_OUT) if (to !== 'html') push(out, to, 'to-doc', 'The slide text as a document');
    push(out, 'jpg', 'doc-img', 'Slide text laid out as pages, zipped (not a pixel copy of the design)');
    push(out, 'png', 'doc-img', 'Slide text laid out as pages, zipped (not a pixel copy of the design)');
  } else if (cat === 'ebook') {
    out.push({ to: 'pdf', handler: 'ebook', toolId: 'ebook-convert' });
    out.push({ to: 'html', handler: 'ebook', toolId: 'ebook-convert' });
    out.push({ to: 'txt', handler: 'ebook', toolId: 'ebook-convert' });
    for (const to of DOC_OUT) if (to !== ext && to !== 'html') push(out, to, 'to-doc');
  } else if (cat === 'cad') {
    if (ext === 'dwg') {
      out.push({ to: 'dxf', handler: 'dwg', toolId: 'convert-anything', note: 'Reads the AutoCAD drawing' });
    } else {
      for (const to of CAD_OUT) out.push({ to, handler: 'cad', toolId: 'cad-convert' });
    }
  } else if (cat === 'text') {
    out.push({ to: 'png', handler: 'text-img', toolId: 'convert-anything', note: 'Renders the text to an image' });
    out.push({ to: 'jpg', handler: 'text-img', toolId: 'convert-anything' });
    out.push({ to: 'pdf', handler: 'text-pdf', toolId: 'convert-anything', note: 'Typesets the text into a PDF' });
    out.push({ to: 'mp4', handler: 'text-video', toolId: 'convert-anything', note: 'Renders the text as a short video' });
    const self = (to: string) => to === ext || (to === 'md' && ext === 'markdown') || (to === 'html' && ext === 'htm');
    for (const to of DOC_OUT) if (!self(to)) push(out, to, 'to-doc');
    if (['md', 'markdown', 'html', 'htm', 'rtf'].includes(ext)) push(out, 'txt', 'to-doc', 'Plain text, formatting removed');
    if (ext === 'yaml' || ext === 'yml') for (const to of DATA_OUT) if (to !== 'yaml' && to !== 'md') push(out, to, 'data');
  } else if (cat === 'archive') {
    if (ext !== 'zip') out.push({ to: 'zip', handler: 'archive-repack', toolId: 'archive-extract', note: 'Extracts and re-packs as .zip' });
    if (ext !== 'tar') push(out, 'tar', 'archive-tar', 'Extracts and re-packs as .tar');
    if (ext !== 'tgz') push(out, 'tgz', 'archive-tar', 'Extracts and re-packs as .tar.gz');
  } else if (cat === 'calendar') {
    out.push({ to: 'json', handler: 'calendar', toolId: 'convert-anything' });
    out.push({ to: 'csv', handler: 'calendar', toolId: 'convert-anything' });
    out.push({ to: 'txt', handler: 'calendar', toolId: 'convert-anything' });
  } else if (cat === 'email') {
    if (ext === 'msg') {
      out.push({ to: 'eml', handler: 'msg', toolId: 'convert-anything', note: 'Converts the Outlook message' });
      out.push({ to: 'html', handler: 'msg', toolId: 'convert-anything' });
      out.push({ to: 'txt', handler: 'msg', toolId: 'convert-anything' });
    } else {
      out.push({ to: 'html', handler: 'email', toolId: 'convert-anything' });
      out.push({ to: 'txt', handler: 'email', toolId: 'convert-anything' });
      if (ext === 'mbox') out.push({ to: 'eml', handler: 'email', toolId: 'convert-anything', note: 'First message as .eml' });
    }
    push(out, 'pdf', 'mail-pdf', 'The message, printed to PDF');
  } else if (cat === 'certificate') {
    for (const to of ['pem', 'crt', 'der', 'cer']) if (to !== ext) out.push({ to, handler: 'cert', toolId: 'convert-anything', note: 'PEM ↔ DER' });
  }
  return out;
}

/* --- Target grouping (the chooser lists targets under their TARGET category) --- */

export type TargetGroup =
  | 'Image' | 'Video' | 'Audio' | 'Document' | 'Spreadsheet' | 'Ebook' | 'Subtitle'
  | 'Data' | 'Text' | 'Archive' | '3D' | 'CAD' | 'Font' | 'Email' | 'Certificate';

export const TARGET_GROUP_ORDER: TargetGroup[] = [
  'Image', 'Video', 'Audio', 'Document', 'Spreadsheet', 'Ebook', 'Subtitle',
  'Data', 'Text', 'Archive', '3D', 'CAD', 'Font', 'Email', 'Certificate',
];

const GROUP_OF: Record<string, TargetGroup> = {};
const groupAll = (g: TargetGroup, l: string[]) => { for (const e of l) GROUP_OF[e] = g; };
groupAll('Image', ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tif', 'tga', 'ppm', 'ico', 'cur', 'svg']);
groupAll('Video', ['mp4', 'webm', 'mov', 'mkv', 'avi', '3gp', 'm4v', 'flv', 'wmv', 'mpg', 'ogv']);
groupAll('Audio', ['mp3', 'wav', 'm4a', 'aac', 'opus', 'flac', 'ogg', 'wma', 'aiff', 'ac3']);
groupAll('Document', ['pdf', 'docx', 'html', 'rtf']);
groupAll('Spreadsheet', ['xlsx', 'xls', 'ods', 'csv', 'tsv']);
groupAll('Ebook', ['epub']);
groupAll('Subtitle', ['srt', 'vtt', 'sbv']);
groupAll('Data', ['json', 'xml', 'yaml', 'plist']);
groupAll('Text', ['txt', 'md', 'scad']);
groupAll('Archive', ['zip', 'tar', 'tgz', 'gz']);
groupAll('3D', ['glb', 'gltf', 'stl', 'obj']);
groupAll('CAD', ['dxf']);
groupAll('Font', ['ttf', 'otf', 'woff', 'woff2']);
groupAll('Email', ['eml']);
groupAll('Certificate', ['pem', 'crt', 'der', 'cer']);

/** Category of what a target PRODUCES (not of the source). */
export function targetGroup(t: Target): TargetGroup {
  return GROUP_OF[t.to] ?? 'Data';
}

/** Targets bucketed by target category, in TARGET_GROUP_ORDER, original order kept inside a bucket. */
export function groupTargets<T extends Target>(targets: T[]): { group: TargetGroup; items: T[] }[] {
  const m = new Map<TargetGroup, T[]>();
  for (const t of targets) {
    const g = targetGroup(t);
    if (!m.has(g)) m.set(g, []);
    m.get(g)!.push(t);
  }
  return TARGET_GROUP_ORDER.filter((g) => m.has(g)).map((g) => ({ group: g, items: m.get(g)! }));
}

export function isConvertible(file: { name: string }): boolean {
  return targetsFor(extOf(file.name)).length > 0;
}

// --- The dispatcher --------------------------------------------------------
export interface ConvertOpts {
  onProgress?: (ratio: number) => void;
  imageQuality?: number; // 0..1 for jpg/webp
}

const mimeOf: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif',
  gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff', tif: 'image/tiff',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  opus: 'audio/opus', flac: 'audio/flac', ogg: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', '3gp': 'video/3gpp', m4v: 'video/x-m4v', flv: 'video/x-flv',
  pdf: 'application/pdf', txt: 'text/plain',
  html: 'text/html', json: 'application/json', csv: 'text/csv',
  eml: 'message/rfc822', pem: 'application/x-pem-file', crt: 'application/x-pem-file',
  der: 'application/pkix-cert', cer: 'application/pkix-cert',
  srt: 'application/x-subrip', vtt: 'text/vtt', sbv: 'text/plain', xml: 'application/xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ico: 'image/x-icon', cur: 'image/x-win-bitmap', scad: 'text/plain',
  tga: 'image/x-tga', ppm: 'image/x-portable-pixmap', svg: 'image/svg+xml',
  wmv: 'video/x-ms-wmv', mpg: 'video/mpeg', ogv: 'video/ogg',
  wma: 'audio/x-ms-wma', aiff: 'audio/aiff', ac3: 'audio/ac3',
  md: 'text/markdown', rtf: 'application/rtf', epub: 'application/epub+zip',
  tsv: 'text/tab-separated-values', yaml: 'text/yaml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  tar: 'application/x-tar', tgz: 'application/gzip', gz: 'application/gzip',
};

export async function convertFile(file: File, target: Target, opts: ConvertOpts = {}): Promise<ConvertOutput> {
  // Mirror conversion progress onto the global progress bar (the corner pill).
  startJob('Converting');
  updateJob('Converting', 0.05);
  try {
    const out = await runConvert(file, target, {
      ...opts,
      onProgress: (r) => { updateJob('Converting', r); opts.onProgress?.(r); },
    });
    return await brandConvertOutput(out);
  } finally {
    endJob();
  }
}

/**
 * Apply the free-tier brand mark to a converted blob by MIME, so the universal
 * converter doesn't ship clean files (its image/pdf/audio paths bypass the
 * global canvas-patch). Each helper self-gates on shouldWatermarkHere() (Pro /
 * watermark-free tools pass through untouched) and on size. Video is skipped:
 * the ffmpeg engine already stamps video output via maybeWatermarkVideo. Text /
 * data / multi-file (zip) outputs are not branded.
 */
async function brandConvertOutput(out: ConvertOutput): Promise<ConvertOutput> {
  try {
    if (!out.blob) return out;
    const type = out.blob.type || '';
    // Only formats the canvas can re-encode as themselves: stamping a GIF, ICO,
    // CUR, TIFF… would silently turn it into a PNG under the original filename
    // (and flatten an animated GIF to one frame).
    if (type === 'image/png' || type === 'image/jpeg' || type === 'image/webp') {
      const { stampImageBlob } = await import('@/lib/watermark/download');
      return { ...out, blob: await stampImageBlob(out.blob, { format: type }) };
    }
    if (type === 'application/pdf') {
      const { shouldWatermarkHere } = await import('@/lib/watermark/config');
      if (!shouldWatermarkHere()) return out;
      const { PDFDocument } = await import('pdf-lib');
      const { stampPdfFooter } = await import('@/engines/pdf');
      const doc = await PDFDocument.load(await out.blob.arrayBuffer());
      await stampPdfFooter(doc);
      const bytes = await doc.save();
      return { ...out, blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }) };
    }
    if (type.startsWith('audio/')) {
      const { brandAudioBlob } = await import('@/lib/watermark/audio');
      return { ...out, blob: await brandAudioBlob(out.blob) };
    }
  } catch { /* never break a conversion over branding */ }
  return out;
}

/**
 * createImageBitmap cannot decode TIFF outside Safari, so every canvas path
 * (re-encode, → PDF, → MP4) failed on Chrome/Firefox for .tif/.tiff input.
 * Decode those to PNG with ffmpeg.wasm first; everything else passes through.
 */
async function browserDecodable(file: File): Promise<Blob> {
  const ext = extOf(file.name);
  if (ext !== 'tiff' && ext !== 'tif') return file;
  const { runFfmpeg } = await import('@/engines/ffmpeg');
  return runFfmpeg({
    input: file, inputName: `in.${ext}`, outputName: 'out.png',
    args: (i, o) => ['-i', i, '-frames:v', '1', o], mimeType: 'image/png',
  });
}

function canvasBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Image encode failed'))), type, q));
}

/** Let the browser decode any image it can (avif, animated webp, ico, tiff via ffmpeg) and return a PNG. */
async function pngOf(file: File): Promise<Blob> {
  const bm = await createImageBitmap(await browserDecodable(file));
  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
  c.getContext('2d')!.drawImage(bm, 0, 0); bm.close();
  return canvasBlob(c, 'image/png');
}

function dataUrl(b: Blob): Promise<string> {
  return new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.onerror = () => j(fr.error); fr.readAsDataURL(b); });
}

/** Audio the browser cannot decode (wma, aiff, amr, avi/mkv tracks…) is first turned into 16 kHz mono WAV by ffmpeg. */
async function speechInput(file: File): Promise<Blob> {
  const ext = extOf(file.name);
  if (WEB_DECODABLE.has(ext)) return file;
  const { runFfmpeg } = await import('@/engines/ffmpeg');
  return runFfmpeg({
    input: file, inputName: `in.${ext || 'bin'}`, outputName: 'speech.wav',
    args: (i, o) => ['-i', i, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', o], mimeType: 'audio/wav',
  });
}

async function decodeAnyAudio(file: File): Promise<AudioBuffer> {
  const eng = await import('@/engines/audio');
  return eng.decode(await (await speechInput(file)).arrayBuffer());
}

/** 1280×720 still for audio → video: the MP3's cover art if it has one, else a title card with the waveform. */
async function audioCard(file: File, title: string): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#101218'; ctx.fillRect(0, 0, 1280, 720);
  if (extOf(file.name) === 'mp3') {
    try {
      const { extractPictures } = await import('@/lib/convert/formats/id3');
      const pic = extractPictures(new Uint8Array(await file.arrayBuffer()))[0];
      if (pic) {
        const bm = await createImageBitmap(new Blob([pic.data as BlobPart], { type: pic.mime }));
        const k = Math.min(1280 / bm.width, 720 / bm.height);
        const w = Math.round(bm.width * k), h = Math.round(bm.height * k);
        ctx.drawImage(bm, (1280 - w) >> 1, (720 - h) >> 1, w, h); bm.close();
        return canvasBlob(c, 'image/png');
      }
    } catch { /* fall through to the title card */ }
  }
  try {
    const { drawWaveform } = await import('@/lib/convert/formats/extra');
    drawWaveform(ctx, await decodeAnyAudio(file), 80, 300, 1120, 300, '#5b7cfa');
  } catch { /* a card without a waveform is still a valid frame */ }
  ctx.fillStyle = '#ffffff'; ctx.font = '600 44px system-ui, -apple-system, "Segoe UI", sans-serif'; ctx.textBaseline = 'top';
  let t = title;
  while (t.length > 4 && ctx.measureText(t).width > 1120) t = t.slice(0, -2);
  ctx.fillText(t === title ? t : `${t}…`, 80, 120);
  return canvasBlob(c, 'image/png');
}

/** The paragraph model of any text-bearing file (pdf, docx, doc/odt, slides, epub, html, md, txt, rtf, code…). */
async function docParas(file: File, base: string, onProgress?: (r: number) => void): Promise<{ paras: import('@/lib/convert/formats/extra').Para[]; title: string }> {
  const X = await import('@/lib/convert/formats/extra');
  const ext = extOf(file.name);
  const cat = FORMAT_CATEGORY[ext];
  if (cat === 'pdf') {
    const { extractPdfLayout } = await import('@/lib/convert/formats/pdf-docx');
    const l = await extractPdfLayout(await file.arrayBuffer(), onProgress);
    return { paras: l.paras.map((p) => ({ kind: p.kind, text: p.text })), title: base };
  }
  if (ext === 'docx') {
    const { docxToHtml } = await import('@/engines/document');
    return { paras: X.htmlToParas(await docxToHtml(file)), title: base };
  }
  if (cat === 'document' || cat === 'presentation') {
    const { officeToContent } = await import('@/engines/office');
    const c = await officeToContent(file, ext);
    return { paras: X.htmlToParas(c.html), title: c.title || base };
  }
  if (cat === 'ebook') {
    const { epubToContent } = await import('@/engines/ebook');
    const c = await epubToContent(file);
    return { paras: X.htmlToParas(c.html), title: c.title || base };
  }
  if (ext === 'html' || ext === 'htm') return { paras: X.htmlToParas(await file.text()), title: base };
  const { fileToText } = await import('@/engines/text-render');
  return { paras: X.textToParas(await fileToText(file, ext), ext === 'md' || ext === 'markdown'), title: base };
}

/** Every file inside an archive (zip/rar/7z/tar/gz/iso… via libarchive.js). */
async function extractAll(file: File, onProgress?: (r: number) => void): Promise<{ name: string; data: Uint8Array }[]> {
  const { openArchive, listArchive } = await import('@/engines/archive');
  const handle = await openArchive(file);
  const entries = await listArchive(handle);
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const f = await e.extract();
    files.push({ name: (e.path || '') + e.name, data: new Uint8Array(await f.arrayBuffer()) });
    onProgress?.((i + 1) / Math.max(1, entries.length));
  }
  try { await handle.close(); } catch { /* */ }
  return files;
}

async function runConvert(file: File, target: Target, opts: ConvertOpts = {}): Promise<ConvertOutput> {
  const base = file.name.replace(/\.[^.]+$/, '');
  const q = opts.imageQuality ?? 0.92;

  switch (target.handler) {
    case 'image': {
      // gif / bmp / tiff aren't jsquash formats — encode them via ffmpeg.wasm.
      if (IMAGE_FF.has(target.to)) {
        const { runFfmpeg } = await import('@/engines/ffmpeg');
        let inExt = extOf(file.name) || 'png';
        let input: Blob = file;
        // ffmpeg 5.1's wasm core has no AVIF (dav1d) decoder and no animated-WebP
        // decoder; let the browser decode those (and icons) and hand ffmpeg a PNG.
        if (['avif', 'webp', 'ico'].includes(inExt)) { input = await pngOf(file); inExt = 'png'; }
        const blob = await runFfmpeg({
          input, inputName: `in.${inExt}`, outputName: `out.${target.to}`,
          args: (i, o) => ['-i', i, '-frames:v', '1', o],
          mimeType: mimeOf[target.to] || 'application/octet-stream', onProgress: opts.onProgress,
        });
        return { blob, filename: `${base}.${target.to}` };
      }
      // Decode → encode via the jsquash codec (runs in the codec worker): wider
      // format support (incl. AVIF) and off the main thread vs canvas.toBlob.
      const bm = await createImageBitmap(await browserDecodable(file));
      const canvas = document.createElement('canvas');
      canvas.width = bm.width; canvas.height = bm.height;
      const ctx = canvas.getContext('2d')!;
      if (target.to === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(bm, 0, 0); bm.close();
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { encode } = await import('@/engines/image');
      const fmt = (target.to === 'jpg' ? 'jpeg' : target.to) as 'png' | 'jpeg' | 'webp' | 'avif';
      const { blob } = await encode(imageData, fmt, { quality: Math.round(q * 100) });
      return { blob, filename: `${base}.${target.to}` };
    }
    case 'audio': {
      // mp3 / wav: light Web-Audio + lamejs path. Everything else (m4a, aac, opus,
      // flac): ffmpeg.wasm with the right encoder. Covers any audio → any audio.
      // wma / aiff / amr / … are not decodable by Web Audio: those go through ffmpeg too.
      if ((target.to === 'mp3' || target.to === 'wav') && WEB_DECODABLE.has(extOf(file.name))) {
        const eng = await import('@/engines/audio');
        const buf = await eng.decode(await file.arrayBuffer());
        const blob = target.to === 'mp3' ? await eng.encodeMp3(buf) : eng.encodeWav(buf);
        return { blob, filename: `${base}.${target.to}` };
      }
      const { runFfmpeg } = await import('@/engines/ffmpeg');
      const inExt = extOf(file.name) || 'mp3';
      const codec = AUDIO_CODEC[target.to] ?? ['-c:a', 'aac'];
      const blob = await runFfmpeg({
        input: file, inputName: `in.${inExt}`, outputName: `out.${target.to}`,
        args: (i, o) => ['-i', i, '-vn', ...codec, o],
        mimeType: mimeOf[target.to] || 'audio/mp4', onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.${target.to}` };
    }
    case 'video': {
      // Any video container ffmpeg can mux (mp4/webm/mov/mkv/avi/3gp/m4v/flv).
      const { runFfmpeg } = await import('@/engines/ffmpeg');
      const inExt = extOf(file.name) || 'mp4';
      const codec = VIDEO_CODEC[target.to] ?? VIDEO_CODEC.mp4;
      const blob = await runFfmpeg({
        input: file, inputName: `in.${inExt}`, outputName: `out.${target.to}`,
        args: (i, o) => ['-i', i, ...codec, o],
        mimeType: mimeOf[target.to] || 'video/mp4', onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.${target.to}` };
    }
    case 'video-audio': {
      // Extract the audio track to ANY audio format (target.to = mp3/m4a/aac/opus/
      // flac/wav). This is what makes e.g. 3gp → m4a work.
      const { runFfmpeg } = await import('@/engines/ffmpeg');
      const inExt = extOf(file.name) || 'mp4';
      const to = AUDIO_CODEC[target.to] ? target.to : 'mp3';
      const codec = AUDIO_CODEC[to] ?? ['-c:a', 'libmp3lame', '-b:a', '192k'];
      const blob = await runFfmpeg({
        input: file, inputName: `in.${inExt}`, outputName: `out.${to}`,
        args: (i, o) => ['-i', i, '-vn', ...codec, o],
        mimeType: mimeOf[to] || 'audio/mpeg', onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.${to}` };
    }
    case 'video-gif': {
      const { runFfmpeg } = await import('@/engines/ffmpeg');
      const inExt = extOf(file.name) || 'mp4';
      const blob = await runFfmpeg({
        input: file, inputName: `in.${inExt}`, outputName: 'out.gif',
        args: (i, o) => ['-i', i, '-vf', 'fps=12,scale=480:-1:flags=lanczos', o],
        mimeType: 'image/gif', onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.gif` };
    }
    case 'img-pdf': {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      const bytes = await file.arrayBuffer();
      const isPng = extOf(file.name) === 'png';
      let img;
      if (isPng) img = await doc.embedPng(bytes);
      else if (['jpg', 'jpeg'].includes(extOf(file.name))) img = await doc.embedJpg(bytes);
      else {
        const bm = await createImageBitmap(await browserDecodable(file));
        const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
        c.getContext('2d')!.drawImage(bm, 0, 0); bm.close();
        const png: Blob = await new Promise((r, j) => c.toBlob((b) => b ? r(b) : j(new Error('e')), 'image/png'));
        img = await doc.embedPng(await png.arrayBuffer());
      }
      const page = doc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      const out = await doc.save();
      return { blob: new Blob([new Uint8Array(out)], { type: 'application/pdf' }), filename: `${base}.pdf` };
    }
    case 'img-video': {
      // One still picture → a 5-second video in any container ffmpeg muxes.
      const { runFfmpegMulti } = await import('@/engines/ffmpeg');
      const to = STILL_VCODEC[target.to] ? target.to : 'mp4';
      const bm = await createImageBitmap(await browserDecodable(file));
      // Cap at 1920 px (wasm encoders + memory) and keep even dimensions (yuv420p).
      const k = Math.min(1, 1920 / Math.max(bm.width, bm.height));
      let W = Math.max(2, Math.round(bm.width * k)), H = Math.max(2, Math.round(bm.height * k));
      W -= W % 2; H -= H % 2;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d')!;
      if (to !== 'webm') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      ctx.drawImage(bm, 0, 0, W, H); bm.close();
      const png = await canvasBlob(c, 'image/png');
      const blob = await runFfmpegMulti({
        inputs: [{ name: 'frame000.png', data: png }], outputName: `out.${to}`,
        args: (_n, o) => ['-loop', '1', '-i', 'frame000.png', '-t', '5', '-r', '25', ...STILL_VCODEC[to], o],
        mimeType: mimeOf[to] || 'video/mp4', onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.${to}` };
    }
    case 'pdf-img': {
      const { rasterizePdf } = await import('@/engines/pdf/rasterize');
      const pages = await rasterizePdf(await file.arrayBuffer(), { maxEdge: 1600, onProgress: (p) => opts.onProgress?.(p.page / p.pageCount) });
      const files: { name: string; blob: Blob }[] = [];
      for (const p of pages) {
        const blob: Blob = await new Promise((r, j) => p.canvas.toBlob((b) => b ? r(b) : j(new Error('e')), mimeOf[target.to], q));
        files.push({ name: `${base}-${String(p.index + 1).padStart(3, '0')}.${target.to}`, blob });
      }
      return { files, filename: `${base}-pages.zip` };
    }
    case 'pdf-txt': {
      const { extractPdfText } = await import('@/engines/pdf/rasterize');
      const pages = await extractPdfText(await file.arrayBuffer(), { onProgress: (p) => opts.onProgress?.(p.page / p.pageCount) });
      return { text: pages.map((p) => p.text).join('\n\n'), filename: `${base}.txt` };
    }
    case 'pdf-docx': {
      const { pdfToDocx } = await import('@/lib/convert/formats/pdf-docx');
      return { blob: await pdfToDocx(await file.arrayBuffer(), base, opts.onProgress), filename: `${base}.docx` };
    }
    case 'model-render': {
      const buf = await file.arrayBuffer();
      if (target.to === 'gif') {
        const { renderModelGif } = await import('@/lib/convert/formats/model-render');
        return { blob: await renderModelGif(buf, { onProgress: opts.onProgress }), filename: `${base}.gif` };
      }
      const { renderModelPng } = await import('@/lib/convert/formats/model-render');
      return { blob: await renderModelPng(buf), filename: `${base}.png` };
    }
    case 'ocr': {
      const { recognize } = await import('@/engines/ocr');
      const res = await recognize(file, { onProgress: (p) => opts.onProgress?.(p.ratio) });
      return { text: res.text, filename: `${base}.txt` };
    }
    case 'transcribe': {
      const { transcribe } = await import('@/engines/transcribe');
      const res = await transcribe(await speechInput(file), { onProgress: (p) => opts.onProgress?.(p.ratio) });
      return { text: res.text, filename: `${base}.txt` };
    }
    case 'model3d': {
      const { convertModelInWorker } = await import('@/engines/model3d/client');
      const data = new Uint8Array(await file.arrayBuffer());
      const out = await convertModelInWorker([{ name: file.name, data }], target.to === 'gltf' ? 'gltf' : 'glb');
      if (out.files.length === 1) {
        return { blob: new Blob([out.files[0].data as unknown as BlobPart], { type: 'model/gltf-binary' }), filename: out.files[0].name };
      }
      return { files: out.files.map((f) => ({ name: f.name, blob: new Blob([f.data as unknown as BlobPart]) })), filename: `${base}-gltf.zip` };
    }
    case 'sheet': {
      if (['csv', 'xlsx', 'html', 'json'].includes(target.to)) {
        const { convertSheet } = await import('@/engines/document');
        const { blob, ext } = await convertSheet(file, target.to as 'csv' | 'xlsx' | 'html' | 'json');
        return { blob, filename: `${base}.${ext}` };
      }
      // First sheet → tsv / ods / xls / xml / yaml / markdown table / pdf.
      const { readWorkbook } = await import('@/engines/document');
      const { XLSX, wb } = await readWorkbook(file);
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (target.to === 'tsv') return { blob: new Blob([XLSX.utils.sheet_to_csv(ws, { FS: '\t' })], { type: mimeOf.tsv }), filename: `${base}.tsv` };
      if (target.to === 'ods' || target.to === 'xls') {
        const out = XLSX.write(wb, { bookType: target.to === 'xls' ? 'biff8' : 'ods', type: 'array' });
        return { blob: new Blob([out], { type: mimeOf[target.to] }), filename: `${base}.${target.to}` };
      }
      if (target.to === 'pdf') {
        const table = /<table[\s\S]*<\/table>/i.exec(XLSX.utils.sheet_to_html(ws))?.[0] ?? '';
        const { htmlToPdf } = await import('@/engines/document');
        const html = `<style>table{border-collapse:collapse;font:12px Arial,sans-serif}td,th{border:1px solid #999;padding:3px 6px}</style>${table}`;
        return { blob: await htmlToPdf(html, base), filename: `${base}.pdf` };
      }
      const X = await import('@/lib/convert/formats/extra');
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, string | number | boolean | null>[];
      if (target.to === 'md') return { blob: new Blob([X.rowsToMd(rows)], { type: 'text/markdown' }), filename: `${base}.md` };
      if (target.to === 'yaml') return { blob: new Blob([await X.valueToYaml(rows)], { type: 'text/yaml' }), filename: `${base}.yaml` };
      return { blob: new Blob([X.valueToXml({ rows: { row: rows } })], { type: 'application/xml' }), filename: `${base}.xml` };
    }
    case 'text-img': {
      const { fileToText, renderTextToImage } = await import('@/engines/text-render');
      const txt = await fileToText(file, extOf(file.name));
      const blob = await renderTextToImage(txt, target.to === 'jpg' ? 'image/jpeg' : 'image/png');
      return { blob, filename: `${base}.${target.to}` };
    }
    case 'text-pdf': {
      const { fileToText, renderTextToPdf } = await import('@/engines/text-render');
      const txt = await fileToText(file, extOf(file.name));
      return { blob: await renderTextToPdf(txt), filename: `${base}.pdf` };
    }
    case 'text-video': {
      // The "impossible" bridge: text → rendered image → short video.
      const { fileToText, renderTextToImage } = await import('@/engines/text-render');
      const { runFfmpegMulti } = await import('@/engines/ffmpeg');
      const txt = await fileToText(file, extOf(file.name));
      const png = await renderTextToImage(txt, 'image/png');
      const blob = await runFfmpegMulti({
        inputs: [{ name: 'frame000.png', data: png }], outputName: 'out.mp4',
        args: (_n, o) => ['-loop', '1', '-i', 'frame000.png', '-t', '6', '-r', '30',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', o],
        mimeType: 'video/mp4', onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.mp4` };
    }
    case 'archive-repack': {
      // Any archive (rar/7z/tar/gz/iso…) → extract all → re-pack as .zip, on-device.
      const { zipFiles } = await import('@/engines/archive');
      return { blob: await zipFiles(await extractAll(file, opts.onProgress)), filename: `${base}.zip` };
    }
    case 'calendar': {
      const { parseCalendar, toJson, toCsv, toTxt } = await import('@/engines/calendar');
      const recs = parseCalendar(await file.text());
      if (target.to === 'json') return { text: toJson(recs), filename: `${base}.json` };
      if (target.to === 'csv') return { text: toCsv(recs), filename: `${base}.csv` };
      return { text: toTxt(recs), filename: `${base}.txt` };
    }
    case 'psd': {
      const { psdToImage, psdToImageData } = await import('@/engines/psd');
      if (target.to === 'pdf') {
        // Composite → PNG → embed in a one-page PDF sized to the artwork.
        const imageData = await psdToImageData(file);
        const c = document.createElement('canvas'); c.width = imageData.width; c.height = imageData.height;
        c.getContext('2d')!.putImageData(imageData, 0, 0);
        const png: Blob = await new Promise((r, j) => c.toBlob((b) => b ? r(b) : j(new Error('e')), 'image/png'));
        const { PDFDocument } = await import('pdf-lib');
        const doc = await PDFDocument.create();
        const img = await doc.embedPng(await png.arrayBuffer());
        const page = doc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        return { blob: new Blob([new Uint8Array(await doc.save())], { type: 'application/pdf' }), filename: `${base}.pdf` };
      }
      const blob = await psdToImage(file, target.to as 'png' | 'jpg' | 'webp', Math.round(q * 100));
      return { blob, filename: `${base}.${target.to}` };
    }
    case 'pdf-raster': {
      // Rasterize the FIRST page of a pdf-compatible file (e.g. Illustrator .ai) to an image.
      const { rasterizePdf } = await import('@/engines/pdf/rasterize');
      const pages = await rasterizePdf(await file.arrayBuffer(), { maxEdge: 2000, pages: [0], onProgress: (p) => opts.onProgress?.(p.page / p.pageCount) });
      const p = pages[0];
      if (!p) throw new Error('Nothing to rasterize');
      const blob: Blob = await new Promise((r, j) => p.canvas.toBlob((b) => b ? r(b) : j(new Error('e')), mimeOf[target.to], q));
      return { blob, filename: `${base}.${target.to}` };
    }
    case 'ai': {
      // Modern .ai is a PDF — passing the bytes through yields a valid .pdf.
      return { blob: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }), filename: `${base}.pdf` };
    }
    case 'msg': {
      const m = await import('@/engines/msg');
      if (target.to === 'eml') return { blob: new Blob([await m.msgToEml(file)], { type: 'message/rfc822' }), filename: `${base}.eml` };
      if (target.to === 'html') return { blob: new Blob([await m.msgToHtml(file)], { type: 'text/html' }), filename: `${base}.html` };
      return { text: await m.msgToText(file), filename: `${base}.txt` };
    }
    case 'email': {
      const m = await import('@/engines/email');
      const ext = extOf(file.name);
      if (target.to === 'eml') return { blob: new Blob([await m.mboxToEml(file)], { type: 'message/rfc822' }), filename: `${base}.eml` };
      if (target.to === 'html') return { blob: new Blob([await m.emailToHtml(file, ext)], { type: 'text/html' }), filename: `${base}.html` };
      return { text: await m.emailToText(file, ext), filename: `${base}.txt` };
    }
    case 'cert': {
      const { convertCert } = await import('@/engines/cert');
      const { blob, ext } = await convertCert(file, target.to);
      return { blob, filename: `${base}.${ext}` };
    }
    case 'dwg': {
      const { dwgToDxf } = await import('@/engines/dwg');
      return { blob: await dwgToDxf(file), filename: `${base}.dxf` };
    }
    case 'docx': {
      const doc = await import('@/engines/document');
      if (target.to === 'pdf') return { blob: await doc.docxToPdf(file), filename: `${base}.pdf` };
      if (target.to === 'html') return { blob: new Blob([await doc.docxToHtml(file)], { type: 'text/html' }), filename: `${base}.html` };
      return { text: await doc.docxToText(file), filename: `${base}.txt` };
    }
    case 'ebook': {
      const { epubToContent, htmlToPlainText } = await import('@/engines/ebook');
      const c = await epubToContent(file);
      if (target.to === 'txt') return { text: htmlToPlainText(c.html), filename: `${base}.txt` };
      if (target.to === 'html') return { blob: new Blob([`<!doctype html><meta charset="utf-8"><title>${c.title}</title><body>${c.html}</body>`], { type: 'text/html' }), filename: `${base}.html` };
      const { htmlToPdf } = await import('@/engines/document');
      return { blob: await htmlToPdf(`<h1>${c.title}</h1>${c.html}`, base), filename: `${base}.pdf` };
    }
    case 'office': {
      const { officeToContent } = await import('@/engines/office');
      const c = await officeToContent(file, extOf(file.name));
      if (target.to === 'txt') { const { htmlToPlainText } = await import('@/engines/ebook'); return { text: htmlToPlainText(c.html), filename: `${base}.txt` }; }
      if (target.to === 'html') return { blob: new Blob([`<!doctype html><meta charset="utf-8"><title>${c.title}</title><body>${c.html}</body>`], { type: 'text/html' }), filename: `${base}.html` };
      const { htmlToPdf } = await import('@/engines/document');
      return { blob: await htmlToPdf(`<h1>${c.title}</h1>${c.html}`, base), filename: `${base}.pdf` };
    }
    case 'cad': {
      const { cadKind } = await import('@/engines/cad');
      const { convertCadInWorker } = await import('@/engines/cad/client');
      const kind = cadKind(extOf(file.name));
      if (!kind) throw new Error('Unsupported CAD format');
      const { text } = await convertCadInWorker(file, kind, target.to === 'obj' ? 'obj' : 'stl');
      return { blob: new Blob([text], { type: 'text/plain' }), filename: `${base}.${target.to}` };
    }
    case 'subtitle': {
      const { convertSubtitle } = await import('@/lib/convert/formats/subtitle');
      const from = extOf(file.name) as 'srt' | 'vtt' | 'sbv' | 'ass' | 'ssa';
      const to = target.to as 'srt' | 'vtt' | 'sbv' | 'txt';
      const text = convertSubtitle(await file.text(), from, to);
      if (to === 'txt') return { text, filename: `${base}.txt` };
      return { blob: new Blob([text], { type: mimeOf[to] }), filename: `${base}.${to}` };
    }
    case 'font': {
      const { woffToSfnt, sfntToWoff, sniffFont } = await import('@/lib/convert/formats/woff');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = sniffFont(bytes);
      if (!kind) throw new Error('This file is not a TTF, OTF, WOFF or WOFF2 font.');
      // Normalise the input to plain SFNT tables first (sniffed, not trusted from the extension).
      let sfnt: Uint8Array;
      if (kind === 'woff2') sfnt = (await (await import('@/lib/convert/formats/woff2')).woff2ToSfnt(bytes)).font;
      else if (kind === 'woff') sfnt = woffToSfnt(bytes).font;
      else sfnt = bytes;
      if (target.to === 'woff2') {
        const { sfntToWoff2 } = await import('@/lib/convert/formats/woff2');
        return { blob: new Blob([(await sfntToWoff2(sfnt)) as BlobPart], { type: 'font/woff2' }), filename: `${base}.woff2` };
      }
      if (target.to === 'woff') {
        return { blob: new Blob([sfntToWoff(sfnt) as BlobPart], { type: 'font/woff' }), filename: `${base}.woff` };
      }
      // An OpenType file may hold TrueType or CFF outlines under either extension;
      // the tables are returned exactly as the container wrapped them.
      const font = sfnt;
      return { blob: new Blob([font as BlobPart], { type: mimeOf[target.to] }), filename: `${base}.${target.to}` };
    }
    case 'ani': {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (target.to === 'gif') {
        const { aniToGif } = await import('@/lib/convert/formats/ani-browser');
        return { blob: await aniToGif(bytes), filename: `${base}.gif` };
      }
      if (target.to === 'png') {
        const { aniToPng } = await import('@/lib/convert/formats/ani-browser');
        return { blob: await aniToPng(bytes), filename: `${base}.png` };
      }
      const { parseAni, frameToIcoCur } = await import('@/lib/convert/formats/ani');
      const ani = parseAni(bytes);
      const as = target.to === 'ico' ? 'ico' : 'cur';
      const out = frameToIcoCur(ani.frames[ani.sequence[0] ?? 0], as);
      return { blob: new Blob([out as BlobPart], { type: mimeOf[as] }), filename: `${base}.${as}` };
    }
    case 'cover-art': {
      const { extractPictures } = await import('@/lib/convert/formats/id3');
      const pics = extractPictures(new Uint8Array(await file.arrayBuffer()));
      if (!pics.length) throw new Error('This MP3 has no embedded cover art (no picture in its ID3 tag).');
      const pic = pics[0];
      const want = mimeOf[target.to];
      if (pic.mime === want) return { blob: new Blob([pic.data as BlobPart], { type: want }), filename: `${base}.${target.to}` };
      // Stored in another format (e.g. PNG art, JPG wanted) → re-encode on a canvas.
      const bm = await createImageBitmap(new Blob([pic.data as BlobPart], { type: pic.mime }));
      const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
      const ctx = c.getContext('2d')!;
      if (target.to === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(bm, 0, 0); bm.close();
      const blob: Blob = await new Promise((r, j) => c.toBlob((b) => b ? r(b) : j(new Error('Image encode failed')), want, q));
      return { blob, filename: `${base}.${target.to}` };
    }
    case 'plist': {
      const p = await import('@/lib/convert/formats/plist');
      const v = p.parsePlist(new Uint8Array(await file.arrayBuffer()));
      if (target.to === 'json') return { text: p.plistToJson(v), filename: `${base}.json` };
      if (target.to === 'xml') return { blob: new Blob([p.plistToXml(v)], { type: 'application/xml' }), filename: `${base}.xml` };
      return { text: p.plistToText(v), filename: `${base}.txt` };
    }
    case 'stl-scad': {
      const { stlToScad } = await import('@/lib/convert/formats/stl-scad');
      const scad = stlToScad(new Uint8Array(await file.arrayBuffer()), base);
      return { blob: new Blob([scad], { type: 'text/plain' }), filename: `${base}.scad` };
    }
    case 'dat-text': {
      const { datToText } = await import('@/lib/convert/formats/dat');
      return { text: datToText(new Uint8Array(await file.arrayBuffer())).text, filename: `${base}.txt` };
    }
    case 'zip': {
      const { zipSync } = await import('fflate');
      const data = zipSync({ [file.name]: [new Uint8Array(await file.arrayBuffer()), { level: 6, mtime: new Date(file.lastModified || Date.now()) }] });
      return { blob: new Blob([data as BlobPart], { type: 'application/zip' }), filename: `${base}.zip` };
    }
    case 'img-ico': {
      // PNG-in-ICO frames at the standard sizes up to the picture's own size.
      const { buildIco } = await import('@/lib/convert/formats/extra');
      const bm = await createImageBitmap(await browserDecodable(file));
      const edge = Math.max(bm.width, bm.height);
      const wanted = target.to === 'cur' ? [32, 48] : [16, 32, 48, 64, 128, 256];
      let sizes = wanted.filter((n) => n <= Math.max(edge, 16));
      if (!sizes.length) sizes = [wanted[0]];
      const frames: { png: Uint8Array; width: number; height: number }[] = [];
      for (const n of sizes) {
        const c = document.createElement('canvas'); c.width = n; c.height = n;
        const k = Math.min(n / bm.width, n / bm.height);
        const w = Math.max(1, Math.round(bm.width * k)), h = Math.max(1, Math.round(bm.height * k));
        const ctx = c.getContext('2d')!;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bm, Math.floor((n - w) / 2), Math.floor((n - h) / 2), w, h);
        frames.push({ png: new Uint8Array(await (await canvasBlob(c, 'image/png')).arrayBuffer()), width: n, height: n });
      }
      bm.close();
      const as = target.to === 'cur' ? 'cur' : 'ico';
      return { blob: new Blob([buildIco(frames, as) as BlobPart], { type: mimeOf[as] }), filename: `${base}.${as}` };
    }
    case 'img-svg':
    case 'img-html': {
      const src = await browserDecodable(file);
      const bm = await createImageBitmap(src); const w = bm.width, h = bm.height; bm.close();
      // TIFF was re-encoded to PNG above; everything else embeds its original bytes.
      const url = await dataUrl(src === file ? new Blob([await file.arrayBuffer()], { type: mimeOf[extOf(file.name)] || file.type || 'image/png' }) : src);
      const { escXml } = await import('@/lib/convert/formats/extra');
      if (target.to === 'svg') {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" href="${url}" xlink:href="${url}"/></svg>\n`;
        return { blob: new Blob([svg], { type: 'image/svg+xml' }), filename: `${base}.svg` };
      }
      const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escXml(base)}</title><style>body{margin:0;background:#111;display:grid;place-items:center;min-height:100vh}img{max-width:100%;height:auto}</style></head><body><img src="${url}" width="${w}" height="${h}" alt="${escXml(base)}"></body></html>\n`;
      return { blob: new Blob([html], { type: 'text/html' }), filename: `${base}.html` };
    }
    case 'img-docx': {
      const { buildDocx } = await import('@/lib/convert/formats/extra');
      const ext = extOf(file.name);
      const bm = await createImageBitmap(await browserDecodable(file));
      const w = bm.width, h = bm.height;
      let data: Uint8Array, kind: 'png' | 'jpeg';
      if (ext === 'jpg' || ext === 'png') { data = new Uint8Array(await file.arrayBuffer()); kind = ext === 'jpg' ? 'jpeg' : 'png'; bm.close(); }
      else {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(bm, 0, 0); bm.close();
        data = new Uint8Array(await (await canvasBlob(c, 'image/png')).arrayBuffer()); kind = 'png';
      }
      return { blob: buildDocx([], base, { data, ext: kind, width: w, height: h }), filename: `${base}.docx` };
    }
    case 'video-frames': {
      // One frame per second (max 120, max 1280 px wide) streamed out as one
      // image2pipe file, then split into single images and zipped by the caller.
      const { runFfmpeg } = await import('@/engines/ffmpeg');
      // The browser's own decoder (as Video Poster / Thumbnail do): seek to each
      // second and draw the frame. The ffmpeg image2pipe/mjpeg routes failed on
      // every video with the bundled core (measured 09-29).
      const png = target.to === 'png';
      const { getVideoInfo, extractFrameAt } = await import('@/engines/video');
      let src: File = file;
      let loaded;
      try { loaded = await getVideoInfo(src); } catch {
        // Not playable in this browser (avi, wmv, flv…): transcode to MP4 first.
        const mp4 = await runFfmpeg({ input: file, inputName: `in.${extOf(file.name) || 'bin'}`, outputName: 'out.mp4',
          args: (i, o) => ['-i', i, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', o], mimeType: 'video/mp4' });
        src = new File([mp4], 'in.mp4', { type: 'video/mp4' });
        loaded = await getVideoInfo(src);
      }
      const { info, video, url } = loaded;
      const n = Math.max(1, Math.min(120, Math.floor(info.duration || 1)));
      const scale = info.width > 1280 ? 1280 / info.width : 1;
      const files: { name: string; blob: Blob }[] = [];
      try {
        for (let s = 0; s < n; s++) {
          const blob = await extractFrameAt(video, Math.min(s + 0.05, Math.max(0, (info.duration || 0) - 0.05)), scale, png ? 'image/png' : 'image/jpeg', 0.9);
          files.push({ name: `${base}-${String(s + 1).padStart(4, '0')}s.${target.to}`, blob });
          opts.onProgress?.((s + 1) / n);
        }
      } finally { URL.revokeObjectURL(url); }
      if (!files.length) throw new Error('No frames could be read from this video.');
      return { files, filename: `${base}-frames.zip` };
    }
    case 'audio-wave': {
      const ab = await decodeAnyAudio(file);
      const c = document.createElement('canvas'); c.width = 1600; c.height = 400;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      const { drawWaveform } = await import('@/lib/convert/formats/extra');
      drawWaveform(ctx, ab, 0, 20, c.width, c.height - 40, '#2f54eb');
      return { blob: await canvasBlob(c, 'image/png'), filename: `${base}-waveform.png` };
    }
    case 'audio-video': {
      const { runFfmpegMulti } = await import('@/engines/ffmpeg');
      const inExt = extOf(file.name) || 'mp3';
      const to = AV_AUDIO[target.to] ? target.to : 'mp4';
      const card = await audioCard(file, base);
      const blob = await runFfmpegMulti({
        inputs: [{ name: 'card.png', data: card }, { name: `in.${inExt}`, data: file }], outputName: `out.${to}`,
        args: (_n, o) => ['-loop', '1', '-framerate', '2', '-i', 'card.png', '-i', `in.${inExt}`, '-map', '0:v', '-map', '1:a',
          ...STILL_VCODEC[to], '-r', '2', ...AV_AUDIO[to], '-shortest', o],
        mimeType: mimeOf[to] || 'video/mp4', onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.${to}` };
    }
    case 'transcribe-sub': {
      const { transcribe, chunksToSrt, chunksToVtt } = await import('@/engines/transcribe');
      const res = await transcribe(await speechInput(file), { onProgress: (p) => opts.onProgress?.(p.ratio) });
      if (!res.chunks?.length) throw new Error('No speech was found to time as subtitles.');
      const text = target.to === 'vtt' ? chunksToVtt(res.chunks) : chunksToSrt(res.chunks);
      return { blob: new Blob([text], { type: mimeOf[target.to] }), filename: `${base}.${target.to}` };
    }
    case 'to-doc': {
      const X = await import('@/lib/convert/formats/extra');
      const { paras, title } = await docParas(file, base, opts.onProgress);
      if (!paras.length) throw new Error('No text was found in this file (a scan or picture needs OCR first).');
      switch (target.to) {
        case 'docx': return { blob: X.buildDocx(paras, title), filename: `${base}.docx` };
        case 'html': return { blob: new Blob([X.parasToHtml(paras, title)], { type: 'text/html' }), filename: `${base}.html` };
        case 'md': return { blob: new Blob([X.parasToMd(paras)], { type: 'text/markdown' }), filename: `${base}.md` };
        case 'rtf': return { blob: new Blob([X.parasToRtf(paras)], { type: 'application/rtf' }), filename: `${base}.rtf` };
        case 'epub': return { blob: X.buildEpub(paras, title), filename: `${base}.epub` };
        default: return { text: paras.filter((p) => p.kind !== 'pagebreak').map((p) => p.text).join('\n\n'), filename: `${base}.txt` };
      }
    }
    case 'doc-img': {
      // Document → PDF (the same renderer as → PDF) → one picture per page.
      const ext = extOf(file.name);
      const docEng = await import('@/engines/document');
      let pdf: Blob;
      if (ext === 'docx') pdf = await docEng.docxToPdf(file);
      else {
        const { officeToContent } = await import('@/engines/office');
        const c = await officeToContent(file, ext);
        pdf = await docEng.htmlToPdf(`<h1>${c.title}</h1>${c.html}`, base);
      }
      const { rasterizePdf } = await import('@/engines/pdf/rasterize');
      const pages = await rasterizePdf(await pdf.arrayBuffer(), { maxEdge: 1600, onProgress: (p) => opts.onProgress?.(p.page / p.pageCount) });
      const files: { name: string; blob: Blob }[] = [];
      for (const p of pages) files.push({ name: `${base}-${String(p.index + 1).padStart(3, '0')}.${target.to}`, blob: await canvasBlob(p.canvas, mimeOf[target.to], q) });
      return { files, filename: `${base}-pages.zip` };
    }
    case 'data': {
      const X = await import('@/lib/convert/formats/extra');
      let ext = extOf(file.name); if (ext === 'yml') ext = 'yaml';
      let v: Awaited<ReturnType<typeof X.parseStructured>>;
      try { v = await X.parseStructured(await file.text(), ext); }
      catch (e) { throw new Error(`Could not read this .${ext}: ${(e as Error).message}`); }
      if (target.to === 'json') return { text: JSON.stringify(v, null, 2), filename: `${base}.json` };
      if (target.to === 'yaml') return { blob: new Blob([await X.valueToYaml(v)], { type: 'text/yaml' }), filename: `${base}.yaml` };
      if (target.to === 'xml') return { blob: new Blob([X.valueToXml(v)], { type: 'application/xml' }), filename: `${base}.xml` };
      const rows = X.valueToRows(v);
      if (target.to === 'md') return { blob: new Blob([X.rowsToMd(rows)], { type: 'text/markdown' }), filename: `${base}.md` };
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      if (target.to === 'csv' || target.to === 'tsv') {
        return { blob: new Blob([XLSX.utils.sheet_to_csv(ws, target.to === 'tsv' ? { FS: '\t' } : undefined)], { type: mimeOf[target.to] }), filename: `${base}.${target.to}` };
      }
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data');
      return { blob: new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: mimeOf.xlsx }), filename: `${base}.xlsx` };
    }
    case 'archive-tar': {
      const { buildTar } = await import('@/lib/convert/formats/extra');
      const files = await extractAll(file, opts.onProgress);
      const tar = buildTar(files);
      if (target.to === 'tgz') {
        const { gzipSync } = await import('fflate');
        return { blob: new Blob([gzipSync(tar, { level: 6 }) as BlobPart], { type: 'application/gzip' }), filename: `${base}.tgz` };
      }
      return { blob: new Blob([tar as BlobPart], { type: 'application/x-tar' }), filename: `${base}.tar` };
    }
    case 'gz': {
      const { gzipSync } = await import('fflate');
      const data = gzipSync(new Uint8Array(await file.arrayBuffer()), { level: 6, filename: file.name, mtime: new Date(file.lastModified || Date.now()) });
      return { blob: new Blob([data as BlobPart], { type: 'application/gzip' }), filename: `${file.name}.gz` };
    }
    case 'font-img': {
      const family = `xonvert-preview-${Date.now()}`;
      const face = new FontFace(family, await file.arrayBuffer());
      try { await face.load(); } catch { throw new Error('This font could not be loaded by the browser.'); }
      document.fonts.add(face);
      try {
        const c = document.createElement('canvas'); c.width = 1400; c.height = 980;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#6b7280'; ctx.font = '20px system-ui, sans-serif'; ctx.textBaseline = 'top';
        ctx.fillText(file.name, 48, 36);
        ctx.fillStyle = '#111111';
        let y = 90;
        const lines: [number, string][] = [
          [30, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], [30, 'abcdefghijklmnopqrstuvwxyz'], [30, '0123456789 !?&@#%()[]{}.,;:'],
          [96, 'Aa Bb Cc'], [64, 'The quick brown fox'], [44, 'jumps over the lazy dog'],
          [28, 'The quick brown fox jumps over the lazy dog.'], [18, 'The quick brown fox jumps over the lazy dog. 0123456789'],
        ];
        for (const [px, t] of lines) { ctx.font = `${px}px "${family}"`; ctx.fillText(t, 48, y); y += Math.round(px * 1.35) + 14; }
        return { blob: await canvasBlob(c, 'image/png'), filename: `${base}.png` };
      } finally { document.fonts.delete(face); }
    }
    case 'model-img': {
      const { convertModelInWorker } = await import('@/engines/model3d/client');
      const conv = await convertModelInWorker([{ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }], 'glb');
      const glb = conv.files.find((f) => /\.glb$/i.test(f.name)) ?? conv.files[0];
      if (!glb) throw new Error('The model could not be read.');
      const bytes = glb.data as unknown as Uint8Array;
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const R = await import('@/lib/convert/formats/model-render');
      if (target.to === 'gif') return { blob: await R.renderModelGif(buf, { onProgress: opts.onProgress }), filename: `${base}.gif` };
      return { blob: await R.renderModelPng(buf), filename: `${base}.png` };
    }
    case 'mail-pdf': {
      const ext = extOf(file.name);
      const html = ext === 'msg' ? await (await import('@/engines/msg')).msgToHtml(file) : await (await import('@/engines/email')).emailToHtml(file, ext);
      const { htmlToPdf } = await import('@/engines/document');
      return { blob: await htmlToPdf(html, base), filename: `${base}.pdf` };
    }
    default:
      throw new Error(`No browser converter for ${target.handler}`);
  }
}
