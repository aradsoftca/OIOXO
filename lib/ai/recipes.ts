/**
 * Xonvert AI — multi-step recipes.
 *
 * Compound jobs ("master this audio", "turn it into a pencil sketch") expressed
 * as a fixed, ordered chain of engine ops. We deliberately do NOT ask the 0.5B
 * model to plan steps — recipes are deterministic, so multi-step is as reliable
 * as single-step. The whole chain runs on the decoded buffer in memory and
 * encodes once at the end (fast, no quality loss between steps).
 *
 * Triggers are high-precision (distinctive multi-word phrases) so a recipe never
 * steals a plain single-tool request. Non-English requests reach these via the
 * translate-and-retry path in AiApp.
 */

import type { ActionResult } from '@/lib/ai-actions';

export interface Recipe {
  id: string;
  input: 'image' | 'audio';
  /** Present-tense phrase for the running indicator + ask-file prompt. */
  verb: string;
  match: (lc: string) => boolean;
  run: (file: File) => Promise<ActionResult>;
}

function base(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot > 0 ? file.name.slice(0, dot) : file.name;
}

type AudioMod = typeof import('@/engines/audio');
async function audioChain(file: File, suffix: string, note: string, fold: (a: AudioMod, ab: AudioBuffer) => AudioBuffer): Promise<ActionResult> {
  const audio = await import('@/engines/audio');
  const ab = await audio.decode(await file.arrayBuffer());
  const out = fold(audio, ab);
  return { kind: 'file', blob: audio.encodeWav(out), filename: `${base(file)}-${suffix}.wav`, note };
}

type ImgMod = typeof import('@/engines/image');
async function imageChain(file: File, suffix: string, note: string, fold: (f: ImgMod['filters'], t: ImgMod['transforms'], d: ImageData) => ImageData): Promise<ActionResult> {
  const img = await import('@/engines/image');
  const { data } = await img.decode(file);
  const out = fold(img.filters, img.transforms, data);
  const { blob } = await img.encode(out, 'png', {});
  return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-${suffix}.png`, note, blob };
}

const RECIPES: Recipe[] = [
  {
    id: 'audio-master', input: 'audio', verb: 'master your audio (normalise + clean fades)',
    match: (lc) => /\b(master|mastering|polish|clean ?up|enhance|sweeten)\b/.test(lc) && /\b(audio|sound|track|song|music|mix|recording)\b/.test(lc),
    run: (f) => audioChain(f, 'mastered', 'normalised · fade-in · fade-out', (a, ab) => a.fadeOut(a.fadeIn(a.normalize(ab), 0.03), 0.25)),
  },
  {
    id: 'audio-voice', input: 'audio', verb: 'prep your voice recording (mono + normalise)',
    match: (lc) => /\b(podcast|voice ?over|voiceover|narration|spoken|interview)\b/.test(lc),
    run: (f) => audioChain(f, 'voice', 'mono · normalised', (a, ab) => a.normalize(a.toMono(ab))),
  },
  {
    id: 'audio-instrumental', input: 'audio', verb: 'make an instrumental (remove vocals + normalise)',
    match: (lc) => /\b(instrumental|karaoke|backing track|minus one|no vocals)\b/.test(lc),
    run: (f) => audioChain(f, 'instrumental', 'vocals removed · normalised', (a, ab) => a.normalize(a.removeVocals(ab, 1))),
  },
  {
    id: 'image-sketch', input: 'image', verb: 'turn it into a pencil sketch',
    match: (lc) => /\b(pencil|sketch|line ?art|drawing)\b/.test(lc),
    run: (f) => imageChain(f, 'sketch', 'grayscale · edges · inverted', (fl, _t, d) => fl.invert(fl.edge(fl.grayscale(d)))),
  },
  {
    id: 'image-bw', input: 'image', verb: 'make a sharp black & white',
    match: (lc) => /\b(noir|black ?and ?white|black ?& ?white|b ?& ?w|monochrome)\b/.test(lc),
    run: (f) => imageChain(f, 'bw', 'grayscale · sharpened', (fl, _t, d) => fl.sharpen(fl.grayscale(d))),
  },
];

/** First recipe whose trigger matches (and whose medium fits the file, if known). */
export function matchRecipe(text: string, fileCat: 'image' | 'audio' | null): Recipe | null {
  const lc = text.toLowerCase();
  for (const r of RECIPES) {
    if (fileCat && fileCat !== r.input) continue;
    if (r.match(lc)) return r;
  }
  return null;
}
