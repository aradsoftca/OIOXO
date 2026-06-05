import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Metadata } from 'next';
import { getTool, TOOLS } from '@/lib/registry';
import { ToolFrame } from '@/components/tool/ToolFrame';
import { StudioFrame } from '@/components/tool/StudioFrame';
import { buildToolPageStructuredData, structuredDataToScript } from '@/lib/seo/jsonld';
import { buildMeta } from '@/lib/seo/meta';
import { buildRichPage } from '@/lib/seo/content';
import { RichToolSection } from '@/components/seo/RichToolSection';
import { PolicyHint } from '@/components/limits/PolicyHint';
import { ClientOnly } from '@/components/tool/ClientOnly';

function findRelated(toolId: string, category: string, limit = 6) {
  return TOOLS.filter((t) => t.category === category && t.id !== toolId).slice(0, limit);
}

interface Props {
  params: Promise<{ slug: string }>;
}

// Studios are 100% client-side (canvas/WebGL/WebCodecs/WASM) and some touch
// `document` at module-import time, which throws during static export. Exclude
// them from build-time prerender — `dynamicParams` (default true) renders them
// on first request instead, still client-gated by <ClientOnly>. Content tools
// keep their static SEO pages.
const NO_PRERENDER = new Set(
  TOOLS.filter((t) => /(^|-)studio(s|-|$)/.test(t.id)).map((t) => t.id),
);

// The heavy, full-screen editors (timeline / canvas / multi-panel) that should
// OWN the viewport like a real desktop app (CapCut, Photopea) instead of being
// pushed below a marketing banner. These render in <StudioFrame> (slim bar +
// 100dvh editor + SEO moved below the fold). Lighter "studio-*" generators
// (meme, qr, collage…) stay in the normal <ToolFrame> form layout.
const FULLSCREEN_STUDIOS = new Set([
  'video-studio',
  'image-studio',
  'pdf-studio',
  'office-studio',
  'office-docs',
  'office-slides',
  'audio-voice-studio',
  'audio-music-studio',
  'subtitle-studio',
]);

export function generateStaticParams() {
  return TOOLS.filter((t) => !NO_PRERENDER.has(t.id)).map((t) => ({ slug: t.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  const page = buildRichPage(tool);
  return buildMeta({
    path: `/tools/${tool.id}`,
    title: page.title,
    description: page.description,
    keywords: page.keywords,
  });
}

const loading = () => <div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />;

const ToolModules: Record<string, ReturnType<typeof dynamic>> = {
  'image-blur':            dynamic(() => import('@/tools/image-blur/ui'),            { loading }),
  'image-face-detect':     dynamic(() => import('@/tools/image-face-detect/ui'),     { loading }),
  'image-remove-bg':       dynamic(() => import('@/tools/image-remove-bg/ui'),       { loading }),
  'image-compress':        dynamic(() => import('@/tools/image-compress/ui'),        { loading }),
  'image-convert-format':  dynamic(() => import('@/tools/image-convert-format/ui'),  { loading }),
  'image-resize':          dynamic(() => import('@/tools/image-resize/ui'),          { loading }),
  'image-grayscale':       dynamic(() => import('@/tools/image-grayscale/ui'),       { loading }),
  'image-invert':          dynamic(() => import('@/tools/image-invert/ui'),          { loading }),
  'image-sepia':           dynamic(() => import('@/tools/image-sepia/ui'),           { loading }),
  'image-brightness':      dynamic(() => import('@/tools/image-brightness/ui'),      { loading }),
  'image-contrast':        dynamic(() => import('@/tools/image-contrast/ui'),        { loading }),
  'image-saturation':      dynamic(() => import('@/tools/image-saturation/ui'),      { loading }),
  'image-hue':             dynamic(() => import('@/tools/image-hue/ui'),             { loading }),
  'image-flip':            dynamic(() => import('@/tools/image-flip/ui'),            { loading }),
  'image-rotate':          dynamic(() => import('@/tools/image-rotate/ui'),          { loading }),
  'image-pixelate':        dynamic(() => import('@/tools/image-pixelate/ui'),        { loading }),
  'image-sharpen':         dynamic(() => import('@/tools/image-sharpen/ui'),         { loading }),
  'image-vintage':         dynamic(() => import('@/tools/image-vintage/ui'),         { loading }),
  'image-vignette':        dynamic(() => import('@/tools/image-vignette/ui'),        { loading }),
  'image-border':          dynamic(() => import('@/tools/image-border/ui'),          { loading }),
  'image-round-corners':   dynamic(() => import('@/tools/image-round-corners/ui'),   { loading }),
  'image-info':            dynamic(() => import('@/tools/image-info/ui'),            { loading }),
  'image-placeholder':     dynamic(() => import('@/tools/image-placeholder/ui'),     { loading }),

  // text
  'text-uppercase':           dynamic(() => import('@/tools/text-uppercase/ui'),           { loading }),
  'text-lowercase':           dynamic(() => import('@/tools/text-lowercase/ui'),           { loading }),
  'text-title-case':          dynamic(() => import('@/tools/text-title-case/ui'),          { loading }),
  'text-reverse':             dynamic(() => import('@/tools/text-reverse/ui'),             { loading }),
  'text-word-counter':        dynamic(() => import('@/tools/text-word-counter/ui'),        { loading }),
  'text-base64':              dynamic(() => import('@/tools/text-base64/ui'),              { loading }),
  'text-sentence-case':       dynamic(() => import('@/tools/text-sentence-case/ui'),       { loading }),
  'text-camel-case':          dynamic(() => import('@/tools/text-camel-case/ui'),          { loading }),
  'text-pascal-case':         dynamic(() => import('@/tools/text-pascal-case/ui'),         { loading }),
  'text-snake-case':          dynamic(() => import('@/tools/text-snake-case/ui'),          { loading }),
  'text-kebab-case':          dynamic(() => import('@/tools/text-kebab-case/ui'),          { loading }),
  'text-url-encode':          dynamic(() => import('@/tools/text-url-encode/ui'),          { loading }),
  'text-url-decode':          dynamic(() => import('@/tools/text-url-decode/ui'),          { loading }),
  'text-html-encode':         dynamic(() => import('@/tools/text-html-encode/ui'),         { loading }),
  'text-rot13':               dynamic(() => import('@/tools/text-rot13/ui'),               { loading }),
  'text-add-prefix':          dynamic(() => import('@/tools/text-add-prefix/ui'),          { loading }),
  'text-add-suffix':          dynamic(() => import('@/tools/text-add-suffix/ui'),          { loading }),
  'text-add-line-numbers':    dynamic(() => import('@/tools/text-add-line-numbers/ui'),    { loading }),
  'text-add-line-breaks':     dynamic(() => import('@/tools/text-add-line-breaks/ui'),     { loading }),
  'text-remove-empty-lines':  dynamic(() => import('@/tools/text-remove-empty-lines/ui'),  { loading }),
  'text-remove-duplicates':   dynamic(() => import('@/tools/text-remove-duplicates/ui'),   { loading }),
  'text-remove-extra-spaces': dynamic(() => import('@/tools/text-remove-extra-spaces/ui'), { loading }),
  'text-remove-numbers':      dynamic(() => import('@/tools/text-remove-numbers/ui'),      { loading }),
  'text-remove-letters':      dynamic(() => import('@/tools/text-remove-letters/ui'),      { loading }),
  'text-sort-lines':          dynamic(() => import('@/tools/text-sort-lines/ui'),          { loading }),
  'text-reverse-lines':       dynamic(() => import('@/tools/text-reverse-lines/ui'),       { loading }),
  'text-find-replace':        dynamic(() => import('@/tools/text-find-replace/ui'),        { loading }),
  'text-regex':               dynamic(() => import('@/tools/text-regex/ui'),               { loading }),
  'text-extract-emails':      dynamic(() => import('@/tools/text-extract-emails/ui'),      { loading }),
  'text-extract-urls':        dynamic(() => import('@/tools/text-extract-urls/ui'),        { loading }),
  'text-extract-numbers':     dynamic(() => import('@/tools/text-extract-numbers/ui'),     { loading }),
  'text-extract-phone':       dynamic(() => import('@/tools/text-extract-phone/ui'),       { loading }),
  'text-extract-hashtags':    dynamic(() => import('@/tools/text-extract-hashtags/ui'),    { loading }),
  'text-extract-mentions':    dynamic(() => import('@/tools/text-extract-mentions/ui'),    { loading }),
  'text-keyword-density':     dynamic(() => import('@/tools/text-keyword-density/ui'),     { loading }),
  'text-readability':         dynamic(() => import('@/tools/text-readability/ui'),         { loading }),

  // dev
  'dev-json-format':   dynamic(() => import('@/tools/dev-json-format/ui'),   { loading }),
  'dev-uuid':          dynamic(() => import('@/tools/dev-uuid/ui'),          { loading }),
  'dev-hash':          dynamic(() => import('@/tools/dev-hash/ui'),          { loading }),
  'dev-slug':          dynamic(() => import('@/tools/dev-slug/ui'),          { loading }),
  'dev-lorem':         dynamic(() => import('@/tools/dev-lorem/ui'),         { loading }),
  'dev-json-minify':   dynamic(() => import('@/tools/dev-json-minify/ui'),   { loading }),
  'dev-json-validate': dynamic(() => import('@/tools/dev-json-validate/ui'), { loading }),
  'dev-json-to-yaml':  dynamic(() => import('@/tools/dev-json-to-yaml/ui'),  { loading }),
  'dev-yaml-to-json':  dynamic(() => import('@/tools/dev-yaml-to-json/ui'),  { loading }),
  'dev-xml-format':    dynamic(() => import('@/tools/dev-xml-format/ui'),    { loading }),
  'dev-jwt-decode':    dynamic(() => import('@/tools/dev-jwt-decode/ui'),    { loading }),
  'dev-hex-viewer':    dynamic(() => import('@/tools/dev-hex-viewer/ui'),    { loading }),
  'dev-password':      dynamic(() => import('@/tools/dev-password/ui'),      { loading }),
  'dev-regex':         dynamic(() => import('@/tools/dev-regex/ui'),         { loading }),
  'dev-diff':          dynamic(() => import('@/tools/dev-diff/ui'),          { loading }),
  'dev-bcrypt':        dynamic(() => import('@/tools/dev-bcrypt/ui'),        { loading }),
  'dev-hmac':          dynamic(() => import('@/tools/dev-hmac/ui'),          { loading }),
  'dev-totp':          dynamic(() => import('@/tools/dev-totp/ui'),          { loading }),
  'dev-sql-format':    dynamic(() => import('@/tools/dev-sql-format/ui'),    { loading }),

  // calc
  'calc-percent': dynamic(() => import('@/tools/calc-percent/ui'), { loading }),
  'calc-age':     dynamic(() => import('@/tools/calc-age/ui'),     { loading }),
  'calc-bmi':     dynamic(() => import('@/tools/calc-bmi/ui'),     { loading }),
  'calc-loan':    dynamic(() => import('@/tools/calc-loan/ui'),    { loading }),
  'calc-tip':     dynamic(() => import('@/tools/calc-tip/ui'),     { loading }),
  'calc-temp':    dynamic(() => import('@/tools/calc-temp/ui'),    { loading }),
  'calc-power':   dynamic(() => import('@/tools/calc-power/ui'),   { loading }),
  'calc-hex':     dynamic(() => import('@/tools/calc-hex/ui'),     { loading }),
  'calc-binary':  dynamic(() => import('@/tools/calc-binary/ui'),  { loading }),
  'calc-date':    dynamic(() => import('@/tools/calc-date/ui'),    { loading }),
  'calc-time':    dynamic(() => import('@/tools/calc-time/ui'),    { loading }),

  // time
  'time-unix-timestamp': dynamic(() => import('@/tools/time-unix-timestamp/ui'), { loading }),
  'time-iso-8601':       dynamic(() => import('@/tools/time-iso-8601/ui'),       { loading }),
  'time-cron':           dynamic(() => import('@/tools/time-cron/ui'),           { loading }),
  'time-date-diff':      dynamic(() => import('@/tools/time-date-diff/ui'),      { loading }),
  'time-countdown':      dynamic(() => import('@/tools/time-countdown/ui'),      { loading }),
  'time-world-clock':    dynamic(() => import('@/tools/time-world-clock/ui'),    { loading }),
  'time-timezone':       dynamic(() => import('@/tools/time-timezone/ui'),       { loading }),

  // generators
  'gen-qr-code':         dynamic(() => import('@/tools/gen-qr-code/ui'),         { loading }),
  'gen-barcode':         dynamic(() => import('@/tools/gen-barcode/ui'),         { loading }),
  'gen-color-palette':   dynamic(() => import('@/tools/gen-color-palette/ui'),   { loading }),
  'gen-gradient':        dynamic(() => import('@/tools/gen-gradient/ui'),        { loading }),
  'gen-color-converter': dynamic(() => import('@/tools/gen-color-converter/ui'), { loading }),
  'gen-color-contrast':  dynamic(() => import('@/tools/gen-color-contrast/ui'),  { loading }),
  'gen-random-data':     dynamic(() => import('@/tools/gen-random-data/ui'),     { loading }),
  'gen-favicon':         dynamic(() => import('@/tools/gen-favicon/ui'),         { loading }),
  'gen-invoice':         dynamic(() => import('@/tools/gen-invoice/ui'),         { loading }),
  'gen-resume':          dynamic(() => import('@/tools/gen-resume/ui'),          { loading }),

  // subtitle
  'subtitle-character-counter': dynamic(() => import('@/tools/subtitle-character-counter/ui'), { loading }),
  'subtitle-cleaner':           dynamic(() => import('@/tools/subtitle-cleaner/ui'),           { loading }),
  'subtitle-fps-converter':     dynamic(() => import('@/tools/subtitle-fps-converter/ui'),     { loading }),
  'subtitle-merger':            dynamic(() => import('@/tools/subtitle-merger/ui'),            { loading }),
  'subtitle-splitter':          dynamic(() => import('@/tools/subtitle-splitter/ui'),          { loading }),
  'subtitle-style-editor':      dynamic(() => import('@/tools/subtitle-style-editor/ui'),      { loading }),
  'subtitle-sync-fixer':        dynamic(() => import('@/tools/subtitle-sync-fixer/ui'),        { loading }),
  'subtitle-timing-shifter':    dynamic(() => import('@/tools/subtitle-timing-shifter/ui'),    { loading }),
  'subtitle-to-plain-text':     dynamic(() => import('@/tools/subtitle-to-plain-text/ui'),     { loading }),
  'subtitle-translator-prep':   dynamic(() => import('@/tools/subtitle-translator-prep/ui'),   { loading }),

  // finance
  'finance-budget':          dynamic(() => import('@/tools/finance-budget/ui'),          { loading }),
  'finance-mortgage':        dynamic(() => import('@/tools/finance-mortgage/ui'),        { loading }),
  'finance-loan-comparison': dynamic(() => import('@/tools/finance-loan-comparison/ui'), { loading }),
  'finance-investment':      dynamic(() => import('@/tools/finance-investment/ui'),      { loading }),
  'finance-retirement':      dynamic(() => import('@/tools/finance-retirement/ui'),      { loading }),
  'finance-savings':         dynamic(() => import('@/tools/finance-savings/ui'),         { loading }),
  'finance-tax':             dynamic(() => import('@/tools/finance-tax/ui'),             { loading }),

  // gis
  'gis-coords':   dynamic(() => import('@/tools/gis-coords/ui'),   { loading }),
  'gis-distance': dynamic(() => import('@/tools/gis-distance/ui'), { loading }),
  'gis-utm':      dynamic(() => import('@/tools/gis-utm/ui'),      { loading }),
  'gis-kml':      dynamic(() => import('@/tools/gis-kml/ui'),      { loading }),
  'gis-geojson':  dynamic(() => import('@/tools/gis-geojson/ui'),  { loading }),

  // seo
  'seo-meta-tag':        dynamic(() => import('@/tools/seo-meta-tag/ui'),        { loading }),
  'seo-robots-txt':      dynamic(() => import('@/tools/seo-robots-txt/ui'),      { loading }),
  'seo-sitemap':         dynamic(() => import('@/tools/seo-sitemap/ui'),         { loading }),
  'seo-headings':        dynamic(() => import('@/tools/seo-headings/ui'),        { loading }),
  'seo-structured-data': dynamic(() => import('@/tools/seo-structured-data/ui'), { loading }),
  'seo-open-graph':      dynamic(() => import('@/tools/seo-open-graph/ui'),      { loading }),
  'seo-twitter-card':    dynamic(() => import('@/tools/seo-twitter-card/ui'),    { loading }),

  // game
  'game-username':     dynamic(() => import('@/tools/game-username/ui'),     { loading }),
  'game-name':         dynamic(() => import('@/tools/game-name/ui'),         { loading }),
  'game-character':    dynamic(() => import('@/tools/game-character/ui'),    { loading }),
  'game-fantasy':      dynamic(() => import('@/tools/game-fantasy/ui'),      { loading }),
  'game-sci-fi':       dynamic(() => import('@/tools/game-sci-fi/ui'),       { loading }),
  'game-guild':        dynamic(() => import('@/tools/game-guild/ui'),        { loading }),
  'game-clan':         dynamic(() => import('@/tools/game-clan/ui'),         { loading }),
  'game-team':         dynamic(() => import('@/tools/game-team/ui'),         { loading }),
  'game-weapon':       dynamic(() => import('@/tools/game-weapon/ui'),       { loading }),
  'game-spell':        dynamic(() => import('@/tools/game-spell/ui'),        { loading }),
  'game-quest':        dynamic(() => import('@/tools/game-quest/ui'),        { loading }),
  'game-dice':         dynamic(() => import('@/tools/game-dice/ui'),         { loading }),
  'game-gacha':        dynamic(() => import('@/tools/game-gacha/ui'),        { loading }),
  'game-drop-rate':    dynamic(() => import('@/tools/game-drop-rate/ui'),    { loading }),
  'game-loadout':      dynamic(() => import('@/tools/game-loadout/ui'),      { loading }),
  'game-coin':         dynamic(() => import('@/tools/game-coin/ui'),         { loading }),
  'game-picker':       dynamic(() => import('@/tools/game-picker/ui'),       { loading }),
  'game-loot':         dynamic(() => import('@/tools/game-loot/ui'),         { loading }),
  'game-dps':          dynamic(() => import('@/tools/game-dps/ui'),          { loading }),
  'game-xp':           dynamic(() => import('@/tools/game-xp/ui'),           { loading }),
  'game-dpi':          dynamic(() => import('@/tools/game-dpi/ui'),          { loading }),
  'game-fov':          dynamic(() => import('@/tools/game-fov/ui'),          { loading }),
  'game-sensitivity':  dynamic(() => import('@/tools/game-sensitivity/ui'),  { loading }),
  'game-aspect-ratio': dynamic(() => import('@/tools/game-aspect-ratio/ui'), { loading }),
  'game-crosshair':    dynamic(() => import('@/tools/game-crosshair/ui'),    { loading }),
  'game-colorblind':   dynamic(() => import('@/tools/game-colorblind/ui'),   { loading }),

  // network
  'net-cidr':    dynamic(() => import('@/tools/net-cidr/ui'),    { loading }),
  'net-subnet':  dynamic(() => import('@/tools/net-subnet/ui'),  { loading }),
  'net-ua':      dynamic(() => import('@/tools/net-ua/ui'),      { loading }),
  'net-mac':     dynamic(() => import('@/tools/net-mac/ui'),     { loading }),
  'net-headers': dynamic(() => import('@/tools/net-headers/ui'), { loading }),

  // social
  'social-resize': dynamic(() => import('@/tools/social-resize/ui'), { loading }),
  'social-og':     dynamic(() => import('@/tools/social-og/ui'),     { loading }),
  'social-banner': dynamic(() => import('@/tools/social-banner/ui'), { loading }),
  'social-avatar': dynamic(() => import('@/tools/social-avatar/ui'), { loading }),

  // font
  'font-preview': dynamic(() => import('@/tools/font-preview/ui'), { loading }),
  'font-inspect': dynamic(() => import('@/tools/font-inspect/ui'), { loading }),
  'font-convert': dynamic(() => import('@/tools/font-convert/ui'), { loading }),
  'font-web':     dynamic(() => import('@/tools/font-web/ui'),     { loading }),
  'font-subset':  dynamic(() => import('@/tools/font-subset/ui'),  { loading }),

  // pdf
  'pdf-merge':         dynamic(() => import('@/tools/pdf-merge/ui'),         { loading }),
  'pdf-split':         dynamic(() => import('@/tools/pdf-split/ui'),         { loading }),
  'pdf-rotate':        dynamic(() => import('@/tools/pdf-rotate/ui'),        { loading }),
  'pdf-info':          dynamic(() => import('@/tools/pdf-info/ui'),          { loading }),
  'pdf-page-numbers':  dynamic(() => import('@/tools/pdf-page-numbers/ui'),  { loading }),
  'pdf-watermark':     dynamic(() => import('@/tools/pdf-watermark/ui'),     { loading }),
  'pdf-delete-pages':  dynamic(() => import('@/tools/pdf-delete-pages/ui'),  { loading }),
  'pdf-extract-pages': dynamic(() => import('@/tools/pdf-extract-pages/ui'), { loading }),
  'pdf-reorder':       dynamic(() => import('@/tools/pdf-reorder/ui'),       { loading }),

  // audio
  'audio-trim':           dynamic(() => import('@/tools/audio-trim/ui'),           { loading }),
  'audio-merge':          dynamic(() => import('@/tools/audio-merge/ui'),          { loading }),
  'audio-volume':         dynamic(() => import('@/tools/audio-volume/ui'),         { loading }),
  'audio-fade-in':        dynamic(() => import('@/tools/audio-fade-in/ui'),        { loading }),
  'audio-fade-out':       dynamic(() => import('@/tools/audio-fade-out/ui'),       { loading }),
  'audio-normalize':      dynamic(() => import('@/tools/audio-normalize/ui'),      { loading }),
  'audio-speed':          dynamic(() => import('@/tools/audio-speed/ui'),          { loading }),
  'audio-convert-format': dynamic(() => import('@/tools/audio-convert-format/ui'), { loading }),
  'audio-reverse':        dynamic(() => import('@/tools/audio-reverse/ui'),        { loading }),

  // video
  'video-info':             dynamic(() => import('@/tools/video-info/ui'),             { loading }),
  'video-poster':           dynamic(() => import('@/tools/video-poster/ui'),           { loading }),
  'video-thumbnail':        dynamic(() => import('@/tools/video-thumbnail/ui'),        { loading }),
  'video-thumbnails-grid':  dynamic(() => import('@/tools/video-thumbnails-grid/ui'),  { loading }),
  'video-extract-frames':   dynamic(() => import('@/tools/video-extract-frames/ui'),   { loading }),
  'video-to-gif':           dynamic(() => import('@/tools/video-to-gif/ui'),           { loading }),
  'video-mute':             dynamic(() => import('@/tools/video-mute/ui'),             { loading }),
  'video-extract-audio':    dynamic(() => import('@/tools/video-extract-audio/ui'),    { loading }),
  'video-trim':             dynamic(() => import('@/tools/video-trim/ui'),             { loading }),

  // wave 15 — ffmpeg powered
  'video-convert-format':   dynamic(() => import('@/tools/video-convert-format/ui'),   { loading }),
  'video-compress':         dynamic(() => import('@/tools/video-compress/ui'),         { loading }),
  'video-resize':           dynamic(() => import('@/tools/video-resize/ui'),           { loading }),
  'video-rotate':           dynamic(() => import('@/tools/video-rotate/ui'),           { loading }),
  'video-flip':             dynamic(() => import('@/tools/video-flip/ui'),             { loading }),
  'video-merge':            dynamic(() => import('@/tools/video-merge/ui'),            { loading }),
  'video-speed':            dynamic(() => import('@/tools/video-speed/ui'),            { loading }),
  'audio-pitch':            dynamic(() => import('@/tools/audio-pitch/ui'),            { loading }),
  'audio-tempo':            dynamic(() => import('@/tools/audio-tempo/ui'),            { loading }),
  'audio-echo':             dynamic(() => import('@/tools/audio-echo/ui'),             { loading }),
  'audio-bass-boost':       dynamic(() => import('@/tools/audio-bass-boost/ui'),       { loading }),
  'audio-treble-boost':     dynamic(() => import('@/tools/audio-treble-boost/ui'),     { loading }),

  // wave 16 — video (ffmpeg, 2nd wave)
  'video-crop':             dynamic(() => import('@/tools/video-crop/ui'),             { loading }),
  'video-brightness':       dynamic(() => import('@/tools/video-brightness/ui'),       { loading }),
  'video-blur':             dynamic(() => import('@/tools/video-blur/ui'),             { loading }),
  'video-watermark':        dynamic(() => import('@/tools/video-watermark/ui'),        { loading }),
  'video-add-text':         dynamic(() => import('@/tools/video-add-text/ui'),         { loading }),

  // wave 16 — audio (ffmpeg, 2nd wave)
  'audio-reverb':           dynamic(() => import('@/tools/audio-reverb/ui'),           { loading }),
  'audio-equalizer':        dynamic(() => import('@/tools/audio-equalizer/ui'),        { loading }),
  'audio-compress':         dynamic(() => import('@/tools/audio-compress/ui'),         { loading }),
  'audio-mono-to-stereo':   dynamic(() => import('@/tools/audio-mono-to-stereo/ui'),   { loading }),
  'audio-stereo-to-mono':   dynamic(() => import('@/tools/audio-stereo-to-mono/ui'),   { loading }),
  'audio-remove-silence':   dynamic(() => import('@/tools/audio-remove-silence/ui'),   { loading }),

  // wave 16 — image (hard)
  'image-crop':             dynamic(() => import('@/tools/image-crop/ui'),             { loading }),
  'image-add-text':         dynamic(() => import('@/tools/image-add-text/ui'),         { loading }),
  'image-watermark':        dynamic(() => import('@/tools/image-watermark/ui'),        { loading }),

  // wave 16 — CSS generators
  'gen-box-shadow':         dynamic(() => import('@/tools/gen-box-shadow/ui'),         { loading }),
  'gen-css-filter':         dynamic(() => import('@/tools/gen-css-filter/ui'),         { loading }),
  'gen-css-text-shadow':    dynamic(() => import('@/tools/gen-css-text-shadow/ui'),    { loading }),
  'gen-css-transform':      dynamic(() => import('@/tools/gen-css-transform/ui'),      { loading }),
  'gen-flexbox':            dynamic(() => import('@/tools/gen-flexbox/ui'),            { loading }),
  'gen-grid':               dynamic(() => import('@/tools/gen-grid/ui'),               { loading }),
  'gen-animation':          dynamic(() => import('@/tools/gen-animation/ui'),          { loading }),
  'gen-glassmorphism':      dynamic(() => import('@/tools/gen-glassmorphism/ui'),      { loading }),

  // wave 16 — code formatters
  'dev-html-format':        dynamic(() => import('@/tools/dev-html-format/ui'),        { loading }),
  'dev-css-format':         dynamic(() => import('@/tools/dev-css-format/ui'),         { loading }),
  'dev-js-format':          dynamic(() => import('@/tools/dev-js-format/ui'),          { loading }),

  // wave 16 — heavy calc
  'calc-matrix':            dynamic(() => import('@/tools/calc-matrix/ui'),            { loading }),
  'calc-derivative':        dynamic(() => import('@/tools/calc-derivative/ui'),        { loading }),
  'calc-integral':          dynamic(() => import('@/tools/calc-integral/ui'),          { loading }),
  'calc-equation':          dynamic(() => import('@/tools/calc-equation/ui'),          { loading }),
  'calc-latex':             dynamic(() => import('@/tools/calc-latex/ui'),             { loading }),

  // wave 17 — browser-AI tier
  'image-ocr':              dynamic(() => import('@/tools/image-ocr/ui'),              { loading }),
  'image-upscale':          dynamic(() => import('@/tools/image-upscale/ui'),          { loading }),
  'pdf-ocr':                dynamic(() => import('@/tools/pdf-ocr/ui'),                { loading }),
  'audio-to-text':          dynamic(() => import('@/tools/audio-to-text/ui'),          { loading }),
  'audio-remove-noise':     dynamic(() => import('@/tools/audio-remove-noise/ui'),     { loading }),

  // wave 18 — deferred non-AI batches
  'pdf-to-text':            dynamic(() => import('@/tools/pdf-to-text/ui'),            { loading }),
  'pdf-to-images':          dynamic(() => import('@/tools/pdf-to-images/ui'),          { loading }),
  'images-to-pdf':          dynamic(() => import('@/tools/images-to-pdf/ui'),          { loading }),
  'audio-text-to-speech':   dynamic(() => import('@/tools/audio-text-to-speech/ui'),   { loading }),
  'audio-waveform':         dynamic(() => import('@/tools/audio-waveform/ui'),         { loading }),
  'audio-split':            dynamic(() => import('@/tools/audio-split/ui'),            { loading }),
  'image-meme':             dynamic(() => import('@/tools/image-meme/ui'),             { loading }),
  'image-collage':          dynamic(() => import('@/tools/image-collage/ui'),          { loading }),
  'image-exif':             dynamic(() => import('@/tools/image-exif/ui'),             { loading }),

  // wave 19 — long-tail image, pdf, audio
  'image-thumbnail':        dynamic(() => import('@/tools/image-thumbnail/ui'),        { loading }),
  'image-frame':            dynamic(() => import('@/tools/image-frame/ui'),            { loading }),
  'image-color-extract':    dynamic(() => import('@/tools/image-color-extract/ui'),    { loading }),
  'image-add-shape':        dynamic(() => import('@/tools/image-add-shape/ui'),        { loading }),
  'pdf-fill-form':          dynamic(() => import('@/tools/pdf-fill-form/ui'),          { loading }),
  'audio-loop':             dynamic(() => import('@/tools/audio-loop/ui'),             { loading }),

  // wave 20 — creative image, audio, generator
  'image-pattern':          dynamic(() => import('@/tools/image-pattern/ui'),          { loading }),
  'image-ascii-art':        dynamic(() => import('@/tools/image-ascii-art/ui'),        { loading }),
  'image-emoji-mosaic':     dynamic(() => import('@/tools/image-emoji-mosaic/ui'),     { loading }),
  'audio-pan':              dynamic(() => import('@/tools/audio-pan/ui'),              { loading }),
  'audio-stereo-width':     dynamic(() => import('@/tools/audio-stereo-width/ui'),     { loading }),
  'gen-lorem-image':        dynamic(() => import('@/tools/gen-lorem-image/ui'),        { loading }),

  // wave 21 — PDF compress + security
  'pdf-compress':           dynamic(() => import('@/tools/pdf-compress/ui'),           { loading }),
  'pdf-protect':            dynamic(() => import('@/tools/pdf-protect/ui'),            { loading }),
  'pdf-unlock':             dynamic(() => import('@/tools/pdf-unlock/ui'),             { loading }),

  // wave 22 — dev + generator + image extras
  'dev-base64-image':       dynamic(() => import('@/tools/dev-base64-image/ui'),       { loading }),
  'gen-mesh-gradient':      dynamic(() => import('@/tools/gen-mesh-gradient/ui'),      { loading }),
  'image-duotone':          dynamic(() => import('@/tools/image-duotone/ui'),          { loading }),

  // wave 23 — calculators, image utilities, batch image
  'calc-basic':             dynamic(() => import('@/tools/calc-basic/ui'),             { loading }),
  'calc-scientific':        dynamic(() => import('@/tools/calc-scientific/ui'),        { loading }),
  'image-compare':          dynamic(() => import('@/tools/image-compare/ui'),          { loading }),
  'image-split':            dynamic(() => import('@/tools/image-split/ui'),            { loading }),
  'image-add-shadow':       dynamic(() => import('@/tools/image-add-shadow/ui'),       { loading }),
  'image-batch-resize':     dynamic(() => import('@/tools/image-batch-resize/ui'),     { loading }),
  'image-batch-compress':   dynamic(() => import('@/tools/image-batch-compress/ui'),   { loading }),
  'image-batch-convert':    dynamic(() => import('@/tools/image-batch-convert/ui'),    { loading }),

  // wave 24 — image merge + ffmpeg video ops
  'image-merge':            dynamic(() => import('@/tools/image-merge/ui'),            { loading }),
  'video-reverse':          dynamic(() => import('@/tools/video-reverse/ui'),          { loading }),
  'video-volume':           dynamic(() => import('@/tools/video-volume/ui'),           { loading }),
  'video-bitrate':          dynamic(() => import('@/tools/video-bitrate/ui'),          { loading }),
  'video-loop':             dynamic(() => import('@/tools/video-loop/ui'),             { loading }),
  'video-add-audio':        dynamic(() => import('@/tools/video-add-audio/ui'),        { loading }),
  'video-gif-to-video':     dynamic(() => import('@/tools/video-gif-to-video/ui'),     { loading }),

  // wave 25 — impossible-made-possible (network/API/DSP, no GPU)
  'audio-vocal-remover':    dynamic(() => import('@/tools/audio-vocal-remover/ui'),    { loading }),
  'net-dns':                dynamic(() => import('@/tools/net-dns/ui'),                { loading }),
  'net-whois':              dynamic(() => import('@/tools/net-whois/ui'),              { loading }),
  'net-my-ip':              dynamic(() => import('@/tools/net-my-ip/ui'),              { loading }),
  'net-ip-lookup':          dynamic(() => import('@/tools/net-ip-lookup/ui'),          { loading }),
  'net-ssl':                dynamic(() => import('@/tools/net-ssl/ui'),                { loading }),
  'net-ports':              dynamic(() => import('@/tools/net-ports/ui'),              { loading }),
  'net-ping':               dynamic(() => import('@/tools/net-ping/ui'),               { loading }),

  // wave 26 — more web-based, no GPU
  'image-denoise':          dynamic(() => import('@/tools/image-denoise/ui'),          { loading }),
  'images-to-video':        dynamic(() => import('@/tools/images-to-video/ui'),        { loading }),

  // wave 27 — universal converter
  'convert-anything':       dynamic(() => import('@/tools/convert-anything/ui'),       { loading }),

  // wave 28 — archive + 3D
  'archive-extract':        dynamic(() => import('@/tools/archive-extract/ui'),        { loading }),
  'archive-zip':            dynamic(() => import('@/tools/archive-zip/ui'),            { loading }),
  'model-3d-convert':       dynamic(() => import('@/tools/model-3d-convert/ui'),       { loading }),

  // wave 29 — documents
  'sheet-convert':          dynamic(() => import('@/tools/sheet-convert/ui'),          { loading }),
  'doc-convert':            dynamic(() => import('@/tools/doc-convert/ui'),            { loading }),

  // wave 30 — ebooks + CAD
  'ebook-convert':          dynamic(() => import('@/tools/ebook-convert/ui'),          { loading }),
  'cad-convert':            dynamic(() => import('@/tools/cad-convert/ui'),            { loading }),

  // wave 31 — light office
  'slides-convert':         dynamic(() => import('@/tools/slides-convert/ui'),         { loading }),

  // wave 32 — high-traffic browser tools
  'image-heic-convert':     dynamic(() => import('@/tools/image-heic-convert/ui'),     { loading }),
  'video-screen-record':    dynamic(() => import('@/tools/video-screen-record/ui'),    { loading }),
  'image-text-behind':      dynamic(() => import('@/tools/image-text-behind/ui'),      { loading }),
  'subtitle-generate':      dynamic(() => import('@/tools/subtitle-generate/ui'),      { loading }),

  // wave 33 — privacy/AI/doc + self-hosted FX
  'finance-currency':       dynamic(() => import('@/tools/finance-currency/ui'),       { loading }),
  'image-remove-metadata':  dynamic(() => import('@/tools/image-remove-metadata/ui'),  { loading }),
  'pdf-sign':               dynamic(() => import('@/tools/pdf-sign/ui'),               { loading }),
  'image-doc-scan':         dynamic(() => import('@/tools/image-doc-scan/ui'),         { loading }),
  'image-object-remove':    dynamic(() => import('@/tools/image-object-remove/ui'),    { loading }),

  // wave 34 — flagship utilities
  'net-speed-test':         dynamic(() => import('@/tools/net-speed-test/ui'),         { loading }),
  'video-webcam-test':      dynamic(() => import('@/tools/video-webcam-test/ui'),      { loading }),

  // wave 35 — creator
  'video-reframe':          dynamic(() => import('@/tools/video-reframe/ui'),          { loading }),

  // wave 36 — AI segmentation
  'image-smart-cutout':     dynamic(() => import('@/tools/image-smart-cutout/ui'),     { loading }),

  // wave 37 — high-end AI media + editors
  'video-auto-subtitle':    dynamic(() => import('@/tools/video-auto-subtitle/ui'),    { loading }),
  'audio-voice-studio':     dynamic(() => import('@/tools/audio-voice-studio/ui'),     { loading }),
  'text-translate':         dynamic(() => import('@/tools/text-translate/ui'),         { loading }),
  'image-studio':           dynamic(() => import('@/tools/image-studio/ui'),           { loading }),
  'video-studio':           dynamic(() => import('@/tools/video-studio/ui'),           { loading }),

  // wave 38 — Test/diagnostics + PDF Studio
  'test-typing':            dynamic(() => import('@/tools/test-typing/ui'),            { loading }),
  'test-reaction':          dynamic(() => import('@/tools/test-reaction/ui'),          { loading }),
  'test-cps':               dynamic(() => import('@/tools/test-cps/ui'),               { loading }),
  'test-keyboard':          dynamic(() => import('@/tools/test-keyboard/ui'),          { loading }),
  'test-mouse':             dynamic(() => import('@/tools/test-mouse/ui'),             { loading }),
  'test-monitor':           dynamic(() => import('@/tools/test-monitor/ui'),           { loading }),
  'test-mic':               dynamic(() => import('@/tools/test-mic/ui'),               { loading }),
  'test-speaker':           dynamic(() => import('@/tools/test-speaker/ui'),           { loading }),
  'test-hearing':           dynamic(() => import('@/tools/test-hearing/ui'),           { loading }),
  'test-gamepad':           dynamic(() => import('@/tools/test-gamepad/ui'),           { loading }),
  'test-touch':             dynamic(() => import('@/tools/test-touch/ui'),             { loading }),
  'test-browser':           dynamic(() => import('@/tools/test-browser/ui'),           { loading }),
  'pdf-studio':             dynamic(() => import('@/tools/pdf-studio/ui'),             { loading }),

  // wave 39 — on-device creator combos + deterministic high-value
  'video-auto-dub':         dynamic(() => import('@/tools/video-auto-dub/ui'),         { loading }),
  'video-to-shorts':        dynamic(() => import('@/tools/video-to-shorts/ui'),        { loading }),
  'video-boomerang':        dynamic(() => import('@/tools/video-boomerang/ui'),        { loading }),
  'audio-ringtone':         dynamic(() => import('@/tools/audio-ringtone/ui'),         { loading }),
  'image-enhance':          dynamic(() => import('@/tools/image-enhance/ui'),          { loading }),
  'image-auto-blur':        dynamic(() => import('@/tools/image-auto-blur/ui'),        { loading }),
  'image-passport':         dynamic(() => import('@/tools/image-passport/ui'),         { loading }),
  'pdf-nup':                dynamic(() => import('@/tools/pdf-nup/ui'),                { loading }),

  // wave 40 — music
  'audio-music-studio':     dynamic(() => import('@/tools/audio-music-studio/ui'),     { loading }),

  // office studios — were missing from this map (rendered the "not wired" placeholder)
  'office-studio':          dynamic(() => import('@/tools/office-studio/ui'),          { loading }),
  'office-docs':            dynamic(() => import('@/tools/office-docs/ui'),            { loading }),
  'office-slides':          dynamic(() => import('@/tools/office-slides/ui'),          { loading }),
  'subtitle-studio':        dynamic(() => import('@/tools/subtitle-studio/ui'),        { loading }),

  // wave 41 — layout-preserving document translation
  'doc-translate':          dynamic(() => import('@/tools/doc-translate/ui'),          { loading }),

  // wave 42 — translation studio
  'translate-studio':       dynamic(() => import('@/tools/translate-studio/ui'),       { loading }),

  // wave 43 — 11 Premium Studios
  'studio-resume':          dynamic(() => import('@/tools/studio-resume/ui'),          { loading }),
  'studio-invoice':         dynamic(() => import('@/tools/studio-invoice/ui'),         { loading }),
  'studio-background':      dynamic(() => import('@/tools/studio-background/ui'),      { loading }),
  'studio-qr':              dynamic(() => import('@/tools/studio-qr/ui'),              { loading }),
  'studio-thumbnail':       dynamic(() => import('@/tools/studio-thumbnail/ui'),       { loading }),
  'studio-sheets':          dynamic(() => import('@/tools/studio-sheets/ui'),          { loading }),
  'studio-docs':            dynamic(() => import('@/tools/studio-docs/ui'),            { loading }),
  'studio-slides':          dynamic(() => import('@/tools/studio-slides/ui'),          { loading }),
  'studio-chart':           dynamic(() => import('@/tools/studio-chart/ui'),           { loading }),
  'audio-record':           dynamic(() => import('@/tools/audio-record/ui'),           { loading }),
  'video-webcam-record':    dynamic(() => import('@/tools/video-webcam-record/ui'),    { loading }),
  'scan-qr':                dynamic(() => import('@/tools/scan-qr/ui'),                { loading }),
  'studio-diagram':         dynamic(() => import('@/tools/studio-diagram/ui'),         { loading }),
  'studio-mockup':          dynamic(() => import('@/tools/studio-mockup/ui'),          { loading }),
  'studio-redact':          dynamic(() => import('@/tools/studio-redact/ui'),          { loading }),
  'dev-encrypt':            dynamic(() => import('@/tools/dev-encrypt/ui'),            { loading }),
  'studio-meme':            dynamic(() => import('@/tools/studio-meme/ui'),            { loading }),
  'studio-collage':         dynamic(() => import('@/tools/studio-collage/ui'),         { loading }),
  'studio-poster':          dynamic(() => import('@/tools/studio-poster/ui'),          { loading }),
  'studio-gif':             dynamic(() => import('@/tools/studio-gif/ui'),             { loading }),
  'studio-sticker':         dynamic(() => import('@/tools/studio-sticker/ui'),         { loading }),
  'studio-avatar':          dynamic(() => import('@/tools/studio-avatar/ui'),          { loading }),
};

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();

  const ToolUI = ToolModules[tool.id];
  if (!ToolUI) {
    return (
      <ToolFrame tool={tool}>
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-8 text-center text-[var(--color-fg-muted)]">
          This tool is registered but its UI is not yet wired in this scaffold.
        </div>
      </ToolFrame>
    );
  }

  const related = findRelated(tool.id, tool.category);
  const page = buildRichPage(tool, related.map((r) => r.id));
  const structuredData = buildToolPageStructuredData(tool, page);
  const jsonLd = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: structuredDataToScript(structuredData) }}
    />
  );

  // Full-screen studios own the viewport like a desktop editor; the marketing
  // banner and SEO copy move below the fold (still crawlable) instead of
  // burying the editor.
  if (FULLSCREEN_STUDIOS.has(tool.id)) {
    return (
      <>
        <StudioFrame
          tool={tool}
          about={
            <>
              <PolicyHint toolKey={tool.id} fallbackKey={tool.category} />
              <RichToolSection tool={tool} page={page} related={related} />
            </>
          }
        >
          <ClientOnly>
            <ToolUI />
          </ClientOnly>
        </StudioFrame>
        {jsonLd}
      </>
    );
  }

  return (
    <ToolFrame tool={tool}>
      <PolicyHint toolKey={tool.id} fallbackKey={tool.category} />
      <ClientOnly>
        <ToolUI />
      </ClientOnly>
      <RichToolSection tool={tool} page={page} related={related} />
      {jsonLd}
    </ToolFrame>
  );
}
