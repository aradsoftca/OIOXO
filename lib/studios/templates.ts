export interface ColorGrade {
  id: string;
  name: string;
  category: 'neutral' | 'cinematic' | 'vibrant' | 'vintage' | 'mono' | 'mood';
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  description: string;
}

export const COLOR_GRADES: ColorGrade[] = [
  { id: 'original', name: 'Original', category: 'neutral', brightness: 100, contrast: 100, saturation: 100, hue: 0, description: 'No color adjustment' },
  { id: 'cinematic-teal-orange', name: 'Cinematic Teal & Orange', category: 'cinematic', brightness: 96, contrast: 118, saturation: 110, hue: -8, description: 'The Hollywood blockbuster look' },
  { id: 'cinematic-blade-runner', name: 'Neon Noir', category: 'cinematic', brightness: 86, contrast: 130, saturation: 115, hue: -18, description: 'Moody, cyberpunk vibes' },
  { id: 'cinematic-wes', name: 'Pastel Frame', category: 'cinematic', brightness: 108, contrast: 95, saturation: 90, hue: 6, description: 'Soft, symmetrical Wes Anderson palette' },
  { id: 'cinematic-anamorphic', name: 'Anamorphic Cool', category: 'cinematic', brightness: 95, contrast: 122, saturation: 92, hue: -10, description: 'Cold cinema flare look' },
  { id: 'vibrant-pop', name: 'Vivid Pop', category: 'vibrant', brightness: 104, contrast: 118, saturation: 140, hue: 0, description: 'Punchy and saturated for social' },
  { id: 'vibrant-reels', name: 'Reels Punch', category: 'vibrant', brightness: 108, contrast: 128, saturation: 145, hue: 4, description: 'Engineered for short-form scroll-stoppers' },
  { id: 'vibrant-sunset', name: 'Warm Sunset', category: 'vibrant', brightness: 110, contrast: 108, saturation: 125, hue: 14, description: 'Golden hour everywhere' },
  { id: 'vibrant-tropics', name: 'Tropic Pop', category: 'vibrant', brightness: 108, contrast: 112, saturation: 135, hue: -6, description: 'Beach colors turned to 11' },
  { id: 'vintage-film', name: 'Kodachrome', category: 'vintage', brightness: 102, contrast: 96, saturation: 88, hue: 8, description: 'Old-school 35mm film look' },
  { id: 'vintage-faded', name: 'Faded Matte', category: 'vintage', brightness: 95, contrast: 84, saturation: 90, hue: 4, description: 'Washed-out indie aesthetic' },
  { id: 'mono-bw', name: 'B&W Cinema', category: 'mono', brightness: 102, contrast: 130, saturation: 0, hue: 0, description: 'High-contrast black and white' },
  { id: 'mood-cool', name: 'Cool Moody', category: 'mood', brightness: 90, contrast: 122, saturation: 80, hue: -16, description: 'Cold, melancholy tone' },
  { id: 'mood-dark', name: 'Dark Cinema', category: 'mood', brightness: 84, contrast: 132, saturation: 88, hue: -4, description: 'Dramatic low-key' },
  { id: 'mood-dream', name: 'Dreamy Glow', category: 'mood', brightness: 114, contrast: 96, saturation: 105, hue: 8, description: 'Soft, hazy, dreamlike' },
];

export interface TransitionPreset {
  id: string;
  name: string;
  kind: 'cut' | 'dissolve' | 'fade-black' | 'fade-white' | 'slide' | 'zoom' | 'whip' | 'glitch' | 'flash';
  duration: number;
  direction?: 'left' | 'right' | 'up' | 'down' | 'in' | 'out';
  description: string;
}

export const TRANSITIONS: TransitionPreset[] = [
  { id: 'cut', name: 'Cut', kind: 'cut', duration: 0, description: 'Hard edit, no transition' },
  { id: 'dissolve', name: 'Cross Dissolve', kind: 'dissolve', duration: 0.6, description: 'Classic crossfade' },
  { id: 'fade-black', name: 'Fade to Black', kind: 'fade-black', duration: 0.8, description: 'Through black' },
  { id: 'fade-white', name: 'Fade to White', kind: 'fade-white', duration: 0.6, description: 'Bright flash through white' },
  { id: 'slide-left', name: 'Slide Left', kind: 'slide', duration: 0.5, direction: 'left', description: 'Push from right' },
  { id: 'slide-right', name: 'Slide Right', kind: 'slide', duration: 0.5, direction: 'right', description: 'Push from left' },
  { id: 'slide-up', name: 'Slide Up', kind: 'slide', duration: 0.5, direction: 'up', description: 'Push from below' },
  { id: 'slide-down', name: 'Slide Down', kind: 'slide', duration: 0.5, direction: 'down', description: 'Push from above' },
  { id: 'zoom-in', name: 'Zoom In', kind: 'zoom', duration: 0.6, direction: 'in', description: 'Punch zoom into next clip' },
  { id: 'zoom-out', name: 'Zoom Out', kind: 'zoom', duration: 0.6, direction: 'out', description: 'Pull back to next clip' },
  { id: 'whip', name: 'Whip Pan', kind: 'whip', duration: 0.3, description: 'Fast camera pan' },
  { id: 'glitch', name: 'Glitch', kind: 'glitch', duration: 0.25, description: 'Digital artifact cut' },
  { id: 'flash', name: 'Color Flash', kind: 'flash', duration: 0.25, description: 'Quick color burst' },
];

export interface TitlePreset {
  id: string;
  name: string;
  category: 'intro' | 'outro' | 'lower-third' | 'section' | 'caption' | 'logo';
  text: string;
  font: string;
  size: number;
  color: string;
  weight: number;
  italic?: boolean;
  align: CanvasTextAlign;
  pos: 'top' | 'center' | 'bottom';
  anim: 'none' | 'fade' | 'slide-up' | 'pop';
  outline?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  background?: string;
  description: string;
}

export const TITLE_PRESETS: TitlePreset[] = [
  { id: 'bold-center', name: 'Bold Centered', category: 'intro', text: 'YOUR TITLE', font: 'Impact, sans-serif', size: 120, color: '#ffffff', weight: 900, align: 'center', pos: 'center', anim: 'pop', outline: true, outlineColor: '#000000', outlineWidth: 8, description: 'Big, bold, attention-grabbing' },
  { id: 'minimal-center', name: 'Minimalist', category: 'intro', text: 'a story by you', font: 'Georgia, serif', size: 56, color: '#ffffff', weight: 300, italic: true, align: 'center', pos: 'center', anim: 'fade', description: 'Elegant, understated' },
  { id: 'logo-reveal', name: 'Logo Reveal', category: 'logo', text: 'YOUR BRAND', font: 'Helvetica, Arial, sans-serif', size: 96, color: '#ffffff', weight: 700, align: 'center', pos: 'center', anim: 'pop', description: 'Brand intro' },
  { id: 'lower-third-news', name: 'News Lower-Third', category: 'lower-third', text: 'John Doe\nReporter', font: 'Arial, sans-serif', size: 44, color: '#ffffff', weight: 700, align: 'left', pos: 'bottom', anim: 'slide-up', background: 'rgba(0,0,0,.8)', description: 'TV-style speaker ID' },
  { id: 'lower-third-modern', name: 'Modern Name Tag', category: 'lower-third', text: 'YOUR NAME', font: 'Helvetica, Arial, sans-serif', size: 52, color: '#ffffff', weight: 800, align: 'left', pos: 'bottom', anim: 'slide-up', outline: true, outlineColor: '#000000', outlineWidth: 4, description: 'Bold lower-third' },
  { id: 'location-stamp', name: 'Location Stamp', category: 'caption', text: 'Tokyo, Japan', font: 'Courier New, monospace', size: 36, color: '#ffffff', weight: 400, align: 'left', pos: 'top', anim: 'fade', outline: true, outlineColor: '#000000', outlineWidth: 2, description: 'Travel-style location tag' },
  { id: 'section-divider', name: 'Section Divider', category: 'section', text: 'PART ONE', font: 'Georgia, serif', size: 88, color: '#ffffff', weight: 700, align: 'center', pos: 'center', anim: 'fade', description: 'Chapter break' },
  { id: 'big-quote', name: 'Big Quote', category: 'caption', text: '"A great quote\\ngoes here."', font: 'Georgia, serif', size: 64, color: '#ffffff', weight: 400, italic: true, align: 'center', pos: 'center', anim: 'fade', description: 'Pull quote for testimonials' },
  { id: 'end-screen-cta', name: 'End Screen — Subscribe', category: 'outro', text: 'SUBSCRIBE FOR MORE', font: 'Impact, sans-serif', size: 96, color: '#ff0000', weight: 900, align: 'center', pos: 'center', anim: 'pop', outline: true, outlineColor: '#ffffff', outlineWidth: 6, description: 'YouTube-style CTA' },
  { id: 'end-thanks', name: 'Thank You', category: 'outro', text: 'thank you for watching', font: 'Georgia, serif', size: 56, color: '#ffffff', weight: 300, italic: true, align: 'center', pos: 'center', anim: 'fade', description: 'Gentle outro' },
  { id: 'date-banner', name: 'Date Banner', category: 'caption', text: 'JANUARY 2026', font: 'Helvetica, Arial, sans-serif', size: 44, color: '#ffffff', weight: 800, align: 'left', pos: 'top', anim: 'slide-up', background: 'rgba(0,0,0,.6)', description: 'Timestamp banner' },
  { id: 'tutorial-step', name: 'Step Counter', category: 'caption', text: 'STEP 1', font: 'Helvetica, Arial, sans-serif', size: 60, color: '#ffe14d', weight: 900, align: 'left', pos: 'top', anim: 'slide-up', outline: true, outlineColor: '#000000', outlineWidth: 4, description: 'How-to step indicator' },
];

export interface SubtitleStylePreset {
  id: string;
  name: string;
  category: 'streaming' | 'social' | 'cinema' | 'broadcast' | 'gaming' | 'educational';
  font: string;
  size: number;
  color: string;
  weight: number;
  italic: boolean;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  background: 'none' | 'box';
  bgColor: string;
  pos: 'top' | 'center' | 'bottom';
  description: string;
}

export const SUBTITLE_STYLES: SubtitleStylePreset[] = [
  { id: 'netflix', name: 'Netflix', category: 'streaming', font: 'Arial, sans-serif', size: 44, color: '#ffffff', weight: 500, italic: false, outline: true, outlineColor: '#000', outlineWidth: 3, background: 'none', bgColor: 'rgba(0,0,0,.8)', pos: 'bottom', description: 'Clean, streaming-style' },
  { id: 'youtube', name: 'YouTube Auto', category: 'streaming', font: 'Arial, sans-serif', size: 36, color: '#ffffff', weight: 400, italic: false, outline: false, outlineColor: '#000', outlineWidth: 0, background: 'box', bgColor: 'rgba(0,0,0,.85)', pos: 'bottom', description: 'Standard YouTube' },
  { id: 'tiktok-pop', name: 'TikTok Pop', category: 'social', font: 'Impact, sans-serif', size: 88, color: '#ffffff', weight: 900, italic: false, outline: true, outlineColor: '#000', outlineWidth: 9, background: 'none', bgColor: 'transparent', pos: 'center', description: 'Big bold word-by-word' },
  { id: 'reels-yellow', name: 'Reels Yellow Pop', category: 'social', font: 'Impact, sans-serif', size: 84, color: '#ffe600', weight: 900, italic: false, outline: true, outlineColor: '#000', outlineWidth: 8, background: 'none', bgColor: 'transparent', pos: 'center', description: 'Viral Reels look' },
  { id: 'reels-white', name: 'Reels Soft', category: 'social', font: 'Helvetica, Arial, sans-serif', size: 60, color: '#ffffff', weight: 800, italic: false, outline: true, outlineColor: '#000', outlineWidth: 5, background: 'none', bgColor: 'transparent', pos: 'bottom', description: 'Cleaner Reels style' },
  { id: 'karaoke', name: 'Karaoke Highlight', category: 'social', font: 'Arial, sans-serif', size: 58, color: '#ffffff', weight: 700, italic: false, outline: true, outlineColor: '#2dd4ff', outlineWidth: 5, background: 'none', bgColor: 'transparent', pos: 'bottom', description: 'Sing-along style' },
  { id: 'cinema-classic', name: 'Cinema Classic', category: 'cinema', font: 'Georgia, serif', size: 42, color: '#ffffff', weight: 400, italic: false, outline: true, outlineColor: '#000', outlineWidth: 3, background: 'none', bgColor: 'transparent', pos: 'bottom', description: 'Movie-theater style' },
  { id: 'cinema-italic', name: 'Cinema Italic', category: 'cinema', font: 'Georgia, serif', size: 40, color: '#fff7d6', weight: 400, italic: true, outline: true, outlineColor: '#000', outlineWidth: 3, background: 'none', bgColor: 'transparent', pos: 'bottom', description: 'For foreign-language films' },
  { id: 'broadcast-news', name: 'Broadcast News', category: 'broadcast', font: 'Arial, sans-serif', size: 36, color: '#ffffff', weight: 700, italic: false, outline: false, outlineColor: '#000', outlineWidth: 0, background: 'box', bgColor: 'rgba(20,40,80,.95)', pos: 'bottom', description: 'TV news ticker' },
  { id: 'broadcast-sports', name: 'Sports Banner', category: 'broadcast', font: 'Impact, sans-serif', size: 42, color: '#ffe14d', weight: 900, italic: false, outline: true, outlineColor: '#000', outlineWidth: 3, background: 'box', bgColor: 'rgba(220,30,30,.9)', pos: 'bottom', description: 'Sports lower-third' },
  { id: 'gaming-stream', name: 'Gaming Stream', category: 'gaming', font: 'Helvetica, Arial, sans-serif', size: 56, color: '#a3ff5c', weight: 800, italic: false, outline: true, outlineColor: '#0a3300', outlineWidth: 6, background: 'none', bgColor: 'transparent', pos: 'bottom', description: 'Twitch-style neon' },
  { id: 'gaming-neon', name: 'Gaming Neon', category: 'gaming', font: 'Impact, sans-serif', size: 60, color: '#ff2dff', weight: 900, italic: false, outline: true, outlineColor: '#000', outlineWidth: 6, background: 'none', bgColor: 'transparent', pos: 'center', description: 'Bright magenta neon' },
  { id: 'edu-clean', name: 'Educational Clean', category: 'educational', font: 'Georgia, serif', size: 40, color: '#1a1a1a', weight: 600, italic: false, outline: false, outlineColor: '#000', outlineWidth: 0, background: 'box', bgColor: 'rgba(255,255,255,.95)', pos: 'bottom', description: 'Lecture-style readable' },
  { id: 'edu-pop', name: 'Pop Quiz', category: 'educational', font: 'Helvetica, Arial, sans-serif', size: 50, color: '#ffffff', weight: 700, italic: false, outline: true, outlineColor: '#1d6fd8', outlineWidth: 5, background: 'box', bgColor: 'rgba(29,111,216,.85)', pos: 'bottom', description: 'Educational with emphasis' },
  { id: 'minimalist', name: 'Minimalist', category: 'cinema', font: 'Helvetica, Arial, sans-serif', size: 32, color: '#ffffff', weight: 300, italic: false, outline: false, outlineColor: '#000', outlineWidth: 0, background: 'none', bgColor: 'transparent', pos: 'bottom', description: 'Tiny, unobtrusive' },
  { id: 'magazine', name: 'Magazine', category: 'social', font: 'Georgia, serif', size: 48, color: '#ffffff', weight: 700, italic: true, outline: true, outlineColor: '#000', outlineWidth: 4, background: 'none', bgColor: 'transparent', pos: 'center', description: 'Editorial caption style' },
  { id: 'comic', name: 'Comic Book', category: 'social', font: 'Comic Sans MS, cursive', size: 56, color: '#ffe14d', weight: 700, italic: false, outline: true, outlineColor: '#000', outlineWidth: 6, background: 'none', bgColor: 'transparent', pos: 'center', description: 'Comic-style burst' },
  { id: 'documentary', name: 'Documentary', category: 'cinema', font: 'Helvetica, Arial, sans-serif', size: 38, color: '#f4f4f5', weight: 400, italic: false, outline: false, outlineColor: '#000', outlineWidth: 0, background: 'box', bgColor: 'rgba(0,0,0,.65)', pos: 'bottom', description: 'Soft doc-film style' },
  { id: 'corner-top', name: 'Top-Corner Note', category: 'broadcast', font: 'Helvetica, Arial, sans-serif', size: 28, color: '#ffffff', weight: 600, italic: false, outline: true, outlineColor: '#000', outlineWidth: 2, background: 'none', bgColor: 'transparent', pos: 'top', description: 'Subtle top placement' },
  { id: 'high-contrast', name: 'Accessibility High-Contrast', category: 'streaming', font: 'Arial, sans-serif', size: 52, color: '#ffff00', weight: 800, italic: false, outline: true, outlineColor: '#000', outlineWidth: 5, background: 'box', bgColor: 'rgba(0,0,0,.95)', pos: 'bottom', description: 'Maximum readability' },
];

export type VideoTemplateCategory = 'social' | 'business' | 'lifestyle' | 'travel' | 'gaming' | 'tutorial' | 'celebration' | 'music';

export interface VideoTemplateSlot {
  id: string;
  kind: 'video' | 'image' | 'audio';
  start: number;
  duration: number;
  label: string;
  hint?: string;
}

export interface VideoTemplateText {
  text: string;
  preset: string;
  start: number;
  duration: number;
  pos: 'top' | 'center' | 'bottom';
}

export interface VideoTemplate {
  id: string;
  name: string;
  category: VideoTemplateCategory;
  description: string;
  duration: number;
  resolution: { w: number; h: number; fps: number };
  slots: VideoTemplateSlot[];
  texts: VideoTemplateText[];
  colorGrade?: string;
  defaultTransition?: string;
  musicGenre?: 'lofi' | 'house' | 'hiphop' | 'ambient' | 'pop' | 'synthwave';
  musicBpm?: number;
  thumbColors: string[];
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'tiktok-hook', name: 'TikTok Hook', category: 'social',
    description: 'Pattern interrupt → reveal → CTA. Optimized for retention.',
    duration: 30, resolution: { w: 1080, h: 1920, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 3, label: 'Hook shot', hint: 'Punchy 2–3 second pattern interrupt' },
      { id: 's2', kind: 'video', start: 3, duration: 17, label: 'Main content', hint: 'Body of your message' },
      { id: 's3', kind: 'video', start: 20, duration: 10, label: 'Payoff + CTA', hint: 'The reveal and call-to-action' },
    ],
    texts: [
      { text: 'WAIT FOR IT…', preset: 'bold-center', start: 0, duration: 2.5, pos: 'center' },
      { text: 'FOLLOW FOR MORE', preset: 'end-screen-cta', start: 26, duration: 4, pos: 'center' },
    ],
    colorGrade: 'vibrant-reels', defaultTransition: 'whip', musicGenre: 'hiphop', musicBpm: 95,
    thumbColors: ['#fe2c55', '#25f4ee', '#000000'],
  },
  {
    id: 'reel-cinematic', name: 'Instagram Reel — Cinematic', category: 'social',
    description: 'Three slow-motion beats, big quote, fade out.',
    duration: 22, resolution: { w: 1080, h: 1920, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 7, label: 'Establishing shot' },
      { id: 's2', kind: 'video', start: 7, duration: 8, label: 'Subject focus' },
      { id: 's3', kind: 'video', start: 15, duration: 7, label: 'Closing wide shot' },
    ],
    texts: [
      { text: 'A moment in time', preset: 'minimal-center', start: 1, duration: 4, pos: 'bottom' },
      { text: '"some things are forever"', preset: 'big-quote', start: 12, duration: 5, pos: 'center' },
    ],
    colorGrade: 'cinematic-teal-orange', defaultTransition: 'dissolve', musicGenre: 'ambient', musicBpm: 70,
    thumbColors: ['#1a3a4a', '#d97742', '#0a1a1a'],
  },
  {
    id: 'youtube-short', name: 'YouTube Short Tutorial', category: 'social',
    description: 'Hook → 3 steps → recap. Step counters built in.',
    duration: 45, resolution: { w: 1080, h: 1920, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 5, label: 'Hook' },
      { id: 's2', kind: 'video', start: 5, duration: 12, label: 'Step 1' },
      { id: 's3', kind: 'video', start: 17, duration: 12, label: 'Step 2' },
      { id: 's4', kind: 'video', start: 29, duration: 12, label: 'Step 3' },
      { id: 's5', kind: 'video', start: 41, duration: 4, label: 'Recap + Subscribe' },
    ],
    texts: [
      { text: 'HOW TO ___ in 3 STEPS', preset: 'bold-center', start: 0, duration: 4, pos: 'top' },
      { text: 'STEP 1', preset: 'tutorial-step', start: 5, duration: 2, pos: 'top' },
      { text: 'STEP 2', preset: 'tutorial-step', start: 17, duration: 2, pos: 'top' },
      { text: 'STEP 3', preset: 'tutorial-step', start: 29, duration: 2, pos: 'top' },
      { text: 'SUBSCRIBE!', preset: 'end-screen-cta', start: 41, duration: 4, pos: 'center' },
    ],
    colorGrade: 'vibrant-pop', defaultTransition: 'slide-left', musicGenre: 'pop', musicBpm: 120,
    thumbColors: ['#ff0000', '#ffffff', '#1a1a1a'],
  },
  {
    id: 'product-demo', name: 'Product Demo', category: 'business',
    description: 'Logo intro → 3 features → CTA.',
    duration: 45, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'image', start: 0, duration: 3, label: 'Logo / brand', hint: 'Your logo on solid background' },
      { id: 's2', kind: 'video', start: 3, duration: 12, label: 'Feature 1 demo' },
      { id: 's3', kind: 'video', start: 15, duration: 12, label: 'Feature 2 demo' },
      { id: 's4', kind: 'video', start: 27, duration: 12, label: 'Feature 3 demo' },
      { id: 's5', kind: 'image', start: 39, duration: 6, label: 'CTA card' },
    ],
    texts: [
      { text: 'YOUR BRAND', preset: 'logo-reveal', start: 0, duration: 3, pos: 'center' },
      { text: 'Feature One', preset: 'lower-third-modern', start: 4, duration: 10, pos: 'bottom' },
      { text: 'Feature Two', preset: 'lower-third-modern', start: 16, duration: 10, pos: 'bottom' },
      { text: 'Feature Three', preset: 'lower-third-modern', start: 28, duration: 10, pos: 'bottom' },
      { text: 'Get started today', preset: 'minimal-center', start: 40, duration: 5, pos: 'center' },
    ],
    colorGrade: 'cinematic-teal-orange', defaultTransition: 'dissolve', musicGenre: 'pop', musicBpm: 110,
    thumbColors: ['#1d6fd8', '#ffffff', '#0a0b0e'],
  },
  {
    id: 'testimonial', name: 'Customer Testimonial', category: 'business',
    description: 'Talking head + lower-third + B-roll cuts.',
    duration: 60, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 18, label: 'Customer talking (front)' },
      { id: 's2', kind: 'video', start: 18, duration: 12, label: 'B-roll context' },
      { id: 's3', kind: 'video', start: 30, duration: 18, label: 'Customer talking (cont.)' },
      { id: 's4', kind: 'video', start: 48, duration: 12, label: 'Closing B-roll' },
    ],
    texts: [
      { text: 'Jane Doe\nCEO, Acme Co.', preset: 'lower-third-news', start: 1, duration: 5, pos: 'bottom' },
      { text: '"the best decision we made"', preset: 'big-quote', start: 38, duration: 6, pos: 'center' },
    ],
    colorGrade: 'cinematic-teal-orange', defaultTransition: 'dissolve', musicGenre: 'ambient', musicBpm: 80,
    thumbColors: ['#1a3a4a', '#d97742', '#ffffff'],
  },
  {
    id: 'promo-sale', name: 'Promo / Sale Announcement', category: 'business',
    description: 'Fast cuts + bold sale text + countdown energy.',
    duration: 15, resolution: { w: 1080, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'image', start: 0, duration: 3, label: 'Product hero' },
      { id: 's2', kind: 'image', start: 3, duration: 3, label: 'Detail shot' },
      { id: 's3', kind: 'image', start: 6, duration: 3, label: 'Lifestyle' },
      { id: 's4', kind: 'image', start: 9, duration: 3, label: 'Detail 2' },
      { id: 's5', kind: 'image', start: 12, duration: 3, label: 'Sale graphic' },
    ],
    texts: [
      { text: '50% OFF', preset: 'bold-center', start: 0, duration: 15, pos: 'center' },
      { text: 'TODAY ONLY', preset: 'date-banner', start: 0, duration: 15, pos: 'top' },
      { text: 'SHOP NOW', preset: 'end-screen-cta', start: 12, duration: 3, pos: 'bottom' },
    ],
    colorGrade: 'vibrant-pop', defaultTransition: 'glitch', musicGenre: 'house', musicBpm: 128,
    thumbColors: ['#ff0040', '#ffe14d', '#000000'],
  },
  {
    id: 'travel-vlog', name: 'Travel Vlog', category: 'travel',
    description: 'Location → highlights → personal moment → outro.',
    duration: 60, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 8, label: 'Establishing shot' },
      { id: 's2', kind: 'video', start: 8, duration: 14, label: 'Highlight 1' },
      { id: 's3', kind: 'video', start: 22, duration: 14, label: 'Highlight 2' },
      { id: 's4', kind: 'video', start: 36, duration: 14, label: 'Personal moment' },
      { id: 's5', kind: 'video', start: 50, duration: 10, label: 'Closing wide' },
    ],
    texts: [
      { text: 'Tokyo, Japan', preset: 'location-stamp', start: 1, duration: 5, pos: 'top' },
      { text: 'thanks for watching', preset: 'end-thanks', start: 54, duration: 6, pos: 'center' },
    ],
    colorGrade: 'vibrant-sunset', defaultTransition: 'dissolve', musicGenre: 'lofi', musicBpm: 78,
    thumbColors: ['#d97742', '#f4a261', '#264653'],
  },
  {
    id: 'travel-cinematic', name: 'Cinematic Travel', category: 'travel',
    description: 'Slow, beautiful, anamorphic look.',
    duration: 45, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 9, label: 'Wide aerial' },
      { id: 's2', kind: 'video', start: 9, duration: 12, label: 'Subject in motion' },
      { id: 's3', kind: 'video', start: 21, duration: 12, label: 'Detail shot' },
      { id: 's4', kind: 'video', start: 33, duration: 12, label: 'Closing wide' },
    ],
    texts: [
      { text: 'A film by you', preset: 'minimal-center', start: 39, duration: 5, pos: 'center' },
    ],
    colorGrade: 'cinematic-anamorphic', defaultTransition: 'dissolve', musicGenre: 'ambient', musicBpm: 65,
    thumbColors: ['#0a2a3a', '#f4a261', '#000000'],
  },
  {
    id: 'recipe-quick', name: 'Recipe / Cooking', category: 'lifestyle',
    description: 'Ingredients → steps → result.',
    duration: 30, resolution: { w: 1080, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'image', start: 0, duration: 3, label: 'Final dish' },
      { id: 's2', kind: 'image', start: 3, duration: 4, label: 'Ingredients laid out' },
      { id: 's3', kind: 'video', start: 7, duration: 6, label: 'Prep' },
      { id: 's4', kind: 'video', start: 13, duration: 6, label: 'Cook' },
      { id: 's5', kind: 'video', start: 19, duration: 6, label: 'Plate' },
      { id: 's6', kind: 'image', start: 25, duration: 5, label: 'Final shot' },
    ],
    texts: [
      { text: 'Recipe Name', preset: 'bold-center', start: 0, duration: 3, pos: 'center' },
      { text: '15 min · serves 2', preset: 'date-banner', start: 0, duration: 30, pos: 'top' },
      { text: 'Save this recipe →', preset: 'end-screen-cta', start: 25, duration: 5, pos: 'bottom' },
    ],
    colorGrade: 'vibrant-sunset', defaultTransition: 'slide-up', musicGenre: 'pop', musicBpm: 115,
    thumbColors: ['#fbbf24', '#dc2626', '#fef3c7'],
  },
  {
    id: 'workout', name: 'Workout / Fitness', category: 'lifestyle',
    description: 'Warm-up → exercises → cooldown, with timers.',
    duration: 45, resolution: { w: 1080, h: 1920, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 5, label: 'Intro/warm-up' },
      { id: 's2', kind: 'video', start: 5, duration: 10, label: 'Exercise 1' },
      { id: 's3', kind: 'video', start: 15, duration: 10, label: 'Exercise 2' },
      { id: 's4', kind: 'video', start: 25, duration: 10, label: 'Exercise 3' },
      { id: 's5', kind: 'video', start: 35, duration: 10, label: 'Cooldown' },
    ],
    texts: [
      { text: '15-MIN FULL BODY', preset: 'bold-center', start: 0, duration: 4, pos: 'top' },
      { text: 'Exercise 1', preset: 'tutorial-step', start: 5, duration: 3, pos: 'top' },
      { text: 'Exercise 2', preset: 'tutorial-step', start: 15, duration: 3, pos: 'top' },
      { text: 'Exercise 3', preset: 'tutorial-step', start: 25, duration: 3, pos: 'top' },
    ],
    colorGrade: 'vibrant-pop', defaultTransition: 'slide-up', musicGenre: 'house', musicBpm: 128,
    thumbColors: ['#22c55e', '#ffe14d', '#000000'],
  },
  {
    id: 'day-in-life', name: 'Day in the Life', category: 'lifestyle',
    description: 'Morning → day → night vibes.',
    duration: 60, resolution: { w: 1080, h: 1920, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 10, label: 'Morning routine' },
      { id: 's2', kind: 'video', start: 10, duration: 10, label: 'Commute / start' },
      { id: 's3', kind: 'video', start: 20, duration: 15, label: 'Work / activities' },
      { id: 's4', kind: 'video', start: 35, duration: 15, label: 'Evening / friends' },
      { id: 's5', kind: 'video', start: 50, duration: 10, label: 'Wind down' },
    ],
    texts: [
      { text: 'Morning', preset: 'location-stamp', start: 0, duration: 4, pos: 'top' },
      { text: 'Afternoon', preset: 'location-stamp', start: 20, duration: 4, pos: 'top' },
      { text: 'Evening', preset: 'location-stamp', start: 35, duration: 4, pos: 'top' },
    ],
    colorGrade: 'vintage-film', defaultTransition: 'dissolve', musicGenre: 'lofi', musicBpm: 80,
    thumbColors: ['#fbbf24', '#a855f7', '#1e1b4b'],
  },
  {
    id: 'gaming-highlights', name: 'Gaming Highlights', category: 'gaming',
    description: 'Best plays montage with kill counters.',
    duration: 40, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 3, label: 'Intro overlay' },
      { id: 's2', kind: 'video', start: 3, duration: 8, label: 'Play 1' },
      { id: 's3', kind: 'video', start: 11, duration: 8, label: 'Play 2' },
      { id: 's4', kind: 'video', start: 19, duration: 8, label: 'Play 3' },
      { id: 's5', kind: 'video', start: 27, duration: 8, label: 'Best play (last)' },
      { id: 's6', kind: 'video', start: 35, duration: 5, label: 'Outro / sub' },
    ],
    texts: [
      { text: 'TOP PLAYS', preset: 'bold-center', start: 0, duration: 3, pos: 'center' },
      { text: 'CLIP 1', preset: 'tutorial-step', start: 3, duration: 2, pos: 'top' },
      { text: 'CLIP 2', preset: 'tutorial-step', start: 11, duration: 2, pos: 'top' },
      { text: 'CLIP 3', preset: 'tutorial-step', start: 19, duration: 2, pos: 'top' },
      { text: 'BEST PLAY', preset: 'bold-center', start: 27, duration: 2, pos: 'top' },
      { text: 'SUBSCRIBE!', preset: 'end-screen-cta', start: 35, duration: 5, pos: 'center' },
    ],
    colorGrade: 'cinematic-blade-runner', defaultTransition: 'glitch', musicGenre: 'synthwave', musicBpm: 140,
    thumbColors: ['#ff2dff', '#22d3ee', '#000000'],
  },
  {
    id: 'gaming-twitch', name: 'Twitch Clip', category: 'gaming',
    description: 'Stream-style highlight with chat-friendly captions.',
    duration: 30, resolution: { w: 1920, h: 1080, fps: 60 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 30, label: 'Gameplay clip' },
    ],
    texts: [
      { text: 'POV: when you finally do it', preset: 'lower-third-modern', start: 1, duration: 28, pos: 'bottom' },
    ],
    colorGrade: 'vibrant-pop', defaultTransition: 'cut', musicGenre: 'synthwave', musicBpm: 130,
    thumbColors: ['#9146ff', '#ffffff', '#1a1a1a'],
  },
  {
    id: 'tutorial-howto', name: 'How-To Tutorial', category: 'tutorial',
    description: 'Intro + 5 steps + recap + CTA.',
    duration: 90, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 8, label: 'Intro / what you\'ll learn' },
      { id: 's2', kind: 'video', start: 8, duration: 15, label: 'Step 1' },
      { id: 's3', kind: 'video', start: 23, duration: 15, label: 'Step 2' },
      { id: 's4', kind: 'video', start: 38, duration: 15, label: 'Step 3' },
      { id: 's5', kind: 'video', start: 53, duration: 15, label: 'Step 4' },
      { id: 's6', kind: 'video', start: 68, duration: 15, label: 'Step 5' },
      { id: 's7', kind: 'video', start: 83, duration: 7, label: 'Recap / CTA' },
    ],
    texts: [
      { text: 'How to do anything', preset: 'bold-center', start: 0, duration: 7, pos: 'center' },
      { text: 'STEP 1', preset: 'tutorial-step', start: 8, duration: 3, pos: 'top' },
      { text: 'STEP 2', preset: 'tutorial-step', start: 23, duration: 3, pos: 'top' },
      { text: 'STEP 3', preset: 'tutorial-step', start: 38, duration: 3, pos: 'top' },
      { text: 'STEP 4', preset: 'tutorial-step', start: 53, duration: 3, pos: 'top' },
      { text: 'STEP 5', preset: 'tutorial-step', start: 68, duration: 3, pos: 'top' },
      { text: 'SUBSCRIBE', preset: 'end-screen-cta', start: 84, duration: 6, pos: 'center' },
    ],
    colorGrade: 'vibrant-pop', defaultTransition: 'slide-left', musicGenre: 'pop', musicBpm: 110,
    thumbColors: ['#1d6fd8', '#ffe14d', '#1a1a1a'],
  },
  {
    id: 'software-walkthrough', name: 'Software Walkthrough', category: 'tutorial',
    description: 'Screen recording with callouts.',
    duration: 120, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 10, label: 'Intro' },
      { id: 's2', kind: 'video', start: 10, duration: 100, label: 'Screen recording' },
      { id: 's3', kind: 'video', start: 110, duration: 10, label: 'Wrap-up' },
    ],
    texts: [
      { text: 'Quick walkthrough', preset: 'minimal-center', start: 0, duration: 6, pos: 'center' },
      { text: 'thanks for watching', preset: 'end-thanks', start: 112, duration: 8, pos: 'center' },
    ],
    colorGrade: 'original', defaultTransition: 'cut', musicGenre: 'lofi', musicBpm: 75,
    thumbColors: ['#0ea5e9', '#ffffff', '#0c0d10'],
  },
  {
    id: 'birthday', name: 'Birthday Highlight', category: 'celebration',
    description: 'Memory-lane birthday montage with the year banner.',
    duration: 60, resolution: { w: 1080, h: 1920, fps: 30 },
    slots: [
      { id: 's1', kind: 'image', start: 0, duration: 4, label: 'Birthday person photo' },
      { id: 's2', kind: 'video', start: 4, duration: 14, label: 'Moment 1' },
      { id: 's3', kind: 'video', start: 18, duration: 14, label: 'Moment 2' },
      { id: 's4', kind: 'video', start: 32, duration: 14, label: 'Moment 3' },
      { id: 's5', kind: 'video', start: 46, duration: 10, label: 'Cake / candles' },
      { id: 's6', kind: 'image', start: 56, duration: 4, label: 'Closing photo' },
    ],
    texts: [
      { text: 'HAPPY BIRTHDAY', preset: 'bold-center', start: 0, duration: 4, pos: 'center' },
      { text: 'cheers to another year', preset: 'minimal-center', start: 50, duration: 10, pos: 'center' },
    ],
    colorGrade: 'vintage-film', defaultTransition: 'dissolve', musicGenre: 'pop', musicBpm: 115,
    thumbColors: ['#ec4899', '#fbbf24', '#ffffff'],
  },
  {
    id: 'wedding-highlight', name: 'Wedding Highlight', category: 'celebration',
    description: 'Cinematic wedding film: prep → ceremony → reception.',
    duration: 90, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 15, label: 'Prep / getting ready' },
      { id: 's2', kind: 'video', start: 15, duration: 25, label: 'Ceremony' },
      { id: 's3', kind: 'video', start: 40, duration: 20, label: 'First dance' },
      { id: 's4', kind: 'video', start: 60, duration: 20, label: 'Reception party' },
      { id: 's5', kind: 'video', start: 80, duration: 10, label: 'Closing' },
    ],
    texts: [
      { text: 'name & name', preset: 'minimal-center', start: 1, duration: 6, pos: 'center' },
      { text: 'forever', preset: 'big-quote', start: 82, duration: 8, pos: 'center' },
    ],
    colorGrade: 'cinematic-wes', defaultTransition: 'dissolve', musicGenre: 'ambient', musicBpm: 70,
    thumbColors: ['#fef3c7', '#a78bfa', '#1e1b4b'],
  },
  {
    id: 'anniversary', name: 'Anniversary Reel', category: 'celebration',
    description: 'Photo montage of memories over the years.',
    duration: 30, resolution: { w: 1080, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'image', start: 0, duration: 3, label: 'Year 1' },
      { id: 's2', kind: 'image', start: 3, duration: 3, label: 'Year 2' },
      { id: 's3', kind: 'image', start: 6, duration: 3, label: 'Year 3' },
      { id: 's4', kind: 'image', start: 9, duration: 3, label: 'Year 4' },
      { id: 's5', kind: 'image', start: 12, duration: 3, label: 'Year 5' },
      { id: 's6', kind: 'image', start: 15, duration: 3, label: 'Year 6' },
      { id: 's7', kind: 'image', start: 18, duration: 3, label: 'Year 7' },
      { id: 's8', kind: 'image', start: 21, duration: 3, label: 'Year 8' },
      { id: 's9', kind: 'image', start: 24, duration: 6, label: 'Today' },
    ],
    texts: [
      { text: 'our story', preset: 'minimal-center', start: 0, duration: 3, pos: 'center' },
      { text: 'and counting…', preset: 'minimal-center', start: 25, duration: 5, pos: 'center' },
    ],
    colorGrade: 'vintage-film', defaultTransition: 'dissolve', musicGenre: 'ambient', musicBpm: 70,
    thumbColors: ['#fef3c7', '#ec4899', '#7c2d12'],
  },
  {
    id: 'lyric-video', name: 'Lyric Video', category: 'music',
    description: 'Centered lyrics over your music.',
    duration: 60, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 60, label: 'Background visual' },
      { id: 's2', kind: 'audio', start: 0, duration: 60, label: 'Your song' },
    ],
    texts: [
      { text: 'SONG TITLE', preset: 'bold-center', start: 0, duration: 5, pos: 'center' },
      { text: 'first line of lyrics', preset: 'big-quote', start: 6, duration: 8, pos: 'center' },
      { text: 'second line', preset: 'big-quote', start: 14, duration: 8, pos: 'center' },
      { text: 'chorus line', preset: 'bold-center', start: 22, duration: 10, pos: 'center' },
    ],
    colorGrade: 'cinematic-blade-runner', defaultTransition: 'fade-black', musicGenre: 'synthwave', musicBpm: 100,
    thumbColors: ['#1e1b4b', '#a78bfa', '#ec4899'],
  },
  {
    id: 'instagram-story', name: 'Instagram Story', category: 'social',
    description: 'Single-clip story with sticker text.',
    duration: 15, resolution: { w: 1080, h: 1920, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 15, label: 'Story clip' },
    ],
    texts: [
      { text: 'TODAY', preset: 'lower-third-modern', start: 0, duration: 15, pos: 'top' },
      { text: 'tap to see more', preset: 'minimal-center', start: 12, duration: 3, pos: 'bottom' },
    ],
    colorGrade: 'vibrant-tropics', defaultTransition: 'cut', musicGenre: 'lofi', musicBpm: 85,
    thumbColors: ['#22d3ee', '#fbbf24', '#ec4899'],
  },
  {
    id: 'linkedin-announcement', name: 'LinkedIn Announcement', category: 'business',
    description: 'Professional clip with name + role tag.',
    duration: 30, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 30, label: 'Talking head' },
    ],
    texts: [
      { text: 'Your Name\nYour Role', preset: 'lower-third-news', start: 1, duration: 8, pos: 'bottom' },
    ],
    colorGrade: 'cinematic-teal-orange', defaultTransition: 'cut', musicGenre: 'ambient', musicBpm: 75,
    thumbColors: ['#1d6fd8', '#ffffff', '#0c0d10'],
  },
  {
    id: 'restaurant-promo', name: 'Restaurant Promo', category: 'business',
    description: 'Food porn cuts + open sign + reservation CTA.',
    duration: 20, resolution: { w: 1080, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'image', start: 0, duration: 3, label: 'Hero dish' },
      { id: 's2', kind: 'video', start: 3, duration: 5, label: 'Kitchen action' },
      { id: 's3', kind: 'image', start: 8, duration: 4, label: 'Interior shot' },
      { id: 's4', kind: 'image', start: 12, duration: 4, label: 'Another dish' },
      { id: 's5', kind: 'image', start: 16, duration: 4, label: 'Logo / address card' },
    ],
    texts: [
      { text: 'RESTAURANT NAME', preset: 'bold-center', start: 0, duration: 3, pos: 'bottom' },
      { text: 'Book a table →', preset: 'end-screen-cta', start: 16, duration: 4, pos: 'center' },
    ],
    colorGrade: 'vibrant-sunset', defaultTransition: 'dissolve', musicGenre: 'lofi', musicBpm: 90,
    thumbColors: ['#dc2626', '#fbbf24', '#1c0a05'],
  },
  {
    id: 'real-estate', name: 'Real Estate Walkthrough', category: 'business',
    description: 'House tour with room labels.',
    duration: 60, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 8, label: 'Exterior / curb appeal' },
      { id: 's2', kind: 'video', start: 8, duration: 10, label: 'Living room' },
      { id: 's3', kind: 'video', start: 18, duration: 10, label: 'Kitchen' },
      { id: 's4', kind: 'video', start: 28, duration: 10, label: 'Master bedroom' },
      { id: 's5', kind: 'video', start: 38, duration: 10, label: 'Bathroom / extra' },
      { id: 's6', kind: 'video', start: 48, duration: 8, label: 'Backyard / view' },
      { id: 's7', kind: 'image', start: 56, duration: 4, label: 'Contact card' },
    ],
    texts: [
      { text: '123 Elm Street', preset: 'location-stamp', start: 0, duration: 6, pos: 'top' },
      { text: 'Living Room', preset: 'lower-third-modern', start: 9, duration: 4, pos: 'bottom' },
      { text: 'Kitchen', preset: 'lower-third-modern', start: 19, duration: 4, pos: 'bottom' },
      { text: 'Master Bedroom', preset: 'lower-third-modern', start: 29, duration: 4, pos: 'bottom' },
      { text: 'Schedule a tour', preset: 'end-screen-cta', start: 56, duration: 4, pos: 'center' },
    ],
    colorGrade: 'cinematic-wes', defaultTransition: 'slide-left', musicGenre: 'lofi', musicBpm: 80,
    thumbColors: ['#fef3c7', '#a78bfa', '#1e1b4b'],
  },
  {
    id: 'event-recap', name: 'Event Recap', category: 'celebration',
    description: 'Conference/festival/meetup highlight reel.',
    duration: 45, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 5, label: 'Crowd shot' },
      { id: 's2', kind: 'video', start: 5, duration: 10, label: 'Speaker' },
      { id: 's3', kind: 'video', start: 15, duration: 10, label: 'Activity 1' },
      { id: 's4', kind: 'video', start: 25, duration: 10, label: 'Activity 2' },
      { id: 's5', kind: 'video', start: 35, duration: 10, label: 'Crowd reaction' },
    ],
    texts: [
      { text: 'EVENT NAME 2026', preset: 'bold-center', start: 0, duration: 4, pos: 'center' },
      { text: 'See you next year', preset: 'end-thanks', start: 40, duration: 5, pos: 'center' },
    ],
    colorGrade: 'vibrant-pop', defaultTransition: 'dissolve', musicGenre: 'house', musicBpm: 120,
    thumbColors: ['#a855f7', '#22d3ee', '#000000'],
  },
  {
    id: 'fashion-ootd', name: 'Outfit of the Day', category: 'lifestyle',
    description: 'Fashion reel with style cuts.',
    duration: 15, resolution: { w: 1080, h: 1920, fps: 30 },
    slots: [
      { id: 's1', kind: 'video', start: 0, duration: 3, label: 'Pose 1' },
      { id: 's2', kind: 'video', start: 3, duration: 3, label: 'Detail (shoes)' },
      { id: 's3', kind: 'video', start: 6, duration: 3, label: 'Pose 2' },
      { id: 's4', kind: 'video', start: 9, duration: 3, label: 'Detail (accessory)' },
      { id: 's5', kind: 'video', start: 12, duration: 3, label: 'Final pose' },
    ],
    texts: [
      { text: 'OOTD', preset: 'bold-center', start: 0, duration: 15, pos: 'top' },
    ],
    colorGrade: 'vibrant-reels', defaultTransition: 'whip', musicGenre: 'pop', musicBpm: 128,
    thumbColors: ['#ec4899', '#fbbf24', '#a855f7'],
  },
  {
    id: 'music-video', name: 'Music Video Cut', category: 'music',
    description: 'Performance + B-roll cuts on beat.',
    duration: 60, resolution: { w: 1920, h: 1080, fps: 30 },
    slots: [
      { id: 's1', kind: 'audio', start: 0, duration: 60, label: 'Your song' },
      { id: 's2', kind: 'video', start: 0, duration: 15, label: 'Performance shot 1' },
      { id: 's3', kind: 'video', start: 15, duration: 15, label: 'B-roll vibe' },
      { id: 's4', kind: 'video', start: 30, duration: 15, label: 'Performance 2' },
      { id: 's5', kind: 'video', start: 45, duration: 15, label: 'Closing montage' },
    ],
    texts: [
      { text: 'SONG TITLE', preset: 'minimal-center', start: 55, duration: 5, pos: 'center' },
    ],
    colorGrade: 'cinematic-blade-runner', defaultTransition: 'flash', musicGenre: 'synthwave', musicBpm: 120,
    thumbColors: ['#7c3aed', '#22d3ee', '#000000'],
  },
];

export function generateThumbSvg(template: VideoTemplate): string {
  const [c1, c2, c3] = template.thumbColors;
  const isVertical = template.resolution.h > template.resolution.w;
  const w = 320, h = isVertical ? 180 * (template.resolution.h / template.resolution.w) : 180;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="50%" stop-color="${c2}" />
        <stop offset="100%" stop-color="${c3}" />
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)" />
    <rect width="${w}" height="${h * 0.18}" y="${h * 0.82}" fill="rgba(0,0,0,.45)" />
    <text x="${w / 2}" y="${h * 0.5}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="${Math.min(w / 8, 26)}" fill="#fff" stroke="#000" stroke-width="0.6" paint-order="stroke fill">${template.name.toUpperCase()}</text>
    <text x="${w / 2}" y="${h * 0.93}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="rgba(255,255,255,.85)">${template.duration}s · ${template.resolution.w}×${template.resolution.h}</text>
  </svg>`;
}

export function thumbDataUri(template: VideoTemplate): string {
  const svg = generateThumbSvg(template);
  // Base64 (UTF-8 safe) rather than `;utf8,` + encodeURIComponent: the latter
  // leaves `#`, `(`, `)` unescaped which, inside an unquoted CSS `url(...)`,
  // makes the whole `background-image` value invalid → the browser drops it and
  // the thumbnail renders blank black. Base64 has no chars that break CSS url().
  let b64: string;
  try {
    b64 = typeof window !== 'undefined' && window.btoa
      ? window.btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg, 'utf8').toString('base64');
  } catch {
    // Fallback to the percent-encoded form if base64 ever fails.
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  return `data:image/svg+xml;base64,${b64}`;
}
