'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import type { Font } from 'opentype.js';
import { FontDrop } from '@/components/tool/FontDrop';
import { getFontInfo, makeFontFace, ab2base64, type FontInfo } from '@/engines/font';

export default function Tool() {
  const [font, setFont] = React.useState<Font | null>(null);
  const [info, setInfo] = React.useState<FontInfo | null>(null);
  const [buffer, setBuffer] = React.useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [familyName, setFamilyName] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const snippet = React.useMemo(() => {
    if (!buffer || !familyName) return '';
    const base64 = ab2base64(buffer);
    return makeFontFace(familyName, base64, 'truetype');
  }, [buffer, familyName]);

  const previewHtml = familyName && snippet
    ? `<style>${snippet}</style><div style="font-family:'${familyName}',sans-serif;font-size:32px">The quick brown fox jumps over the lazy dog</div>`
    : '';

  const copy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* iframe / permission denied — code is still visible in textarea */ }
  };

  return (
    <div className="space-y-4">
      {!font && (
        <FontDrop
          loaded={false}
          onLoad={(f, file, buf) => {
            setFont(f);
            setBuffer(buf);
            setInfo(getFontInfo(f, file.size));
            setFileName(file.name);
            setFamilyName(getFontInfo(f, 0).family || file.name.replace(/\.[^.]+$/, ''));
          }}
        />
      )}

      {info && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold text-[var(--color-fg)]">{fileName}</span>
            <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{(info.fileSize / 1024).toFixed(1)} KB</span>
            <button type="button"
              onClick={() => { setFont(null); setBuffer(null); setInfo(null); setFileName(''); }}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >Change font</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-3">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">@font-face snippet</div>
                  <button type="button" onClick={copy}
                    className="flex items-center gap-1 border border-black/[0.08] px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:border-[var(--color-cat-font)] hover:text-[var(--color-cat-font)]">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="font-mono text-[11px] text-[var(--color-fg)] whitespace-pre-wrap break-all max-h-[280px] overflow-y-auto bg-[var(--color-canvas)] p-3 border border-black/[0.06]">{snippet ? snippet.slice(0, 600) + (snippet.length > 600 ? `\n…\n(${(snippet.length / 1024).toFixed(1)} KB total)` : '') : '…'}</pre>
              </div>

              {previewHtml && (
                <div className="border border-black/[0.08] bg-white p-6">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-3">Live preview</div>
                  <iframe
                    title="font preview"
                    sandbox=""
                    srcDoc={previewHtml}
                    className="w-full h-[120px] border-0"
                  />
                </div>
              )}
            </div>

            <aside>
              <label className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">font-family name</div>
                <input
                  value={familyName} onChange={(e) => setFamilyName(e.target.value)}
                  className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-1 font-mono text-[13px] outline-none focus:border-[var(--color-cat-font)]"
                />
                <div className="mt-2 text-[10px] text-[var(--color-fg-muted)]">
                  Embeds the full font as base64 inside the snippet. Paste into your CSS and use <span className="font-mono">font-family</span>.
                </div>
              </label>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
