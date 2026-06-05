/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Voice Studio engine — synthesize speech to a DOWNLOADABLE audio file, with
 * selectable voice characters, entirely on-device.
 *
 *   text ──MMS-TTS (transformers.js)→ PCM ──style DSP (OfflineAudioContext)→ WAV/MP3
 *
 * MMS-TTS (Meta, 1100+ languages) gives a clean neutral voice per language. We
 * derive distinct CHARACTERS from it with real-time DSP — pitch/tempo shift via
 * playbackRate resampling, plus ring-modulation for the robot — so one tiny
 * model yields male / female / cartoon / deep / robot voices with no extra
 * downloads. Nothing leaves the device.
 */

// BCP-47 → ISO-639-3 used by Xenova/mms-tts-<iso3>. (Same set as lib/ai/tts.ts.)
const MMS3: Record<string, string> = {
  en: 'eng', es: 'spa', fr: 'fra', de: 'deu', it: 'ita', pt: 'por', ru: 'rus',
  ar: 'ara', fa: 'pes', tr: 'tur', hi: 'hin', ur: 'urd', bn: 'ben', ta: 'tam',
  te: 'tel', th: 'tha', vi: 'vie', id: 'ind', ms: 'zlm', sw: 'swh',
  nl: 'nld', pl: 'pol', uk: 'ukr', el: 'ell', ro: 'ron', hu: 'hun', cs: 'ces',
  sv: 'swe', fi: 'fin', yo: 'yor', ha: 'hau', ko: 'kor',
};

export const TTS_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' }, { code: 'it', name: 'Italian' }, { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' }, { code: 'ar', name: 'Arabic' }, { code: 'fa', name: 'Persian' },
  { code: 'hi', name: 'Hindi' }, { code: 'tr', name: 'Turkish' }, { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' }, { code: 'uk', name: 'Ukrainian' }, { code: 'ko', name: 'Korean' },
  { code: 'sw', name: 'Swahili' }, { code: 'id', name: 'Indonesian' }, { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' }, { code: 'ro', name: 'Romanian' },
];

export interface VoiceStyle {
  id: string;
  name: string;
  /** Playback rate — <1 lower & slower (deeper), >1 higher & faster (brighter). */
  rate: number;
  /** Ring-modulation carrier frequency in Hz (robotic timbre) when set. */
  ring?: number;
}

export const VOICE_STYLES: VoiceStyle[] = [
  { id: 'narrator', name: 'Narrator', rate: 1.0 },
  { id: 'female', name: 'Female', rate: 1.14 },
  { id: 'male', name: 'Male', rate: 0.86 },
  { id: 'cartoon', name: 'Cartoon', rate: 1.5 },
  { id: 'deep', name: 'Deep / Giant', rate: 0.72 },
  { id: 'robot', name: 'Robot', rate: 1.0, ring: 70 },
];

export function isLanguageSupported(lang: string): boolean {
  return lang in MMS3;
}

const pipes = new Map<string, Promise<any | null>>();
async function mmsPipe(iso3: string, onProgress?: (r: number) => void): Promise<any | null> {
  if (!pipes.has(iso3)) {
    const p = (async () => {
      try {
        const lib: any = await import('@xenova/transformers');
        lib.env.allowLocalModels = false;
        lib.env.allowRemoteModels = true;
        return await lib.pipeline('text-to-speech', `Xenova/mms-tts-${iso3}`, {
          quantized: true,
          progress_callback: (d: any) => {
            if (!onProgress) return;
            const r = d.progress != null ? d.progress / 100 : (d.loaded && d.total ? d.loaded / d.total : 0);
            onProgress(Math.max(0, Math.min(1, r)));
          },
        });
      } catch { return null; }
    })();
    pipes.set(iso3, p);
    // If the load failed (resolved to null OR threw past the catch above),
    // clear the cache so the user can retry without reloading the page.
    // Previously a single transient network blip during model download
    // permanently disabled that voice for the rest of the session.
    p.then((v) => { if (v == null) pipes.delete(iso3); })
     .catch(() => { pipes.delete(iso3); });
  }
  return pipes.get(iso3)!;
}

export interface SynthResult { pcm: Float32Array; sampleRate: number }

/** Synthesize text → raw neural PCM for the given language. */
export async function synthesize(text: string, lang: string, onProgress?: (phase: string, r: number) => void): Promise<SynthResult> {
  const iso3 = MMS3[lang];
  if (!iso3) throw new Error('This language has no downloadable voice yet.');
  onProgress?.('Loading voice', 0.05);
  const pipe = await mmsPipe(iso3, (r) => onProgress?.('Loading voice', r * 0.7));
  if (!pipe) throw new Error('Voice model could not load on this device.');
  onProgress?.('Speaking', 0.8);
  const out: any = await pipe(text);
  if (!out?.audio?.length) throw new Error('Synthesis produced no audio.');
  return { pcm: out.audio as Float32Array, sampleRate: out.sampling_rate || 16000 };
}

/** Apply a voice character to raw PCM and render to an AudioBuffer (offline). */
export async function applyStyle(pcm: Float32Array, sampleRate: number, style: VoiceStyle): Promise<AudioBuffer> {
  const rate = style.rate || 1;
  const outLen = Math.max(1, Math.ceil(pcm.length / rate));
  const oac = new OfflineAudioContext(1, outLen, sampleRate);
  const buf = oac.createBuffer(1, pcm.length, sampleRate);
  buf.getChannelData(0).set(pcm);
  const src = oac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  if (style.ring) {
    // Ring modulation: multiply the signal by a sine carrier (gain modulated by osc).
    const osc = oac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = style.ring;
    const mod = oac.createGain();
    mod.gain.value = 0;
    osc.connect(mod.gain);
    src.connect(mod);
    mod.connect(oac.destination);
    osc.start();
  } else {
    src.connect(oac.destination);
  }
  src.start();
  return oac.startRendering();
}

/** Full pipeline: synthesize + style → an AudioBuffer ready to encode. */
export async function speakToBuffer(text: string, lang: string, style: VoiceStyle, onProgress?: (phase: string, r: number) => void): Promise<AudioBuffer> {
  const { pcm, sampleRate } = await synthesize(text, lang, onProgress);
  onProgress?.('Styling', 0.92);
  return applyStyle(pcm, sampleRate, style);
}
