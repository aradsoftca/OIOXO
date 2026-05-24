/**
 * oioxo — skill catalog. Each downloadable specialist model the platform brain
 * can acquire, with the hardware tier it needs and which runtime serves it.
 *
 * Honesty about runtimes (today):
 *  - 'webllm'      → runs in the browser NOW via @mlc-ai/web-llm (WebGPU). Coding
 *                    models live here — real, downloadable today.
 *  - 'native'      → needs the native (Tauri) app + a capable GPU. Image gen
 *                    (no browser SD runtime wired yet) and video gen live here.
 */
import { type Tier, tierAtLeast, tierRank } from './hardware';

export type SkillId = 'code' | 'image' | 'video';
export type SkillRuntime = 'webllm' | 'native';

export interface SkillModel {
  /** Our stable id (for persistence + selection). */
  id: string;
  label: string;
  /** Human download size, e.g. "~1.1 GB". */
  size: string;
  /** Minimum hardware tier to run acceptably. */
  minTier: Tier;
  runtime: SkillRuntime;
  /** For webllm: substrings matched against the live prebuilt model list, so we
   *  never hard-depend on an exact id that may drift between versions. */
  webllmMatch?: string[];
  note?: string;
}

export interface Skill {
  id: SkillId;
  name: string;
  tagline: string;
  models: SkillModel[];
}

export const SKILLS: Record<SkillId, Skill> = {
  code: {
    id: 'code',
    name: 'Coding',
    tagline: 'An agent that edits your real files and runs your project — on your device.',
    models: [
      { id: 'coder-1_5b', label: 'Light', size: '~1.1 GB', minTier: 'mid', runtime: 'webllm', webllmMatch: ['Qwen2.5-Coder-1.5B', 'Coder-1.5B'] },
      { id: 'coder-7b', label: 'Pro', size: '~4.5 GB', minTier: 'high', runtime: 'webllm', webllmMatch: ['Qwen2.5-Coder-7B', 'Coder-7B'], note: 'Strong GPU recommended.' },
      { id: 'general-0_5b', label: 'Basic', size: '~0.3 GB', minTier: 'low', runtime: 'webllm', webllmMatch: ['Qwen2.5-0.5B-Instruct', '0.5B-Instruct'], note: 'General model — light coding help.' },
    ],
  },
  image: {
    id: 'image',
    name: 'Image creation',
    tagline: 'Generate images on your own device.',
    models: [
      { id: 'sd-turbo', label: 'Fast', size: '~2 GB', minTier: 'mid', runtime: 'native', note: 'In-browser image runtime is coming; native app runs it today.' },
      { id: 'sdxl', label: 'Quality', size: '~6 GB', minTier: 'high', runtime: 'native' },
    ],
  },
  video: {
    id: 'video',
    name: 'Video maker',
    tagline: 'Generate video on your own device — the heaviest skill.',
    models: [
      { id: 'svd', label: 'Clip', size: '~5 GB', minTier: 'high', runtime: 'native', note: 'Needs the native app + a strong GPU.' },
    ],
  },
};

/** The strongest in-browser (webllm) model the device tier can actually run —
 *  e.g. Strong GPU → Qwen2.5-Coder-7B, Capable → 1.5B, Entry → the 0.5B general.
 *  So we recommend the best coder the hardware supports instead of a fixed size.
 *  Returns null when nothing in-browser fits (e.g. no WebGPU → use the native app). */
export function recommendModel(skill: SkillId, tier: Tier): SkillModel | null {
  const fits = SKILLS[skill].models.filter((m) => m.runtime === 'webllm' && tierAtLeast(tier, m.minTier));
  return fits.sort((a, b) => tierRank(b.minTier) - tierRank(a.minTier))[0] ?? null;
}

const KEY = (s: SkillId) => `oioxo:skill:${s}`;

/** The model id the user has installed for a skill, or null. (Browser only.) */
export function installedModelId(skill: SkillId): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(KEY(skill));
  } catch {
    return null;
  }
}

export function setInstalled(skill: SkillId, modelId: string): void {
  try {
    localStorage.setItem(KEY(skill), modelId);
  } catch {
    /* ignore */
  }
}

export function clearInstalled(skill: SkillId): void {
  try {
    localStorage.removeItem(KEY(skill));
  } catch {
    /* ignore */
  }
}
