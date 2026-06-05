/**
 * jsonp — the universal CORS bypass.
 *
 * A browser will NOT let `fetch()` read a cross-origin response unless the server
 * sends CORS headers. But a `<script>` tag is exempt from CORS entirely — so any
 * API that wraps its JSON in a callback (`?jsonp=fn` → `fn({...})`) can be read
 * from the user's device with NO proxy, NO server of ours, NO install. Reddit,
 * StackExchange and many others support this.
 *
 * Isomorphic: in the browser we inject a real <script> (the actual CORS bypass);
 * in Node/SSR there is no CORS, so we plain-fetch and strip the `/**​/fn(...)`
 * wrapper. Same data either way, so the engine code path is identical.
 */

const isBrowser = typeof document !== 'undefined' && typeof window !== 'undefined';

export interface JsonpOpts {
  /** The callback query-param name the API expects (Reddit/SE use `jsonp`). */
  param?: string;
  /** Extra query params to append (e.g. `raw_json=1`). */
  extra?: Record<string, string>;
  timeoutMs?: number;
}

function withParams(url: string, params: Record<string, string>): string {
  const u = url.includes('?') ? url : url + '?';
  const tail = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return u + (u.endsWith('?') ? '' : '&') + tail;
}

/** Fetch JSON cross-origin via JSONP. Resolves the parsed object (or rejects). */
export function jsonpGet<T = unknown>(url: string, opts: JsonpOpts = {}): Promise<T> {
  const { param = 'jsonp', extra = {}, timeoutMs = 12000 } = opts;

  // Node / SSR: no CORS to dodge — fetch and strip the callback wrapper.
  if (!isBrowser) {
    const u = withParams(url, { ...extra, [param]: 'cb' });
    return fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; oioxo/1.0)' } })
      .then((r) => r.text())
      .then((t) => {
        const m = t.match(/^\/\*\*\/[\w$.]+\(([\s\S]*)\)\s*;?\s*$/);
        return JSON.parse(m ? m[1] : t) as T;
      });
  }

  // Browser: a real <script> tag — exempt from CORS.
  return new Promise<T>((resolve, reject) => {
    const cbName = `__oioxo_jsonp_${Math.random().toString(36).slice(2)}`;
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      done = true;
      delete w[cbName];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => { if (!done) { cleanup(); reject(new Error('jsonp timeout')); } }, timeoutMs);
    w[cbName] = (data: T) => { if (!done) { const d = data; cleanup(); resolve(d); } };
    script.onerror = () => { if (!done) { cleanup(); reject(new Error('jsonp load error')); } };
    script.src = withParams(url, { ...extra, [param]: cbName });
    document.head.appendChild(script);
  });
}
