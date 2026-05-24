# oioxo IDE — fork spec (the developer surface)

The flagship developer product: a full **oioxo IDE** built on the same open base
every serious AI editor sits on (Code-OSS — the MIT core of VS Code: Monaco +
Electron + extension host), with our verified on-device loop ([OIOXO_CODE.md](./OIOXO_CODE.md))
as the agent and our licensing gate ([LICENSE.md](./LICENSE.md)) for Pro. NOT a
second platform — the same `lib/oioxo/*` brain, a second surface. oioxo.com (the
browser app) stays the zero-install consumer side.

> Status: **scoped, not started.** This is the large bet. Everything below is the
> plan + the first week; the actual fork is a multi-week effort with its own repo.

## 1. Decision: which base (don't fork raw Code-OSS from zero)

| Base | Already done for us | Cost |
|---|---|---|
| **Void** (open-source Cursor alt, MIT) — *recommended* | Full VS Code fork **+ AI side-panel + BYOK + local-model plumbing already built**. Closest to "90% there." | Track its upstream + Void's own releases. |
| **Eclipse Theia** | Framework *designed* to build branded IDEs; VS-extension compatible; **OpenVSX built in**; less "fight Microsoft's release cadence." | More glue to assemble a product; smaller ecosystem than a Code-OSS fork. |
| Raw Code-OSS (Cursor/Windsurf/Antigravity path) | The pure editor core. | Perpetual rebase on MS releases + run your own marketplace. **Needs a team.** Avoid for now. |

**Recommendation: start from Void.** It already has the editor + an AI surface +
local-model wiring; we replace its model layer with our loop and rebrand. Theia is
the fallback if Void's rebase burden or architecture fights us. **Verify hands-on
in week 1 before committing** (clone, build, measure how cleanly our loop drops in).

## 2. What ports over unchanged (the leverage)

All of `lib/oioxo/*` is host-independent — it's invoked from a command, not bound
to the React UI:
- `codeloop` / `codegen` / `coderun` / `typecheck` / `retrieve` / `grab` — the loop.
- `bigcoder` (Ollama) / `tier` / `native` — tiers (and the IDE has a real terminal +
  fs, so the **native exec tier is free** — no WebContainer needed on desktop).
- `conductor` / `trajectory-store` — the data engine + trained brain.
- `entitlement` / `protect` / `pro-asset` / `entitlement-client` — the Pro gate.

The throwaway part is only the React workspace UI (`CodeAgent.tsx` editor/tree/
terminal) — the fork supplies all of that. We keep the **brain**, drop the **body**
we hand-built.

## 3. What the fork must add (the oioxo delta)

1. **Brand**: rename/skin to oioxo (white/gold/black), product name, icons, about.
2. **The agent**: an "oioxo: Build / Fix" command + side panel that calls
   `buildOrFix` against the open workspace folder (real fs, real terminal as the
   oracle). Reuse the loop verbatim.
3. **Model layer**: swap the base fork's model calls for our coder selection
   (`recommendModel` by hardware) + Ollama + frontier BYOK — all already built.
4. **Licensing**: wire `useEntitlement` / `pro-asset` so Pro unlocks Thorough mode,
   bigger models, the conductor brain (the desktop app can do strong obfuscation +
   OS-keychain token storage — stronger than the web gate).
5. **Marketplace**: point extensions at **OpenVSX** (forks can't use MS Marketplace).
6. **Trajectory capture**: the desktop loop feeds the same dataset (now from real
   project work with the native oracle = higher-quality signal).

## 4. First week (concrete, before committing the multi-week build)

- **D1–2**: clone Void + Theia; build both; spike "call `buildOrFix` from a command
  on an open folder, run the real test cmd as the oracle, write edits to disk."
  Pick the base from how cleanly that spike lands.
- **D3**: brand skin + the oioxo agent panel shell (no logic yet).
- **D4**: wire the loop end-to-end on a real repo (native exec oracle) — the proof.
- **D5**: licensing (entitlement + Pro gate) + OpenVSX; build a signed dev artifact
  on one OS. Decide go/no-go on the multi-week build from this.

## 5. Honest costs (go in clear-eyed)

- **Rebase treadmill** — even Void/Theia track upstream VS Code; budget for it.
- **OpenVSX** — smaller than MS Marketplace; every fork lives with it.
- **Code-signing + per-OS build pipeline** — real one-time engineering (Win/mac/Linux).
- **It's a desktop product** — complements, doesn't replace, oioxo.com. Two surfaces,
  one brain.
- **Sequence**: this is gated behind shipping the web app + the trajectory flywheel
  ([what's-next priority #1]); a flagship IDE with a still-v0 conductor is premature.

Relates to [[project_ai_platform_vision]] (forked-IDE + the loop as brain),
[[project_oioxo_licensing]], [[project_custom_model]] (the conductor it serves).
