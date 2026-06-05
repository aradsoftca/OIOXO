/**
 * oioxo engine: QR code generation
 *
 * Wraps the same `qrcode` npm lib that xonvert's /generators/qr-code page
 * uses, so the inline preview rendered in oioxo search matches the full
 * tool exactly. Lib loaded on demand from jsDelivr (same CDN policy used
 * for our other vendor assets — see reference_wasm_glue_bundling).
 *
 * Exports a single function:
 *   generateQR(text, { size?, margin?, ecc?, dark?, light? }) -> Promise<string dataURL>
 *
 * Designed to be loaded as a classic <script src> (not ESM) so it can be
 * inlined / encrypted by the same bundle pipeline that protects the rest
 * of the search engine code. Attaches itself to window.oioxoEngines.qr.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoEngines = window.oioxoEngines || {};
  if (window.oioxoEngines.qr) return; // idempotent

  const CDN = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';
  let loading = null;

  function loadLib(){
    if (window.QRCode && typeof window.QRCode.toDataURL === 'function') {
      return Promise.resolve(window.QRCode);
    }
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        if (window.QRCode && typeof window.QRCode.toDataURL === 'function') resolve(window.QRCode);
        else reject(new Error('qrcode lib loaded but global missing'));
      };
      s.onerror = () => reject(new Error('failed to load qrcode lib'));
      document.head.appendChild(s);
    });
    return loading;
  }

  async function generateQR(text, opts){
    if (!text || typeof text !== 'string') throw new Error('text required');
    const QR = await loadLib();
    const o = opts || {};
    return QR.toDataURL(text, {
      width: o.size || 256,
      margin: typeof o.margin === 'number' ? o.margin : 2,
      errorCorrectionLevel: o.ecc || 'H',
      color: {
        dark: o.dark || '#000000',
        light: o.light || '#ffffff',
      },
    });
  }

  window.oioxoEngines.qr = { generateQR, loadLib };
})();
