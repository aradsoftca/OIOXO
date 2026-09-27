/**
 * Hand-written copy for the indexed non-CAD /convert pairs. These pages were
 * indexable ("popular") but carried almost no text — the old site's
 * ConversionContent rows are not on the live DB — i.e. thin pages. Every
 * statement matches the tool that performs the pair (checked 2026-09-27).
 */
import type { ConversionContentData, FaqItem } from '@/lib/convert/content';

interface Copy { why: string; how: string; quality: string; uses: string; faq: FaqItem[] }

const PRIVATE: FaqItem = { question: 'Is my file uploaded?', answer: 'No. The conversion runs in your browser; the file stays on your device.' };

const IMG = 'Images are decoded and re-encoded in your browser with the jsquash builds of MozJPEG, libwebp and libavif — the codecs behind Google’s Squoosh.';
const FFMPEG = 'The conversion runs with ffmpeg compiled to WebAssembly, on your device.';

const COPY: Record<string, Copy> = {
  'png-to-jpg': {
    why: 'JPG files are much smaller than PNG for photos and open everywhere — email, forms and old software that reject PNG.',
    how: `Drop the PNG and download a JPG. ${IMG} Quality defaults to 90%.`,
    quality: 'JPG has no transparency: transparent areas become a solid background. Text and sharp graphics can show slight blur at low quality — keep PNG for screenshots and logos.',
    uses: 'Shrinking phone screenshots of photos; uploading to sites that only accept JPG; sending images by email.',
    faq: [
      { question: 'What happens to a transparent background?', answer: 'JPG cannot store transparency, so those areas are filled with a solid colour.' },
      { question: 'Which quality should I use?', answer: '85–90% looks identical to the original for photos and is far smaller than PNG.' },
      PRIVATE,
    ],
  },
  'webp-to-jpg': {
    why: 'WebP images saved from websites often will not open in older apps or upload forms. JPG works everywhere.',
    how: `Drop the WebP and download a JPG. ${IMG}`,
    quality: 'Both formats are lossy, so a high quality setting (90% default) avoids adding visible loss. Animated WebP becomes a single still frame; transparency becomes a solid background.',
    uses: 'Opening images saved from Chrome in older software; uploading to forms that reject WebP.',
    faq: [
      { question: 'Why do downloaded images end in .webp?', answer: 'Websites serve WebP because it is smaller than JPG; browsers save it as-is.' },
      { question: 'Is an animated WebP kept?', answer: 'No — JPG is a still image, so you get one frame.' },
      PRIVATE,
    ],
  },
  'jpg-to-webp': {
    why: 'WebP is usually far smaller than JPG at the same visible quality, so pages load faster.',
    how: `Drop the JPG and download a WebP. ${IMG}`,
    quality: 'Re-encoding a JPG adds a little loss; at 85–90% it is not visible, while the file typically shrinks noticeably. Every modern browser displays WebP.',
    uses: 'Speeding up website images; reducing storage for photo collections.',
    faq: [
      { question: 'Do all browsers support WebP?', answer: 'Yes, every current browser does.' },
      { question: 'Should I use AVIF instead?', answer: 'AVIF is smaller still but encodes more slowly. The image converter offers both.' },
      PRIVATE,
    ],
  },
  'svg-to-png': {
    why: 'Many apps, documents and social sites cannot display SVG vector files. PNG is a universal image with transparency.',
    how: 'Drop the SVG; it is rendered by your browser and saved as a PNG, keeping transparent areas transparent.',
    quality: 'SVG is resolution-independent; the PNG has a fixed pixel size, so export at the size you need (larger for print).',
    uses: 'Putting a logo into Word, PowerPoint or a social post; making icons for apps that need PNG.',
    faq: [
      { question: 'Is transparency kept?', answer: 'Yes, PNG keeps the transparent background.' },
      { question: 'Why does my SVG look different?', answer: 'SVGs that reference external fonts or images may render without them.' },
      PRIVATE,
    ],
  },
  'jpg-to-pdf': {
    why: 'Put photos or scanned pages into one PDF document to send, print or submit.',
    how: 'Drop one or more JPGs, set the order and paper size (fit to image, A4, Letter, Legal or A3), and download the PDF. Built with pdf-lib in your browser.',
    quality: 'JPG images are embedded as they are, without recompression, so there is no quality loss.',
    uses: 'Scanning receipts or documents with a phone camera into one PDF; sending photo proofs.',
    faq: [
      { question: 'Can I combine several JPGs into one PDF?', answer: 'Yes. Drop them all and drag them into order.' },
      { question: 'Will the photos be compressed?', answer: 'No, JPGs are placed in the PDF unchanged.' },
      PRIVATE,
    ],
  },
  'pdf-to-jpg': {
    why: 'Turn PDF pages into images for slides, social posts, previews or apps that do not open PDFs.',
    how: 'Every page is rendered with pdf.js at Web (1200 px), Standard (1600 px, default) or Print (2400 px) size and downloaded together as a ZIP.',
    quality: 'Text in the images is no longer selectable. Choose Print for sharp text when zooming or printing.',
    uses: 'Posting a page of a report online; putting a PDF page into a presentation; previews.',
    faq: [
      { question: 'Can I convert just one page?', answer: 'Every page is rendered; the ZIP names them page-001, page-002 and so on, so you can keep the ones you need.' },
      { question: 'PNG or JPG?', answer: 'JPG for small files, PNG for the sharpest text. The PDF to Images tool offers both.' },
      PRIVATE,
    ],
  },
  'pdf-to-txt': {
    why: 'Copy the text out of a PDF to edit, search, quote or feed into another tool.',
    how: 'The text layer is read directly with pdf.js, page by page, in your browser.',
    quality: 'This reads text that is already in the PDF. A scanned PDF is just images — use PDF OCR for those.',
    uses: 'Pulling quotes from reports; reusing contract text; making a PDF searchable in notes.',
    faq: [
      { question: 'Why is the result empty?', answer: 'The PDF is probably a scan (images of text). Use the PDF OCR tool.' },
      { question: 'Is the layout kept?', answer: 'You get the text in reading order; columns and tables become plain text.' },
      PRIVATE,
    ],
  },
  'jpg-to-txt': {
    why: 'Get editable text out of a photo of a document, a sign or a screenshot.',
    how: 'Text recognition (OCR) runs in your browser with Tesseract. Pick the document language for best results; each language’s data downloads once.',
    quality: 'Sharp, straight, well-lit photos read best. Handwriting and stylised fonts are recognised poorly.',
    uses: 'Copying text from a photographed page; digitising receipts; grabbing text from a screenshot.',
    faq: [
      { question: 'Which languages are supported?', answer: 'About 20 languages; choose the one your document is written in.' },
      { question: 'Why is some text wrong?', answer: 'OCR depends on image quality — straighten and crop the photo for better results.' },
      PRIVATE,
    ],
  },
  'png-to-txt': {
    why: 'Extract the text from a screenshot or image so you can copy and edit it.',
    how: 'Text recognition (OCR) with Tesseract runs in your browser; pick the text’s language for best accuracy.',
    quality: 'Screenshots with crisp text give the best results; tiny or blurry text may be misread.',
    uses: 'Copying text from screenshots of apps, error messages or slides.',
    faq: [
      { question: 'Does it read text in images with backgrounds?', answer: 'Usually, if the text contrasts clearly with the background.' },
      { question: 'What if nothing is found?', answer: 'You will see “No text found” — try a sharper image or another language.' },
      PRIVATE,
    ],
  },
  'mp3-to-txt': {
    why: 'Turn a recording — an interview, lecture, voice memo or podcast — into text you can search and edit.',
    how: 'Speech recognition runs in your browser with OpenAI’s Whisper model (via transformers.js). The model downloads once and stays cached.',
    quality: 'Clear speech transcribes best; background music, overlapping voices and heavy accents reduce accuracy. Timestamps are included.',
    uses: 'Transcribing interviews and meetings; making notes from lectures; subtitles for your videos.',
    faq: [
      { question: 'Is the recording sent to a transcription service?', answer: 'No. Whisper runs on your device.' },
      { question: 'Why is the first run slow?', answer: 'The speech model downloads the first time, then it is cached.' },
      PRIVATE,
    ],
  },
  'wav-to-mp3': {
    why: 'WAV files are uncompressed and huge; MP3 is a fraction of the size and plays everywhere.',
    how: 'The audio is encoded to MP3 with LAME (libmp3lame) at the bitrate you choose — 192 kbps by default.',
    quality: '192 kbps sounds transparent to most listeners. Free use encodes up to 192 kbps; Pro allows 320 kbps.',
    uses: 'Shrinking recordings to share or upload; putting music on devices with limited storage.',
    faq: [
      { question: 'Which bitrate should I choose?', answer: '192 kbps for general listening, 320 kbps for archiving music.' },
      { question: 'How much smaller is MP3?', answer: 'Typically around a tenth of the WAV size at 128–192 kbps.' },
      PRIVATE,
    ],
  },
  'mp3-to-wav': {
    why: 'Editing software and some hardware samplers work best with uncompressed WAV audio.',
    how: 'The MP3 is decoded in your browser and saved as a standard WAV file.',
    quality: 'WAV cannot restore what MP3 compression removed — the sound is identical to the MP3, just uncompressed and larger.',
    uses: 'Importing into audio editors or DAWs; burning audio CDs; feeding samplers.',
    faq: [
      { question: 'Does converting to WAV improve quality?', answer: 'No, it only removes further compression.' },
      { question: 'Why is the WAV so big?', answer: 'WAV stores uncompressed audio, about 10 MB per stereo minute.' },
      PRIVATE,
    ],
  },
  'mp4-to-mp3': {
    why: 'Keep just the sound of a video — a song, a talk or a voice memo — as an MP3 you can play anywhere.',
    how: `The audio track is converted to a 192 kbps MP3. ${FFMPEG} It takes seconds for typical clips.`,
    quality: '192 kbps MP3 sounds transparent for most listening. The video itself is not changed.',
    uses: 'Saving a song or podcast from a video file; turning a recorded lecture into audio for your commute.',
    faq: [
      { question: 'Does it work with MOV, WebM and other videos?', answer: 'Yes, common video files work, not just MP4.' },
      { question: 'What if the video has no sound?', answer: 'You get a message that the file has no audio track.' },
      PRIVATE,
    ],
  },
  'mov-to-mp3': {
    why: 'iPhone and Mac videos are MOV files. Extract their sound as an MP3 to share or play anywhere.',
    how: `The audio track is converted to a 192 kbps MP3. ${FFMPEG}`,
    quality: '192 kbps MP3 is transparent for most listening; the original MOV is not changed.',
    uses: 'Saving audio from iPhone recordings; making voice notes from videos.',
    faq: [
      { question: 'Is this the same as MP4 to MP3?', answer: 'Yes — MOV and MP4 hold the same kinds of audio; the tool handles both.' },
      { question: 'Can I do it on my iPhone?', answer: 'Yes, in Safari, without installing an app.' },
      PRIVATE,
    ],
  },
  'mp4-to-audio': {
    why: 'Keep just the audio of an MP4 video.',
    how: `The audio track is saved as a 192 kbps MP3. ${FFMPEG}`,
    quality: 'The picture is dropped; the sound is re-encoded to MP3 at 192 kbps.',
    uses: 'Music, podcasts and lectures from video files.',
    faq: [
      { question: 'What format is the audio?', answer: 'MP3, which plays on every device.' },
      { question: 'Is the video changed?', answer: 'No, only a new audio file is created.' },
      PRIVATE,
    ],
  },
  'mov-to-mp4': {
    why: 'MOV files from iPhones and Macs do not always play on Windows, Android or social sites. MP4 plays everywhere.',
    how: `The video is re-encoded to H.264 with AAC audio in an MP4 container. ${FFMPEG}`,
    quality: 'Choose the quality level; higher quality means a bigger file. HDR and some iPhone-specific metadata are not kept.',
    uses: 'Sharing iPhone videos with Android or Windows users; uploading to sites that reject MOV.',
    faq: [
      { question: 'Why won’t my MOV play on Windows?', answer: 'MOV often uses HEVC, which many Windows setups cannot decode; H.264 MP4 works everywhere.' },
      { question: 'How long does it take?', answer: 'Encoding runs on your device; short clips take seconds, long 4K videos much longer.' },
      PRIVATE,
    ],
  },
  'mkv-to-mp4': {
    why: 'MKV files play in VLC but often not on phones, TVs, editors or social sites. MP4 is universally supported.',
    how: `The video is re-encoded to H.264 with AAC audio in an MP4 container. ${FFMPEG}`,
    quality: 'MP4 keeps one video and one audio track; extra audio tracks and embedded subtitles from the MKV are not carried over.',
    uses: 'Playing downloads on a TV or phone; importing into editors that reject MKV.',
    faq: [
      { question: 'Are subtitles kept?', answer: 'No. Extract them separately if you need them.' },
      { question: 'Will quality drop?', answer: 'It is re-encoded; the High Quality setting keeps it visually identical.' },
      PRIVATE,
    ],
  },
  'avi-to-mp4': {
    why: 'AVI is an old format many phones, browsers and editors no longer play. MP4 works everywhere and is usually smaller.',
    how: `The video is re-encoded to H.264 with AAC audio in an MP4 container. ${FFMPEG}`,
    quality: 'H.264 is far more efficient than the codecs typically inside AVI, so the MP4 is often much smaller at the same quality.',
    uses: 'Modernising old camera and archive videos; playing old clips on phones and TVs.',
    faq: [
      { question: 'Why is the MP4 smaller?', answer: 'H.264 compresses much better than older AVI codecs.' },
      { question: 'Does it work with old camcorder AVIs?', answer: 'Most do; very unusual codecs may not decode.' },
      PRIVATE,
    ],
  },
  'mp4-to-webm': {
    why: 'WebM is an open video format for the web, supported by Chrome, Firefox and Edge.',
    how: `The video is encoded to VP9 (or VP8 as a fallback) with Opus or Vorbis audio. ${FFMPEG}`,
    quality: 'VP9 encoding is slow in a browser; use MP4 for the widest compatibility, WebM when a site or tool asks for it.',
    uses: 'Web pages and HTML5 video; tools and sites that require WebM.',
    faq: [
      { question: 'Does WebM play on iPhone?', answer: 'Recent iOS versions play WebM in Safari, but MP4 is safer for Apple devices.' },
      { question: 'Why is it slower than MP4?', answer: 'VP9/VP8 encoders are heavier than H.264, especially in WebAssembly.' },
      PRIVATE,
    ],
  },
  'mp4-to-gif': {
    why: 'Turn a short clip into an animated GIF that plays anywhere — chats, docs, READMEs and forums.',
    how: 'Pick the start and end, frame rate (15 fps default) and width (480 px default); the GIF is built in your browser.',
    quality: 'GIF is limited to 256 colours and has no sound, and files grow quickly — keep clips short and small.',
    uses: 'Reaction GIFs; product demos in docs and GitHub READMEs; tutorials.',
    faq: [
      { question: 'Why is my GIF so large?', answer: 'GIF compresses poorly. Lower the width, frame rate or length.' },
      { question: 'Is sound kept?', answer: 'No, GIF has no audio.' },
      PRIVATE,
    ],
  },
  'jpg-to-mp4': {
    why: 'Make a video from photos — a slideshow you can post to social media or send as one file.',
    how: `Drop one or more images, set how long each shows (3 seconds by default) and the background colour, and download an MP4. ${FFMPEG}`,
    quality: 'Images are fitted into the video frame; mixed orientations get background bars.',
    uses: 'Photo slideshows for social media; turning a single image into a video for platforms that need video.',
    faq: [
      { question: 'Can I add many photos?', answer: 'Yes, add several and arrange the order.' },
      { question: 'Can I add music?', answer: 'Use the Add Audio to Video tool on the result.' },
      PRIVATE,
    ],
  },
  'png-to-mp4': {
    why: 'Turn PNG images — slides, graphics or screenshots — into a video file.',
    how: `Set how long each image shows (3 seconds by default) and the background colour, then download an MP4. ${FFMPEG}`,
    quality: 'MP4 has no transparency: transparent areas take the background colour you choose.',
    uses: 'Turning slides into a video; posting graphics where only video is allowed.',
    faq: [
      { question: 'What happens to transparency?', answer: 'It is filled with the background colour you pick.' },
      { question: 'How long can each image show?', answer: 'You set the duration per image.' },
      PRIVATE,
    ],
  },
};

export const PAIR_COPY_SLUGS = Object.keys(COPY);

export function pairCopyContent(slug: string): ConversionContentData | null {
  const c = COPY[slug];
  if (!c) return null;
  const [from, to] = slug.split('-to-').map((s) => s.toUpperCase());
  return {
    title: `${from} to ${to} converter — free, private, no upload`,
    metaDescription: `Convert ${from} to ${to} in your browser. ${c.why.split('. ')[0]}.`.slice(0, 158),
    intro: `${c.why} This converter runs entirely in your browser — the file is never uploaded.`,
    whyConvert: c.why,
    howItWorks: c.how,
    qualityNotes: c.quality,
    useCases: c.uses,
    formatComparison: '',
    faq: c.faq,
  };
}
