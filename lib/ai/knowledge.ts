/**
 * Xonvert AI — tool knowledge layer.
 *
 * The router is only ever as smart as what it knows about each tool. A bare
 * manifest gives us a name, a one-line blurb and ~5 keywords — not enough for a
 * 0.5B-class assistant to feel like it has *mastered* 323 tools. This module is
 * the "reference book": for every tool it derives a much richer searchable
 * surface and a human-readable capability card, WITHOUT hand-authoring 323 files.
 *
 * Three sources, cheapest first:
 *  1. Auto-derivation from the manifest — MIME types → human words ("jpg, photo,
 *     picture"), category → synonyms, and the verbs/nouns already in the name &
 *     keywords expanded through a synonym dictionary ("remove" → strip, erase,
 *     cut out, get rid of).
 *  2. A curated `UTTERANCES` overlay — real phrasings people actually type — for
 *     the tools that matter most (everything the AI can run inline, plus the
 *     high-traffic PDF/convert/doc tools). Grows over time; absence is harmless.
 *  3. A curated `DETAILS` overlay — what the tool does in plain language + its
 *     options — used by the grounded-answer layer so the AI explains tools from
 *     fact, not improvisation.
 *
 * Everything here is pure (no DOM / no browser APIs) so it can be unit-tested and
 * scored in Node by the eval harness. `tool-index.ts` folds the output into both
 * the lexical terms and the semantic `searchText`.
 */

import type { ToolManifest } from '@/lib/registry/types';

// --- MIME / extension → human words ----------------------------------------
// People say "jpg" and "photo", not "image/jpeg". Mapping the accept/produce
// lists into natural words is one of the highest-leverage enrichments: it makes
// "turn my photo into a jpg" reach the image tools that declare image/jpeg.
const MIME_WORDS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'photo', 'picture', 'image'],
  'image/png': ['png', 'image', 'picture', 'transparent'],
  'image/webp': ['webp', 'image'],
  'image/avif': ['avif', 'image'],
  'image/gif': ['gif', 'animated', 'image'],
  'image/bmp': ['bmp', 'bitmap', 'image'],
  'image/tiff': ['tiff', 'tif', 'image'],
  'image/svg+xml': ['svg', 'vector'],
  'image/x-icon': ['ico', 'icon', 'favicon'],
  'image/heic': ['heic', 'iphone photo', 'live photo'],
  'image/*': ['image', 'photo', 'picture'],
  'audio/mpeg': ['mp3', 'audio', 'sound', 'music', 'song'],
  'audio/mp3': ['mp3', 'audio', 'sound', 'music', 'song'],
  'audio/wav': ['wav', 'audio', 'sound'],
  'audio/ogg': ['ogg', 'audio'],
  'audio/flac': ['flac', 'lossless', 'audio'],
  'audio/aac': ['aac', 'audio'],
  'audio/*': ['audio', 'sound', 'music', 'song', 'track', 'recording'],
  'video/mp4': ['mp4', 'video', 'clip', 'movie'],
  'video/webm': ['webm', 'video', 'clip'],
  'video/quicktime': ['mov', 'video'],
  'video/x-matroska': ['mkv', 'video'],
  'video/*': ['video', 'clip', 'movie', 'footage'],
  'application/pdf': ['pdf', 'document'],
  'application/json': ['json'],
  'text/csv': ['csv', 'spreadsheet'],
  'text/plain': ['text', 'txt'],
  'text/html': ['html', 'webpage'],
  'application/zip': ['zip', 'archive'],
  'application/epub+zip': ['epub', 'ebook'],
};

function mimeWords(mimes: string[]): string[] {
  const out: string[] = [];
  for (const m of mimes) {
    const exact = MIME_WORDS[m];
    if (exact) { out.push(...exact); continue; }
    // e.g. "image/x-foo" with no exact entry → at least the family + subtype.
    const slash = m.indexOf('/');
    if (slash > 0) {
      out.push(m.slice(0, slash));                       // family: image/audio/...
      const sub = m.slice(slash + 1).replace(/^x-|\+.*$/g, '');
      if (sub && sub !== '*') out.push(sub);
    }
  }
  return out;
}

// --- category synonyms ------------------------------------------------------
// Extra natural-language terms by category, so a request that names the medium
// ("edit my song", "clean up this doc") biases toward the right family.
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  image: ['photo', 'picture', 'pic', 'image', 'graphic'],
  audio: ['audio', 'sound', 'music', 'song', 'track', 'recording', 'voice'],
  video: ['video', 'clip', 'movie', 'footage', 'film'],
  pdf: ['pdf', 'document', 'doc', 'paperwork'],
  text: ['text', 'string', 'words', 'writing'],
  dev: ['code', 'developer', 'programming', 'data'],
  calc: ['calculator', 'compute', 'math', 'number'],
  convert: ['convert', 'change format', 'export', 'transform'],
  generator: ['generate', 'create', 'make', 'random'],
  time: ['time', 'date', 'clock', 'calendar', 'timezone'],
  finance: ['money', 'finance', 'currency', 'price', 'loan', 'interest'],
  seo: ['seo', 'website', 'search', 'ranking', 'meta'],
  game: ['game', 'gaming', 'dice', 'random'],
  gis: ['map', 'location', 'coordinates', 'geo'],
  ip: ['ip', 'network', 'address', 'dns'],
  social: ['social', 'profile', 'username', 'handle'],
  font: ['font', 'typeface', 'typography', 'text style'],
  subtitle: ['subtitle', 'caption', 'srt', 'vtt'],
};

// --- action / object synonym dictionary ------------------------------------
// Canonical word → the many ways people ask for it. Applied to every word that
// appears in a tool's name or keywords, so "Remove Background" also answers to
// "strip the backdrop", "cut out the subject", "get rid of the background".
const SYNONYMS: Record<string, string[]> = {
  remove: ['delete', 'strip', 'erase', 'get rid of', 'take out', 'clear', 'eliminate'],
  delete: ['remove', 'erase', 'drop', 'cut'],
  background: ['bg', 'backdrop', 'behind'],
  compress: ['shrink', 'reduce', 'smaller', 'optimize', 'optimise', 'lighten', 'squeeze', 'minimize'],
  resize: ['scale', 'dimensions', 'bigger', 'smaller', 'size'],
  convert: ['change', 'turn into', 'export', 'transform', 'save as'],
  merge: ['combine', 'join', 'concatenate', 'stitch', 'append'],
  split: ['separate', 'divide', 'break apart', 'cut up'],
  trim: ['cut', 'clip', 'shorten', 'crop'],
  crop: ['cut', 'trim', 'frame'],
  rotate: ['turn', 'spin', 'orientation'],
  flip: ['mirror', 'reverse', 'invert'],
  watermark: ['logo', 'stamp', 'branding', 'overlay'],
  upscale: ['enlarge', 'enhance', 'super resolution', 'higher resolution', 'sharper', 'hd'],
  brightness: ['brighten', 'lighten', 'darken', 'exposure'],
  contrast: ['punchy', 'flat', 'pop'],
  saturation: ['vivid', 'colorful', 'colourful', 'desaturate', 'muted'],
  grayscale: ['greyscale', 'black and white', 'b&w', 'monochrome', 'no color'],
  transcribe: ['speech to text', 'subtitles', 'captions', 'dictation', 'voice to text'],
  ocr: ['scan text', 'read text', 'extract text', 'image to text'],
  protect: ['password', 'encrypt', 'lock', 'secure'],
  unlock: ['decrypt', 'remove password', 'open'],
  normalize: ['normalise', 'level', 'balance', 'even out'],
  reverse: ['backwards', 'flip', 'rewind'],
  volume: ['louder', 'quieter', 'gain', 'loud', 'quiet'],
  speed: ['faster', 'slower', 'tempo', 'speed up', 'slow down'],
  metadata: ['exif', 'location data', 'gps', 'privacy', 'strip data'],
  format: ['pretty print', 'beautify', 'indent', 'tidy'],
  minify: ['compress', 'shrink', 'uglify'],
  encode: ['encrypt', 'escape'],
  decode: ['decrypt', 'unescape'],
  hash: ['checksum', 'digest', 'fingerprint'],
  qr: ['qr code', 'barcode', 'scan code'],
  palette: ['colors', 'colours', 'swatches', 'color scheme'],
  subtitle: ['caption', 'srt', 'vtt', 'closed captions'],
  summarize: ['summarise', 'tldr', 'key points', 'gist', 'shorten'],
};

function synonymsFor(words: string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    const syn = SYNONYMS[w];
    if (syn) out.push(...syn);
  }
  return out;
}

// --- curated utterance overlay ---------------------------------------------
// Real phrasings people type, keyed by tool id. These are pure gold for routing
// because they match how requests are actually worded, not how tools are named.
// Start with everything the AI can run inline + the high-traffic doc/pdf tools;
// extend freely — a missing entry just means we lean on auto-derivation.
const UTTERANCES: Record<string, string[]> = {
  'image-remove-bg': ['remove the background', 'cut out the subject', 'make the background transparent', 'erase background behind the person', 'isolate the subject'],
  'image-compress': ['make this image smaller', 'compress my photo for the web', 'reduce the file size of this picture', 'shrink this png'],
  'image-resize': ['resize this image', 'make it 800 pixels wide', 'scale the photo to half', 'change the dimensions to 1920x1080'],
  'image-upscale': ['upscale this image', 'make this photo higher resolution', 'enhance a low-res picture', 'enlarge without blurring'],
  'image-convert-format': ['convert this png to jpg', 'convert it to jpg', 'convert to png', 'convert to webp', 'change image format', 'save as jpg', 'export as webp', 'turn this png to jpg', 'turn png to webp', 'png to jpg'],
  'image-grayscale': ['make this black and white', 'turn the photo grayscale', 'remove the colour'],
  'image-rotate': ['rotate this image', 'turn the photo 90 degrees', 'fix the orientation'],
  'image-brightness': ['brighten this photo', 'brighten this dark picture', 'brighten a dark photo', 'make the image darker', 'fix the exposure', 'lighten this image'],
  'image-crop': ['crop this image', 'cut out part of the photo', 'trim the edges', 'crop to a square'],
  'image-thumbnail': ['make a thumbnail from this image', 'create a thumbnail', 'shrink to a thumbnail'],
  'image-metadata': ['strip exif from my photo', 'remove location data from this image', 'clear gps metadata for privacy'],
  'image-add-text': ['add text to this image', 'put a caption on the photo', 'write on the picture'],
  'image-watermark': ['add a watermark to this image', 'stamp my logo on the photo'],
  'audio-volume': ['make this louder', 'turn the volume up', 'make it quieter'],
  'audio-speed': ['speed this up', 'slow down the audio', 'make it 2x faster'],
  'audio-trim': ['trim this audio', 'keep the first 30 seconds', 'cut the last part'],
  'audio-reverse': ['play this backwards', 'reverse the audio'],
  'audio-normalize': ['normalize the volume', 'even out the loudness'],
  'audio-vocal-remover': ['remove the vocals', 'make a karaoke version', 'instrumental only'],
  'audio-convert-format': ['convert this audio to mp3', 'turn wav into mp3', 'export as flac'],
  'video-trim': ['trim this video', 'cut the start and end', 'shorten the clip'],
  'video-to-gif': ['turn this video into a gif', 'make a looping gif from a clip', 'make a gif from this video', 'convert video to gif'],
  'video-compress': ['compress this video', 'make the video smaller for email'],
  'video-extract-audio': ['get the audio from this video', 'extract the sound', 'rip the mp3 from a video'],
  'pdf-merge': ['merge these pdfs', 'combine multiple pdfs into one', 'join pdf files'],
  'pdf-split': ['split this pdf', 'separate the pages into files'],
  'pdf-compress': ['compress this pdf', 'make the pdf smaller so it fits in an email'],
  'pdf-delete-pages': ['delete pages from this pdf', 'remove pages 5 to 7', 'drop the last page'],
  'pdf-extract-pages': ['extract pages from a pdf', 'pull out pages 2 to 4'],
  'pdf-reorder': ['reorder pdf pages', 'rearrange the pages'],
  'pdf-rotate': ['rotate pdf pages', 'fix a sideways page'],
  'pdf-protect': ['password protect this pdf', 'encrypt my pdf', 'lock the document'],
  'pdf-unlock': ['unlock this pdf', 'remove the pdf password'],
  'pdf-to-text': ['extract text from this pdf', 'get the text out of a pdf'],
  'pdf-to-images': ['convert pdf pages to images', 'turn a pdf into jpgs'],
  'pdf-watermark': ['add a watermark to my pdf', 'stamp every page'],
  'pdf-page-numbers': ['add page numbers to this pdf'],
  'pdf-sign': ['sign this pdf', 'add my signature'],
  'pdf-ocr': ['make this scanned pdf searchable', 'ocr a pdf'],
  'doc-convert': ['convert this word doc to pdf', 'turn a docx into pdf', 'pdf to word', 'change document format'],
  'pdf-fill-form': ['fill in this pdf form'],
  'images-to-pdf': ['combine these photos into a pdf', 'make a pdf from images'],
  'image-doc-scan': ['scan this document with my camera', 'turn a photo of a page into a clean scan'],
  'image-object-remove': ['remove an object from this photo', 'erase the person in the background', 'delete something from the picture'],
  'video-reframe': ['make this video vertical for reels', 'reframe for tiktok or shorts', 'crop the video to portrait'],
  'video-convert-format': ['convert this video to mp4', 'change the video format'],
  'audio-merge': ['join these audio files', 'stitch the tracks together', 'combine two songs'],
  'audio-remove-noise': ['clean the background noise out of this recording', 'remove hiss and hum'],
  'gen-qr-code': ['make a qr code for this link', 'generate a qr code', 'turn a url into a qr code'],
  'text-find-replace': ['find and replace text', 'swap one word for another everywhere'],
  'text-remove-duplicates': ['remove duplicate lines', 'delete duplicate lines', 'dedupe lines', 'remove repeated lines'],
  'text-sort-lines': ['sort these lines', 'sort lines alphabetically', 'order the lines a to z'],
  'text-base64': ['base64 encode this', 'base64 decode this', 'encode to base64'],
  'image-blur': ['blur this image', 'add a blur', 'make it blurry', 'soften the photo'],
  'image-vignette': ['add a vignette', 'darken the edges of the photo'],
  'image-hue': ['shift the hue', 'rotate the colors', 'change the hue'],
  'image-border': ['add a border to this image', 'put a frame around the photo'],
  'image-round-corners': ['round the corners of this image', 'give it rounded corners'],
  'audio-stereo-to-mono': ['convert to mono', 'make this mono', 'downmix to mono'],
  'audio-mono-to-stereo': ['convert to stereo', 'make this stereo'],
  'audio-pan': ['pan this audio left', 'pan it to the right'],
  'audio-stereo-width': ['widen the stereo', 'make it sound wider', 'narrow the stereo'],
  'audio-bass-boost': ['boost the bass', 'add more bass', 'make the bass stronger'],
  'audio-treble-boost': ['boost the treble', 'add more treble', 'brighten the highs'],
  'audio-echo': ['add an echo', 'add an echo effect to this audio'],
  'audio-reverb': ['add reverb', 'add a reverb effect', 'make it sound spacious'],
  'audio-pitch': ['shift the pitch', 'pitch this up', 'make it higher pitched', 'lower the pitch', 'chipmunk voice', 'pitch down an octave'],
  'audio-tempo': ['change the tempo', 'slow it down without changing pitch', 'speed up keeping the pitch', 'make it slower but same pitch'],
  'video-thumbnail': ['grab a thumbnail from this video', 'get a still frame from the video', 'make a thumbnail from the clip'],
  'video-poster': ['grab a poster frame from this video', 'poster image from the video'],
  'dev-json-format': ['format this json', 'pretty print json', 'beautify json'],
  'dev-json-minify': ['minify this json', 'compress json'],
  'dev-json-validate': ['validate this json', 'is this valid json', 'check my json'],
  'dev-xml-format': ['format this xml', 'pretty print xml'],
  'dev-slug': ['slugify this', 'make a url slug', 'turn this title into a slug'],
  'dev-jwt-decode': ['decode this jwt', 'decode this token', 'read this jwt'],
  'dev-hash': ['hash this', 'sha256 of this', 'compute the hash', 'sha-512 hash'],
  'dev-uuid': ['generate a uuid', 'give me a uuid', 'make a guid', 'new uuid'],
  'dev-password': ['generate a password', 'make a strong password', 'random password'],
  'dev-lorem': ['generate lorem ipsum', 'give me placeholder text', 'lorem ipsum'],
  'gen-random-data': ['generate random data', 'fake user data', 'sample test data as json', 'mock data'],
  'gen-color-converter': ['convert this color', 'hex to rgb', 'what is this hex in rgb', 'rgb to hsl', 'convert #ff0000'],
  'gen-color-contrast': ['contrast ratio between these colors', 'check color contrast', 'is this contrast accessible', 'wcag contrast'],
  'image-ocr': ['read the text in this image', 'ocr this image', 'extract text from this screenshot', 'what does this image say', 'pull the text off this picture'],
  'audio-to-text': ['transcribe this audio', 'transcribe this recording', 'turn this audio into text', 'speech to text', 'what is said in this recording'],
  'game-fantasy': ['generate a fantasy name', 'random fantasy name', 'fantasy character name'],
  'game-sci-fi': ['generate a sci-fi name', 'sci-fi name'],
  'game-username': ['generate a username', 'random gamertag', 'cool username', 'username generator'],
  'game-clan': ['generate a clan name', 'clan name'],
  'game-guild': ['generate a guild name', 'guild name'],
  'game-team': ['generate a team name', 'esports team name'],
  'game-weapon': ['generate a weapon name', 'fantasy weapon name'],
  'game-spell': ['generate a spell name', 'spell name'],
  'game-quest': ['generate a quest name', 'quest name'],
  'game-character': ['generate a character name', 'rpg character name'],
  'game-name': ['random game name', 'name generator', 'generate a name'],
  'subtitle-to-plain-text': ['get the plain text from these subtitles', 'strip the timings from this srt', 'subtitles to text', 'transcript from subtitles'],
  'subtitle-timing-shifter': ['shift these subtitles', 'delay the subtitles by 2 seconds', 'subtitles are out of sync, shift them', 'move subtitles earlier'],
  'subtitle-fps-converter': ['convert subtitles from 24 to 25 fps', 'change the subtitle frame rate'],
  'subtitle-cleaner': ['clean up these subtitles', 'remove formatting tags from subtitles'],
  'time-world-clock': ['what time is it in tokyo', 'current time in london', 'time in new york right now', 'world clock'],
  'time-timezone': ['convert this time to another timezone', 'timezone converter'],
  'gen-gradient': ['make a css gradient', 'gradient from red to blue', 'linear gradient css'],
  'gen-mesh-gradient': ['make a mesh gradient', 'mesh gradient css'],
  'gen-box-shadow': ['css box shadow', 'generate a box shadow'],
  'gen-css-text-shadow': ['css text shadow', 'generate a text shadow'],
  'gen-css-filter': ['css filter', 'blur filter css'],
  'gen-glassmorphism': ['glassmorphism css', 'frosted glass effect css'],
  'gen-css-transform': ['css transform', 'rotate scale transform css'],
  'gen-flexbox': ['flexbox layout css', 'center with flexbox'],
  'gen-grid': ['css grid layout', 'grid with 3 columns'],
  'seo-meta-tag': ['generate meta tags', 'seo meta tags for my page'],
  'seo-open-graph': ['generate open graph tags', 'og tags for my page'],
  'seo-twitter-card': ['generate a twitter card', 'twitter card meta tags'],
  'seo-robots-txt': ['generate a robots.txt', 'make a robots txt file'],
  'seo-structured-data': ['generate json-ld structured data', 'schema markup for my site'],
};

// --- curated detail overlay (for grounded explanations) --------------------
// Plain-language "what it does" + notable options. Used by the grounding layer
// so the AI can describe a tool from fact. Optional per tool.
interface ToolDetail { does: string; options?: string[] }
const DETAILS: Record<string, ToolDetail> = {
  'image-remove-bg': { does: 'Isolates the main subject and makes the background transparent, fully on your device.', options: ['output PNG (transparent) or WebP'] },
  'image-compress': { does: 'Reduces an image’s file size while keeping it sharp, great for the web or email.', options: ['quality level', 'output format'] },
  'image-resize': { does: 'Changes an image’s pixel dimensions.', options: ['exact width×height', 'percentage', 'keep aspect ratio'] },
  'image-upscale': { does: 'Increases an image’s resolution using an on-device AI model, without the usual blur.' },
  'pdf-merge': { does: 'Combines several PDFs into a single file; you can drag to reorder before exporting.' },
  'pdf-split': { does: 'Separates a PDF into multiple files, by page or by range.' },
  'pdf-delete-pages': { does: 'Removes the pages you choose from a PDF and exports the rest.', options: ['single pages or ranges, e.g. 5-7'] },
  'pdf-compress': { does: 'Shrinks a PDF’s file size so it fits attachment limits.' },
  'doc-convert': { does: 'Converts between document formats — Word↔PDF and common office formats — entirely in the browser.' },
  'audio-vocal-remover': { does: 'Removes the lead vocal from a song to leave an instrumental / karaoke track.' },
  'image-crop': { does: 'Cuts an image down to a region you choose.', options: ['free or fixed aspect ratio'] },
  'image-object-remove': { does: 'Erases an unwanted object or person from a photo and fills the gap.' },
  'image-remove-metadata': { does: 'Strips EXIF data — including GPS location — from a photo for privacy.' },
  'video-compress': { does: 'Reduces a video’s file size so it fits sharing or attachment limits.' },
  'video-reframe': { does: 'Re-crops a wide video to a vertical frame for Reels, Shorts and TikTok.' },
  'video-to-gif': { does: 'Turns a video clip into a looping animated GIF.' },
  'audio-to-text': { does: 'Transcribes speech in an audio file to text, on-device.' },
  'pdf-protect': { does: 'Adds a password and encryption to a PDF.' },
  'pdf-unlock': { does: 'Removes a known password from a PDF so it opens freely.' },
  'pdf-page-numbers': { does: 'Stamps page numbers onto every page of a PDF.', options: ['position', 'start number', 'format'] },
};

// --- public surface ---------------------------------------------------------

export interface Knowledge {
  /** Extra lexical terms (already lowercased words) to fold into the index. */
  terms: string[];
  /** Curated real phrasings for this tool (weighted heavily in the index). */
  utterances: string[];
  /** Human-readable capability sentence for the grounded-answer layer. */
  card: string;
}

/** Build the enriched knowledge for one tool manifest. */
export function knowledgeFor(t: ToolManifest): Knowledge {
  const accepts = t.accepts ?? [];
  const produces = t.produces ?? [];
  const keywords = t.keywords ?? [];

  const nameWords = t.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const kwWords = keywords.flatMap((k) => k.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean);

  const io = [...mimeWords(accepts), ...mimeWords(produces)];
  const cat = CATEGORY_SYNONYMS[t.category] ?? [];
  const syn = synonymsFor([...nameWords, ...kwWords]);
  const utterances = UTTERANCES[t.id] ?? [];

  const terms = [...io, ...cat, ...syn];

  const detail = DETAILS[t.id];
  const ioh = io.length ? [...new Set(io)].slice(0, 4).join(', ') : '';
  const card = `${t.name} — ${detail?.does ?? t.blurb}`
    + (detail?.options?.length ? ` Options: ${detail.options.join('; ')}.` : '')
    + (ioh ? ` Works with: ${ioh}.` : '');

  return { terms, utterances, card };
}

/** Whether a tool has a curated detail entry (used to prioritise authoring). */
export function hasDetail(id: string): boolean {
  return id in DETAILS;
}
