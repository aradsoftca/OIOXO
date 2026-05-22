/**
 * Flat, serializable registry of image operations (name → pure function).
 *
 * Used by the image Web Worker so a tool can request an operation by NAME +
 * a plain params object (both structured-cloneable), instead of shipping a
 * closure. Every op takes a fresh ImageData + params and returns a new
 * ImageData — no shared mutation, safe to run off the main thread.
 */

import * as filters from './filters';
import * as transforms from './transforms';

type Op = (src: ImageData, params: Record<string, unknown>) => ImageData | Promise<ImageData>;

export const OPS: Record<string, Op> = {
  // filters
  grayscale:  (s, p) => filters.grayscale(s, p as { amount?: number }),
  invert:     (s, p) => filters.invert(s, p as { amount?: number }),
  sepia:      (s, p) => filters.sepia(s, p as { amount?: number }),
  brightness: (s, p) => filters.brightness(s, p as { value?: number }),
  contrast:   (s, p) => filters.contrast(s, p as { value?: number }),
  saturation: (s, p) => filters.saturation(s, p as { value?: number }),
  hue:        (s, p) => filters.hue(s, p as { angle?: number }),
  gamma:      (s, p) => filters.gamma(s, p as { value?: number }),
  threshold:  (s, p) => filters.threshold(s, p as { value?: number }),
  vintage:    (s, p) => filters.vintage(s, p as { amount?: number }),
  sharpen:    (s, p) => filters.sharpen(s, p as { amount?: number }),
  emboss:     (s) => filters.emboss(s),
  edge:       (s) => filters.edge(s),
  // transforms
  flip:         (s, p) => transforms.flip(s, p as { horizontal?: boolean; vertical?: boolean }),
  rotate:       (s, p) => transforms.rotate(s, p as Parameters<typeof transforms.rotate>[1]),
  pixelate:     (s, p) => transforms.pixelate(s, p as { size: number }),
  vignette:     (s, p) => transforms.vignette(s, p as Parameters<typeof transforms.vignette>[1]),
  border:       (s, p) => transforms.border(s, p as Parameters<typeof transforms.border>[1]),
  roundCorners: (s, p) => transforms.roundCorners(s, p as { radius: number }),
  crop:         (s, p) => transforms.crop(s, p as Parameters<typeof transforms.crop>[1]),
};

export type OpName = keyof typeof OPS;
