'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Upload, Copy, Check, Download, Send, Loader2, ShieldCheck, X, Link2, Wifi, RefreshCw } from 'lucide-react';
import {
  startSend, startReceive, formatBytes, runSelfTest,
  ERR_NO_DIRECT, ERR_EXPIRED, ERR_BLOCKED,
  type Phase, type Progress, type Transfer, type Stat, type SelfTest,
} from '@/lib/p2p/transfer';
import { useStagedInput } from '@/lib/ai/handoff';

const PHASE_LABEL: Record<Phase, string> = {
  waiting: 'Waiting for the other device…',
  connecting: 'Connecting…',
  transferring: 'Transferring…',
  done: 'Done',
  error: 'Something went wrong',
};

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
  const transferRef = React.useRef<Transfer | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const link = code && typeof window !== 'undefined' ? `${window.location.origin}/send?r=${code}` : '';

  React.useEffect(() => () => transferRef.current?.cancel(), []);

  React.useEffect(() => {
    if (!link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 }))
      .then((url) => { if (alive) setQr(url); }).catch(() => {});
    return () => { alive = false; };
  }, [link]);

  const begin = (picked: File[]) => {
    if (!picked.length) return;
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
    void navigator.clipboard?.writeText(link);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  if (!files.length) {
    return (
      <Shell>
        <div
          onDrop={(e) => { e.preventDefault(); begin(Array.from(e.dataTransfer.files)); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex aspect-[5/2] items-center justify-center border border-dashed border-black/[0.18] bg-[var(--color-surface-1)]"
        >
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
            <Upload className="h-6 w-6" />
            Drop files to send, or click to choose
          </button>
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={(e) => { if (e.target.files) begin(Array.from(e.target.files)); e.target.value = ''; }} />
        </div>
        <PrivacyNote />
      </Shell>
    );
  }

  return (
    <Shell>
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
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                {phase === 'done' ? <Check className="h-4 w-4 text-green-600" />
                  : <Loader2 className="h-4 w-4 animate-spin text-[var(--color-cat-convert)]" />}
                {PHASE_LABEL[phase]}
              </div>
              {prog && (phase === 'transferring' || phase === 'done') && (
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-[var(--color-fg-muted)]">
                    <span className="truncate">{prog.name}</span>
                    <span className="font-mono tabular-nums">{formatBytes(prog.bytesPerSec)}/s</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden bg-black/[0.08]">
                    <div className="h-full bg-[var(--color-cat-convert)] transition-[width] duration-150"
                      style={{ width: `${prog.total ? Math.round((prog.bytes / prog.total) * 100) : 0}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--color-fg-subtle)]">
                    File {prog.index + 1} of {prog.filesTotal} · {formatBytes(prog.bytes)} / {formatBytes(prog.total)}
                  </div>
                </div>
              )}
              {(phase === 'waiting' || phase === 'connecting') && <DiagLine stat={stat} />}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Share this link</div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code" className="mx-auto my-3 h-44 w-44 border border-black/[0.06] bg-white p-1" />
            )}
            <button type="button" onClick={copy}
              className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-muted)]">
              {link}
            </div>
            <div className="mt-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
              Open this link on the other device. Keep this tab open until the transfer finishes.
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
  const [done, setDone] = React.useState<{ name: string; url: string; size: number }[]>([]);
  const transferRef = React.useRef<Transfer | null>(null);

  React.useEffect(() => {
    const transfer = startReceive(code, {
      onPhase: (p, d) => { setPhase(p); if (d) setDetail(d); },
      onProgress: setProg,
      onStat: setStat,
      onFile: ({ name, blob }) => {
        const url = URL.createObjectURL(blob);
        setDone((prev) => [...prev, { name, url, size: blob.size }]);
      },
    });
    transferRef.current = transfer;
    return () => transfer.cancel();
  }, [code]);

  React.useEffect(() => () => { done.forEach((d) => URL.revokeObjectURL(d.url)); }, [done]);

  if (phase === 'error') {
    return (
      <Shell>
        <FailureCard code={detail} onRetry={() => window.location.reload()} retryLabel="Try again" />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-5">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          {phase === 'done' ? <Check className="h-4 w-4 text-green-600" />
            : <Loader2 className="h-4 w-4 animate-spin text-[var(--color-cat-convert)]" />}
          {PHASE_LABEL[phase]}
        </div>

        {phase === 'connecting' && <DiagLine stat={stat} />}

        {prog && phase === 'transferring' && (
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-[var(--color-fg-muted)]">
              <span className="truncate">{prog.name || 'Receiving…'}</span>
              <span className="font-mono tabular-nums">{formatBytes(prog.bytesPerSec)}/s</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden bg-black/[0.08]">
              <div className="h-full bg-[var(--color-cat-convert)] transition-[width] duration-150"
                style={{ width: `${prog.total ? Math.round((prog.bytes / prog.total) * 100) : 0}%` }} />
            </div>
          </div>
        )}

        {done.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {done.map((d, i) => (
              <li key={i} className="flex items-center gap-3 border border-black/[0.06] bg-white/40 px-3 py-2">
                <span className="flex-1 truncate font-mono text-[12px]">{d.name}</span>
                <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{formatBytes(d.size)}</span>
                <a href={d.url} download={d.name}
                  className="flex items-center gap-1.5 bg-[var(--color-cat-convert)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
                  <Download className="h-3.5 w-3.5" /> Save
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PrivacyNote />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
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
