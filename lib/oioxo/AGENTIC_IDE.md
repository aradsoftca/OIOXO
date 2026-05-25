# oioxo — the Agentic Web IDE (0→100)

A full coding agent + IDE that takes a project from **nothing to done** on its own —
plan, organize, scaffold, write, test, run, iterate — like a frontier agent (Cursor /
Claude Code / Codex), but the work runs **on the user's device**, and **we host
nothing**: we only *prepare* whatever the project needs to run in the browser.

This is the AGENT + SHELL around the verified engine in [OIOXO_CODE.md](./OIOXO_CODE.md).
The engine (generate→execute→repair, type oracle, search‑grab‑fix, best‑of‑N,
conductor) already exists; this spec is the autonomous orchestration + the IDE
surface on top of it. Same brain on web and desktop ([IDE_FORK.md](./IDE_FORK.md));
only the workspace/oracle substrate differs.

## 1. What "0→100" means (the agent)

A frontier‑style agent loop with a **visible session**:

```
goal → PLAN (tasks + files + checks)         ← conductor PLAN role / model
     → for each task:
         ACT  (tool calls: write/read/run/install/search/preview)
         VERIFY (the oracle: tsc / tests / runtime)   ← the engine
         REPAIR (best‑of‑N until green)
     → REMEMBER (trajectory → training data)
     → narrate the whole way (plan, diffs, runs — like a frontier agent)
```

The user sees a **session**: the plan with progress, the files being created/edited,
the commands run, the test results — not a code block in a chat. They can steer at
any step.

## 2. The agent's tools (a real tool‑use loop)

The model drives by calling tools; the device executes them:
`readFile` · `writeFile` · `listFiles` · `run(cmd)` · `installDep` (search‑grab‑fix) ·
`search` (web/docs) · `preview` (serve + iframe) · `scaffold(template)`. Each tool
result feeds back; the oracle gates progress. This is what makes it agentic rather
than a one‑shot generator.

## 3. Workspaces — one interface, three backends

The agent never cares *where* files live. A single `Workspace` interface, picked by
intent/environment (`detectTier` already exists):

| Backend | Where files live | Run/preview | Use |
|---|---|---|---|
| **Temp** (default web) | WebContainer **virtual FS** (in‑browser, no disk) | WebContainer Node + live preview iframe | "just build me X", zero setup |
| **Local** | a real folder via File System Access (Chromium) | WebContainer (sandbox) or native (desktop) | edit my real project |
| **GitHub** | a repo (OAuth → read/write/PR) | clone into Temp to run; commit/PR back | work on/ship a repo |
| **Native** (desktop) | real folder on disk | real terminal/process exec (P5) | the IDE‑fork tier |

Same `buildOrFix` + agent loop against any backend. Export/download from Temp; commit
from GitHub; write‑through on Local/Native.

## 4. "Prepare anything, host nothing" — in‑browser capability

The IDE provisions, on demand, whatever the project needs — all client‑side:
- **Node** (WebContainer) for JS/TS apps + a real dev server → **live preview**.
- **Python** (Pyodide), and other WASM runtimes, for non‑JS projects.
- **Live preview** of web apps (we already have `onServerReady` → iframe).
- **Simulators / playgrounds / classes**: prepared web sandboxes (a canvas, a REPL, a
  visualizer) the agent can spin up to demo or teach — assembled in the browser, not
  served by us.

We never run a backend for the user; we *assemble the environment* in their tab.

## 5. Sharing (built on what we have)

- **P2P** (the Send/WebRTC stack, already live): share a project or a live session
  device‑to‑device, no upload.
- **GitHub**: push/PR as the durable share.
- **Bundle**: export a single shareable project file.
- Later: live **co‑editing** of a session (two people, one agent) over the data channel.

## 6. Online vs desktop

Same agent, same shell, same conductor + licensing. Web = Temp/Local/GitHub backends
+ WebContainer oracle (zero install, the consumer surface). Desktop (IDE fork) = real
FS + native exec (the developer surface). The environment selects the backend; the
user just states the goal.

## 7. Honest quality bar (frontier vs us)

- **The shell** can be frontier‑grade UX, and it's **model‑agnostic** — it runs great
  on a frontier BYOK key today, and progressively better on our on‑device brain as
  the conductor trains on real trajectories.
- **On‑device, 0→100 autonomously** is strongest on **verifiable** work (the oracle
  makes a small model correct) and weaker on open‑ended architecture/novel reasoning
  (the small‑model ceiling). So: on‑device by default; **scale up** (bigger local
  model / frontier key) for the hardest 5%. "Highest quality" = the loop + best‑of‑N
  + the right model tier for the task, not a single model pretending to be frontier.

## 8. What exists vs the new layer

Have: the engine (`codeloop/codegen/coderun/typecheck/retrieve/grab/conductor`),
WebContainer (run + `onServerReady` preview), Monaco editor, P2P Send, licensing,
hardware tiers, trajectory capture.

Build (the agentic IDE layer):
1. **Workspace abstraction** (§3) — Temp/Local/GitHub/Native behind one interface. *(keystone)*
2. **Agent orchestrator** (§1–2) — session + planner + tool‑use loop over the engine.
3. **Scaffold from nothing** — templates → a fresh Temp project (fixes "code in a panel").
4. **Live preview** wired into the build path (iframe from `onServerReady`).
5. **GitHub** integration (OAuth, read/write, PR).
6. **Sharing** (P2P/GitHub/bundle) + later co‑editing.
7. **Extra runtimes** (Pyodide, simulators) provisioned on demand.

## 9. Phasing

- **A1 (now):** Workspace abstraction + scaffold‑from‑nothing into Temp + live preview
  → "build me X" produces a running project with a preview, on web, no setup. *(closes
  the gap the user found)*
- **A2:** Agent orchestrator — visible plan + tool‑use loop + session, narrated.
- **A3:** GitHub backend + Local write‑through.
- **A4:** Sharing (P2P/GitHub/bundle).
- **A5:** Extra runtimes + simulators/classes; co‑editing.
- Desktop: the IDE fork ([IDE_FORK.md](./IDE_FORK.md)) reuses A1–A5 with the native backend.

Relates to [[project_ai_platform_vision]] (coding‑agent first surface), [[project_send_p2p]]
(sharing), [[project_oioxo_licensing]] (Pro gating), [[project_custom_model]] (the conductor).
