'use client';

import * as React from 'react';
import { Code2, Image as ImageIcon, Video, Cpu, Check, Download, Loader2, Monitor, Lock } from 'lucide-react';
import { SKILLS, recommendModel, type SkillId, type SkillModel } from '@/lib/oioxo/skills';
import { TIER_LABEL, tierAtLeast } from '@/lib/oioxo/hardware';
import { useHardware, useSkill } from '@/lib/oioxo/useSkills';

const ICON: Record<SkillId, React.ReactNode> = {
  code: <Code2 className="h-7 w-7" />,
  image: <ImageIcon className="h-7 w-7" />,
  video: <Video className="h-7 w-7" />,
};

export default function SkillPanel({ skillId }: { skillId: SkillId }) {
  const skill = SKILLS[skillId];
  const hw = useHardware();
  const { installed, progress, error, install } = useSkill(skillId);
  const [installing, setInstalling] = React.useState<string | null>(null);
  // The best in-browser model this device can run — surfaced as "Recommended".
  const recommended = hw ? recommendModel(skillId, hw.tier) : null;

  async function onInstall(m: SkillModel) {
    setInstalling(m.id);
    await install(m);
    setInstalling(null);
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col px-6 py-10">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
          {ICON[skillId]}
        </div>
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">{skill.name}</h2>
          <p className="text-sm text-zinc-500">{skill.tagline}</p>
        </div>
      </div>

      {/* detected hardware */}
      <div className="mt-6 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
        <Monitor className="h-4 w-4 text-zinc-400" />
        {hw ? (
          <span>
            Your device:&nbsp;
            <strong className="text-zinc-800">{TIER_LABEL[hw.tier]}</strong>
            {hw.gpu ? ` · ${hw.gpu}` : hw.webgpu ? '' : ' · no WebGPU'}
            {hw.deviceMemoryGB ? ` · ${hw.deviceMemoryGB} GB RAM` : ''}
          </span>
        ) : (
          <span>Checking your hardware…</span>
        )}
      </div>

      {/* model options */}
      <div className="mt-4 flex flex-col gap-2.5">
        {skill.models.map((m) => {
          const isInstalled = installed === m.id;
          const native = m.runtime === 'native';
          const runnable = !native && !!hw && hw.webgpu && tierAtLeast(hw.tier, m.minTier);
          const busy = installing === m.id && progress != null;
          return (
            <div
              key={m.id}
              className={[
                'flex items-center gap-3 rounded-xl border p-3 transition',
                isInstalled ? 'border-emerald-300 bg-emerald-50/50' : 'border-zinc-200',
              ].join(' ')}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900">{m.label}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                    {m.size}
                  </span>
                  {native && (
                    <span className="rounded-full bg-zinc-900/5 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                      native app
                    </span>
                  )}
                  {recommended?.id === m.id && !isInstalled && (
                    <span className="rounded-full bg-[#E2B24A]/20 px-2 py-0.5 text-[11px] font-semibold text-[#7a5c12]">
                      Recommended for your device
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {m.note ?? `Best on ${TIER_LABEL[m.minTier]} or better.`}
                </p>
                {busy && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className="h-full bg-zinc-900 transition-[width]"
                      style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {isInstalled ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                    <Check className="h-3.5 w-3.5" /> Enabled
                  </span>
                ) : native ? (
                  <span className="flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-400">
                    <Lock className="h-3.5 w-3.5" /> App
                  </span>
                ) : busy ? (
                  <span className="flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {Math.round((progress ?? 0) * 100)}%
                  </span>
                ) : runnable ? (
                  <button
                    type="button"
                    onClick={() => onInstall(m)}
                    disabled={progress != null}
                    className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                ) : (
                  <span className="flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-400">
                    <Cpu className="h-3.5 w-3.5" /> Needs {TIER_LABEL[m.minTier]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <p className="mt-5 text-xs text-zinc-400">
        Models run on your device and are cached after the first download — private and offline-capable.
        {hw && !hw.webgpu && ' Your browser has no WebGPU, so in-browser models are unavailable here — the native app covers all platforms.'}
      </p>
    </section>
  );
}
