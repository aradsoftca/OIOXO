import { BRAND } from '@/lib/brand';
/**
 * "Magic tricks" that make the tiny on-device model punch far above its weight,
 * with NO extra model download:
 *   - procedural generative art (canvas) — the near-diffusion trick for
 *     abstract / wallpaper / background prompts; deterministic, always pretty
 *   - the LLM as an SVG artist for logos / icons (rendered as vectors)
 *   - inline tools: safe calculator, colour palettes
 * The heavy/visual work is deterministic, so results are reliable regardless of
 * how small (or wrong) the language model is.
 */

export type Intent =
  | { kind: 'calc'; expr: string }
  | { kind: 'qr'; text: string }
  | { kind: 'palette'; prompt: string }
  | { kind: 'art'; prompt: string }
  | { kind: 'svg'; prompt: string }
  | { kind: 'poster'; prompt: string }
  | { kind: 'chat' };

export function detectIntent(text: string): Intent {
  const t = text.trim();
  const lc = t.toLowerCase();

  // Pure arithmetic expression, or "calculate / what is …"
  const calcMatch = lc.replace(/^(calculate|compute|what(?:'s| is)|how much is)\s+/, '').replace(/[?=]+$/, '').trim();
  if (/^[\d\s.+\-*/^%()]+$/.test(calcMatch) && /[\d]/.test(calcMatch) && /[+\-*/^%]/.test(calcMatch)) {
    return { kind: 'calc', expr: calcMatch };
  }
  if (/\bqr\b/.test(lc)) {
    const text2 = t.replace(/.*?\bqr(?:\s*code)?\s*(?:for|of|:)?\s*/i, '').trim() || t;
    return { kind: 'qr', text: text2 };
  }
  if (/\b(colou?r\s*palette|palette|colou?r scheme)\b/.test(lc)) return { kind: 'palette', prompt: t };

  // Poster / thumbnail / banner composer — a designed graphic with bold text.
  // Checked before art/svg because "thumbnail of a fox" is a layout job, not a
  // freeform drawing. (Questions already returned 'chat' above.)
  if (/\b(thumbnail|thumbnails|poster|banner|flyer|cover art|album cover|book cover|channel art|header image|social (?:card|post|media) (?:image|graphic|design)?|youtube thumbnail)\b/.test(lc)) {
    return { kind: 'poster', prompt: t };
  }

  // A request phrased as a question ("can you…", "could you…", "what…", "how…",
  // or anything ending in "?") is a conversation, not a command to generate.
  // Let it fall through to chat so the AI can ask what the user actually wants
  // instead of guessing and drawing junk.
  const isQuestion = /\?\s*$/.test(t) || /^(can|could|would|will|do|does|did|are|is|am|how|what|why|when|where|which|should|may|might)\b/.test(lc);
  if (isQuestion) return { kind: 'chat' };

  // Editing a file (remove/crop/blur/upscale/…) is a tool job, not generation —
  // don't let a stray art noun like "sunset" or "background" hijack it. Falls
  // through to chat so routing can pick the real tool.
  if (/\b(remove|erase|delete|cut ?out|crop|trim|resize|rotate|flip|blur|sharpen|denoise|upscale|enlarge|compress|convert|watermark|brighten|darken|grayscale|greyscale|saturate|desaturate|replace|extract|mirror|invert)\b/.test(lc)) return { kind: 'chat' };

  // Abstract art — only on an unmistakable art noun (and not a question/edit).
  if (/\b(abstract|wallpaper|gradient|texture|pattern|aurora|aesthetic|nebula|galaxy|sunset|ocean|landscape|scenery)\b/.test(lc)) return { kind: 'art', prompt: t };

  // SVG/vector — needs BOTH a creation verb and a drawable noun, so a passing
  // mention of "image"/"picture"/"design" in a sentence can't hijack the chat.
  const hasVerb = /\b(draw|sketch|design|illustrate|create|generate|make|render|paint)\b/.test(lc);
  const hasNoun = /\b(logo|icon|sticker|svg|vector|illustration|drawing|emblem|badge|symbol|picture|image)\b/.test(lc);
  if (hasVerb && hasNoun) return { kind: 'svg', prompt: t };

  return { kind: 'chat' };
}

// ---- fun easter eggs ------------------------------------------------------
// Hand-written so the "cool/funny" moments land reliably (the tiny model's own
// jokes are hit-or-miss). Only consulted on the CHAT fallback, so it never
// hijacks a real tool/convert/draw request.
const GREETINGS = [
  `Hey! 👋 I’m ${BRAND} AI — what are we making today?`,
  'Hi there! Files to convert, a thumbnail to design, or just here to chat? I’m game.',
  'Yo. Drop a file or a request — I do the heavy lifting, privately, right here.',
];
const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs. 🐛',
  'I’d tell you a UDP joke, but you might not get it.',
  'There are 10 kinds of people: those who understand binary, and those who don’t.',
  'I tried to compress a joke… but it lost its punchline in lossy mode.',
  'Why was the JPEG sad? It had too many issues with its past compressions.',
  'A SQL query walks into a bar, goes up to two tables and asks: “Mind if I join you?”',
];
const THANKS = [
  'Anytime! 🙌', 'You’re welcome — that’s what I’m here for.', 'Happy to help. Got anything else?',
];
function pickFrom(arr: string[]): string { return arr[Math.floor(Math.random() * arr.length)]; }

export function funReply(text: string): string | null {
  const lc = text.trim().toLowerCase();
  if (/^(hi|hey+|hello|yo|sup|hiya|howdy|gm|good (morning|evening|afternoon))\b/.test(lc)) return pickFrom(GREETINGS);
  if (/(tell|got|know|hear).*(joke|funny)|^joke\b|make me laugh|cheer me up/.test(lc)) return pickFrom(JOKES);
  if (/^\s*(thanks|thank you|thx|ty|cheers)\b/.test(lc)) return pickFrom(THANKS);
  if (/\bwho are you\b|\bwhat are you\b/.test(lc)) return `I’m ${BRAND} AI — your private, on-device sidekick. I convert, compress, edit, draw, make thumbnails, and find the right tool, all without your files ever leaving this tab. A Swiss Army knife that actually respects your privacy. 🛠️`;
  if (/\bare you (chatgpt|gpt|openai|gemini|claude|bard|copilot)\b/.test(lc)) return `Nope — I’m ${BRAND} AI, running right here on your device. No cloud, no eavesdropping. What can I make for you?`;
  if (/\bi love you\b/.test(lc)) return 'Aw. 💚 I’ll show it in crisp conversions and clean thumbnails.';
  if (/\b(i'?m )?bored\b|entertain me/.test(lc)) return 'Say the word and I’ll whip up a wallpaper, a thumbnail, a QR code, or a charmingly bad joke. Dealer’s choice. 🎲';
  return null;
}

// ---- safe calculator ----
export function safeCalc(expr: string): string | null {
  if (!/^[\d\s.+\-*/^%()]+$/.test(expr)) return null;
  try {
    const v = Function(`"use strict"; return (${expr.replace(/\^/g, '**')});`)();
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return String(Math.round(v * 1e10) / 1e10);
  } catch { return null; }
}

// ---- palettes ----
const PALETTES: Record<string, string[]> = {
  sunset: ['#ff7e5f', '#feb47b', '#ff6a88', '#6a3093'],
  ocean: ['#2193b0', '#6dd5ed', '#0f2027', '#2c5364'],
  forest: ['#134e5e', '#71b280', '#0b3d2e', '#a8e063'],
  neon: ['#ff00cc', '#3333ff', '#00f0ff', '#9d00ff'],
  pastel: ['#a1c4fd', '#c2e9fb', '#fbc2eb', '#ffecd2'],
  space: ['#0b0b2b', '#3a0ca3', '#7209b7', '#f72585'],
  galaxy: ['#0b0b2b', '#3a0ca3', '#7209b7', '#f72585'],
  nebula: ['#240b36', '#c31432', '#4776e6', '#8e54e9'],
  fire: ['#f12711', '#f5af19', '#ff512f', '#dd2476'],
  mint: ['#43cea2', '#185a9d', '#a8ff78', '#78ffd6'],
  dark: ['#0f0f12', '#232526', '#414345', '#1c1c2e'],
  gold: ['#b8860b', '#ffd700', '#3a2c00', '#fff3b0'],
  rose: ['#ee9ca7', '#ffdde1', '#b24592', '#f15f79'],
};
const FALLBACK = [PALETTES.sunset, PALETTES.ocean, PALETTES.neon, PALETTES.nebula, PALETTES.mint, PALETTES.rose];

export function paletteFor(text: string, seed = Date.now()): string[] {
  const lc = text.toLowerCase();
  for (const key of Object.keys(PALETTES)) if (lc.includes(key)) return PALETTES[key];
  if (lc.includes('warm')) return PALETTES.sunset;
  if (lc.includes('cool') || lc.includes('blue')) return PALETTES.ocean;
  if (lc.includes('green')) return PALETTES.forest;
  if (lc.includes('purple') || lc.includes('violet')) return PALETTES.space;
  return FALLBACK[Math.floor((seed / 7) % FALLBACK.length)];
}

// ---- procedural art (the near-diffusion trick) ----
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/** Render abstract "aurora / mesh gradient + grain" art into a canvas. */
export function renderArt(canvas: HTMLCanvasElement, prompt: string, seed: number) {
  const pal = paletteFor(prompt, seed);
  const rng = mulberry32(seed);
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const darkBg = pal.filter(isDark).length >= pal.length / 2;

  // background gradient
  const ang = rng() * Math.PI * 2;
  const g = ctx.createLinearGradient(W / 2 - Math.cos(ang) * W / 2, H / 2 - Math.sin(ang) * H / 2, W / 2 + Math.cos(ang) * W / 2, H / 2 + Math.sin(ang) * H / 2);
  g.addColorStop(0, pal[0]); g.addColorStop(1, pal[pal.length - 1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // soft colour blobs → mesh/aurora
  ctx.globalCompositeOperation = darkBg ? 'lighter' : 'multiply';
  const blobs = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < blobs; i++) {
    const x = rng() * W, y = rng() * H, r = (0.25 + rng() * 0.45) * Math.max(W, H);
    const c = pal[Math.floor(rng() * pal.length)];
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, c + (darkBg ? 'cc' : '99')); rg.addColorStop(1, c + '00');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // subtle grain for a generated texture feel
  ctx.globalCompositeOperation = 'source-over';
  const img = ctx.getImageData(0, 0, W, H); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rng() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
}

// ---- emoji "drawing" (reliable recognizable objects a tiny model can't draw) ----
const EMOJI: Record<string, string> = {
  bike: '🚲', bicycle: '🚲', car: '🚗', truck: '🚚', bus: '🚌', train: '🚆', plane: '✈️', airplane: '✈️', rocket: '🚀', ship: '🚢', boat: '⛵', motorcycle: '🏍️',
  cat: '🐱', dog: '🐶', fox: '🦊', lion: '🦁', tiger: '🐯', bear: '🐻', panda: '🐼', rabbit: '🐰', horse: '🐴', cow: '🐮', pig: '🐷', monkey: '🐵', penguin: '🐧', bird: '🐦', owl: '🦉', fish: '🐟', shark: '🦈', whale: '🐳', dolphin: '🐬', frog: '🐸', snake: '🐍', turtle: '🐢', butterfly: '🦋', bee: '🐝', spider: '🕷️', dinosaur: '🦖', dragon: '🐉', unicorn: '🦄', elephant: '🐘',
  house: '🏠', home: '🏠', building: '🏢', castle: '🏰', tent: '⛺', church: '⛪', school: '🏫', hospital: '🏥', factory: '🏭', bridge: '🌉',
  tree: '🌳', flower: '🌸', rose: '🌹', cactus: '🌵', leaf: '🍃', mushroom: '🍄', sun: '☀️', moon: '🌙', star: '⭐', cloud: '☁️', rainbow: '🌈', snowflake: '❄️', fire: '🔥', water: '💧', mountain: '⛰️', volcano: '🌋', earth: '🌍', planet: '🪐',
  heart: '❤️', skull: '💀', ghost: '👻', alien: '👽', robot: '🤖', crown: '👑', gem: '💎', diamond: '💎', key: '🔑', lock: '🔒', bell: '🔔', gift: '🎁', balloon: '🎈', trophy: '🏆', medal: '🏅', target: '🎯',
  pizza: '🍕', burger: '🍔', hamburger: '🍔', cake: '🎂', icecream: '🍦', coffee: '☕', tea: '🍵', beer: '🍺', wine: '🍷', apple: '🍎', banana: '🍌', strawberry: '🍓', donut: '🍩', cookie: '🍪', taco: '🌮', sushi: '🍣',
  phone: '📱', laptop: '💻', computer: '🖥️', camera: '📷', tv: '📺', clock: '🕐', watch: '⌚', bulb: '💡', battery: '🔋', headphones: '🎧', guitar: '🎸', piano: '🎹', drum: '🥁', microphone: '🎤', book: '📖', pencil: '✏️', paint: '🎨', scissors: '✂️',
  football: '⚽', soccer: '⚽', basketball: '🏀', baseball: '⚾', tennis: '🎾', ball: '⚽', dice: '🎲', chess: '♟️', game: '🎮', controller: '🎮',
  smile: '😀', face: '🙂', sad: '😢', angry: '😠', cool: '😎', love: '😍', laugh: '😂', wink: '😉', eye: '👁️', hand: '✋', thumbsup: '👍', wave: '👋', muscle: '💪', brain: '🧠', eyes: '👀',
  hat: '🎩', shirt: '👕', dress: '👗', shoe: '👟', glasses: '👓', umbrella: '☂️', ring: '💍', bag: '👜', backpack: '🎒',
  flag: '🏁', anchor: '⚓', compass: '🧭', map: '🗺️', tools: '🛠️', hammer: '🔨', wrench: '🔧', gear: '⚙️', magnet: '🧲', telescope: '🔭', clover: '🍀', cherry: '🍒', wifi: '📶',
};
const STOP = new Set(['draw', 'a', 'an', 'the', 'of', 'me', 'please', 'some', 'picture', 'image', 'icon', 'sticker', 'illustration', 'illustrate', 'sketch', 'design', 'logo', 'cute', 'simple', 'small', 'big', 'cool', 'nice', 'my']);

export function emojiFor(prompt: string): string | null {
  const words = prompt.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  for (const w of words) { if (EMOJI[w]) return EMOJI[w]; const sing = w.replace(/s$/, ''); if (EMOJI[sing]) return EMOJI[sing]; }
  return null;
}

/** Draw a big emoji on procedural-art background → a recognizable "drawing". */
export function renderEmojiArt(canvas: HTMLCanvasElement, emoji: string, prompt: string, seed: number) {
  renderArt(canvas, prompt, seed);
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const s = Math.min(canvas.width, canvas.height) * 0.55;
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = `${s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = s * 0.06; ctx.shadowOffsetY = s * 0.03;
  ctx.fillText(emoji, canvas.width / 2, canvas.height / 2);
  ctx.shadowColor = 'transparent';
}

// ---- SVG from the model ----
export function svgSystemPrompt(): string {
  return 'You are an SVG illustrator. Reply with ONE valid <svg>…</svg> only — include width, height and viewBox, use simple shapes/paths/gradients, no scripts, no markdown fences, no words before or after the SVG.';
}
export function extractSvg(out: string): string | null {
  const m = out.match(/<svg[\s\S]*?<\/svg>/i);
  if (!m) return null;
  // strip anything executable
  return m[0].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
}
