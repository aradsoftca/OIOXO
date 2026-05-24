# oioxo Code — spec

Frontier-level coding **on the user's device**, without big models — by making the
device's own correctness machinery (compiler, type system, test runner, runtime,
the real project) the oracle, and a small model the conductor. Sibling of
[ANSWER_BRAIN.md](../ai/ANSWER_BRAIN.md); same philosophy, applied to code.

Supersedes the 2026-05-23 reshape ("tiny can't code → download a big specialist
coder"). The big coder becomes an *optional heavy tier*, not the core.

## 0. Decision: separate surface, shared core

- **Separate surface** — `oioxo Code` is its own full workspace (editor + file
  tree + terminal + diff + AI panel), its own route/app, free to grow bigger than
  the oioxo chat. (Today: the `/oioxo` Code tab + `app/oioxo/CodeAgent.tsx`.)
- **Shared platform core** — conductor model, on-device runtime, search, P2P
  weight distribution, hardware tiering. Coding *reuses* the platform.

## 1. The bet

A **small** coder (0.5–3B, sized to hardware — not 32–70B frontier) inside a tight
**execute → repair** loop reaches frontier-level *correctness* on **verifiable**
tasks. The model is a weak one-shot writer; the loop + exact tools make it
correct. Correctness is **proven** (tests ran), not predicted. Two asymmetries:

1. **Verifying is cheap+exact; writing is hard.** Invert it: weak generate + exact
   verify + cheap iteration. The device is a free verification engine.
2. **The compiler/test-runner never hallucinate; weights do.** Ground generation
   in the real type system; prove behavior with the real test runner.

On-device, the model also has what a cloud chat box never does: the **live
project, live types, live runtime** — higher-fidelity signal.

## 2. The core loop (the "art of generate-and-verify")

```
request ("build X" / "fix Y" / "add feature Z")
  │
1 UNDERSTAND  (tiny brain) → intent + plan (new app | edit | fix | feature)
2 RETRIEVE    (no recall)  → exact signatures from the real project + lib type
                             defs; for NEW things → SEARCH web/docs/npm → grab
3 GENERATE    (constrained)→ draft under grammar + TYPE constraints (in-browser
                             tsc/LSP prunes invalid); sketch-with-typed-holes →
                             type-directed fill. A small model can't emit
                             invalid/hallucinated code.
4 EXECUTE     (oracle)     → run on-device (WebContainer / Pyodide / WASM); run
                             tests + capture compiler/runtime errors = ground truth
5 REPAIR      (loop)       → exact error + code slice → minimal edit → re-run;
                             iterate until green (small model = fast iterations)
6 REMEMBER                 → cache verified solutions/repairs (device knowledge base)
```

`lib/oioxo/codeloop.ts` is the deterministic orchestrator (steps 4–6 + driving
3); the model and the runner are injected, so the loop is the same whether the
generator is the small coder or (heavy tier) a downloaded big one.

## 3. The two user scenarios

- **"Build me an app" / "correct this"** → fully on-device: scaffold (template) +
  the generate→execute→repair loop against the live project. No network needed.
- **"Something new" (unknown lib/API)** → **search → grab → use → verify**: find
  docs/snippets/types on the web, install/fetch them, generate against the *real*
  retrieved types, prove with execution. Like frontier's get/design/use — but the
  using is grounded and verified.

## 4. Tiers (in-app and in-browser)

| Tier | Runs | Coder | Execution |
|---|---|---|---|
| **Browser / PWA** (max reach) | any Chromium | small coder via web-llm (WebGPU) | WebContainer (Node), Pyodide (Python), WASM |
| **Native / Tauri** (heavy, later) | desktop+mobile | optional **bigger** downloaded coder (llama.cpp), full GPU | real filesystem + real process exec |

P2P (the Send/WebRTC stack) distributes weights → near-zero egress.

## 5. Substrate that already exists

- `lib/oioxo/webcontainer.ts` — WebContainer boot/mount/run (the **execution
  oracle**); COOP/COEP isolation already on.
- `lib/oioxo/fs.ts` — File System Access (real folders/files, Chromium).
- `lib/oioxo/runtime.ts` — web-llm loader + `chatStream` (the generator today;
  Qwen2.5-Coder via WebGPU).
- `app/oioxo/CodeAgent.tsx` — the workspace (open folder, tree, editor, save,
  run, AI chat). Currently *gated on* downloading a coder — the new core removes
  that gate for the loop-driven default.
- `lib/oioxo/hardware.ts` / `skills.ts` / `useSkills.ts` — tiering + model catalog.

## 6. What's missing (the build)

1. **Execute–repair loop** — `codeloop.ts`: generate → run/test → parse errors →
   repair → iterate. *(starting now)*
2. **In-browser compiler/types** — `@typescript/vfs` + the TS service for
   type-constrained generation + instant error feedback (no full run needed for
   type errors).
3. **Retrieval** — index the open project + lib `.d.ts`/signatures (reuse the
   embeddings stack) → feed exact APIs, never recall.
4. **Search-grab-fix** — for unknown libs: web/npm/docs search → fetch types →
   generate against them.
5. **Small-coder default** — pick the smallest viable coder per hardware; the loop
   carries correctness. Big coder = opt-in heavy tier.
6. **Train the conductor for loop roles** (arad, like writer8): plan, rank
   type-valid candidates, error→minimal-fix. Not world-knowledge of code.

## 7. Phasing

- **P1 — the proof:** `codeloop.ts` + WebContainer → "implement-to-pass-tests"
  and "fix-this-error" run end-to-end (generate→run→repair→green). *(start)*
- **P2:** in-browser tsc → type errors feed the loop without a full run; basic
  type-constrained drafting.
- **P3:** retrieval over project + lib types (no API recall).
- **P4:** search-grab-fix for new libraries.
- **P5:** Tauri native tier (real exec/FS + optional big coder).
- **P6:** distil the small conductor for the loop roles.

## 8. Honest scope

Matches/beats frontier on **verifiable** tasks — most real work: implement-to-tests,
fix-error, type-correct API use, refactor, migrate, write tests, glue modules.
Weaker at vague architecture-from-nothing or domains with no fast verifier (the
small model's reasoning ceiling). Frontier-level *correctness on the verifiable
majority*, offline + private — not an AGI architect.
