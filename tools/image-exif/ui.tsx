'use client';

import * as React from 'react';
import { Upload, Copy, Download, MapPin, Camera, Aperture, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useImageDrop } from '@/lib/compute/useImageDrop';

interface Section {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: { key: string; value: string }[];
}

function fmt(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toLocaleString();
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  }
  return String(value);
}

export default function ImageExifTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState('');
  const [data, setData] = React.useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const loadFile = async (next: File) => {
    if (!next.type.startsWith('image/') && !/\.(heic|tif|tiff)$/i.test(next.name)) return;
    setBusy(true); setError(''); setData(null);
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(next));
    setFile(next);
    try {
      const exifr = await import('exifr');
      const out = await exifr.parse(next, {
        tiff: true,
        exif: true,
        gps: true,
        interop: true,
        xmp: true,
        iptc: true,
        jfif: true,
        ihdr: true,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
      });
      setData(out ?? {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = React.useCallback(() => {
    setUrl((u) => { if (u) URL.revokeObjectURL(u); return ''; });
    setFile(null);
    setData(null);
    setError('');
  }, []);

  // Clipboard paste (screenshot → metadata), drag-anywhere hover state, Esc to clear.
  const { dragging, dropZone } = useImageDrop({
    onFile: (f) => void loadFile(f),
    onClear: file ? clear : undefined,
  });

  const sections: Section[] = React.useMemo(() => {
    if (!data) return [];
    const camera: { key: string; value: string }[] = [];
    const lens: { key: string; value: string }[] = [];
    const exposure: { key: string; value: string }[] = [];
    const gps: { key: string; value: string }[] = [];
    const other: { key: string; value: string }[] = [];

    const cameraKeys = ['Make', 'Model', 'Software', 'DateTimeOriginal', 'CreateDate', 'ModifyDate'];
    const lensKeys = ['LensMake', 'LensModel', 'FocalLength', 'FocalLengthIn35mmFormat', 'MaxApertureValue'];
    const exposureKeys = ['FNumber', 'ApertureValue', 'ExposureTime', 'ISO', 'ExposureBiasValue', 'ExposureProgram', 'MeteringMode', 'WhiteBalance', 'Flash', 'ColorSpace'];
    const gpsKeys = ['latitude', 'longitude', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSDateStamp', 'GPSTimeStamp'];

    for (const [k, v] of Object.entries(data)) {
      const value = fmt(v);
      if (!value) continue;
      if (cameraKeys.includes(k)) camera.push({ key: k, value });
      else if (lensKeys.includes(k)) lens.push({ key: k, value });
      else if (exposureKeys.includes(k)) exposure.push({ key: k, value });
      else if (gpsKeys.includes(k)) gps.push({ key: k, value });
      else other.push({ key: k, value });
    }

    const out: Section[] = [];
    if (camera.length) out.push({ title: 'Camera', icon: Camera, rows: camera });
    if (lens.length) out.push({ title: 'Lens', icon: Aperture, rows: lens });
    if (exposure.length) out.push({ title: 'Exposure', icon: Aperture, rows: exposure });
    if (gps.length) out.push({ title: 'Location', icon: MapPin, rows: gps });
    if (other.length) out.push({ title: 'Other', icon: Info, rows: other });
    return out;
  }, [data]);

  const lat = (data?.latitude as number | undefined) ?? (data?.GPSLatitude as number | undefined);
  const lon = (data?.longitude as number | undefined) ?? (data?.GPSLongitude as number | undefined);

  const copyJson = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadJson = () => {
    if (!data || !file) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = file.name.replace(/\.[^.]+$/, '') + '.exif.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  return (
    <div className="space-y-4">
      {!file && (
        <div
          {...dropZone}
          className={cn(
            'flex aspect-[5/2] items-center justify-center border border-dashed bg-[var(--color-surface-1)] transition-colors',
            dragging ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)]/[0.06]' : 'border-black/[0.18]',
          )}
        >
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-3 text-[13px] text-[var(--color-fg-muted)]">
            <Upload className="h-5 w-5" />
            {dragging ? 'Drop to read its metadata' : 'Drop, paste or click to read its metadata'}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
        </div>
      )}

      {file && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <span className="text-[12px] font-semibold">{file.name}</span>
              <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{(file.size / 1024).toFixed(0)} KB</span>
              {data && Object.keys(data).length > 0 && (
                <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{Object.keys(data).length} tags</span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={copyJson} disabled={!data}
                  className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                  <Copy className="h-3 w-3" />
                  {copied ? 'Copied' : 'Copy JSON'}
                </button>
                <button type="button" onClick={downloadJson} disabled={!data}
                  className="flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                  <Download className="h-3 w-3" />
                  .json
                </button>
                <button type="button" onClick={() => { setFile(null); setData(null); }}
                  className="text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                  Change
                </button>
              </div>
            </div>

            {url && (
              <div className="overflow-hidden border border-black/[0.08] bg-black/5">
                <img src={url} alt="" className="block h-auto w-full max-h-[400px] object-contain" />
              </div>
            )}

            {lat != null && lon != null && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-[12px] text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
              >
                <MapPin className="h-4 w-4 text-[var(--color-cat-gis)]" />
                <span className="font-mono">{Number(lat).toFixed(6)}, {Number(lon).toFixed(6)}</span>
                <span className="ml-auto text-[var(--color-fg-muted)]">Open in map ↗</span>
              </a>
            )}

            {busy && (
              <div className="flex items-center gap-2 text-[12px] text-[var(--color-fg-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Reading metadata…
              </div>
            )}

            {error && <div className="text-[12px] text-red-600">{error}</div>}

            {data && Object.keys(data).length === 0 && (
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 text-[12px] text-[var(--color-fg-subtle)]">
                No EXIF data found in this image. Some apps strip metadata when sharing.
              </div>
            )}
          </div>

          <aside className="space-y-3">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="border border-black/[0.08] bg-[var(--color-surface-1)]">
                  <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-2">
                    <Icon className="h-3.5 w-3.5 text-[var(--color-cat-image)]" />
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{s.title}</div>
                  </div>
                  <dl className="px-4 py-2 space-y-1">
                    {s.rows.map((r) => (
                      <div key={r.key} className="grid grid-cols-[1fr_auto] items-baseline gap-3">
                        <dt className="truncate text-[11px] text-[var(--color-fg-muted)]">{r.key}</dt>
                        <dd className="text-right font-mono text-[11px] text-[var(--color-fg)]">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </aside>
        </div>
      )}
    </div>
  );
}
