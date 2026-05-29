/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * tts — speak the assistant's reply, in ANY language, on-device, no 3rd party.
 *
 * Same tiered shape as translate.ts: a free universal fast path + an on-device
 * neural fallback for coverage/quality. Pairs with the multilingual shell so the
 * voice matches the user's language.
 *
 *   1. Web Speech API (speechSynthesis) — built into EVERY browser, instant, free,
 *      zero download, uses the OS voices. Great for languages the OS ships a voice
 *      for. Nothing leaves the device.
 *   2. MMS-TTS via transformers.js — Meta's Massively Multilingual Speech, 1100+
 *      languages, on-device (ONNX/WASM). Per-language model (~30-60MB) streamed from
 *      the HF CDN and IndexedDB-cached — for languages/quality the OS voice lacks.
 *
 * Degrades gracefully: no engine / unsupported language → returns false and the
 * caller just shows the text. Browser-only (no-ops in Node/SSR).
 */

// BCP-47 (2-letter) → ISO-639-3 used by MMS-TTS model ids (Xenova/mms-tts-<iso3>).
const MMS3: Record<string, string> = {
  en: 'eng', es: 'spa', fr: 'fra', de: 'deu', it: 'ita', pt: 'por', ru: 'rus',
  ar: 'ara', fa: 'pes', tr: 'tur', hi: 'hin', ur: 'urd', bn: 'ben', ta: 'tam',
  te: 'tel', th: 'tha', vi: 'vie', id: 'ind', ms: 'zlm', sw: 'swh', ja: 'jpn',
  ko: 'kor', zh: 'cmn', nl: 'nld', pl: 'pol', uk: 'ukr', el: 'ell', he: 'heb',
  ro: 'ron', hu: 'hun', cs: 'ces', sv: 'swe', fi: 'fin', yo: 'yor', ha: 'hau',
};

let _stopBrowser: (() => void) | null = null;
let _audioCtx: any = null;
let _source: any = null;

/** Stop any in-progress speech (browser voice or neural playback). */
export function stopSpeaking(): void {
  try { _stopBrowser?.(); } catch { /* noop */ }
  try { _source?.stop(); } catch { /* noop */ }
  _stopBrowser = null; _source = null;
}

/** Whether speech is possible at all on this device (either tier). */
export function canSpeak(): boolean {
  return typeof window !== 'undefined' && ('speechSynthesis' in window || 'AudioContext' in window || 'webkitAudioContext' in window);
}

// --- Tier 1: Web Speech API (OS voices) ------------------------------------

function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    const t = setTimeout(() => resolve(speechSynthesis.getVoices()), 600);
    speechSynthesis.onvoiceschanged = () => { clearTimeout(t); resolve(speechSynthesis.getVoices()); };
  });
}

async function browserSpeak(text: string, lang: string): Promise<boolean> {
  if (typeof speechSynthesis === 'undefined') return false;
  const voices = await voicesReady();
  // A voice that matches the language (e.g. 'es' → es-ES / es-MX). If none, the OS
  // has no voice for this language → let the neural tier handle it.
  const match = voices.find((v) => v.lang?.toLowerCase().startsWith(lang.toLowerCase()));
  if (!match && lang !== 'en') return false;
  return new Promise<boolean>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    if (match) { u.voice = match; u.lang = match.lang; } else u.lang = lang;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    _stopBrowser = () => speechSynthesis.cancel();
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

// --- Tier 2: MMS-TTS (transformers.js, 1100+ languages, on-device) ---------

const ttsPipes = new Map<string, Promise<any | null>>();
async function mmsPipe(iso3: string): Promise<any | null> {
  if (!ttsPipes.has(iso3)) {
    const p = (async () => {
      try {
        const lib: any = await import('@xenova/transformers');
        lib.env.allowLocalModels = false;
        lib.env.allowRemoteModels = true;
        return await lib.pipeline('text-to-speech', `Xenova/mms-tts-${iso3}`, { quantized: true });
      } catch { return null; }
    })();
    ttsPipes.set(iso3, p);
    // Drop the cache on null/reject so a transient model-download failure
    // doesn't permanently disable TTS for this language until reload.
    p.then((v) => { if (v == null) ttsPipes.delete(iso3); })
     .catch(() => { ttsPipes.delete(iso3); });
  }
  return ttsPipes.get(iso3)!;
}

async function neuralSpeak(text: string, lang: string): Promise<boolean> {
  const iso3 = MMS3[lang];
  if (!iso3) return false;
  const pipe = await mmsPipe(iso3);
  if (!pipe) return false;
  try {
    const out: any = await pipe(text);
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC || !out?.audio?.length) return false;
    _audioCtx ??= new AC();
    const buf = _audioCtx.createBuffer(1, out.audio.length, out.sampling_rate || 16000);
    buf.getChannelData(0).set(out.audio);
    const src = _audioCtx.createBufferSource();
    src.buffer = buf; src.connect(_audioCtx.destination);
    _source = src;
    return await new Promise<boolean>((resolve) => { src.onended = () => resolve(true); src.start(); });
  } catch { return false; }
}

// --- public API ------------------------------------------------------------

/**
 * Speak `text` in `lang` (BCP-47, default 'en'). Tries the free OS voice first,
 * then on-device MMS-TTS for languages the OS can't voice. Returns true if spoken.
 * MMS gets a length cap so a long reply doesn't block; callers can chunk longer text.
 */
export async function speak(text: string, lang = 'en'): Promise<boolean> {
  const t = (text || '').replace(/```[\s\S]*?```/g, ' (code) ').replace(/\s+/g, ' ').trim();
  if (!t || typeof window === 'undefined') return false;
  stopSpeaking();
  if (await browserSpeak(t, lang)) return true;
  return neuralSpeak(t.slice(0, 600), lang);
}
