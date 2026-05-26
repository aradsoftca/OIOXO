/**
 * oioxo Compute Mesh — SERVERLESS LAN PAIRING (stage 6). The last piece of the
 * "zero server resources" rule: connect two of your devices on the same Wi-Fi WITHOUT
 * our /api/signal relay. The trick is NON-TRICKLE ICE — gather all candidates first
 * (instant on a LAN, they're host candidates), so the local SDP already contains
 * everything. Then the whole offer/answer is a single self-contained blob exchanged
 * out-of-band: shown as a QR code (or copy/pasted). One QR each way, no server.
 *
 * A pairing TOKEN (account-bound) rides in the blob so a random device on the same
 * Wi-Fi can't hijack the channel — the receiver rejects a payload whose token doesn't
 * match what it expects for the account.
 *
 * Pure: the codec + token check + the ICE-gathering gate (with injected PC) are all
 * Node-testable. The actual RTCPeerConnection wiring is the thin browser layer on top.
 */
import { utf8ToB64Url, b64UrlToUtf8 } from './bytes';

export const PAIRING_V = 1 as const;

export interface PairingPayload {
  v: typeof PAIRING_V;
  role: 'offer' | 'answer';
  /** The full local SDP (candidates bundled in via non-trickle gathering). */
  sdp: string;
  /** Account-bound pairing token — the receiver checks it to reject strangers. */
  token: string;
  /** Issuing device id (the account-bound key id). */
  deviceId: string;
  /** Optional human label for the UI ("MacBook"). */
  label?: string;
}

/** Encode a pairing payload to a compact, QR/URL-safe string. */
export function encodePairing(p: PairingPayload): string {
  return utf8ToB64Url(JSON.stringify([p.v, p.role, p.sdp, p.token, p.deviceId, p.label ?? '']));
}

/** Decode + structurally validate a pairing string. Returns null on anything malformed. */
export function decodePairing(s: string): PairingPayload | null {
  try {
    const a = JSON.parse(b64UrlToUtf8(s.trim()));
    if (!Array.isArray(a) || a[0] !== PAIRING_V) return null;
    const [v, role, sdp, token, deviceId, label] = a;
    if ((role !== 'offer' && role !== 'answer') || typeof sdp !== 'string' || !sdp) return null;
    if (typeof token !== 'string' || typeof deviceId !== 'string' || !deviceId) return null;
    return { v, role, sdp, token, deviceId, label: label || undefined };
  } catch {
    return null;
  }
}

/** Constant-effort token check — reject a payload not meant for this account. */
export function tokenMatches(p: Pick<PairingPayload, 'token'>, expected: string): boolean {
  const a = p.token, b = expected;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Minimal shape of the PC fields the gather gate needs (so it's testable with a fake). */
export interface IceGatherable {
  iceGatheringState: 'new' | 'gathering' | 'complete';
  addEventListener(type: 'icegatheringstatechange', cb: () => void): void;
  removeEventListener(type: 'icegatheringstatechange', cb: () => void): void;
}

/**
 * Resolve once ICE gathering is COMPLETE, so the local SDP carries every candidate
 * (non-trickle). Resolves immediately if already complete; resolves anyway after
 * `timeoutMs` (on a LAN gathering is near-instant — the timeout is just a safety net so
 * pairing never stalls). Returns true if it completed, false if it timed out.
 */
export function waitIceComplete(
  pc: IceGatherable,
  timeoutMs = 3000,
  setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h: ReturnType<typeof setTimeout>) => void = (h) => clearTimeout(h),
): Promise<boolean> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve(ok);
    };
    const onChange = () => { if (pc.iceGatheringState === 'complete') finish(true); };
    const timer = setTimer(() => finish(false), timeoutMs);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}
