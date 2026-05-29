/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * stt — hear the user, in ANY language, ON-DEVICE, private. The voice INPUT half of
 * "if the user wants to talk" (tts.ts is the output half).
 *
 * Deliberately NOT the browser's Web Speech Recognition API — in Chrome it streams
 * your audio to Google's servers (3rd party, not private). Instead we run Whisper via
 * transformers.js fully on the device: mic → record → decode/resample to 16kHz mono →
 * Whisper (ONNX/WASM) → text. Whisper is multilingual (99 languages); we tag the
 * detected language with the shared detector so the reply can come back in it.
 *
 * Model sized to the device (speed principle): whisper-tiny (~40MB) by default, base
 * for strong devices. Streamed from HF + IndexedDB-cached. Browser-only; everything
 * degrades to null (no mic / no model / SSR) so the caller just keeps typing.
 */
import { detectLanguage } from './translate';

let _asr: Promise<any | null> | null = null;
async function whisper(model = 'Xenova/whisper-tiny'): Promise<any | null> {
  if (_asr) return _asr;
  const p = (async () => {
    try {
      const lib: any = await import('@xenova/transformers');
      lib.env.allowLocalModels = false;
      lib.env.allowRemoteModels = true;
      return await lib.pipeline('automatic-speech-recognition', model, { quantized: true });
    } catch { return null; }
  })();
  _asr = p;
  // Drop the cache on null/reject — same rationale as the other model loaders.
  p.then((v) => { if (v == null && _asr === p) _asr = null; })
   .catch(() => { if (_asr === p) _asr = null; });
  return p;
}

/** Whether voice input is possible on this device. */
export function canListen(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && 'AudioContext' in window;
}

/** Decode a recorded blob to the mono 16kHz Float32Array Whisper expects. */
async function toMono16k(blob: Blob): Promise<Float32Array | null> {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    // Decode-only context — must be closed or we burn one of the browser's
    // ~6 concurrent AudioContext slots on every voice-input action.
    const tempCtx = new AC();
    let decoded: AudioBuffer;
    try {
      decoded = await tempCtx.decodeAudioData(await blob.arrayBuffer());
    } finally {
      try { await tempCtx.close(); } catch { /* */ }
    }
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  } catch { return null; }
}

/** Transcribe a 16kHz mono Float32Array → {text, lang}. lang via the shared detector. */
export async function transcribe(audio: Float32Array): Promise<{ text: string; lang: string | null } | null> {
  const asr = await whisper();
  if (!asr || !audio?.length) return null;
  try {
    const out: any = await asr(audio, { chunk_length_s: 30, return_timestamps: false });
    const text = (Array.isArray(out) ? out[0]?.text : out?.text) || '';
    const t = text.trim();
    if (!t) return null;
    return { text: t, lang: await detectLanguage(t).catch(() => null) };
  } catch { return null; }
}

export interface Listening {
  /** Stop recording and resolve the transcript ({text, lang}) — or null. */
  stop: () => Promise<{ text: string; lang: string | null } | null>;
  /** Abort without transcribing. */
  cancel: () => void;
}

/**
 * Start listening on the mic. Returns a handle: call stop() (push-to-talk release,
 * or on silence) to get the transcript, or cancel() to abort. Asks mic permission.
 */
export async function listen(): Promise<Listening | null> {
  if (!canListen()) return null;
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return null; } // permission denied / no mic
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    cancel: () => { try { rec.stop(); } catch { /* noop */ } release(); },
    stop: () => new Promise((resolve) => {
      rec.onstop = async () => {
        release();
        const audio = await toMono16k(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        resolve(audio ? await transcribe(audio) : null);
      };
      try { rec.stop(); } catch { release(); resolve(null); }
    }),
  };
}
