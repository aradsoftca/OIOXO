import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { buildMeta } from '@/lib/seo/meta';

export const metadata: Metadata = buildMeta({
  path: '/formats',
  title: `Supported file formats — ${BRAND}`,
  description: `Every file format ${BRAND} can convert, compress, view, and edit — images, audio, video, documents, ebooks, archives, 3D, fonts, and subtitles.`,
  keywords: [
    'supported file formats',
    'png jpg webp avif conversion',
    'mp3 wav flac ogg conversion',
    'mp4 webm mov mkv conversion',
    'pdf docx xlsx pptx conversion',
    'browser file format support',
  ],
});

const GROUPS: { cat: string; colorVar: string; note: string; formats: string[] }[] = [
  { cat: 'Images', colorVar: '--color-cat-image', note: 'Convert, compress, resize, and edit.', formats: ['PNG', 'JPG', 'WEBP', 'AVIF', 'GIF', 'SVG', 'BMP', 'ICO', 'TIFF', 'HEIC'] },
  { cat: 'Audio', colorVar: '--color-cat-audio', note: 'Convert, trim, merge, normalize.', formats: ['MP3', 'WAV', 'OGG', 'FLAC', 'M4A', 'AAC', 'OPUS'] },
  { cat: 'Video', colorVar: '--color-cat-video', note: 'Transcode, trim, extract audio, to-GIF.', formats: ['MP4', 'WEBM', 'MOV', 'MKV', 'GIF'] },
  { cat: 'Documents', colorVar: '--color-cat-pdf', note: 'Merge, split, convert, view.', formats: ['PDF', 'DOCX', 'XLSX', 'PPTX', 'ODT', 'CSV', 'TXT', 'MD'] },
  { cat: 'Ebooks', colorVar: '--color-cat-text', note: 'Convert between reader formats.', formats: ['EPUB', 'MOBI', 'AZW3', 'FB2'] },
  { cat: 'Archives', colorVar: '--color-cat-convert', note: 'Create and extract.', formats: ['ZIP', 'TAR', '7Z', 'GZ', 'RAR'] },
  { cat: '3D & CAD', colorVar: '--color-cat-gis', note: 'Convert and inspect models.', formats: ['STL', 'OBJ', 'GLTF', 'GLB', 'STEP', 'DXF'] },
  { cat: 'Fonts', colorVar: '--color-cat-font', note: 'Convert, subset, inspect.', formats: ['TTF', 'OTF', 'WOFF', 'WOFF2'] },
  { cat: 'Subtitles', colorVar: '--color-cat-subtitle', note: 'Convert, sync, clean.', formats: ['SRT', 'VTT', 'ASS', 'SUB'] },
];

export default function FormatsPage() {
  return (
    <div className="mx-auto w-[min(1000px,96vw)] py-6">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Reference</div>
      <h1 className="text-[28px] font-bold tracking-tight">Supported formats</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
        {BRAND} works with hundreds of formats across these families — all processed in your browser.
        Head to the <Link href="/convert" className="text-[var(--brand-1)] hover:underline">converter</Link> to
        see exactly what a given file can become, or browse <Link href="/tools" className="text-[var(--brand-1)] hover:underline">all tools</Link>.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.cat} className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3" style={{ background: `var(${g.colorVar})` }} />
              <h2 className="text-[15px] font-bold tracking-tight text-[var(--color-fg)]">{g.cat}</h2>
            </div>
            <p className="mt-1 text-[12px] text-[var(--color-fg-muted)]">{g.note}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {g.formats.map((f) => (
                <span key={f} className="border border-black/[0.08] bg-[var(--color-canvas)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-fg)]">{f}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-[12px] text-[var(--color-fg-subtle)]">
        Don&apos;t see your format? Drop the file on the <Link href="/convert" className="text-[var(--brand-1)] hover:underline">converter</Link> — it detects the type and shows every available target.
      </p>
    </div>
  );
}
