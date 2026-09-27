/**
 * Hand-written copy for the highest-traffic tools. Every statement here was
 * checked against the tool's code (options, defaults, engine, limitations) on
 * 2026-09-27 — keep it that way: if a tool changes, change its copy. Tools not
 * listed fall back to the short generic template in lib/seo/content.ts.
 */
import type { RichFaq, RichSection } from '@/lib/seo/content';

export interface ToolCopy {
  intro: string;
  sections: RichSection[];
  faqs: RichFaq[];
}

export const TOOL_COPY: Record<string, ToolCopy> = {
  'pdf-compress': {
    intro: 'Make a large PDF small enough to email or upload. Pick Light, Balanced or Strong and download the result — the file is processed in your browser and never uploaded.',
    sections: [
      { heading: 'How the compression works', body: 'Each page is rendered and re-saved as a JPEG image, then the PDF is rebuilt from those images. Light keeps pages up to 2200 px on the long edge, Balanced (the default) 1700 px and Strong 1300 px, with image quality stepping down from 82% to 60%. A grayscale option saves more on colour scans.' },
      { heading: 'When to use it — and when not to', body: 'It works best on scans, photo-heavy brochures and exported slide decks, where the images are what make the file big. Because every page becomes an image, text in the result can no longer be selected or searched; keep the original if you need that.' },
    ],
    faqs: [
      { q: 'Will the text in my PDF still be selectable?', a: 'No. Pages are flattened into images to shrink them, so text cannot be selected or searched afterwards. Keep the original for editing.' },
      { q: 'Which level should I choose?', a: 'Balanced suits most documents. Use Light if it will be printed, Strong when the file only needs to be readable on screen or must fit a strict size limit.' },
      { q: 'Is my PDF uploaded?', a: 'No. It is rendered and rebuilt inside your browser tab.' },
    ],
  },
  'pdf-merge': {
    intro: 'Combine several PDFs into one file. Drop them in, drag them into the order you want and download a single merged PDF.',
    sections: [
      { heading: 'What is kept', body: 'Pages are copied as they are — text stays selectable, links and page sizes are preserved — using pdf-lib, the same open-source library many desktop tools use. Nothing is re-rendered or recompressed.' },
      { heading: 'Limits', body: 'You need at least two files. Free use covers up to 10 files at a time; Pro raises that to 100.' },
    ],
    faqs: [
      { q: 'Can I change the order of the files?', a: 'Yes. Drag the files into the order you want before exporting.' },
      { q: 'Does merging reduce quality?', a: 'No. Pages are copied, not re-rendered, so text and images are unchanged.' },
      { q: 'Are my files uploaded?', a: 'No. Merging happens in your browser.' },
    ],
  },
  'pdf-split': {
    intro: 'Split a PDF into separate files: every page on its own, custom ranges such as 1-3, 4-6, or just the pages you pick from thumbnails.',
    sections: [
      { heading: 'Three ways to split', body: 'Every page creates one PDF per page. Custom ranges takes a list like 1-3, 4-6 and makes one file per range. Pick pages shows thumbnails so you can click the pages to keep and save them as one PDF.' },
    ],
    faqs: [
      { q: 'Is the content changed when splitting?', a: 'No. Pages are copied as they are; text stays selectable.' },
      { q: 'How are the files delivered?', a: 'Each part downloads as its own PDF file.' },
      { q: 'Is my PDF uploaded?', a: 'No. Splitting runs in your browser.' },
    ],
  },
  'pdf-to-images': {
    intro: 'Turn every page of a PDF into an image — PNG, JPG or WebP — and download them together as a ZIP.',
    sections: [
      { heading: 'Choose size and format', body: 'Resolution is set by the long edge of each page: Web (1200 px), Standard (1600 px, the default) or Print (2400 px). PNG is lossless; JPG and WebP have a quality slider and make much smaller files.' },
    ],
    faqs: [
      { q: 'Which format should I pick?', a: 'PNG for sharp text and diagrams, JPG for photos, WebP for the smallest files on the web.' },
      { q: 'How are the pages named?', a: 'Pages are numbered in order (page-001, page-002 …) inside one ZIP file.' },
      { q: 'Is my PDF uploaded?', a: 'No. Pages are rendered in your browser.' },
    ],
  },
  'images-to-pdf': {
    intro: 'Put photos or scans into one PDF. Drop the images, set the order and paper size, and download the document.',
    sections: [
      { heading: 'Page setup', body: 'Keep each image at its own size (Fit image), or place them on A4, Letter, Legal or A3 pages in portrait, landscape or automatic orientation. Choose whether images fit inside the page, fill it, or stretch, and set a margin from 0 to 72 points.' },
      { heading: 'Image quality', body: 'JPEG and PNG images are embedded as they are, without recompression. Other formats such as WebP are converted to PNG first.' },
    ],
    faqs: [
      { q: 'Will my photos lose quality?', a: 'JPEG and PNG images are placed in the PDF unchanged.' },
      { q: 'Can I scan documents to PDF with this?', a: 'Yes — take photos of the pages, drop them in order, choose A4 or Letter and export.' },
      { q: 'Are my images uploaded?', a: 'No. The PDF is built in your browser.' },
    ],
  },
  'image-compress': {
    intro: 'Make JPG, PNG, WebP or AVIF images smaller and watch the size and quality change as you move the slider.',
    sections: [
      { heading: 'Format matters more than the slider', body: 'Saving as WebP (the default) or AVIF usually makes a photo far smaller than JPG at the same visible quality. Quality runs from 20 to 100 (default 75); for WebP and AVIF an effort setting trades encoding time for a smaller file. PNG output is lossless, so the quality setting does not apply to it.' },
      { heading: 'Engine', body: 'Encoding uses the jsquash builds of MozJPEG, libwebp and libavif — the same codecs behind Google’s Squoosh — compiled to run in your browser.' },
    ],
    faqs: [
      { q: 'What is the best format for websites?', a: 'WebP is supported by every modern browser and is usually much smaller than JPG. AVIF is smaller still but slower to encode.' },
      { q: 'Why did my PNG barely shrink?', a: 'PNG is lossless. Convert to WebP or JPG for real savings on photos.' },
      { q: 'Are my images uploaded?', a: 'No. Compression runs in your browser.' },
    ],
  },
  'image-resize': {
    intro: 'Resize an image to exact pixels or by percentage, with sharp Lanczos resampling and the aspect ratio locked by default.',
    sections: [
      { heading: 'Sharp results', body: 'Lanczos3 is the default resampling method; Mitchell, Catmull-Rom, Triangle and hqx are also available. Presets cover 50%, 75%, 150%, 2× and 4×. Save as PNG, JPG, WebP or AVIF.' },
    ],
    faqs: [
      { q: 'Will enlarging make the image sharper?', a: 'No resizer can add detail that isn’t there. Lanczos keeps edges as clean as possible; for real upscaling use the AI Enhance tool.' },
      { q: 'How do I keep the proportions?', a: 'The aspect-ratio lock is on by default — change width or height and the other follows.' },
      { q: 'Is my image uploaded?', a: 'No. Resizing runs in your browser.' },
    ],
  },
  'image-convert-format': {
    intro: 'Convert images between JPG, PNG, WebP and AVIF. GIF and BMP files can be converted too.',
    sections: [
      { heading: 'Which format to choose', body: 'JPG for photos that must open everywhere, PNG for screenshots, logos and transparency, WebP for smaller web images, AVIF for the smallest files in modern browsers. Lossy formats have a quality setting (default 90).' },
    ],
    faqs: [
      { q: 'Can I convert HEIC photos from an iPhone?', a: 'Use the HEIC converter for iPhone photos; this tool handles JPG, PNG, WebP, AVIF, GIF and BMP input.' },
      { q: 'Does converting to PNG improve quality?', a: 'No — it only stops further loss. PNG keeps exactly what the source had.' },
      { q: 'Is my image uploaded?', a: 'No. Conversion runs in your browser.' },
    ],
  },
  'image-remove-bg': {
    intro: 'Remove the background from a photo automatically. The subject is cut out by an AI model that runs in your browser — the photo is never uploaded.',
    sections: [
      { heading: 'Quality and backdrops', body: 'Choose Fast, Balanced (default) or High quality; higher settings download a larger model once and give cleaner edges. Keep the result transparent or place it on white, black, a studio gradient or any colour you pick. The result is saved as a PNG.' },
      { heading: 'Engine', body: 'It uses the open-source @imgly/background-removal library with ISNet segmentation models.' },
    ],
    faqs: [
      { q: 'Why is the first run slower?', a: 'The AI model downloads once, then stays cached in your browser.' },
      { q: 'What format is the result?', a: 'PNG, which keeps the transparent background.' },
      { q: 'Is my photo uploaded?', a: 'No. The model runs on your device.' },
    ],
  },
  'video-compress': {
    intro: 'Make a video file smaller for email, WhatsApp or upload limits. Choose a quality level and download an MP4.',
    sections: [
      { heading: 'Quality levels', body: 'Visually Lossless (CRF 18), High Quality (CRF 22), Web Standard (CRF 26, the default) and Small File (CRF 30). The video is re-encoded to H.264 with AAC audio at 128 kbps and saved as an MP4 that starts playing before it has fully downloaded.' },
      { heading: 'Engine and limits', body: 'Encoding runs with ffmpeg compiled to WebAssembly, on your device. Free use covers videos up to 5 minutes; long or 4K videos take a while in the browser.' },
    ],
    faqs: [
      { q: 'Which level should I choose?', a: 'Web Standard suits sharing online. Pick Small File when you must fit a strict size limit, Visually Lossless to keep quality for editing.' },
      { q: 'What format is the result?', a: 'MP4 (H.264 video, AAC audio), which plays on virtually every device.' },
      { q: 'Is my video uploaded?', a: 'No. It is compressed in your browser.' },
    ],
  },
  'video-extract-audio': {
    intro: 'Get the sound out of a video as an MP3 — for a song, a talk or a voice memo recorded on video.',
    sections: [
      { heading: 'What you get', body: 'The audio track is converted to a 192 kbps MP3 with ffmpeg running in your browser. It takes seconds for typical clips; the video itself is not changed.' },
    ],
    faqs: [
      { q: 'Can I convert MP4 to MP3 with this?', a: 'Yes. Drop the MP4 and download the MP3. MOV, WebM and other common video files work too.' },
      { q: 'What if the video has no sound?', a: 'You will see a message that the file has no audio track to extract.' },
      { q: 'Is my video uploaded?', a: 'No. The audio is extracted in your browser.' },
    ],
  },
  'audio-convert-format': {
    intro: 'Convert audio files to MP3 or WAV. Choose the MP3 bitrate and download.',
    sections: [
      { heading: 'MP3 or WAV', body: 'MP3 is small and plays everywhere; choose 96 to 320 kbps (192 kbps is the default and sounds transparent for most listening). WAV is uncompressed — larger, but best for editing. Free use encodes up to 192 kbps; Pro allows 320 kbps.' },
    ],
    faqs: [
      { q: 'Which inputs are supported?', a: 'Common audio files your browser can decode, such as WAV, MP3, M4A, AAC, OGG and FLAC.' },
      { q: 'Does converting MP3 to WAV improve quality?', a: 'No. It gives an uncompressed file for editing, but cannot restore what MP3 compression removed.' },
      { q: 'Is my audio uploaded?', a: 'No. Conversion runs in your browser.' },
    ],
  },
};
