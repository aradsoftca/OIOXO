'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Upload, Copy, Check, Download, Send, Loader2, ShieldCheck, X, Link2, Wifi, RefreshCw,
  Smartphone, ClipboardPaste, Gauge,
} from 'lucide-react';
import {
  startSend, startReceive, formatBytes, runSelfTest,
  ERR_NO_DIRECT, ERR_EXPIRED, ERR_BLOCKED,
  type Phase, type Progress, type Transfer, type Stat, type SelfTest,
} from '@/lib/p2p/transfer';
import { useStagedInput } from '@/lib/ai/handoff';
import { useUsageGate } from '@/components/usage/use-usage-gate';

const PHASE_LABEL: Record<Phase, string> = {
  waiting: 'Waiting for the other device…',
  connecting: 'Connecting…',
  transferring: 'Transferring…',
  done: 'Done',
  error: 'Something went wrong',
};

/** Human ETA, e.g. "about 12s left" / "about 3m left". Empty when not meaningful. */
function formatEta(remainingBytes: number, bytesPerSec: number): string {
  if (!(bytesPerSec > 0) || remainingBytes <= 0) return '';
  const secs = remainingBytes / bytesPerSec;
  if (secs < 1) return 'less than a second left';
  if (secs < 60) return `about ${Math.ceil(secs)}s left`;
  if (secs < 3600) return `about ${Math.ceil(secs / 60)}m left`;
  return `about ${Math.ceil(secs / 3600)}h left`;
}

/**
 * Overall completion across ALL files in a batch (0..1), not just the current
 * file. filesDone files are 100% complete; the in-flight file adds its own
 * fraction. Gives the single smooth progress bar rivals are judged on.
 */
function overallFraction(p: Progress): number {
  const filesTotal = Math.max(1, p.filesTotal);
  const perFile = 1 / filesTotal;
  const curFrac = p.total > 0 ? p.bytes / p.total : 0;
  return Math.min(1, p.filesDone * perFile + curFrac * perFile);
}

interface WakeSentinel { released: boolean; release: () => Promise<void> }
/**
 * Keep the screen awake while `active` so a phone screen-lock or idle dim
 * doesn't suspend the tab and stall the transfer — the #1 large-file complaint
 * against browser P2P rivals. Re-acquires after the page returns to the
 * foreground (the OS auto-releases the lock when a tab is hidden). No-op and
 * harmless where the API is unavailable.
 */
function useWakeLock(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeSentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: WakeSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await nav.wakeLock!.request('screen');
        if (cancelled) { void s.release().catch(() => {}); return; }
        sentinel = s;
      } catch { /* denied / not allowed in background — fine */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}

export default function SendApp() {
  const params = useSearchParams();
  const room = params.get('r');
  return room ? <Receive code={room} /> : <SendSide />;
}

// ---------------------------------------------------------------------------
function SendSide() {
  const [files, setFiles] = React.useState<File[]>([]);
  const [code, setCode] = React.useState('');
  const [phase, setPhase] = React.useState<Phase | null>(null);
  const [detail, setDetail] = React.useState('');
  const [prog, setProg] = React.useState<Progress | null>(null);
  const [stat, setStat] = React.useState<Stat | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [qr, setQr] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const transferRef = React.useRef<Transfer | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { guard, gate } = useUsageGate('send');

  // Keep the screen awake while a transfer is live so a phone lock / tab dim
  // doesn't stall it. Off in waiting/done/error.
  useWakeLock(phase === 'connecting' || phase === 'transferring');

  const link = code && typeof window !== 'undefined' ? `${window.location.origin}/send?r=${code}` : '';

  React.useEffect(() => () => transferRef.current?.cancel(), []);

  React.useEffect(() => {
    if (!link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 }))
      .then((url) => { if (alive) setQr(url); }).catch(() => {});
    return () => { alive = false; };
  }, [link]);

  const begin = async (picked: File[]) => {
    if (!picked.length) return;
    // Two-lever app gate: total transfer SIZE (free up to the cap) + transfers/day.
    const bytes = picked.reduce((s, f) => s + f.size, 0);
    if (!(await guard({ bytes }))) return;
    setFiles(picked);
    const { code: c, transfer } = startSend(picked, {
      onPhase: (p, d) => { setPhase(p); if (d) setDetail(d); },
      onProgress: setProg,
      onStat: setStat,
    });
    transferRef.current = transfer;
    setCode(c);
  };

  // A file handed off by Xonvert AI auto-starts the transfer.
  useStagedInput((f) => begin([f]));

  // Stable handle for window-level listeners so they never run a stale `begin`.
  const beginRef = React.useRef(begin);
  beginRef.current = begin;
  const hasFiles = files.length > 0;

  // Paste files OR text/URL straight in (Ctrl/Cmd+V) — a true "beam anything"
  // shortcut. Only before a transfer is in flight, and we ignore pastes into
  // editable fields so it never hijacks normal typing.
  React.useEffect(() => {
    if (hasFiles) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const fromItems = Array.from(dt.files);
      if (fromItems.length) { e.preventDefault(); void beginRef.current(fromItems); return; }
      const text = dt.getData('text');
      if (text && text.trim()) {
        e.preventDefault();
        const name = /^https?:\/\//i.test(text.trim()) ? 'link.txt' : 'clipboard.txt';
        void beginRef.current([new File([text], name, { type: 'text/plain' })]);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [hasFiles]);

  // Full-window drag highlight: dragging a file anywhere over the page lights
  // up the whole window and dropping it starts the transfer. The dragenter/leave
  // counter avoids flicker from child-element boundary crossings.
  React.useEffect(() => {
    if (hasFiles) return;
    let depth = 0;
    const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const onEnter = (e: DragEvent) => { if (!hasFile(e)) return; depth++; setDragging(true); };
    const onOver = (e: DragEvent) => { if (hasFile(e)) e.preventDefault(); };
    const onLeave = (e: DragEvent) => { if (!hasFile(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) setDragging(false); };
    const onDrop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault(); depth = 0; setDragging(false);
      const dropped = Array.from(e.dataTransfer?.files || []);
      if (dropped.length) void beginRef.current(dropped);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [hasFiles]);

  const reset = () => {
    transferRef.current?.cancel();
    transferRef.current = null;
    setFiles([]); setCode(''); setPhase(null); setProg(null); setStat(null); setDetail(''); setQr('');
  };

  const restart = () => {
    transferRef.current?.cancel();
    setCode(''); setPhase(null); setProg(null); setStat(null); setDetail(''); setQr('');
    begin(files); // same files, fresh link + connection
  };

  const copy = () => {
    if (!link) return;
    navigator.clipboard?.writeText(link).catch(() => { /* permission denied */ });
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  if (!files.length) {
    return (
      <Shell>
        {gate}
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); begin(Array.from(e.dataTransfer.files)); }}
          onDragOver={(e) => e.preventDefault()}
          className={`group flex aspect-[5/2] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center transition-all duration-150 ${
            dragging
              ? 'scale-[1.01] border-[var(--color-cat-convert)] bg-[var(--color-cat-convert)]/[0.08] shadow-[0_0_0_4px_var(--color-cat-convert)]/[0.06]'
              : 'border-black/[0.18] bg-[var(--color-surface-1)] hover:border-[var(--color-cat-convert)]/60 hover:bg-[var(--color-surface-2)]'
          }`}
        >
          <button type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            className="pointer-events-none flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
            <span className={`grid h-14 w-14 place-items-center rounded-full transition-all duration-150 ${
              dragging
                ? 'scale-110 bg-[var(--color-cat-convert)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] group-hover:bg-[var(--color-cat-convert)]/10 group-hover:text-[var(--color-cat-convert)]'
            }`}>
              <Upload className="h-6 w-6 transition-transform group-hover:-translate-y-0.5" />
            </span>
            <span className="font-medium">
              {dragging ? 'Drop to send instantly' : 'Drop files to send, or click to choose'}
            </span>
          </button>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-subtle)]">
            <ClipboardPaste className="h-3.5 w-3.5" /> or paste a file, image, or link (Ctrl/Cmd&nbsp;+&nbsp;V)
          </span>
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={(e) => { if (e.target.files) begin(Array.from(e.target.files)); e.target.value = ''; }} />
        </div>
        <PrivacyNote />

        {/* Full-window drop highlight — drag a file anywhere over the page. */}
        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-cat-convert)]/[0.10] backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-3 border-2 border-dashed border-[var(--color-cat-convert)] bg-[var(--color-surface-1)]/95 px-10 py-8 shadow-xl">
              <Upload className="h-9 w-9 animate-bounce text-[var(--color-cat-convert)]" />
              <span className="text-[15px] font-bold tracking-tight">Drop to send</span>
              <span className="text-[12px] text-[var(--color-fg-muted)]">A private link appears in under 2 seconds</span>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      {gate}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-3">
            <div className="text-[12px] font-semibold">
              {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
            </div>
            <button type="button" onClick={reset} className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Cancel
            </button>
          </div>

          {phase === 'error' && <FailureCard code={detail} onRetry={restart} retryLabel="Start over" />}

          {phase && phase !== 'error' && (
            <div className={`border bg-[var(--color-surface-1)] p-4 transition-colors ${
              phase === 'done' ? 'border-green-500/40 bg-green-50/30' : 'border-black/[0.08]'
            }`}>
              <PhaseHeading phase={phase} done={phase === 'done'} />
              {(phase === 'transferring' || phase === 'done') && (
                <TransferProgress prog={prog} done={phase === 'done'} />
              )}
              {(phase === 'waiting' || phase === 'connecting') && (
                <ConnectingStatus phase={phase} stat={stat} />
              )}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
              <Smartphone className="h-3.5 w-3.5" /> Scan to receive
            </div>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code linking to this transfer" className="mx-auto my-3 h-44 w-44 border border-black/[0.06] bg-white p-1" />
            ) : (
              <div className="mx-auto my-3 grid h-44 w-44 place-items-center border border-black/[0.06] bg-white">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--color-fg-subtle)]" />
              </div>
            )}
            <button type="button" onClick={copy}
              className={`flex w-full items-center justify-center gap-2 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition ${
                copied ? 'bg-green-600' : 'bg-[var(--color-cat-convert)] hover:brightness-110'
              }`}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-muted)]">
              {link}
            </div>
            <div className="mt-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              Scan the code with a phone, or open this link on the other device. Keep this tab open until the transfer finishes.
            </div>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
function Receive({ code }: { code: string }) {
  const [phase, setPhase] = React.useState<Phase>('connecting');
  const [detail, setDetail] = React.useState('');
  const [prog, setProg] = React.useState<Progress | null>(null);
  const [stat, setStat] = React.useState<Stat | null>(null);
  const [done, setDone] = React.useState<{ name: string; url: string; size: number; auto: boolean }[]>([]);
  const transferRef = React.useRef<Transfer | null>(null);

  // Keep the device awake while receiving so a screen-lock can't suspend the
  // tab and drop the transfer — the same large-file protection the sender gets.
  useWakeLock(phase === 'connecting' || phase === 'transferring');

  React.useEffect(() => {
    const transfer = startReceive(code, {
      onPhase: (p, d) => { setPhase(p); if (d) setDetail(d); },
      onProgress: setProg,
      onStat: setStat,
      onFile: ({ name, blob }) => {
        const url = URL.createObjectURL(blob);
        // Auto-download the moment a file finishes (no extra tap on completion).
        // A blob-URL <a download> click works without a user gesture in modern
        // browsers; if the browser suppresses it, the Save button is the
        // fallback. `auto` tracks whether it was offered so we don't re-fire.
        let auto = false;
        try {
          const a = document.createElement('a');
          a.href = url; a.download = name; a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
          auto = true;
        } catch { /* fall back to the manual Save button */ }
        setDone((prev) => [...prev, { name, url, size: blob.size, auto }]);
      },
    });
    transferRef.current = transfer;
    return () => transfer.cancel();
  }, [code]);

  // Unmount-only cleanup driven by a ref. Previous version had `[done]` deps,
  // which made EVERY new received file revoke the URLs of files received
  // earlier — breaking download links the moment the second file arrived.
  const doneRef = React.useRef(done);
  React.useEffect(() => { doneRef.current = done; }, [done]);
  React.useEffect(() => () => { doneRef.current.forEach((d) => URL.revokeObjectURL(d.url)); }, []);

  if (phase === 'error') {
    return (
      <Shell>
        <FailureCard code={detail} onRetry={() => window.location.reload()} retryLabel="Try again" />
      </Shell>
    );
  }

  const autoSaved = done.length > 0 && done.every((d) => d.auto);

  return (
    <Shell>
      <div className={`border bg-[var(--color-surface-1)] p-5 transition-colors ${
        phase === 'done' ? 'border-green-500/40 bg-green-50/30' : 'border-black/[0.08]'
      }`}>
        <PhaseHeading phase={phase} done={phase === 'done'} receiving />

        {phase === 'connecting' && <ConnectingStatus phase="connecting" stat={stat} receiving />}

        {prog && phase === 'transferring' && <TransferProgress prog={prog} done={false} />}

        {done.length > 0 && (
          <>
            {autoSaved && (
              <div className="mt-4 flex items-center gap-2 text-[11px] text-green-700">
                <Download className="h-3.5 w-3.5" /> Saved to your downloads automatically.
              </div>
            )}
            <ul className="mt-3 space-y-1.5">
              {done.map((d, i) => (
                <li key={i} className="flex items-center gap-3 border border-black/[0.06] bg-white/40 px-3 py-2">
                  <span className="flex-1 truncate font-mono text-[12px]">{d.name}</span>
                  <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{formatBytes(d.size)}</span>
                  <a href={d.url} download={d.name}
                    className="flex items-center gap-1.5 bg-[var(--color-cat-convert)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
                    <Download className="h-3.5 w-3.5" /> {d.auto ? 'Save again' : 'Save'}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <PrivacyNote />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Self-contained keyframes for the connecting shimmer (kept local to this app so
// the change touches no shared global CSS). `pulse` is a Tailwind default.
const SEND_KEYFRAMES = `@keyframes loading{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // Grounded app window (light) — contained on the page, not floating in cream.
    <div className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-[var(--color-stroke)] bg-[var(--color-surface-2)] p-5 shadow-lg">
      <style>{SEND_KEYFRAMES}</style>
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-convert)] text-white">
          <Send className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Send</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">Beam files device to device. Nothing is stored on a server.</p>
        </div>
        <Link2 className="ml-auto hidden h-5 w-5 text-[var(--color-fg-subtle)] sm:block" />
      </header>
      {children}
    </div>
  );
}

function FailureCard({ code, onRetry, retryLabel }: { code: string; onRetry: () => void; retryLabel: string }) {
  const noDirect = code === ERR_NO_DIRECT;
  const expired = code === ERR_EXPIRED;
  const blocked = code === ERR_BLOCKED;
  const title = blocked ? 'This device is blocking direct connections'
    : noDirect ? "Couldn't connect the two devices directly"
    : expired ? 'This transfer link isn’t active'
    : 'The transfer was interrupted';
  return (
    <div className="border border-amber-500/30 bg-amber-50/40 p-5">
      <div className="flex items-center gap-2 text-[14px] font-bold text-[var(--color-fg)]">
        <X className="h-4 w-4 text-amber-600" /> {title}
      </div>

      {blocked && (
        <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-[var(--color-fg-muted)]">
          <p>
            This device didn’t expose any network path, so a direct transfer can’t start.
            Something on <strong className="text-[var(--color-fg)]">this device</strong> is blocking it — not the other side.
          </p>
          <div className="flex items-start gap-2 border border-black/[0.06] bg-white/50 p-3">
            <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-cat-convert)]" />
            <span><strong className="text-[var(--color-fg)]">Try:</strong> turn off any <strong className="text-[var(--color-fg)]">VPN</strong>, disable privacy/ad-block <strong className="text-[var(--color-fg)]">extensions</strong> (some block WebRTC), or open this in another browser / a Guest window — then try again. On a work computer, a managed-browser policy may be the cause.</span>
          </div>
          <SelfTestPanel />
        </div>
      )}

      {noDirect && (
        <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-[var(--color-fg-muted)]">
          <p>
            Files go straight from one device to the other — we never route them through a server.
            A few networks (some office or mobile connections) block that direct path.
          </p>
          <div className="flex items-start gap-2 border border-black/[0.06] bg-white/50 p-3">
            <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-cat-convert)]" />
            <span><strong className="text-[var(--color-fg)]">Easiest fix:</strong> put both devices on the <strong className="text-[var(--color-fg)]">same Wi-Fi</strong>, or turn on a <strong className="text-[var(--color-fg)]">phone hotspot</strong> and connect the other device to it — then try again.</span>
          </div>
        </div>
      )}

      {expired && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--color-fg-muted)]">
          The sender may have closed their tab, or the link has expired. Ask them to start a new transfer and send you a fresh link.
        </p>
      )}

      <button type="button" onClick={onRetry}
        className="mt-4 flex items-center gap-2 bg-[var(--color-cat-convert)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
        <RefreshCw className="h-3.5 w-3.5" /> {retryLabel}
      </button>
    </div>
  );
}

/** One-click WebRTC probe: shows exactly which network layer this browser blocks. */
function SelfTestPanel() {
  const [running, setRunning] = React.useState(false);
  const [r, setR] = React.useState<SelfTest | null>(null);

  const run = async () => {
    setRunning(true); setR(null);
    try { setR(await runSelfTest()); } catch { /* ignore */ } finally { setRunning(false); }
  };

  const verdictText: Record<SelfTest['verdict'], string> = {
    ok: r && r.relay > 0 && r.host === 0
      ? 'Direct paths are blocked here, but a relay path is available — transfers will still connect.'
      : 'This browser exposes network paths fine — connection should work.',
    'no-local': 'This browser exposed NO network path at all — not even a relay. A privacy/ad-block extension or a managed-browser policy is blocking WebRTC entirely; try Guest mode or another browser.',
    'no-internet': 'Local network is fine, but reaching the internet is blocked (firewall or security software) — even a relay couldn’t be reached.',
    none: '',
  };

  return (
    <div className="border border-black/[0.06] bg-white/50 p-3">
      <button type="button" onClick={run} disabled={running}
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-cat-convert)] disabled:opacity-50">
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {running ? 'Testing…' : 'Run connection self-test'}
      </button>
      {r && (
        <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
          <div className="font-mono text-[10px] text-[var(--color-fg-subtle)]">
            local(host): <b className="text-[var(--color-fg-muted)]">{r.host}</b> ·
            public(srflx): <b className="text-[var(--color-fg-muted)]">{r.srflx}</b> ·
            gather: <b className="text-[var(--color-fg-muted)]">{r.gathering}</b> ·
            {r.durationMs}ms{r.mdns ? ' · mdns' : ''}
          </div>
          {r.errors.length > 0 && (
            <div className="font-mono text-[10px] text-amber-700">stun errors: {r.errors.join(' | ')}</div>
          )}
          <p className={r.verdict === 'ok' ? 'text-green-700' : 'text-amber-700'}>{verdictText[r.verdict]}</p>
        </div>
      )}
    </div>
  );
}

/** Phase heading row with a success pulse on done. Shared by both sides. */
function PhaseHeading({ phase, done, receiving }: { phase: Phase; done: boolean; receiving?: boolean }) {
  const label = done
    ? (receiving ? 'Received' : 'Sent')
    : PHASE_LABEL[phase];
  return (
    <div className="flex items-center gap-2 text-[14px] font-semibold">
      {done ? (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-green-600 text-white animate-[pulse_0.6s_ease-out_1]">
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-[var(--color-cat-convert)]" />
      )}
      {label}
    </div>
  );
}

/**
 * The single smooth progress block judged against rivals: overall % across the
 * whole batch, live speed, a human ETA, and the current-file line. Used by both
 * sender and receiver so telemetry is identical on both sides.
 */
function TransferProgress({ prog, done }: { prog: Progress | null; done: boolean }) {
  if (!prog) {
    return <div className="mt-3 text-[12px] text-[var(--color-fg-muted)]">Starting transfer…</div>;
  }
  const overall = done ? 1 : overallFraction(prog);
  const pct = Math.round(overall * 100);
  const remaining = Math.max(0, prog.total - prog.bytes);
  const eta = done ? '' : formatEta(remaining, prog.bytesPerSec);
  const multi = prog.filesTotal > 1;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] text-[var(--color-fg-muted)]">
        <span className="truncate font-medium text-[var(--color-fg)]">{prog.name || 'Transferring…'}</span>
        <span className="ml-3 shrink-0 font-mono tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/[0.08]">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${done ? 'bg-green-600' : 'bg-[var(--color-cat-convert)]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10px] text-[var(--color-fg-subtle)]">
        <span className="flex items-center gap-3">
          {multi && <span>File {prog.index + 1} of {prog.filesTotal}</span>}
          <span className="tabular-nums">{formatBytes(prog.bytes)} / {formatBytes(prog.total)}</span>
        </span>
        {!done && (
          <span className="flex items-center gap-1.5 tabular-nums">
            <Gauge className="h-3 w-3" />
            {formatBytes(prog.bytesPerSec)}/s{eta ? ` · ${eta}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Connecting / waiting clarity — never a bare spinner. Shows an elapsed timer,
 * a plain-language stage line, and a "still trying / re-attempting a path" hint
 * once ICE has been checking a while (the silent ICE-restart in the transfer
 * layer), so a slow handshake reads as progress, not a freeze.
 */
function ConnectingStatus({ phase, stat, receiving }: { phase: Phase; stat: Stat | null; receiving?: boolean }) {
  const [secs, setSecs] = React.useState(0);
  React.useEffect(() => {
    setSecs(0);
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const checking = stat?.ice === 'checking' || stat?.ice === 'disconnected';
  const slow = phase === 'connecting' && secs >= 8 && (checking || !stat || stat.ice !== 'connected');
  const headline = phase === 'waiting'
    ? (receiving ? 'Reaching the sender…' : 'Waiting for the other device to open the link…')
    : slow
      ? 'Still finding the best path between the two devices…'
      : 'Negotiating a direct, encrypted path…';

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-[12px] text-[var(--color-fg-muted)]">
        <span>{headline}</span>
        <span className="font-mono tabular-nums text-[11px] text-[var(--color-fg-subtle)]">{secs}s</span>
      </div>
      {/* Indeterminate shimmer so the bar reads as alive, not stalled. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08]">
        <div className="h-full w-1/3 animate-[loading_1.4s_ease-in-out_infinite] rounded-full bg-[var(--color-cat-convert)]/70" />
      </div>
      {slow && (
        <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
          Some networks take a moment. If both devices are on the same Wi-Fi it connects fastest — this will keep retrying on its own.
        </p>
      )}
      <DiagLine stat={stat} />
    </div>
  );
}

/** Live handshake diagnostics — shown while connecting so a stall is visible. */
function DiagLine({ stat }: { stat: Stat | null }) {
  if (!stat) return null;
  return (
    <div className="mt-3 space-y-0.5 border-t border-black/[0.06] pt-2 font-mono text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
      <div>ice <b className="text-[var(--color-fg-muted)]">{stat.ice}</b> · conn <b className="text-[var(--color-fg-muted)]">{stat.conn}</b> · gather <b className="text-[var(--color-fg-muted)]">{stat.gathering}</b></div>
      <div>mine <b className="text-[var(--color-fg-muted)]">{stat.local}</b> · theirs <b className="text-[var(--color-fg-muted)]">{stat.remote}</b>{stat.mdns ? ' · mdns' : ''}</div>
    </div>
  );
}

function PrivacyNote() {
  return (
    <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
      <span>Files travel directly between the two devices over an encrypted connection. They never pass through or get stored on our servers. Both devices need to stay open during the transfer.</span>
    </div>
  );
}
