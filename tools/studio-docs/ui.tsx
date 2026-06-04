'use client';

/**
 * Docs Studio — oioxo / newxonvert version.
 * A browser word processor: a rich-text canvas with a formatting toolbar, .docx
 * import (mammoth) and export to PDF / DOCX / HTML — all on-device.
 */

import * as React from 'react';
import { Upload, Download, Bold, Italic, Underline, List, ListOrdered, Link2, Heading1, Heading2, AlignLeft, AlignCenter, AlignRight, Search } from 'lucide-react';
import { docxToHtml, htmlToPdf } from '@/engines/document';
import { htmlToDocx } from '@/engines/doc/docx-write';
import { setRecent } from '@/lib/storage/recent';
import { sanitizeHtml } from '@/lib/safe-html';

export default function DocsStudioUI() {
  const ref = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [name, setName] = React.useState('document');
  const [busy, setBusy] = React.useState(false);

  const cmd = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
  };

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      if (/\.docx$/i.test(file.name)) {
        const html = await docxToHtml(file);
        // Sanitize before assigning to a contentEditable surface — mammoth's
        // HTML output is not guaranteed XSS-free, and an attacker-controlled
        // .docx could otherwise run arbitrary scripts in the editor.
        if (ref.current) ref.current.innerHTML = sanitizeHtml(html);
      } else {
        const txt = await file.text();
        const raw = /\.html?$/i.test(file.name) ? txt : `<p>${txt.replace(/\n/g, '</p><p>')}</p>`;
        if (ref.current) ref.current.innerHTML = sanitizeHtml(raw);
      }
      setName(file.name.replace(/\.[^.]+$/, '') || 'document');
    } catch {
      /* keep current content on a bad file */
    } finally {
      setBusy(false);
    }
  };

  const download = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setRecent('studio-docs', `${name}.${ext}`);
  };

  const exportPdf = async () => {
    if (!ref.current) return;
    setBusy(true);
    try { download(await htmlToPdf(ref.current.innerHTML, name), 'pdf'); }
    finally { setBusy(false); }
  };
  const exportDocx = async () => {
    if (!ref.current) return;
    setBusy(true);
    // Format-preserving: walk the DOM → real OOXML runs (bold/italic/underline/
    // color/headings/lists) instead of dropping to plain innerText.
    try { download(await htmlToDocx(ref.current.innerHTML), 'docx'); }
    finally { setBusy(false); }
  };

  // Find & replace across the document text.
  const [findOpen, setFindOpen] = React.useState(false);
  const [findText, setFindText] = React.useState('');
  const [replaceText, setReplaceText] = React.useState('');
  const doReplaceAll = () => {
    if (!ref.current || !findText) return;
    const walker = document.createTreeWalker(ref.current, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let nNode: Node | null;
    while ((nNode = walker.nextNode())) nodes.push(nNode as Text);
    let count = 0;
    const re = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    for (const tn of nodes) {
      if (re.test(tn.data)) { tn.data = tn.data.replace(re, () => { count++; return replaceText; }); }
    }
    setName(name); // no-op to keep state; content is live in the DOM
  };
  const exportHtml = () => {
    if (!ref.current) return;
    // Escape `name` for use inside <title> to avoid injection from the
    // (user-editable) document name field. The body is already sanitized at
    // import time and entered by the user via contentEditable.
    const escName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const doc = `<!doctype html><meta charset="utf-8"><title>${escName}</title><body>${ref.current.innerHTML}</body>`;
    download(new Blob([doc], { type: 'text/html' }), 'html');
  };

  const tb = 'flex h-8 w-8 items-center justify-center text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]';
  const btn = 'flex items-center gap-2 border border-black/[0.08] px-3 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-50';

  return (
    <div className="space-y-3">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Open
        </button>
        <input ref={fileRef} type="file" accept=".docx,.html,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
        <button type="button" className={btn} disabled={busy} onClick={exportPdf}><Download className="h-3.5 w-3.5" /> PDF</button>
        <button type="button" className={btn} disabled={busy} onClick={exportDocx}><Download className="h-3.5 w-3.5" /> DOCX</button>
        <button type="button" className={btn} disabled={busy} onClick={exportHtml}><Download className="h-3.5 w-3.5" /> HTML</button>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="ml-auto w-44 bg-transparent text-[13px] text-[var(--color-fg)] outline-none border-b border-black/[0.08] py-0.5" />
      </div>

      {/* formatting toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border border-black/[0.08] bg-[var(--color-surface-1)] px-2 py-1">
        <button type="button" className={tb} title="Bold" onClick={() => cmd('bold')}><Bold className="h-4 w-4" /></button>
        <button type="button" className={tb} title="Italic" onClick={() => cmd('italic')}><Italic className="h-4 w-4" /></button>
        <button type="button" className={tb} title="Underline" onClick={() => cmd('underline')}><Underline className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-black/[0.12]" />
        <button type="button" className={tb} title="Heading 1" onClick={() => cmd('formatBlock', 'H1')}><Heading1 className="h-4 w-4" /></button>
        <button type="button" className={tb} title="Heading 2" onClick={() => cmd('formatBlock', 'H2')}><Heading2 className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-black/[0.12]" />
        <button type="button" className={tb} title="Bulleted list" onClick={() => cmd('insertUnorderedList')}><List className="h-4 w-4" /></button>
        <button type="button" className={tb} title="Numbered list" onClick={() => cmd('insertOrderedList')}><ListOrdered className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-black/[0.12]" />
        <button type="button" className={tb} title="Align left" onClick={() => cmd('justifyLeft')}><AlignLeft className="h-4 w-4" /></button>
        <button type="button" className={tb} title="Align center" onClick={() => cmd('justifyCenter')}><AlignCenter className="h-4 w-4" /></button>
        <button type="button" className={tb} title="Align right" onClick={() => cmd('justifyRight')}><AlignRight className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-black/[0.12]" />
        <button type="button" className={tb} title="Insert link" onClick={() => { const u = prompt('Link URL'); if (u) cmd('createLink', u); }}><Link2 className="h-4 w-4" /></button>
        <span className="mx-1 h-5 w-px bg-black/[0.12]" />
        <label className="flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]" title="Text color">
          <input type="color" defaultValue="#111111" onChange={(e) => cmd('foreColor', e.target.value)} className="h-6 w-6 cursor-pointer border border-black/[0.1]" />
        </label>
        <select title="Font size" onChange={(e) => { if (e.target.value) cmd('fontSize', e.target.value); }} defaultValue="" className="h-7 border border-black/[0.1] bg-transparent px-1 text-[12px]">
          <option value="" disabled>Size</option>
          {[['1','S'],['3','M'],['5','L'],['6','XL'],['7','XXL']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select title="Font" onChange={(e) => { if (e.target.value) cmd('fontName', e.target.value); }} defaultValue="" className="h-7 border border-black/[0.1] bg-transparent px-1 text-[12px]">
          <option value="" disabled>Font</option>
          {['Arial','Georgia','Times New Roman','Courier New','Verdana','Trebuchet MS'].map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className="mx-1 h-5 w-px bg-black/[0.12]" />
        <button type="button" className={tb} title="Find & replace" onClick={() => setFindOpen(o => !o)}><Search className="h-4 w-4" /></button>
      </div>

      {findOpen && (
        <div className="flex flex-wrap items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-2 py-1.5 text-[12px]">
          <input value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="Find" className="w-36 border border-black/[0.1] bg-transparent px-2 py-1 outline-none" />
          <input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="Replace with" className="w-36 border border-black/[0.1] bg-transparent px-2 py-1 outline-none" />
          <button type="button" onClick={doReplaceAll} className="border border-black/[0.1] px-3 py-1 font-bold hover:bg-[var(--color-surface-2)]">Replace all</button>
          <span className="text-[var(--color-fg-subtle)]">Words: {(ref.current?.innerText.trim().split(/\s+/).filter(Boolean).length) ?? 0}</span>
        </div>
      )}

      {/* page */}
      <div className="overflow-auto bg-[var(--color-surface-2)] p-6" style={{ maxHeight: '60vh' }}>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          className="prose-doc mx-auto min-h-[60vh] w-full max-w-[820px] bg-white px-16 py-14 text-[15px] leading-relaxed text-black shadow-lg outline-none [&_h1]:text-[28px] [&_h1]:font-bold [&_h2]:text-[22px] [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-blue-600 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: '<h1>Untitled document</h1><p>Start writing… use the toolbar to format, open a <strong>.docx</strong>, and export to PDF, DOCX or HTML.</p>' }}
        />
      </div>
    </div>
  );
}
