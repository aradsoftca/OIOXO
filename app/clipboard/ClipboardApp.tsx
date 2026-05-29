'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardCopy, Copy, Check, Send, Loader2, ShieldCheck, Smartphone, Link2, ClipboardPaste, ArrowDownToLine } from 'lucide-react';
import { connectPeer, makeRoomCode, type Peer, type PeerState } from '@/lib/p2p/peer';

interface Item { id: number; text: string; mine: boolean }

export default function ClipboardApp() {
  const params = useSearchParams();
  const joinCode = params.get('r');
  const role: 's' | 'r' = joinCode ? 'r' : 's';
  const [room] = React.useState(() => joinCode || makeRoomCode());

  const [state, setState] = React.useState<PeerState>('connecting');
  const [items, setItems] = React.useState<Item[]>([]);
  const [draft, setDraft] = React.useState('');
  const [qr, setQr] = React.useState('');
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<number | null>(null);
  const peerRef = React.useRef<Peer | null>(null);
  const idRef = React.useRef(0);

  const link = typeof window !== 'undefined' ? `${window.location.origin}/clipboard?r=${room}` : '';

  React.useEffect(() => {
    const peer = connectPeer(role, room, {
      onState: setState,
      onMessage: (data) => {
        if (data?.type === 'text' && typeof data.text === 'string') {
          // Cap inbound text length — a malicious peer could send a 10MB
          // string and freeze the receiver's UI trying to render it.
          const text = data.text.length > 200_000 ? data.text.slice(0, 200_000) + '…' : data.text;
          setItems((prev) => [{ id: idRef.current++, text, mine: false }, ...prev].slice(0, 50));
        }
      },
    });
    peerRef.current = peer;
    return () => peer.close();
  }, [role, room]);

  React.useEffect(() => {
    if (role !== 's' || !link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 }))
      .then((url) => { if (alive) setQr(url); }).catch(() => {});
    return () => { alive = false; };
  }, [role, link]);

  const sendText = (text: string) => {
    const raw = text.trim();
    if (!raw) return;
    // Cap the OUTBOUND text too. The receiver caps inbound at 200KB, but
    // without a sender cap, pasting a multi-megabyte clipboard (e.g. a giant
    // base64 image) freezes THIS browser when we push the full string into
    // `items` and render it in the DOM.
    const t = raw.length > 200_000 ? raw.slice(0, 200_000) + '…' : raw;
    if (!peerRef.current?.send({ type: 'text', text: t })) return;
    setItems((prev) => [{ id: idRef.current++, text: t, mine: true }, ...prev].slice(0, 50));
    setDraft('');
  };

  const sendClipboard = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) sendText(t); }
    catch { /* clipboard read denied — user can paste into the box instead */ }
  };

  const copyItem = async (it: Item) => {
    try { await navigator.clipboard.writeText(it.text); setCopiedId(it.id); setTimeout(() => setCopiedId(null), 1400); } catch { /* */ }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(link).catch(() => { /* permission denied */ });
    setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1600);
  };

  const connected = state === 'connected';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-convert)] text-white"><ClipboardCopy className="h-5 w-5" /></div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Universal Clipboard</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">Copy on one device, paste on another. Nothing is stored on a server.</p>
        </div>
        <Link2 className="ml-auto hidden h-5 w-5 text-[var(--color-fg-subtle)] sm:block" />
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-2.5 text-[13px] font-semibold">
            {connected ? <><Check className="h-4 w-4 text-green-600" /> Connected — both devices linked</>
              : state === 'failed' ? <><span className="text-amber-600">Couldn’t connect.</span> <span className="font-normal text-[var(--color-fg-muted)]">A VPN or privacy/ad-block extension may be blocking WebRTC — try Incognito, another browser, or the same Wi-Fi.</span></>
              : <><Loader2 className="h-4 w-4 animate-spin text-[var(--color-cat-convert)]" /> Waiting for the other device…</>}
          </div>

          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Type or paste, then send</div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Text, a link, a code…"
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendText(draft); }}
              className="mt-2 h-28 w-full resize-none border border-black/[0.08] bg-[var(--color-surface-2)] p-3 text-[14px] text-[var(--color-fg)] focus:border-[var(--color-cat-convert)] focus:outline-none" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => sendText(draft)} disabled={!connected || !draft.trim()}
                className="flex flex-1 items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]">
                <Send className="h-3.5 w-3.5" /> Send
              </button>
              <button type="button" onClick={sendClipboard} disabled={!connected} title="Read your clipboard and send it"
                className="flex items-center justify-center gap-2 border border-black/[0.08] px-3 py-2.5 text-[12px] font-semibold text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-50">
                <ClipboardPaste className="h-3.5 w-3.5" /> Send clipboard
              </button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">History</div>
              {items.map((it) => (
                <div key={it.id} className="flex items-start gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2.5">
                  <ArrowDownToLine className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${it.mine ? 'rotate-180 text-[var(--color-fg-subtle)]' : 'text-[var(--color-cat-convert)]'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)]">{it.mine ? 'Sent' : 'Received'}</div>
                    <div className="mt-0.5 break-words font-mono text-[13px] text-[var(--color-fg)]">{it.text}</div>
                  </div>
                  <button type="button" onClick={() => copyItem(it)} className="flex shrink-0 items-center gap-1 border border-black/[0.08] px-2 py-1 text-[11px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]">
                    {copiedId === it.id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />} Copy
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          {role === 's' ? (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]"><Smartphone className="h-3.5 w-3.5" /> Link your other device</div>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code" className="mx-auto my-3 h-44 w-44 border border-black/[0.06] bg-white p-1" />
              )}
              <button type="button" onClick={copyLink} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
                {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copiedLink ? 'Copied' : 'Copy link'}
              </button>
              <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-muted)]">{link}</div>
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">Open this link (or scan the QR) on your other device. Keep both tabs open.</p>
            </div>
          ) : (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
              {connected ? 'Linked! Anything you send appears instantly on both devices.' : 'Linking to the other device…'}
            </div>
          )}
          <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
            <span>Text travels directly between the two devices over an encrypted connection — it never passes through or is stored on our servers.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
