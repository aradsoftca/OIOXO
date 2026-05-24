'use client';

import * as React from 'react';
import { detectHardware, type HardwareInfo } from './hardware';
import { installedModelId, setInstalled, type SkillId, type SkillModel } from './skills';
import { loadModel } from './runtime';

/** Detect device capability once on mount. */
export function useHardware(): HardwareInfo | null {
  const [hw, setHw] = React.useState<HardwareInfo | null>(null);
  React.useEffect(() => {
    let alive = true;
    detectHardware().then((h) => {
      if (alive) setHw(h);
    });
    return () => {
      alive = false;
    };
  }, []);
  return hw;
}

export interface SkillState {
  /** Installed model id for this skill, or null. */
  installed: string | null;
  /** 0..1 while downloading; null otherwise. */
  progress: number | null;
  error: string | null;
  install: (model: SkillModel) => Promise<void>;
}

/** Install/track a skill's model. Real download for webllm models; native ones
 *  are flagged as app-only (no fake progress). */
export function useSkill(skill: SkillId): SkillState {
  const [installed, setInst] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setInst(installedModelId(skill));
  }, [skill]);

  const install = React.useCallback(
    async (model: SkillModel) => {
      setError(null);
      if (model.runtime !== 'webllm' || !model.webllmMatch) {
        setError('This skill runs in the oioxo native app for now.');
        return;
      }
      setProgress(0);
      try {
        await loadModel(model.webllmMatch, (p) => setProgress(p));
        setInstalled(skill, model.id);
        setInst(model.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Download failed.');
      } finally {
        setProgress(null);
      }
    },
    [skill],
  );

  return { installed, progress, error, install };
}
