# oioxo Agentic IDE — QA checklist

The pure logic is covered by `npm run test:oioxo` (11 tests, all green). This list
is the part that needs a **real browser / device / two peers** — i.e. what types
can't prove. Run against the live site (oioxo.com → AI → Code) after a deploy.

Best browser for the full set: **Chrome/Edge** (WebGPU + cross-origin isolation +
File System Access). Note which fail so we can fix.

## Build a project (Temp + preview)
- [ ] "Build a project" → type a goal → a starter scaffolds and a **live preview** appears (web/game)
- [ ] React goal → installs deps → Vite dev server preview comes up
- [ ] API goal → server starts → preview hits the endpoint
- [ ] Edit a file in the editor → preview refreshes / test re-runs
- [ ] Agent: press → ("build it out") → a **plan checklist** renders, steps go pending→running→✓, files appear, preview updates
- [ ] Agent produces *reasonable* code (the real model-quality check — note quality, not just "ran")

## Runtimes
- [ ] **Python** goal → Pyodide loads (first run ~10s) → `main.py` output shows; edits re-run
- [ ] **SQL** goal → sql.js loads → `SELECT` prints as a table; a bad query shows the SQL error
- [ ] Offline / blocked CDN → clear "couldn't load the … runtime" message (not a blank hang)

## Take it with you
- [ ] Download .zip → opens to a valid project
- [ ] Save to folder → files written to the chosen directory (Chromium)
- [ ] "Recent projects" on the idle screen lists prior sessions; clicking resumes (files + preview restored); delete works

## GitHub
- [ ] GitHub tab → paste a fine-grained PAT → "Connect"; token persists across reload
- [ ] Open `owner/repo` → file tree + contents load
- [ ] Edit / run the agent → **Commit & push (N)** → the commit appears on GitHub with only the changed files
- [ ] Wrong/expired token → clear error, not a silent failure

## Share + live co-edit (needs TWO browsers/devices)
- [ ] Browser A: "Share live…" → a code appears
- [ ] Browser B: idle screen → "Got a code?" → paste → the project loads and previews
- [ ] Type in A → B updates within ~1s; type in B → A updates (bidirectional)
- [ ] Agent run in A → B receives the changed files
- [ ] (No TURN server — verify it still connects on the same network / typical NAT)

## Cross-cutting
- [ ] Mobile/narrow width: panes stack and are usable
- [ ] Non-Chromium (Firefox/Safari): preview shows the "needs Chromium" message, files still build (type oracle), no crash
- [ ] Switching Build / Open folder / GitHub tabs doesn't wedge the single WebContainer instance
