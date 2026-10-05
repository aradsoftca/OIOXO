/**
 * Tool pages Xonvert asks Google to index (2026-10-05).
 *
 * Google had indexed only the homepage of xonvert.com: 365 tool pages of a site it doesn't trust
 * yet, many of them small one-line tools on the same template, spread its attention thin. Tools
 * people actually search for are listed here; they stay in the sitemap and indexable. Every other
 * tool page is `noindex, follow` (still reachable and still passing links) until the site has
 * earned trust — then grow this list rather than removing the rule.
 *
 * The studios (PRO_STUDIO_PAGES in app/sitemap.ts) are always indexed and are not listed here.
 */
export const FOCUS_TOOL_IDS: ReadonlySet<string> = new Set([
  // PDF
  'pdf-merge', 'pdf-split', 'pdf-compress', 'pdf-rotate', 'pdf-delete-pages', 'pdf-extract-pages', 'pdf-reorder',
  'pdf-page-numbers', 'pdf-watermark', 'pdf-protect', 'pdf-unlock', 'pdf-sign', 'pdf-ocr', 'pdf-to-text',
  'pdf-to-images', 'images-to-pdf', 'pdf-fill-form', 'pdf-nup',
  // Image
  'image-remove-bg', 'image-compress', 'image-convert-format', 'image-resize', 'image-crop', 'image-rotate',
  'image-flip', 'image-ocr', 'image-upscale', 'image-heic-convert', 'image-watermark', 'image-add-text',
  'image-collage', 'image-meme', 'image-passport', 'image-remove-metadata', 'image-exif', 'image-color-extract',
  'image-batch-resize', 'image-batch-compress', 'image-batch-convert', 'image-enhance', 'image-object-remove',
  'image-blur', 'image-pixelate', 'image-grayscale', 'image-doc-scan', 'image-merge', 'image-split',
  'image-round-corners', 'image-face-detect',
  // Video
  'video-trim', 'video-compress', 'video-convert-format', 'video-to-gif', 'video-extract-audio', 'video-merge',
  'video-resize', 'video-crop', 'video-rotate', 'video-mute', 'video-speed', 'video-reverse', 'video-add-audio',
  'video-screen-record', 'video-webcam-test', 'video-extract-frames', 'video-to-shorts', 'video-gif-to-video',
  'video-watermark',
  // Audio
  'audio-trim', 'audio-merge', 'audio-convert-format', 'audio-volume', 'audio-normalize', 'audio-speed',
  'audio-pitch', 'audio-vocal-remover', 'audio-remove-noise', 'audio-to-text', 'audio-text-to-speech',
  'audio-ringtone', 'audio-record', 'audio-equalizer', 'audio-bass-boost', 'audio-remove-silence', 'audio-reverse',
  // Convert / files
  'convert-anything', 'archive-extract', 'archive-zip', 'cad-convert', 'model-3d-convert', 'doc-convert',
  'ebook-convert', 'sheet-convert', 'slides-convert', 'font-convert', 'doc-translate', 'subtitle-generate',
  // Text / dev
  'text-word-counter', 'text-find-replace', 'text-remove-duplicates', 'text-sort-lines', 'text-translate',
  'text-title-case', 'dev-json-format', 'dev-json-validate', 'dev-jwt-decode', 'dev-uuid', 'dev-hash',
  'dev-password', 'dev-base64-image', 'dev-diff', 'dev-regex', 'dev-sql-format', 'dev-json-to-yaml', 'text-base64',
  // Generate / calc / time / finance
  'gen-qr-code', 'gen-barcode', 'gen-favicon', 'gen-invoice', 'gen-resume', 'gen-color-palette', 'gen-gradient',
  'scan-qr', 'calc-percent', 'calc-age', 'calc-bmi', 'calc-loan', 'calc-scientific', 'calc-date',
  'time-unix-timestamp', 'time-timezone', 'time-world-clock', 'finance-currency', 'finance-mortgage',
  // Network / device tests / social
  'net-my-ip', 'net-speed-test', 'net-dns', 'net-whois', 'net-ssl', 'net-ip-lookup', 'test-mic', 'test-keyboard',
  'test-monitor', 'test-speaker', 'test-typing', 'test-mouse', 'social-resize',
]);
