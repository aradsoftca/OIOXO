import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { rateLimited, clientIp } from '@/lib/net-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Self-hosted speed test. GET streams N incompressible bytes (download test);
// POST drains the request body and reports how many bytes it received (upload
// test). The client times each and computes Mbps. No third-party service.

const CHUNK = crypto.randomBytes(256 * 1024); // 256 KB reusable random block
const MAX_BYTES = 60 * 1024 * 1024;           // 60 MB cap per request

export async function GET(req: Request) {
  // Per-IP rate limit. Without this, a misuser could repeatedly request
  // 60 MB chunks and consume server egress bandwidth.
  if (rateLimited(clientIp(req.headers), 6)) {
    return new Response('Too many requests — slow down.', { status: 429 });
  }
  const url = new URL(req.url);
  const bytes = Math.min(MAX_BYTES, Math.max(0, Number(url.searchParams.get('bytes')) || 0));
  let sent = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent >= bytes) { controller.close(); return; }
      const n = Math.min(CHUNK.length, bytes - sent);
      controller.enqueue(n === CHUNK.length ? CHUNK : CHUNK.subarray(0, n));
      sent += n;
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes),
      'cache-control': 'no-store, no-cache, must-revalidate',
      'content-encoding': 'identity', // never gzip — would skew the measurement
    },
  });
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req.headers), 6)) {
    return NextResponse.json({ error: 'Too many requests — slow down.' }, { status: 429 });
  }
  let received = 0;
  const reader = req.body?.getReader();
  if (reader) {
    // Wall-clock cap so a slowloris uploader (1 byte every 30s) can't tie up
    // a request handler indefinitely — MAX_BYTES alone doesn't help if bytes
    // never arrive. 60s is plenty for a legitimate 60MB upload test.
    const deadline = Date.now() + 60_000;
    try {
      for (;;) {
        const left = deadline - Date.now();
        if (left <= 0) { await reader.cancel().catch(() => {}); break; }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const tick = new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new Error('timeout')), left);
        });
        let step: { done: boolean; value?: Uint8Array };
        try {
          step = await Promise.race([reader.read(), tick]);
        } catch {
          await reader.cancel().catch(() => {});
          break;
        } finally {
          if (timer) clearTimeout(timer);
        }
        if (step.done) break;
        if (step.value) received += step.value.length;
        if (received > MAX_BYTES) {
          // Cancel the underlying stream so the client stops uploading and
          // the server stops buffering — without this, the body keeps
          // streaming in the background after we exit the loop.
          await reader.cancel().catch(() => {});
          break;
        }
      }
    } finally {
      try { reader.releaseLock(); } catch { /* */ }
    }
  }
  return NextResponse.json({ received }, { headers: { 'cache-control': 'no-store' } });
}
