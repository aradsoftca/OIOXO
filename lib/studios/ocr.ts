export interface OcrWord {
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  lines: string[];
  language: string;
}

// Cache the loaded Tesseract worker per language. The previous code keyed off
// a single `workerPromise` regardless of `lang` — so the second call with a
// different language got the wrong worker.
const workerByLang = new Map<string, Promise<any>>();

async function loadTesseract(lang: string, onProgress?: (status: string, ratio: number) => void): Promise<any> {
  const cached = workerByLang.get(lang);
  if (cached) return cached;
  const p = (async () => {
    const url = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
    const mod: any = await (new Function('u', 'return import(u)'))(url);
    const worker = await mod.createWorker(lang, 1, {
      logger: (m: any) => onProgress?.(m.status, m.progress ?? 0),
    });
    return worker;
  })();
  workerByLang.set(lang, p);
  // Drop the cache on rejection so a transient CDN/network failure doesn't
  // permanently disable studio OCR for this language.
  p.catch(() => { workerByLang.delete(lang); });
  return p;
}

export async function ocrCanvas(canvas: HTMLCanvasElement, lang = 'eng', onProgress?: (status: string, ratio: number) => void): Promise<OcrResult> {
  const worker = await loadTesseract(lang, onProgress);
  const result = await worker.recognize(canvas);
  const data = result.data;
  const words: OcrWord[] = (data.words ?? []).map((w: any) => ({
    text: w.text,
    bbox: { x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 },
    confidence: w.confidence ?? 0,
  }));
  return {
    text: data.text ?? '',
    words,
    lines: (data.lines ?? []).map((l: any) => l.text).filter(Boolean),
    language: lang,
  };
}

export async function ocrCanvasToSearchablePdfOverlay(canvas: HTMLCanvasElement, lang = 'eng', onProgress?: (status: string, ratio: number) => void): Promise<{ text: string; words: OcrWord[] }> {
  const r = await ocrCanvas(canvas, lang, onProgress);
  return { text: r.text, words: r.words };
}

export const OCR_LANGUAGES: { code: string; name: string }[] = [
  { code: 'eng', name: 'English' },
  { code: 'spa', name: 'Spanish' },
  { code: 'fra', name: 'French' },
  { code: 'deu', name: 'German' },
  { code: 'ita', name: 'Italian' },
  { code: 'por', name: 'Portuguese' },
  { code: 'nld', name: 'Dutch' },
  { code: 'rus', name: 'Russian' },
  { code: 'ara', name: 'Arabic' },
  { code: 'fas', name: 'Persian' },
  { code: 'heb', name: 'Hebrew' },
  { code: 'hin', name: 'Hindi' },
  { code: 'jpn', name: 'Japanese' },
  { code: 'kor', name: 'Korean' },
  { code: 'chi_sim', name: 'Chinese (Simplified)' },
  { code: 'chi_tra', name: 'Chinese (Traditional)' },
  { code: 'tur', name: 'Turkish' },
  { code: 'pol', name: 'Polish' },
  { code: 'tha', name: 'Thai' },
  { code: 'vie', name: 'Vietnamese' },
];
