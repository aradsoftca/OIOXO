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

export type ConvCategory = 'image' | 'audio' | 'video' | 'pdf' | 'subtitle' | 'font' | 'data' | 'model3d' | 'document' | 'ebook' | 'cad' | 'presentation';

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
  | 'ocr'          // image → text
  | 'transcribe'   // audio → text
  | 'subtitle'     // srt/vtt/ass interconvert
  | 'font'         // ttf/otf/woff/woff2
  | 'model3d'      // obj/stl/fbx/… → glb/gltf
  | 'docx'         // word → pdf/html/txt
  | 'sheet'        // xlsx/ods/csv → csv/xlsx/html/json
  | 'ebook'        // epub → pdf/html/txt
  | 'cad'          // step/iges/brep → stl/obj
  | 'office';      // doc/odt/pptx/ppt/odp → pdf/html/txt (light extraction)

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
const IMAGE_IN = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp'];
const IMAGE_OUT = ['png', 'jpg', 'webp', 'avif'];   // via jsquash codec worker
const AUDIO_IN = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus', 'webm'];
const AUDIO_OUT = ['mp3', 'wav'];                    // Web Audio + lamejs
const VIDEO_IN = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'm4v', 'wmv', '3gp', 'mpg', 'mpeg', 'ts'];
const VIDEO_OUT = ['mp4', 'webm'];                   // ffmpeg.wasm libx264 / vp9
const SUBTITLE = ['srt', 'vtt'];
const FONT = ['ttf', 'otf', 'woff', 'woff2'];
const MODEL3D = ['obj', 'stl', 'fbx', 'dae', 'ply', '3ds', 'gltf', 'glb', '3mf'];
const MODEL3D_OUT = ['glb', 'gltf'];
const SHEET = ['xlsx', 'xls', 'ods', 'csv', 'tsv'];
const SHEET_OUT = ['csv', 'xlsx', 'html', 'json'];
const CAD = ['step', 'stp', 'iges', 'igs', 'brep'];
const CAD_OUT = ['stl', 'obj'];

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
FORMAT_CATEGORY['pdf'] = 'pdf';
FORMAT_CATEGORY['epub'] = 'ebook';
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
  const out: Target[] = [];
  if (cat === 'image') {
    for (const to of IMAGE_OUT) if (to !== ext) out.push({ to, handler: 'image', toolId: 'image-convert-format' });
    out.push({ to: 'pdf', handler: 'img-pdf', toolId: 'images-to-pdf' });
    out.push({ to: 'mp4', handler: 'img-video', toolId: 'images-to-video' });
    out.push({ to: 'txt', handler: 'ocr', toolId: 'image-ocr', note: 'Reads text inside the image' });
  } else if (cat === 'audio') {
    for (const to of AUDIO_OUT) if (to !== ext) out.push({ to, handler: 'audio', toolId: 'audio-convert-format' });
    out.push({ to: 'txt', handler: 'transcribe', toolId: 'audio-to-text', note: 'Transcribes speech' });
  } else if (cat === 'video') {
    for (const to of VIDEO_OUT) if (to !== ext) out.push({ to, handler: 'video', toolId: 'video-convert-format' });
    out.push({ to: 'gif', handler: 'video-gif', toolId: 'video-to-gif' });
    out.push({ to: 'mp3', handler: 'video-audio', toolId: 'video-extract-audio', note: 'Extracts the audio track' });
  } else if (cat === 'pdf') {
    out.push({ to: 'jpg', handler: 'pdf-img', toolId: 'pdf-to-images' });
    out.push({ to: 'png', handler: 'pdf-img', toolId: 'pdf-to-images' });
    out.push({ to: 'txt', handler: 'pdf-txt', toolId: 'pdf-to-text' });
  } else if (cat === 'subtitle') {
    for (const to of SUBTITLE) if (to !== ext) out.push({ to, handler: 'subtitle', toolId: 'subtitle-cleaner' });
  } else if (cat === 'font') {
    for (const to of FONT) if (to !== ext) out.push({ to, handler: 'font', toolId: 'font-convert' });
  } else if (cat === 'model3d') {
    for (const to of MODEL3D_OUT) if (to !== ext) out.push({ to, handler: 'model3d', toolId: 'model-3d-convert' });
  } else if (cat === 'data') {
    for (const to of SHEET_OUT) if (to !== ext) out.push({ to, handler: 'sheet', toolId: 'sheet-convert' });
  } else if (cat === 'document') {
    const h: HandlerId = ext === 'docx' ? 'docx' : 'office';
    out.push({ to: 'pdf', handler: h, toolId: 'doc-convert' });
    out.push({ to: 'html', handler: h, toolId: 'doc-convert' });
    out.push({ to: 'txt', handler: h, toolId: 'doc-convert' });
  } else if (cat === 'presentation') {
    out.push({ to: 'pdf', handler: 'office', toolId: 'slides-convert' });
    out.push({ to: 'html', handler: 'office', toolId: 'slides-convert' });
    out.push({ to: 'txt', handler: 'office', toolId: 'slides-convert' });
  } else if (cat === 'ebook') {
    out.push({ to: 'pdf', handler: 'ebook', toolId: 'ebook-convert' });
    out.push({ to: 'html', handler: 'ebook', toolId: 'ebook-convert' });
    out.push({ to: 'txt', handler: 'ebook', toolId: 'ebook-convert' });
  } else if (cat === 'cad') {
    for (const to of CAD_OUT) out.push({ to, handler: 'cad', toolId: 'cad-convert' });
  }
  return out;
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
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
  gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain',
};

export async function convertFile(file: File, target: Target, opts: ConvertOpts = {}): Promise<ConvertOutput> {
  // Mirror conversion progress onto the global progress bar (the corner pill).
  startJob('Converting');
  updateJob('Converting', 0.05);
  try {
    return await runConvert(file, target, {
      ...opts,
      onProgress: (r) => { updateJob('Converting', r); opts.onProgress?.(r); },
    });
  } finally {
    endJob();
  }
}

async function runConvert(file: File, target: Target, opts: ConvertOpts = {}): Promise<ConvertOutput> {
  const base = file.name.replace(/\.[^.]+$/, '');
  const q = opts.imageQuality ?? 0.92;

  switch (target.handler) {
    case 'image': {
      // Decode → encode via the jsquash codec (runs in the codec worker): wider
      // format support (incl. AVIF) and off the main thread vs canvas.toBlob.
      const bm = await createImageBitmap(file);
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
      const eng = await import('@/engines/audio');
      const buf = await eng.decode(await file.arrayBuffer());
      const blob = target.to === 'mp3' ? await eng.encodeMp3(buf) : eng.encodeWav(buf);
      return { blob, filename: `${base}.${target.to}` };
    }
    case 'video': {
      const { runFfmpeg } = await import('@/engines/ffmpeg');
      const inExt = extOf(file.name) || 'mp4';
      const args = target.to === 'webm'
        ? ['-i', '__in__', '-c:v', 'libvpx-vp9', '-b:v', '1M', '-c:a', 'libopus', '__out__']
        : ['-i', '__in__', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', '__out__'];
      const blob = await runFfmpeg({
        input: file, inputName: `in.${inExt}`, outputName: `out.${target.to}`,
        args: (i, o) => args.map((a) => a === '__in__' ? i : a === '__out__' ? o : a),
        mimeType: mimeOf[target.to], onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.${target.to}` };
    }
    case 'video-audio': {
      const { runFfmpeg } = await import('@/engines/ffmpeg');
      const inExt = extOf(file.name) || 'mp4';
      const blob = await runFfmpeg({
        input: file, inputName: `in.${inExt}`, outputName: 'out.mp3',
        args: (i, o) => ['-i', i, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', o],
        mimeType: 'audio/mpeg', onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.mp3` };
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
        const bm = await createImageBitmap(file);
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
      const { runFfmpegMulti } = await import('@/engines/ffmpeg');
      const bm = await createImageBitmap(file);
      const W = bm.width % 2 ? bm.width - 1 : bm.width;
      const H = bm.height % 2 ? bm.height - 1 : bm.height;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d')!.drawImage(bm, 0, 0, W, H); bm.close();
      const png: Blob = await new Promise((r, j) => c.toBlob((b) => b ? r(b) : j(new Error('e')), 'image/png'));
      const blob = await runFfmpegMulti({
        inputs: [{ name: 'frame000.png', data: png }], outputName: 'out.mp4',
        args: (_n, o) => ['-loop', '1', '-i', 'frame000.png', '-t', '5', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', o],
        mimeType: 'video/mp4', onProgress: opts.onProgress,
      });
      return { blob, filename: `${base}.mp4` };
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
    case 'ocr': {
      const { recognize } = await import('@/engines/ocr');
      const res = await recognize(file, { onProgress: (p) => opts.onProgress?.(p.ratio) });
      return { text: res.text, filename: `${base}.txt` };
    }
    case 'transcribe': {
      const { transcribe } = await import('@/engines/transcribe');
      const res = await transcribe(file, { onProgress: (p) => opts.onProgress?.(p.ratio) });
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
      const { convertSheet } = await import('@/engines/document');
      const { blob, ext } = await convertSheet(file, target.to as 'csv' | 'xlsx' | 'html' | 'json');
      return { blob, filename: `${base}.${ext}` };
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
    default:
      throw new Error(`No browser converter for ${target.handler}`);
  }
}
