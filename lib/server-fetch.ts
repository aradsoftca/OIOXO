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
 *   - never auto-follow redirects blindly (we re-validate each Location),
 *   - DNS-rebinding-proof: a custom undici Agent re-checks each IP at the
 *     actual TCP-connect moment, so a hostname that resolved public once
 *     and private the second time can't slip through.
 */

import { Agent, fetch as undiciFetch } from 'undici';
import { resolvePublic, isPublicIp } from '@/lib/net-guard';

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

/**
 * A per-call undici Agent whose `connect` hook re-validates the IP at the
 * moment of TCP connection — closes the DNS-rebinding window that exists when
 * the SSRF pre-check uses one DNS answer and the eventual `fetch()` re-resolves
 * the hostname (potentially to a private IP this time). The check happens
 * INSIDE the connector, so even split-horizon / TTL-0 records can't slip past.
 */
function ssrfSafeAgent(): Agent {
  return new Agent({
    connect: (opts, callback) => {
      // Cast through the undici module to grab its default `buildConnector`.
      // Using the default connector keeps TLS handling identical to the
      // built-in fetch path; we only inject an IP-validation hook.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const undici = require('undici') as typeof import('undici');
      const baseConnect = undici.buildConnector({});
      baseConnect(opts, (err, socket) => {
        if (err || !socket) return callback(err, null);
        const addr = (socket as unknown as { remoteAddress?: string }).remoteAddress;
        if (!addr || !isPublicIp(addr)) {
          try { socket.destroy(); } catch { /* */ }
          return callback(new Error('Host resolved to a private/internal address — blocked.'), null);
        }
        callback(null, socket);
      });
    },
  });
}

export async function guardedFetch(
  rawUrl: string,
  opts: { method?: 'GET' | 'HEAD'; maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<FetchResult> {
  const { method = 'GET', maxBytes = 2_000_000, timeoutMs = 9000, maxRedirects = 5 } = opts;

  let url = parseUrl(rawUrl);
  const deadline = Date.now() + timeoutMs;
  const agent = ssrfSafeAgent();
  try {

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // SSRF guard: throws if the host resolves to a private / reserved address.
    await resolvePublic(url.hostname);

    const ctrl = new AbortController();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Request timed out.');
    const timer = setTimeout(() => ctrl.abort(), remaining);

    let res: Response;
    try {
      // Use undici's fetch with our IP-validating Agent. The pre-check above
      // catches the easy case (hostname → all-private IPs); this catches the
      // DNS-rebinding case where the second resolution returns a private IP
      // even though the first didn't.
      res = (await undiciFetch(url.toString(), {
        method,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          // A neutral desktop UA so sites return their normal markup/headers.
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,*/*',
        },
        dispatcher: agent,
      })) as unknown as Response;
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
      // Body read must honor the same wall-clock deadline as the request, or
      // a slowloris-style server that drips bytes (or sends nothing) keeps
      // reader.read() pending past timeoutMs — bypassing the timeout.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const left = deadline - Date.now();
          if (left <= 0) { try { await reader.cancel(); } catch { /* */ } throw new Error('Request timed out.'); }
          let timer: ReturnType<typeof setTimeout> | null = null;
          const tick = new Promise<never>((_, rej) => {
            timer = setTimeout(() => rej(new Error('Request timed out.')), left);
          });
          let step: { done: boolean; value?: Uint8Array };
          try {
            step = await Promise.race([reader.read(), tick]);
          } finally {
            // Free the per-iteration timer — without this, each chunk read
            // leaves a pending setTimeout alive until natural fire.
            if (timer) clearTimeout(timer);
          }
          if (step.done) break;
          if (step.value) {
            // Bail BEFORE pushing the over-cap chunk. Headers-only call sites
            // pass maxBytes: 1; a hostile server returning a giant first chunk
            // would briefly buffer the entire chunk in memory if we pushed
            // then checked. Trim the chunk to the remaining budget so the
            // total never exceeds maxBytes by more than one byte.
            const remaining = maxBytes - total;
            if (remaining <= 0) { try { await reader.cancel(); } catch { /* */ } break; }
            const slice = step.value.length > remaining ? step.value.subarray(0, remaining) : step.value;
            total += slice.length;
            chunks.push(slice);
            if (total >= maxBytes) { try { await reader.cancel(); } catch { /* */ } break; }
          }
        }
      } catch (e) {
        try { await reader.cancel(); } catch { /* */ }
        throw e;
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
  } finally {
    // Release any keepalive sockets the Agent created. Single-request-per-agent
    // so there's no reuse benefit; close so we don't leak FDs on the throw path.
    void agent.close().catch(() => { /* */ });
  }
}
