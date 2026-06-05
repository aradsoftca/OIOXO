# oioxo — online models + free/paid permission (online IDE + desktop)

> Goal (user, 2026-05-25): our models power BOTH the online IDE (oioxo.com /oioxo)
> and the desktop app; **all online, every model use passes our permission** (free
> AND paid). This doc is the source of truth for that wiring.

## The seam already exists — don't scatter it
Model selection + the permission gate live in ONE place: `lib/oioxo/conductor-engine.ts`
→ `configureConductor({ model, wasm, entitled })`. Everything below plugs in here.

- `conductor-wasm.ts` — loads OUR model as ONNX via transformers.js from
  `oioxo.com/models/...` (CPU/WASM, sidesteps WebGPU instability). See
  `CONDUCTOR_SERVING.md` / [[reference_conductor_hosting]].
- `entitlement.ts` / `entitlement-client.ts` / `useEntitlement.ts` — server-signed,
  device-bound, short-TTL entitlement → `{ tier, pro, has }`. **The real lock is the
  server withholding the Pro content key**, not the UI flag.
- `pro-asset.ts` + `/api/entitlement` — Pro weights are AES-GCM encrypted; the
  decryption key is returned ONLY to PRO/BUSINESS, only over our origin.
- `/api/usage` ([[project_usage_gate]]) — the existing metering (cookie+IP identity)
  for the FREE tier's "pass our permission" check.

## The model tiers (all served/gated online)

| Tier | Model | Served from | Permission check |
|---|---|---|---|
| **Free** | base on-device coder (small, e.g. Qwen2.5-Coder-0.5/1.5B via web-llm WebGPU, or our small conductor served as ONNX) | public CDN / `oioxo.com/models` (open) | `/api/usage` — anon entitlement (cookie+IP), metered caps; must succeed before the model is allowed to run |
| **Pro** | our fine-tuned **conductor** + bigger coder | `oioxo.com/models/...` as a **Pro protected asset** (AES-GCM encrypted) | `/api/entitlement` returns the content key ONLY for PRO; `pro-asset.loadProtectedAsset` decrypts in memory, NO fallback |

"All online + pass our permission" = **every** model load is preceded by an online
call: free → `/api/usage` (allowed?), paid → `/api/entitlement` (key?). No model
runs without a server round-trip that we control. A cracked client can't fabricate
the Pro key (it never received it) and can't bypass the free meter (server-side).

## What to wire (online IDE — `app/oioxo` Code surface)
1. On mount, call `useEntitlement()` → `{ tier, pro }`.
2. `configureConductor({ wasm: { modelId: 'models/oioxo-conductor', host: origin, protected: pro }, entitled: pro })`
   for Pro; for Free, leave `entitled:false` so it uses the open base coder.
3. Gate the RUN action: before generation, `await checkPermission()` —
   free → `/api/usage` increment+allow; pro → ensure entitlement fresh. Block + show
   upgrade/limit UI on deny (reuse the existing usage-gate paywall).
4. Surface the tier (already: tier chip in CodeAgent AgentPanel).

## Desktop app — same gate, stronger lock
- Same `/api/entitlement` permission (online check), so desktop also "passes our
  permission." Token stored in the **OS keychain** (stronger than web).
- Desktop additionally runs BIGGER local models (Ollama/llama.cpp) for Pro — but the
  ENTITLEMENT to use the Pro experience + our fine-tuned weights still gates online.
- The fork wires this via the `oioxo` provider + the Pro gate (see oioxo-ide).

## Why this beats every rival (the moat, in one line)
Rivals run the model in THEIR cloud (your code leaves, you pay per token, dies
offline). oioxo runs the model on YOUR device — we host only the **keys + freshness +
our fine-tuned weights**. So we get: privacy by architecture, near-zero COGS (price
under Cursor), offline, AND a real licensing lock (the check delivers the asset).
Free tier is genuinely usable (the funnel); the Pro weights are the durable moat.
See `oioxo-ide/OIOXO_IDE_AUDIT.md` for the full competitive analysis.

## Honest dependency
The Pro conductor/coder must be EXPORTED + QUANTIZED + HOSTED first (the writer8-style
tail — see [[project_custom_model]] / `CONDUCTOR_SERVING.md`). Until then `entitled`
stays false and everyone uses the base coder (correct behavior, specialist slots in
later with no call-site change). Build order: (1) wire the permission gate + free
base coder online NOW; (2) host the Pro model; (3) flip Pro on.
