'use client';
/**
 * Composite a "Powered by xonvert.com" badge INTO an outgoing video stream
 * (video call / screen share), so it shows on the remote side and in recordings —
 * not just as a local UI chip. Free only; Pro publishes the raw stream.
 *
 * SAFETY: this can never break a call. It only swaps to the watermarked canvas
 * track AFTER the source video is confirmed playing a real frame (guarded by a
 * timeout); on `enabled === false`, no video, or ANY error/timeout it returns the
 * ORIGINAL stream unchanged. Worst case = no badge, never a black/frozen feed.
 */
import { WM_POWERED_BY } from './config';

export interface WrappedStream {
  stream: MediaStream;
  stop: () => void;
}

const noop = () => {};

export async function watermarkVideoStream(
  stream: MediaStream,
  enabled: boolean,
): Promise<WrappedStream> {
  const vtrack = stream.getVideoTracks()[0];
  if (!enabled || !vtrack || typeof document === 'undefined') return { stream, stop: noop };

  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([vtrack]);

    // Wait for a real frame (or bail to the original stream after 2.5s).
    const ready = await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
      video.onloadeddata = () => { void video.play().then(() => finish(video.videoWidth > 0)).catch(() => finish(false)); };
      void video.play().catch(() => {});
      setTimeout(() => finish(video.videoWidth > 0), 2500);
    });
    if (!ready || !video.videoWidth) { try { video.srcObject = null; } catch { /* */ } return { stream, stop: noop }; }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { stream, stop: noop };

    let raf = 0;
    const draw = () => {
      try {
        const w = video.videoWidth, h = video.videoHeight;
        if (w) {
          if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
          ctx.drawImage(video, 0, 0, w, h);
          const fp = Math.max(13, Math.round(w * 0.018));
          const pad = Math.round(w * 0.015);
          ctx.font = `600 ${fp}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.globalAlpha = 0.72;
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = Math.max(2, Math.round(fp * 0.2));
          ctx.shadowOffsetY = 1;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(WM_POWERED_BY, w - pad, h - pad);
          ctx.globalAlpha = 1;
          ctx.shadowColor = 'transparent';
        }
      } catch { /* keep going */ }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const out = canvas.captureStream(24);
    // Carry the original audio across unchanged.
    for (const a of stream.getAudioTracks()) out.addTrack(a);

    return {
      stream: out,
      stop: () => {
        cancelAnimationFrame(raf);
        try { video.srcObject = null; } catch { /* */ }
        // Stop the canvas-capture tracks too. Cancelling the RAF only halts
        // new frames being drawn; the captured tracks stay live until
        // explicitly stopped, leaking until the next GC.
        try { for (const t of out.getTracks()) t.stop(); } catch { /* */ }
      },
    };
  } catch {
    return { stream, stop: noop };
  }
}
