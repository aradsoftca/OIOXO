'use client';

import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { setRecent } from '@/lib/storage/recent';
import { cn } from '@/lib/cn';

type Algo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

const SUBTLE: Algo[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

export default function HashTool() {
  const [input, setInput] = React.useState('');
  const [results, setResults] = React.useState<Record<string, string>>({});
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Paste anywhere → hash it (unless the user is typing in another field).
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae === inputRef.current) return; // native paste into the box
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      const text = e.clipboardData?.getData('text/plain');
      if (text) { e.preventDefault(); setInput(text); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const enc = new TextEncoder().encode(input);

    Promise.all([
      md5(input),
      ...SUBTLE.map((algo) =>
        crypto.subtle.digest(algo, enc).then((b) => bytesHex(new Uint8Array(b))),
      ),
    ]).then(([md5h, sha1, sha256, sha384, sha512]) => {
      if (cancelled) return;
      const next = { 'MD5': md5h, 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512 };
      setResults(next);
      setRecent('dev-hash', textThumb(`${sha256.slice(0, 32)}…`));
    }).catch(() => { /* subtle.digest very rarely rejects; ignore */ });

    return () => { cancelled = true; };
  }, [input]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <div
        className={cn('tile-surface relative', dragging && 'ring-2 ring-[var(--color-cat-dev)]')}
        data-neutral="true"
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer?.files?.[0];
          if (file) file.text().then(setInput).catch(() => { /* binary */ });
        }}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-surface-1)]/85 text-[13px] font-semibold text-[var(--color-fg)]">
            Drop a file to hash it
          </div>
        )}
        <div className="tile-content gap-3 !justify-start">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Input
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && input) { e.preventDefault(); e.stopPropagation(); setInput(''); }
            }}
            placeholder="Type, paste, or drop a file to hash"
            spellCheck={false}
            className="h-80 w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-2">
        {(['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as Algo[]).map((algo) => (
          <HashRow key={algo} algo={algo} value={results[algo] ?? ''} />
        ))}
      </div>
    </div>
  );
}

function HashRow({ algo, value }: { algo: Algo; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="tile-surface" data-neutral="true">
      <div className="tile-content !flex-row items-center gap-3 !justify-between py-3">
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ background: `var(--color-cat-dev)` }}
          >
            {algo}
          </span>
          <span className="select-all break-all font-mono text-[12px] text-[var(--color-fg)]">
            {value || <span className="text-[var(--color-fg-subtle)]">—</span>}
          </span>
        </div>
        <button
          type="button"
          disabled={!value}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch { /* iframe / permission denied */ }
          }}
          className={cn(
            'flex h-7 w-7 items-center justify-center text-[var(--color-fg-subtle)] transition',
            value && 'hover:bg-black/[0.06] hover:text-[var(--color-fg)]',
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[var(--color-cat-generator)]" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function bytesHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

// Minimal MD5 — WebCrypto doesn't ship MD5 because it's broken. We include it
// because devs frequently need it for legacy checksums; users should NOT use
// MD5 for any security purpose.
async function md5(input: string): Promise<string> {
  return md5Sync(new TextEncoder().encode(input));
}

function md5Sync(bytes: Uint8Array): string {
  // Adapted from RFC 1321 reference. Compact for size; not for re-use elsewhere.
  function add32(a: number, b: number) { return (a + b) & 0xffffffff; }
  function rol(x: number, n: number) { return (x << n) | (x >>> (32 - n)); }
  function FF(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return add32(rol(add32(add32(a, (b & c) | (~b & d)), add32(x, t)), s), b);
  }
  function GG(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return add32(rol(add32(add32(a, (b & d) | (c & ~d)), add32(x, t)), s), b);
  }
  function HH(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return add32(rol(add32(add32(a, b ^ c ^ d), add32(x, t)), s), b);
  }
  function II(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return add32(rol(add32(add32(a, c ^ (b | ~d)), add32(x, t)), s), b);
  }

  const len = bytes.length;
  const nBits = len * 8;
  // pad
  const padded = new Uint8Array(((len + 8) >>> 6) * 64 + 64);
  padded.set(bytes);
  padded[len] = 0x80;
  // little-endian 64-bit length
  padded[padded.length - 8] = nBits & 0xff;
  padded[padded.length - 7] = (nBits >>> 8) & 0xff;
  padded[padded.length - 6] = (nBits >>> 16) & 0xff;
  padded[padded.length - 5] = (nBits >>> 24) & 0xff;

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const x = new Int32Array(16);
  for (let i = 0; i < padded.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      const k = i + j * 4;
      x[j] = padded[k] | (padded[k + 1] << 8) | (padded[k + 2] << 16) | (padded[k + 3] << 24);
    }
    const aa = a, bb = b, cc = c, dd = d;
    a = FF(a, b, c, d, x[ 0],  7, -680876936);
    d = FF(d, a, b, c, x[ 1], 12, -389564586);
    c = FF(c, d, a, b, x[ 2], 17,  606105819);
    b = FF(b, c, d, a, x[ 3], 22, -1044525330);
    a = FF(a, b, c, d, x[ 4],  7, -176418897);
    d = FF(d, a, b, c, x[ 5], 12,  1200080426);
    c = FF(c, d, a, b, x[ 6], 17, -1473231341);
    b = FF(b, c, d, a, x[ 7], 22, -45705983);
    a = FF(a, b, c, d, x[ 8],  7,  1770035416);
    d = FF(d, a, b, c, x[ 9], 12, -1958414417);
    c = FF(c, d, a, b, x[10], 17, -42063);
    b = FF(b, c, d, a, x[11], 22, -1990404162);
    a = FF(a, b, c, d, x[12],  7,  1804603682);
    d = FF(d, a, b, c, x[13], 12, -40341101);
    c = FF(c, d, a, b, x[14], 17, -1502002290);
    b = FF(b, c, d, a, x[15], 22,  1236535329);

    a = GG(a, b, c, d, x[ 1],  5, -165796510);
    d = GG(d, a, b, c, x[ 6],  9, -1069501632);
    c = GG(c, d, a, b, x[11], 14,  643717713);
    b = GG(b, c, d, a, x[ 0], 20, -373897302);
    a = GG(a, b, c, d, x[ 5],  5, -701558691);
    d = GG(d, a, b, c, x[10],  9,  38016083);
    c = GG(c, d, a, b, x[15], 14, -660478335);
    b = GG(b, c, d, a, x[ 4], 20, -405537848);
    a = GG(a, b, c, d, x[ 9],  5,  568446438);
    d = GG(d, a, b, c, x[14],  9, -1019803690);
    c = GG(c, d, a, b, x[ 3], 14, -187363961);
    b = GG(b, c, d, a, x[ 8], 20,  1163531501);
    a = GG(a, b, c, d, x[13],  5, -1444681467);
    d = GG(d, a, b, c, x[ 2],  9, -51403784);
    c = GG(c, d, a, b, x[ 7], 14,  1735328473);
    b = GG(b, c, d, a, x[12], 20, -1926607734);

    a = HH(a, b, c, d, x[ 5],  4, -378558);
    d = HH(d, a, b, c, x[ 8], 11, -2022574463);
    c = HH(c, d, a, b, x[11], 16,  1839030562);
    b = HH(b, c, d, a, x[14], 23, -35309556);
    a = HH(a, b, c, d, x[ 1],  4, -1530992060);
    d = HH(d, a, b, c, x[ 4], 11,  1272893353);
    c = HH(c, d, a, b, x[ 7], 16, -155497632);
    b = HH(b, c, d, a, x[10], 23, -1094730640);
    a = HH(a, b, c, d, x[13],  4,  681279174);
    d = HH(d, a, b, c, x[ 0], 11, -358537222);
    c = HH(c, d, a, b, x[ 3], 16, -722521979);
    b = HH(b, c, d, a, x[ 6], 23,  76029189);
    a = HH(a, b, c, d, x[ 9],  4, -640364487);
    d = HH(d, a, b, c, x[12], 11, -421815835);
    c = HH(c, d, a, b, x[15], 16,  530742520);
    b = HH(b, c, d, a, x[ 2], 23, -995338651);

    a = II(a, b, c, d, x[ 0],  6, -198630844);
    d = II(d, a, b, c, x[ 7], 10,  1126891415);
    c = II(c, d, a, b, x[14], 15, -1416354905);
    b = II(b, c, d, a, x[ 5], 21, -57434055);
    a = II(a, b, c, d, x[12],  6,  1700485571);
    d = II(d, a, b, c, x[ 3], 10, -1894986606);
    c = II(c, d, a, b, x[10], 15, -1051523);
    b = II(b, c, d, a, x[ 1], 21, -2054922799);
    a = II(a, b, c, d, x[ 8],  6,  1873313359);
    d = II(d, a, b, c, x[15], 10, -30611744);
    c = II(c, d, a, b, x[ 6], 15, -1560198380);
    b = II(b, c, d, a, x[13], 21,  1309151649);
    a = II(a, b, c, d, x[ 4],  6, -145523070);
    d = II(d, a, b, c, x[11], 10, -1120210379);
    c = II(c, d, a, b, x[ 2], 15,  718787259);
    b = II(b, c, d, a, x[ 9], 21, -343485551);

    a = add32(a, aa); b = add32(b, bb); c = add32(c, cc); d = add32(d, dd);
  }
  const toHex = (n: number) => {
    let s = '';
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return s;
  };
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

function textThumb(text: string): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 192; canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = 'oklch(95% 0.012 80)'; ctx.fillRect(0, 0, 192, 144);
  ctx.fillStyle = 'oklch(35% 0.008 80)';
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.fillText(text, 8, 80);
  return canvas.toDataURL('image/jpeg', 0.55);
}
