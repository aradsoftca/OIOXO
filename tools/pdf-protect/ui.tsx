'use client';
import { stampPdfFooter } from '@/engines/pdf';

import * as React from 'react';
import { Download, Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';

export default function PdfProtectTool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [allowPrint, setAllowPrint] = React.useState(true);
  const [allowCopy, setAllowCopy] = React.useState(true);
  const [allowModify, setAllowModify] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canRun = !!item && password.length >= 1 && password === confirm;

  const run = async () => {
    if (!item || !canRun) return;
    setBusy(true); setError(''); setDone(false);
    try {
      const { PDFDocument } = await import('@cantoo/pdf-lib');
      const doc = await PDFDocument.load(item.buffer, { ignoreEncryption: true });
      doc.encrypt({
        userPassword: password,
        ownerPassword: password,
        permissions: {
          printing: allowPrint ? 'highResolution' : undefined,
          copying: allowCopy,
          modifying: allowModify,
        },
      });
      await stampPdfFooter(doc); const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const a = document.createElement('a');
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = item.file.name.replace(/\.[^.]+$/, '') + '-protected.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke — mobile Safari/Firefox can abort the download if the
      // blob URL is torn down before the stream starts.
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
      setDone(true);
    } catch (e) {
      setError((e as Error).message || 'Could not protect this PDF.');
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
            <Lock className="h-4 w-4 text-[var(--color-cat-pdf)]" />
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <button type="button" onClick={() => { setItem(null); setDone(false); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Password</div>
                <div className="relative mt-2">
                  <input type={show ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a password"
                    className="w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 pr-10 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-pdf)]" />
                  <button type="button" onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Confirm password</div>
                <input type={show ? 'text' : 'password'} value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter the password"
                  className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-pdf)]" />
                {mismatch && <div className="mt-1 text-[11px] text-red-600">Passwords don&apos;t match.</div>}
              </div>
              <div className="border-t border-black/[0.06] pt-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Allow readers to</div>
                <div className="mt-2 space-y-2">
                  {[
                    { label: 'Print', v: allowPrint, set: setAllowPrint },
                    { label: 'Copy text & images', v: allowCopy, set: setAllowCopy },
                    { label: 'Edit the document', v: allowModify, set: setAllowModify },
                  ].map((row) => (
                    <label key={row.label} className="flex items-center justify-between text-[12px] text-[var(--color-fg)]">
                      <span>{row.label}</span>
                      <input type="checkbox" checked={row.v} onChange={(e) => row.set(e.target.checked)} className="h-4 w-4" />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
                The password is needed to open the file. Keep it somewhere safe — there is no way to recover a lost password.
              </div>
              <button type="button" onClick={run} disabled={busy || !canRun}
                className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {busy ? 'Protecting…' : 'Protect & Download'}
              </button>
              {done && <div className="text-[12px] text-green-600">Done — your protected PDF was saved.</div>}
              {error && <div className="text-[12px] text-red-600">{error}</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
