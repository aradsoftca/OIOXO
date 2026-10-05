import { BRAND } from '@/lib/brand';
/** Starter blog content. Each post is plain data → rendered server-side. */

export interface Block { type: 'p' | 'h2' | 'link'; text: string; href?: string }
export interface Post {
  slug: string;
  title: string;
  date: string;       // ISO
  excerpt: string;
  body: Block[];
}

export const POSTS: Post[] = [
  {
    slug: 'merge-pdf-files-without-uploading',
    title: 'How to merge PDF files without uploading them',
    date: '2026-10-05',
    excerpt: 'Most “merge PDF” sites upload your documents to their servers first. Here is how to combine PDFs into one file in your browser, so contracts, statements and IDs never leave your device.',
    body: [
      { type: 'p', text: 'Merging PDFs is one of the most common office jobs: a signed contract plus its appendix, a month of bank statements, scanned pages of an ID for an application. Those are exactly the documents you would rather not hand to a stranger’s server.' },
      { type: 'h2', text: 'Merge them on your own device' },
      { type: 'p', text: `${BRAND}’s merger runs inside the web page. Drop two or more PDFs in, drag them into the order the pages should appear, and download one merged file. Nothing is uploaded — you can turn off Wi-Fi after the page has loaded and it still works.` },
      { type: 'link', text: 'Merge PDFs in your browser', href: '/tools/pdf-merge' },
      { type: 'h2', text: 'Nothing is re-rendered' },
      { type: 'p', text: 'The pages are copied as they are with pdf-lib, an open-source PDF library. Text stays selectable, links and page sizes are kept, and images are not recompressed, so the merged file looks exactly like the originals.' },
      { type: 'h2', text: 'Limits' },
      { type: 'p', text: 'You need at least two files. Free use merges up to 10 files at a time; Pro raises that to 100.' },
      { type: 'h2', text: 'Related jobs' },
      { type: 'p', text: 'Need only some pages? Split or extract them first. File too big for email afterwards? Compress it.' },
      { type: 'link', text: 'Split a PDF', href: '/tools/pdf-split' },
      { type: 'link', text: 'Compress a PDF', href: '/tools/pdf-compress' },
    ],
  },
  {
    slug: 'convert-pdf-to-word-free',
    title: 'How to convert a PDF to Word for free',
    date: '2026-10-05',
    excerpt: 'You only have the PDF and need to change the wording. Turn it into an editable Word document in your browser — and know when it will work well and when it won’t.',
    body: [
      { type: 'p', text: 'An old CV, a contract that needs one clause changed, a report you want to reuse: often the only copy is a PDF. Retyping it is slow; converting it to Word (.docx) gives you the text back as editable paragraphs.' },
      { type: 'link', text: 'Convert PDF to DOCX', href: '/convert/pdf-to-docx' },
      { type: 'h2', text: 'How it works' },
      { type: 'p', text: 'The converter reads the PDF’s text layer in your browser with pdf.js. Lines are joined back into paragraphs, larger text becomes Word headings, and each PDF page ends with a page break. The .docx file is written on your device; the PDF is never uploaded.' },
      { type: 'h2', text: 'What converts well' },
      { type: 'p', text: 'PDFs that were exported from Word, a browser or a publishing tool convert well, because they contain real text. The layout is simplified to flowing paragraphs: images are left out, and tables and multi-column pages become lines of text. That is ideal for editing the wording, not for recreating a designed layout.' },
      { type: 'h2', text: 'Scanned PDFs need OCR first' },
      { type: 'p', text: 'A scanned PDF is just pictures of pages, so there is no text to extract. Run it through PDF OCR to add a text layer, then convert the result to Word.' },
      { type: 'link', text: 'Add a text layer with PDF OCR', href: '/tools/pdf-ocr' },
    ],
  },
  {
    slug: 'compress-video-for-email-or-whatsapp',
    title: 'How to compress a video for email or WhatsApp',
    date: '2026-10-05',
    excerpt: 'Phone videos are huge and email and messaging apps have size limits. Make a video smaller in your browser, choose how much quality to trade, and get an MP4 that plays everywhere.',
    body: [
      { type: 'p', text: 'A minute of phone video is easily a hundred megabytes or more — far over most email attachment limits, and slow to send on a messaging app. Re-encoding it at a sensible quality makes it a fraction of the size.' },
      { type: 'link', text: 'Compress a video', href: '/tools/video-compress' },
      { type: 'h2', text: 'Pick the trade-off' },
      { type: 'p', text: 'There are four levels: Visually Lossless, High Quality, Web Standard (the default) and Small File. Web Standard suits sharing online; pick Small File when you must fit a strict size limit, and Visually Lossless when you want to keep quality for editing.' },
      { type: 'h2', text: 'What you get' },
      { type: 'p', text: 'The video is re-encoded to H.264 with AAC audio and saved as an MP4, which plays on virtually every phone, computer and messaging app, and starts playing before it has fully downloaded.' },
      { type: 'h2', text: 'It runs on your device' },
      { type: 'p', text: 'Encoding uses ffmpeg compiled to WebAssembly, inside the page, so the video is not uploaded. Free use covers videos up to 5 minutes; long or 4K videos take a while in the browser, so leave the tab open until the progress bar finishes.' },
      { type: 'h2', text: 'Only need part of it?' },
      { type: 'p', text: 'Trimming the clip to the moment that matters is the biggest saving of all — do that first, then compress.' },
      { type: 'link', text: 'Trim a video', href: '/tools/video-trim' },
    ],
  },
  {
    slug: 'open-dwg-file-without-autocad',
    title: 'How to open a DWG file without AutoCAD',
    date: '2026-09-27',
    excerpt: 'Someone sent you an AutoCAD drawing and you don’t have AutoCAD. Convert it to DXF — the documented format almost every CAD program opens — in your browser, without uploading it.',
    body: [
      { type: 'p', text: 'DWG is AutoCAD’s native drawing format. It is proprietary and changes with AutoCAD releases, which is why most other programs cannot open it directly.' },
      { type: 'h2', text: 'The practical answer: convert to DXF' },
      { type: 'p', text: 'DXF is Autodesk’s documented exchange format. LibreCAD, QCAD, FreeCAD, Inkscape and the software behind laser cutters and CNC machines all read it.' },
      { type: 'link', text: 'Convert DWG to DXF in your browser', href: '/convert/dwg-to-dxf' },
      { type: 'h2', text: 'What comes across' },
      { type: 'p', text: 'The drawing is read with LibreDWG, the GNU project’s open DWG library. Lines, arcs, polylines, circles, layers, blocks and text convert. Custom objects from AutoCAD add-ons such as Civil 3D may be missing — check the parts that matter before sending the file to a machine.' },
      { type: 'h2', text: 'Confidential drawings' },
      { type: 'p', text: 'Engineering drawings are often under NDA. The converter runs entirely in your browser, so the DWG is never uploaded to a server.' },
    ],
  },
  {
    slug: '3d-print-a-step-file',
    title: 'How to 3D print a STEP file',
    date: '2026-09-27',
    excerpt: 'Slicers print triangle meshes, not CAD solids. Here is how to turn a STEP or STP file into an STL your slicer accepts — and what to check before printing.',
    body: [
      { type: 'p', text: 'STEP (.step or .stp) stores exact CAD geometry: a cylinder is a true cylinder. Slicers such as Cura, PrusaSlicer and Bambu Studio need a mesh of triangles instead, usually STL.' },
      { type: 'link', text: 'Convert STEP to STL', href: '/convert/step-to-stl' },
      { type: 'h2', text: 'What changes in the conversion' },
      { type: 'p', text: 'Every curved surface is tessellated into flat triangles, so round parts become faceted. The CAD feature history and dimensions do not survive — keep the STEP file as your editable master.' },
      { type: 'h2', text: 'Check the scale' },
      { type: 'p', text: 'STL has no units. Slicers assume millimetres, which matches almost all mechanical CAD, but confirm the size when you import.' },
      { type: 'h2', text: 'Assemblies' },
      { type: 'p', text: 'A single-file assembly is meshed into one STL. If the top STEP file only references parts stored in separate files, export a single-file STEP from your CAD tool first.' },
    ],
  },
  {
    slug: 'convert-iphone-heic-photos-to-jpg',
    title: 'How to convert iPhone HEIC photos to JPG',
    date: '2026-09-27',
    excerpt: 'iPhones save photos as HEIC, which many Windows programs, websites and upload forms reject. Convert them to JPG in your browser — no app, no upload.',
    body: [
      { type: 'p', text: 'Since iOS 11, iPhones store photos as HEIC. The files are about half the size of JPG, but plenty of software still cannot open them.' },
      { type: 'link', text: 'Convert HEIC to JPG', href: '/tools/image-heic-convert' },
      { type: 'h2', text: 'Stop it happening in future' },
      { type: 'p', text: 'On the iPhone, Settings → Camera → Formats → “Most Compatible” makes the camera save JPG instead. Existing photos stay HEIC, so convert those.' },
      { type: 'h2', text: 'Privacy' },
      { type: 'p', text: 'Photos often contain location data and private moments. The conversion runs on your device; the photos are not uploaded.' },
    ],
  },
  {
    slug: 'extract-audio-from-video-mp4-to-mp3',
    title: 'How to extract the audio from a video (MP4 to MP3)',
    date: '2026-09-27',
    excerpt: 'Keep just the sound of a video — a song, a talk or a voice memo — as an MP3 that plays anywhere.',
    body: [
      { type: 'p', text: 'Drop the video and download an MP3. The audio track is converted to a 192 kbps MP3 with ffmpeg running in your browser; it takes seconds for typical clips.' },
      { type: 'link', text: 'Convert MP4 to MP3', href: '/convert/mp4-to-mp3' },
      { type: 'p', text: 'iPhone videos are MOV files — the same tool handles them.' },
      { type: 'link', text: 'Convert MOV to MP3', href: '/convert/mov-to-mp3' },
      { type: 'h2', text: 'Quality' },
      { type: 'p', text: '192 kbps MP3 sounds transparent for most listening. The original video is not changed.' },
    ],
  },
  {
    slug: 'make-a-pdf-smaller-for-email',
    title: 'How to make a PDF smaller for email',
    date: '2026-09-27',
    excerpt: 'Email attachments are usually capped around 20–25 MB. Here is how to shrink a heavy PDF — and when compression will not help.',
    body: [
      { type: 'p', text: 'PDFs get large because of the images inside them: scans, photos and exported slides. Shrinking those images is what makes the file small.' },
      { type: 'link', text: 'Compress a PDF', href: '/tools/pdf-compress' },
      { type: 'h2', text: 'Pick a level' },
      { type: 'p', text: 'Balanced suits most documents. Use Light if it will be printed, Strong when it only needs to be readable on screen or must fit a strict limit. A grayscale option saves more on colour scans.' },
      { type: 'h2', text: 'The trade-off' },
      { type: 'p', text: 'Pages are re-saved as images, so text in the compressed PDF can no longer be selected or searched. Keep the original if you need that.' },
      { type: 'h2', text: 'Still too big?' },
      { type: 'p', text: 'Split it into parts and send them separately.' },
      { type: 'link', text: 'Split a PDF', href: '/tools/pdf-split' },
    ],
  },
  {
    slug: 'files-never-leave-your-device',
    title: 'Your files never have to leave your device',
    date: '2026-05-20',
    excerpt: `Most file tools upload your documents to a server. ${BRAND} flips that — everything runs in your browser. Here’s why that matters.`,
    body: [
      { type: 'p', text: 'When you use a typical online converter, your file is uploaded to someone else’s server, processed there, and (hopefully) deleted afterwards. You’re trusting that company with your photos, contracts, and recordings.' },
      { type: 'h2', text: 'A different approach' },
      { type: 'p', text: `${BRAND} runs the conversion, compression, and editing right inside your browser tab. The bytes of your file are read locally and never sent to us. There’s no upload step, no server copy, and nothing to delete — because we never had it.` },
      { type: 'h2', text: 'Why it’s also faster' },
      { type: 'p', text: 'Skipping the upload and download round-trip means small files are often done before a server-based tool has finished uploading. And it works offline once the page has loaded.' },
      { type: 'h2', text: 'No exceptions' },
      { type: 'p', text: 'Every tool runs on your device — including AI features such as background removal and transcription, whose models download once and then run locally. There is no “send it to our server” mode.' },
    ],
  },
  {
    slug: 'png-jpg-webp-avif-which-image-format',
    title: 'PNG vs JPG vs WebP vs AVIF: which should you use?',
    date: '2026-05-18',
    excerpt: 'A quick, practical guide to choosing the right image format for the web in 2026 — and when to convert.',
    body: [
      { type: 'p', text: 'There are four formats worth knowing for everyday images. Here’s the short version.' },
      { type: 'h2', text: 'JPG — photos, maximum compatibility' },
      { type: 'p', text: 'Great for photographs, opens everywhere, but lossy and no transparency. Use it when compatibility matters more than size.' },
      { type: 'h2', text: 'PNG — graphics and transparency' },
      { type: 'p', text: 'Lossless with an alpha channel. Perfect for logos, screenshots, and anything with sharp edges or transparency — but files are large for photos.' },
      { type: 'h2', text: 'WebP — the modern default' },
      { type: 'p', text: 'Smaller than both JPG and PNG at similar quality, supports transparency and animation, and is supported by every current browser. A great default for the web.' },
      { type: 'h2', text: 'AVIF — smallest files, newest' },
      { type: 'p', text: 'Often 30–50% smaller than WebP at the same quality. Support is now broad. Use it when size is critical and you don’t need to support very old software.' },
      { type: 'h2', text: 'Convert in seconds' },
      { type: 'p', text: 'You can move between all four with the image converter — locally, full quality, no upload.' },
    ],
  },
  {
    slug: 'convert-files-free-without-uploading',
    title: 'How to convert files for free without uploading them',
    date: '2026-05-15',
    excerpt: 'Convert images, audio, video, and documents privately — no account, no upload, no watermark.',
    body: [
      { type: 'p', text: `Converting a file shouldn’t mean handing it to a stranger. With ${BRAND} you can convert most files for free, right in your browser.` },
      { type: 'h2', text: 'Three steps' },
      { type: 'p', text: 'Open the converter, drop your file, and pick a target format. The result downloads straight back to you. No sign-up needed for everyday use.' },
      { type: 'h2', text: 'What you can convert' },
      { type: 'p', text: 'Images, audio, video, PDFs and documents, ebooks, archives, 3D models, fonts, and subtitles — hundreds of format pairs in total.' },
      { type: 'h2', text: 'Free and fair' },
      { type: 'p', text: 'Everyday use is free. Heavy daily users can go Pro for unlimited, wait-free access across every tool.' },
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
