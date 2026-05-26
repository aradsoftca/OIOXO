# oioxo Brain — Master Plan

The single source of truth for making the oioxo AI **aware of its whole action
space** and good across it. Extends [`ANSWER_BRAIN.md`](./ANSWER_BRAIN.md) (the
answer system) to the full conductor: answering, **writing**, transforming,
planning, teaching, reasoning, and **driving the 300+ tools / apps / games we
already have wired**.

Status legend: ✅ done · 🟡 in progress · ⬜ todo.

---

## 0. The two hard constraints (from the product owner)

1. **360M is the absolute model ceiling.** Never bigger. Every capability —
   including long-form articles — must be delivered within ≤360M params, balancing
   **performance · speed · quality**. We do NOT add a 1–3GB download tier for
   articles; instead the *engine orchestrates* a ≤360M model (gather → read →
   assemble → write section-by-section) so structure comes from code, prose from
   the small model.
2. **The tools already exist and are wired.** Converters, PDF tools, image/audio/
   video editors, text/dev/calc/color/time/finance/seo/subtitle ops, games, apps —
   all have execution paths today (see [`eval/coverage.ts`](./eval/coverage.ts)).
   The gap is NOT capability. **The gap is the brain that decides _when to use
   what_ — it is still regex/keyword, not trained.** Training the conductor to be
   aware of and route this space is the centerpiece.

---

## 1. What the engine is today (honest inventory)

[`oioxo-engine.ts`](./oioxo-engine.ts) `respondCore` is already a conductor over a
large action space, but every decision is a **deterministic regex/keyword floor**:

| Decision point | Function | How it decides today |
|---|---|---|
| safety gate | `safetyReferral` | regex (medical/crisis) |
| math | `tryCompute` | regex + parse |
| creative handoff | inline regex | regex |
| maps | `detectGeoIntent` | regex |
| talk vs answer vs offer | `decideMove` | regex |
| follow-up resolution | `rewriteFollowup` | pronoun regex |
| **route** (chat/code/game/tool/image/summary/article/app/answer) | `decideRoute` | **regex + keyword retrieval** |
| tool recovery | `refineRouteWithEncoder` | embedding cosine (cold-fallible) |
| **answer shape** (fact/define/explain/compare/list/howto/recipe/code) | `comprehendAnswer` | **regex** |
| evidence ranking | `rerank` | ✅ **trained cross-encoder (live)** |
| answer assembly | `readAnswer` | extract→assemble→verify (untrained encoder stand-in) |

Trained today: **only the reranker.** Everything that decides *what to do* is
hand-written rules. That is what makes the AI feel "dumb" at the edges and what we
now train.

---

## 2. The master action space (the coverage checklist)

The conductor must recognize and correctly handle every item below. Each is tagged
with the **machine** it needs, so datasets are generated per-machine:
`talk` · `search→answer` · `search→write` · `pure-write` · `transform` · `plan` ·
`tool` · `compute` · `app` · `media` · `limit`.

### TALK  (machine: talk)
chitchat · emotional support · opinion-about-itself · pep talk · acknowledgement

### ANSWER  (machine: search→answer)
fact · define · explain · causal(why) · compare · list · verify/myth-bust ·
quantity · person · people(current) · multipart · timeline · biography ·
stats/trends · topic-overview · recent/current

### WRITE  (machine: search→write OR pure-write)
- **research article** (search→write) ← flagship
- essay · report · review · explainer
- email · letter · resume · cover-letter · bio · social post · marketing copy
- creative: story · poem · script · joke · lyrics  *(quality-capped, honest)*
- outline / structure

### TRANSFORM  (machine: transform — acts on the user's supplied text)
rewrite/paraphrase · proofread/grammar · tone-shift · shorten · expand · simplify ·
summarize-given-text · extract key points/action items · reformat (bullets↔prose) ·
translate

### PLAN  (machine: plan — structured multi-step, light search)
trip itinerary · meal plan · workout plan · study schedule · project breakdown ·
budget · event plan · checklist

### TEACH  (machine: search→write + structure)
lesson · quiz/flashcards · practice problems · study guide · level-adjust(ELI5↔expert) ·
homework help · analogies

### REASON / DECIDE  (machine: plan/answer)
help-me-decide · analyze-situation · estimate/Fermi · troubleshoot/diagnose ·
critique/feedback · debate both sides · risk assessment

### DO-WITH-A-TOOL  (machine: tool — the 300+, route to the right one)
convert · compress · resize/crop/rotate · edit image/audio/video · pdf ops ·
text ops · dev/crypto ops · color · calc · time · finance · seo · css · subtitle ·
combine/merge · batch — file-aware (same name across image/pdf/video picks by file)

### CODE  (machine: app/handoff)
write · debug · explain · review/refactor → Coding workspace

### COMPUTE  (machine: compute — on-device, exact)
arithmetic · percent · unit conversion · rate

### APP  (machine: app)
call · send · group chat · screen-share · clipboard · watch-together

### MEDIA  (machine: media — show/transcribe, never "see")
show images · "what does X look like" · video-transcript answer + cite · map/widget

### LIMIT  (machine: limit)
out-of-scope · unsafe · pure-creative-from-nothing → honest, kind decline

---

## 3. The team of tiny specialists (all ≤360M)

| Specialist | Size | Job | Status |
|---|---|---|---|
| **Conductor** (stateful agent, encoder + heads / tiny decoder) | ~50–135M | `(message, file, history, GoalState)` → updated `{goal, chain, turn-role, boundary+alternative, params, media-need, style}` — the **agentic awareness + planning** brain (§3.5) | ⬜ **train (centerpiece)** |
| **Reranker** (cross-encoder) | 23MB | rank evidence by answer-bearing relevance | ✅ trained, live |
| **Writer** (decoder) | **≤360M** | turn a brief into a good answer/write/transform/plan/teach output, in persona, style-conditioned, copies facts verbatim | 🟡 135M failed / 360M trained-untested |
| **NLI Verifier** (tiny head) | tiny | does the output follow the evidence? gate before shipping | ⬜ later |

Everything volatile (facts, the tool list, locale, media) stays **data**, fed at
runtime — so new tools need no retrain (the conductor emits a tool *id* against the
live capability graph).

---

## 3.5 The AGENTIC CONDUCTOR — the core of "best-ever AI"

The conductor is NOT a single-turn router. It is a **stateful agent** that holds a
running goal across the conversation and reasons about it every turn. This is the
hardest and highest-value capability, and the thing that makes the product feel
intelligent rather than canned.

### The running state (carried turn to turn)
```
GoalState = {
  goal:        what the user ultimately wants ("convert pdf→jpg, pages 3&5, email it")
  chain:       the ordered capabilities to reach it [pdf→jpg(pages), → email]
  done:        which steps are complete + their outputs (the converted files)
  pending:     what's still needed (a file? a parameter? a confirmation?)
  boundary:    which chain steps we CAN do vs CAN'T (and the nearest alternative)
}
```

### The per-turn agent loop (runs on EVERY message)
1. **PERCEIVE** — message + attached file(s) + full history + GoalState.
2. **CLASSIFY THE TURN'S ROLE** relative to the current goal — the crux:
   `new-goal` · `parameter/constraint` ("just page 3 and 5") · `append-step`
   ("and then email it") · `correction` · `question` · `confirmation` · `chit-chat`.
   A message is rarely a fresh request; usually it MODIFIES the running goal.
3. **RE-PLAN THE CHAIN** — decompose the (updated) goal into an ordered list of
   capabilities against the live capability graph + tool registry; flow parameters
   between steps (pages 3,5 → the pdf→jpg tool; its output → the next step).
4. **KNOW THE BOUNDARY** — for each step, do we have a tool/action? For a step we
   CAN'T do (e.g. send email), find the **nearest thing we CAN do** (draft the email)
   — never a bare "no".
5. **NARRATE + ACT** — tell the user the plan honestly ("I can do 1,2,3 but not 4 —
   want me to do X instead?"), run the doable chain, surface results, ask for the one
   missing piece when blocked.

### Example (a SAMPLE, never hardcoded — the skill generalizes to infinite phrasings)
```
U: can you convert pdf to jpg
A: [goal=convert pdf→jpg; pending=file]  Sure — send the PDF and I'll convert it.
U: <file> just page 3 and 5
A: [turn-role=parameter; chain=pdf→jpg(pages 3,5)]  On it — pages 3 and 5 → JPG. [runs tool]
U: and then email it to my mom
A: [turn-role=append-step; boundary: email = CAN'T; nearest = draft]
   I converted pages 3 & 5. I can't send email directly, but I can write the email
   for you to send — want me to draft it to your mom?
```

The model TRAINED to do this is the conductor; the deterministic capability-graph
planner ([[project_ai_brain_architecture]]) is its floor. New tools change the graph
(data), not the model.

## 3.6 Multimodal — ANALYZE AT THE MOMENT (no pre-baked knowledge)

Same offload principle as the answer engine, applied to inputs: the AI does not need
to *know* about the thing in advance — it **understands it in the moment** by
extracting + searching + analyzing.

```
image + "what is it"        → image-similarity search → identify → answer (cited).
                              (won't beat frontier vision; similarity+search gets far.)
product photo + "ok for X?" → OCR the label → extract ingredients/values
                              → SEARCH "what's bad for <condition>"
                              → ANALYZE the OCR against the findings
                              → grounded DECISION (+ the existing advice/safety footer).
```

We ship NO vision model (90mb story). We extract what we can (OCR, image-similarity,
metadata), gather knowledge, and reason over it at runtime — honest about the limit,
tricky enough to pass most real cases. The conductor's `media-need` + the analyze
stage own this; tools (OCR, image-search) are already wired.

## 4. The flagship — research-article writer **within 360M**

Long-form is an **orchestration**, not a big-model call:

```
question/topic
  → CONDUCTOR: action=write/article, plan an OUTLINE (3–6 section headings + the
    sub-question each section answers)  [tiny model or deterministic outline]
  → for each section (in parallel where safe):
        SEARCH (broad, section-specific queries)
        RERANK + READ → a section BRIEF (cross-checked, cited)
        WRITER (≤360M): write THAT section from its brief, in persona  ← small, bounded job
  → ASSEMBLE: stitch intro + sections + conclusion, dedupe, add citations
  → VERIFY each section against its brief (NLI head)
```

Why this fits the ceiling: the 360M model never has to "hold" a whole article — it
writes one well-grounded section at a time from supplied notes (its proven strength:
fuse + phrase, copy facts). Structure, length, and coherence come from the engine.
Default = tight 3–4 paragraph explainer; full multi-section piece when the user asks
for "article / report / deep dive."

---

## 5. The build — BOTH TRACKS IN PARALLEL

Per the owner: design the full spec, then generate **both** datasets and train
**both** on arad. Reliability contract holds throughout — every regex floor stays as
the fallback; the trained model only *refines* it; junk output → floor.

### Phase 1 — Spec (this doc) ⬜→✅
Lock the action-space map + per-machine tags. Done = this file reviewed.

### Phase 2a — CONDUCTOR dataset + train  (the AGENTIC "when to use what" brain, §3.5)
This is the centerpiece. The data must teach the per-turn agent loop, not just
single-turn routing.
- **Data engine** (auto + frontier teacher):
  - SINGLE-TURN floor: auto-label from the **registry + capability graph + apps/games**
    — every tool/app → many natural phrasings → `{action, id}` (reuse
    `oioxo-tools-eval.ts` coverage, 322/323 reachable, as *labels*).
  - **MULTI-TURN AGENTIC TRAJECTORIES (the hard, novel part)**: a frontier teacher
    (Gemini-Pro) generates DIVERSE multi-turn dialogues over OUR capability set, each
    labeled per turn with `{turn-role, updated GoalState, chain, boundary+alternative,
    extracted params}`. Cover: parameter-mid-chain (pages 3,5), append-step, can't-do→
    offer-alternative, correction, missing-input asks, file-aware. **Diverse phrasings
    so it learns the SKILL, never the sample cases** (the model-first rule).
  - **MULTIMODAL (§3.6)**: trajectories for image+question and file+analyze →
    `{media-need, extract-op (ocr/similarity), search query, decision}`.
- **Train** on arad: a tiny stateful conductor (encoder + heads, and/or a small
  decoder emitting the plan) ≤135M. Replaces `decideRoute`/`comprehendAnswer`/
  `decideMove`/`rewriteFollowup` as primary; regex + capability-graph planner stay as
  the floor (reliability contract).
- **Eval**: extend `oioxo-route-eval.ts` + `oioxo-tools-eval.ts` AND add a multi-turn
  agentic battery (goal-tracking, chain correctness, boundary honesty, param
  extraction). Target ≥ regex everywhere + wins on paraphrase / mid-chain / append /
  can't-do-offer.

### Phase 2b — WRITER dataset + train  (full coverage, ≤360M)
- **Data engine** = extend [`eval/gen-fusion-data.ts`](./eval/gen-fusion-data.ts):
  same Gemini-Pro teacher, but the question/task set now spans the **whole §2 map**
  (answer + write + transform + plan + teach), each shape style-conditioned, from
  real on-device gathered notes; teacher writes the target under the shared prompt
  contract; flash judges faithful+substantive.
- **Size**: grow from 307 → ~3–5k balanced examples (audit the per-shape mix; the
  old 45% fact/define imbalance must not return).
- **Train** on arad: SmolLM2-**360M** (the proven ceiling pick) full-FT, loss masked
  to the target. (135M only if a re-eval on the bigger set proves it clears the bar —
  otherwise 360M is the shipping writer.)
- **Section mode**: include article-section examples (write one section from a brief)
  so the flagship orchestration has a trained writer.
- **Eval**: [`eval/fusion-eval.ts`](./eval/fusion-eval.ts) extended to all shapes —
  ship only if writer > extractive floor; gap to Gemini = headroom.

### Phase 3 — Wire + measure live
Conductor → in front of routing; writer → behind `readAnswer`/article orchestration.
Run `answer-battery.ts` (the auto-judged regression harness) before/after; expect the
per-class scores to rise across the board, not just facts.

### Phase 4 — NLI verifier head
Train the entailment gate (same arad loop) so the conductor trusts/rejects its own
output; replaces the word-overlap grounding check.

---

## 6. Reliability contract (unchanged, applies to every trained piece)

A deterministic floor always produces a usable result with **no model**. The trained
conductor/writer/verifier only ever **refine** the floor. Junk model output falls
back to the floor. The cold / WASM / offline / not-entitled path is never worse than
today. (Same contract as the reranker and `goal.ts`.)

---

## 7. arad (the training box) — quick reference

`ssh -i C:/Users/honar/.ssh/id_desktop arad@10.0.0.217` · RTX 3070 8GB · workdir
`C:\science\brain` · python = `C:\science\.venv\Scripts\python1.exe` · remote shell
cmd.exe (`&&` chains) · `set "PYTHONUTF8=1"&&` for trl · `set "HF_HUB_OFFLINE=0"&&`
to up/download · long jobs via `wmic process call create "cmd /c run.bat"` · verify
artifacts, not exit codes. Datasets/recipes proven end-to-end for the reranker and
the fuser — both new datasets follow the same loop.
