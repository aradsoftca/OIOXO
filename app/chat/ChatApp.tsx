'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Send, Copy, Check, Loader2, ShieldCheck, Smartphone, Link2, Users, Smile, Paperclip, Download, AlertTriangle, RotateCcw } from 'lucide-react';
import { makeRoomCode } from '@/lib/p2p/peer';
import { joinGroup, type Group, type GroupState } from '@/lib/p2p/group';
import { BRAND } from '@/lib/brand';

type Kind = 'text' | 'media' | 'file';
interface ChatMsg { id: number; mine: boolean; name: string; ts: number; kind: Kind; text?: string; url?: string; mime?: string; fileName?: string; size?: number }

const EMOJIS = ['😀','😂','🤣','😅','😊','😍','🥰','😘','😎','🤔','🙄','😴','😭','😡','🥳','🤯','😇','🤝','👍','👎','🙏','👏','🙌','💪','🔥','✨','🎉','❤️','💔','💯','👀','💀','🫶','🙈','🎁','☕','🍕','🍺','✅','❌','⚡','🌟','💬','🚀','😜','🤩','😏','🫡'];

const CHUNK = 16 * 1024;
const MAX_FILE = 50 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtTime(ts: number) { return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
function fmtBytes(b = 0) { const u = ['B','KB','MB','GB']; let v = b, i = 0; while (v >= 1024 && i < 3) { v /= 1024; i++; } return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`; }

export default function ChatApp() {
  const params = useSearchParams();
  const joinCode = params.get('r');
  const role: 's' | 'r' = joinCode ? 'r' : 's';
  const [room] = React.useState(() => joinCode || makeRoomCode());

  const [name, setName] = React.useState('');
  const [state, setState] = React.useState<GroupState>('connecting');
  const [roster, setRoster] = React.useState(role === 's' ? 1 : 2);
  const [msgs, setMsgs] = React.useState<ChatMsg[]>([]);
  const [draft, setDraft] = React.useState('');
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [qr, setQr] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);

  const aiEngineRef = React.useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const groupRef = React.useRef<Group | null>(null);
  const idRef = React.useRef(0);
  const fileIdRef = React.useRef(0);
  const recvRef = React.useRef<{ name: string; mime: string; size: number; parts: ArrayBuffer[]; got: number; sender: string } | null>(null);
  const urlsRef = React.useRef<string[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef('');
  nameRef.current = name || (role === 's' ? 'Host' : 'Guest');

  const link = typeof window !== 'undefined' ? `${window.location.origin}/chat?r=${room}` : '';

  const addMsg = (m: Omit<ChatMsg, 'id'>) => setMsgs((prev) => [...prev, { ...m, id: idRef.current++ }]);

  React.useEffect(() => {
    const group = joinGroup(room, role === 's', nameRef.current, {
      onState: setState,
      onRoster: setRoster,
      onMessage: (data) => {
        if (data?.type === 'msg' && typeof data.text === 'string') {
          addMsg({ mine: false, name: data.name || 'Them', ts: data.ts || Date.now(), kind: 'text', text: data.text });
        } else if (data?.type === 'file') {
          recvRef.current = { name: data.name, mime: data.mime || 'application/octet-stream', size: data.size || 0, parts: [], got: 0, sender: data.sender || 'Them' };
        } else if (data?.type === 'file-end') {
          finalizeIncoming();
        }
      },
      onBinary: (buf) => {
        const r = recvRef.current; if (!r) return;
        r.parts.push(buf); r.got += buf.byteLength;
        if (r.got >= r.size) finalizeIncoming();
      },
    });
    groupRef.current = group;
    return () => group.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, room]);

  const finalizeIncoming = () => {
    const r = recvRef.current; if (!r) return;
    recvRef.current = null;
    const blob = new Blob(r.parts, { type: r.mime });
    const url = URL.createObjectURL(blob); urlsRef.current.push(url);
    addMsg({ mine: false, name: r.sender, ts: Date.now(), kind: r.mime.startsWith('image/') ? 'media' : 'file', url, mime: r.mime, fileName: r.name, size: r.size });
  };

  React.useEffect(() => () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  React.useEffect(() => {
    if (role !== 's' || !link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [role, link]);

  React.useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs]);

  const sendText = () => {
    const text = draft.trim();
    if (!text || state !== 'connected') return;
    const ts = Date.now();
    groupRef.current?.send({ type: 'msg', text, name: nameRef.current, ts });
    addMsg({ mine: true, name: nameRef.current, ts, kind: 'text', text });
    setDraft(''); setShowEmoji(false);
    // "@ai …" → the on-device model answers to the whole room.
    const m = text.match(/^@ai\b[\s,:]*([\s\S]+)/i);
    if (m && m[1].trim()) void aiReply(m[1].trim());
  };

  // On-device AI participant: generate on this device, broadcast so everyone sees it.
  const aiReply = async (prompt: string) => {
    const post = (text: string) => {
      const ts = Date.now();
      groupRef.current?.send({ type: 'msg', text, name: `${BRAND} AI`, ts });
      addMsg({ mine: false, name: `${BRAND} AI`, ts, kind: 'text', text });
    };
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) { post(`⚠ ${BRAND} AI needs a WebGPU browser (Chrome/Edge).`); return; }
    setAiBusy(true);
    try {
      if (!aiEngineRef.current) {
        const webllm = await import('@mlc-ai/web-llm');
        aiEngineRef.current = await webllm.CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
      }
      const out = await aiEngineRef.current.chat.completions.create({
        messages: [
          { role: 'system', content: `You are ${BRAND} AI, a concise, friendly assistant in a group chat. Keep replies short and helpful. Never mention any underlying model.` },
          { role: 'user', content: prompt },
        ],
        temperature: 0.6, max_tokens: 200,
      });
      post((out.choices?.[0]?.message?.content ?? '').trim() || '…');
    } catch { post('⚠ AI reply failed.'); }
    finally { setAiBusy(false); }
  };

  const sendFile = async (file: File) => {
    if (state !== 'connected' || !groupRef.current) return;
    if (file.size > MAX_FILE) { addMsg({ mine: true, name: nameRef.current, ts: Date.now(), kind: 'text', text: `⚠ ${file.name} is too large (max ${fmtBytes(MAX_FILE)}).` }); return; }
    const g = groupRef.current;
    fileIdRef.current++;
    g.send({ type: 'file', id: fileIdRef.current, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', sender: nameRef.current });
    const buf = await file.arrayBuffer();
    let n = 0;
    for (let off = 0; off < buf.byteLength; off += CHUNK) {
      g.sendBinary(buf.slice(off, off + CHUNK));
      if (++n % 64 === 0) await sleep(0); // yield so the send buffer can drain
    }
    g.send({ type: 'file-end', id: fileIdRef.current });
    const url = URL.createObjectURL(file); urlsRef.current.push(url);
    addMsg({ mine: true, name: nameRef.current, ts: Date.now(), kind: file.type.startsWith('image/') ? 'media' : 'file', url, mime: file.type, fileName: file.name, size: file.size });
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const f = Array.from(e.clipboardData.files)[0];
    if (f) { e.preventDefault(); void sendFile(f); }
  };

  const copyLink = () => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const connected = state === 'connected';
  const failed = state === 'failed';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-convert)] text-white"><MessageSquare className="h-5 w-5" /></div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Private Chat</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">Secure, peer-to-peer messaging — text, emoji, photos & files. Nothing stored on a server.</p>
        </div>
        <Link2 className="ml-auto hidden h-5 w-5 text-[var(--color-fg-subtle)] sm:block" />
      </header>

      {failed && (
        <div className="border border-amber-500/30 bg-amber-50/40 p-4">
          <div className="flex items-center gap-2 text-[14px] font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" /> Couldn’t connect</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-fg-muted)]">
            A direct connection didn’t form. The most common cause is a <strong>VPN or privacy/ad-block extension</strong> blocking WebRTC. Try an <strong>Incognito window</strong>, another browser, or put both devices on the <strong>same Wi-Fi</strong>.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="mt-3 flex items-center gap-2 bg-[var(--color-cat-convert)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"><RotateCcw className="h-3.5 w-3.5" /> Try again</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div
          className={`relative flex h-[58vh] flex-col border bg-[var(--color-surface-1)] ${dragging ? 'border-[var(--color-cat-convert)]' : 'border-black/[0.08]'}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void sendFile(f); }}
        >
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2 text-[12px]">
            <span className="font-semibold">{connected ? <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-green-600" /> {roster} {roster === 1 ? 'person' : 'people'} connected</span> : failed ? <span className="text-amber-600">Not connected</span> : <span className="flex items-center gap-1.5 text-[var(--color-fg-muted)]"><Loader2 className="h-3 w-3 animate-spin" /> Waiting…</span>}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-28 border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1 text-right text-[12px] focus:outline-none" />
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="grid h-full place-items-center text-center text-[13px] text-[var(--color-fg-subtle)]">
                {connected ? 'Say hello — messages, emoji, photos and files are end-to-end encrypted.' : role === 's' ? 'Share the link to invite people.' : 'Connecting…'}
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                {m.kind === 'text' && (
                  <div className={`max-w-[78%] whitespace-pre-wrap break-words px-3 py-2 text-[14px] leading-relaxed ${m.mine ? 'bg-[var(--color-cat-convert)] text-white' : 'bg-[var(--color-surface-2)] text-[var(--color-fg)]'}`}>{m.text}</div>
                )}
                {m.kind === 'media' && m.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={m.url} download={m.fileName} className="block max-w-[70%]"><img src={m.url} alt={m.fileName} className="max-h-64 rounded border border-black/[0.08]" /></a>
                )}
                {m.kind === 'file' && m.url && (
                  <a href={m.url} download={m.fileName} className={`flex max-w-[78%] items-center gap-3 border px-3 py-2 ${m.mine ? 'border-[var(--color-cat-convert)]/40 bg-[var(--color-cat-convert)]/[0.06]' : 'border-black/[0.08] bg-[var(--color-surface-2)]'}`}>
                    <Download className="h-5 w-5 shrink-0 text-[var(--color-cat-convert)]" />
                    <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-[var(--color-fg)]">{m.fileName}</span><span className="text-[11px] text-[var(--color-fg-subtle)]">{fmtBytes(m.size)}</span></span>
                  </a>
                )}
                <div className="mt-0.5 px-1 text-[10px] text-[var(--color-fg-subtle)]">{m.mine ? 'You' : m.name} · {fmtTime(m.ts)}</div>
              </div>
            ))}
          </div>

          {showEmoji && (
            <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto border-t border-black/[0.06] bg-[var(--color-surface-2)] p-2 text-[20px]">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => { setDraft((d) => d + e); }} className="rounded p-1 transition hover:bg-black/[0.06]">{e}</button>
              ))}
            </div>
          )}

          {aiBusy && (
            <div className="flex items-center gap-2 border-t border-black/[0.06] px-4 py-1.5 text-[12px] text-[var(--color-fg-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {BRAND} AI is thinking…
            </div>
          )}
          <div className="flex items-end gap-1.5 border-t border-black/[0.06] p-3">
            <button type="button" onClick={() => setShowEmoji((s) => !s)} disabled={!connected} className="grid h-10 w-9 place-items-center text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)] disabled:opacity-40" title="Emoji"><Smile className="h-5 w-5" /></button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!connected} className="grid h-10 w-9 place-items-center text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)] disabled:opacity-40" title="Send a photo or file"><Paperclip className="h-5 w-5" /></button>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onPaste={onPaste} rows={1} placeholder={connected ? 'Message…  (type @ai to ask the AI)' : 'Waiting for the other person…'} disabled={!connected}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-[var(--color-fg)] focus:outline-none disabled:opacity-60" />
            <button type="button" onClick={sendText} disabled={!connected || !draft.trim()} className="grid h-10 w-10 place-items-center bg-[var(--color-cat-convert)] text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]"><Send className="h-4 w-4" /></button>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendFile(f); e.target.value = ''; }} />
          {dragging && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--color-cat-convert)]/[0.08] text-[14px] font-semibold text-[var(--color-cat-convert)]">Drop to send</div>}
        </div>

        <aside className="space-y-3">
          {role === 's' ? (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]"><Smartphone className="h-3.5 w-3.5" /> Invite people</div>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR" className="mx-auto my-3 h-40 w-40 border border-black/[0.06] bg-white p-1" />
              )}
              <button type="button" onClick={copyLink} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy invite link'}
              </button>
              <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-muted)]">{link}</div>
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">Send this link (or QR) to anyone you want in the chat — share it with several people for a group. Keep this tab open; you host the room.</p>
            </div>
          ) : (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
              {connected ? 'You’re connected — everything flows directly between the devices.' : 'Linking to the other person…'}
            </div>
          )}
          <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
            <span>Messages, photos and files travel directly between devices over an encrypted (DTLS) connection — they never pass through or are stored on our servers.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
