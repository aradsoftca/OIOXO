import { BRAND } from '@/lib/brand';
/** Starter blog content. Each post is plain data → rendered server-side. */

export interface Block { type: 'p' | 'h2'; text: string }
export interface Post {
  slug: string;
  title: string;
  date: string;       // ISO
  excerpt: string;
  body: Block[];
}

export const POSTS: Post[] = [
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
      { type: 'h2', text: 'The one exception' },
      { type: 'p', text: 'For the heaviest jobs you can opt into “Pro Quality,” which uses a processing server for that single file over an encrypted connection. It’s explicit, optional, and the file is discarded immediately after.' },
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
