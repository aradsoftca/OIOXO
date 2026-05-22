/**
 * SSRF-safe outbound fetch for the self-hosted network/SEO tools.
 *
 * The browser can't fetch arbitrary cross-origin URLs (CORS), so these tools
 * fetch from OUR server instead. That makes the server a proxy — abuse-prone —
 * so we:
 *   - only allow http/https,
 *   - resolve every hop (including redirects) and REFUSE private/internal IPs
 *     via the same guard the socket tools use (resolvePublic),
 *   - cap response size and wall-clock time,
 *   - never auto-follow redirects blindly (we re-validate each Location).
 */

import { resolvePublic } from '@/lib/net-guard';

export interface FetchResult {
  finalUrl: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
}

function parseUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error('Enter a valid http(s) URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed.');
  }
  return u;
}

export async function guardedFetch(
  rawUrl: string,
  opts: { method?: 'GET' | 'HEAD'; maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<FetchResult> {
  const { method = 'GET', maxBytes = 2_000_000, timeoutMs = 9000, maxRedirects = 5 } = opts;

  let url = parseUrl(rawUrl);
  const deadline = Date.now() + timeoutMs;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // SSRF guard: throws if the host resolves to a private / reserved address.
    await resolvePublic(url.hostname);

    const ctrl = new AbortController();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Request timed out.');
    const timer = setTimeout(() => ctrl.abort(), remaining);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          // A neutral desktop UA so sites return their normal markup/headers.
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,*/*',
        },
      });
    } catch (e) {
      throw new Error((e as Error).name === 'AbortError' ? 'Request timed out.' : 'Could not reach that URL.');
    } finally {
      clearTimeout(timer);
    }

    // Follow redirects ourselves so each Location is re-validated.
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (hop === maxRedirects) throw new Error('Too many redirects.');
      url = new URL(res.headers.get('location')!, url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Redirect to a non-http(s) URL was blocked.');
      }
      continue;
    }

    const headers: [string, string][] = [];
    res.headers.forEach((v, k) => headers.push([k, v]));

    let body = '';
    if (method === 'GET' && res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          if (total > maxBytes) { reader.cancel(); break; }
          chunks.push(value);
        }
      }
      body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    }

    return {
      finalUrl: url.toString(),
      status: res.status,
      statusText: res.statusText,
      headers,
      body,
    };
  }

  throw new Error('Too many redirects.');
}
