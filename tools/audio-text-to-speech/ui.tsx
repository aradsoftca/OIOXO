'use client';

import * as React from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Play, Pause, Square, Volume2 } from 'lucide-react';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'audio-text-to-speech';

interface VoiceOption {
  voice: SpeechSynthesisVoice;
  label: string;
}

export default function AudioTextToSpeechTool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [text, setText] = React.useState(
    'Hello, and welcome to Xonvert. Type or paste any text here and pick a voice to read it aloud.',
  );
  const [voices, setVoices] = React.useState<VoiceOption[]>([]);
  const [voiceURI, setVoiceURI] = React.useState<string>('');
  const [rate, setRate] = React.useState(1);
  const [pitch, setPitch] = React.useState(1);
  const [volume, setVolume] = React.useState(1);
  const [playing, setPlaying] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [supported, setSupported] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }
    const refresh = () => {
      const list = window.speechSynthesis.getVoices().map((v) => ({
        voice: v,
        label: `${v.name} — ${v.lang}${v.default ? ' (default)' : ''}`,
      }));
      setVoices(list);
      if (!voiceURI && list.length) {
        const def = list.find((v) => v.voice.default) ?? list[0];
        setVoiceURI(def.voice.voiceURI);
      }
    };
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [voiceURI]);

  // Stop any in-flight speech on unmount. Without this, navigating away
  // while the voice was reading left the synthesizer running for the rest
  // of the page lifetime — the user would hear the entire passage finish
  // out loud on whatever tool they navigated to.
  React.useEffect(() => () => {
    try { window.speechSynthesis?.cancel(); } catch { /* */ }
  }, []);

  const buildUtterance = (): SpeechSynthesisUtterance => {
    const u = new SpeechSynthesisUtterance(text);
    const picked = voices.find((v) => v.voice.voiceURI === voiceURI);
    if (picked) {
      u.voice = picked.voice;
      u.lang = picked.voice.lang;
    }
    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume;
    u.onend = () => { setPlaying(false); setPaused(false); };
    u.onerror = (e) => { setError((e as SpeechSynthesisErrorEvent).error || 'Playback error'); setPlaying(false); setPaused(false); };
    return u;
  };

  const play = () => {
    if (!supported || !text.trim()) return;
    setError('');
    window.speechSynthesis.cancel();
    const u = buildUtterance();
    window.speechSynthesis.speak(u);
    setPlaying(true);
    setPaused(false);
  };

  const pause = () => { window.speechSynthesis.pause(); setPaused(true); };
  const resume = () => { window.speechSynthesis.resume(); setPaused(false); };
  const stop = () => { window.speechSynthesis.cancel(); setPlaying(false); setPaused(false); };
  // NOTE: this is a read-aloud tool using the browser's built-in Web Speech
  // voices, which no browser exposes as a recordable stream — so there is no
  // honest "Save audio" path here (a dead Save button + a false
  // produces:['audio/wav'] manifest claim were removed). Saving real audio
  // needs an on-device neural TTS model (separate feature).

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      {policyGate.element}
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Type or paste text to read aloud…"
          className="block w-full resize-y border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[13px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:border-[var(--color-cat-audio)]"
        />
        <div className="flex flex-wrap gap-2">
          {!playing && (
            <button type="button" onClick={play} disabled={!supported || !text.trim()}
              className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none">
              <Play className="h-3.5 w-3.5" />
              Play
            </button>
          )}
          {playing && !paused && (
            <button type="button" onClick={pause}
              className="flex items-center gap-2 border border-black/[0.08] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          )}
          {playing && paused && (
            <button type="button" onClick={resume}
              className="flex items-center gap-2 bg-[var(--color-cat-audio)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          )}
          {playing && (
            <button type="button" onClick={stop}
              className="flex items-center gap-2 border border-black/[0.08] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]">
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          )}
        </div>
        {!supported && (
          <div className="border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-700">
            This browser does not support speech synthesis. Try a recent version of Chrome, Edge, Firefox, or Safari.
          </div>
        )}
        {error && <div className="text-[12px] text-amber-700">{error}</div>}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            <Volume2 className="h-3 w-3" />
            Voice ({voices.length})
          </div>
          <select
            value={voiceURI}
            onChange={(e) => setVoiceURI(e.target.value)}
            className="mt-2 w-full border border-black/[0.08] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-fg)] focus:outline-none focus:border-[var(--color-cat-audio)]"
          >
            {voices.map((v) => (
              <option key={v.voice.voiceURI} value={v.voice.voiceURI}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          {[
            { label: 'Speed', value: rate, set: setRate, min: 0.5, max: 2, step: 0.05 },
            { label: 'Pitch', value: pitch, set: setPitch, min: 0, max: 2, step: 0.05 },
            { label: 'Volume', value: volume, set: setVolume, min: 0, max: 1, step: 0.05 },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{s.label}</span>
                <span className="font-mono text-[12px] tabular-nums">{s.value.toFixed(2)}</span>
              </div>
              <Slider.Root value={[s.value]} min={s.min} max={s.max} step={s.step}
                onValueChange={([v]) => s.set(v)}
                className="relative mt-2 flex h-5 w-full touch-none items-center">
                <Slider.Track className="relative h-1.5 grow bg-black/[0.08]">
                  <Slider.Range className="absolute h-full bg-[var(--color-cat-audio)]" />
                </Slider.Track>
                <Slider.Thumb className="block h-4 w-4 border-2 border-[var(--color-fg)] bg-[var(--color-cat-audio)]" />
              </Slider.Root>
            </div>
          ))}
        </div>

        <div className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
          Voices come from your operating system. Add more by installing language packs in your OS speech settings.
        </div>
      </aside>
    </div>
  );
}
