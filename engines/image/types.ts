/**
 * Shared image-engine types. Kept dependency-free so both workers and UI can import.
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export interface EncodeOptions {
  /** 1-100 quality for lossy formats. Ignored by PNG. */
  quality?: number;
  /** 0-9 effort. Higher = smaller file, slower. WebP/AVIF only. */
  effort?: number;
  /** AVIF only: lossless mode. */
  lossless?: boolean;
}

export interface CodecStats {
  /** Decoded width in pixels. */
  width: number;
  /** Decoded height in pixels. */
  height: number;
  /** Output byte size. */
  bytes: number;
  /** Encode/decode wall time in ms. */
  ms: number;
}

export interface ResizeOptions {
  width: number;
  height: number;
  /** Algorithm: 'lanczos3' for photos, 'mitchell' for graphics, 'hqx' for pixel art. */
  method?: 'lanczos3' | 'mitchell' | 'catrom' | 'triangle' | 'hqx';
  /** Premultiply alpha before resize (avoids halo around transparent edges). */
  premultiply?: boolean;
  /** Linear-rgb resize (slower, more accurate). */
  linearRgb?: boolean;
}

export const FORMAT_TO_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export const FORMAT_TO_EXT: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png:  'png',
  webp: 'webp',
  avif: 'avif',
};
