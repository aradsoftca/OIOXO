/**
 * OCR engine — text recognition from images and PDF pages. Runs entirely in
 * the browser via a downloadable text-recognition model. The first run for a
 * given language downloads + caches that language's data; subsequent runs are
 * fast (data persists in the browser cache).
 */

export interface OcrProgress {
  phase: string;
  ratio: number; // 0..1
}

export interface OcrWord {
  text: string;
  confidence: number; // 0..100
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  text: string;
  confidence: number; // mean 0..100
  words: OcrWord[];
  lines: OcrLine[];
}

export interface OcrOptions {
  /** Language code(s) — single ISO 639 code (e.g. "eng") or array (e.g. ["eng","fra"]). */
  language?: string | string[];
  onProgress?: (p: OcrProgress) => void;
}

export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'rus', label: 'Russian' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'chi_tra', label: 'Chinese (Traditional)' },
  { code: 'kor', label: 'Korean' },
  { code: 'ara', label: 'Arabic' },
  { code: 'fas', label: 'Persian' },
  { code: 'hin', label: 'Hindi' },
  { code: 'tur', label: 'Turkish' },
  { code: 'pol', label: 'Polish' },
  { code: 'ukr', label: 'Ukrainian' },
  { code: 'vie', label: 'Vietnamese' },
  { code: 'tha', label: 'Thai' },
];

type TesseractWorker = Awaited<ReturnType<typeof createTesseractWorker>>;
let cachedWorker: { worker: TesseractWorker; lang: string } | null = null;

async function createTesseractWorker(lang: string | string[], onProgress?: (p: OcrProgress) => void) {
  const { createWorker } = await import('tesseract.js');
  return createWorker(lang, 1, {
    logger: (m: { status: string; progress: number }) => {
      if (!onProgress) return;
      const phase =
        m.status === 'loading tesseract core' ? 'Loading text recognition'
          : m.status === 'initializing tesseract' ? 'Loading text recognition'
          : m.status === 'loading language traineddata' ? 'Loading language'
          : m.status === 'initializing api' ? 'Preparing'
          : m.status === 'recognizing text' ? 'Reading text'
          : m.status;
      onProgress({ phase, ratio: Math.max(0, Math.min(1, m.progress || 0)) });
    },
  });
}

async function getWorker(language: string | string[], onProgress?: (p: OcrProgress) => void): Promise<TesseractWorker> {
  const langKey = Array.isArray(language) ? language.join('+') : language;
  if (cachedWorker && cachedWorker.lang === langKey) return cachedWorker.worker;
  if (cachedWorker) {
    try { await cachedWorker.worker.terminate(); } catch { /* noop */ }
    cachedWorker = null;
  }
  const worker = await createTesseractWorker(language, onProgress);
  cachedWorker = { worker, lang: langKey };
  return worker;
}

export async function recognize(
  input: Blob | HTMLCanvasElement | ImageData | string,
  opts: OcrOptions = {},
): Promise<OcrResult> {
  const language = opts.language ?? 'eng';
  const worker = await getWorker(language, opts.onProgress);
  const { data } = await worker.recognize(input as Parameters<typeof worker.recognize>[0]);

  const words: OcrWord[] = (data.words ?? []).map((w) => ({
    text: w.text,
    confidence: w.confidence,
    bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
  }));
  const lines: OcrLine[] = (data.lines ?? []).map((l) => ({
    text: l.text,
    confidence: l.confidence,
    bbox: { x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 },
  }));
  return {
    text: data.text ?? '',
    confidence: data.confidence ?? 0,
    words,
    lines,
  };
}

export async function shutdownOcr(): Promise<void> {
  if (cachedWorker) {
    try { await cachedWorker.worker.terminate(); } catch { /* noop */ }
    cachedWorker = null;
  }
}
