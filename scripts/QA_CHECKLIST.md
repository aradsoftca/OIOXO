# oioxo Agentic IDE — QA checklist

The pure logic is covered by `npm run test:oioxo` (27 tests, all green) plus the
weak-device demos `npm run oioxo:patch | oioxo:bricks | oioxo:checks | oioxo:share`.
This list is the part that needs a **real browser / device / two peers** — i.e.
what types can't prove. Run against the live site (oioxo.com → AI → Code) after a deploy.

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

## Weak-device magic — the live-model path (Node-proven; verify on a real device)
The four levers' LOGIC is unit-tested, but the on-device model actually using them is not.
- [ ] **Bricks (retrieve-don't-author):** build a goal that matches a seed brick (e.g. "a debounce for the search box", "rectangle collision") → the draft REUSES the verified block (correct first try / fewer repair rounds vs a cold goal)
- [ ] **Harvest:** after a build reaches green, building a *similar* goal later reuses the harvested block (corpus grew)
- [ ] **Patches (diff-not-rewrite):** on a repair, the coder emits a small SEARCH/REPLACE edit (watch the log — a patch, not a whole-file reprint); the file still ends correct. On a slow phone, repairs are visibly faster than the first draft
- [ ] Patch fails to apply (model ignored the format) → silently falls back to whole-file (no corruption, loop still converges)
- [ ] **Checks (dense oracle):** a non-recipe goal (e.g. "a button that increments a counter") → a PLACEHOLDER first draft is rejected ("not yet: has a button / shows a number") and the loop keeps building until the derived checks pass
- [ ] Checks never false-fail a correct build (loop terminates; no infinite loop on a good app)
- [ ] **Share blocks (needs TWO devices):** A: sidebar "Share / import blocks…" → "Share mine" → code appears, "Sent N blocks"
- [ ] B: "Got a code?" → paste → "Added M verified blocks · skipped K"; a block that fails B's oracle shows under skipped (trust-nothing gate visible)
- [ ] After import, B can build a goal it couldn't serve before (inherited capability)
- [ ] Brick transfer works over the real `/api/signal` WebRTC relay on typical NAT (no TURN)

## Cross-cutting
- [ ] Mobile/narrow width: panes stack and are usable
- [ ] Non-Chromium (Firefox/Safari): preview shows the "needs Chromium" message, files still build (type oracle), no crash
- [ ] Switching Build / Open folder / GitHub tabs doesn't wedge the single WebContainer instance
