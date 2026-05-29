/**
 * On-device translation via Bergamot — Mozilla's client-side MT engine, the
 * light+powerful path when the browser has no built-in Translator API
 * (Firefox / Safari / older). PROVEN in a real browser (en↔fa, de→en correct).
 *
 *  - WASM runtime (~5MB) ships as a STATIC asset in /bergamot, loaded once and
 *    ONLY when a non-English language is actually used (lazy). Single-threaded,
 *    so no COOP/COEP cross-origin-isolation headers are needed.
 *  - INT8 models (~15-23MB/pair) stream from our HF model repo and cache in the
 *    browser. Nothing leaves the device per translation — only one-time model
 *    downloads, exactly like any model weight. Auto-pivots through English, so
 *    any pair among the supported languages works.
 *
 * Degrades to null on anything (SSR, unsupported language, load/translate
 * failure) so the caller falls through to the heavier Opus-MT models.
 */

// The vendored runtime (public/bergamot/translator.js) is imported at RUNTIME as
// a native ES module — not bundled — so its internal `new Worker(new URL(...))`
// and wasm fetch resolve against /bergamot/ as plain static assets, on any
// bundler. The model registry lives in our HF repo (CORS-enabled, like the
// writer model); swap REGISTRY to an R2 URL to change hosts — one line.
const RUNTIME_URL = '/bergamot/translator.js';
const REGISTRY = 'https://huggingface.co/payam1394/oioxo-bergamot/resolve/main/registry.json';

// Languages our model repo provides (the Mozilla sandbox set). Pivoting through
// English covers any pair among these; anything else falls back to Opus. This is
// a static property of the repo, not a per-request rule.
const SUPPORTED = new Set(['bg', 'cs', 'de', 'es', 'et', 'fr', 'it', 'pl', 'pt', 'fa', 'nl', 'ru', 'uk', 'is', 'nn', 'nb']);

/** Is this pair served by Bergamot (so we shouldn't waste the wasm load on it)? */
function bergamotCovers(from: string, to: string): boolean {
  if (from === to) return false;
  const sides = [from, to].filter((l) => l !== 'en');
  if (!sides.length) return false; // en→en
  return sides.every((l) => SUPPORTED.has(l));
}

interface BergTranslator {
  translate(req: { from: string; to: string; text: string; html?: boolean }): Promise<{ target: { text: string } }>;
}

let _translator: Promise<BergTranslator | null> | null = null;

function loadTranslator(): Promise<BergTranslator | null> {
  if (_translator) return _translator;
  const p = (async () => {
    try {
      // Native runtime import of the static asset — kept out of the bundle so the
      // worker/wasm paths stay relative to /bergamot/. (webpackIgnore + a
      // template string defeats both webpack and turbopack static analysis.)
      const url = RUNTIME_URL;
      const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ url);
      const Ctor = mod.LatencyOptimisedTranslator;
      if (!Ctor) return null;
      return new Ctor({ registryUrl: REGISTRY, cacheSize: 0 }) as BergTranslator;
    } catch {
      return null;
    }
  })();
  _translator = p;
  // Drop the cache on null/reject so a transient asset-load failure doesn't
  // permanently disable Bergamot for the rest of the session.
  p.then((v) => { if (v == null && _translator === p) _translator = null; })
   .catch(() => { if (_translator === p) _translator = null; });
  return p;
}

/** Translate `text` from→to on-device. Null if unsupported / unavailable. */
export async function bergamotTranslate(text: string, from: string, to: string): Promise<string | null> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null; // browser only
  if (!bergamotCovers(from, to)) return null;
  try {
    const t = await loadTranslator();
    if (!t) return null;
    const res = await t.translate({ from, to, text, html: false });
    const out = res?.target?.text?.trim();
    return out || null;
  } catch {
    return null;
  }
}
