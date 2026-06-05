/**
 * oioxo search engine — protected asset loader.
 *
 * Same "permission as a key" gate the tool workers use (lib/protect/protected-worker.ts),
 * adapted for the single-file search engine. Each engine / skill / catalog /
 * providers blob ships AES-256-GCM encrypted at /protected/{assetId}.enc and
 * is inert without the per-asset key. The key is recovered only via:
 *   1. POST /api/entitlement → device-bound entitlement
 *   2. POST /api/search-key with an ECDHE ephemeral pubkey + the entitlement
 *      → server returns the asset key wrapped under the per-session shared
 *      secret
 *   3. In-page derive the shared secret + unwrap the asset key
 *   4. AES-GCM decrypt the .enc blob → either eval (JS modules) or JSON.parse
 *      (catalog) or `<script>` injection (search-providers)
 *
 * Throws on any denial — there is intentionally NO soft path. A cloned site on
 * the wrong origin gets a 403 at step 2 and the search engine simply doesn't
 * function. Heartbeat to /api/unlock-heartbeat re-validates every 5 min, so
 * revocations propagate within that window.
 *
 * Exposes window.oioxoLoader = {
 *   getEngine(name)  -> window.oioxoEngines[name]
 *   getSkill(name)   -> window.oioxoSkills[name]
 *   getCatalog()     -> the parsed catalog object
 *   getProviders()   -> resolves after the providers blob has been eval'd
 *   bootstrap()      -> kicks off the handshake (called on DOMContentLoaded)
 * }
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoLoader) return;

  // ---- config ---------------------------------------------------------
  const KEY_ENDPOINT = '/api/search-key';
  const ENT_ENDPOINT = '/api/entitlement';
  const HEARTBEAT_ENDPOINT = '/api/unlock-heartbeat';
  const PROTECTED_BASE = '/protected/';
  const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
  const HEARTBEAT_FAIL_BUDGET = 3;
  const DEVICE_KEY = 'oioxo.device';
  const ENT_CACHE_KEY = 'oioxo.entitlement';
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  // Set to true for a dev unlock path that bypasses /api when the server isn't
  // reachable AND the user is on localhost — never trust this on prod hosts.
  const DEV_LOCAL_FALLBACK = false;

  // ---- byte / b64 helpers --------------------------------------------
  function b64ToBytes(b64){ const bin = atob(b64.replace(/\s/g,'')); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
  function bytesToB64(b){ let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }

  // ---- device id ------------------------------------------------------
  function deviceId(){
    let id = '';
    try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch {}
    if (!id){
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      id = Array.from(buf, x => x.toString(16).padStart(2,'0')).join('');
      try { localStorage.setItem(DEVICE_KEY, id); } catch {}
    }
    return id;
  }

  // ---- ECDHE ephemeral ------------------------------------------------
  async function genEphemeral(){
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    return { publicKeyB64: bytesToB64(raw), privateKey: kp.privateKey };
  }
  async function importPub(pubB64){
    return crypto.subtle.importKey('raw', b64ToBytes(pubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  }
  async function wrapKey(privateKey, peerPubB64, context){
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await importPub(peerPubB64) }, privateKey, 256));
    const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('oioxo:unlock'), info: enc.encode(context) }, base, 256);
    return new Uint8Array(bits);
  }

  // ---- entitlement ----------------------------------------------------
  async function getEntitlement(){
    const device = deviceId();
    const r = await fetch(ENT_ENDPOINT, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ device }),
    });
    if (!r.ok) throw new Error('search engine requires the official oioxo origin');
    const j = await r.json();
    if (!j || !j.entitlement) throw new Error('no entitlement');
    return { entitlement: j.entitlement, tier: j.tier || 'free', device };
  }

  // ---- per-asset unlock + decrypt ------------------------------------
  /** Run the handshake for one asset id, decrypt its .enc blob, return the
   *  plaintext bytes. Caller decides how to interpret (JS / JSON / script). */
  async function unlockAsset(assetId){
    const { entitlement, device } = await getEntitlement();
    const eph = await genEphemeral();
    const r = await fetch(KEY_ENDPOINT, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ entitlement, device, assetId, clientPubB64: eph.publicKeyB64 }),
    });
    if (!r.ok) throw new Error('unlock denied for ' + assetId);
    const grant = await r.json();
    if (!grant || grant.denied || !grant.serverPubB64 || !grant.wrappedKeyB64 || !grant.wrapIvB64) {
      throw new Error('malformed unlock for ' + assetId);
    }
    // Derive the wrapping key (same on both endpoints).
    const sharedRaw = await wrapKey(eph.privateKey, grant.serverPubB64, 'oioxo:unlock:' + assetId);
    const wrapKeyCK = await crypto.subtle.importKey('raw', sharedRaw, { name: 'AES-GCM' }, false, ['decrypt']);
    const wrapped = b64ToBytes(grant.wrappedKeyB64);
    const wrapIv = b64ToBytes(grant.wrapIvB64);
    const assetKeyBytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wrapIv }, wrapKeyCK, wrapped));
    sharedRaw.fill(0);
    // Fetch the encrypted asset.
    const blobRes = await fetch(PROTECTED_BASE + assetId + '.enc', { cache: 'force-cache' });
    if (!blobRes.ok) throw new Error('asset blob missing: ' + assetId);
    const enc = new Uint8Array(await blobRes.arrayBuffer());
    const iv = enc.slice(0, 12);
    const ct = enc.slice(12);
    const ck = await crypto.subtle.importKey('raw', assetKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    assetKeyBytes.fill(0);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, ck, ct));
    // Once decrypted, the bytes live only in this scope; consumers grab them
    // and we don't keep a long-lived reference.
    startHeartbeat(entitlement, device);
    return plain;
  }

  // ---- heartbeat ------------------------------------------------------
  let heartbeatTimer = null;
  let heartbeatFails = 0;
  let currentEntitlement = null;
  let currentDevice = null;
  function startHeartbeat(entitlement, device){
    currentEntitlement = entitlement; currentDevice = device;
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  }
  async function beat(){
    if (!currentEntitlement || !currentDevice) return;
    try {
      const r = await fetch(HEARTBEAT_ENDPOINT, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ entitlement: currentEntitlement, device: currentDevice }),
      });
      if (r.status === 403){ revoke(); return; }
      if (!r.ok){ if (++heartbeatFails >= HEARTBEAT_FAIL_BUDGET) revoke(); return; }
      const j = await r.json();
      if (j && j.valid) heartbeatFails = 0;
      else if (++heartbeatFails >= HEARTBEAT_FAIL_BUDGET) revoke();
    } catch {
      if (++heartbeatFails >= HEARTBEAT_FAIL_BUDGET) revoke();
    }
  }
  function revoke(){
    // Wipe whatever we've cached — engines/skills are window-attached and
    // we can't easily evict them, but we can at least disable future loads.
    if (heartbeatTimer){ clearInterval(heartbeatTimer); heartbeatTimer = null; }
    currentEntitlement = null; currentDevice = null; heartbeatFails = 0;
    revoked = true;
  }
  let revoked = false;

  // ---- public API: cached unlock per asset ---------------------------
  const inflight = new Map();
  function once(assetId, work){
    if (inflight.has(assetId)) return inflight.get(assetId);
    if (revoked) return Promise.reject(new Error('session revoked'));
    const p = work().catch((e) => { inflight.delete(assetId); throw e; });
    inflight.set(assetId, p);
    return p;
  }

  async function getEngine(name){
    if (window.oioxoEngines && window.oioxoEngines[name]) return window.oioxoEngines[name];
    await once('engine-' + name, async () => {
      const plain = await unlockAsset('engine-' + name);
      const src = dec.decode(plain);
      // The engine IIFE attaches itself to window.oioxoEngines.{name}.
      (0, eval)(src); // eslint-disable-line no-eval
    });
    return (window.oioxoEngines && window.oioxoEngines[name]) || null;
  }
  async function getSkill(name){
    if (window.oioxoSkills && window.oioxoSkills[name]) return window.oioxoSkills[name];
    await once('skill-' + name, async () => {
      const plain = await unlockAsset('skill-' + name);
      const src = dec.decode(plain);
      (0, eval)(src); // eslint-disable-line no-eval
    });
    return (window.oioxoSkills && window.oioxoSkills[name]) || null;
  }
  async function getCatalog(){
    if (cached.catalog) return cached.catalog;
    await once('catalog', async () => {
      const plain = await unlockAsset('catalog');
      cached.catalog = JSON.parse(dec.decode(plain));
    });
    return cached.catalog;
  }
  async function getProviders(){
    if (cached.providers) return cached.providers;
    await once('search-providers', async () => {
      const plain = await unlockAsset('search-providers');
      const src = dec.decode(plain);
      (0, eval)(src); // eslint-disable-line no-eval
      cached.providers = true;
    });
    return cached.providers;
  }
  async function getRouter(name){
    // Loads oioxo/router/{name}.js encrypted as router-{name}.enc. Mounts on
    // window.oioxoRouter (for "intents") or window.oioxoCardRenderer (for
    // "card-renderer") — same IIFE convention as engines/skills.
    const flag = '__router_' + name;
    if (cached[flag]) return true;
    await once('router-' + name, async () => {
      const plain = await unlockAsset('router-' + name);
      const src = dec.decode(plain);
      (0, eval)(src); // eslint-disable-line no-eval
      cached[flag] = true;
    });
    return cached[flag];
  }
  const cached = { catalog: null, providers: false };

  // ---- bootstrap (no-op placeholder; called at DOMContentLoaded) ----
  function bootstrap(){
    // Future: this is where we kick off the providers unlock as soon as the
    // page is interactive. For now consumers (search.html runRichSidebar)
    // call getEngine/getSkill lazily on first match.
  }

  window.oioxoLoader = {
    getEngine, getSkill, getCatalog, getProviders, getRouter, bootstrap,
    // Expose unlockAsset for future asset types we add to the manifest.
    unlockAsset,
    isRevoked: () => revoked,
  };
})();
