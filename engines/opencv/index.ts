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
  readyPromise = new Promise<any>((resolve, reject) => {
    const w = window as any;
    const done = () => resolve(w.cv);
    if (w.cv && w.cv.Mat) return done();

    const finish = () => {
      const cv = w.cv;
      if (!cv) return reject(new Error('OpenCV failed to load'));
      // Different builds signal readiness differently — handle all.
      if (cv.Mat) return done();
      if (typeof cv.then === 'function') { cv.then((m: any) => { w.cv = m; resolve(m); }); return; }
      cv.onRuntimeInitialized = done;
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (w.cv && w.cv.Mat) { clearInterval(iv); done(); }
        else if (Date.now() - t0 > 25000) { clearInterval(iv); reject(new Error('OpenCV init timed out')); }
      }, 50);
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
  return readyPromise;
}
