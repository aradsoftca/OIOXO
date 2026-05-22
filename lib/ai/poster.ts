/**
 * Xonvert AI — poster / thumbnail composer.
 *
 * The "magic with light tech" image maker: instead of generating pixels from
 * noise (a 1–2 GB model), the on-device LLM ART-DIRECTS a layered canvas render.
 * The model emits only a small layout spec; everything visual is drawn on a
 * <canvas>: gradient background → scene silhouette → subject → bold typography.
 *
 * Subjects render as crisp Lucide VECTOR icons where one fits, fall back to a
 * colour emoji, and finally to a bold monogram of the title — so a subject is
 * NEVER blank. Great at exactly what diffusion is worst at (legible text), adds
 * no model download, and renders instantly on any device.
 */

import { emojiFor } from '@/lib/ai-magic';
import { ICON_BODIES } from '@/lib/ai/poster-icons';
import { applyFilter, FILTERS, type FilterKey } from '@/lib/ai/poster-filters';

export type PosterBackground = 'gradient' | 'photo';
export type PosterFormat = 'wide' | 'square' | 'tall';
export type PosterScene = 'none' | 'mountains' | 'city' | 'desert' | 'waves' | 'hills' | 'forest' | 'stars';
export type PosterLayout = 'center' | 'left' | 'right' | 'lower';
export type PosterMood = 'dramatic' | 'clean' | 'vibrant' | 'dark' | 'warm' | 'cool';
export type PaletteKey =
  | 'sunset' | 'ocean' | 'forest' | 'neon' | 'royal' | 'fire' | 'mint'
  | 'candy' | 'mono' | 'gold' | 'berry' | 'sky';

export interface PosterSpec {
  title: string;
  subtitle: string;
  subject: string;
  scene: PosterScene;
  palette: PaletteKey;
  mood: PosterMood;
  layout: PosterLayout;
  format: PosterFormat;
  background: PosterBackground;
  filter: FilterKey;
  photoUrl?: string; // set when a stock photo is fetched + loaded
  credit?: string;   // photographer · provider, for attribution
}

export const POSTER_BACKGROUNDS: PosterBackground[] = ['gradient', 'photo'];
export const POSTER_SCENES: PosterScene[] = ['none', 'mountains', 'city', 'desert', 'waves', 'hills', 'forest', 'stars'];
export const POSTER_LAYOUTS: PosterLayout[] = ['center', 'left', 'right', 'lower'];
export const POSTER_MOODS: PosterMood[] = ['dramatic', 'clean', 'vibrant', 'dark', 'warm', 'cool'];
export const POSTER_FORMATS: PosterFormat[] = ['wide', 'square', 'tall'];

const SIZES: Record<PosterFormat, { w: number; h: number }> = {
  wide: { w: 1280, h: 720 },
  square: { w: 1080, h: 1080 },
  tall: { w: 1080, h: 1350 },
};

const PALETTES: Record<PaletteKey, [string, string, string, string]> = {
  sunset: ['#2b1055', '#7597de', '#ff7e5f', '#ffd166'],
  ocean: ['#0f2027', '#2c5364', '#2193b0', '#6dd5ed'],
  forest: ['#0b3d2e', '#134e5e', '#71b280', '#a8e063'],
  neon: ['#0d0221', '#3a0ca3', '#f72585', '#4cc9f0'],
  royal: ['#10002b', '#3c096c', '#7b2cbf', '#e0aaff'],
  fire: ['#1a0000', '#7a1f00', '#f12711', '#f5af19'],
  mint: ['#04352e', '#0b6e4f', '#43cea2', '#a8ff78'],
  candy: ['#3a0ca3', '#b5179e', '#ff6a88', '#ffd6e0'],
  mono: ['#0a0a0a', '#2b2b2b', '#6b6b6b', '#f2f2f2'],
  gold: ['#1a1206', '#5c3d0c', '#c9971f', '#ffe08a'],
  berry: ['#1b022b', '#5a189a', '#c11574', '#ff8fab'],
  sky: ['#0b3866', '#1d6fb8', '#56b4f0', '#cfeaff'],
};

// Subject library: keyword → [emoji, lucide-icon?]. ~190 entries. A Lucide icon
// (when present) renders as a crisp vector; otherwise the emoji is used.
const SUBJECTS: Record<string, [string, string?]> = {
  // places / structures
  pyramid: ['🔺'], pyramids: ['🔺'], egypt: ['🐫'], sphinx: ['🦁'], desert: ['🏜️'],
  mountain: ['⛰️', 'mountain'], mountains: ['🏔️', 'mountain-snow'], peak: ['🏔️', 'mountain-snow'],
  volcano: ['🌋'], city: ['🏙️', 'building-2'], building: ['🏢', 'building-2'], skyline: ['🏙️', 'building-2'],
  castle: ['🏰', 'castle'], house: ['🏠', 'house'], home: ['🏠', 'house'], tower: ['🗼'],
  bridge: ['🌉'], factory: ['🏭'], church: ['⛪'], statue: ['🗽'], camp: ['⛺', 'tent-tree'],
  tent: ['⛺', 'tent-tree'], island: ['🏝️'], beach: ['🏖️'], school: ['🎓', 'graduation-cap'],
  university: ['🎓', 'graduation-cap'], hospital: ['🏥', 'stethoscope'],
  // nature / space
  sun: ['☀️', 'sun'], sunset: ['🌅', 'sun'], moon: ['🌙', 'moon'], night: ['🌙', 'moon'],
  star: ['⭐', 'star'], stars: ['✨', 'sparkles'], magic: ['✨', 'sparkles'], sparkle: ['✨', 'sparkles'],
  planet: ['🪐'], earth: ['🌍', 'globe'], world: ['🌍', 'globe'], globe: ['🌐', 'globe'],
  galaxy: ['🌌'], cosmos: ['🌌'], nebula: ['🌌'], universe: ['🌌'], milkyway: ['🌌'], milky: ['🌌'], cosmic: ['🌌'], astronomy: ['🔭', 'telescope'],
  space: ['🚀', 'rocket'], rocket: ['🚀', 'rocket'], launch: ['🚀', 'rocket'], startup: ['🚀', 'rocket'],
  ufo: ['🛸'], alien: ['👽'], comet: ['☄️'], rainbow: ['🌈'], cloud: ['☁️', 'cloud'],
  storm: ['⛈️', 'cloud-lightning'], thunder: ['⛈️', 'cloud-lightning'], snow: ['❄️', 'snowflake'],
  winter: ['❄️', 'snowflake'], fire: ['🔥', 'flame'], flame: ['🔥', 'flame'], hot: ['🔥', 'flame'],
  water: ['💧', 'droplet'], rain: ['💧', 'droplet'], wave: ['🌊', 'waves'], waves: ['🌊', 'waves'],
  ocean: ['🌊', 'waves'], sea: ['🌊', 'waves'], surf: ['🏄', 'waves'], tree: ['🌳', 'trees'],
  forest: ['🌲', 'tree-pine'], pine: ['🌲', 'tree-pine'], palm: ['🌴', 'tree-palm'], tropical: ['🌴', 'tree-palm'],
  flower: ['🌸', 'flower'], rose: ['🌹', 'flower'], leaf: ['🍃', 'leaf'], plant: ['🌱', 'leaf'],
  mushroom: ['🍄'], cactus: ['🌵'],
  // animals
  cat: ['🐱', 'cat'], kitten: ['🐱', 'cat'], dog: ['🐶', 'dog'], puppy: ['🐶', 'dog'],
  fox: ['🦊'], lion: ['🦁'], tiger: ['🐯'], wolf: ['🐺'], bear: ['🐻'], panda: ['🐼'],
  horse: ['🐴'], unicorn: ['🦄'], dragon: ['🐉'], dinosaur: ['🦖'], rex: ['🦖'],
  bird: ['🐦', 'bird'], eagle: ['🦅', 'bird'], owl: ['🦉', 'bird'], fish: ['🐠', 'fish'],
  shark: ['🦈', 'fish'], whale: ['🐳'], dolphin: ['🐬'], octopus: ['🐙'], rabbit: ['🐰', 'rabbit'],
  bunny: ['🐰', 'rabbit'], butterfly: ['🦋'], bee: ['🐝', 'bug'], bug: ['🐛', 'bug'], insect: ['🐛', 'bug'],
  snake: ['🐍'], frog: ['🐸'], monkey: ['🐵'], elephant: ['🐘'], camel: ['🐫'], penguin: ['🐧'],
  // people / heroes / combat
  hero: ['🦸'], superhero: ['🦸'], superman: ['🦸'], batman: ['🦇'], bat: ['🦇'],
  villain: ['🦹'], ninja: ['🥷'], warrior: ['⚔️', 'swords'], knight: ['🛡️', 'shield'],
  fight: ['🥊', 'swords'], battle: ['⚔️', 'swords'], war: ['⚔️', 'swords'], versus: ['⚔️', 'swords'],
  vs: ['⚔️', 'swords'], boxing: ['🥊'], punch: ['🥊'], sword: ['🗡️', 'sword'], shield: ['🛡️', 'shield'],
  fist: ['✊'], king: ['👑', 'crown'], queen: ['👑', 'crown'], wizard: ['🧙'], zombie: ['🧟'],
  pirate: ['🏴‍☠️'], detective: ['🕵️'], spy: ['🕵️'],
  // tech / gaming
  robot: ['🤖', 'bot'], ai: ['🤖', 'bot'], bot: ['🤖', 'bot'], brain: ['🧠', 'brain'], mind: ['🧠', 'brain'],
  computer: ['💻', 'monitor'], laptop: ['💻', 'laptop'], pc: ['🖥️', 'monitor'], phone: ['📱', 'smartphone'],
  mobile: ['📱', 'smartphone'], game: ['🎮', 'gamepad-2'], gaming: ['🎮', 'gamepad-2'],
  controller: ['🎮', 'gamepad-2'], gamepad: ['🎮', 'gamepad-2'], code: ['💻', 'code'], coding: ['💻', 'code'],
  developer: ['👨‍💻', 'code'], chip: ['🔋', 'cpu'], cpu: ['🖥️', 'cpu'], tech: ['⚙️', 'cpu'],
  wifi: ['📶', 'wifi'], internet: ['🌐', 'wifi'], dna: ['🧬', 'dna'], science: ['🔬', 'beaker'],
  lab: ['🧪', 'beaker'], atom: ['⚛️', 'atom'], physics: ['⚛️', 'atom'], chemistry: ['🧪', 'beaker'],
  // media / creative
  camera: ['📷', 'camera'], photo: ['📷', 'camera'], video: ['🎬', 'clapperboard'], movie: ['🎬', 'clapperboard'],
  film: ['🎞️', 'film'], cinema: ['🎬', 'clapperboard'], tv: ['📺', 'tv'], stream: ['📺', 'tv'],
  podcast: ['🎙️', 'mic'], radio: ['📻', 'radio'], news: ['📰', 'newspaper'], music: ['🎵', 'music'],
  song: ['🎵', 'music'], note: ['🎵', 'music'], guitar: ['🎸', 'guitar'], band: ['🎸', 'guitar'],
  mic: ['🎤', 'mic'], sing: ['🎤', 'mic'], headphones: ['🎧', 'headphones'], audio: ['🎧', 'headphones'],
  art: ['🎨', 'palette'], paint: ['🎨', 'palette'], design: ['🎨', 'swatch-book'], book: ['📚', 'book-open'],
  read: ['📖', 'book-open'], write: ['✏️', 'pencil'], pencil: ['✏️', 'pencil'],
  // objects / symbols
  crown: ['👑', 'crown'], trophy: ['🏆', 'trophy'], win: ['🏆', 'trophy'], champion: ['🏆', 'trophy'],
  medal: ['🏅', 'medal'], award: ['🏅', 'award'], diamond: ['💎', 'gem'], gem: ['💎', 'gem'],
  key: ['🔑', 'key-round'], lock: ['🔒', 'lock'], secure: ['🔒', 'lock'], security: ['🛡️', 'shield'],
  privacy: ['🛡️', 'shield'], bomb: ['💣', 'bomb'], skull: ['💀', 'skull'], danger: ['💀', 'skull'],
  ghost: ['👻', 'ghost'], horror: ['👻', 'ghost'], heart: ['❤️', 'heart'], love: ['❤️', 'heart'],
  lightning: ['⚡', 'zap'], bolt: ['⚡', 'zap'], power: ['⚡', 'zap'], energy: ['⚡', 'zap'],
  bulb: ['💡', 'lightbulb'], idea: ['💡', 'lightbulb'], tip: ['💡', 'lightbulb'], gift: ['🎁', 'gift'],
  present: ['🎁', 'gift'], balloon: ['🎈'], clock: ['⏰', 'clock'], time: ['⏰', 'clock'],
  target: ['🎯', 'target'], goal: ['🎯', 'target'], aim: ['🎯', 'crosshair'], dice: ['🎲', 'dices'],
  luck: ['🎲', 'dices'], puzzle: ['🧩', 'puzzle'], telescope: ['🔭', 'telescope'], glasses: ['👓', 'glasses'],
  // money / business
  money: ['💰', 'coins'], cash: ['💵', 'banknote'], dollar: ['💵', 'dollar-sign'], coin: ['🪙', 'coins'],
  chart: ['📈', 'trending-up'], growth: ['📈', 'trending-up'], profit: ['📈', 'trending-up'],
  invest: ['📈', 'trending-up'], stocks: ['📈', 'trending-up'], bank: ['🏦'], business: ['💼', 'briefcase'],
  work: ['💼', 'briefcase'], job: ['💼', 'briefcase'], bitcoin: ['₿', 'bitcoin'], crypto: ['🪙', 'bitcoin'],
  // food
  pizza: ['🍕', 'pizza'], burger: ['🍔'], food: ['🍕', 'pizza'], coffee: ['☕', 'coffee'],
  cake: ['🎂', 'cake'], birthday: ['🎂', 'cake'], donut: ['🍩'], icecream: ['🍦'], taco: ['🌮'],
  sushi: ['🍣'], apple: ['🍎'], avocado: ['🥑'],
  // travel / vehicles
  car: ['🚗', 'car'], drive: ['🚗', 'car'], plane: ['✈️', 'plane'], travel: ['✈️', 'plane'],
  flight: ['✈️', 'plane'], train: ['🚆', 'train-front'], ship: ['🚢', 'ship'], boat: ['⛵', 'ship'],
  bike: ['🚲', 'bike'], cycle: ['🚲', 'bike'], anchor: ['⚓', 'anchor'], map: ['🗺️', 'map'],
  compass: ['🧭', 'compass'], flag: ['🚩', 'flag'], adventure: ['🧭', 'compass'],
  // sport / fitness / health
  football: ['⚽'], soccer: ['⚽'], basketball: ['🏀'], tennis: ['🎾'], gym: ['🏋️', 'dumbbell'],
  fitness: ['💪', 'dumbbell'], workout: ['🏋️', 'dumbbell'], muscle: ['💪', 'dumbbell'], run: ['🏃'],
  yoga: ['🧘'], health: ['🩺', 'stethoscope'], doctor: ['🩺', 'stethoscope'], medicine: ['💊', 'pill'],
};

const SUBJECT_KEYS = Object.keys(SUBJECTS);

// ---- icon image cache (SVG → Image, drawn on canvas) -----------------------
const ICON_COLOR = '#ffffff';
const iconCache = new Map<string, HTMLImageElement | null>();

function iconKey(name: string): string { return name; }

function loadIcon(name: string): Promise<void> {
  if (iconCache.has(iconKey(name))) return Promise.resolve();
  const body = ICON_BODIES[name];
  if (!body) { iconCache.set(iconKey(name), null); return Promise.resolve(); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_COLOR}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const url = 'data:image/svg+xml,' + encodeURIComponent(svg);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { iconCache.set(iconKey(name), img); resolve(); };
    img.onerror = () => { iconCache.set(iconKey(name), null); resolve(); };
    img.src = url;
  });
}

interface ResolvedSubject { icon?: string; emoji?: string; mono?: string }

// Thematic fallback emoji per scene, so an unmatched subject still gets a
// relevant picture instead of a bare letter.
const SCENE_EMOJI: Record<PosterScene, string> = {
  none: '', mountains: '⛰️', city: '🏙️', desert: '🏜️', waves: '🌊', hills: '🌄', forest: '🌲', stars: '🌌',
};

function resolveSubject(subject: string, title: string, scene?: PosterScene): ResolvedSubject {
  const s = (subject || '').toLowerCase().trim();
  const joined = s.replace(/\s+/g, ''); // "milky way" → "milkyway"
  const hit = SUBJECTS[s] || SUBJECTS[s.replace(/s$/, '')] || SUBJECTS[joined]
    || s.split(/\s+/).map((wd) => SUBJECTS[wd] || SUBJECTS[wd.replace(/s$/, '')]).find(Boolean);
  if (hit) return { icon: hit[1], emoji: hit[0] };
  const em = emojiFor(subject) ?? emojiFor(title);
  if (em) return { emoji: em };
  if (scene && SCENE_EMOJI[scene]) return { emoji: SCENE_EMOJI[scene] }; // thematic, not a letter
  const ch = (title.trim()[0] || subject.trim()[0] || '★');
  return { mono: ch.toUpperCase() };
}

// ---- stock photo background ------------------------------------------------
const photoCache = new Map<string, HTMLImageElement | null>();

function loadPhoto(url: string): Promise<void> {
  if (photoCache.has(url)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // so we can filter + export without tainting
    img.onload = () => { photoCache.set(url, img); resolve(); };
    img.onerror = () => { photoCache.set(url, null); resolve(); };
    img.src = url;
  });
}

interface StockHit { url: string; credit: string; provider: string }

/**
 * Keyless image search, called straight from the user's browser — no API key
 * and no central quota (each visitor's own IP makes the request).
 *
 * Primary: Openverse — aggregates real PHOTOGRAPHY (Flickr, museums, …) and
 * lets us filter to `category=photograph`, so we avoid the diagrams/clipart
 * that plague encyclopedia repos. Its thumbnail is served through Openverse's
 * own CORS-enabled proxy, so we can filter + export on canvas without tainting.
 * Fallback: Wikimedia Commons. Then gradient.
 */
interface OpenverseResult { thumbnail?: string; url?: string; creator?: string }

function hostOf(u: string): string { try { return new URL(u).host; } catch { return ''; } }
// Hosts that send `Access-Control-Allow-Origin: *` on the image itself, so the
// canvas stays exportable. (Openverse's own thumbnail proxy does NOT, so we use
// the original `url` and prefer these hosts.)
const CORS_SAFE_IMG = /(^|\.)(staticflickr\.com|upload\.wikimedia\.org|live\.staticflickr\.com)$/;

async function fetchOpenverse(q: string): Promise<StockHit | null> {
  try {
    const api = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}`
      + '&category=photograph&size=large&aspect_ratio=wide&per_page=20&mature=false';
    const r = await fetch(api, { cache: 'force-cache', headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json() as { results?: OpenverseResult[] };
    const withUrl = (d.results ?? []).filter((x) => x.url);
    // Use the original image (CORS-safe on Flickr etc.), not the proxy thumb.
    const safe = withUrl.filter((x) => CORS_SAFE_IMG.test(hostOf(x.url!)));
    const pool = safe.length ? safe : withUrl;
    if (!pool.length) return null;
    const x = pool[Math.floor(Math.random() * Math.min(pool.length, 10))];
    return { url: x.url!, credit: (x.creator || '').slice(0, 40), provider: 'Openverse' };
  } catch { return null; }
}

interface WikiImageInfo { thumburl?: string; extmetadata?: { Artist?: { value?: string } } }

async function fetchWikimedia(q: string): Promise<StockHit | null> {
  try {
    const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
      + `&generator=search&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=14`
      + '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280';
    const r = await fetch(api, { cache: 'force-cache' });
    if (!r.ok) return null;
    const d = await r.json() as { query?: { pages?: Record<string, { imageinfo?: WikiImageInfo[] }> } };
    const cands = Object.values(d.query?.pages ?? {})
      .map((p) => p.imageinfo?.[0])
      .filter((ii): ii is WikiImageInfo => !!ii?.thumburl && /\.(jpe?g|png)$/i.test(ii!.thumburl!));
    if (!cands.length) return null;
    const ii = cands[Math.floor(Math.random() * Math.min(cands.length, 8))];
    const artist = (ii.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 40);
    return { url: ii.thumburl!, credit: artist, provider: 'Wikimedia Commons' };
  } catch { return null; }
}

async function fetchStock(query: string): Promise<StockHit | null> {
  const q = (query || '').trim();
  if (!q) return null;
  return (await fetchOpenverse(q)) ?? (await fetchWikimedia(q));
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, blur: boolean) {
  const ir = img.width / img.height, cr = w / h;
  let dw = w, dh = h, dx = 0, dy = 0;
  if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; } else { dw = w; dh = w / ir; dy = (h - dh) / 2; }
  ctx.save();
  if (blur) ctx.filter = `blur(${Math.round(Math.min(w, h) * 0.012)}px)`;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function legibilityOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, layout: PosterLayout) {
  // dark gradient toward the text side so the title always reads
  const g = layout === 'left' ? ctx.createLinearGradient(0, 0, w, 0)
    : layout === 'right' ? ctx.createLinearGradient(w, 0, 0, 0)
      : ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.72)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.32)');
  g.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function drawCredit(ctx: CanvasRenderingContext2D, w: number, h: number, credit?: string, provider?: string) {
  if (!credit && !provider) return;
  const label = `Photo: ${credit || ''}${credit && provider ? ' · ' : ''}${provider || ''}`.trim();
  ctx.save();
  ctx.font = `500 ${Math.round(Math.min(w, h) * 0.018)}px "Segoe UI",system-ui,Arial,sans-serif`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
  ctx.fillText(label, w - 16, h - 12);
  ctx.restore();
}

// ---- deterministic RNG -----------------------------------------------------
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function hexToRgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h: string, a: number): string { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function mix(a: string, b: string, t: number): string { const A = hexToRgb(a), B = hexToRgb(b); const c = A.map((v, i) => Math.round(v + (B[i] - v) * t)); return `rgb(${c[0]},${c[1]},${c[2]})`; }

function paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number, pal: string[], mood: PosterMood, rand: () => number) {
  const dark = mood === 'dark' || mood === 'dramatic';
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, pal[0]);
  g.addColorStop(0.55, mix(pal[0], pal[1], dark ? 0.5 : 0.85));
  g.addColorStop(1, dark ? mix(pal[1], '#000000', 0.35) : pal[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) {
    const rx = rand() * w, ry = rand() * h * 0.7, rr = (0.18 + rand() * 0.22) * w;
    const rg = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
    rg.addColorStop(0, rgba(pal[2], mood === 'vibrant' ? 0.28 : 0.16));
    rg.addColorStop(1, rgba(pal[2], 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  }
}

function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, scene: PosterScene, pal: string[], rand: () => number) {
  const ink = mix(pal[1], '#000000', 0.55);
  ctx.save(); ctx.fillStyle = ink;
  const base = h * 0.92;
  switch (scene) {
    case 'mountains': for (let i = 0; i < 4; i++) { const cx = (i / 3) * w + (rand() - 0.5) * 120; const pw = w * (0.28 + rand() * 0.18), ph = h * (0.3 + rand() * 0.28); ctx.fillStyle = i % 2 ? ink : mix(pal[1], '#000', 0.4); ctx.beginPath(); ctx.moveTo(cx - pw, base); ctx.lineTo(cx, base - ph); ctx.lineTo(cx + pw, base); ctx.closePath(); ctx.fill(); } break;
    case 'desert': { ctx.beginPath(); ctx.moveTo(0, base); for (let x = 0; x <= w; x += w / 6) ctx.quadraticCurveTo(x + w / 12, base - 40 - rand() * 60, x + w / 6, base); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill(); break; }
    case 'city': { let x = 0; while (x < w) { const bw = 40 + rand() * 90, bh = h * (0.18 + rand() * 0.42); ctx.fillStyle = mix(pal[1], '#000', 0.45 + rand() * 0.2); ctx.fillRect(x, base - bh, bw, bh); ctx.fillStyle = rgba(pal[3], 0.5); for (let wy = base - bh + 12; wy < base - 12; wy += 22) for (let wx = x + 8; wx < x + bw - 8; wx += 16) if (rand() > 0.45) ctx.fillRect(wx, wy, 6, 8); x += bw + 6; } break; }
    case 'waves': for (let i = 0; i < 3; i++) { ctx.fillStyle = rgba(pal[2], 0.25 + i * 0.12); const y = base - i * 50; ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= w; x += 40) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 4 + i) * 18); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill(); } break;
    case 'hills': for (let i = 0; i < 3; i++) { ctx.fillStyle = mix(pal[1], '#000', 0.3 + i * 0.15); ctx.beginPath(); ctx.arc(w * (0.2 + i * 0.3), base + 120, w * 0.4, Math.PI, 0); ctx.fill(); } break;
    case 'forest': for (let i = 0; i < 14; i++) { const tx = rand() * w, th = h * (0.12 + rand() * 0.16), tw = th * 0.5; ctx.fillStyle = mix(pal[2], '#000', 0.2 + rand() * 0.3); ctx.beginPath(); ctx.moveTo(tx - tw, base); ctx.lineTo(tx, base - th); ctx.lineTo(tx + tw, base); ctx.closePath(); ctx.fill(); } break;
    case 'stars': for (let i = 0; i < 90; i++) { ctx.fillStyle = rgba('#ffffff', 0.3 + rand() * 0.6); const r = rand() * 2.2 + 0.5; ctx.beginPath(); ctx.arc(rand() * w, rand() * h * 0.7, r, 0, Math.PI * 2); ctx.fill(); } break;
  }
  ctx.restore();
}

function subjectPos(layout: PosterLayout, w: number, h: number): { x: number; y: number } {
  switch (layout) {
    case 'left': return { x: w * 0.72, y: h * 0.46 };
    case 'right': return { x: w * 0.28, y: h * 0.46 };
    case 'lower': return { x: w * 0.5, y: h * 0.4 };
    default: return { x: w * 0.5, y: h * 0.44 };
  }
}

function drawSubject(ctx: CanvasRenderingContext2D, w: number, h: number, sub: ResolvedSubject, layout: PosterLayout, pal: string[]) {
  const { x, y } = subjectPos(layout, w, h);
  const size = Math.min(w, h) * 0.42;
  // soft accent halo + badge
  const gl = ctx.createRadialGradient(x, y, 0, x, y, size * 0.95);
  gl.addColorStop(0, rgba(pal[3], 0.4)); gl.addColorStop(1, rgba(pal[3], 0));
  ctx.fillStyle = gl; ctx.fillRect(x - size, y - size, size * 2, size * 2);

  const icon = sub.icon ? iconCache.get(iconKey(sub.icon)) : null;
  if (icon) {
    // badge ring behind the line icon for contrast
    ctx.save();
    ctx.fillStyle = rgba(pal[2], 0.22);
    ctx.beginPath(); ctx.arc(x, y, size * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = size * 0.03; ctx.strokeStyle = rgba('#ffffff', 0.5);
    ctx.beginPath(); ctx.arc(x, y, size * 0.62, 0, Math.PI * 2); ctx.stroke();
    const s = size * 0.72;
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.06; ctx.shadowOffsetY = size * 0.03;
    ctx.drawImage(icon, x - s / 2, y - s / 2, s, s);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.08; ctx.shadowOffsetY = size * 0.04;
  if (sub.emoji) {
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(sub.emoji, x, y);
  } else if (sub.mono) {
    // monogram badge — guaranteed non-blank subject
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = rgba(pal[3], 0.9);
    ctx.beginPath(); ctx.arc(x, y, size * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mix(pal[0], '#000', 0.2);
    ctx.font = `900 ${size * 0.7}px "Segoe UI",system-ui,Arial,sans-serif`;
    ctx.fillText(sub.mono, x, y + size * 0.03);
  }
  ctx.restore();
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, weight = '800'): number {
  let size = start;
  do { ctx.font = `${weight} ${size}px "Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif`; if (ctx.measureText(text).width <= maxW) break; size -= 4; } while (size > 16);
  return size;
}

function drawText(ctx: CanvasRenderingContext2D, w: number, h: number, spec: PosterSpec, pal: string[]) {
  const title = (spec.title || '').toUpperCase();
  if (!title) return;
  const maxW = w * 0.86;
  let tx: number, ty: number, align: CanvasTextAlign;
  if (spec.layout === 'left') { tx = w * 0.06; ty = h * 0.5; align = 'left'; }
  else if (spec.layout === 'right') { tx = w * 0.94; ty = h * 0.5; align = 'right'; }
  else if (spec.layout === 'lower') { tx = w * 0.5; ty = h * 0.84; align = 'center'; }
  else { tx = w * 0.5; ty = h * 0.78; align = 'center'; }
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  const words = title.split(/\s+/); const lines: string[] = []; let cur = '';
  const size = fitFont(ctx, title, maxW, Math.min(w, h) * 0.14);
  for (const wd of words) { const test = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = test; }
  if (cur) lines.push(cur);
  if (lines.length > 3) { lines.length = 3; lines[2] += '…'; }
  const lineH = size * 1.05;
  let y = ty - ((lines.length - 1) * lineH) / 2;
  ctx.fillStyle = pal[3];
  const barW = Math.min(maxW, size * 4);
  const barX = align === 'left' ? tx : align === 'right' ? tx - barW : tx - barW / 2;
  ctx.fillRect(barX, y - size * 0.85, barW, Math.max(4, size * 0.06));
  for (const ln of lines) {
    ctx.font = `800 ${size}px "Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif`;
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(ln, tx, y);
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = size * 0.12; ctx.shadowOffsetY = size * 0.04;
    ctx.fillStyle = '#ffffff'; ctx.fillText(ln, tx, y); ctx.shadowColor = 'transparent';
    y += lineH;
  }
  if (spec.subtitle) {
    const ss = fitFont(ctx, spec.subtitle, maxW, size * 0.42, '600');
    ctx.font = `600 ${ss}px "Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif`;
    ctx.fillStyle = rgba('#ffffff', 0.9); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = ss * 0.2;
    ctx.fillText(spec.subtitle, tx, y + ss * 0.4); ctx.shadowColor = 'transparent';
  }
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, mood: PosterMood) {
  const strong = mood === 'dramatic' || mood === 'dark';
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${strong ? 0.55 : 0.32})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

/** Render a spec to a PNG data URL. Sync — any vector icon must be preloaded. */
export function renderPoster(spec: PosterSpec, seed: number): string {
  const { w, h } = SIZES[spec.format] ?? SIZES.wide;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rand = rng(seed);
  const pal = PALETTES[spec.palette] ?? PALETTES.sunset;

  const photo = spec.background === 'photo' && spec.photoUrl ? photoCache.get(spec.photoUrl) : null;
  if (photo) {
    // Real photo background → filter → legibility overlay (no procedural scene).
    drawCover(ctx, photo, w, h, spec.filter === 'blur');
    try { applyFilter(ctx, w, h, spec.filter, pal[3], pal[0]); } catch { /* tainted → skip */ }
    legibilityOverlay(ctx, w, h, spec.layout);
    if (spec.subject && spec.subject.trim()) drawSubject(ctx, w, h, resolveSubject(spec.subject, spec.title, spec.scene), spec.layout, pal);
    drawText(ctx, w, h, spec, pal);
    drawCredit(ctx, w, h, spec.credit, undefined);
  } else {
    paintBackground(ctx, w, h, pal, spec.mood, rand);
    drawScene(ctx, w, h, spec.scene, pal, rand);
    drawSubject(ctx, w, h, resolveSubject(spec.subject, spec.title, spec.scene), spec.layout, pal);
    vignette(ctx, w, h, spec.mood);
    drawText(ctx, w, h, spec, pal);
  }
  return canvas.toDataURL('image/png');
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];

export function heuristicSpec(text: string): PosterSpec {
  const lc = text.toLowerCase();
  const palette: PaletteKey =
    /(sunset|orange|warm)/.test(lc) ? 'sunset' :
    /(ocean|sea|water|blue)/.test(lc) ? 'ocean' :
    /(forest|nature|green)/.test(lc) ? 'forest' :
    /(neon|cyber|gam)/.test(lc) ? 'neon' :
    /(fire|lava|hot|red|battle|fight|vs|versus)/.test(lc) ? 'fire' :
    /(gold|lux|premium)/.test(lc) ? 'gold' :
    /(purple|royal|magic)/.test(lc) ? 'royal' : 'sky';
  const scene: PosterScene =
    /(pyramid|desert|egypt|sand|dune)/.test(lc) ? 'desert' :
    /(mountain|peak|alps|hike)/.test(lc) ? 'mountains' :
    /(city|urban|skyline|street)/.test(lc) ? 'city' :
    /(ocean|sea|wave|beach|surf)/.test(lc) ? 'waves' :
    /(forest|tree|wood|jungle)/.test(lc) ? 'forest' :
    /(space|galaxy|star|night|cosmos|hero|batman|superman)/.test(lc) ? 'stars' : 'none';
  // pick a subject keyword that appears in the request, else the lead noun
  const words = lc.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  const subject = words.find((wd) => SUBJECTS[wd]) ?? words.find((wd) => SUBJECTS[wd.replace(/s$/, '')]) ?? '';
  const title = text.replace(/^(make|create|design|generate|draw)?\s*(me)?\s*(a|an)?\s*(youtube|yt|social|instagram|insta)?\s*(thumbnail|poster|banner|cover|flyer|card|header|art)\s*(about|for|of|on|saying|titled)?\s*:?\s*/i, '').trim() || text.trim();
  return {
    title: title.slice(0, 48), subtitle: '', subject: subject || title,
    scene, palette,
    mood: /night|dark|horror|dramatic|vs|versus|battle|fight/.test(lc) ? 'dramatic' : 'vibrant',
    layout: 'lower',
    format: /(square|instagram|insta|album|post)/.test(lc) ? 'square' : /(story|portrait|vertical|tall|tiktok|reel)/.test(lc) ? 'tall' : 'wide',
    // Default to a real photo background (keyless Openverse); use a flat
    // gradient only when the user asks for something minimal/abstract. If no
    // photo is found, composePoster downgrades to gradient automatically.
    background: /(gradient|flat|minimal|plain|solid|abstract|no photo|text only|simple)/.test(lc) ? 'gradient' : 'photo',
    filter: /noir|black.?and.?white|b&w/.test(lc) ? 'noir' : /cinematic|movie|film/.test(lc) ? 'cinematic' : /vintage|retro|faded?/.test(lc) ? 'fade' : 'darken',
  };
}

/** Ask the on-device model for a layout spec (grammar-constrained), preload any
 *  vector icon, then render. Falls back to a heuristic spec on any failure. */
export async function composePoster(text: string, engine: unknown, seed: number): Promise<{ url: string; spec: PosterSpec }> {
  let spec = heuristicSpec(text);
  try {
    const eng = engine as { chat: { completions: { create: (a: unknown) => Promise<{ choices?: { message?: { content?: string } }[] }> } } };
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' }, subtitle: { type: 'string' }, subject: { type: 'string' },
        scene: { type: 'string', enum: POSTER_SCENES },
        palette: { type: 'string', enum: PALETTE_KEYS },
        mood: { type: 'string', enum: POSTER_MOODS },
        layout: { type: 'string', enum: POSTER_LAYOUTS },
        format: { type: 'string', enum: POSTER_FORMATS },
        background: { type: 'string', enum: POSTER_BACKGROUNDS },
        filter: { type: 'string', enum: FILTERS },
      },
      required: ['title', 'subject', 'scene', 'palette', 'mood', 'layout', 'format', 'background', 'filter'],
    });
    const out = await eng.chat.completions.create({
      messages: [
        { role: 'system', content: 'You design a poster/thumbnail. Reply ONLY with JSON. title: punchy, max 5 words. subtitle: short or empty. subject: ONE simple iconic noun for the main picture (animal, object, place or symbol — e.g. rocket, lion, castle, trophy, hero, battle). background: prefer "photo" for a real photographic look (most topics); use "gradient" only for minimal/abstract/text-only designs. filter: a photo treatment (darken, duotone, noir, cinematic, tint, fade, vibrant, blur) — only matters for photo. Pick scene/palette/mood/layout/format that fit.' },
        { role: 'user', content: text },
      ],
      temperature: 0.5, max_tokens: 180,
      response_format: { type: 'json_object', schema },
    });
    const o = JSON.parse(out.choices?.[0]?.message?.content ?? '{}');
    spec = {
      title: (typeof o.title === 'string' && o.title.trim() ? o.title : spec.title).slice(0, 48),
      subtitle: (typeof o.subtitle === 'string' ? o.subtitle : '').slice(0, 60),
      subject: typeof o.subject === 'string' && o.subject.trim() ? o.subject : spec.subject,
      scene: pick(o.scene, POSTER_SCENES, spec.scene),
      palette: pick(o.palette, PALETTE_KEYS, spec.palette),
      mood: pick(o.mood, POSTER_MOODS, spec.mood),
      layout: pick(o.layout, POSTER_LAYOUTS, spec.layout),
      format: pick(o.format, POSTER_FORMATS, spec.format),
      background: pick(o.background, POSTER_BACKGROUNDS, spec.background),
      filter: pick(o.filter, FILTERS, spec.filter),
    };
  } catch { /* keep heuristic spec */ }

  // Photo background: search our stock proxy, load the image (CORS) so the sync
  // render can draw it. Any failure (no key, offline, no result) → gradient.
  if (spec.background === 'photo') {
    const hit = await fetchStock((spec.subject || spec.title || '').trim() || spec.title);
    if (hit) { await loadPhoto(hit.url); if (photoCache.get(hit.url)) { spec.photoUrl = hit.url; spec.credit = [hit.credit, hit.provider].filter(Boolean).join(' · '); } }
    if (!spec.photoUrl) spec.background = 'gradient';
  }

  // Preload the vector icon (if this subject maps to one) so the sync render
  // and later "regenerate" can draw it without awaiting.
  const resolved = resolveSubject(spec.subject, spec.title, spec.scene);
  if (resolved.icon) { try { await loadIcon(resolved.icon); } catch { /* emoji fallback */ } }

  return { url: renderPoster(spec, seed), spec };
}

export { SUBJECT_KEYS };
