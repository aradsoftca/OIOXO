/**
 * oioxo Compute Mesh — DEVICE KEYS (stage 7). The trust anchor that makes a WorkReceipt
 * (compute-credit.ts) verifiable. Each device holds an account-bound ECDSA keypair
 * (P-256). The private key stays on the device (in the browser: non-extractable, in
 * IndexedDB); the public key is registered to the account once. The device id IS the
 * fingerprint of the public key, so a receipt is self-authenticating: a device can't
 * claim another device's id without that device's private key.
 *
 * Provides a `Signer` (for issuing) and a `Verifier` (for the server / a consumer)
 * matching compute-credit's injected-crypto seams. Uses Web Crypto, present in both the
 * browser and Node 18+ — so this is exercised with REAL signatures in the test suite.
 */
import { toB64Url, fromB64Url } from './bytes';
import type { Signer, Verifier } from './compute-credit';

const KEY_ALGO: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGO: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('Web Crypto unavailable');
  return c.subtle;
}

export interface DeviceIdentity {
  /** base64url(SHA-256(raw public key)) — self-authenticating, doubles as the helper id. */
  deviceId: string;
  /** Registered with the account so peers/server can verify this device's receipts. */
  publicKeyJwk: JsonWebKey;
  /** Kept on the device. */
  privateKey: CryptoKey;
  /** Drop into issueReceipt / makeReceiptIssuer. */
  sign: Signer;
}

async function fingerprint(rawPublicKey: ArrayBuffer): Promise<string> {
  return toB64Url(await subtle().digest('SHA-256', rawPublicKey));
}

/** Create a fresh device identity. In the browser pass `false` (default) to keep the
 *  private key non-extractable; tests pass `true` only if they need to export it. */
export async function createDeviceIdentity(extractablePrivate = false): Promise<DeviceIdentity> {
  const kp = (await subtle().generateKey(KEY_ALGO, extractablePrivate, ['sign', 'verify'])) as CryptoKeyPair;
  const publicKeyJwk = await subtle().exportKey('jwk', kp.publicKey);
  const deviceId = await fingerprint(await subtle().exportKey('raw', kp.publicKey));
  const sign: Signer = async (canonical) =>
    toB64Url(await subtle().sign(SIGN_ALGO, kp.privateKey, new TextEncoder().encode(canonical)));
  return { deviceId, publicKeyJwk, privateKey: kp.privateKey, sign };
}

/** The device id a public key would have — used at registration to key the account map. */
export async function deviceIdForJwk(jwk: JsonWebKey): Promise<string> {
  const key = await subtle().importKey('jwk', jwk, KEY_ALGO, true, ['verify']);
  return fingerprint(await subtle().exportKey('raw', key));
}

/**
 * Build a Verifier from a lookup of registered public keys (account → deviceId → JWK).
 * Fails closed: unknown device, a key that doesn't fingerprint to the claimed id, or a
 * bad signature all return false.
 */
export function makeVerifier(lookup: (deviceId: string) => Promise<JsonWebKey | null> | JsonWebKey | null): Verifier {
  return async (canonical, sig, deviceId) => {
    try {
      const jwk = await lookup(deviceId);
      if (!jwk) return false;
      if ((await deviceIdForJwk(jwk)) !== deviceId) return false; // key must match the claimed id
      const key = await subtle().importKey('jwk', jwk, KEY_ALGO, true, ['verify']);
      // Copy into a fresh Uint8Array so the type is Uint8Array<ArrayBuffer> (BufferSource),
      // sidestepping the TS 5.7 ArrayBufferLike-vs-ArrayBuffer typed-array friction.
      return await subtle().verify(SIGN_ALGO, key, new Uint8Array(fromB64Url(sig)), new TextEncoder().encode(canonical));
    } catch {
      return false;
    }
  };
}
