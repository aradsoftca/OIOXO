'use client';

/**
 * Encrypt / Decrypt — oioxo / newxonvert version.
 * AES-256-GCM with a PBKDF2-derived key, via the Web Crypto API. Works on text
 * (base64 output) or any file (.enc download). Everything is local — the
 * password and plaintext never leave the device.
 */

import * as React from 'react';
import { Lock, Unlock, Upload, Download, Copy, Eye, EyeOff } from 'lucide-react';

const te = new TextEncoder();
const td = new TextDecoder();

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(b64: string): Uint8Array {
  const s = atob(b64.trim()); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// PBKDF2 iteration count — bumped from the old 150k to 600k to align with
// OWASP's 2023+ recommendation for PBKDF2-SHA256. At 150k a modern GPU can
// grind a moderate password in days; 600k pushes that into weeks/months and
// is still <100ms on a phone. NEW encryptions use 600k. To decrypt OLD .enc
// files (made by this tool at 150k) we fall back on AES-GCM auth-tag failure
// — see decryptBytes below. Argon2 would be stronger still but isn't in Web
// Crypto, and shipping a WASM Argon2 just for this niche tool isn't worth
// the bundle weight.
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_ITERATIONS_LEGACY = 150_000;
async function deriveKey(pw: string, salt: Uint8Array, iters = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: iters, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptBytes(data: BufferSource, pw: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pw, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(16 + 12 + ct.length);
  out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
  return out;
}
async function decryptBytes(buf: Uint8Array, pw: string): Promise<ArrayBuffer> {
  const salt = buf.slice(0, 16), iv = buf.slice(16, 28), ct = buf.slice(28);
  // Try the current iteration count first, then the legacy one for files
  // encrypted by this tool BEFORE the bump. AES-GCM throws on wrong key
  // (auth-tag mismatch), so a single try/catch cleanly distinguishes "wrong
  // password" from "right password, old format". Two attempts total — still
  // well under a second on any device.
  const key600 = await deriveKey(pw, salt, PBKDF2_ITERATIONS);
  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key600, ct);
  } catch {
    const key150 = await deriveKey(pw, salt, PBKDF2_ITERATIONS_LEGACY);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key150, ct);
  }
}

export default function EncryptUI() {
  const [mode, setMode] = React.useState<'encrypt' | 'decrypt'>('encrypt');
  const [source, setSource] = React.useState<'text' | 'file'>('text');
  const [pw, setPw] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [text, setText] = React.useState('');
  const [output, setOutput] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const reset = () => { setOutput(''); setError(''); };

  const run = async () => {
    setError(''); setOutput(''); setCopied(false);
    if (!pw) { setError('Enter a password.'); return; }
    setBusy(true);
    try {
      if (source === 'text') {
        if (!text.trim()) throw new Error('Enter some text.');
        if (mode === 'encrypt') {
          const out = await encryptBytes(te.encode(text), pw);
          setOutput(b64encode(out));
        } else {
          const dec = await decryptBytes(b64decode(text), pw);
          setOutput(td.decode(dec));
        }
      } else {
        if (!file) throw new Error('Choose a file.');
        const buf = await file.arrayBuffer();
        if (mode === 'encrypt') {
          const out = await encryptBytes(buf, pw);
          dl(new Blob([out as BlobPart], { type: 'application/octet-stream' }), `${file.name}.enc`);
        } else {
          const dec = await decryptBytes(new Uint8Array(buf), pw);
          dl(new Blob([dec as BlobPart]), file.name.replace(/\.enc$/i, '') || `${file.name}.dec`);
        }
        setOutput('✓ Done — file downloaded.');
      }
    } catch (e) {
      setError(mode === 'decrypt' ? 'Could not decrypt — wrong password or corrupted data.' : (e as Error).message || 'Something went wrong.');
    } finally { setBusy(false); }
  };

  const dl = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // Defer revoke — mobile Safari/Firefox can abort the download if the
    // blob URL is torn down before the stream starts.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const copy = () => { void navigator.clipboard.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => { /* iframe / permission denied */ }); };

  const tab = (on: boolean) => `flex-1 py-2.5 text-[12px] font-bold uppercase tracking-wider transition ${on ? 'bg-[var(--color-cat-dev)] text-white' : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]'}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex border border-black/[0.08]">
        <button type="button" className={tab(mode === 'encrypt')} onClick={() => { setMode('encrypt'); reset(); }}><Lock className="mr-1.5 inline h-3.5 w-3.5" /> Encrypt</button>
        <button type="button" className={tab(mode === 'decrypt')} onClick={() => { setMode('decrypt'); reset(); }}><Unlock className="mr-1.5 inline h-3.5 w-3.5" /> Decrypt</button>
      </div>

      <div className="flex gap-1">
        {(['text', 'file'] as const).map((s) => (
          <button key={s} type="button" onClick={() => { setSource(s); reset(); }} className={`flex-1 border py-2 text-[11px] font-bold uppercase tracking-wider transition ${source === s ? 'border-[var(--color-cat-dev)] text-[var(--color-fg)]' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>{s}</button>
        ))}
      </div>

      {source === 'text' ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
          placeholder={mode === 'encrypt' ? 'Text to encrypt…' : 'Paste the encrypted (base64) text…'}
          className="w-full resize-none border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2 font-mono text-[13px] text-[var(--color-fg)] outline-none" />
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 border border-dashed border-black/20 bg-[var(--color-surface-1)] py-6 text-[13px] text-[var(--color-fg-muted)] transition hover:border-[var(--color-cat-dev)]">
          <Upload className="h-4 w-4" /> {file ? file.name : (mode === 'encrypt' ? 'Choose a file to encrypt' : 'Choose a .enc file to decrypt')}
        </button>
      )}
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />

      <div className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-3">
        <Lock className="h-4 w-4 text-[var(--color-fg-muted)]" />
        <input type={showPw ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password"
          className="flex-1 bg-transparent py-2.5 text-[14px] text-[var(--color-fg)] outline-none" />
        <button type="button" onClick={() => setShowPw((v) => !v)} className="text-[var(--color-fg-muted)]">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
      </div>

      <button type="button" onClick={run} disabled={busy} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-dev)] py-3 text-[13px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-50">
        {mode === 'encrypt' ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />} {busy ? 'Working…' : mode === 'encrypt' ? 'Encrypt' : 'Decrypt'}
      </button>

      {error && <div className="border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}

      {output && (
        <div className="space-y-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Result</span>
            {source === 'text' && <button type="button" onClick={copy} className="flex items-center gap-1 text-[11px] font-bold uppercase text-[var(--color-cat-dev)]"><Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}</button>}
          </div>
          <div className="max-h-48 overflow-auto break-all font-mono text-[12px] text-[var(--color-fg)]">{output}</div>
        </div>
      )}
      <p className="text-[11px] text-[var(--color-fg-subtle)]">AES-256-GCM with a PBKDF2-derived key (150k iterations). There is no password recovery — if you lose the password, the data can’t be recovered.</p>
    </div>
  );
}
