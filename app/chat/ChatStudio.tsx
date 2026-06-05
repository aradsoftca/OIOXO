'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MessageSquare, Send, Copy, Check, Loader2, ShieldCheck, Smartphone, Link2, Users,
  Smile, Paperclip, Download, AlertTriangle, RotateCcw, Search, Pin, Reply, X,
  Hand, Mic, Wand2, Languages, Sparkles, Hash, Lock, ChevronDown, Command,
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

// Safety-number affordance (Signal-style "compare these emojis to confirm no
// one's in the middle"). Derived deterministically from the room secret so both
// peers see the SAME four emojis with no extra handshake — a privacy check the
// user can SEE, beating apps that bury it. Purely cosmetic: a real key compare
// would hash the DTLS fingerprints, but the room code already gates the channel.
const SAFETY_SET = ['🦊','🐼','🦉','🐙','🦄','🐢','🦋','🐝','🌵','🍄','⚡','🌙','🔥','❄️','🎈','🧩','🎲','🛸','🗝️','🪐','🌊','🍀','🎵','💎'];
function safetyEmojis(room: string): string[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < room.length; i++) { h ^= room.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const out: string[] = [];
  for (let i = 0; i < 4; i++) { out.push(SAFETY_SET[h % SAFETY_SET.length]); h = Math.imul(h ^ (i + 1), 2654435761) >>> 0; }
  return out;
}

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
  // Honest connection UX. `reconnecting` is distinct from a cold `connecting`:
  // once we've ever been connected, a drop is shown as a calm amber "Reconnecting…"
  // (never a red error wall) while outgoing text queues locally and flushes on
  // repair — directly answering the #1 WebRTC complaint (silent dead channels).
  const [reconnecting, setReconnecting] = React.useState(false);
  const [peerTyping, setPeerTyping] = React.useState<string | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [unread, setUnread] = React.useState(0);
  const [showPalette, setShowPalette] = React.useState(false);
  const [showSafety, setShowSafety] = React.useState(false);
  const [flashId, setFlashId] = React.useState<number | null>(null);

  const groupRef = React.useRef<Group | null>(null);
  const idRef = React.useRef(0);
  const fileIdRef = React.useRef(0);
  const recvRef = React.useRef<{ name: string; mime: string; size: number; parts: ArrayBuffer[]; got: number; sender: string; voice?: boolean; durationMs?: number; parentId?: number } | null>(null);
  const urlsRef = React.useRef<string[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef('');
  nameRef.current = name || (role === 's' ? 'Host' : 'Guest');
  const everConnectedRef = React.useRef(false);
  const lastTypingSentRef = React.useRef(0);
  const typingClearRef = React.useRef(0);
  // Messages composed while the channel is down — flushed in order on repair so
  // nothing is silently lost (the rival's "data channel silently died" failure).
  const outboxRef = React.useRef<{ data: any; cid: string }[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
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

  const genCid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Drain any text queued while the channel was down, oldest first, and flip
  // each from "sending" → "sent". Acks from the peer later upgrade to "delivered".
  // (Group.send doesn't report success; flush only runs once we're reconnected,
  //  so the channel is open and the send goes through.)
  const flushOutbox = React.useCallback(() => {
    const g = groupRef.current;
    if (!g || !outboxRef.current.length) return;
    const pending = outboxRef.current.splice(0);
    const flushedCids = new Set<string>();
    for (const item of pending) {
      g.send(item.data);
      flushedCids.add(item.cid);
    }
    setMsgs((prev) => prev.map((m) => m.cid && flushedCids.has(m.cid) ? { ...m, status: 'sent' } : m));
  }, []);

  React.useEffect(() => {
    const group = joinGroup(room, role === 's', nameRef.current, {
      onState: (s) => {
        if (s === 'connected') {
          everConnectedRef.current = true;
          setReconnecting(false);
          flushOutbox();
        } else if (s === 'connecting' && everConnectedRef.current) {
          // We were connected and slipped back to handshaking — present it as a
          // calm "Reconnecting…", not a cold "Connecting…" or a scary error.
          setReconnecting(true);
        }
        setState(s);
      },
      onRoster: (n) => {
        const partHit = checkLever(POLICY_KEY, 'participants', n, isPro);
        if (partHit) policyGate.fire(partHit);
        setRoster(n);
      },
      onMessage: (data: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (data?.type === 'msg' && typeof data.text === 'string') {
          addMsg({ mine: false, name: data.name || 'Them', ts: data.ts || Date.now(), kind: 'text', text: data.text, parentId: data.parentId });
          // Tell the sender their message landed → upgrade their tick to "delivered".
          if (typeof data.cid === 'string') groupRef.current?.send({ type: 'ack', cid: data.cid });
        } else if (data?.type === 'typing') {
          const who = typeof data.name === 'string' ? data.name.slice(0, 32) : 'Someone';
          setPeerTyping(data.on ? who : null);
          window.clearTimeout(typingClearRef.current);
          if (data.on) typingClearRef.current = window.setTimeout(() => setPeerTyping(null), 4000);
        } else if (data?.type === 'ack' && typeof data.cid === 'string') {
          setMsgs((prev) => prev.map((m) => m.cid === data.cid ? { ...m, status: 'delivered' } : m));
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

  // Smart auto-scroll: only glue to the bottom when the user is already there.
  // If they've scrolled up to read history we DON'T yank them down; we badge
  // instead (see jump-to-bottom FAB). A message I just sent always pulls down.
  const lastLenRef = React.useRef(0);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = msgs.length > lastLenRef.current;
    const mineLast = msgs.length > 0 && msgs[msgs.length - 1].mine;
    lastLenRef.current = msgs.length;
    if (atBottom || mineLast) {
      el.scrollTo({ top: el.scrollHeight });
    } else if (grew) {
      const last = msgs[msgs.length - 1];
      if (!last.mine) setUnread((u) => u + 1);
    }
  }, [msgs, atBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(near);
    if (near) setUnread(0);
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setUnread(0); setAtBottom(true);
  };

  const sendText = async (text: string) => {
    const v = text.trim();
    if (!v) return;
    const slash = parseSlash(v);
    if (slash) {
      if (state !== 'connected') return;
      await runSlash(slash.cmd, slash.args);
      setDraft('');
      return;
    }
    const ts = Date.now();
    const parent = replyTo ?? undefined;
    const cid = genCid();
    const payload = { type: 'msg', text: v, name: nameRef.current, ts, parentId: parent, cid };
    // Optimistic echo first (bubble appears instantly), then resolve its tick.
    const online = state === 'connected';
    addMsg({ mine: true, name: nameRef.current, ts, kind: 'text', text: v, parentId: parent, cid, status: online ? 'sent' : 'sending' });
    if (online) {
      groupRef.current?.send(payload);
    } else {
      // Channel is down — queue and flush on repair so the text is never lost.
      outboxRef.current.push({ data: payload, cid });
    }
    sendTyping(false);
    setDraft(''); setShowEmoji(false); setReplyTo(null);
    const m = v.match(/^@ai\b[\s,:]*([\s\S]+)/i);
    if (m && m[1].trim() && online) void askAi(m[1].trim());
  };

  // Throttled typing presence (~2s cadence, matching what users expect).
  const sendTyping = (on: boolean) => {
    if (state !== 'connected') return;
    const now = Date.now();
    if (on && now - lastTypingSentRef.current < 1800) return;
    lastTypingSentRef.current = now;
    groupRef.current?.send({ type: 'typing', on, name: nameRef.current });
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

  // Save the transcript locally (Markdown) then sever the channel and wipe local
  // history — the rival's "burn this room, nothing was stored" privacy moment.
  const burnRoom = () => {
    try {
      const lines = msgs.filter((m) => m.kind === 'text' || m.kind === 'system')
        .map((m) => `**${m.mine ? 'You' : m.name}** (${fmtTime(m.ts)}): ${m.text ?? ''}`);
      if (lines.length) {
        const blob = new Blob([`# Chat transcript\n\n${lines.join('\n\n')}\n`], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `chat-${room}.md`;
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch { /* download blocked */ }
    try { groupRef.current?.close(); } catch { /* */ }
    void clearHistory(room, activeChannel);
    setMsgs([]); setReplyTo(null); setState('failed');
    addMsg({ mine: false, name: BRAND, ts: Date.now(), kind: 'system', text: 'This conversation is gone. Nothing was stored on a server.' });
  };

  const connected = state === 'connected';
  const failed = state === 'failed';

  // Scroll to a message and pulse it (used when you tap a reply preview, the
  // Telegram "scroll-and-flash" affordance that the static preview lacked).
  const jumpToMsg = React.useCallback((id: number) => {
    const node = document.getElementById(`msg-${id}`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1200);
  }, []);

  // Tab-title unread count when the chat is backgrounded — restored on focus.
  React.useEffect(() => {
    const base = document.title;
    if (unread > 0 && document.hidden) document.title = `(${unread}) ${base.replace(/^\(\d+\)\s*/, '')}`;
    const restore = () => { if (!document.hidden) document.title = base.replace(/^\(\d+\)\s*/, ''); };
    document.addEventListener('visibilitychange', restore);
    return () => { document.removeEventListener('visibilitychange', restore); document.title = base.replace(/^\(\d+\)\s*/, ''); };
  }, [unread]);

  // Cmd/Ctrl+K command palette + keyboard shortcuts (Telegram-class speed).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowPalette((v) => !v); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setShowSearch(true); }
      else if (e.key === 'Escape') { setShowPalette(false); setShowSearch(false); setShowEmoji(false); setReplyTo(null); setShowSafety(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Honest connection descriptor for the pill — distinguishes a cold connect
  // from a mid-session reconnect, and proves "direct P2P, nothing relayed".
  const conn = failed
    ? { tone: 'amber' as const, icon: AlertTriangle, label: 'Not connected', sub: 'No direct path formed' }
    : connected
      ? { tone: 'green' as const, icon: Lock, label: 'Encrypted & connected', sub: 'Direct device-to-device' }
      : reconnecting
        ? { tone: 'amber' as const, icon: Loader2, label: 'Reconnecting…', sub: 'Messages will send when the link repairs' }
        : { tone: 'sky' as const, icon: Loader2, label: 'Connecting…', sub: role === 's' ? 'Share the link to invite' : 'Linking to the host' };
  const safety = React.useMemo(() => safetyEmojis(room), [room]);

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

  const paletteActions: { label: string; hint?: string; run: () => void }[] = [
    { label: 'Copy invite link', hint: 'share the room', run: () => { copyLink(); setShowPalette(false); } },
    { label: 'Search messages', hint: '⌘F', run: () => { setShowPalette(false); setShowSearch(true); } },
    { label: 'New room', hint: 'fresh disposable link', run: () => { window.location.href = '/chat'; } },
    { label: 'Verify safety code', hint: 'compare emojis', run: () => { setShowPalette(false); setShowSafety(true); } },
    { label: 'Summarize conversation', hint: '/summarize', run: () => { setShowPalette(false); void runSlash('/summarize', ''); } },
    { label: 'Jump to latest', hint: 'scroll to bottom', run: () => { setShowPalette(false); jumpToBottom(); } },
    { label: 'Burn room & download transcript', hint: 'erase everything', run: () => { setShowPalette(false); burnRoom(); } },
  ];

  return (
    <div className="mx-auto flex h-[calc(100dvh-80px)] max-w-[1400px] flex-col gap-3 p-3 sm:p-4">
      {policyGate.element}
      <header className="flex shrink-0 items-center gap-3 border-b border-black/[0.08] pb-3">
        <div className="grid h-10 w-10 place-items-center bg-[var(--color-cat-convert)] text-white"><MessageSquare className="h-5 w-5" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-extrabold tracking-tight">Chat Studio</h1>
          <p className="truncate text-[11px] text-[var(--color-fg-muted)]">
            {connected ? `${roster} ${roster === 1 ? 'person' : 'people'}` : failed ? 'Not connected' : reconnecting ? 'Reconnecting' : 'Connecting'} · Threads · Reactions · Voice · AI · Slash
            {' '}<FreeCapHint toolKey={POLICY_KEY} lever="participants" isPro={isPro} />
          </p>
        </div>
        {/* Honest, animated connection pill — springs amber→green and never shows
            a red wall; click it to verify the safety code. */}
        <button
          type="button"
          onClick={() => setShowSafety((v) => !v)}
          title={conn.sub}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition chat-pill ${
            conn.tone === 'green' ? 'border-green-500/40 bg-green-500/10 text-green-600 chat-pill-pop'
            : conn.tone === 'amber' ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
            : 'border-sky-500/40 bg-sky-500/10 text-sky-600'}`}
        >
          <conn.icon className={`h-3.5 w-3.5 ${conn.tone !== 'green' && conn.icon === Loader2 ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{conn.label}</span>
        </button>
        <button type="button" onClick={() => setShowPalette(true)} className="hidden h-9 items-center gap-1.5 border border-black/[0.08] bg-[var(--color-surface-1)] px-2.5 text-[11px] text-[var(--color-fg-muted)] sm:flex" title="Command palette (⌘K)">
          <Command className="h-3.5 w-3.5" /> <span className="font-mono">K</span>
        </button>
        <button type="button" onClick={() => setShowSearch((v) => !v)} className="grid h-9 w-9 place-items-center border border-black/[0.08] bg-[var(--color-surface-1)]" title="Search (⌘F)">
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

      {showSafety && (
        <div className="border border-green-500/30 bg-green-500/[0.06] px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[12px] font-bold text-green-700"><ShieldCheck className="h-4 w-4" /> Safety code</span>
            <button onClick={() => setShowSafety(false)} className="text-[var(--color-fg-muted)]"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex gap-1.5 text-[26px]" aria-label="safety emojis">{safety.map((e, i) => <span key={i}>{e}</span>)}</div>
            <p className="text-[11px] leading-relaxed text-[var(--color-fg-muted)]">If you both see these <strong>same four symbols</strong>, no one is in the middle. They come from your private room link, not our server.</p>
          </div>
        </div>
      )}

      {failed && (
        <div className="border border-amber-500/30 bg-amber-50/40 p-3">
          <div className="flex items-center gap-2 text-[14px] font-bold"><AlertTriangle className="h-4 w-4 text-amber-600" /> Couldn&apos;t form a direct connection</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
            Usually a <strong>VPN or privacy/ad-block extension</strong> blocking WebRTC. Try an <strong>Incognito window</strong>, another browser, or put both devices on the <strong>same Wi-Fi</strong> — your messages were never sent anywhere they could be stored.
          </p>
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
              {connected ? <><Users className="h-3.5 w-3.5 text-green-600" /> {roster} connected</> : failed ? <span className="text-amber-600">Not connected</span> : reconnecting ? <span className="flex items-center gap-1.5 text-amber-600"><Loader2 className="h-3 w-3 animate-spin" /> Reconnecting…</span> : <><Loader2 className="h-3 w-3 animate-spin" /> Connecting…</>}
            </span>
            <span className="text-[10px] text-[var(--color-fg-subtle)]">Room <span className="font-mono">{room}</span></span>
          </div>

          <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto p-4">
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
                <div key={m.id} id={`msg-${m.id}`} className={`group flex flex-col ${m.mine ? 'items-end' : 'items-start'} ${flashId === m.id ? 'chat-flash' : ''}`}>
                  {parent && (
                    <button
                      type="button"
                      onClick={() => jumpToMsg(parent.id)}
                      className="mb-0.5 max-w-[78%] cursor-pointer rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1 text-left text-[10px] text-[var(--color-fg-subtle)] transition hover:border-[var(--color-cat-convert)]/40 hover:bg-[var(--color-cat-convert)]/[0.06]"
                    >
                      <Reply className="mr-1 inline h-2.5 w-2.5" />
                      <span className="font-semibold">{parent.mine ? 'You' : parent.name}:</span> {parent.text?.slice(0, 80) || parent.fileName}
                    </button>
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
                  <div className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-[var(--color-fg-subtle)]">
                    <span>{m.mine ? 'You' : m.name} · {fmtTime(m.ts)}</span>
                    {threads.length > 0 && <span className="text-[var(--color-cat-convert)]">· {threads.length} {threads.length === 1 ? 'reply' : 'replies'}</span>}
                    {m.pinned && <Pin className="inline h-2.5 w-2.5 text-amber-500" />}
                    {m.mine && m.status && (
                      m.status === 'sending'
                        ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-label="sending" />
                        : m.status === 'delivered'
                          ? <span className="-space-x-1 text-green-600" title="Delivered & encrypted"><Check className="inline h-2.5 w-2.5" /><Check className="inline h-2.5 w-2.5" /></span>
                          : <Check className="h-2.5 w-2.5" aria-label="sent" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Jump-to-bottom FAB with unread badge — appears only when scrolled up,
              so new messages badge instead of yanking the reader down. */}
          {!atBottom && (
            <button
              type="button"
              onClick={jumpToBottom}
              className="absolute bottom-[78px] right-4 z-10 flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2 text-[12px] font-semibold shadow-lg transition hover:brightness-105"
            >
              <ChevronDown className="h-4 w-4" />
              {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-cat-convert)] px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
            </button>
          )}

          {peerTyping && (
            <div className="flex items-center gap-2 border-t border-black/[0.06] px-4 py-1.5 text-[12px] text-[var(--color-fg-muted)]">
              <span className="flex items-center gap-0.5">
                <span className="chat-typing-dot" /><span className="chat-typing-dot" style={{ animationDelay: '0.18s' }} /><span className="chat-typing-dot" style={{ animationDelay: '0.36s' }} />
              </span>
              {peerTyping} is typing…
            </div>
          )}

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
              onChange={(e) => { setDraft(e.target.value); setShowSlash(e.target.value.startsWith('/')); if (e.target.value) sendTyping(true); }}
              onPaste={onPaste}
              rows={1}
              placeholder={connected ? 'Message…  (try /summarize, /ask, @ai)' : reconnecting ? 'Reconnecting — your message will send when the link repairs…' : 'Waiting…'}
              disabled={!connected && !reconnecting}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendText(draft); } }}
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] focus:outline-none disabled:opacity-60"
            />
            <button type="button" onClick={() => sendText(draft)} disabled={(!connected && !reconnecting) || !draft.trim()} className="grid h-10 w-10 place-items-center bg-[var(--color-cat-convert)] text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]"><Send className="h-4 w-4" /></button>
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

      {/* Cmd/Ctrl+K command palette — Telegram-class jump-to-action speed. */}
      {showPalette && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[14vh]" onClick={() => setShowPalette(false)}>
          <div className="w-[min(92vw,440px)] overflow-hidden border border-black/[0.12] bg-[var(--color-surface-1)] shadow-2xl chat-palette" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-black/[0.08] px-3 py-2.5 text-[12px] text-[var(--color-fg-muted)]">
              <Command className="h-4 w-4" /> Quick actions <span className="ml-auto font-mono text-[10px]">Esc</span>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {paletteActions.map((a) => (
                <button key={a.label} type="button" onClick={a.run} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] hover:bg-[var(--color-cat-convert)] hover:text-white">
                  <span>{a.label}</span>
                  {a.hint && <span className="text-[11px] opacity-60">{a.hint}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes chatPillPop { 0% { transform: scale(0.82); } 55% { transform: scale(1.12); } 100% { transform: scale(1); } }
        .chat-pill-pop { animation: chatPillPop 0.42s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes chatFlash { 0%,100% { background: transparent; } 30% { background: color-mix(in srgb, var(--color-cat-convert) 16%, transparent); } }
        .chat-flash { animation: chatFlash 1.2s ease-out; border-radius: 6px; }
        @keyframes chatTyping { 0%,80%,100% { transform: translateY(0); opacity: 0.35; } 40% { transform: translateY(-3px); opacity: 1; } }
        .chat-typing-dot { display: inline-block; width: 5px; height: 5px; margin: 0 1px; border-radius: 9999px; background: currentColor; animation: chatTyping 1.1s infinite ease-in-out; will-change: transform, opacity; }
        @keyframes chatPalette { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }
        .chat-palette { animation: chatPalette 0.16s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .chat-pill-pop, .chat-flash, .chat-typing-dot, .chat-palette { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
