'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MessageSquare, Send, Copy, Check, Loader2, ShieldCheck, Smartphone, Link2, Users,
  Smile, Paperclip, Download, AlertTriangle, RotateCcw, Search, Pin, Reply, X,
  Hand, Mic, Wand2, Languages, Sparkles, Hash,
} from 'lucide-react';
import { makeRoomCode } from '@/lib/p2p/peer';
import { joinGroup, type Group, type GroupState } from '@/lib/p2p/group';
import { BRAND } from '@/lib/brand';
import { ReactionPicker, REACTION_EMOJIS } from '@/lib/appstudio/reactions';
import { useVoiceRecorder, VoiceNotePlayer, fmtDuration } from '@/lib/appstudio/voice-note';
import { type RichMsg, indexById, parseSlash, SLASH_COMMANDS, addReaction as applyReaction, rootsAndThreads } from '@/lib/appstudio/threads';
import { quickAnswer, summarizeConversation, translateText } from '@/lib/appstudio/ai-summary';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';
import { FreeCapHint } from '@/components/limits/ProBadge';
import { loadHistory, saveHistory, clearHistory, pruneHistory, type StoredMsg } from '@/lib/p2p/chat-history';

const POLICY_KEY = 'chat';

// Local history retention. Persisted (encrypted) so a refresh no longer wipes
// the conversation. Pro keeps a year; free keeps a week — matching the tiers
// the product advertises. Stored as ms.
const RETENTION_FREE = 7 * 24 * 60 * 60 * 1000;
const RETENTION_PRO = 365 * 24 * 60 * 60 * 1000;

/** Persisted subset of a RichMsg — never the ephemeral blob URL (`url`); file
 *  messages keep metadata only and re-show as a "file was shared" placeholder. */
function toStored(m: RichMsg): StoredMsg {
  return {
    id: m.id, mine: m.mine, name: m.name, ts: m.ts, kind: m.kind,
    text: m.text, parentId: m.parentId, pinned: m.pinned, reactions: m.reactions,
    fileName: m.fileName, fileSize: m.size, fileMime: m.mime,
  };
}
function fromStored(s: StoredMsg): RichMsg {
  return {
    id: s.id, ts: s.ts, mine: s.mine, name: s.name, kind: s.kind as RichMsg['kind'],
    text: s.text, parentId: s.parentId, pinned: s.pinned, reactions: s.reactions,
    fileName: s.fileName, size: s.fileSize, mime: s.fileMime,
    // No url: the blob is long gone. The UI shows file/voice rows as metadata.
  };
}

const EMOJIS = ['😀','😂','🤣','😅','😊','😍','🥰','😘','😎','🤔','🙄','😴','😭','😡','🥳','🤯','😇','🤝','👍','👎','🙏','👏','🙌','💪','🔥','✨','🎉','❤️','💔','💯','👀','💀','🫶','🙈','🎁','☕','🍕','🍺','✅','❌','⚡','🌟','💬','🚀','😜','🤩','😏','🫡'];

const CHUNK = 16 * 1024;
// Technical hard ceiling — files are buffered whole in memory (file.arrayBuffer()),
// so this protects against OOM rather than enforcing the paid tier (the paid tier
// is the `input-size` policy lever checked just before this). Free and Pro get
// different ceilings; the policy lever still gates within them.
const MAX_FILE_FREE = 50 * 1024 * 1024;        // 50 MB
const MAX_FILE_PRO = 2 * 1024 * 1024 * 1024;   // 2 GB
const maxFileFor = (isPro: boolean) => (isPro ? MAX_FILE_PRO : MAX_FILE_FREE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtTime(ts: number) { return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
function fmtBytes(b = 0) { const u = ['B','KB','MB','GB']; let v = b, i = 0; while (v >= 1024 && i < 3) { v /= 1024; i++; } return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`; }

const CHANNELS_KEY = 'chatstudio-channels-v1';

interface ChannelMeta { name: string; lastTs: number }

export default function ChatStudio() {
  const params = useSearchParams();
  const joinCode = params.get('r');
  const role: 's' | 'r' = joinCode ? 'r' : 's';
  const [room] = React.useState(() => joinCode || makeRoomCode());

  const [name, setName] = React.useState('');
  const [state, setState] = React.useState<GroupState>('connecting');
  const [roster, setRoster] = React.useState(role === 's' ? 1 : 2);
  const [msgs, setMsgs] = React.useState<RichMsg[]>([]);
  const [draft, setDraft] = React.useState('');
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [qr, setQr] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<number | null>(null);
  const [pickReactionFor, setPickReactionFor] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);
  const [showSlash, setShowSlash] = React.useState(false);
  const [sidePanel, setSidePanel] = React.useState<'channels' | 'pinned' | 'invite'>('invite');
  const [activeChannel, setActiveChannel] = React.useState<string>(room);
  const [channelList, setChannelList] = React.useState<ChannelMeta[]>([]);

  const groupRef = React.useRef<Group | null>(null);
  const idRef = React.useRef(0);
  const fileIdRef = React.useRef(0);
  const recvRef = React.useRef<{ name: string; mime: string; size: number; parts: ArrayBuffer[]; got: number; sender: string; voice?: boolean; durationMs?: number; parentId?: number } | null>(null);
  const urlsRef = React.useRef<string[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef('');
  nameRef.current = name || (role === 's' ? 'Host' : 'Guest');
  const voice = useVoiceRecorder();
  const isPro = useIsPro();
  const policyGate = usePolicyGate();

  const link = typeof window !== 'undefined' ? `${window.location.origin}/chat?r=${room}` : '';

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(CHANNELS_KEY);
      if (raw) {
        const list = JSON.parse(raw) as ChannelMeta[];
        if (Array.isArray(list)) setChannelList(list);
      }
    } catch { /* */ }
  }, []);

  React.useEffect(() => {
    setChannelList((prev) => {
      const map = new Map(prev.map((c) => [c.name, c]));
      map.set(activeChannel, { name: activeChannel, lastTs: Date.now() });
      const next = Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs).slice(0, 12);
      try { localStorage.setItem(CHANNELS_KEY, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, [activeChannel]);

  // Persisted history. Retention follows the tier. Prune expired rooms once on
  // mount, then load THIS channel's history so a refresh no longer wipes the
  // chat. idRef is advanced past the loaded ids so new messages don't collide.
  const retentionMs = isPro ? RETENTION_PRO : RETENTION_FREE;
  React.useEffect(() => { void pruneHistory(RETENTION_PRO); }, []);
  React.useEffect(() => {
    let alive = true;
    void loadHistory(room, activeChannel, retentionMs).then((stored) => {
      if (!alive || !stored.length) return;
      const loaded = stored.map(fromStored);
      const maxId = loaded.reduce((mx, m) => Math.max(mx, m.id), 0);
      idRef.current = Math.max(idRef.current, maxId + 1);
      // Only seed if the live session hasn't already produced messages.
      setMsgs((prev) => prev.length ? prev : loaded);
    });
    return () => { alive = false; };
  }, [room, activeChannel, retentionMs]);

  // Debounced save on every change so a crash/close keeps the latest history.
  React.useEffect(() => {
    if (!msgs.length) return;
    const t = setTimeout(() => { void saveHistory(room, activeChannel, msgs.map(toStored)); }, 600);
    return () => clearTimeout(t);
  }, [msgs, room, activeChannel]);

  const addMsg = React.useCallback((m: Omit<RichMsg, 'id'>) => {
    setMsgs((prev) => [...prev, { ...m, id: idRef.current++ }]);
  }, []);

  React.useEffect(() => {
    const group = joinGroup(room, role === 's', nameRef.current, {
      onState: setState,
      onRoster: (n) => {
        const partHit = checkLever(POLICY_KEY, 'participants', n, isPro);
        if (partHit) policyGate.fire(partHit);
        setRoster(n);
      },
      onMessage: (data: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (data?.type === 'msg' && typeof data.text === 'string') {
          addMsg({ mine: false, name: data.name || 'Them', ts: data.ts || Date.now(), kind: 'text', text: data.text, parentId: data.parentId });
        } else if (data?.type === 'rxn' && typeof data.targetId === 'number') {
          setMsgs((prev) => prev.map((m) => m.id === data.targetId ? applyReaction(m, data.emoji, data.name || 'Them') : m));
        } else if (data?.type === 'pin' && typeof data.targetId === 'number') {
          setMsgs((prev) => prev.map((m) => m.id === data.targetId ? { ...m, pinned: !!data.up } : m));
        } else if (data?.type === 'file') {
          recvRef.current = { name: data.name, mime: data.mime || 'application/octet-stream', size: data.size || 0, parts: [], got: 0, sender: data.sender || 'Them', voice: !!data.voice, durationMs: data.durationMs, parentId: data.parentId };
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
    // Coerce peer-declared MIME to a safe one. A peer could send text/html
    // (or SVG with <script>) and get the receiver to "Open in new tab",
    // navigating into a blob: URL that's same-origin with our site —
    // scripts then execute as xonvert.com. Only raster image MIMEs and
    // common audio MIMEs (for voice clips) are honored; everything else
    // becomes octet-stream so the browser downloads instead of navigating.
    const isImage = /^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(r.mime);
    const isAudio = r.voice && /^audio\/(webm|ogg|mp3|mpeg|mp4|wav|aac|flac|opus)$/i.test(r.mime);
    const safeMime = (isImage || isAudio) ? r.mime : 'application/octet-stream';
    const blob = new Blob(r.parts, { type: safeMime });
    const url = URL.createObjectURL(blob); urlsRef.current.push(url);
    const kind = isAudio ? 'voice' : isImage ? 'media' : 'file';
    addMsg({ mine: false, name: r.sender, ts: Date.now(), kind, url, mime: safeMime, fileName: r.name, size: r.size, durationMs: r.durationMs, parentId: r.parentId });
  };

  React.useEffect(() => () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  React.useEffect(() => {
    if (role !== 's' || !link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [role, link]);

  React.useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs]);

  const sendText = async (text: string) => {
    const v = text.trim();
    if (!v || state !== 'connected') return;
    const slash = parseSlash(v);
    if (slash) {
      await runSlash(slash.cmd, slash.args);
      setDraft('');
      return;
    }
    const ts = Date.now();
    const parent = replyTo ?? undefined;
    groupRef.current?.send({ type: 'msg', text: v, name: nameRef.current, ts, parentId: parent });
    addMsg({ mine: true, name: nameRef.current, ts, kind: 'text', text: v, parentId: parent });
    setDraft(''); setShowEmoji(false); setReplyTo(null);
    const m = v.match(/^@ai\b[\s,:]*([\s\S]+)/i);
    if (m && m[1].trim()) void askAi(m[1].trim());
  };

  const runSlash = async (cmd: string, args: string) => {
    if (cmd === '/summarize') {
      setAiBusy(true);
      try {
        const text = await summarizeConversation(msgs.filter((m) => m.kind === 'text').map((m) => ({ name: m.mine ? 'You' : m.name, text: m.text || '' })));
        broadcastSystem(`Summary:\n${text}`);
      } catch (e) { broadcastSystem(`⚠ Could not summarize (${(e as Error).message})`); }
      finally { setAiBusy(false); }
    } else if (cmd === '/ask') {
      if (!args) return;
      void askAi(args);
    } else if (cmd === '/translate') {
      const target = args || 'English';
      const lastText = [...msgs].reverse().find((m) => m.kind === 'text' && !m.mine);
      if (!lastText?.text) { broadcastSystem('Nothing to translate.'); return; }
      setAiBusy(true);
      try {
        const out = await translateText(lastText.text, target);
        broadcastSystem(`Translation (${target}): ${out}`);
      } catch (e) { broadcastSystem(`⚠ ${(e as Error).message}`); }
      finally { setAiBusy(false); }
    } else if (cmd === '/pin') {
      const last = [...msgs].reverse().find((m) => m.kind === 'text');
      if (last) togglePin(last.id);
    } else if (cmd === '/clear') {
      setMsgs([]);
      void clearHistory(room, activeChannel);
    } else if (cmd === '/me') {
      const ts = Date.now();
      const text = `* ${nameRef.current} ${args}`;
      groupRef.current?.send({ type: 'msg', text, name: nameRef.current, ts });
      addMsg({ mine: true, name: nameRef.current, ts, kind: 'text', text });
    }
  };

  const broadcastSystem = (text: string) => {
    const ts = Date.now();
    groupRef.current?.send({ type: 'msg', text, name: `${BRAND} AI`, ts });
    addMsg({ mine: false, name: `${BRAND} AI`, ts, kind: 'system', text });
  };

  const askAi = async (prompt: string) => {
    setAiBusy(true);
    try {
      const out = await quickAnswer(prompt);
      broadcastSystem(out);
    } catch (e) { broadcastSystem(`⚠ ${(e as Error).message}. Needs a WebGPU browser.`); }
    finally { setAiBusy(false); }
  };

  const sendFile = async (file: File, opts: { voice?: boolean; durationMs?: number } = {}) => {
    if (state !== 'connected' || !groupRef.current) return;
    const sizeHit = checkLever(POLICY_KEY, 'input-size', file.size, isPro);
    if (sizeHit) { policyGate.fire(sizeHit); return; }
    const maxFile = maxFileFor(isPro);
    if (file.size > maxFile) { addMsg({ mine: true, name: nameRef.current, ts: Date.now(), kind: 'text', text: `⚠ ${file.name} is too large (max ${fmtBytes(maxFile)}).` }); return; }
    const g = groupRef.current;
    fileIdRef.current++;
    const parent = replyTo ?? undefined;
    g.send({ type: 'file', id: fileIdRef.current, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', sender: nameRef.current, voice: opts.voice, durationMs: opts.durationMs, parentId: parent });
    const buf = await file.arrayBuffer();
    let n = 0;
    for (let off = 0; off < buf.byteLength; off += CHUNK) {
      g.sendBinary(buf.slice(off, off + CHUNK));
      if (++n % 64 === 0) await sleep(0);
    }
    g.send({ type: 'file-end', id: fileIdRef.current });
    const url = URL.createObjectURL(file); urlsRef.current.push(url);
    const kind = opts.voice ? 'voice' : (file.type || '').startsWith('image/') ? 'media' : 'file';
    addMsg({ mine: true, name: nameRef.current, ts: Date.now(), kind, url, mime: file.type, fileName: file.name, size: file.size, durationMs: opts.durationMs, parentId: parent });
    setReplyTo(null);
  };

  const recordVoice = async () => {
    if (voice.recording) {
      const blob = await voice.stop();
      if (blob) {
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        await sendFile(file, { voice: true, durationMs: voice.duration });
      }
    } else {
      await voice.start();
    }
  };

  const reactToMessage = (msgId: number, emoji: string) => {
    setMsgs((prev) => prev.map((m) => m.id === msgId ? applyReaction(m, emoji, 'You') : m));
    groupRef.current?.send({ type: 'rxn', targetId: msgId, emoji, name: nameRef.current });
    setPickReactionFor(null);
  };

  const togglePin = (msgId: number) => {
    const cur = msgs.find((m) => m.id === msgId);
    const up = !cur?.pinned;
    setMsgs((prev) => prev.map((m) => m.id === msgId ? { ...m, pinned: up } : m));
    groupRef.current?.send({ type: 'pin', targetId: msgId, up });
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const f = Array.from(e.clipboardData.files)[0];
    if (f) { e.preventDefault(); void sendFile(f); }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(link).catch(() => { /* permission denied */ });
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  const connected = state === 'connected';
  const failed = state === 'failed';

  const filteredMsgs = React.useMemo(() => {
    if (!search.trim()) return msgs;
    const q = search.toLowerCase();
    return msgs.filter((m) => m.text?.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.fileName?.toLowerCase().includes(q));
  }, [msgs, search]);

  const { children: threadMap } = React.useMemo(() => rootsAndThreads(msgs), [msgs]);
  const msgIndex = React.useMemo(() => indexById(msgs), [msgs]);
  const pinnedMsgs = React.useMemo(() => msgs.filter((m) => m.pinned), [msgs]);

  const draftSlash = parseSlash(draft);
  const slashMatches = SLASH_COMMANDS.filter((s) => !draftSlash || s.cmd.startsWith(draftSlash.cmd));

  return (
    <div className="mx-auto flex h-[calc(100dvh-80px)] max-w-[1400px] flex-col gap-3 p-3 sm:p-4">
      {policyGate.element}
      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.08] pb-3">
        <div className="grid h-10 w-10 place-items-center bg-[var(--color-cat-convert)] text-white"><MessageSquare className="h-5 w-5" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-extrabold tracking-tight">Chat Studio</h1>
          <p className="truncate text-[11px] text-[var(--color-fg-muted)]">
            P2P · {connected ? `${roster} ${roster === 1 ? 'person' : 'people'}` : failed ? 'Not connected' : 'Connecting…'} · Threads · Reactions · Voice · AI · Slash commands
            {' '}<FreeCapHint toolKey={POLICY_KEY} lever="participants" isPro={isPro} />
          </p>
        </div>
        <button type="button" onClick={() => setShowSearch((v) => !v)} className="grid h-9 w-9 place-items-center border border-black/[0.08] bg-[var(--color-surface-1)]" title="Search">
          <Search className="h-4 w-4" />
        </button>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="hidden w-28 border border-black/[0.08] bg-[var(--color-surface-2)] px-2 py-1 text-right text-[12px] focus:outline-none sm:block" />
      </header>

      {showSearch && (
        <div className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2">
          <Search className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages, names, files…" className="flex-1 bg-transparent text-[13px] focus:outline-none" />
          {search && <button onClick={() => setSearch('')} className="text-[var(--color-fg-muted)]"><X className="h-3.5 w-3.5" /></button>}
        </div>
      )}

      {failed && (
        <div className="border border-amber-500/30 bg-amber-50/40 p-3">
          <div className="flex items-center gap-2 text-[14px] font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" /> Couldn&apos;t connect</div>
          <button type="button" onClick={() => window.location.reload()} className="mt-2 flex items-center gap-2 bg-[var(--color-cat-convert)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white"><RotateCcw className="h-3 w-3" /> Try again</button>
        </div>
      )}

      <div className="grid flex-1 min-h-0 gap-3 lg:grid-cols-[200px_1fr_280px]">
        <aside className="hidden flex-col gap-2 lg:flex">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-2">
            <div className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Channels</div>
            <div className="mt-1 space-y-0.5">
              {channelList.map((c) => (
                <a
                  key={c.name}
                  href={`/chat${c.name === room ? '' : `?r=${c.name}`}`}
                  className={`flex items-center gap-1.5 rounded px-2 py-1 text-[12px] ${c.name === activeChannel ? 'bg-[var(--color-cat-convert)] text-white' : 'text-[var(--color-fg)] hover:bg-black/[0.04]'}`}
                >
                  <Hash className="h-3 w-3 opacity-60" />
                  <span className="truncate font-mono">{c.name}</span>
                </a>
              ))}
            </div>
          </div>
          {pinnedMsgs.length > 0 && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-2">
              <div className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Pinned</div>
              <div className="mt-1 space-y-1">
                {pinnedMsgs.map((m) => (
                  <div key={m.id} className="rounded bg-black/[0.04] px-2 py-1 text-[11px]">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--color-fg-subtle)]">{m.mine ? 'You' : m.name}</div>
                    <div className="line-clamp-2">{m.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div
          className={`relative flex min-h-0 flex-col border bg-[var(--color-surface-1)] ${dragging ? 'border-[var(--color-cat-convert)]' : 'border-black/[0.08]'}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void sendFile(f); }}
        >
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2 text-[12px]">
            <span className="flex items-center gap-1.5 font-semibold">
              {connected ? <><Users className="h-3.5 w-3.5 text-green-600" /> {roster} connected</> : failed ? <span className="text-amber-600">Not connected</span> : <><Loader2 className="h-3 w-3 animate-spin" /> Connecting…</>}
            </span>
            <span className="text-[10px] text-[var(--color-fg-subtle)]">Room <span className="font-mono">{room}</span></span>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {filteredMsgs.length === 0 && (
              <div className="grid h-full place-items-center text-center text-[13px] text-[var(--color-fg-subtle)]">
                {search ? 'No messages match your search.' : connected ? 'Say hi — text, voice note, reactions, threads, /slash commands.' : role === 's' ? 'Share the link to invite people.' : 'Connecting…'}
              </div>
            )}
            {filteredMsgs.map((m) => {
              const isReply = m.parentId != null;
              const parent = isReply ? msgIndex.get(m.parentId!) : null;
              const threads = threadMap.get(m.id) ?? [];
              return (
                <div key={m.id} className={`group flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                  {parent && (
                    <div className="mb-0.5 max-w-[78%] rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1 text-[10px] text-[var(--color-fg-subtle)]">
                      <Reply className="mr-1 inline h-2.5 w-2.5" />
                      <span className="font-semibold">{parent.mine ? 'You' : parent.name}:</span> {parent.text?.slice(0, 80) || parent.fileName}
                    </div>
                  )}
                  <div className="relative">
                    {m.kind === 'text' && (
                      <div className={`max-w-[78%] whitespace-pre-wrap break-words px-3 py-2 text-[14px] leading-relaxed ${m.mine ? 'bg-[var(--color-cat-convert)] text-white' : 'bg-[var(--color-surface-2)] text-[var(--color-fg)]'}`}>{m.text}</div>
                    )}
                    {m.kind === 'system' && (
                      <div className="max-w-[78%] whitespace-pre-wrap rounded border border-purple-500/30 bg-purple-500/[0.06] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-fg)]">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-500"><Sparkles className="h-3 w-3" /> {BRAND} AI</span>
                        <span className="mt-0.5 block">{m.text}</span>
                      </div>
                    )}
                    {m.kind === 'media' && m.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={m.url} download={m.fileName} className="block max-w-[70%]"><img src={m.url} alt={m.fileName} className="max-h-64 rounded border border-black/[0.08]" /></a>
                    )}
                    {m.kind === 'file' && m.url && (
                      <a href={m.url} download={m.fileName} className={`flex max-w-[78%] items-center gap-3 border px-3 py-2 ${m.mine ? 'border-[var(--color-cat-convert)]/40 bg-[var(--color-cat-convert)]/[0.06]' : 'border-black/[0.08] bg-[var(--color-surface-2)]'}`}>
                        <Download className="h-5 w-5 shrink-0 text-[var(--color-cat-convert)]" />
                        <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{m.fileName}</span><span className="text-[11px] text-[var(--color-fg-subtle)]">{fmtBytes(m.size)}</span></span>
                      </a>
                    )}
                    {m.kind === 'voice' && m.url && (
                      <div className="flex flex-col gap-1">
                        <VoiceNotePlayer url={m.url} />
                        <span className="text-[10px] text-[var(--color-fg-subtle)]">Voice · {m.durationMs ? fmtDuration(m.durationMs) : ''}</span>
                      </div>
                    )}
                    <div className={`absolute top-0 ${m.mine ? '-left-20' : '-right-20'} hidden gap-1 opacity-0 transition group-hover:flex group-hover:opacity-100`}>
                      <button type="button" onClick={() => setPickReactionFor(pickReactionFor === m.id ? null : m.id)} className="rounded bg-black/60 p-1 text-white"><Smile className="h-3 w-3" /></button>
                      <button type="button" onClick={() => setReplyTo(m.id)} className="rounded bg-black/60 p-1 text-white"><Reply className="h-3 w-3" /></button>
                      <button type="button" onClick={() => togglePin(m.id)} className={`rounded p-1 text-white ${m.pinned ? 'bg-amber-500' : 'bg-black/60'}`}><Pin className="h-3 w-3" /></button>
                    </div>
                  </div>
                  {pickReactionFor === m.id && (
                    <div className="mt-1 rounded bg-black/85 p-1 shadow-lg">
                      <div className="flex flex-wrap gap-0.5">
                        {REACTION_EMOJIS.map((e) => (
                          <button key={e} onClick={() => reactToMessage(m.id, e)} className="p-1 text-[18px] transition hover:scale-125">{e}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.reactions && Object.keys(m.reactions).length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {Object.entries(m.reactions).map(([e, names]) => (
                        <span key={e} className="flex items-center gap-1 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[11px]" title={names.join(', ')}>
                          <span>{e}</span>
                          <span className="font-semibold text-[var(--color-fg-muted)]">{names.length}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-0.5 px-1 text-[10px] text-[var(--color-fg-subtle)]">
                    {m.mine ? 'You' : m.name} · {fmtTime(m.ts)}
                    {threads.length > 0 && <span className="ml-1.5 text-[var(--color-cat-convert)]">· {threads.length} {threads.length === 1 ? 'reply' : 'replies'}</span>}
                    {m.pinned && <Pin className="ml-1 inline h-2.5 w-2.5 text-amber-500" />}
                  </div>
                </div>
              );
            })}
          </div>

          {replyTo != null && (
            <div className="flex items-center justify-between border-t border-black/[0.06] bg-black/[0.03] px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
                <Reply className="h-3 w-3" /> Replying to <strong className="text-[var(--color-fg)]">{msgIndex.get(replyTo)?.name || 'message'}</strong>
              </span>
              <button onClick={() => setReplyTo(null)} className="text-[var(--color-fg-muted)]"><X className="h-3 w-3" /></button>
            </div>
          )}

          {showEmoji && (
            <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto border-t border-black/[0.06] bg-[var(--color-surface-2)] p-2 text-[20px]">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => setDraft((d) => d + e)} className="rounded p-1 transition hover:bg-black/[0.06]">{e}</button>
              ))}
            </div>
          )}

          {showSlash && (
            <div className="max-h-44 overflow-y-auto border-t border-black/[0.06] bg-[var(--color-surface-2)]">
              {slashMatches.map((c) => (
                <button
                  key={c.cmd}
                  type="button"
                  onClick={() => { setDraft(c.cmd + ' '); setShowSlash(false); }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-black/[0.04]"
                >
                  <span className="font-mono font-semibold">{c.cmd}</span>
                  <span className="text-[11px] text-[var(--color-fg-subtle)]">{c.desc}</span>
                </button>
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
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!connected} className="grid h-10 w-9 place-items-center text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)] disabled:opacity-40" title="Attach"><Paperclip className="h-5 w-5" /></button>
            <button type="button" onClick={recordVoice} disabled={!connected} className={`grid h-10 w-9 place-items-center transition disabled:opacity-40 ${voice.recording ? 'text-red-500' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}`} title={voice.recording ? 'Stop & send' : 'Record voice note'}>
              {voice.recording ? <span className="text-[10px] font-bold">{fmtDuration(voice.duration)}</span> : <Mic className="h-5 w-5" />}
            </button>
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setShowSlash(e.target.value.startsWith('/')); }}
              onPaste={onPaste}
              rows={1}
              placeholder={connected ? 'Message…  (try /summarize, /ask, @ai)' : 'Waiting…'}
              disabled={!connected}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendText(draft); } }}
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] focus:outline-none disabled:opacity-60"
            />
            <button type="button" onClick={() => sendText(draft)} disabled={!connected || !draft.trim()} className="grid h-10 w-10 place-items-center bg-[var(--color-cat-convert)] text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]"><Send className="h-4 w-4" /></button>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendFile(f); e.target.value = ''; }} />
          {dragging && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--color-cat-convert)]/[0.08] text-[14px] font-semibold text-[var(--color-cat-convert)]">Drop to send</div>}
        </div>

        <aside className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            {(['invite', 'channels', 'pinned'] as const).map((id) => (
              <button
                key={id}
                onClick={() => setSidePanel(id)}
                className={`flex-1 border px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${sidePanel === id ? 'border-[var(--color-cat-convert)] bg-[var(--color-cat-convert)] text-white' : 'border-black/[0.08] bg-[var(--color-surface-1)]'}`}
              >
                {id}
              </button>
            ))}
          </div>
          {sidePanel === 'invite' && (
            role === 's' ? (
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]"><Smartphone className="h-3.5 w-3.5" /> Invite</div>
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR" className="mx-auto my-3 h-32 w-32 border border-black/[0.06] bg-white p-1" />
                )}
                <button type="button" onClick={copyLink} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-convert)] py-2 text-[11px] font-bold uppercase tracking-wider text-white">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy link'}
                </button>
                <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[9px] text-[var(--color-fg-muted)]">{link}</div>
              </div>
            ) : (
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] text-[var(--color-fg-muted)]">
                {connected ? 'Connected — everything flows directly between devices.' : 'Linking…'}
              </div>
            )
          )}
          {sidePanel === 'channels' && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Recent rooms</div>
              <div className="mt-2 space-y-0.5">
                {channelList.map((c) => (
                  <a key={c.name} href={`/chat${c.name === room ? '' : `?r=${c.name}`}`} className={`flex items-center gap-1.5 rounded px-2 py-1 text-[12px] ${c.name === activeChannel ? 'bg-[var(--color-cat-convert)] text-white' : 'hover:bg-black/[0.04]'}`}>
                    <Hash className="h-3 w-3 opacity-60" />
                    <span className="truncate font-mono">{c.name}</span>
                  </a>
                ))}
              </div>
              <a href="/chat" className="mt-3 block w-full bg-[var(--color-cat-convert)] py-2 text-center text-[11px] font-bold uppercase tracking-wider text-white">+ New room</a>
            </div>
          )}
          {sidePanel === 'pinned' && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Pinned messages</div>
              {pinnedMsgs.length === 0 ? (
                <p className="mt-2 text-[12px] text-[var(--color-fg-subtle)]">Pin important messages to bookmark them here.</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {pinnedMsgs.map((m) => (
                    <div key={m.id} className="rounded border border-black/[0.06] bg-black/[0.02] p-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)]">{m.mine ? 'You' : m.name}</div>
                      <div className="text-[12px] line-clamp-3">{m.text || m.fileName}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-2 text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
            <span>Messages, voice notes, files, reactions — all P2P encrypted, never on our servers.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
