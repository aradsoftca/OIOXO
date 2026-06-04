export type ImageFormat = 'png' | 'jpeg' | 'webp';

export async function canvasToBlob(c: HTMLCanvasElement, fmt: ImageFormat = 'png', quality = 0.92): Promise<Blob> {
  const mime = fmt === 'png' ? 'image/png' : fmt === 'jpeg' ? 'image/jpeg' : 'image/webp';
  return new Promise((res, rej) => {
    c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), mime, quality);
  });
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 60s defer — 1s was wildly too short; mobile Safari/Firefox routinely
  // open the download dialog 2-5s after the click, then abort because the
  // blob URL is already revoked. This is the studios' shared helper, so
  // every studio export went through here with the same broken timing.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function safeFilename(s: string): string {
  return s.replace(/[\/\\?%*:|"<>]/g, '_').slice(0, 120) || 'untitled';
}
