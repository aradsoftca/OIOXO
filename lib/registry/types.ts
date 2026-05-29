/**
 * XonTiles tool registry — single source of truth.
 *
 * Every tool ships a manifest declaring how it appears as a tile, what files
 * it accepts (drop-magic), and which engine + compute tier it runs on.
 */

export type Category =
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'text'
  | 'dev'
  | 'calc'
  | 'convert'
  | 'generator'
  | 'time'
  | 'finance'
  | 'seo'
  | 'game'
  | 'gis'
  | 'ip'
  | 'social'
  | 'font'
  | 'subtitle'
  | 'test'
  | 'code';

export type TileSize = 'S' | 'M' | 'L' | 'W';

export type ComputeTier =
  | 'instant'     // main thread, <50ms
  | 'local'       // Web Worker + WASM
  | 'webgpu'      // OffscreenCanvas / WebGPU compute
  | 'pro';        // optional Iceland GPU opt-in

export interface ToolManifest {
  /** URL slug — also the folder name under tools/ */
  id: string;
  /** Display name shown on tile and tool page */
  name: string;
  /** One-line description for SEO + tile subtitle */
  blurb: string;
  /** Category drives tile color and home-grouping */
  category: Category;
  /** Default home-screen tile size */
  tile: TileSize;
  /** Lucide icon name (component imported in TileIcon) */
  icon: string;
  /** Compute tier — affects badges and Pro toggle visibility */
  compute: ComputeTier;
  /** MIME types or extensions this tool accepts via drop-magic */
  accepts?: string[];
  /** Output MIME types this tool produces (for /convert routing) */
  produces?: string[];
  /** Marketing keywords for in-app search + SEO */
  keywords?: string[];
  /** Whether to pin this tool on the homepage by default */
  pinDefault?: boolean;
  /** Whether this tool can run fully offline once loaded */
  offline?: boolean;
  /** Optional: dynamic React component path (defaults to tools/{id}/ui.tsx) */
  uiPath?: string;
}

export interface CategoryMeta {
  id: Category;
  name: string;
  blurb: string;
  /** OKLCH var name reference, e.g. --color-cat-image */
  colorVar: string;
}

export const CATEGORIES: Record<Category, CategoryMeta> = {
  image:     { id: 'image',     name: 'Image',     blurb: 'Edit, convert, optimize images',  colorVar: '--color-cat-image' },
  audio:     { id: 'audio',     name: 'Audio',     blurb: 'Trim, mix, transcribe sound',      colorVar: '--color-cat-audio' },
  video:     { id: 'video',     name: 'Video',     blurb: 'Cut, watermark, export video',     colorVar: '--color-cat-video' },
  pdf:       { id: 'pdf',       name: 'PDF',       blurb: 'Merge, split, sign documents',     colorVar: '--color-cat-pdf' },
  text:      { id: 'text',      name: 'Text',      blurb: 'Clean, transform, analyze text',   colorVar: '--color-cat-text' },
  dev:       { id: 'dev',       name: 'Dev',       blurb: 'Format, encode, decode, generate', colorVar: '--color-cat-dev' },
  calc:      { id: 'calc',      name: 'Calc',      blurb: 'Calculators and math tools',       colorVar: '--color-cat-calc' },
  convert:   { id: 'convert',   name: 'Convert',   blurb: 'Universal file converter',          colorVar: '--color-cat-convert' },
  generator: { id: 'generator', name: 'Generator', blurb: 'QR, color, password, random',      colorVar: '--color-cat-generator' },
  time:      { id: 'time',      name: 'Time',      blurb: 'Dates, timezones, durations',      colorVar: '--color-cat-time' },
  finance:   { id: 'finance',   name: 'Finance',   blurb: 'Loans, tax, investment math',      colorVar: '--color-cat-finance' },
  seo:       { id: 'seo',       name: 'SEO',       blurb: 'Meta, schema, sitemap, audits',    colorVar: '--color-cat-seo' },
  game:      { id: 'game',      name: 'Game',      blurb: 'Gaming utilities and generators',  colorVar: '--color-cat-game' },
  gis:       { id: 'gis',       name: 'GIS',       blurb: 'Coordinates, distance, maps',      colorVar: '--color-cat-gis' },
  ip:        { id: 'ip',        name: 'Network',   blurb: 'IP, DNS, headers, geolocation',    colorVar: '--color-cat-ip' },
  social:    { id: 'social',    name: 'Social',    blurb: 'Avatars, banners, OG images',      colorVar: '--color-cat-social' },
  font:      { id: 'font',      name: 'Font',      blurb: 'Inspect, convert, subset fonts',   colorVar: '--color-cat-font' },
  subtitle:  { id: 'subtitle',  name: 'Subtitle',  blurb: 'SRT, VTT — clean, sync, translate', colorVar: '--color-cat-subtitle' },
  test:      { id: 'test',      name: 'Test',      blurb: 'Test your mic, keyboard, screen, speed & more', colorVar: '--color-cat-test' },
  // oioxo AI coding agent — not a tool category (no tiles); used to meter the
  // on-device coder's build/run action through the freemium permission gate.
  code:      { id: 'code',      name: 'AI Coding',  blurb: 'On-device AI coding agent',        colorVar: '--color-cat-dev' },
};
