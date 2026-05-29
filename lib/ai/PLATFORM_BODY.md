# oioxo — the platform as one body

The search engine, the AI brain, the tools/services, and the games are **organs of
one body**. The user types ONE thing, in ANY language, and the body decides what to
do and gives the best result. This doc is the single map of how the organs connect,
every known problem, and the rule for when we retrain the brain (v4).

> Constraint that shapes everything: **no bigger LLM** (≤180MB on-device budget; the
> brain is SmolVLM-256M / 165MB). Training costs us. So we **maximise deterministic
> quality + complete the problem inventory FIRST, then do ONE good v4 retrain** that
> fixes only the real model-level gaps.

---

## 1. The body — one front door, four organs

```
   ANY prompt, ANY language
            │
   ┌────────▼─────────┐   translate.toEnglish() (multilingual shell — brain is EN-only)
   │   FRONT DOOR      │
   │  (the conductor)  │   reads message + history + file → picks the MOVE
   └──┬────┬────┬───┬──┘
      │    │    │   │
  talk│ answer│ tool/service│ game
      ▼    ▼    ▼   ▼
  ┌──────┐ ┌─────────────────────────┐ ┌──────────────┐ ┌────────┐
  │persona│ │ SEARCH ⊕ AI (together): │ │ 400+ tools / │ │ games  │
  │ reply │ │ search reads web →      │ │ apps /       │ │ (chat- │
  │       │ │ AI synthesises a CITED  │ │ studios      │ │ driven)│
  │       │ │ answer in user's lang   │ │ (convert/edit│ │        │
  └──────┘ └─────────────────────────┘ │ /generate)   │ └────────┘
            translate.fromEnglish()      └──────────────┘
```

**The two organs that must BOTH be best, and must collaborate:**
- **Search** = retrieval (≈30 CORS-clean federated sources, on-device, private).
- **AI** = understanding (route the move) + synthesis (read search → cited answer) + voice.
- They collaborate on the *answer* move: search gathers, AI reads-and-writes. Neither alone is enough — search without AI is ten blue links; AI without search is stale/hallucinated.

---

## 2. The integration GAP (the most important structural problem)

Today there are **two front doors, not one**:
- `oioxo/search.html` → `search()` (its own brain bridge `brain-v3.js`).
- `newxonvert/lib/ai/oioxo-engine.ts` → `respondCore` (the chat shell, its own engine).

They share concepts and the same trained brain, but they are **separate code paths
with separate routing**. For the body to "work together," the SAME conductor decision
(talk / answer / tool / game) must drive BOTH surfaces. Unifying the front door (one
`decideMove` → one dispatch table consumed by both search.html and the chat shell) is
the highest-leverage *architecture* task after the brain is reliable.

---

## 3. Complete problem inventory (the "find all problems before v4" list)

### A. Search organ — FIXED this pass (commit `fix/oioxo-search-render`)
- ✅ Render crash (PR222) — every query was blank.
- ✅ Cold-model freeze (PR224/226) — first query blank 10-30s.
- ✅ Entity resolution (PR225) — "who is elon musk" → Elon (was Errol).
- ✅ Foreign-card noise (PR223/226) — translated cards no longer top results.
- ✅ Entity-panel on non-lookup queries (PR221).
- ✅ How-question misclassification (PR227).

### B. Search organ — STILL OPEN (ranking/answer quality)
- ⬜ **Card-list relevance**: academic/token junk ranks high ("AK-47" under a math
  result, "Scaling QA to the Web" for "tallest mountain"). → the warmed cross-encoder
  reranker is the fix; needs a reliable warm-on-load path.
- ⬜ **Recommendation queries** ("best X 2026") surface noise — needs the
  community/forum tail (Reddit/SearXNG are CORS-blocked; route via on-device
  JSONP/Common-Crawl per `project_oioxo_web_sources`).
- ⬜ **AI overview suppressed** when an instant answer is present — sometimes the
  instant answer is weak; decide when overview should also show.
- ⬜ **Graceful degradation**: when `/api/entitlement` hiccups, render free-source
  cards anyway (don't let the gated providers zero the SERP).

### C. AI brain (v3) — model-level gaps (the v4 targets)
v3 ship-gate result (eval_smolvlm_brain.py): JSON-valid 93.2% ✓ · **turn-role 67.6% ✗
(gate 82)** · Honest 100% ✓ · **chain-typecheck 87.9% ✗ (gate 95)**.
- ✅ **JSON-valid + chain-typecheck** — now lifted toward 100% at SERVE time, no
  retrain, via the repair pass in `brain-runtime.ts parsePlan` (balance-close
  truncated JSON, strip decoder loops, drop malformed steps, enforce honesty alt).
- ⬜ **Turn-role 67.6%** — the real model gap. Two-part v4 fix:
  1. **Architecture**: split turn-role into a tiny dedicated CLASSIFIER head
     `(message+history)→role`. 8-way classification is what a generative 256M does
     worst and a small encoder does best (90%+). This is the "team of specialists".
  2. **Data**: the new confusion matrix (eval) says WHICH roles conflate; the
     role-balance boost phase (slot-enumerator Phase 1.5) over-samples the rare
     roles. Tune boost counts from the confusion output, then regenerate Gemini-Pro
     data (r=64 LoRA, 7 epochs, ~15-20k balanced turns).

### D. Cross-organ / whole-body
- ⬜ **Unify the front door** (§2) — one conductor decision drives both surfaces.
- ⬜ **Search⊕AI answer loop** — on an answer query, search must hand its top read
  passages to the brain's synthesis (cited), on BOTH surfaces, in the user's language.
- ⬜ **Service/game routing** — "play a game" / "convert this" must route from the same
  front door, conversationally, not as a separate keyword path.
- ⬜ **Multilingual end-to-end** — verify the translate-in/translate-out shell on every
  surface (search instant answers already work in Persian; chat needs the same audit).

---

## 4. The rule for WHEN to retrain (v4 trigger)

Retrain only when ALL of these hold (so one expensive run fixes the real gaps):
1. The **repair pass** has shipped and we've re-measured — confirm JSON-valid and
   chain-typecheck are effectively solved at serve time (so v4 only needs to fix
   turn-role + reply quality, not structure).
2. The **confusion matrix** has run on arad against the v3 checkpoint — we KNOW which
   roles conflate (not a guess).
3. The **role-boost counts** in the enumerator are tuned to those weak roles.
4. The **turn-role classifier head** design is decided (separate head vs in-plan).
5. The search/whole-body problem inventory (§3 B,D) is catalogued so the brain's
   routing targets match the real surfaces it must drive.

Then: regenerate Gemini-Pro data → train (r64 / 7ep) on the 3070 → eval → ship ONLY if
turn-role ≥ 82 AND chain-typecheck ≥ 95 AND honest = 100. Same discipline that took the
conductor v1→v2 (82/82/100 → 94/84/100).

---

## 5. What was done this pass (toward the trigger)
- Search organ: 8 render/ranking fixes (committed).
- Brain serve reliability: `parsePlan` repair pass (JSON + chain + honesty).
- Diagnosis tooling: per-role confusion matrix in `eval_smolvlm_brain.py`.
- v4 data prep: role-balance boost phase in `slot-enumerator.ts`.
- This map.
