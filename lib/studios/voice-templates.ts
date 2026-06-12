// Audio-Voice Studio templates — ready-made track layouts for common voice
// projects (podcast, audiobook, voiceover…).
//
// Voice clips reference raw PCM that can't be embedded in a template, so a
// template here pre-configures the TRACK ARRANGEMENT (named, leveled, panned
// lanes) the user then fills with recordings. That removes the "blank 4 tracks,
// what goes where?" friction. Materializes into the studio's DocState.

export type VoiceTemplateCategory = 'podcast' | 'narration' | 'commercial' | 'creative';

interface TrackLike {
  id: string; label: string;
  muted: boolean; solo: boolean; locked: boolean;
  volume: number; pan: number;
}

interface VoiceDocLike {
  name: string;
  tracks: TrackLike[];
  clips: unknown[];
  selectedId: string | null;
  playhead: number;
  master: { volume: number; normalize: boolean };
}

export interface VoiceTemplate {
  id: string;
  name: string;
  category: VoiceTemplateCategory;
  description: string;
  /** Track lanes, top→bottom. volume 0..1, pan -1..1. */
  tracks: { label: string; volume?: number; pan?: number; muted?: boolean }[];
  /** Whether the master should normalize on export. */
  normalize?: boolean;
}

export const VOICE_TEMPLATES: VoiceTemplate[] = [
  {
    id: 'podcast-2host', name: 'Podcast — 2 Hosts', category: 'podcast',
    description: 'Two host lanes, intro/outro music, and an SFX track.',
    tracks: [
      { label: 'Host A', pan: -0.2 },
      { label: 'Host B', pan: 0.2 },
      { label: 'Intro / Outro', volume: 0.6 },
      { label: 'SFX / Stingers', volume: 0.7 },
    ],
    normalize: true,
  },
  {
    id: 'podcast-solo', name: 'Podcast — Solo', category: 'podcast',
    description: 'Single voice with a music bed and ad-spot lane.',
    tracks: [
      { label: 'Voice' },
      { label: 'Music Bed', volume: 0.4 },
      { label: 'Ad Spot', volume: 0.8 },
    ],
    normalize: true,
  },
  {
    id: 'interview', name: 'Interview', category: 'podcast',
    description: 'Host, guest, and a room-tone lane for clean edits.',
    tracks: [
      { label: 'Host', pan: -0.25 },
      { label: 'Guest', pan: 0.25 },
      { label: 'Room Tone', volume: 0.3 },
    ],
    normalize: true,
  },
  {
    id: 'panel', name: 'Panel / Roundtable', category: 'podcast',
    description: 'Four speaker lanes panned across the stereo field.',
    tracks: [
      { label: 'Speaker 1', pan: -0.4 },
      { label: 'Speaker 2', pan: -0.15 },
      { label: 'Speaker 3', pan: 0.15 },
      { label: 'Speaker 4', pan: 0.4 },
    ],
    normalize: true,
  },
  {
    id: 'audiobook', name: 'Audiobook', category: 'narration',
    description: 'Narrator lane, chapter markers, and soft ambience.',
    tracks: [
      { label: 'Narrator' },
      { label: 'Chapter Markers', volume: 0.8 },
      { label: 'Ambience', volume: 0.25 },
    ],
    normalize: true,
  },
  {
    id: 'voiceover', name: 'Voiceover / Narration', category: 'narration',
    description: 'VO lane over a duckable music bed.',
    tracks: [
      { label: 'Voiceover' },
      { label: 'Music Bed', volume: 0.35 },
    ],
    normalize: true,
  },
  {
    id: 'elearning', name: 'E-Learning Module', category: 'narration',
    description: 'Narration, on-screen cues, and background music.',
    tracks: [
      { label: 'Narration' },
      { label: 'UI / Cue SFX', volume: 0.6 },
      { label: 'Background Music', volume: 0.3 },
    ],
    normalize: true,
  },
  {
    id: 'radio-ad', name: 'Radio / Podcast Ad', category: 'commercial',
    description: 'Announcer, music bed, and a punchy SFX lane.',
    tracks: [
      { label: 'Announcer' },
      { label: 'Music Bed', volume: 0.5 },
      { label: 'SFX', volume: 0.8 },
    ],
    normalize: true,
  },
  {
    id: 'explainer', name: 'Explainer Video VO', category: 'commercial',
    description: 'Voiceover synced lane + light music + whoosh SFX.',
    tracks: [
      { label: 'VO' },
      { label: 'Music', volume: 0.3 },
      { label: 'Transitions / Whoosh', volume: 0.7 },
    ],
    normalize: true,
  },
  {
    id: 'meditation', name: 'Meditation / Sleep', category: 'creative',
    description: 'Calm guide voice over layered ambient pads.',
    tracks: [
      { label: 'Guide Voice' },
      { label: 'Ambient Pad', volume: 0.4 },
      { label: 'Nature Bed', volume: 0.3 },
    ],
    normalize: false,
  },
  {
    id: 'asmr', name: 'ASMR', category: 'creative',
    description: 'Hard-panned trigger lanes for binaural feel.',
    tracks: [
      { label: 'Whisper L', pan: -0.6 },
      { label: 'Whisper R', pan: 0.6 },
      { label: 'Triggers', volume: 0.8 },
    ],
    normalize: false,
  },
  {
    id: 'drama', name: 'Audio Drama', category: 'creative',
    description: 'Multiple character lanes, foley, and score.',
    tracks: [
      { label: 'Character A', pan: -0.3 },
      { label: 'Character B', pan: 0.3 },
      { label: 'Narrator' },
      { label: 'Foley / SFX', volume: 0.7 },
      { label: 'Score', volume: 0.4 },
    ],
    normalize: true,
  },
  {
    id: 'podcast-3host', name: 'Podcast — 3 Hosts', category: 'podcast',
    description: 'Three host lanes, music, and an SFX track.',
    tracks: [
      { label: 'Host A', pan: -0.3 },
      { label: 'Host B' },
      { label: 'Host C', pan: 0.3 },
      { label: 'Music / SFX', volume: 0.6 },
    ],
    normalize: true,
  },
  {
    id: 'remote-guest', name: 'Remote Guest Call', category: 'podcast',
    description: 'Local host + remote guest + backup safety track.',
    tracks: [
      { label: 'Host (local)', pan: -0.2 },
      { label: 'Guest (remote)', pan: 0.2 },
      { label: 'Backup / Safety', volume: 0.9, muted: true },
    ],
    normalize: true,
  },
  {
    id: 'news-bulletin', name: 'News Bulletin', category: 'narration',
    description: 'Anchor read with stinger and bed.',
    tracks: [
      { label: 'Anchor' },
      { label: 'Stinger', volume: 0.8 },
      { label: 'News Bed', volume: 0.3 },
    ],
    normalize: true,
  },
  {
    id: 'ivr-prompts', name: 'IVR / Phone Prompts', category: 'commercial',
    description: 'Phone-system greeting and menu prompts.',
    tracks: [
      { label: 'Greeting' },
      { label: 'Menu Options' },
      { label: 'Hold Music', volume: 0.4 },
    ],
    normalize: true,
  },
  {
    id: 'product-demo-vo', name: 'Product Demo VO', category: 'commercial',
    description: 'Narration synced to a product walkthrough.',
    tracks: [
      { label: 'Narration' },
      { label: 'UI Sounds', volume: 0.5 },
      { label: 'Music', volume: 0.3 },
    ],
    normalize: true,
  },
  {
    id: 'character-vo', name: 'Character Voices', category: 'creative',
    description: 'Separate lanes per character for animation/games.',
    tracks: [
      { label: 'Hero', pan: -0.2 },
      { label: 'Villain', pan: 0.2 },
      { label: 'Sidekick' },
      { label: 'Crowd / Extras', volume: 0.6 },
    ],
    normalize: true,
  },
  {
    id: 'asmr-roleplay', name: 'ASMR Roleplay', category: 'creative',
    description: 'Close-mic voice with layered binaural triggers.',
    tracks: [
      { label: 'Voice (close)' },
      { label: 'Triggers L', pan: -0.7 },
      { label: 'Triggers R', pan: 0.7 },
      { label: 'Ambience', volume: 0.3 },
    ],
    normalize: false,
  },
  {
    id: 'sleep-story', name: 'Sleep Story', category: 'narration',
    description: 'Soft narrator over warm ambient layers.',
    tracks: [
      { label: 'Narrator (soft)' },
      { label: 'Warm Pad', volume: 0.35 },
      { label: 'Rain / Nature', volume: 0.3 },
    ],
    normalize: false,
  },
];

export function voiceTemplatesByCategory(cat: VoiceTemplateCategory | 'all'): VoiceTemplate[] {
  return cat === 'all' ? VOICE_TEMPLATES : VOICE_TEMPLATES.filter(t => t.category === cat);
}

export const VOICE_TEMPLATE_CATEGORIES: { id: VoiceTemplateCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'narration', label: 'Narration' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'creative', label: 'Creative' },
];

let _vid = 0;
function vtid() { return `vt${++_vid}_${Math.random().toString(36).slice(2, 5)}`; }

export function materializeVoiceTemplate(t: VoiceTemplate): VoiceDocLike {
  return {
    name: t.name,
    tracks: t.tracks.map(tr => ({
      id: vtid(), label: tr.label,
      muted: !!tr.muted, solo: false, locked: false,
      volume: tr.volume ?? 1, pan: tr.pan ?? 0,
    })),
    clips: [],
    selectedId: null,
    playhead: 0,
    master: { volume: 1, normalize: t.normalize ?? false },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail: a small mixer diagram — one labelled lane per track with a level
// bar and a pan indicator.
// ─────────────────────────────────────────────────────────────────────────────

const LANE_COLORS = ['#22d3ee', '#a855f7', '#22c55e', '#f59e0b', '#ec4899'];

export function renderVoiceThumb(t: VoiceTemplate, w = 360, h = 220): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.dataset.nowm = '1';
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, w, h);

  const n = t.tracks.length;
  const padX = 14, padY = 16;
  const laneH = Math.min(34, (h - padY * 2) / Math.max(1, n) - 6);
  const gap = ((h - padY * 2) - laneH * n) / Math.max(1, n - 1 || 1);

  t.tracks.forEach((tr, i) => {
    const y = padY + i * (laneH + (n > 1 ? gap : 0));
    const color = LANE_COLORS[i % LANE_COLORS.length];
    // lane background
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    ctx.fillRect(padX, y, w - padX * 2, laneH);
    // colour tab
    ctx.fillStyle = color;
    ctx.fillRect(padX, y, 4, laneH);
    // label
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(tr.label, padX + 12, y + laneH / 2);
    // level bar (right side) scaled by volume
    const vol = tr.volume ?? 1;
    const barMaxW = (w - padX * 2) * 0.32;
    const barW = barMaxW * vol;
    const barX = w - padX - barMaxW;
    const barY = y + laneH / 2 - 3;
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fillRect(barX, barY, barMaxW, 6);
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, barW, 6);
  });
  return c.toDataURL('image/png');
}
