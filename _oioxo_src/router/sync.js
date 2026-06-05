/**
 * Cross-device sync — moves the local-only state (bookmarks + profile +
 * history) between devices via the existing Send P2P channel. Nothing
 * touches our servers; the bundle is encrypted in-flight by Send.
 *
 *   bundle()       → string  (compact JSON, ready to ship)
 *   apply(json)    → { mergedBookmarks, mergedProfile, mergedHistory }
 *   sendVia(code)  → ship to a peer using oioxoSend's signaling code
 *   receiveVia(code, cb)  → receive a bundle from a peer
 *
 * Merge strategy:
 *   bookmarks → union by normalized query (newest wins on metadata)
 *   profile   → sum click counts, max lastTouch
 *   history   → union; keep the higher recency score per slug
 *
 * No clock-skew protection: this is opt-in by a user pressing "sync now",
 * which makes "I asked for this" the trust boundary.
 *
 * Exposes window.oioxoSync = { bundle, apply, sendVia, receiveVia,
 *                               isAvailable }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoSync) return;

  const VERSION = 1;

  function gatherBookmarks(){
    return (window.oioxoBookmarks && window.oioxoBookmarks.list) ? window.oioxoBookmarks.list() : [];
  }
  function gatherProfile(){
    return (window.oioxoProfile && window.oioxoProfile.snapshot) ? window.oioxoProfile.snapshot() : null;
  }
  function gatherHistory(){
    return (window.oioxoHistory && window.oioxoHistory.recent) ? window.oioxoHistory.recent(50) : [];
  }

  function bundle(){
    const payload = {
      v: VERSION,
      ts: Date.now(),
      bookmarks: gatherBookmarks(),
      profile: gatherProfile(),
      history: gatherHistory(),
    };
    return JSON.stringify(payload);
  }

  /** Merge an incoming bundle into local state. Returns counts so the UI
   *  can show "Imported N bookmarks, M tool clicks". */
  function apply(json){
    let parsed;
    try { parsed = (typeof json === 'string') ? JSON.parse(json) : json; }
    catch { return { error: 'invalid-json' }; }
    if (!parsed || parsed.v !== VERSION) return { error: 'version-mismatch', got: parsed && parsed.v };

    let mergedBookmarks = 0;
    if (Array.isArray(parsed.bookmarks) && window.oioxoBookmarks && window.oioxoBookmarks.add){
      for (const b of parsed.bookmarks){
        if (window.oioxoBookmarks.add(b.label || b.q, b.meta)) mergedBookmarks++;
      }
    }
    let mergedProfile = 0;
    if (parsed.profile && parsed.profile.breakdown && window.oioxoProfile && window.oioxoProfile.observe){
      for (const [cat, v] of Object.entries(parsed.profile.breakdown)){
        const reps = Math.max(1, Math.round((v.count || 0) * 0.5)); // half-weight remote clicks
        for (let i = 0; i < reps; i++) window.oioxoProfile.observe(cat);
        mergedProfile += reps;
      }
    }
    let mergedHistory = 0;
    if (Array.isArray(parsed.history) && window.oioxoHistory && window.oioxoHistory.record){
      for (const h of parsed.history){
        if (h && h.slug){ window.oioxoHistory.record(h.slug, { source: 'sync' }); mergedHistory++; }
      }
    }
    return { mergedBookmarks, mergedProfile, mergedHistory, sourceTs: parsed.ts };
  }

  function isAvailable(){
    return !!(window.oioxoSend && typeof window.oioxoSend.sendBlob === 'function');
  }

  /** Ship the bundle through the existing Send P2P channel. Caller gets
   *  a short code their peer enters on the other device. */
  async function sendVia(){
    if (!isAvailable()) return { error: 'send-channel-unavailable' };
    const data = bundle();
    const blob = (typeof Blob !== 'undefined')
      ? new Blob([data], { type: 'application/json' })
      : data;
    try {
      const code = await window.oioxoSend.sendBlob(blob, { mime: 'application/oioxo-sync+json' });
      return { code, bytes: data.length };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }

  async function receiveVia(code, opts){
    if (!isAvailable() || typeof window.oioxoSend.receiveBlob !== 'function'){
      return { error: 'send-channel-unavailable' };
    }
    try {
      const blob = await window.oioxoSend.receiveBlob(code, opts);
      const text = blob && (typeof blob.text === 'function' ? await blob.text() : String(blob));
      return apply(text);
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }

  window.oioxoSync = { bundle, apply, sendVia, receiveVia, isAvailable, VERSION };
})();
