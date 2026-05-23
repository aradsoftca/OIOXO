/**
 * Xonvert AI — routing eval corpus.
 *
 * Real, messy, and multilingual phrasings paired with the tool(s) that should
 * win. This is the scoreboard: it turns "the AI feels weak" into a number we can
 * drive down. Each case lists one or more acceptable tool ids (some requests
 * legitimately map to a couple of near-equivalent tools).
 *
 * Keep adding cases as we find misses in the wild — that's how the brain learns.
 * Pure data; the runner (`run.ts`) scores the lexical ranker against it in Node.
 */

export interface EvalCase {
  query: string;
  /** Any one of these ids counts as a correct top-1 (top-3 for `loose`). */
  expect: string[];
  /** Optional note on why this phrasing is tricky. */
  note?: string;
  /** A non-English phrasing (scored separately so we can see the gap). */
  lang?: string;
}

export const CORPUS: EvalCase[] = [
  // --- image: plain, messy, indirect --------------------------------------
  { query: 'remove the background from this photo', expect: ['image-remove-bg'] },
  { query: 'cut out the person and make it transparent', expect: ['image-remove-bg'] },
  { query: 'get rid of the backdrop behind me', expect: ['image-remove-bg'] },
  { query: 'make this picture smaller for the website', expect: ['image-compress', 'image-resize'] },
  { query: 'shrink this png file size', expect: ['image-compress'] },
  { query: 'resize to 800 wide', expect: ['image-resize'] },
  { query: 'make this image higher resolution', expect: ['image-upscale'] },
  { query: 'enhance a blurry low-res photo', expect: ['image-upscale'] },
  { query: 'turn this png into a jpg', expect: ['image-convert-format', 'convert-anything'] },
  { query: 'make this black and white', expect: ['image-grayscale'] },
  { query: 'rotate the photo 90 degrees', expect: ['image-rotate'] },
  { query: 'brighten this dark picture', expect: ['image-brightness'] },
  { query: 'strip the gps location data from my photo', expect: ['image-remove-metadata', 'image-exif'] },
  { query: 'add my logo as a watermark on this image', expect: ['image-watermark'] },
  { query: 'write a caption onto the photo', expect: ['image-add-text'] },
  { query: 'remove that person from the background of my photo', expect: ['image-object-remove', 'image-remove-bg'] },
  { query: 'blur this photo', expect: ['image-blur'] },
  { query: 'add a vignette to this picture', expect: ['image-vignette'] },
  { query: 'convert this audio to mono', expect: ['audio-stereo-to-mono'] },
  { query: 'boost the bass on this track', expect: ['audio-bass-boost'] },
  { query: 'add an echo to this audio', expect: ['audio-echo'] },
  { query: 'add some reverb', expect: ['audio-reverb'] },
  { query: 'pitch this up higher', expect: ['audio-pitch'] },
  { query: 'slow it down without changing the pitch', expect: ['audio-tempo'] },
  { query: 'make this video vertical for reels', expect: ['video-reframe'] },
  { query: 'clean the background noise out of this recording', expect: ['audio-remove-noise'] },

  // --- audio ---------------------------------------------------------------
  { query: 'make this song louder', expect: ['audio-volume'] },
  { query: 'speed up this track 2x', expect: ['audio-speed'] },
  { query: 'keep only the first 30 seconds of the audio', expect: ['audio-trim'] },
  { query: 'play it backwards', expect: ['audio-reverse'] },
  { query: 'remove the vocals to make a karaoke version', expect: ['audio-vocal-remover'] },
  { query: 'even out the loudness of this recording', expect: ['audio-normalize'] },
  { query: 'convert this wav to mp3', expect: ['audio-convert-format', 'convert-anything'] },
  { query: 'transcribe this audio to text', expect: ['audio-to-text'] },
  { query: 'ocr this screenshot', expect: ['image-ocr'] },
  { query: 'read the text in this image', expect: ['image-ocr'] },

  // --- video ---------------------------------------------------------------
  { query: 'cut the start and end off this video', expect: ['video-trim'] },
  { query: 'turn this clip into a looping gif', expect: ['video-to-gif'] },
  { query: 'compress this video so it fits in an email', expect: ['video-compress'] },
  { query: 'extract the audio from this video', expect: ['video-extract-audio'] },
  { query: 'grab a thumbnail from this video', expect: ['video-thumbnail'] },

  // --- pdf -----------------------------------------------------------------
  { query: 'merge these pdfs into one', expect: ['pdf-merge'] },
  { query: 'combine multiple pdf files together', expect: ['pdf-merge'] },
  { query: 'split this pdf into separate pages', expect: ['pdf-split'] },
  { query: 'make this pdf smaller so it fits the attachment limit', expect: ['pdf-compress'] },
  { query: 'delete pages 5 to 7 from the pdf', expect: ['pdf-delete-pages'] },
  { query: 'pull out pages 2-4 of the document', expect: ['pdf-extract-pages'] },
  { query: 'password protect this pdf', expect: ['pdf-protect'] },
  { query: 'remove the password from a pdf', expect: ['pdf-unlock'] },
  { query: 'extract the text from this pdf', expect: ['pdf-to-text'] },
  { query: 'add page numbers to my pdf', expect: ['pdf-page-numbers'] },
  { query: 'rearrange the order of pdf pages', expect: ['pdf-reorder'] },

  // --- documents / convert -------------------------------------------------
  { query: 'convert this word document to pdf', expect: ['doc-convert', 'convert-anything'] },
  { query: 'turn a docx into a pdf', expect: ['doc-convert', 'convert-anything'] },
  { query: 'scan this document with my camera', expect: ['image-doc-scan'] },

  // --- dev / text / generators --------------------------------------------
  { query: 'format this messy json', expect: ['dev-json-format'] },
  { query: 'minify this json', expect: ['dev-json-minify'] },
  { query: 'generate a uuid', expect: ['dev-uuid'] },
  { query: 'generate a strong password', expect: ['dev-password'] },
  { query: 'slugify this title', expect: ['dev-slug'] },
  { query: 'decode this jwt token', expect: ['dev-jwt-decode'] },
  { query: 'convert this hex color to rgb', expect: ['gen-color-converter'] },
  { query: 'check the contrast ratio between these colors', expect: ['gen-color-contrast'] },
  { query: 'make a qr code for my link', expect: ['gen-qr-code'] },
  { query: 'count the words in this text', expect: ['text-word-counter'] },
  { query: 'change this text to uppercase', expect: ['text-uppercase'] },
  { query: 'convert this to snake_case', expect: ['text-snake-case'] },
  { query: 'extract all the emails from this list', expect: ['text-extract-emails'] },
  { query: 'remove duplicate lines', expect: ['text-remove-duplicates'] },
  { query: 'sort these lines alphabetically', expect: ['text-sort-lines'] },
  { query: 'base64 encode this string', expect: ['text-base64'] },

  // --- breadth hardening: more phrasings across wired categories ----------
  { query: 'increase the contrast of this photo', expect: ['image-contrast'] },
  { query: 'sharpen this picture', expect: ['image-sharpen'] },
  { query: 'crop this image', expect: ['image-crop'] },
  { query: 'add a blur to this photo', expect: ['image-blur'] },
  { query: 'fade out the end of this song', expect: ['audio-fade-out'] },
  { query: 'speed up this audio', expect: ['audio-speed'] },
  { query: 'split this pdf into separate pages', expect: ['pdf-split'] },
  { query: 'unlock this password-protected pdf', expect: ['pdf-unlock'] },
  { query: 'rotate the pages of this pdf', expect: ['pdf-rotate'] },
  { query: 'add a watermark to my pdf', expect: ['pdf-watermark'] },
  { query: 'extract pages 2 to 4 from this pdf', expect: ['pdf-extract-pages'] },
  { query: 'validate my json', expect: ['dev-json-validate'] },
  { query: 'format this xml', expect: ['dev-xml-format'] },
  { query: 'make a url slug from this title', expect: ['dev-slug'] },
  { query: 'sentence case this text', expect: ['text-sentence-case'] },
  { query: 'reverse this text', expect: ['text-reverse'] },
  { query: 'make a gif from this video', expect: ['video-to-gif'] },
  { query: 'turn this png to webp', expect: ['image-convert-format', 'convert-anything'] },

  // --- multilingual (router runs after translate-to-English in app) --------
  { query: 'quitar el fondo de esta foto', expect: ['image-remove-bg'], lang: 'es', note: 'spanish: remove background' },
  { query: 'comprimer ce pdf', expect: ['pdf-compress'], lang: 'fr', note: 'french: compress pdf' },
];

/** Multi-step requests: the ordered set of tools a planner should produce. */
export interface PlanCase {
  query: string;
  /** Tool ids expected in the plan, in order. */
  steps: string[];
  note?: string;
}

export const PLAN_CORPUS: PlanCase[] = [
  {
    query: 'take this word doc, delete pages 5-7 and add page numbers',
    steps: ['doc-convert', 'pdf-delete-pages', 'pdf-page-numbers'],
    note: 'the docx flagship example — convert to pdf first, then operate',
  },
  {
    query: 'remove the background then compress it',
    steps: ['image-remove-bg', 'image-compress'],
  },
  {
    query: 'trim the first 10 seconds and make it louder',
    steps: ['audio-trim', 'audio-volume'],
  },
  {
    query: 'merge these pdfs and password protect the result',
    steps: ['pdf-merge', 'pdf-protect'],
  },
  {
    query: 'remove the background and convert it to jpg',
    steps: ['image-remove-bg', 'image-convert-format'],
  },
  {
    query: 'remove duplicate lines and sort them',
    steps: ['text-remove-duplicates', 'text-sort-lines'],
  },
];
