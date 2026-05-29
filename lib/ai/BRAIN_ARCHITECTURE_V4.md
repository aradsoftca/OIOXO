# oioxo Brain — v4 architecture (the terminal design)

> Goal of this document: design the brain **once more, maturely**, so we do not need a
> v5 architecture change. Future growth (new tools, languages, modalities, discourse
> phenomena, quality) must come from **data, registries, and adapters — never from
> re-architecting**. This is the spec the v4 retrain implements.

It supersedes the "single generative decoder emits 8-slot JSON" design only in *how the
slots are produced and guaranteed* — the **8-slot serve contract, the ≤180 MB budget,
the frozen vision tower, the translate-in/out shell, and the federated search engine all
stay exactly as they are.** The engine that consumes `BrainPlan` does not change.

Anchored to the real code: `scripts/train_smolvlm_brain.py`, `lib/ai/brain-runtime.ts`,
`scripts/eval_smolvlm_brain.py`, `lib/ai/PLATFORM_BODY.md`. Read those first.

---

## 0. Why v3 fails, in one sentence

A 256M **generative** decoder is being asked to do an **8-way discriminative
classification** (`turnRole`) as a side effect of writing JSON — and generation is the
one thing it does worst at classification. The serve-path eval proved it precisely:

| metric | raw model | + serve repair | verdict |
|---|---|---|---|
| JSON-valid | 93.2% | **99.0%** | solved by structure |
| chain-typecheck | 87.9% | **93.2%** | nearly solved by structure |
| **turn-role** | **67.6%** | **67.6%** | **repair can't touch it — it's semantics** |

So v4 is **not** about output formatting. It is about (a) making the structured/semantic
slots come from the part of the network that is actually good at them, and (b) making the
JSON *impossible to malform* so we stop leaning on a repair hack. Everything else is
generation, which v3 already does acceptably.

---

## 1. The thesis — one backbone, a team of specialists

```
                 message + history + (image/file) → translate.toEnglish()
                                   │
            ┌──────────────────────▼───────────────────────┐
            │   SmolVLM-256M backbone (vision tower FROZEN)  │  ← unchanged from v3
            │   + LoRA language adapter (generation)         │
            └───┬───────────────────────────────────┬───────┘
                │ final prompt hidden state h*        │ autoregressive decode
        ┌───────▼────────┐                    ┌───────▼───────────────────┐
        │  HEAD BANK      │  (tiny linear      │  CONSTRAINED JSON DECODE   │
        │  (read ONCE     │   probes on h*)    │  (grammar-masked logits)   │
        │   at prefill)   │                    │  emits goal/chain/params/  │
        │                 │                    │  style/remember/ask/reply  │
        │ • turn-role  8→ │                    └───────┬───────────────────┘
        │ • goal-cont  3→ │                            │
        │ • mediaNeed  4→ │   heads OWN their slots ───┤ merge:
        │ • confidence 1→ │   (override the generated  │ head value wins for
        │ • safety     6→ │    slot; generation is the │ its slot; generation
        └─────────────────┘    fallback / the prose)   │ fills the rest
                                   │                    │
                                   ▼                    ▼
                         BrainPlan (same 8 slots) → engine (UNCHANGED)
                                   │
                       translate.fromEnglish() → user, any language
```

**One model. One forward pass. One ONNX graph with extra outputs.** No second model, no
extra megabytes of weights (the whole head bank is < 30 KB). The backbone does what a
transformer is good at — building a contextual representation of the turn — and we read
the discriminative answers off that representation with linear probes instead of
hoping the autoregressive tail re-derives them token by token.

This "shared trunk + cheap task heads" pattern is the same reason BERT-style encoders hit
90%+ on intent classification at tiny sizes: **classification wants a pooled state, not a
generated string.** We were leaving that on the table.

---

## 2. The head bank (the discriminative fix)

All heads are `Linear(d_model → K)` on `h*` = the hidden state of the **last prompt
token** (the position right before generation begins), taken from the **top
transformer layer** of the text model. `d_model` is the text config width (≈576 for the
SmolLM2-135M text core inside SmolVLM-256M). Each head therefore costs `576·K` params —
the entire bank is ~26 KB. They are read **once** at prefill, before any token is decoded.

| head | classes | what it decides | why a head not generation |
|---|---|---|---|
| **turn-role** | 8 (new-goal, parameter, append-step, correction, confirmation, question, chitchat, outcome) | the v3 failure | discriminative; pooled state >> generated token |
| **goal-continuation** | 3 (same-goal, modify-goal, new-goal) | **directly kills the runaway new-goal prior** | the real question is "is this a continuation?" — a binary-ish call the generative model conflates into new-goal |
| **mediaNeed** | 4 (none, image-search, ocr, video-transcript) | route to vision/search | small fixed taxonomy = classic classification |
| **confidence** | 1 (scalar, sigmoid) | calibrated P(plan is right) | enables **abstention**: low → ask, or fall to the deterministic floor |
| **safety** | 6 (none, medical, legal, financial, crisis, destructive) | guardrail routing | guardrails must be *reliable*, not dependent on the prose remembering a rule |

**goal-continuation is the linchpid.** v3's confusion matrix shows *every* rare role
collapsing into `new-goal`. That is not five independent errors — it is one error: the
model does not track the running goal. A 3-way head that conditions on `h*` (which has
attended over the full history) answers "continuation vs fresh" directly, and `turn-role`
is then resolved *within* that decision (e.g. continuation + a value → `parameter`;
continuation + a new step → `append-step`; fresh → `new-goal`). The two heads are trained
jointly with a consistency term (see §8) so they cannot disagree.

**Heads own their slots.** At serve time the head argmax **overrides** the generated JSON
slot. Generation still emits `turnRole`/`mediaNeed` (train/serve parity + a fallback when
a head is ever absent), but the head is authoritative. This is the "specialist wins on its
specialty" rule, encoded in the merge step (§9).

This taxonomy is **complete and orthogonal**: *what kind of turn* (role + continuation),
*what input modality* (mediaNeed), *how sure* (confidence), *how sensitive* (safety). These
are the independent axes of dialogue control. A genuinely new axis would be additive — a
new head retrained on the same backbone — never a rearchitecture. That orthogonality is a
large part of why this is terminal.

---

## 3. Goal-state carry (tracking across turns)

The new-goal prior is a *memory* failure as much as a classification one. Two reinforcing
fixes, both versionless:

1. **History is already in the prompt** (`buildBrainUser` serializes it). The
   goal-continuation head reads `h*`, which has attended over it. This is the cheap 80%.
2. **Explicit running-goal slot in the prompt.** The engine already knows the current
   goal (it's in `BrainPlan.goal` from the previous turn). v4 feeds it back as a first-class
   line — `Current goal: <text>` — so the model decides *modify vs replace* against an
   explicit anchor rather than re-inferring it from raw history. This is a **prompt-contract
   change, not an architecture change**, and it is the single highest-leverage data signal:
   the teacher (Gemini-Pro) is shown the running goal and must label `same/modify/new`
   relative to it. Train/serve parity keeps `conductor`/`brain-runtime` and the trainer in
   lockstep as always.

No recurrent state, no KV persistence across turns, nothing that complicates the ONNX
export or the stateless in-browser call. The "memory" is the explicit goal line + history,
which the engine owns and the heads read.

---

## 4. Constrained decoding — retire the repair hack as the primary guarantee

Today JSON validity is achieved *after the fact* by `parsePlan`'s balance-close + loop-collapse
repair. That is a safety net; it should not be the design. v4 makes malformed structure
**impossible to emit** via a grammar-masked logits processor in the custom decode loop:

- A JSON-schema / GBNF grammar for the 8-slot object: keys in order, value types fixed,
  `chain[]` entries forced to match `^(?:tool|chain|studio|app|vision|search|memory|limit|chat):[a-z0-9,\-]+$`,
  `turnRole`/`mediaNeed` to their enums. At each step the processor zeroes the probability
  of any token that cannot continue a valid parse.
- Result: **JSON-valid and chain-typecheck become 100% by construction**, independent of
  model size. The repair pass stays only as a belt-and-braces fallback for the rare case
  the constrained loop is bypassed (e.g. a future ungrammared path).
- This also *frees model capacity*: the LoRA no longer has to spend itself learning to
  close braces, so more of it goes to `goal`/`reply` quality.

transformers.js has no built-in grammar engine, so this is implemented in our own
prefill→decode loop (§9) as a token-mask function. ~150 lines, fully on-device, no extra weights.

> Decision: constrained decoding is **the** JSON/chain fix; the §2 heads are **the**
> semantic fix; the repair pass demotes to a fallback. Two principled mechanisms replace
> one hopeful one.

---

## 5. Capability binding by RETRIEVAL — why new tools never need a retrain

The chain vocabulary (`tool:gen-qr-code`, `studio:image`, …) must **not** live in the
weights. If it did, every new tool = a retrain, and we'd be back to v5, v6, v7…

- The model emits a chain step as **intent text** ("make a QR code", surface `tool:`).
- A deterministic **capability resolver** (already the engine's job) maps that intent to a
  concrete `surface:id` by retrieval over the **live tool/skill/app catalog** (the same
  catalog the search engine ships, lexical + embedding match). Unknown id → `can:false` +
  honesty alternative (the moat).
- **Adding a tool = adding a catalog row.** Zero retrain. The model only needs to know the
  *shape* of capability (the 8 surfaces), which is fixed and small.

Training data teaches the *surfaces and the honesty discipline*, not specific ids. We may
include a sample of real ids for grounding, but the resolver, not memorization, is the
source of truth. This is the versionless core of the whole product: **the brain conducts;
the registry holds the instruments.**

---

## 6. Multilingual & multimodal — already terminal, kept terminal

- **Languages:** the brain stays English; the **translate-in/out shell** handles every
  language (verified in search for Persian). New language = a translation pair, never a
  retrain. (Browser `Translator` API fast-path + Opus-MT fallback, per existing design.)
- **Vision:** SmolVLM's vision tower is **frozen** and proven (arad 2026-05-28, 9/10
  probes, invoice OCR exact). Images flow through it at inference; the LoRA + heads consume
  the embeddings. `mediaNeed` routes OCR/image-search. New visual task = data, not arch.
- **Audio / new modalities:** handled the same way images are at train time — a described
  placeholder (`[AUDIO: <transcript/description>]`) so the planning head learns to plan
  from modality *context*; the real modality is decoded by a frozen front-end (Whisper-tiny
  class, on-device) at inference. Adding audio is additive, no backbone change.

---

## 7. Calibration, abstention, safety (the guardrails, made reliable)

- **Confidence head → abstention.** Temperature-scaled on a held-out set so the scalar is a
  real probability. Engine policy: `conf < τ_low` → ask a clarifying question (`ask` slot)
  or fall to the deterministic floor instead of acting; `conf ≥ τ_high` → act. This is the
  principled version of "don't guess."
- **Safety head → deterministic guardrails.** medical/legal/financial/crisis → force the
  "refer to a human expert" framing; destructive → force confirm-before-act. These no longer
  depend on the prose recalling a system-prompt rule — a classifier decides, the engine
  enforces. This is how you make honesty/safety a **property of the system**, not a hope.
- **Honesty moat preserved:** `can:false ⇒ non-empty alternative` stays enforced at serve
  (it already passes 100%); the safety head strengthens, never weakens, it.

---

## 8. Training regime (multi-task, on the 3070)

One run, multi-task loss on the shared backbone:

```
L = L_gen                              # masked-LM over the JSON target (as today)
  + λ_role · CE(turn_role_head,  gold_role)
  + λ_cont · CE(goal_cont_head,  gold_continuation)
  + λ_med  · CE(media_head,      gold_mediaNeed)
  + λ_safe · CE(safety_head,     gold_safety)
  + λ_conf · BCE(conf_head, 1[plan_exactly_correct])     # self-supervised target
  + λ_cons · consistency(role, continuation)             # role∈continuation-class must agree
```

- **What trains:** LoRA on the language layers (as v3) **+** the 5 head matrices (full, they're
  tiny) **+** optionally unfreeze the top 1–2 text layers at low LR for the heads to shape a
  better `h*`. Vision tower stays frozen.
- **λ schedule:** start gen-heavy, ramp the head λ's after warmup so the backbone first
  re-learns the JSON skill, then sharpens the probes. `λ_cont` highest (the linchpin).
- **Hyperparams (proven family):** LoRA r=64 / α=128 (v4 raised from r=32 per the
  chain-capacity finding), 7 epochs, lr 1e-4 cosine, warmup 0.03, bf16, eff. batch 8,
  dynamic per-batch padding. ~6–8 h on the 3070 (fits in <2 GB VRAM as measured).
- **Data:** regenerate the Gemini-Pro multi-turn set **with the running-goal line** and
  **gold continuation/safety labels**, balanced by the `slot-enumerator` Phase-1.5
  role-boost (already tuned to the confusion matrix: outcome/chitchat heaviest). ~18–20 k
  turns. The teacher labels are the oracle for the heads.
- **Data flywheel (the no-v5 quality path):** log real production turns (privacy-safe,
  on-device-consented) → periodically re-distill with the same teacher → retrain heads (+
  LoRA) on the **same architecture**. Quality compounds via data; the design never moves.

---

## 9. Export & serve (≤180 MB, in-browser)

- **Export:** ONNX graph with **multiple outputs** — `lm_logits` (for decode) **and** the 5
  head logits read at the last prefill position. int8/int4 quantize as today; the heads add
  negligible size → **stays under the 180 MB budget** (v3 is 165 MB; heads + grammar tables
  are KB). AES-256-GCM encrypt → HF → `/api/ai-key` handshake (all unchanged).
- **Serve (`brain-runtime.ts`) — custom prefill→decode loop** (replaces the high-level
  `text-generation` pipeline, which can't surface extra outputs or mask logits):
  1. `session.run(prompt)` → read **head logits once**: `turnRole`, `goalContinuation`,
     `mediaNeed`, `confidence`, `safety`.
  2. Autoregressive decode of the JSON tail under the **grammar mask** (§4) → guaranteed
     valid object for `goal/chain/params/style/remember/ask/reply`.
  3. **Merge:** head argmax overrides the generated slot it owns; `parsePlan` keeps the rest
     and the repair fallback. `confidence`/`safety` drive engine policy (§7).
- **Graceful fallback chain (never a blank turn):** custom loop fails → high-level pipeline
  (v3 behavior) → `parsePlan` repair → deterministic regex floor in `oioxo-engine.ts`. Same
  fail-soft discipline already in place.
- **Both front doors:** the merged `BrainPlan` is consumed by `oioxo-engine.respondCore`
  **and** `oioxo/router/brain-v3.js` (search.html). Per PLATFORM_BODY §2/§3D, v4 lands the
  one `decideMove` dispatch so the same plan drives chat and SERP. (Cross-organ unification
  is trigger #5; this architecture makes it a wiring task, not a model task.)

---

## 10. Ship gates (per-head, raised)

Retrain ships only if ALL hold on the held-out 207+ set:

| gate | v3 | v4 target | mechanism |
|---|---|---|---|
| JSON-valid | 93.2% | **100%** | constrained decode (§4) |
| chain-typecheck | 87.9% | **≥99%** | constrained decode |
| **turn-role** | 67.6% | **≥90%** | turn-role + goal-cont heads (§2) |
| goal-continuation | — | **≥92%** | new head (the linchpin) |
| mediaNeed | (in JSON) | **≥95%** | head |
| honest (alt named) | 100% | **100%** | preserved + safety head |
| confidence calibration | — | ECE ≤ 0.05 | temperature scaling (§7) |
| reply quality (Gemini-judged) | baseline | **≥ v3** | LoRA freed by constrained decode |

`eval_smolvlm_brain.py` extends with per-head accuracy + the confusion matrix per head and
the calibration (ECE) report. The SERVE-PATH section stays (now should read ~100/≈99).

---

## 11. Build plan (phases)

1. **Schema & data** — add `Current goal:` to the prompt contract (trainer + `brain-runtime`
   in lockstep); regenerate Gemini-Pro data with gold `continuation`/`safety` + running-goal;
   apply the tuned role-boost. *(Decision needed: confirm enum for safety classes.)*
2. **Model** — add the 5 heads to the training graph; multi-task loss; consistency term.
3. **Train** on the 3070 (r64/7ep); eval per-head; iterate data, not arch, until gates pass.
4. **Constrained decode** — implement the grammar logits-mask in a JS prefill→decode loop.
5. **Export** multi-output ONNX → quantize → verify ≤180 MB → encrypt → HF.
6. **Serve** — custom loop + head-merge in `brain-runtime.ts`; fallback chain; wire to both
   front doors (`decideMove`).
7. **Verify** headless on both surfaces, multilingual, with the same `_oioxo_diag` discipline.

Phases 1–3 are the GPU work; 4–6 are TS/engineering; nothing here is a base-model swap.

## 12. Risks & honest trade-offs

- **Custom decode loop in transformers.js** is the real engineering cost (no off-the-shelf
  grammar + multi-output support). *Fallback:* ship heads-only first (override slots) on the
  existing pipeline; add constrained decode in a second pass — both on the same trained model.
- **Multi-output ONNX export** must expose the prefill hidden state / head logits. If optimum
  resists, export the heads as a **tiny second ONNX** over an exposed `last_hidden_state`
  output — still one logical model, one download, a few KB. Architecturally identical.
- **Head/generation disagreement** is by design resolved (head wins); the consistency loss
  minimizes it during training so the prose `reply` matches the head decision.

---

## 13. Why this is the last architecture (the no-v5 argument)

Every axis along which an "AI in 2026" must grow is handled **without touching the
backbone or the design**:

- **New tools / surfaces / skills** → catalog rows + retrieval resolver (§5). No retrain.
- **New languages** → translation pairs in the shell (§6). No retrain.
- **New modalities** (audio, etc.) → frozen front-end + described placeholder (§6). Additive.
- **New discourse axis** → one more linear head on the same trunk (§2). Additive, heads-only retrain.
- **Quality / drift** → data flywheel re-distill on the same architecture (§8). Compounds.
- **Structural correctness** → constrained decode is size-independent (§4). Already maxed.
- **Bigger device budget later** → swap the backbone weights behind the *same* contract and
  heads; the serve/engine/search code is unchanged. The architecture survives a model upgrade.

The design is **a conductor (one small backbone) reading a few reliable dials (heads),
constrained to speak a valid language (grammar), binding to instruments it looks up at
runtime (retrieval), in any human language (shell).** That is a complete, closed set of
mechanisms for an on-device agentic front door. We mature it once, here, and after this we
ship *data and registries* — not architectures.
