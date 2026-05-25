# Serving the conductor model (arad → browser, Pro-gated)

The conductor is the moat: a tiny model fine-tuned on the device's own verified
red→green repairs (conductor.ts + trajectory-store). The browser already routes
plan/rank/fix through `conductor-engine.ts`, which today **falls back to the coder**
(`conductorModel()` returns null). To make the specialist actually run, host it and
flip the config. Nothing else in the IDE changes.

## Pipeline
1. **Train / refresh on arad** (RTX 3070): `scripts/train_conductor.py` on the
   accrued dataset (seed `scripts/conductor-seed.jsonl` + exported on-device
   trajectories). Produces a Qwen2.5-0.5B-Instruct fine-tune.
2. **Convert for the browser** — MLC (WebGPU) format so web-llm can load it:
   `mlc_llm convert_weight` + `gen_config` → an MLC model dir (q4f16_1).
   (Fallback for non-WebGPU devices: a GGUF for the wasm path, later.)
3. **Encrypt as a Pro asset** — `scripts/encrypt_asset.mjs` with `OIOXO_PRO_KEY`
   (protect.ts AES-256-GCM). The weights ship encrypted; only an entitled session
   gets the content key from `/api/entitlement`. "The check delivers the asset."
4. **Host** the encrypted shards behind the app (Iceland), served to entitled
   sessions; web-llm loads them via the pro-asset loader (`pro-asset.ts`).
5. **Flip the config** at startup once entitlement resolves:
   ```ts
   import { configureConductor } from '@/lib/oioxo/conductor-engine';
   // when useEntitlement() reports Pro and the asset is available:
   configureConductor({ model: ['oioxo-conductor-0_5b-q4f16_1'], entitled: true });
   ```

## Why route now (before it's hosted)
- `conductor-engine.runRole` is the single seam; the planner already uses it.
- Coder fallback means today's behavior is correct + verified (`test:oioxo`).
- When the asset lands, plan (and later rank/fix) shift to the specialist with
  zero call-site edits — and it's automatically a Pro feature via `entitled`.

## Status
- Routing: DONE (planner → runRole). rank/fix still go through the coder loop;
  route them through runRole once the model proves out on plan.
- Hosting: NOT done — needs the arad export + MLC convert + encrypt + host above.
