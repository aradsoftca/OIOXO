'use client';

/**
 * In-chat image quick-edit surface (IN_CHAT_STUDIO.md, Phase 1). Renders an image
 * that's in the conversation with a one-tap edit bar driven by the validated
 * `IMAGE_EDIT_ACTIONS` manifest — the same tools the NL router already reaches.
 *
 * This component is PRESENTATIONAL: it collects the action (+ any value the action
 * needs) and calls `onApply(action, value)`. The parent (OioxoChat) wires `onApply`
 * to actually run the tool on the image and push the result back as a new, editable
 * image — that wiring is the integration step and needs in-app/browser QA. `onManual`
 * opens the full canvas editor (Phase 2) for crop/control.
 */
import * as React from 'react';
import { IMAGE_EDIT_ACTIONS, type EditAction } from '@/lib/ai/image-edit-actions';

const PLACEHOLDER: Record<NonNullable<EditAction['needs']>, string> = {
  amount: 'e.g. 20',
  angle: 'e.g. 90',
  size: 'e.g. 800x600',
  text: 'text to add',
  format: 'png / jpg / webp',
  none: '',
};

export default function ImageEditCard({
  src,
  onApply,
  onManual,
  busy,
}: {
  src: string;
  onApply: (action: EditAction, value?: string) => void;
  onManual?: () => void;
  busy?: boolean;
}) {
  const [active, setActive] = React.useState<EditAction | null>(null);
  const [value, setValue] = React.useState('');

  function tap(a: EditAction) {
    if (a.feasibility === 'manual') { onManual?.(); return; }
    if (a.needs === 'none') { onApply(a); return; }
    setActive(a);
    setValue('');
  }

  return (
    <div className="my-1 w-full max-w-[420px] rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="mb-2 max-h-72 w-full rounded-xl object-contain bg-zinc-50" />

      <div className="flex flex-wrap gap-1.5">
        {IMAGE_EDIT_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={busy}
            onClick={() => tap(a)}
            title={a.feasibility === 'cv' ? 'on-device vision' : a.feasibility === 'manual' ? 'opens editor' : 'instant'}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
              active?.id === a.id
                ? 'border-[#E2B24A] bg-[#E2B24A]/10 text-[#a9801f]'
                : 'border-zinc-200 text-zinc-700 hover:border-[#E2B24A]/60 hover:bg-[#E2B24A]/[0.05]'
            }`}
          >
            {a.label}
            {a.feasibility === 'cv' && <span className="ml-1 text-[10px] text-zinc-400">✨</span>}
          </button>
        ))}
        {onManual && (
          <button
            type="button"
            disabled={busy}
            onClick={onManual}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            Open editor
          </button>
        )}
      </div>

      {active && (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={PLACEHOLDER[active.needs]}
            onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) { onApply(active, value.trim()); setActive(null); } }}
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-sm outline-none focus:border-[#E2B24A]"
          />
          <button
            type="button"
            disabled={busy || (active.needs !== 'none' && !value.trim())}
            onClick={() => { onApply(active, value.trim() || undefined); setActive(null); }}
            className="rounded-lg bg-[#E2B24A] px-3 py-1 text-sm font-semibold text-zinc-900 hover:brightness-105 disabled:opacity-50"
          >
            {active.label}
          </button>
          <button type="button" onClick={() => setActive(null)} className="text-xs text-zinc-400 hover:text-zinc-600">cancel</button>
        </div>
      )}
      {busy && <div className="mt-2 text-xs text-zinc-500">Working…</div>}
    </div>
  );
}
