'use client';

import * as React from 'react';
import { Download, Loader2, LockOpen, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';

export default function PdfUnlockTool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState(false);

  const run = async () => {
    if (!item) return;
    setBusy(true); setError(''); setDone(false);
    try {
      const { PDFDocument } = await import('@cantoo/pdf-lib');
      // Loading with the password decrypts; saving without encrypt() drops protection.
      const doc = await PDFDocument.load(item.buffer, { password: password || undefined, ignoreEncryption: false });
      const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = item.file.name.replace(/\.[^.]+$/, '') + '-unlocked.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      setDone(true);
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/password/i.test(msg) || /encrypt/i.test(msg)) {
        setError('Wrong password, or this PDF uses a protection method that needs the correct password to open.');
      } else {
        setError(msg || 'Could not unlock this PDF.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!item && <PdfDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <LockOpen className="h-4 w-4 text-[var(--color-cat-pdf)]" />
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <button type="button" onClick={() => { setItem(null); setDone(false); setPassword(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change
            </button>
          </div>

          <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This only works for PDFs you can already open. Enter the password if the file asks for one. It can&apos;t crack a password you don&apos;t know.
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Password (if any)</div>
              <div className="relative mt-2">
                <input type={show ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank if there's no open password"
                  className="w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 pr-10 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-pdf)]" />
                <button type="button" onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <aside className="space-y-3">
              <button type="button" onClick={run} disabled={busy}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Unlocking…' : 'Unlock & Download'}
              </button>
              {done && <div className="text-[12px] text-green-600">Done — saved an unprotected copy.</div>}
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
