/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lazy loader for OpenCV.js, served from our own origin at /vendor/opencv.js
 * (same-origin so it works under our cross-origin-isolation headers). Used by
 * the document scanner and object remover. The ~8 MB WASM only loads when one
 * of those tools opens, and only once per session.
 */

let readyPromise: Promise<any> | null = null;

export function loadOpenCv(): Promise<any> {
  if (readyPromise) return readyPromise;
  const p = new Promise<any>((resolve, reject) => {
    const w = window as any;
    // opencv.js 4.x's Module is a THENABLE whose then() calls back with itself.
    // Resolving a Promise with it makes the engine unwrap `.then` forever: the
    // page froze (desktop) and the Android app's WebView renderer crashed on
    // image-doc-scan. Strip `then` so the resolved value is the plain module.
    const plain = (m: any) => { if (m && typeof m.then === 'function') { try { delete m.then; } catch { m.then = undefined; } } return m; };
    const done = () => resolve(plain(w.cv));
    if (w.cv && w.cv.Mat) return done();

    const finish = () => {
      const cv = w.cv;
      if (!cv) return reject(new Error('OpenCV failed to load'));
      // Different builds signal readiness differently — handle all.
      if (cv.Mat) return done();
      if (typeof cv.then === 'function') { cv.then((m: any) => { w.cv = plain(m); resolve(w.cv); }); return; }
      // Cancel the poll once onRuntimeInitialized fires — without this, the
      // 50ms interval kept running for the whole 25s timeout even after
      // OpenCV was ready, burning ~500 polls per session.
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (w.cv && w.cv.Mat) { clearInterval(iv); done(); }
        else if (Date.now() - t0 > 25000) { clearInterval(iv); reject(new Error('OpenCV init timed out')); }
      }, 50);
      cv.onRuntimeInitialized = () => { clearInterval(iv); done(); };
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-opencv]');
    if (existing) { existing.addEventListener('load', finish); existing.addEventListener('error', () => reject(new Error('OpenCV failed to load'))); return; }

    const script = document.createElement('script');
    script.src = '/vendor/opencv.js';
    script.async = true;
    script.dataset.opencv = '1';
    script.onload = finish;
    script.onerror = () => reject(new Error('Could not load OpenCV.'));
    document.head.appendChild(script);
  });
  // Drop the cache on failure so a transient script-load drop (offline blip,
  // brief 502 from the static origin) doesn't permanently break OpenCV-backed
  // tools for the rest of the page lifetime.
  p.catch(() => { readyPromise = null; });
  readyPromise = p;
  return p;
}
