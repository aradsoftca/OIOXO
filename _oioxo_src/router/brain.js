/**
 * DEPRECATED — superseded by oioxo/router/brain-bridge.js.
 *
 * Historical: this file used to install a separate `window.oioxoBrainBridge`
 * shaped around an `oioxoConductor.classify(...)` namespace that was never
 * populated by the runtime. brain-bridge.js now owns the single
 * `window.oioxoBrainBridge` with both `.route(...)` and `.planTurn(...)` APIs,
 * driven by the v3 SmolVLM-256M-Brain planner (lib/ai/brain-runtime.ts).
 *
 * This stub is kept so the encrypted asset (router-brain.enc) decodes to
 * something inert during the rollout window — the loader still tries to load
 * router-brain.enc until the next manifest republish. After the manifest
 * drops it, this file can be deleted.
 */
(function(){
  'use strict';
  // No-op. brain-bridge.js installs the real bridge; we just yield.
})();
