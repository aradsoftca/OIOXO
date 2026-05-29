/**
 * ICE server provider for "Xonvert Send".
 *
 * The client fetches this before opening a WebRTC connection. It returns the
 * STUN servers (path discovery, no bandwidth) plus — when configured — a TURN
 * relay for the cases where a direct path is impossible (blocking browser
 * extension, VPN, strict corporate NAT). TURN is tried LAST by ICE, so direct
 * P2P still wins whenever it can and the relay only carries the hard minority.
 *
 * Relay options, in priority order:
 *   1. Cloudflare TURN  — set TURN_KEY_ID + TURN_KEY_API_TOKEN. We mint a
 *      short-lived credential per request (Cloudflare's bandwidth; 1 TB/mo free).
 *   2. Static TURN      — set TURN_URLS (comma-separated) + TURN_USERNAME +
 *      TURN_CREDENTIAL for any other/self-hosted server.
 *
 * If neither is configured we return STUN only — direct P2P works for the large
 * majority; the blocked minority (locked-down browsers / strict NAT) gets an
 * honest failure rather than a relay. (Free public TURN was tried and dropped:
 * the openrelay endpoints are effectively dead — :443 TCP/TLS times out — so it
 * could never rescue a locked-down browser anyway.)
 *
 * Nothing here ever touches the file itself — only the connection setup.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STUN: RTCIceServer[] = [
  { urls: 'stun:194.247.182.248:3478' }, // our own coturn — reachable where Google/Cloudflare STUN are blocked
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

async function cloudflareTurn(): Promise<RTCIceServer[] | null> {
  const keyId = process.env.TURN_KEY_ID;
  const token = process.env.TURN_KEY_API_TOKEN;
  if (!keyId || !token) return null;
  // Hard timeout: without this, a hung Cloudflare API blocks every Send/Call/
  // Watch session start until next.js' default request timeout (~30s),
  // cascading into site-wide UI freezes on the connect step.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 }), // 24h is plenty for a transfer
        signal: ctrl.signal,
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
    if (!data.iceServers) return null;
    return Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function staticTurn(): RTCIceServer[] | null {
  const urls = process.env.TURN_URLS;
  if (!urls) return null;
  return [{
    urls: urls.split(',').map((u) => u.trim()).filter(Boolean),
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  }];
}

export async function GET() {
  const relay = (await cloudflareTurn()) || staticTurn() || [];
  return noStore({ iceServers: [...STUN, ...relay] });
}
