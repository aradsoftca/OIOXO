/**
 * Main-thread client for the CAD engine. Offloads the heavy WASM read to a
 * worker (page stays responsive); falls back to the in-engine path if Workers
 * aren't available.
 */
import { workerOnce, canUseWorker } from '@/lib/compute/workerOnce';
import { convertCadBuffer, type CadConvertResult, type CadInputKind, type CadTarget } from './index';

export async function convertCadInWorker(file: File, kind: CadInputKind, target: CadTarget): Promise<CadConvertResult> {
  const buffer = await file.arrayBuffer();
  if (!canUseWorker()) return convertCadBuffer(new Uint8Array(buffer), kind, target);
  const worker = new Worker(new URL('./cad.worker.ts', import.meta.url));
  const { text, stats } = await workerOnce<{ text: string; stats: CadConvertResult['stats'] }>(
    worker, { buffer, kind, target }, [buffer],
  );
  return { text, stats };
}
