/**
 * Xonvert AI — multi-file combine operations.
 *
 * The planner can route "merge these PDFs" to pdf-merge, but the executor threads
 * a single file, so combine tools (which take *many* files → one) had no way to
 * run. This module fills that gap: given several staged files, it merges PDFs,
 * joins audio, or builds a PDF from images — producing one result inline.
 *
 * `combineFor` runners touch browser engines (audio decode, image decode) except
 * pdf-merge, which is pure pdf-lib and therefore Node-verifiable. `combineToolFor`
 * + `isCombineIntent` are pure and testable.
 */

import type { ActionResult } from '@/lib/ai-actions';

export type CombineRunner = (files: File[]) => Promise<ActionResult>;

function ext(f: File): string { return (f.name.split('.').pop() ?? '').toLowerCase(); }
function pdfBytes(bytes: Uint8Array, filename: string, note: string): ActionResult {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { kind: 'file', blob: new Blob([buf], { type: 'application/pdf' }), filename, note };
}

const RUNNERS: Record<string, CombineRunner> = {
  'pdf-merge': async (files) => {
    const pdf = await import('@/engines/pdf');
    const bufs = await Promise.all(files.map((f) => f.arrayBuffer()));
    const out = await pdf.mergePdfs(bufs);
    return pdfBytes(out, `merged-${files.length}.pdf`, `${files.length} PDFs combined`);
  },
  'audio-merge': async (files) => {
    const audio = await import('@/engines/audio');
    const bufs: AudioBuffer[] = [];
    for (const f of files) bufs.push(await audio.decode(await f.arrayBuffer()));
    const out = audio.concat(bufs);
    return { kind: 'file', blob: audio.encodeWav(out), filename: `merged-${files.length}.wav`, note: `${out.duration.toFixed(1)}s` };
  },
  'images-to-pdf': async (files) => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    for (const f of files) {
      let bytes = new Uint8Array(await f.arrayBuffer());
      const isPng = /png/i.test(f.type) || ext(f) === 'png';
      const isJpg = /jpe?g/i.test(f.type) || /^jpe?g$/.test(ext(f));
      let img;
      if (isPng) img = await doc.embedPng(bytes);
      else if (isJpg) img = await doc.embedJpg(bytes);
      else {
        // Other formats (webp/avif/…) → re-encode to PNG via the image engine.
        const ie = await import('@/engines/image');
        const { data } = await ie.decode(f);
        const { blob } = await ie.encode(data, 'png', {});
        bytes = new Uint8Array(await blob.arrayBuffer());
        img = await doc.embedPng(bytes);
      }
      const page = doc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    const out = await doc.save();
    return pdfBytes(out, `images-${files.length}.pdf`, `${files.length} images → PDF`);
  },
};

export function combineFor(toolId: string): CombineRunner | undefined {
  return RUNNERS[toolId];
}

/** Does the request ask to combine several files into one? */
export function isCombineIntent(text: string): boolean {
  return /\b(merge|combine|join|stitch|concatenate|into (one|a single)|as (one|a single)|together)\b/i.test(text);
}

/** Pick the combine tool that fits the staged files (and the request). */
export function combineToolFor(files: File[], text: string): string | null {
  if (files.length < 2) return null;
  const isPdf = files.every((f) => /pdf/i.test(f.type) || ext(f) === 'pdf');
  const isAudio = files.every((f) => f.type.startsWith('audio/') || /^(mp3|wav|ogg|flac|m4a|aac|opus)$/.test(ext(f)));
  const isImage = files.every((f) => f.type.startsWith('image/') || /^(png|jpe?g|webp|gif|bmp|avif|tiff?)$/.test(ext(f)));
  if (isPdf) return 'pdf-merge';
  if (isAudio) return 'audio-merge';
  if (isImage) return 'images-to-pdf';
  return null;
}
