'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock, ShieldCheck, Copy, Check, Loader2, Flame, AlertTriangle, Eye } from 'lucide-react';

// ---- base64url helpers (loop-based; safe for larger payloads) ----
function toB64url(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str: string): ArrayBuffer {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a.buffer;
}

const TTLS = [
  { label: '1 hour', ms: 3600_000 },
  { label: '1 day', ms: 86_400_000 },
  { label: '7 days', ms: 7 * 86_400_000 },
  { label: '30 days', ms: 30 * 86_400_000 },
];

export default function NoteApp() {
  const params = useSearchParams();
  const id = params.get('id');
  return id ? <Read id={id} /> : <Create />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-dev)] text-white"><Lock className="h-5 w-5" /></div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Encrypted Note</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">Encrypted in your browser. We only ever store unreadable ciphertext.</p>
        </div>
      </header>
      {children}
      <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
        <span>Zero-knowledge: the note is encrypted with AES-256 in your browser. The decryption key lives only in the link after the “#” and is never sent to our server — so we can never read your note.</span>
      </div>
    </div>
  );
}

function Create() {
  const [text, setText] = React.useState('');
  const [oneTime, setOneTime] = React.useState(true);
  const [ttl, setTtl] = React.useState(TTLS[1].ms);
  const [busy, setBusy] = React.useState(false);
  const [link, setLink] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState('');

  const create = async () => {
    if (!text.trim()) return;
    setBusy(true); setError(''); setLink('');
    try {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
      const rawKey = await crypto.subtle.exportKey('raw', key);
      const res = await fetch('/api/note', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ct: toB64url(ct), iv: toB64url(iv.buffer), oneTime, ttlMs: ttl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setLink(`${window.location.origin}/note?id=${data.id}#${toB64url(rawKey)}`);
    } catch (e) { setError((e as Error).message || 'Could not create the note.'); }
    finally { setBusy(false); }
  };

  const copy = () => {
    navigator.clipboard?.writeText(link).catch(() => { /* permission denied */ });
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Shell>
      {!link ? (
        <div className="space-y-4">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your secret note, password, or message…" className="h-48 w-full resize-none border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[14px] focus:border-[var(--color-cat-dev)] focus:outline-none" />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-fg)]">
              <input type="checkbox" checked={oneTime} onChange={(e) => setOneTime(e.target.checked)} className="h-4 w-4" />
              <Flame className="h-4 w-4 text-[var(--color-cat-pdf)]" /> Burn after reading
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-fg-muted)]">
              Expires
              <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))} className="border border-black/[0.08] bg-[var(--color-surface-1)] px-2 py-1 text-[13px] focus:outline-none">
                {TTLS.map((t) => <option key={t.ms} value={t.ms}>{t.label}</option>)}
              </select>
            </label>
          </div>
          {error && <div className="text-[13px] text-red-600">{error}</div>}
          <button type="button" onClick={create} disabled={!text.trim() || busy} className="flex items-center justify-center gap-2 bg-[var(--color-cat-dev)] px-6 py-3 text-[14px] font-semibold text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Create encrypted link
          </button>
        </div>
      ) : (
        <div className="space-y-3 border border-[var(--color-cat-dev)] bg-[var(--color-cat-dev)]/[0.06] p-4">
          <div className="text-[13px] font-semibold text-[var(--color-fg)]">Share this link — it carries the decryption key after the “#”:</div>
          <div className="break-all rounded border border-black/[0.06] bg-white/60 px-3 py-2 font-mono text-[12px] text-[var(--color-fg)]">{link}</div>
          <button type="button" onClick={copy} className="flex items-center justify-center gap-2 bg-[var(--color-cat-dev)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
          </button>
          <p className="text-[11px] text-[var(--color-fg-subtle)]">{oneTime ? 'This note self-destructs the first time it’s opened.' : 'Anyone with the link can read it until it expires.'} Don’t lose the part after “#” — without it the note can’t be decrypted, even by us.</p>
          <button type="button" onClick={() => { setLink(''); setText(''); }} className="text-[12px] text-[var(--color-fg-muted)] underline-offset-2 hover:underline">Create another</button>
        </div>
      )}
    </Shell>
  );
}

function Read({ id }: { id: string }) {
  const [state, setState] = React.useState<'loading' | 'ok' | 'gone' | 'error'>('loading');
  const [text, setText] = React.useState('');
  const [oneTime, setOneTime] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const keyB64 = window.location.hash.slice(1);
        if (!keyB64) { setState('error'); return; }
        const res = await fetch(`/api/note?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (res.status === 404) { setState('gone'); return; }
        if (!res.ok) { setState('error'); return; }
        const { ct, iv, oneTime: ot, burnToken } = await res.json();
        setOneTime(!!ot);
        const key = await crypto.subtle.importKey('raw', fromB64url(keyB64), { name: 'AES-GCM' }, false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(fromB64url(iv)) }, key, fromB64url(ct));
        setText(new TextDecoder().decode(plain));
        setState('ok');
        // Confirm the burn now that we know decrypt succeeded. If the key
        // fragment was stripped by a chat client, decrypt throws and we
        // skip this — the server will sweep the staged burn after 30s.
        if (burnToken) {
          void fetch(`/api/note?id=${encodeURIComponent(id)}&token=${encodeURIComponent(burnToken)}`, { method: 'DELETE' }).catch(() => { /* */ });
        }
      } catch { setState('error'); }
    })();
  }, [id]);

  const copy = () => {
    // Catch the rejection: clipboard.writeText rejects on permission denied
    // (iframe / insecure context) and would surface as an unhandled promise
    // rejection. The visual "Copied" state is best-effort either way.
    navigator.clipboard?.writeText(text).catch(() => { /* */ });
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Shell>
      {state === 'loading' && <div className="flex items-center gap-2 py-12 text-[var(--color-fg-muted)]"><Loader2 className="h-5 w-5 animate-spin" /> Decrypting…</div>}
      {state === 'gone' && (
        <div className="border border-amber-500/30 bg-amber-50/40 p-6"><div className="flex items-center gap-2 text-[14px] font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" /> This note is gone</div><p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">It was already opened (burn-after-reading) or has expired. Ask the sender for a new one.</p></div>
      )}
      {state === 'error' && (
        <div className="border border-red-500/30 bg-red-50/40 p-6"><div className="flex items-center gap-2 text-[14px] font-bold"><AlertTriangle className="h-4 w-4 text-red-600" /> Couldn’t decrypt</div><p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">The link is incomplete or corrupted — the key after “#” is missing or wrong.</p></div>
      )}
      {state === 'ok' && (
        <div className="space-y-3">
          {oneTime && <div className="flex items-center gap-2 border border-[var(--color-cat-pdf)]/30 bg-[var(--color-cat-pdf)]/[0.06] px-3 py-2 text-[12px] text-[var(--color-fg-muted)]"><Flame className="h-4 w-4 text-[var(--color-cat-pdf)]" /> This note has now self-destructed — it can’t be opened again.</div>}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]"><Eye className="h-3.5 w-3.5" /> Decrypted note</div>
            <button type="button" onClick={copy} className="flex items-center gap-1 text-[12px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">{copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />} Copy</button>
          </div>
          <div className="whitespace-pre-wrap break-words border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[14px] leading-relaxed text-[var(--color-fg)]">{text}</div>
        </div>
      )}
    </Shell>
  );
}
