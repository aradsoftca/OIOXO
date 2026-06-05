'use client';
import * as React from 'react';
import { Upload, X, Music } from 'lucide-react';
import { decode, type AudioInfo, getInfo } from '@/engines/audio';
import { useStagedInput } from '@/lib/ai/handoff';
import { checkFreeSize } from '@/lib/usage/size-gate';

export interface AudioFileItem {
  file: File;
  buffer: AudioBuffer;
  info: AudioInfo;
}

interface SingleProps {
  multiple?: false;
  onLoad: (item: AudioFileItem) => void;
  loaded: boolean;
  fileName?: string;
  onClear?: () => void;
}

interface MultiProps {
  multiple: true;
  items: AudioFileItem[];
  onItemsChange: (items: AudioFileItem[]) => void;
}

type Props = SingleProps | MultiProps;

async function loadFile(file: File): Promise<AudioFileItem> {
  const buf = await file.arrayBuffer();
  const audioBuf = await decode(buf);
  return { file, buffer: audioBuf, info: getInfo(audioBuf, file.size) };
}

function isAudio(f: File): boolean {
  if (f.type.startsWith('audio/')) return true;
  const lower = f.name.toLowerCase();
  return /\.(mp3|wav|m4a|aac|ogg|flac|opus|webm)$/.test(lower);
}

/** True while the user is typing in an editable field — used to ignore paste. */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

export function AudioDrop(props: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handle = async (files: FileList | File[]) => {
    setError('');
    setBusy(true);
    try {
      const list = Array.from(files).filter(isAudio);
      if (!list.length) { setError('Drop an audio file.'); return; }
      // Free size gate — block on the largest file, show the upgrade prompt.
      // Iterate instead of spreading: Math.max(...arr) with a huge arr (10k+
      // files via folder-drop) blows the JS argument-count stack on V8.
      let maxSize = 0;
      for (const f of list) if (f.size > maxSize) maxSize = f.size;
      if (!(await checkFreeSize('audio', maxSize))) return;
      // Decode serially, not in parallel. Each decoded AudioBuffer can be
      // ~10x the source file size (float PCM); 10 MP3s in parallel was
      // enough to OOM mobile browsers. Sequencing trades wall time for
      // peak memory — the right call when the alternative is a tab crash.
      const items: AudioFileItem[] = [];
      for (const f of list) items.push(await loadFile(f));
      if (props.multiple) {
        props.onItemsChange([...props.items, ...items]);
      } else {
        props.onLoad(items[0]);
      }
    } catch (e) {
      setError((e as Error).message || 'Could not read this audio file.');
    } finally {
      setBusy(false);
    }
  };

  // Pick up a file the AI staged before navigating here.
  useStagedInput((f) => { void handle([f]); });

  // Clipboard paste: paste an audio file (or a recording copied from another
  // app / OS file manager) straight into the tool — same path as drop. Keep a
  // ref to the latest handler so the once-registered listener never goes stale.
  const handleRef = React.useRef(handle);
  handleRef.current = handle;
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return; // don't hijack paste in text fields
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      const audio = Array.from(files).filter(isAudio);
      if (!audio.length) return;
      e.preventDefault();
      void handleRef.current(audio);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // Drag state handlers shared by both layouts. dragenter/over set active;
  // dragleave only clears when the pointer actually leaves the zone (not when
  // it crosses a child element — relatedTarget stays inside in that case).
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); if (!dragActive) setDragActive(true); };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) void handle(e.dataTransfer.files);
  };

  if (props.multiple) {
    return (
      <div className="space-y-2">
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          className={`border border-dashed p-5 transition-colors ${dragActive ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)]/[0.06]' : 'border-black/[0.15] bg-[var(--color-surface-1)]'}`}
        >
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="flex w-full flex-col items-center gap-2 text-center">
            <Upload className={`h-6 w-6 ${dragActive ? 'text-[var(--color-cat-audio)]' : 'text-[var(--color-fg-muted)]'}`} />
            <div className="text-[13px] font-semibold">{busy ? 'Loading…' : dragActive ? 'Drop to add' : 'Drop audio files, paste, or click to add'}</div>
            <div className="text-[10px] text-[var(--color-fg-muted)]">MP3 · WAV · M4A · OGG · FLAC</div>
          </button>
          <input ref={inputRef} type="file" accept="audio/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ''; }} />
        </div>

        {props.items.length > 0 && (
          <ul className="space-y-1">
            {props.items.map((it, i) => (
              <li key={i} className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2">
                <Music className="h-4 w-4 text-[var(--color-cat-audio)] shrink-0" />
                <span className="flex-1 text-[12px] truncate">{it.file.name}</span>
                <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{it.info.duration.toFixed(1)}s</span>
                <div className="flex">
                  <button type="button" disabled={i === 0}
                    onClick={() => {
                      const next = [...props.items];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      props.onItemsChange(next);
                    }}
                    className="px-1 text-[10px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30">↑</button>
                  <button type="button" disabled={i === props.items.length - 1}
                    onClick={() => {
                      const next = [...props.items];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]];
                      props.onItemsChange(next);
                    }}
                    className="px-1 text-[10px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30">↓</button>
                </div>
                <button type="button"
                  onClick={() => props.onItemsChange(props.items.filter((_, j) => j !== i))}
                  className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <div className="text-[12px] text-red-600">{error}</div>}
      </div>
    );
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      className={`border border-dashed p-6 transition-colors ${dragActive ? 'border-[var(--color-cat-audio)] bg-[var(--color-cat-audio)]/[0.06]' : 'border-black/[0.15] bg-[var(--color-surface-1)]'}`}
    >
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="flex w-full flex-col items-center gap-3 text-center">
        <Upload className={`h-7 w-7 ${dragActive ? 'text-[var(--color-cat-audio)]' : 'text-[var(--color-fg-muted)]'}`} />
        <div className="text-[14px] font-semibold">
          {props.loaded && props.fileName ? props.fileName : busy ? 'Decoding…' : dragActive ? 'Drop to load' : 'Drop an audio file, paste, or click'}
        </div>
        <div className="text-[11px] text-[var(--color-fg-muted)]">MP3 · WAV · M4A · OGG · FLAC</div>
      </button>
      <input ref={inputRef} type="file" accept="audio/*" className="hidden"
        onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ''; }} />
      {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
