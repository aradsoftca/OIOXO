/**
 * Main-thread client for the 3D-model engine. Offloads the Assimp WASM
 * conversion to a worker so the page stays responsive; falls back to the
 * in-engine path when Workers aren't available.
 */
import { workerOnce, canUseWorker } from '@/lib/compute/workerOnce';
import { loadProtectedWorker } from '@/lib/protect/protected-worker';
import { convertModel, type Model3dResult, type Model3dTarget } from './index';

export async function convertModelInWorker(
  files: { name: string; data: Uint8Array }[],
  target: Model3dTarget,
): Promise<Model3dResult> {
  if (!canUseWorker()) return convertModel(files, target);
  const worker = await loadProtectedWorker('model3d');
  // Send copies so we don't detach the caller's buffers; transfer the copies.
  const payload = files.map((f) => ({ name: f.name, data: f.data.slice().buffer }));
  const res = await workerOnce<{ files: { name: string; data: ArrayBuffer }[] }>(
    worker,
    { files: payload, target },
    payload.map((f) => f.data),
  );
  return { files: res.files.map((f) => ({ name: f.name, data: new Uint8Array(f.data) })) };
}
