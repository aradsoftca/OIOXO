'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUp, Sparkles, ExternalLink, Rocket, Code2, Play, Mic, Square, Volume2, VolumeX } from 'lucide-react';
import { TileIcon } from '@/components/tiles/TileIcon';
import { respond, type OioxoReply } from '@/lib/ai/oioxo-engine';
import { OioxoLoader, OioxoThinking } from './OioxoBrand';
import { MapView } from './MapView';
import GameBoard from './games/GameBoard';
import { listen, canListen, type Listening } from '@/lib/ai/stt';
import { speak, stopSpeaking, canSpeak } from '@/lib/ai/tts';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  reply?: OioxoReply;
  pending?: boolean;
}

const SUGGESTIONS = [
  'How do I compress a large image?',
  'Convert a PDF to Word',
  'What is the capital of Japan?',
  'Transcribe an audio file',
];

let _id = 0;
const nextId = () => ++_id;

export default function OioxoChat({ onOpenCode }: { onOpenCode?: () => void }) {
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const [speakingId, setSpeakingId] = React.useState<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const listenRef = React.useRef<Listening | null>(null);
  const voiceLangRef = React.useRef<string>('en'); // last spoken language → reply voice
  const [voiceCap, setVoiceCap] = React.useState<{ listen: boolean; speak: boolean }>({ listen: false, speak: false });

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  // Warm the tool embedding matrix once (idempotent, cached in IndexedDB) so the
  // engine's semantic tool recovery (refineRouteWithEncoder → routeToTool) is live;
  // until it's ready the router degrades gracefully to the lexical floor.
  React.useEffect(() => {
    import('@/lib/ai/embed').then((m) => m.warmEmbeddings()).catch(() => {});
    setVoiceCap({ listen: canListen(), speak: canSpeak() });
    return () => { try { stopSpeaking(); } catch { /* noop */ } };
  }, []);

  const send = React.useCallback(
    async (raw: string, opts?: { voice?: boolean }) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput('');
      setBusy(true);
      const userMsg: Msg = { id: nextId(), role: 'user', text };
      const pendingId = nextId();
      // Prior turns give the move policy multi-turn context (so "money for school"
      // inherits the "back to school" topic). Keep it light — the last few turns.
      const history = msgs
        .filter((x) => !x.pending && x.text)
        .slice(-6)
        .map((x) => ({ role: x.role, text: x.text }));
      setMsgs((m) => [...m, userMsg, { id: pendingId, role: 'assistant', text: '', pending: true }]);
      const reply = await respond(text, { history });
      setMsgs((m) =>
        m.map((x) => (x.id === pendingId ? { ...x, text: reply.text, reply, pending: false } : x)),
      );
      setBusy(false);
      taRef.current?.focus();
      // Talk loop: if the user spoke this turn, speak the answer back in their language.
      if (opts?.voice && reply.text) {
        setSpeakingId(pendingId);
        speak(reply.text, voiceLangRef.current).finally(() => setSpeakingId((id) => (id === pendingId ? null : id)));
      }
    },
    [busy, msgs],
  );

  // Push-to-talk: first tap records, second tap stops + transcribes (Whisper,
  // on-device) → auto-sends and enters the talk loop (reply is spoken back).
  const onMic = React.useCallback(async () => {
    if (busy || transcribing) return;
    if (listenRef.current) {
      const handle = listenRef.current;
      listenRef.current = null;
      setRecording(false);
      setTranscribing(true);
      const res = await handle.stop().catch(() => null);
      setTranscribing(false);
      if (res?.text) {
        if (res.lang) voiceLangRef.current = res.lang;
        send(res.text, { voice: true });
      }
      return;
    }
    stopSpeaking();
    const handle = await listen().catch(() => null);
    if (!handle) return; // mic denied / unavailable → user keeps typing
    listenRef.current = handle;
    setRecording(true);
  }, [busy, transcribing, send]);

  // Tap the speaker on any reply to hear it (tap again to stop).
  const onSpeak = React.useCallback((id: number, text: string) => {
    if (speakingId === id) { stopSpeaking(); setSpeakingId(null); return; }
    stopSpeaking();
    setSpeakingId(id);
    speak(text, voiceLangRef.current).finally(() => setSpeakingId((cur) => (cur === id ? null : cur)));
  }, [speakingId]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  const empty = msgs.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* messages / empty state */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/oioxo-logo.png" alt="oioxo" className="oio-hero-logo mb-7 h-10 w-auto" />
            <h1 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
              How can I help you today?
            </h1>
            <p className="mt-2 text-center text-zinc-500">
              Convert, edit, create — or just ask. Runs privately on your device.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-200 px-3.5 py-2 text-sm text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            {msgs.map((m) => (
              <MessageRow
                key={m.id}
                msg={m}
                onAsk={send}
                onOpenCode={onOpenCode}
                onSpeak={voiceCap.speak ? onSpeak : undefined}
                speaking={speakingId === m.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 px-4 pb-4 pt-2 sm:px-6">
        <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm transition focus-within:border-zinc-400 focus-within:shadow">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) onSubmit(e);
              }}
              rows={1}
              placeholder="Ask anything…"
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed placeholder:text-zinc-400 focus:outline-none"
            />
            {voiceCap.listen && (
              <button
                type="button"
                onClick={onMic}
                disabled={busy || transcribing}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-30 ${
                  recording
                    ? 'animate-pulse border-red-300 bg-red-50 text-red-600'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
                aria-label={recording ? 'Stop recording' : 'Speak'}
                title={recording ? 'Stop and send' : 'Speak'}
              >
                {transcribing ? <OioxoLoader size={18} /> : recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E2B24A] text-[#232327] transition hover:bg-[#d6a63f] disabled:opacity-30"
              aria-label="Send"
            >
              {busy ? <OioxoLoader size={20} /> : <ArrowUp className="h-5 w-5" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-zinc-400">
            oioxo can make mistakes — double-check important info. Not a substitute for professional legal, medical, or financial advice.
          </p>
        </form>
      </div>
    </div>
  );
}

function MessageRow({ msg, onAsk, onOpenCode, onSpeak, speaking }: { msg: Msg; onAsk: (s: string) => void; onOpenCode?: () => void; onSpeak?: (id: number, text: string) => void; speaking?: boolean }) {
  if (msg.role === 'user') {
    return (
      <div className="mb-5 flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-zinc-900 px-4 py-2.5 text-[15px] leading-relaxed text-white">
          {msg.text}
        </div>
      </div>
    );
  }
  return (
    <div className="mb-6 flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {msg.pending ? (
          <OioxoThinking />
        ) : (
          <div className="text-[15px] text-zinc-800">
            <Markdown text={msg.text} />
            {onSpeak && msg.text && (
              <button
                type="button"
                onClick={() => onSpeak(msg.id, msg.text)}
                className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] transition ${
                  speaking ? 'text-[#a9801f]' : 'text-zinc-400 hover:text-zinc-600'
                }`}
                aria-label={speaking ? 'Stop' : 'Read aloud'}
                title={speaking ? 'Stop' : 'Read aloud'}
              >
                {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {speaking ? 'Stop' : 'Listen'}
              </button>
            )}
            {msg.reply?.tool && (
              <Link
                href={`/tools/${msg.reply.tool.id}`}
                className="mt-3 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-zinc-300 hover:shadow-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                  <TileIcon name={msg.reply.tool.icon} size={18} strokeWidth={1.75} className="text-zinc-700" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900">{msg.reply.tool.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{msg.reply.tool.blurb}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-zinc-400" />
              </Link>
            )}
            {msg.reply?.openCode && onOpenCode && (
              <button
                type="button"
                onClick={onOpenCode}
                className="mt-3 flex items-center gap-2 rounded-xl border border-[#E2B24A]/50 bg-[#E2B24A]/[0.06] px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:border-[#E2B24A] hover:shadow-sm"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E2B24A]/20 text-[#a9801f]">
                  <Code2 className="h-4 w-4" />
                </span>
                Open Coding workspace
              </button>
            )}
            {msg.reply?.game && <GameBoard kind={msg.reply.game.kind} />}
            {msg.reply?.app && (
              <Link
                href={msg.reply.app.href}
                className="mt-3 flex items-center gap-3 rounded-xl border border-[#E2B24A]/50 bg-[#E2B24A]/[0.06] p-3 transition hover:border-[#E2B24A] hover:shadow-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E2B24A]/20 text-[#a9801f]">
                  <Rocket className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900">Open {msg.reply.app.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{msg.reply.app.blurb}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-zinc-400" />
              </Link>
            )}
            {!!msg.reply?.images?.length && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {msg.reply.images.slice(0, 4).map((img, i) => (
                  <a
                    key={i}
                    href={img.pageUrl || img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={img.title}
                    className="block shrink-0 overflow-hidden rounded-xl border border-zinc-200 transition hover:border-zinc-300"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt=""
                      className="h-28 w-28 bg-zinc-100 object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const a = e.currentTarget.closest('a');
                        if (a) (a as HTMLElement).style.display = 'none';
                      }}
                    />
                  </a>
                ))}
              </div>
            )}
            {!!msg.reply?.map?.points?.length && (
              <MapView points={msg.reply.map.points} line={msg.reply.map.line} />
            )}
            {!!msg.reply?.videos?.length && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {msg.reply.videos.slice(0, 3).map((v, i) => (
                  <a
                    key={i}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={v.title}
                    className="group relative block w-44 shrink-0 overflow-hidden rounded-xl border border-zinc-200 transition hover:border-zinc-300"
                  >
                    {v.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnail} alt="" className="h-24 w-44 bg-zinc-100 object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-24 w-44 items-center justify-center bg-zinc-100" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Play className="h-8 w-8 fill-white/90 text-white drop-shadow" />
                    </span>
                    <span className="block truncate px-2 py-1.5 text-[11px] text-zinc-600">{v.title}</span>
                  </a>
                ))}
              </div>
            )}
            {!!msg.reply?.related?.length && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {msg.reply.related.slice(0, 4).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onAsk(r)}
                    className="rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] text-zinc-600 transition hover:bg-zinc-200"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Minimal, safe markdown: fenced code blocks, **bold**, `inline code`, paragraphs. */
function Markdown({ text }: { text: string }) {
  const parts = text.split('```');
  return (
    <>
      {parts.map((part, idx) => {
        if (idx % 2 === 1) {
          const body = part.replace(/^[a-zA-Z0-9+-]*\n/, '');
          return (
            <pre
              key={idx}
              className="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-[13px] leading-relaxed text-zinc-100"
            >
              <code>{body}</code>
            </pre>
          );
        }
        return part
          .split(/\n{2,}/)
          .map((para, pi) =>
            para.trim() ? (
              <p key={`${idx}-${pi}`} className="mb-2 whitespace-pre-wrap leading-relaxed last:mb-0">
                {renderInline(para, `${idx}-${pi}`)}
              </p>
            ) : null,
          );
      })}
    </>
  );
}

function renderInline(s: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={`${keyPrefix}-b${i}`}>{m[2]}</strong>);
    else if (m[3] != null)
      nodes.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[13px] text-zinc-800">
          {m[3]}
        </code>,
      );
    last = m.index + m[0].length;
    i++;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}
