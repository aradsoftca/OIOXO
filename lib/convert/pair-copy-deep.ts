/**
 * Long-form copy for the highest-demand /convert pairs (written 2026-09-29).
 * Google had these pages as "Crawled – currently not indexed": the short
 * pair-copy.ts entries read as a template. Each entry here answers the query
 * directly, compares the two formats with concrete facts, walks through the
 * steps on this site and answers specific questions.
 *
 * Every tool claim was checked against the tool that performs the pair:
 *   image pairs      → tools/image-convert-format (one file, quality 90 default, jsquash codecs)
 *   heic-to-*        → tools/image-heic-convert (many files, quality 90, heic-to)
 *   *-to-pdf         → tools/images-to-pdf (pdf-lib, JPEG/PNG embedded unchanged)
 *   pdf-to-*         → tools/pdf-to-images (pdf.js, 1200/1600/2400 px, ZIP)
 *   mp4-to-mp3       → tools/video-extract-audio (ffmpeg, libmp3lame 192k)
 *   *-to-mp4 (video) → tools/video-convert-format (x264 CRF 18/23/28/32, AAC)
 *   audio → mp3      → tools/audio-convert-format (LAME, 192 kbps default, 320 Pro)
 *   mp4-to-gif       → tools/video-to-gif (10/15/20/24 fps, 320–800 px)
 *   gif-to-mp4       → tools/video-gif-to-video
 * Canvas/ImageData re-encoding does not carry EXIF across — keep the FAQs
 * saying so. If a tool changes, change its copy here.
 */
import type { ConversionContentData } from '@/lib/convert/content';

const NO_UPLOAD = 'Nothing is uploaded: the page loads the converter once, then the file is read and written by your own browser.';

export const DEEP_PAIR_COPY: Record<string, ConversionContentData> = {
  'png-to-jpg': {
    title: 'PNG to JPG — convert PNG images to JPG in your browser',
    metaDescription: 'Convert PNG to JPG without uploading. Photos shrink a lot, quality is adjustable (90% default). Note: JPG has no transparency.',
    intro: 'To convert PNG to JPG, drop the PNG above, keep quality at 90% (or lower it for a smaller file) and download the JPG. For photos and photo-like screenshots the JPG is usually a fraction of the PNG size with no visible difference. ' + NO_UPLOAD,
    whyConvert: 'PNG stores every pixel losslessly, which is ideal for logos and interface screenshots but wasteful for photographs: a phone photo saved as PNG is often several times larger than the same photo as a JPG. Some upload forms, older programs and print services also accept only JPG.',
    formatComparison: 'PNG: lossless, supports transparency (alpha channel), best for text, line art, logos and UI screenshots, where JPG would blur edges.\n\nJPG: lossy, no transparency, far smaller for photos and gradients, and accepted by practically every app, website and printer.\n\nRule of thumb: if the image is a photo, JPG; if it has sharp text, flat colours or a transparent background, stay with PNG (or use WebP, which does both).',
    howItWorks: '1. Drop a PNG into the converter (or tap to choose one on a phone).\n\n2. JPG is already selected as the output. Move the quality slider if you want: 90% is the default; 80–85% saves more with little visible change on photos.\n\n3. Check the before/after size shown, then download the JPG. The image is decoded and re-encoded with MozJPEG, the encoder behind Google’s Squoosh, compiled to run in your browser.',
    qualityNotes: 'JPG cannot store transparency, so transparent areas become solid. If your PNG is a logo on a transparent background, convert to WebP instead or keep the PNG. Sharp text can show faint ringing ("artefacts") at low quality settings — keep 90% or higher for screenshots with text. Converting only once avoids stacking losses.',
    useCases: 'Shrinking photos that were saved as PNG before emailing them; meeting a site’s “JPG only” upload rule; reducing the size of a folder of scanned photos; preparing images for printing services.',
    faq: [
      { question: 'What happens to a transparent background?', answer: 'JPG has no alpha channel, so transparent pixels are written as solid colour. For a logo that must stay transparent use PNG to WebP instead.' },
      { question: 'Which quality setting should I use?', answer: '90% (the default) is visually identical to the PNG for photos. 80–85% gives a noticeably smaller file and is still fine for the web. Below about 70% blockiness starts to show.' },
      { question: 'Why is my JPG not much smaller?', answer: 'Screenshots with large flat areas are already compressed well by PNG. JPG wins on photos; on flat graphics the gain is small and PNG often looks better.' },
      { question: 'Can I convert several PNGs at once?', answer: 'This converter handles one image at a time. For a folder of PNGs, use the Batch Image Convert tool, which converts many files to JPG in one go.' },
      { question: 'Does it work on iPhone and Android?', answer: 'Yes, in Safari or Chrome. The downloaded JPG goes to your Files or Downloads folder.' },
    ],
  },

  'jpg-to-png': {
    title: 'JPG to PNG — convert JPG to lossless PNG, no upload',
    metaDescription: 'Convert JPG to PNG in your browser. PNG stops further quality loss while editing. It does not add transparency — here is what it does and does not do.',
    intro: 'Drop a JPG above and download a PNG. The PNG is a lossless copy of what the JPG already contains, so you can edit and re-save it without adding more compression loss. ' + NO_UPLOAD,
    whyConvert: 'Every time a JPG is edited and saved again it is re-compressed and loses a little more detail. Converting to PNG once and editing the PNG stops that. Some design tools, game engines and upload forms also require PNG.',
    formatComparison: 'JPG: lossy and small, ideal for finished photos. No transparency.\n\nPNG: lossless and larger — a photo as PNG is typically several times the size of the JPG. Supports transparency, and keeps text and hard edges crisp.\n\nConverting JPG to PNG never improves quality: any blockiness already in the JPG stays. It only guarantees nothing more is lost.',
    howItWorks: '1. Drop the JPG into the converter.\n\n2. PNG is selected as the output; there is no quality slider because PNG is lossless.\n\n3. Download the PNG. The JPG is decoded in your browser and written as PNG.',
    qualityNotes: 'Expect the file to grow, often considerably, for photos. The background stays exactly as it was — a white background remains white, not transparent. Metadata such as camera EXIF and GPS location is not copied into the PNG.',
    useCases: 'Editing a photo in several passes; preparing an image for a tool that only accepts PNG; adding text or annotations that must stay sharp.',
    faq: [
      { question: 'Will the PNG have a transparent background?', answer: 'No. A JPG has no transparency to carry over. Use the Remove Background tool to cut the subject out and get a transparent PNG.' },
      { question: 'Does converting to PNG improve quality?', answer: 'No. It keeps exactly what is in the JPG, including any compression artefacts, and prevents further loss.' },
      { question: 'Why is the PNG so much larger?', answer: 'PNG compresses without discarding anything. Photos have lots of fine detail that lossless compression cannot shrink much.' },
      { question: 'Is EXIF data kept?', answer: 'No. The image is re-encoded from its pixels, so camera details and GPS location are not written to the PNG.' },
    ],
  },

  'heic-to-jpg': {
    title: 'HEIC to JPG — convert iPhone photos, many at once, no upload',
    metaDescription: 'Convert iPhone HEIC photos to JPG in your browser. Batch conversion, 90% quality default, works on Windows, Mac, iPhone and Android. Nothing uploaded.',
    intro: 'Drop one or more iPhone HEIC photos above and download them as JPGs. At the default 90% quality they look the same as the originals and open on any computer, website or phone. The photos are converted on your device and never uploaded — which matters for personal pictures.',
    whyConvert: 'Since iOS 11, iPhones save photos as HEIC (“High Efficiency”) by default. HEIC is compact, but Windows needs an extra extension to open it, many websites and upload forms reject it, and older editing software cannot read it. JPG works everywhere.',
    formatComparison: 'HEIC: uses HEVC compression, so files are roughly half the size of a JPG of similar quality. Supports 16-bit colour, depth maps and image sequences. Opens natively on Apple devices and recent Android phones, but support elsewhere is patchy.\n\nJPG: older and less efficient, 8-bit colour only, but universally supported by every browser, app, printer and upload form.\n\nKeep HEIC in your iPhone library to save space; convert to JPG when a photo has to leave the Apple ecosystem.',
    howItWorks: '1. Drop HEIC or HEIF files into the converter — select many at once from Files, Finder or Explorer.\n\n2. JPG is selected; set quality with the slider (90% default). PNG and WebP are also available.\n\n3. Each photo converts in turn and shows its new size. Download them one by one or tap “Download all”.\n\nFiles without a .heic extension are checked by content, so HEIC photos renamed by other apps still work.',
    qualityNotes: 'At 90% the JPG is visually identical to the HEIC for normal viewing. The JPG will usually be larger than the HEIC — the price of compatibility. Photos are converted to standard 8-bit colour. EXIF metadata, including GPS location, is not carried over to the JPG, which is useful if you are sharing photos publicly but means date and camera details are gone too.',
    useCases: 'Uploading iPhone photos to job, visa or government forms that only accept JPG; opening photos on a Windows PC without the HEIF extension; sending pictures to Android users or older software; removing location data before posting.',
    faq: [
      { question: 'Does HEIC to JPG keep EXIF and location data?', answer: 'No. The photo is decoded and re-encoded, and the metadata (camera, date taken, GPS location) is not written into the JPG. Keep the original HEIC if you need that information.' },
      { question: 'Can I convert many photos at once?', answer: 'Yes. Select or drop several HEIC files together; free use converts batches of up to 10, Pro removes the limit. “Download all” saves every finished JPG.' },
      { question: 'What quality should I pick?', answer: '90% (the default) for photos you will keep or print. 80% is fine for web uploads and produces noticeably smaller files.' },
      { question: 'How do I stop my iPhone saving HEIC?', answer: 'Settings → Camera → Formats → “Most Compatible”. New photos are then saved as JPG; existing ones stay HEIC. Alternatively, Settings → Photos → “Transfer to Mac or PC: Automatic” makes the iPhone convert when copying to a computer.' },
      { question: 'What about Live Photos?', answer: 'The still image of a Live Photo is the HEIC; the motion is a separate short video. Converting gives you the still JPG.' },
      { question: 'Does it work on iPhone itself?', answer: 'Yes — open this page in Safari, choose photos from Files or the photo picker, and save the JPGs.' },
    ],
  },

  'heic-to-png': {
    title: 'HEIC to PNG — lossless copies of iPhone photos, no upload',
    metaDescription: 'Convert iPhone HEIC photos to PNG in your browser, several at once. Lossless output for editing; nothing is uploaded.',
    intro: 'Drop HEIC photos above, choose PNG and download lossless copies that any editor can open. Use PNG when you plan to edit the photo; use JPG if you only need to share it. Conversion happens in your browser.',
    whyConvert: 'PNG is lossless, so a PNG made from a HEIC keeps every decoded pixel and will not degrade however many times you edit and save it. Almost every editor, from Paint to Photoshop to GIMP, opens PNG.',
    formatComparison: 'HEIC: very efficient lossy compression from the iPhone camera; limited support outside Apple and recent Android.\n\nPNG: lossless and universally supported, but large — a 12-megapixel photo as PNG can easily be 15–25 MB, many times the HEIC.\n\nJPG sits in between: universal and small, but lossy. For sharing, JPG; for an editing master, PNG.',
    howItWorks: '1. Drop one or many HEIC/HEIF files.\n\n2. Pick PNG as the output (there is no quality slider — PNG is lossless).\n\n3. Download each PNG, or use “Download all”.',
    qualityNotes: 'PNG stores exactly what was decoded from the HEIC, in 8-bit colour. HEIC photos have no transparency, so the PNG is fully opaque. EXIF metadata and GPS location are not copied.',
    useCases: 'Editing iPhone photos in software without HEIC support; keeping a lossless working copy for retouching; using photos in design tools that expect PNG.',
    faq: [
      { question: 'JPG or PNG?', answer: 'JPG for sharing and uploads (much smaller). PNG for editing, where you want no further loss.' },
      { question: 'Why is the PNG so large?', answer: 'PNG compresses losslessly; camera photos contain fine detail and noise that lossless compression cannot shrink much.' },
      { question: 'Will the PNG have a transparent background?', answer: 'No — a camera photo has no transparency. Use the Remove Background tool afterwards if you need a cut-out.' },
      { question: 'Is location data kept?', answer: 'No. EXIF metadata, including GPS, is not written to the PNG.' },
    ],
  },

  'webp-to-png': {
    title: 'WebP to PNG — open web images anywhere, transparency kept',
    metaDescription: 'Convert WebP to PNG in your browser. Transparency is kept, output is lossless. Animated WebP gives one frame. No upload.',
    intro: 'Drop the .webp file above and download a PNG. Transparency is preserved and PNG opens in every editor and app, including older ones that cannot read WebP. ' + NO_UPLOAD,
    whyConvert: 'Websites serve images as WebP because the files are small, so “Save image as” in Chrome or Edge often gives you a .webp. Older versions of Photoshop, Office and many upload forms do not accept it; PNG is the safe, lossless choice.',
    formatComparison: 'WebP: can be lossy or lossless, supports transparency and animation, and is typically much smaller than PNG. Displayed by every current browser; app support is good but not universal.\n\nPNG: always lossless, supports transparency, no animation (a single frame), larger files, supported everywhere.\n\nChoose PNG over JPG here when the image has transparency, text or flat graphics.',
    howItWorks: '1. Drop the WebP image.\n\n2. PNG is selected as the output — no quality setting needed.\n\n3. Download the PNG. Decoding uses libwebp compiled to WebAssembly, so it works even in browsers that cannot save WebP themselves.',
    qualityNotes: 'The PNG reproduces the decoded WebP exactly; if the WebP was lossy, its compression is baked in and PNG will not remove it. Expect the PNG to be larger. An animated WebP becomes a single still frame.',
    useCases: 'Editing images saved from websites; putting web graphics into Word, PowerPoint or older design software; keeping a transparent logo downloaded as WebP.',
    faq: [
      { question: 'Is transparency kept?', answer: 'Yes. PNG supports an alpha channel, so transparent areas stay transparent.' },
      { question: 'What happens to an animated WebP?', answer: 'PNG holds a single image, so you get one frame. Use a GIF or video tool if you need the animation.' },
      { question: 'Why is the PNG bigger than the WebP?', answer: 'PNG is lossless and less efficient than WebP’s compression, so the same picture takes more bytes.' },
      { question: 'PNG or JPG?', answer: 'PNG if the image has transparency, text or sharp edges; JPG if it is a photo and you want a smaller file.' },
    ],
  },

  'webp-to-jpg': {
    title: 'WebP to JPG — convert .webp images to JPG, no upload',
    metaDescription: 'Convert WebP images saved from websites to JPG in your browser. Quality 90% default; works on Windows, Mac and phones. Nothing uploaded.',
    intro: 'Drop the .webp image above and download a JPG that opens in any program, upload form or printer. Keep the quality at 90% to avoid adding visible loss. ' + NO_UPLOAD,
    whyConvert: 'Images downloaded from the web are often WebP because it is smaller than JPG. Many upload forms, older Windows and Office versions, and photo-printing services still expect JPG.',
    formatComparison: 'WebP: typically noticeably smaller than JPG at the same visual quality; supports transparency and animation.\n\nJPG: universal compatibility, no transparency, no animation.\n\nBoth are lossy, so each conversion adds a little loss — a high quality setting keeps that invisible.',
    howItWorks: '1. Drop the WebP file.\n\n2. JPG is selected; adjust quality if needed (90% default).\n\n3. Download the JPG, re-encoded with MozJPEG in your browser.',
    qualityNotes: 'Transparent areas become a solid colour because JPG has no transparency — convert to PNG instead if the image is a logo or cut-out. Animated WebP gives only one frame. The JPG will usually be larger than the WebP.',
    useCases: 'Uploading a web image to a form that rejects WebP; printing photos saved from a website; opening images in older software.',
    faq: [
      { question: 'Why do downloaded images end in .webp?', answer: 'Websites serve WebP because it loads faster; the browser saves the file in the format it received.' },
      { question: 'Will I lose quality?', answer: 'Very little at 90%. Converting lossy to lossy adds a small amount of loss, which is not visible at high settings.' },
      { question: 'What if the WebP is transparent?', answer: 'JPG cannot store transparency, so those areas become solid. Choose WebP to PNG to keep it.' },
      { question: 'Is an animated WebP kept?', answer: 'No — JPG is a still image, so you get one frame.' },
    ],
  },

  'png-to-webp': {
    title: 'PNG to WebP — smaller images with transparency kept',
    metaDescription: 'Convert PNG to WebP in your browser. Much smaller files, transparency preserved, supported by every current browser. No upload.',
    intro: 'Drop a PNG above and download a WebP. For photos and most graphics the WebP is much smaller than the PNG, and unlike JPG it keeps a transparent background. ' + NO_UPLOAD,
    whyConvert: 'Image weight is usually the largest part of a web page. WebP gives most of JPG’s size savings while keeping PNG’s transparency, and every current browser (Chrome, Edge, Firefox, Safari) displays it.',
    formatComparison: 'PNG: lossless, transparency, large for photos, universal support.\n\nWebP: lossy (with a quality setting) or lossless, transparency, animation; much smaller for photos and usually smaller for graphics too.\n\nFor websites, WebP is the practical default. Keep PNG where a tool or printer requires it or where you need a lossless master.',
    howItWorks: '1. Drop the PNG.\n\n2. WebP is selected; the quality slider defaults to 90%. For photos 75–85% saves more; for text-heavy graphics stay at 90% or above.\n\n3. Download the WebP, encoded with libwebp (the Google encoder) running in your browser. The page shows the size before and after.',
    qualityNotes: 'Transparency is kept. At high quality, photos look identical; flat graphics with thin text can show slight softening at lower settings, so compare before downloading. Very small icons may not shrink much.',
    useCases: 'Speeding up website images and product photos; shrinking transparent logos and illustrations; reducing app or game asset sizes.',
    faq: [
      { question: 'Is transparency kept?', answer: 'Yes. WebP supports an alpha channel.' },
      { question: 'Do all browsers display WebP?', answer: 'Yes, every current version of Chrome, Edge, Firefox and Safari does. Some older desktop software does not.' },
      { question: 'Which quality should I use?', answer: '80–90% for most images. Check sharp text at the preview: if edges look soft, raise the quality.' },
      { question: 'WebP or AVIF?', answer: 'AVIF is usually smaller still, but encodes more slowly and is supported by fewer apps. WebP is the safer choice for broad compatibility.' },
    ],
  },

  'jpg-to-webp': {
    title: 'JPG to WebP — smaller photos for faster websites',
    metaDescription: 'Convert JPG to WebP in your browser with the libwebp encoder. Smaller files at the same visible quality. No upload, no signup.',
    intro: 'Drop a JPG above and download a WebP. At the same visible quality the WebP is typically smaller than the JPG, which makes web pages load faster. ' + NO_UPLOAD,
    whyConvert: 'Google’s WebP format was designed for the web: its lossy mode generally beats JPG at equal quality, and it is supported by every current browser. Replacing JPGs with WebP is one of the simplest page-speed improvements.',
    formatComparison: 'JPG: universal, lossy, no transparency.\n\nWebP: lossy or lossless, transparency, animation, usually smaller than JPG for the same look.\n\nIf the image must also be opened by email clients, printers or older software, keep a JPG copy.',
    howItWorks: '1. Drop the JPG.\n\n2. WebP is selected; quality defaults to 90%. 75–85% is common for web photos.\n\n3. Download the WebP and compare the sizes shown.',
    qualityNotes: 'The JPG is decoded and compressed again, so a small amount of loss is added; at 80–90% it is not visible. Metadata (EXIF, GPS) is not copied, which also trims a few kilobytes.',
    useCases: 'Website and blog images; online store product photos; reducing storage of photo collections that are only viewed in browsers.',
    faq: [
      { question: 'How much smaller will it be?', answer: 'It depends on the photo and the quality setting; the converter shows the exact before and after sizes so you can adjust.' },
      { question: 'Do all browsers support WebP?', answer: 'Yes, all current browsers do.' },
      { question: 'Is photo metadata kept?', answer: 'No. EXIF data such as camera and GPS location is not written to the WebP.' },
      { question: 'Should I use AVIF instead?', answer: 'AVIF can be smaller again but encodes much more slowly. The same converter offers AVIF if you want to compare.' },
    ],
  },

  'avif-to-jpg': {
    title: 'AVIF to JPG — open AVIF images in any app',
    metaDescription: 'Convert AVIF to JPG in your browser. Works even where AVIF will not open; 90% quality default; nothing uploaded.',
    intro: 'Drop the .avif file above and download a JPG you can open in any program or upload anywhere. Decoding uses libavif compiled to WebAssembly, so it works even if your system cannot open AVIF. ' + NO_UPLOAD,
    whyConvert: 'AVIF is increasingly served by websites and image CDNs because it is very small. Browsers display it, but Windows Photos (without an extension), older Office versions, many upload forms and most printers do not accept it.',
    formatComparison: 'AVIF: based on the AV1 video codec; typically the smallest of the common image formats at a given quality; supports transparency, HDR and 10/12-bit colour. Supported in current Chrome, Firefox and Safari (iOS 16 and later), but limited in desktop apps.\n\nJPG: larger, 8-bit, no transparency — but opens everywhere.',
    howItWorks: '1. Drop the AVIF image.\n\n2. JPG is selected; keep 90% quality or adjust.\n\n3. Download the JPG.',
    qualityNotes: 'The JPG will be larger than the AVIF. Transparent areas become solid (choose PNG to keep transparency). HDR or high-bit-depth AVIFs are converted to standard 8-bit colour, so very bright highlights may look flatter.',
    useCases: 'Opening AVIF images saved from websites; uploading to forms that reject AVIF; printing or editing in older software.',
    faq: [
      { question: 'What is AVIF?', answer: 'An image format built on the AV1 video codec by the Alliance for Open Media. It compresses better than JPG and WebP.' },
      { question: 'Why is the JPG bigger?', answer: 'JPG’s compression is less efficient, so the same picture needs more bytes.' },
      { question: 'Is transparency kept?', answer: 'Not in JPG. Convert AVIF to PNG instead if the image is transparent.' },
      { question: 'My computer cannot open the AVIF — will this still work?', answer: 'Yes. The decoder runs inside this page, not in your operating system.' },
    ],
  },

  'jpg-to-pdf': {
    title: 'JPG to PDF — combine photos into one PDF, no upload',
    metaDescription: 'Turn one or many JPGs into a single PDF in your browser. Reorder pages, choose A4/Letter/Legal/A3 or fit to image. Photos embedded without recompression.',
    intro: 'Drop one or more JPGs above, drag them into order, choose a page size and download a single PDF. The photos are embedded as they are — no recompression, no quality loss — and the PDF is built on your device.',
    whyConvert: 'Forms, landlords, schools and employers often ask for “one PDF” rather than a pile of photos. A PDF keeps pages in order, prints at the right paper size and opens identically on every device.',
    formatComparison: 'JPG: one image per file, sized in pixels, no concept of pages or paper size.\n\nPDF: a multi-page document with physical page sizes (A4, Letter…), ideal for printing, e-mailing and archiving. A JPG inside a PDF keeps its original data.',
    howItWorks: '1. Drop your JPGs (select several at once — e.g. photos of each page of a document).\n\n2. Drag them into the right order.\n\n3. Choose the paper size: Fit image (each page matches its photo), A4, Letter, Legal or A3; orientation portrait, landscape or automatic; and whether images fit inside the page, fill it or stretch. Set a margin if you want white space.\n\n4. Download the PDF, created with pdf-lib in your browser.',
    qualityNotes: 'JPG data is placed into the PDF unchanged, so the PDF is roughly the total size of the photos. If the result is too large to e-mail, run it through Compress PDF, or compress the JPGs first. The PDF contains images only; text is not searchable unless you run OCR.',
    useCases: 'Scanning a signed document with your phone camera and sending it as one PDF; submitting receipts for expenses; combining ID photos for an application; making a printable photo sheet.',
    faq: [
      { question: 'Can I combine several JPGs into one PDF?', answer: 'Yes. Drop them all, drag into order, and each image becomes a page of the same PDF.' },
      { question: 'Will the photos be compressed?', answer: 'No. JPEG images are embedded unchanged, so there is no quality loss.' },
      { question: 'Which page size should I choose?', answer: 'A4 in most of the world, Letter in the US and Canada. “Fit image” makes each page exactly the size of its photo, which is best for viewing on screen.' },
      { question: 'The PDF is too big to e-mail — what now?', answer: 'Use Compress PDF on the result; its Balanced level usually reduces photo PDFs a lot.' },
      { question: 'Can I make the text searchable?', answer: 'Not with this tool — pages are images. Use Image to Text (OCR) on the photos to extract the text.' },
    ],
  },

  'pdf-to-jpg': {
    title: 'PDF to JPG — convert every page to an image, no upload',
    metaDescription: 'Convert PDF pages to JPG images in your browser at 1200, 1600 or 2400 px. All pages in one ZIP. Your PDF is never uploaded.',
    intro: 'Drop a PDF above, choose JPG and a size, and download every page as a numbered JPG inside one ZIP file. Pages are rendered by pdf.js — the PDF engine inside Firefox — on your own device.',
    whyConvert: 'Many places accept images but not PDFs: social posts, chat apps, slide decks, website CMSs and image editors. Converting a page to JPG also lets you share one page without sending the whole document.',
    formatComparison: 'PDF: pages with selectable text, vector graphics and fonts; scales to any zoom; multi-page.\n\nJPG: a fixed-size photo of the page; text is no longer selectable; small files; opens everywhere.\n\nFor pages that are mostly text or diagrams, PNG gives sharper letters; for photo-heavy pages, JPG is much smaller.',
    howItWorks: '1. Drop the PDF.\n\n2. Pick the size by the page’s long edge: Web (1200 px), Standard (1600 px, default) or Print (2400 px), and adjust JPG quality if you like.\n\n3. Every page is rendered and the JPGs are downloaded together as a ZIP, named page-001.jpg, page-002.jpg and so on.',
    qualityNotes: 'The image is only as sharp as the size you choose: Web is fine for phones and social posts, Print for zooming in or printing. JPG can add slight blur around small text — pick PNG if that matters.',
    useCases: 'Posting a page of a report or menu on social media; inserting a PDF page into PowerPoint or Google Slides; creating thumbnails and previews; sending a single page via WhatsApp.',
    faq: [
      { question: 'Can I convert just one page?', answer: 'All pages are rendered, then zipped with numbered names, so you keep only the page you need. To remove pages first, use Split PDF.' },
      { question: 'What resolution should I use?', answer: 'Standard (1600 px) for most uses, Print (2400 px) for printing or when small text must stay legible when zoomed.' },
      { question: 'JPG or PNG?', answer: 'JPG for photos and scans (smaller). PNG for text and diagrams (sharper, larger).' },
      { question: 'Why do I get a ZIP file?', answer: 'So a multi-page PDF downloads as one file instead of dozens. Every phone and computer can open a ZIP.' },
      { question: 'Is my PDF uploaded?', answer: 'No. Pages are rendered inside your browser tab.' },
    ],
  },

  'png-to-pdf': {
    title: 'PNG to PDF — combine screenshots and images into one PDF',
    metaDescription: 'Turn PNG screenshots or images into one PDF in your browser. Reorder pages, choose paper size. PNGs embedded without recompression; no upload.',
    intro: 'Drop your PNGs above, set the order and page size, and download one PDF. PNGs are embedded losslessly, so text in screenshots stays sharp. The PDF is made in your browser.',
    whyConvert: 'A single PDF is easier to send, print and file than a folder of screenshots, and it keeps the pages in the order you chose.',
    formatComparison: 'PNG: lossless single image, ideal for screenshots, sharp text and graphics.\n\nPDF: multi-page document with real paper sizes. PNG data inside the PDF stays lossless, so the PDF is about as large as the PNGs combined.',
    howItWorks: '1. Drop one or more PNG files.\n\n2. Drag them into order.\n\n3. Choose Fit image, A4, Letter, Legal or A3; orientation; fit, fill or stretch; and a margin.\n\n4. Download the PDF.',
    qualityNotes: 'PNGs are placed without recompression. Transparent areas show the white page underneath. Pages are images, so text inside them is not searchable.',
    useCases: 'Turning a set of screenshots into a bug report or tutorial; submitting scanned forms as one file; collecting diagrams into a printable handout.',
    faq: [
      { question: 'Can I combine several PNGs?', answer: 'Yes — drop them all and drag them into order.' },
      { question: 'Is transparency kept?', answer: 'Transparent areas show the page colour (white).' },
      { question: 'Will screenshot text stay sharp?', answer: 'Yes. PNG data is embedded losslessly.' },
      { question: 'Why is the PDF large?', answer: 'Lossless PNGs are large. Use Compress PDF on the result if you need it smaller (pages become JPEG images).' },
    ],
  },

  'pdf-to-png': {
    title: 'PDF to PNG — sharp page images with crisp text',
    metaDescription: 'Convert PDF pages to PNG images in your browser at 1200, 1600 or 2400 px. Lossless, crisp text, all pages in one ZIP. No upload.',
    intro: 'Drop a PDF above and download each page as a lossless PNG, bundled in one ZIP. PNG keeps letters and lines crisp, which makes it the best image format for text-heavy pages and diagrams.',
    whyConvert: 'When you need a page as an image — for slides, documentation, a wiki or an image editor — PNG avoids the blurry halos JPG can add around text.',
    formatComparison: 'PDF: selectable text, vectors, scalable.\n\nPNG: fixed-resolution, lossless image; crisp text and lines; supports transparency; larger than JPG, especially for photo-heavy pages.\n\nPNG for text and diagrams, JPG for scans and photos.',
    howItWorks: '1. Drop the PDF.\n\n2. PNG is selected; choose Web (1200 px), Standard (1600 px, default) or Print (2400 px) for the long edge.\n\n3. Download the ZIP of numbered page images (page-001.png, page-002.png…).',
    qualityNotes: 'PNG is lossless, so the only thing that limits sharpness is the size you choose. Files are larger than JPG; photo-heavy pages can be several megabytes each at Print size. Text becomes pixels and is no longer selectable.',
    useCases: 'Putting slides or diagrams into documentation; sharing a page on a wiki or ticket; editing a page in an image editor; producing crisp previews.',
    faq: [
      { question: 'PNG or JPG?', answer: 'PNG for text, charts and diagrams; JPG for scanned photos and image-heavy pages where file size matters.' },
      { question: 'Are all pages converted?', answer: 'Yes, numbered in order in one ZIP.' },
      { question: 'Which size for printing?', answer: 'Print (2400 px on the long edge) — roughly 200 dpi on an A4 or Letter page.' },
      { question: 'Is the background transparent?', answer: 'No. Pages are rendered onto a white background, like a printed page.' },
    ],
  },

  'mp4-to-mp3': {
    title: 'MP4 to MP3 — extract audio from video, no upload',
    metaDescription: 'Extract the sound from an MP4 (or MOV, WebM, MKV) as a 192 kbps MP3, in your browser with ffmpeg. The video is never uploaded.',
    intro: 'Drop a video above and download its soundtrack as an MP3. The audio is encoded at 192 kbps with ffmpeg running on your device, so even private recordings never leave your computer or phone.',
    whyConvert: 'Keeping only the audio makes a file far smaller and lets you play a talk, lecture, interview or song on any music player, in the car or as a podcast, without the picture.',
    formatComparison: 'MP4: a container holding video (usually H.264 or H.265) and audio (usually AAC). Large because of the picture.\n\nMP3: audio only, plays on essentially every device. At 192 kbps it takes about 1.4 MB per minute — a tiny fraction of the video.',
    howItWorks: '1. Drop an MP4 — MOV, WebM, MKV and other common videos work too.\n\n2. The audio track is decoded and encoded to MP3 (LAME, 192 kbps) by ffmpeg compiled to WebAssembly.\n\n3. The MP3 downloads with “-audio” added to the original file name. Short clips take seconds; long videos take longer because the whole file is processed on your device.',
    qualityNotes: 'The video’s audio is usually AAC, so creating an MP3 is a lossy-to-lossy step; at 192 kbps the difference is not audible for speech or casual music listening. The original video is not changed.',
    useCases: 'Turning recorded lectures and meetings into audio for your commute; saving the music from your own video; sending a voice recording that was captured with a phone camera; transcribing speech (the MP3 can then go to Audio to Text).',
    faq: [
      { question: 'What bitrate is the MP3?', answer: '192 kbps — a good balance for music and more than enough for speech.' },
      { question: 'Does it work with MOV, WebM and MKV?', answer: 'Yes. ffmpeg reads most common video containers, not just MP4.' },
      { question: 'What if the video has no sound?', answer: 'You will see a message that there is no audio track to extract.' },
      { question: 'Can I use it on a phone?', answer: 'Yes, in Safari or Chrome. Very long videos need more memory, so a computer is faster for hour-long files.' },
      { question: 'Can I cut out just part of the audio?', answer: 'Convert first, then use Audio Trim on the MP3 to keep the section you want.' },
    ],
  },

  'mov-to-mp4': {
    title: 'MOV to MP4 — convert iPhone and Mac videos, no upload',
    metaDescription: 'Convert MOV to H.264 MP4 in your browser with ffmpeg. Choose quality (High, Good, Medium, Low). Plays on Windows, Android and every site. Nothing uploaded.',
    intro: 'Drop a MOV above, choose a quality and download an MP4 that plays on Windows, Android, smart TVs and every website. The video is re-encoded to H.264 with AAC audio on your device — it is not uploaded.',
    whyConvert: 'MOV is Apple’s QuickTime format. iPhones record in HEVC (H.265) by default under “High Efficiency”, which many Windows PCs, Android apps, editors and websites cannot play without extra codecs. An H.264 MP4 is the most widely compatible video file there is.',
    formatComparison: 'MOV: Apple QuickTime container; from iPhones usually HEVC video with AAC audio; may carry HDR (Dolby Vision) and Apple-specific metadata.\n\nMP4: the standard container for web and devices; with H.264 video and AAC audio it plays practically everywhere.\n\nBoth containers are closely related — the difference that matters is usually the codec inside.',
    howItWorks: '1. Drop the MOV file.\n\n2. MP4 is selected. Pick a quality: High (CRF 18, near-identical, larger), Good (CRF 23, default), Medium (CRF 28) or Low (CRF 32, smallest).\n\n3. Press Convert & Download. ffmpeg (x264, fast preset) encodes in your browser with a progress bar, and the MP4 is saved with fast-start so it begins playing before it fully loads.',
    qualityNotes: 'Re-encoding always costs a little quality; High is visually indistinguishable for most footage. HEVC iPhone clips often get larger as H.264 at High, and similar or smaller at Good. HDR footage is converted to a standard-range H.264 stream and may look slightly different. Very long or 4K videos take a while, because encoding runs in your browser.',
    useCases: 'Sending iPhone videos to Android or Windows users; uploading to sites and LMS platforms that reject MOV; importing into editors without HEVC support; playing on older smart TVs and USB media players.',
    faq: [
      { question: 'Why won’t my MOV play on Windows?', answer: 'iPhone MOVs usually use HEVC, which Windows only plays with the paid HEVC extension. H.264 MP4 plays with the built-in apps.' },
      { question: 'Which quality should I choose?', answer: 'Good (default) for sharing. High if you will edit it further. Medium or Low only if the file must be small.' },
      { question: 'Will the MP4 be bigger than the MOV?', answer: 'It can be: H.264 is less efficient than the HEVC iPhones use. Choose Good or Medium to keep the size similar, or run Compress Video afterwards.' },
      { question: 'Is the sound kept?', answer: 'Yes, as AAC audio in the MP4.' },
      { question: 'How long does it take?', answer: 'It depends on length, resolution and your device. Short clips take seconds to a minute; long 4K videos can take much longer, since encoding runs locally.' },
    ],
  },

  'mkv-to-mp4': {
    title: 'MKV to MP4 — play MKV videos on phones, TVs and editors',
    metaDescription: 'Convert MKV to H.264 MP4 in your browser with ffmpeg. Choose quality; plays everywhere. Nothing uploaded.',
    intro: 'Drop an MKV above, choose a quality and download an H.264 MP4 that plays on iPhones, Android, TVs, editors and websites. Encoding runs on your device with ffmpeg.',
    whyConvert: 'MKV (Matroska) is a flexible container popular for recordings and downloads, but many phones, TVs, video editors and upload sites do not accept it. MP4 is accepted almost everywhere.',
    formatComparison: 'MKV: open container that can hold almost any codec plus several audio tracks, subtitles and chapters.\n\nMP4: more limited, but universally supported. Here it carries one H.264 video track and one AAC audio track.',
    howItWorks: '1. Drop the MKV.\n\n2. MP4 is selected; pick High, Good (default), Medium or Low quality.\n\n3. Convert & Download — ffmpeg re-encodes in your browser and shows progress.',
    qualityNotes: 'Only the main video and audio tracks are converted; extra audio languages, subtitles and chapters are not carried over. At High quality the result is visually identical to the source.',
    useCases: 'Playing OBS or screen recordings on a phone; importing recordings into editors that reject MKV; uploading to sites that require MP4.',
    faq: [
      { question: 'Are subtitles kept?', answer: 'No. Only one video and one audio track are converted. Extract subtitles separately if you need them.' },
      { question: 'Which audio track is used?', answer: 'One track, chosen automatically by ffmpeg (normally the main track). Files with several languages keep only that one.' },
      { question: 'Will quality drop?', answer: 'Re-encoding adds a little loss; the High setting keeps it visually identical.' },
      { question: 'Why is OBS recording in MKV?', answer: 'OBS recommends MKV because a crash does not corrupt the file. Converting to MP4 afterwards is the usual workflow.' },
    ],
  },

  'wav-to-mp3': {
    title: 'WAV to MP3 — shrink audio files, no upload',
    metaDescription: 'Convert WAV to MP3 in your browser with the LAME encoder. 192 kbps default (up to 320 with Pro). Roughly 7x smaller than CD-quality WAV. No upload.',
    intro: 'Drop a WAV above, pick a bitrate and download an MP3. At the default 192 kbps the MP3 is about one seventh the size of a CD-quality WAV and sounds the same to most listeners. The audio is encoded in your browser.',
    whyConvert: 'WAV stores uncompressed audio — about 10 MB per minute at CD quality (44.1 kHz, 16-bit, stereo). That is too big for e-mail, messaging apps and many upload limits. MP3 plays on every device.',
    formatComparison: 'WAV: uncompressed PCM, the format audio editors and recorders use. Perfect quality, very large (~1,411 kbps for CD audio).\n\nMP3: lossy compression. 128 kbps ≈ 1 MB/minute, 192 kbps ≈ 1.4 MB/minute, 320 kbps ≈ 2.4 MB/minute.\n\nKeep the WAV as your master for editing; use MP3 for listening and sharing.',
    howItWorks: '1. Drop the WAV file.\n\n2. MP3 is selected; choose a bitrate from 96 to 192 kbps (320 kbps with Pro).\n\n3. Download the MP3, encoded with LAME in your browser.',
    qualityNotes: '192 kbps is transparent for most listening. For speech (podcasts, voice memos) 96–128 kbps is plenty and even smaller. MP3 cannot be converted back to the original WAV quality, so keep the WAV if you may edit again.',
    useCases: 'Sharing recordings from a field recorder or DAW; sending voice-overs to clients; storing podcast episodes; putting music on devices with limited space.',
    faq: [
      { question: 'Which bitrate should I choose?', answer: '192 kbps for music, 128 kbps for speech. 320 kbps (Pro) if the MP3 is your only copy of the music.' },
      { question: 'How much smaller is the MP3?', answer: 'Compared with CD-quality WAV: about 11× smaller at 128 kbps and about 7× smaller at 192 kbps.' },
      { question: 'Should I delete the WAV afterwards?', answer: 'Keep it if you might edit or re-master; MP3 is for listening.' },
    ],
  },

  'm4a-to-mp3': {
    title: 'M4A to MP3 — convert iPhone voice memos and iTunes audio',
    metaDescription: 'Convert M4A to MP3 in your browser with LAME. Works with iPhone Voice Memos. 192 kbps default; nothing uploaded.',
    intro: 'Drop an M4A file above — an iPhone voice memo, a GarageBand export or an iTunes track without DRM — and download an MP3 that plays in any player, car stereo or app. Converted on your device.',
    whyConvert: 'M4A is an MPEG-4 audio file, usually AAC. Apple devices use it everywhere, but some car stereos, older MP3 players, transcription services and upload forms only accept MP3.',
    formatComparison: 'M4A (AAC): slightly more efficient than MP3 — similar quality at a lower bitrate. Great support on Apple and Android, weaker on older hardware.\n\nMP3: older, universal. Every player since the 1990s reads it.',
    howItWorks: '1. Drop the M4A.\n\n2. Choose the MP3 bitrate: 192 kbps default; 96–128 kbps is fine for voice memos.\n\n3. Download the MP3.',
    qualityNotes: 'AAC to MP3 is a lossy-to-lossy conversion, so a little quality is lost; at 192 kbps it is inaudible for typical listening. Purchased tracks protected by DRM (old .m4p files) cannot be converted.',
    useCases: 'Sending iPhone Voice Memos to people or services that want MP3; playing Apple audio in a car stereo; submitting recordings to podcast hosts and transcription tools.',
    faq: [
      { question: 'Does it work with iPhone Voice Memos?', answer: 'Yes. Share the memo to Files, then choose it here. Voice Memos are M4A files.' },
      { question: 'Which bitrate for voice recordings?', answer: '96–128 kbps is plenty for speech and keeps files small.' },
      { question: 'Can I convert songs bought from iTunes?', answer: 'DRM-free M4A tracks, yes. Old protected .m4p files cannot be decoded.' },
      { question: 'Is my audio uploaded?', answer: 'No. It is decoded and encoded in your browser.' },
    ],
  },

  'mp4-to-gif': {
    title: 'MP4 to GIF — make a GIF from a video clip, no upload',
    metaDescription: 'Turn part of an MP4 into an animated GIF in your browser. Choose start/end, 10–24 fps and 320–800 px width. No upload.',
    intro: 'Drop a video above, choose the few seconds you want, set the frame rate and width, and download an animated GIF. The GIF is built on your device — the video is never uploaded.',
    whyConvert: 'GIFs autoplay silently almost everywhere — chats, e-mail, GitHub READMEs, docs and forums — without a player or a click. That makes them ideal for short demos and reactions.',
    formatComparison: 'MP4: efficient video compression, millions of colours, sound. Needs a player.\n\nGIF: animation of up to 256 colours per frame, no sound, and poor compression — a few seconds of GIF can outweigh a minute of MP4. Where a site accepts silent autoplay video, MP4 is smaller and looks better.',
    howItWorks: '1. Drop the video (MP4, MOV, WebM…).\n\n2. Set the start and end of the clip.\n\n3. Choose the frame rate (10, 15, 20 or 24 fps; 15 default) and width (320, 480, 640 or 800 px; 480 default).\n\n4. Build & Download the GIF.',
    qualityNotes: 'File size grows with length × width × frame rate. For chat, 480 px at 10–15 fps for 2–5 seconds is a good target. Gradients and skin tones can show banding because of the 256-colour limit.',
    useCases: 'Showing a UI bug or feature in an issue or README; reaction GIFs from your own clips; short product demos in e-mail; step-by-step tutorials.',
    faq: [
      { question: 'Why is my GIF so large?', answer: 'GIF compresses poorly. Reduce the length first, then the width, then the frame rate.' },
      { question: 'Is sound kept?', answer: 'No, GIF has no audio.' },
      { question: 'What frame rate should I use?', answer: '10–15 fps for screen recordings and reactions, 20–24 fps for smooth motion.' },
      { question: 'Does it add a watermark?', answer: 'Free exports carry a small, semi-transparent site mark in the corner; Pro removes it.' },
      { question: 'Can I make a GIF from an iPhone video?', answer: 'Yes. iPhone MOV files work the same way.' },
    ],
  },

  'gif-to-mp4': {
    title: 'GIF to MP4 — shrink GIFs into small videos',
    metaDescription: 'Convert animated GIF to MP4 in your browser. H.264 MP4 is usually far smaller than the GIF and accepted by social sites. No upload.',
    intro: 'Drop an animated GIF above and download an H.264 MP4. The MP4 is usually a fraction of the GIF’s size, plays everywhere, and is the format Instagram, TikTok and many other sites actually require. Converted on your device.',
    whyConvert: 'GIF is an old, inefficient animation format. Video codecs compress motion far better, so the same animation as MP4 loads faster and uses less data — which is why many sites convert GIFs to video behind the scenes.',
    formatComparison: 'GIF: up to 256 colours per frame, no sound, loops automatically, large files.\n\nMP4 (H.264): full colour, small files, universally supported; looping depends on the player.',
    howItWorks: '1. Drop the GIF.\n\n2. It is re-encoded with ffmpeg to H.264 MP4 with web-friendly settings (even dimensions, fast-start).\n\n3. Download the MP4.',
    qualityNotes: 'The MP4 cannot restore colours the GIF already discarded, but it will not reduce them further. There is no sound because GIFs have none. Transparent GIFs get a solid background, as MP4 has no transparency.',
    useCases: 'Posting animations on Instagram, TikTok or X; shrinking GIFs embedded on websites; sending animations in apps with low attachment limits.',
    faq: [
      { question: 'Why is the MP4 so much smaller?', answer: 'Video codecs store only what changes between frames and use far better compression than GIF.' },
      { question: 'Does it loop?', answer: 'The MP4 plays once; most players, websites and social apps can loop it.' },
      { question: 'What happens to transparency?', answer: 'MP4 has no alpha channel, so transparent areas become solid.' },
      { question: 'Is the GIF uploaded?', answer: 'No. ffmpeg runs in your browser.' },
    ],
  },
};

export function deepPairContent(slug: string): ConversionContentData | null {
  return DEEP_PAIR_COPY[slug] ?? null;
}
