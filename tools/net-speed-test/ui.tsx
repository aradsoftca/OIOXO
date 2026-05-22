'use client';
import { powFetch } from '@/lib/pow-client';

import * as React from 'react';
import { Gauge, Download, Upload, Activity, Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/cn';

type Phase = 'idle' | 'ping' | 'download' | 'upload' | 'done';

async function measurePing(rounds = 5): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    await powFetch(`/api/speedtest?bytes=0&_=${Math.random()}`, { cache: 'no-store' });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]; // median
}

// Download progressively larger payloads; report Mbps from the largest sample.
async function measureDownload(onLive: (mbps: number) => void): Promise<number> {
  let best = 0;
  for (const mb of [4, 12, 30]) {
    const bytes = mb * 1024 * 1024;
    const t0 = performance.now();
    const res = await powFetch(`/api/speedtest?bytes=${bytes}&_=${Math.random()}`, { cache: 'no-store' });
    const reader = res.body!.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value!.length;
      const secs = (performance.now() - t0) / 1000;
      if (secs > 0.15) onLive((got * 8) / secs / 1e6);
    }
    const secs = (performance.now() - t0) / 1000;
    best = Math.max(best, (got * 8) / secs / 1e6);
  }
  return best;
}

async function measureUpload(onLive: (mbps: number) => void): Promise<number> {
  const bytes = 16 * 1024 * 1024;
  const payload = new Uint8Array(bytes); // zeros are fine; identity-encoded
  const t0 = performance.now();
  await powFetch('/api/speedtest', { method: 'POST', body: payload, cache: 'no-store' });
  const secs = (performance.now() - t0) / 1000;
  const mbps = (bytes * 8) / secs / 1e6;
  onLive(mbps);
  return mbps;
}

function fmt(n: number): string { return n >= 100 ? n.toFixed(0) : n.toFixed(1); }

export default function SpeedTestTool() {
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [live, setLive] = React.useState(0);
  const [ping, setPing] = React.useState<number | null>(null);
  const [down, setDown] = React.useState<number | null>(null);
  const [up, setUp] = React.useState<number | null>(null);

  const run = async () => {
    setPing(null); setDown(null); setUp(null); setLive(0);
    try {
      setPhase('ping'); setPing(await measurePing());
      setPhase('download'); setDown(await measureDownload(setLive)); setLive(0);
      setPhase('upload'); setUp(await measureUpload(setLive)); setLive(0);
      setPhase('done');
    } catch {
      setPhase('done');
    }
  };

  const running = phase !== 'idle' && phase !== 'done';
  const bigValue = phase === 'download' || phase === 'upload' ? live
    : phase === 'done' ? (down ?? 0) : 0;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="relative grid place-items-center border border-black/[0.08] bg-[var(--color-surface-1)] py-12">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          {phase === 'idle' && 'Ready'}
          {phase === 'ping' && 'Measuring latency…'}
          {phase === 'download' && 'Download'}
          {phase === 'upload' && 'Upload'}
          {phase === 'done' && 'Download'}
        </div>
        <div className="mt-1 font-mono text-[clamp(48px,14vw,84px)] font-bold leading-none tracking-tight text-[var(--color-fg)]">
          {fmt(bigValue)}
        </div>
        <div className="text-[13px] text-[var(--color-fg-muted)]">Mbps</div>
        <Gauge className={cn('absolute right-4 top-4 h-5 w-5', running ? 'animate-pulse text-[var(--color-cat-ip)]' : 'text-[var(--color-fg-subtle)]')} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Activity, label: 'Ping', value: ping != null ? `${ping.toFixed(0)} ms` : '—' },
          { icon: Download, label: 'Download', value: down != null ? `${fmt(down)} Mbps` : '—' },
          { icon: Upload, label: 'Upload', value: up != null ? `${fmt(up)} Mbps` : '—' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-center">
            <Icon className="mx-auto h-4 w-4 text-[var(--color-cat-ip)]" />
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{label}</div>
            <div className="mt-0.5 font-mono text-[14px] font-semibold text-[var(--color-fg)]">{value}</div>
          </div>
        ))}
      </div>

      <button type="button" onClick={run} disabled={running}
        className={cn('flex w-full items-center justify-center gap-2 py-4 text-[14px] font-semibold transition',
          running ? 'bg-black/[0.06] text-[var(--color-fg-subtle)]' : 'bg-[var(--color-cat-ip)] text-white shadow-lg hover:brightness-110')}>
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {phase === 'idle' ? 'Start test' : phase === 'done' ? 'Test again' : 'Testing…'}
      </button>

      <p className="text-center text-[11px] text-[var(--color-fg-subtle)]">
        Measured directly against our own server — no third-party speed-test provider. Results reflect this browser&apos;s connection right now and may differ from your plan&apos;s rated speed.
      </p>
    </div>
  );
}
