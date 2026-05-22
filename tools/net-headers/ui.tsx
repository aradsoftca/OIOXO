'use client';
import { TextTool } from '@/components/tool/TextTool';
import { parseHeaders } from '@/engines/net';

const SECURITY_HEADERS = [
  ['strict-transport-security', 'HSTS — forces HTTPS'],
  ['content-security-policy',   'CSP — controls allowed sources'],
  ['x-frame-options',           'Clickjacking protection'],
  ['x-content-type-options',    'MIME sniff protection'],
  ['referrer-policy',           'Controls Referer header'],
  ['permissions-policy',        'Restricts powerful APIs'],
  ['cross-origin-opener-policy', 'COOP — process isolation'],
  ['cross-origin-embedder-policy', 'COEP — required for SharedArrayBuffer'],
];

export default function Tool() {
  return (
    <TextTool
      toolId="net-headers"
      colorVar="--color-cat-ip"
      urlFetch={{ endpoint: '/api/net/headers', placeholder: 'https://example.com — fetch live headers' }}
      inputPlaceholder={`Fetch a URL above, or paste raw headers:\nHTTP/2 200\ncontent-type: text/html\nstrict-transport-security: max-age=31536000\n…`}
      transform={(s) => {
        if (!s.trim()) return 'Paste raw HTTP response headers.';
        const headers = parseHeaders(s);
        if (headers.length === 0) return 'No headers found. Expected "Header-Name: value" lines.';

        const map = new Map<string, string>();
        for (const h of headers) map.set(h.name.toLowerCase(), h.value);

        const widthName = Math.max(...headers.map((h) => h.name.length));
        const lines: string[] = [];
        lines.push('── Headers ──');
        for (const h of headers) lines.push(`${h.name.padEnd(widthName)}  ${h.value}`);

        lines.push('', '── Security report ──');
        for (const [key, label] of SECURITY_HEADERS) {
          const has = map.has(key);
          lines.push(`${has ? '✓' : '✗'} ${key.padEnd(34)} ${label}`);
        }
        const score = SECURITY_HEADERS.filter(([k]) => map.has(k)).length;
        lines.push('', `Security score: ${score} / ${SECURITY_HEADERS.length}`);

        return lines.join('\n');
      }}
    />
  );
}
