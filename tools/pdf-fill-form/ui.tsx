'use client';

import * as React from 'react';
import { Download, Loader2, AlertTriangle } from 'lucide-react';
import { PdfDrop, type PdfFileItem } from '@/components/tool/PdfDrop';

type FieldKind = 'text' | 'check' | 'radio' | 'dropdown' | 'optionlist' | 'button' | 'signature' | 'unknown';

interface FieldInfo {
  name: string;
  kind: FieldKind;
  value: string | boolean | string[];
  options?: string[];
  multiline?: boolean;
}

export default function PdfFillFormTool() {
  const [item, setItem] = React.useState<PdfFileItem | null>(null);
  const [fields, setFields] = React.useState<FieldInfo[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [flatten, setFlatten] = React.useState(false);
  const [error, setError] = React.useState('');
  const [info, setInfo] = React.useState('');

  const read = async (it: PdfFileItem) => {
    setBusy(true); setError(''); setInfo(''); setFields([]);
    try {
      const lib = await import('pdf-lib');
      const doc = await lib.PDFDocument.load(it.buffer, { ignoreEncryption: true });
      const form = doc.getForm();
      const raw = form.getFields();
      if (raw.length === 0) {
        setInfo('This PDF has no fillable form fields. Pages with hand-drawn boxes can be marked up with the Annotate Image tool instead.');
        return;
      }
      const out: FieldInfo[] = raw.map((field) => {
        const name = field.getName();
        if (field instanceof lib.PDFTextField) {
          return { name, kind: 'text', value: field.getText() ?? '', multiline: field.isMultiline() };
        }
        if (field instanceof lib.PDFCheckBox) {
          return { name, kind: 'check', value: field.isChecked() };
        }
        if (field instanceof lib.PDFRadioGroup) {
          return { name, kind: 'radio', value: field.getSelected() ?? '', options: field.getOptions() };
        }
        if (field instanceof lib.PDFDropdown) {
          return { name, kind: 'dropdown', value: field.getSelected()[0] ?? '', options: field.getOptions() };
        }
        if (field instanceof lib.PDFOptionList) {
          return { name, kind: 'optionlist', value: field.getSelected(), options: field.getOptions() };
        }
        if (field instanceof lib.PDFButton) return { name, kind: 'button', value: '' };
        if (field instanceof lib.PDFSignature) return { name, kind: 'signature', value: '' };
        return { name, kind: 'unknown', value: '' };
      });
      setFields(out);
    } catch (e) {
      setError((e as Error).message || 'Could not read this PDF.');
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => { if (item) void read(item); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [item]);

  const setField = (name: string, value: FieldInfo['value']) => {
    setFields((prev) => prev.map((f) => f.name === name ? { ...f, value } : f));
  };

  const save = async () => {
    if (!item) return;
    setBusy(true); setError('');
    try {
      const lib = await import('pdf-lib');
      const doc = await lib.PDFDocument.load(item.buffer, { ignoreEncryption: true });
      const form = doc.getForm();
      for (const f of fields) {
        try {
          if (f.kind === 'text') form.getTextField(f.name).setText(typeof f.value === 'string' ? f.value : '');
          else if (f.kind === 'check') {
            const cb = form.getCheckBox(f.name);
            f.value ? cb.check() : cb.uncheck();
          }
          else if (f.kind === 'radio' && typeof f.value === 'string' && f.value) form.getRadioGroup(f.name).select(f.value);
          else if (f.kind === 'dropdown' && typeof f.value === 'string' && f.value) form.getDropdown(f.name).select(f.value);
          else if (f.kind === 'optionlist' && Array.isArray(f.value)) form.getOptionList(f.name).select(f.value);
        } catch { /* skip read-only or invalid */ }
      }
      if (flatten) form.flatten();
      const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = item.file.name.replace(/\.[^.]+$/, '') + (flatten ? '-filled.pdf' : '-edited.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message);
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
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            {fields.length > 0 && <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{fields.length} fields</span>}
            <button type="button" onClick={() => { setItem(null); setFields([]); setInfo(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Change
            </button>
          </div>

          {busy && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Working…
            </div>
          )}

          {info && (
            <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {info}
            </div>
          )}

          {error && <div className="text-[12px] text-red-600">{error}</div>}

          {fields.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="space-y-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                {fields.map((f) => (
                  <div key={f.name}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                      {f.name} <span className="ml-1 font-normal lowercase text-[var(--color-fg-subtle)]">{f.kind}</span>
                    </div>
                    {f.kind === 'text' && (
                      f.multiline ? (
                        <textarea
                          value={f.value as string}
                          onChange={(e) => setField(f.name, e.target.value)}
                          rows={3}
                          className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-pdf)]"
                        />
                      ) : (
                        <input
                          value={f.value as string}
                          onChange={(e) => setField(f.name, e.target.value)}
                          className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-pdf)]"
                        />
                      )
                    )}
                    {f.kind === 'check' && (
                      <label className="mt-1 flex items-center gap-2 text-[13px] text-[var(--color-fg)]">
                        <input type="checkbox" checked={!!f.value}
                          onChange={(e) => setField(f.name, e.target.checked)}
                          className="h-4 w-4" />
                        Checked
                      </label>
                    )}
                    {(f.kind === 'radio' || f.kind === 'dropdown') && (
                      <select
                        value={f.value as string}
                        onChange={(e) => setField(f.name, e.target.value)}
                        className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-pdf)]"
                      >
                        <option value="">— Select —</option>
                        {(f.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                    {f.kind === 'optionlist' && (
                      <select
                        multiple
                        value={f.value as string[]}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                          setField(f.name, selected);
                        }}
                        className="mt-1 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-pdf)]"
                      >
                        {(f.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                    {(f.kind === 'button' || f.kind === 'signature' || f.kind === 'unknown') && (
                      <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">Not editable here.</div>
                    )}
                  </div>
                ))}
              </div>

              <aside className="space-y-3">
                <label className="flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] text-[var(--color-fg)]">
                  <span className="font-medium">Flatten when saving</span>
                  <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} className="h-4 w-4" />
                </label>
                <div className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
                  Flatten bakes the values into the page so the file can no longer be edited as a form.
                </div>

                <button type="button" onClick={save} disabled={busy || !fields.length}
                  className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-pdf)] py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Save PDF
                </button>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
