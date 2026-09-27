/**
 * CAD worker — runs the OpenCASCADE WASM tessellation off the main thread, so
 * reading a big STEP/IGES file never freezes the page. Reuses the pure engine
 * functions (no DOM is touched, so they're worker-safe).
 */
import { convertCadBuffer, type CadInputKind, type CadTarget } from './index';

interface Req { buffer: ArrayBuffer; kind: CadInputKind; target: CadTarget }

const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent) => void) | null };

ctx.onmessage = async (e: MessageEvent<Req>) => {
  // loadProtectedWorker posts {__wmInit} first. Treating it as a job threw
  // (undefined.map / bad buffer) and that error was taken as the reply, so every
  // live CAD/3D conversion failed. Ignore it — only a real request gets a reply.
  if ((e.data as { __wmInit?: boolean } | null)?.__wmInit) return;
  try {
    const { buffer, kind, target } = e.data;
    const { text, stats } = await convertCadBuffer(new Uint8Array(buffer), kind, target);
    ctx.postMessage({ type: 'done', text, stats });
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as Error).message || String(err) });
  }
};
