'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Download, Check, ArrowRight, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { convertFile, type Target, type ConvCategory } from '@/lib/convert/matrix';
import { actionsForFile } from '@/lib/files/actions';
import type { ToolManifest } from '@/lib/registry/types';
import { CATEGORIES } from '@/lib/registry/types';
import { stageHandoff } from '@/lib/ai/handoff';
import { TileIcon } from '@/components/tiles/TileIcon';
import { ConvertDropZone } from '@/components/tool/ConvertDropZone';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { freeSizeLabel } from '@/lib/usage/benefits';

const CAT_LABEL: Record<ConvCategory, string> = {
  image: 'image', audio: 'audio file', video: 'video', pdf: 'PDF', subtitle: 'subtitle', font: 'font', data: 'spreadsheet', model3d: '3D model', document: 'document', ebook: 'ebook', cad: 'CAD file', presentation: 'presentation', text: 'text file', archive: 'archive', calendar: 'calendar / contacts', email: 'email', certificate: 'certificate / key',
};

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default function ConvertAnythingTool() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [info, setInfo] = React.useState<{ ext: string; category: ConvCategory | null } | null>(null);
  const [targets, setTargets] = React.useState<Target[]>([]);
  const [tools, setTools] = React.useState<ToolManifest[]>([]);
  const [active, setActive] = React.useState<Target | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<{ url?: string; text?: string; filename: string; size?: number } | null>(null);
  const { guard, gate } = useUsageGate('convert');

  React.useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result]);

  const load = (f: File) => {
    setError(''); setResult(null); setActive(null);
    const a = actionsForFile(f);
    setFile(f); setInfo({ ext: a.ext, category: a.category }); setTargets(a.convert); setTools(a.tools);
    if (!a.convert.length && !a.tools.length) {
      setError(`No in-browser actions for .${a.ext || '?'} yet.`);
    }
  };

  const run = async (target: Target) => {
    if (!file) return;
    if (!(await guard({ bytes: file.size }))) return;
    setActive(target); setBusy(true); setError(''); setProgress(0);
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    try {
      const out = await convertFile(file, target, { onProgress: (r) => setProgress(Math.round(r * 100)) });
      if (out.text != null) {
        setResult({ text: out.text, filename: out.filename, size: new Blob([out.text]).size });
      } else if (out.files) {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        for (const f of out.files) zip.file(f.name, await f.blob.arrayBuffer());
        const blob = await zip.generateAsync({ type: 'blob' });
        setResult({ url: URL.createObjectURL(blob), filename: out.filename, size: blob.size });
      } else if (out.blob) {
        setResult({ url: URL.createObjectURL(out.blob), filename: out.filename, size: out.blob.size });
      }
    } catch (e) {
      setError((e as Error).message || 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  // Open the chosen tool with the dropped file already loaded.
  const openTool = (t: ToolManifest) => {
    if (file) stageHandoff(file);
    router.push(`/tools/${t.id}`);
  };

  const download = () => {
    if (!result) return;
    let url = result.url;
    // If we build the URL on demand for a text-only output, remember to
    // revoke it after the download fires. The persistent `result.url` case
    // is already managed by the cleanup useEffect.
    let createdHere = false;
    if (!url && result.text != null) {
      url = URL.createObjectURL(new Blob([result.text], { type: 'text/plain' }));
      createdHere = true;
    }
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // 60s defer — 4s was occasionally too short on slow mobile networks where
    // the download dialog opens late and the browser aborts the saved file
    // when the blob URL is torn down before the stream starts.
    if (createdHere) { const u = url; setTimeout(() => URL.revokeObjectURL(u), 60_000); }
  };

  // Keyboard: Esc clears the loaded file and resets the action lists.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (file && e.key === 'Escape') {
        e.preventDefault();
        setFile(null); setResult(null); setActive(null); setTargets([]); setTools([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-5">
      {gate}
      {!file && (
        <ConvertDropZone
          label="Drop a file, click to browse, or paste — see everything you can do with it"
          sublabel={
            <>
              Convert it to any format, or open it in the right tool. Files never leave your device.
              <br />
              {/* Was "1 free conversion/day" — the gate allows unlimited conversion (config.ts convert: 9999). */}
              Unlimited free conversion · {freeSizeLabel('convert')} · <a href="/limits" className="inline-flex min-h-[32px] items-center underline underline-offset-2">see all limits</a>
            </>
          }
          onFiles={(files) => load(files[0])}
        />
      )}

      {file && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <span className="text-[12px] font-semibold">{file.name}</span>
            {info?.category && <span className="bg-black/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{CAT_LABEL[info.category]}</span>}
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{(file.size / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => { setFile(null); setResult(null); setActive(null); setTargets([]); setTools([]); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          {targets.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Convert to</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {targets.map((t) => {
                  const isActive = active?.to === t.to && active?.handler === t.handler;
                  return (
                    <button key={`${t.to}-${t.handler}`} type="button" onClick={() => run(t)} disabled={busy}
                      className={cn(
                        'flex items-center gap-2 border px-3 py-3 text-left transition disabled:opacity-50',
                        isActive ? 'border-[var(--color-cat-convert)] bg-[var(--color-cat-convert)]/5' : 'border-black/[0.08] hover:border-[var(--color-cat-convert)] hover:bg-[var(--color-surface-2)]',
                      )}>
                      <div className="flex items-center gap-1.5 font-mono text-[13px] font-bold tracking-tight">
                        <span className="text-[var(--color-fg-muted)]">{info?.ext.toUpperCase()}</span>
                        <ArrowRight className="h-3 w-3 text-[var(--color-fg-subtle)]" />
                        <span className="text-[var(--color-fg)]">{t.to.toUpperCase()}</span>
                      </div>
                      {busy && isActive && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-[var(--color-cat-convert)]" />}
                    </button>
                  );
                })}
              </div>
              {active?.note && <p className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">{active.note}.</p>}
            </div>
          )}

          {busy && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Converting to {active?.to.toUpperCase()}… {progress > 0 && `${progress}%`}
              </div>
              {progress > 0 && (
                <div className="mt-2 h-1 w-full overflow-hidden bg-black/[0.06]">
                  <div className="h-full bg-[var(--color-cat-convert)] transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}

          {error && <div className="text-[12px] text-red-600">{error}</div>}

          {result && (
            <div className="border border-[var(--color-cat-convert)]/40 bg-[var(--color-cat-convert)]/5 p-4">
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[var(--color-fg)]">
                <Check className="h-4 w-4 text-green-600" /> Ready: {result.filename}
                {result.size != null && <span className="font-mono text-[11px] font-normal text-[var(--color-fg-muted)]">{fmtSize(result.size)}</span>}
              </div>
              {result.text != null && (
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap bg-[var(--color-surface-1)] p-3 font-mono text-[12px] text-[var(--color-fg)]">{result.text.slice(0, 4000) || '(no text found)'}</pre>
              )}
              <button type="button" onClick={download}
                className="mt-3 flex items-center gap-2 bg-[var(--color-cat-convert)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
                {result.text != null ? <FileText className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} Download
              </button>
            </div>
          )}

          {tools.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
                Open in a tool <span className="text-[var(--color-fg-subtle)]">· {tools.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {tools.map((t) => {
                  const color = `var(${CATEGORIES[t.category].colorVar})`;
                  return (
                    <button key={t.id} type="button" onClick={() => openTool(t)}
                      className="group flex items-center gap-3 border border-black/[0.08] px-3 py-3 text-left transition hover:border-[color:var(--hover)] hover:bg-[var(--color-surface-2)]"
                      style={{ ['--hover' as string]: color }}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center text-white" style={{ background: color }}>
                        <TileIcon name={t.icon} size={16} strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-[var(--color-fg)]">{t.name}</span>
                        <span className="block truncate text-[11px] text-[var(--color-fg-muted)]">{t.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
