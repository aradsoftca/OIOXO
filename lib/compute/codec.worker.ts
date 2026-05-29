/**
 * Image codec worker — runs the synchronous WASM decode/encode off the main
 * thread for any tool that calls engines/image decode()/encode() directly
 * (resize, crop, convert-format, convert pairs, batch-convert…). Uses the
 * *Local variants so there's no re-routing back into a worker.
 */

import { decodeLocal, encodeLocal, setWatermark } from '../../engines/image/codec';
import type { EncodeOptions, ImageFormat } from '../../engines/image/types';

type In =
  | { type: 'decode'; id: number; blob: Blob }
  | { type: 'encode'; id: number; buffer: ArrayBuffer; width: number; height: number; format: ImageFormat; opts: EncodeOptions };

const ctx = self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void; onmessage: ((e: MessageEvent) => void) | null };
const post = (m: Record<string, unknown>, t: Transferable[] = []) => ctx.postMessage(m, t);

ctx.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  // Init from the loader: Pro session → turn the engine's brand stamp OFF (encodeLocal
  // watermarks by default, so free works with no message). Produces no output.
  if ((m as { __wmInit?: boolean }).__wmInit) { if ((m as { pro?: boolean }).pro) setWatermark(null); return; }
  try {
    if (m.type === 'decode') {
      const { data, format } = await decodeLocal(m.blob);
      const buf = data.data.buffer;
      post({ type: 'decoded', id: m.id, buffer: buf, width: data.width, height: data.height, format }, [buf]);
    } else if (m.type === 'encode') {
      const img = new ImageData(new Uint8ClampedArray(m.buffer), m.width, m.height);
      const { blob, bytes } = await encodeLocal(img, m.format, m.opts);
      const ab = await blob.arrayBuffer();
      post({ type: 'encoded', id: m.id, buffer: ab, mime: blob.type, bytes }, [ab]);
    }
  } catch (err) {
    post({ type: 'error', id: m.id, message: (err as Error).message || String(err) });
  }
};
