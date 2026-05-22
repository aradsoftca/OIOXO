'use client';
import { powFetch } from '@/lib/pow-client';

import * as React from 'react';
import { Loader2, Copy, Check, RefreshCw, MapPin, Globe, Network, CheckCircle2, AlertCircle, MapPinned } from 'lucide-react';

interface Geo {
  ip?: string;
  city?: string; region?: string; country?: string; countryCode?: string;
  postal?: string; latitude?: number; longitude?: number;
  org?: string; asn?: number; timezone?: string; reverseDns?: string;
}

// Our own STUN server (coturn on the Iceland box, STUN-only, no relay). Raw IP
// because the public hostname is proxied by Cloudflare, which only forwards
// HTTP — STUN is UDP and must hit the origin directly. IPv4 reflexive comes
// from here; IPv6 (when present) comes from the WebRTC host candidate.
const STUN = [{ urls: 'stun:194.247.182.248:3478' }];

/** Discover the browser's public IPv4 + IPv6 via WebRTC ICE candidates. */
function detectIps(timeoutMs = 5000): Promise<{ v4: string | null; v6: string | null }> {
  return new Promise((resolve) => {
    const found = { v4: null as string | null, v6: null as string | null };
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({ iceServers: STUN });
    } catch {
      resolve(found);
      return;
    }
    const done = () => { try { pc.close(); } catch { /* */ } resolve(found); };
    const timer = setTimeout(done, timeoutMs);

    pc.createDataChannel('');
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const ip = e.candidate.candidate.split(' ')[4] || '';
      if (!ip || ip.includes('.local')) return;
      const isV6 = ip.includes(':');
      // Skip private / link-local ranges.
      if (!isV6 && (ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith('169.254.'))) return;
      if (isV6 && (ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd') || ip === '::1')) return;
      if (isV6) { if (!found.v6) found.v6 = ip; } else if (!found.v4) found.v4 = ip;
      if (found.v4 && found.v6) { clearTimeout(timer); done(); }
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(timer); done(); }
    };
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(done);
  });
}

async function geolocate(ip: string): Promise<Geo | null> {
  try {
    const r = await powFetch('/api/net/geoip', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: ip }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export default function NetMyIpTool() {
  const [busy, setBusy] = React.useState(true);
  const [v4, setV4] = React.useState<string | null>(null);
  const [v6, setV6] = React.useState<string | null>(null);
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [copied, setCopied] = React.useState('');

  const load = React.useCallback(async () => {
    setBusy(true); setV4(null); setV6(null); setGeo(null);
    let { v4: a4, v6: a6 } = await detectIps();

    // Fallback: if WebRTC is blocked, ask the server what IP it saw.
    if (!a4 && !a6) {
      try {
        const d = await powFetch('/api/net/myip', { cache: 'no-store' }).then((r) => r.json());
        if (d.ip) { if (d.family === 'IPv6') a6 = d.ip; else a4 = d.ip; }
      } catch { /* */ }
    }
    setV4(a4); setV6(a6);

    // Geolocate against our own database (prefer IPv4).
    const primary = a4 || a6;
    if (primary) setGeo(await geolocate(primary));
    setBusy(false);
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const copy = async (v: string) => { await navigator.clipboard?.writeText(v); setCopied(v); setTimeout(() => setCopied(''), 1200); };
  const location = geo ? [geo.city, geo.region, geo.country].filter(Boolean).join(', ') : '';
  const dual = !!(v4 && v6);

  const IpRow = ({ label, ip, big }: { label: string; ip: string | null; big?: boolean }) => (
    <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</div>
      </div>
      {busy ? (
        <div className="mt-2 flex items-center gap-2 text-[var(--color-fg-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> detecting…</div>
      ) : ip ? (
        <button type="button" onClick={() => copy(ip)}
          className={`mt-1 flex items-center gap-3 font-mono font-bold tracking-tight text-[var(--color-fg)] transition hover:text-[var(--color-cat-ip)] ${big ? 'text-[clamp(20px,4vw,34px)]' : 'text-[clamp(14px,2.4vw,22px)]'}`}>
          <span className="break-all text-left">{ip}</span>
          {copied === ip ? <Check className="h-5 w-5 shrink-0 text-green-600" /> : <Copy className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />}
        </button>
      ) : (
        <div className="mt-2 text-[14px] text-[var(--color-fg-subtle)]">Not available on your network</div>
      )}
    </div>
  );

  const InfoCard = ({ title, icon: Icon, rows }: { title: string; icon: typeof Globe; rows: [string, unknown][] }) => {
    const filled = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (!filled.length) return null;
    return (
      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          <Icon className="h-3.5 w-3.5" /> {title}
        </div>
        <dl className="mt-2 space-y-1.5">
          {filled.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <dt className="text-[12px] text-[var(--color-fg-muted)]">{k}</dt>
              <dd className="truncate font-mono text-[12px] text-[var(--color-fg)]">{String(v)}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!busy && (
          <span className="inline-flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
            {dual ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Dual-stack</> : v4 ? 'IPv4 only' : v6 ? 'IPv6 only' : <><AlertCircle className="h-3.5 w-3.5" /> No public IP</>}
          </span>
        )}
        {location && <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-fg-muted)]"><MapPin className="h-3.5 w-3.5" /> {location}</span>}
        <button type="button" onClick={() => void load()} disabled={busy}
          className="ml-auto flex items-center gap-2 border border-black/[0.08] px-3 py-2 text-[12px] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)] disabled:opacity-60">
          <RefreshCw className={busy ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <IpRow label="IPv4" ip={v4} big />
        <IpRow label="IPv6" ip={v6} />
      </div>

      {geo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard title="Location" icon={Globe} rows={[
            ['City', geo.city],
            ['Region', geo.region],
            ['Country', `${geo.country ?? ''}${geo.countryCode ? ` (${geo.countryCode})` : ''}`.trim()],
            ['Postal', geo.postal],
            ['Coordinates', geo.latitude != null ? `${geo.latitude}, ${geo.longitude}` : undefined],
            ['Timezone', geo.timezone],
          ]} />
          <InfoCard title="Network" icon={Network} rows={[
            ['Organization', geo.org],
            ['ASN', geo.asn ? `AS${geo.asn}` : undefined],
            ['Reverse DNS', geo.reverseDns],
          ]} />
        </div>
      )}

      {geo?.latitude != null && geo?.longitude != null && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${geo.latitude}&mlon=${geo.longitude}#map=11/${geo.latitude}/${geo.longitude}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-2.5 text-[12px] font-medium text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
        >
          <MapPinned className="h-4 w-4" /> View approximate location on map
        </a>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
        Your addresses are detected in your browser; geolocation and reverse DNS run on our own server against a local database — no third-party API, nothing stored. Location is approximate (often your ISP&apos;s region, not your exact address). IP geolocation by <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--color-fg-muted)]">DB-IP</a>.
      </p>
    </div>
  );
}
