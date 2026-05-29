/**
 * oioxo Compute Mesh — SERVERLESS LAN PEER (stage 8 binding). The real
 * RTCPeerConnection wiring for pairing.ts: two devices on the same Wi-Fi connect with
 * NO /api/signal relay. Non-trickle ICE — gather every candidate first (instant on a
 * LAN), so the full offer/answer is a single self-contained blob exchanged out-of-band
 * (QR code or paste). One blob each way, no server in the handshake.
 *
 * Initiator: startLocalPairing() → await .offer (show as QR) → .accept(scannedAnswer).
 * Responder: joinLocalPairing(scannedOffer) → await .answer (show as QR back).
 * Both return a `Peer` with the same send/sendBinary/close shape as p2p/peer.ts, so the
 * mesh coders/oracles bind to it unchanged. Browser-only (uses RTCPeerConnection).
 */
import { getIceServers } from './ice';
import type { Peer, PeerHandlers } from './peer';
import {
  encodePairing, decodePairing, tokenMatches, waitIceComplete,
  type PairingPayload,
} from '@/lib/oioxo/pairing';

const GATHER_TIMEOUT = 4000;

interface Wired {
  peer: Peer;
  /** Resolves with the local SDP blob once ICE gathering completes. */
  blob: Promise<string>;
}

/** Shared setup: build the PC, wire the data channel to the handlers, and (once a local
 *  description is set) produce the non-trickle pairing blob for THIS side. */
async function build(
  role: 'offer' | 'answer',
  token: string,
  deviceId: string,
  handlers: PeerHandlers,
  makeLocalDesc: (pc: RTCPeerConnection) => Promise<void>,
  label?: string,
): Promise<Wired & { pc: RTCPeerConnection }> {
  const iceServers = await getIceServers();
  const pc = new RTCPeerConnection({ iceServers });
  let dc: RTCDataChannel | null = null;

  const wire = (channel: RTCDataChannel) => {
    dc = channel;
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => handlers.onState?.('connected');
    dc.onclose = () => handlers.onState?.('closed');
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        // Cap inbound JSON — a hostile or buggy peer could ship a multi-MB
        // string and JSON.parse OOMs the receiver. Local-peer is the
        // QR-paired channel so the cap can be modest (control messages, not
        // file streams).
        if (e.data.length > 256_000) return;
        try { handlers.onMessage?.(JSON.parse(e.data)); } catch { /* ignore */ }
      }
      else handlers.onBinary?.(e.data as ArrayBuffer);
    };
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') handlers.onState?.('failed');
  };

  if (role === 'offer') {
    wire(pc.createDataChannel('mesh', { ordered: true }));
  } else {
    pc.ondatachannel = (e) => wire(e.channel);
  }

  handlers.onState?.('connecting');
  await makeLocalDesc(pc);
  await waitIceComplete(pc, GATHER_TIMEOUT);

  const blob = Promise.resolve(
    encodePairing({ v: 1, role, sdp: pc.localDescription?.sdp ?? '', token, deviceId, label }),
  );

  const peer: Peer = {
    // Wrap send in try/catch — dc.send throws on oversize messages
    // (SCTP > ~256KB) or when bufferedAmount is past the queue limit.
    // Without the catch, the caller's UI handler dies with an uncaught
    // exception instead of seeing a clean `false` return.
    send: (data) => {
      if (!dc || dc.readyState !== 'open') return false;
      try { dc.send(JSON.stringify(data)); return true; } catch { return false; }
    },
    sendBinary: (buf) => {
      if (!dc || dc.readyState !== 'open') return false;
      try { dc.send(buf); return true; } catch { return false; }
    },
    close: () => { try { dc?.close(); } catch { /* */ } try { pc.close(); } catch { /* */ } },
  };

  return { pc, peer, blob };
}

export interface LocalInitiator {
  /** The offer blob to show as a QR / copy. Ready once ICE has gathered. */
  offer: Promise<string>;
  /** Finish the connection with the responder's scanned/pasted answer blob. */
  accept: (answerBlob: string) => Promise<boolean>;
  peer: Peer;
}

/** Start a serverless pairing (the device showing the FIRST QR). */
export async function startLocalPairing(
  token: string,
  deviceId: string,
  handlers: PeerHandlers,
  label?: string,
): Promise<LocalInitiator> {
  const { pc, peer, blob } = await build('offer', token, deviceId, handlers, async (p) => {
    await p.setLocalDescription(await p.createOffer());
  }, label);

  const accept = async (answerBlob: string): Promise<boolean> => {
    const a = decodePairing(answerBlob);
    if (!a || a.role !== 'answer' || !tokenMatches(a, token)) return false;
    await pc.setRemoteDescription({ type: 'answer', sdp: a.sdp });
    return true;
  };

  return { offer: blob, accept, peer };
}

export interface LocalResponder {
  /** The answer blob to show back (QR/paste). The remote device on the other side of
   *  the channel is the initiator that produced `offerBlob`. */
  answer: Promise<string>;
  peer: Peer;
  /** The decoded offer (so the UI can show "pairing with <label>"). */
  from: PairingPayload;
}

/** Join a serverless pairing from a scanned offer (the device showing the SECOND QR).
 *  Returns null if the offer is malformed or carries a foreign token (stranger). */
export async function joinLocalPairing(
  offerBlob: string,
  expectedToken: string,
  deviceId: string,
  handlers: PeerHandlers,
  label?: string,
): Promise<LocalResponder | null> {
  const offer = decodePairing(offerBlob);
  if (!offer || offer.role !== 'offer' || !tokenMatches(offer, expectedToken)) return null;

  const { peer, blob } = await build('answer', expectedToken, deviceId, handlers, async (p) => {
    await p.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    await p.setLocalDescription(await p.createAnswer());
  }, label);

  return { answer: blob, peer, from: offer };
}
