/**
 * 3D-model worker — runs the Assimp WASM conversion off the main thread so
 * converting a large/complex model never freezes the page. Pure WASM + bytes,
 * no DOM, so the engine function is worker-safe.
 */
import { convertModel, type Model3dTarget } from './index';

interface Req { files: { name: string; data: ArrayBuffer }[]; target: Model3dTarget }

const ctx = self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void; onmessage: ((e: MessageEvent) => void) | null };

ctx.onmessage = async (e: MessageEvent<Req>) => {
  try {
    const inputs = e.data.files.map((f) => ({ name: f.name, data: new Uint8Array(f.data) }));
    const out = await convertModel(inputs, e.data.target);
    // Copy each output OUT of the WASM heap into its own ArrayBuffer before
    // transferring — f.data may be a view into the heap, and transferring that
    // would detach (corrupt) the module. .slice() gives a standalone copy.
    const files = out.files.map((f) => ({ name: f.name, data: f.data.slice().buffer }));
    const transfer = files.map((f) => f.data);
    ctx.postMessage({ type: 'done', files }, transfer);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as Error).message || String(err) });
  }
};
