'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { fmtDuration } from '@/engines/video';
import { runFfmpeg, downloadBlob } from '@/engines/ffmpeg';
import { checkLever, checkFormat } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { FormatProBadge } from '@/components/limits/ProBadge';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { enforcePolicy } from '@/lib/limits/server-check';
import { requestPermission, hashInputFingerprint } from '@/lib/limits/permission';

const POLICY_KEY = 'video-convert-format';

type Target = 'mp4' | 'webm' | 'mov' | 'mkv';

const TARGETS: { id: Target; label: string; sub: string; mime: string }[] = [
  { id: 'mp4',  label: 'MP4',  sub: 'Plays everywhere',     mime: 'video/mp4' },
  { id: 'webm', label: 'WebM', sub: 'Open, modern',          mime: 'video/webm' },
  { id: 'mov',  label: 'MOV',  sub: 'Apple ecosystem',       mime: 'video/quicktime' },
  { id: 'mkv',  label: 'MKV',  sub: 'Multi-track container', mime: 'video/x-matroska' },
];

const QUALITIES = [
  { id: 'high',   label: 'High',     crf: 18 },
  { id: 'good',   label: 'Good',     crf: 23 },
  { id: 'medium', label: 'Medium',   crf: 28 },
  { id: 'low',    label: 'Low',      crf: 32 },
];

function argsFor(target: Target, crf: number): string[] {
  if (target === 'webm') {
    return ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-c:a', 'libopus'];
  }
  return ['-c:v', 'libx264', '-preset', 'fast', '-crf', String(crf), '-c:a', 'aac', '-movflags', '+faststart'];
}

export default function Tool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [item, setItem] = React.useState<VideoFileItem | null>(null);
  const [target, setTarget] = React.useState<Target>('mp4');
  const [quality, setQuality] = React.useState(QUALITIES[1]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');

  React.useEffect(() => () => { if (item?.url) URL.revokeObjectURL(item.url); }, [item]);

  const run = async () => {
    if (!item) return;
    const specs = [
      { type: 'lever' as const, lever: 'input-size' as const, value: item.file.size },
      { type: 'lever' as const, lever: 'input-duration' as const, value: item.info.duration },
      { type: 'format' as const, format: target },
    ];
    // PERMISSION GATE — same shape as the AI/coding handshake, applied per
    // action. Mint a server-attested ticket bound to this exact (toolKey,
    // input file, device, 30s, nonce). Engines refuse to run without it.
    const inputHash = await hashInputFingerprint(POLICY_KEY, {
      file: item.file, duration: item.info.duration, extra: target + ':' + quality.crf,
    });
    const { permission, denial } = await requestPermission(POLICY_KEY, inputHash, specs);
    if (denial) {
      // Lever failed server-side — show the paywall using the local hit object
      // for the friendliest message.
      const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, specs);
      if (!ok) return;
      return;
    }
    setBusy(true); setError(''); setProgress(0);
    try {
      const inputName = 'in.' + (item.file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp4');
      const outputName = 'out.' + target;
      const codecArgs = argsFor(target, quality.crf);
      const blob = await runFfmpeg({
        input: item.file,
        inputName,
        outputName,
        args: (i, o) => ['-i', i, ...codecArgs, o],
        mimeType: TARGETS.find((t) => t.id === target)!.mime,
        onProgress: (p) => setProgress(Math.round(p * 100)),
        permission, toolKey: POLICY_KEY, inputHash,
      });
      downloadBlob(blob, item.file.name.replace(/\.[^.]+$/, '') + '.' + target);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {policyGate.element}
      {!item && <VideoDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fmtDuration(item.info.duration)} · {item.info.width}×{item.info.height} · {(item.info.fileSize / 1024 / 1024).toFixed(1)} MB</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Output format</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {TARGETS.map((t) => (
                    <button key={t.id} type="button" onClick={() => setTarget(t.id)}
                      className={`relative border py-3 text-left px-3 transition ${target === t.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      <div className="absolute right-1.5 top-1.5"><FormatProBadge toolKey={POLICY_KEY} format={t.id} isPro={isPro} compact /></div>
                      <div className="text-[14px] font-bold uppercase tracking-wider">{t.label}</div>
                      <div className="text-[10px] opacity-80">{t.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Quality</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {QUALITIES.map((q) => (
                    <button key={q.id} type="button" onClick={() => setQuality(q)}
                      className={`border py-2 text-[11px] font-bold uppercase tracking-wider transition ${quality.id === q.id ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                      {q.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-[var(--color-fg-muted)]">CRF {quality.crf} — lower = bigger file, higher quality</div>
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Output</div>
                <div className="mt-1 text-[14px] font-semibold break-all">{item.file.name.replace(/\.[^.]+$/, '')}.{target}</div>
                <div className="mt-2 text-[10px] text-[var(--color-fg-muted)]">First time may take a moment to warm up. Subsequent jobs start instantly.</div>
              </div>
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-video)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? `Converting… ${progress}%` : 'Convert & Download'}
              </button>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
