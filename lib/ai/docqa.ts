/**
 * Xonvert AI — document understanding.
 *
 * Pulls text out of a PDF (pdf.js text layer) or an image/scan (OCR), so the AI
 * can answer questions about it, summarise it, or just hand back the text — all
 * on-device. Text selection for Q&A is deterministic (keyword windowing), so we
 * only ask the 0.5B model to read a small, relevant slice — the part it CAN do.
 */

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
export function isImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name);
}
export function isDocument(file: File): boolean {
  return isPdf(file) || isImage(file);
}

/** Extract plain text from a PDF (text layer) or image (OCR). */
export async function extractDocText(file: File): Promise<string> {
  if (isPdf(file)) {
    const { extractPdfText } = await import('@/engines/pdf/rasterize');
    const pages = await extractPdfText(await file.arrayBuffer());
    return pages.map((p) => p.text).join('\n\n').trim();
  }
  const ocr = await import('@/engines/ocr');
  const { text } = await ocr.recognize(file);
  return text.trim();
}

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'what', 'whats', 'how', 'much', 'many', 'does', 'do', 'this', 'that', 'it', 'on', 'for', 'and', 'or', 'my', 'me', 'i', 'please']);

/**
 * Pick the slice of `text` most relevant to `question` so we feed the model a
 * small, on-point context instead of the whole document. Scores each line by
 * overlap with the question's keywords and returns a window around the best run.
 */
export function selectContext(text: string, question: string, maxChars = 1600): string {
  if (text.length <= maxChars) return text;
  const terms = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
  if (!terms.length) return text.slice(0, maxChars);
  const lines = text.split('\n');
  const scores = lines.map((ln) => {
    const lc = ln.toLowerCase();
    return terms.reduce((s, t) => (lc.includes(t) ? s + 1 : s), 0);
  });
  // Find the highest-scoring line, then expand around it up to maxChars.
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  let lo = best, hi = best, size = lines[best].length;
  while (size < maxChars && (lo > 0 || hi < lines.length - 1)) {
    if (hi < lines.length - 1) { hi++; size += lines[hi].length + 1; }
    if (lo > 0) { lo--; size += lines[lo].length + 1; }
  }
  return lines.slice(lo, hi + 1).join('\n');
}

/** Classify what the user wants done with the document. */
export type DocIntent = 'extract' | 'summarize' | 'question' | null;
export function docIntent(text: string): DocIntent {
  const lc = text.toLowerCase().trim();
  if (/\b(extract (the )?text|read (this|it|the)|ocr|what does (it|this) say|get the text|transcribe)\b/.test(lc)) return 'extract';
  if (/\b(summari[sz]e|tl;?dr|key points|main points|gist)\b/.test(lc)) return 'summarize';
  if (/\?\s*$/.test(lc) || /^(what|when|who|where|which|why|how|is|are|does|do|list|find|tell me)\b/.test(lc)) return 'question';
  return null;
}
