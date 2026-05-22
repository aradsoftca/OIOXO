/**
 * Shared ICE-server config for all P2P features (Send, Clipboard, Chat, Watch,
 * Call). Fetches /api/turn once — the same source Send uses — so every app gets
 * an identical, working set (including any configured TURN relay). Falls back to
 * a built-in list led by our own coturn STUN, which is reachable in regions
 * where Google/Cloudflare STUN are blocked.
 */

const FALLBACK: RTCIceServer[] = [
  { urls: 'stun:194.247.182.248:3478' }, // our own coturn — always reachable
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

let cached: Promise<RTCIceServer[]> | null = null;

export function getIceServers(): Promise<RTCIceServer[]> {
  if (cached) return cached;
  cached = (async () => {
    try {
      const r = await fetch('/api/turn', { cache: 'no-store' });
      const j = (await r.json()) as { iceServers?: RTCIceServer[] };
      if (Array.isArray(j.iceServers) && j.iceServers.length) return j.iceServers;
    } catch { /* offline / blocked — use fallback */ }
    return FALLBACK;
  })();
  return cached;
}
