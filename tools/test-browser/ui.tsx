'use client';
import * as React from 'react';
import { Check, X } from 'lucide-react';

interface Row { label: string; value: React.ReactNode }

export default function BrowserCheckup() {
  const [info, setInfo] = React.useState<{ groups: { title: string; rows: Row[] }[] } | null>(null);

  React.useEffect(() => {
    const yes = (b: boolean) => b ? <span className="inline-flex items-center gap-1 text-green-600"><Check className="h-3.5 w-3.5" /> Supported</span> : <span className="inline-flex items-center gap-1 text-[var(--color-fg-muted)]"><X className="h-3.5 w-3.5" /> No</span>;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } };
    let webgl = false, webgl2 = false;
    try { const c = document.createElement('canvas'); webgl = !!c.getContext('webgl'); webgl2 = !!c.getContext('webgl2'); } catch { /* */ }
    const groups = [
      { title: 'Device', rows: [
        { label: 'Screen', value: `${screen.width}×${screen.height} @ ${window.devicePixelRatio}×` },
        { label: 'Window', value: `${window.innerWidth}×${window.innerHeight}` },
        { label: 'CPU cores', value: String(nav.hardwareConcurrency || '—') },
        { label: 'Device memory', value: nav.deviceMemory ? `~${nav.deviceMemory} GB` : '—' },
        { label: 'Touch points', value: String(nav.maxTouchPoints || 0) },
        { label: 'Connection', value: nav.connection?.effectiveType || '—' },
        { label: 'Language', value: navigator.language },
        { label: 'Time zone', value: Intl.DateTimeFormat().resolvedOptions().timeZone },
      ] },
      { title: 'Capabilities', rows: [
        { label: 'WebGL', value: yes(webgl) },
        { label: 'WebGL2', value: yes(webgl2) },
        { label: 'WebGPU', value: yes('gpu' in navigator) },
        { label: 'WebAssembly', value: yes(typeof WebAssembly !== 'undefined') },
        { label: 'Web Workers', value: yes(typeof Worker !== 'undefined') },
        { label: 'Service Worker', value: yes('serviceWorker' in navigator) },
        { label: 'WebRTC', value: yes(typeof RTCPeerConnection !== 'undefined') },
        { label: 'Web Audio', value: yes(typeof AudioContext !== 'undefined' || 'webkitAudioContext' in window) },
        { label: 'Camera / Mic', value: yes(!!navigator.mediaDevices?.getUserMedia) },
        { label: 'Notifications', value: yes('Notification' in window) },
        { label: 'Clipboard', value: yes(!!navigator.clipboard) },
      ] },
      { title: 'Privacy', rows: [
        { label: 'Cookies enabled', value: yes(navigator.cookieEnabled) },
        { label: 'Do Not Track', value: navigator.doNotTrack === '1' ? 'On' : 'Off' },
        { label: 'Online', value: yes(navigator.onLine) },
        { label: 'User agent', value: <span className="break-all text-[11px]">{navigator.userAgent}</span> },
      ] },
    ];
    setInfo({ groups });
  }, []);

  if (!info) return <div className="h-40 animate-pulse bg-[var(--color-surface-1)]" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {info.groups.map((g) => (
        <div key={g.title} className="border border-black/[0.08] bg-[var(--color-surface-1)]">
          <div className="border-b border-black/[0.06] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{g.title}</div>
          <div className="divide-y divide-black/[0.04]">
            {g.rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-3 px-3 py-2 text-[12px]">
                <span className="text-[var(--color-fg-muted)]">{r.label}</span>
                <span className="text-right font-medium text-[var(--color-fg)]">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
