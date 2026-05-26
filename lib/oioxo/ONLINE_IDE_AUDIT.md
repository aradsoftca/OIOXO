# oioxo ONLINE IDE — 2026 gap audit

The desktop IDE is a Void/Code-OSS fork (real editor, tabs, palette, extensions, LSP,
terminal). The **online** IDE (`newxonvert/app/oioxo/*`) is a much thinner surface
bolted onto the on-device agent. This audit is what the online IDE is missing to feel
like a real 2026 web IDE (the bar: vscode.dev, StackBlitz, CodeSandbox, bolt.new,
Replit, v0). Grounded in the current code, not aspiration.

## What the online IDE actually is today
- `OioxoShell` → tabs AI / **Code** / Image / Video. Code = `CodeAgent`.
- `CodeAgent` surfaces: **Build** (`NewProject`, Temp/MemoryWorkspace), **Open folder**
  (`CodeWorkspace`, File System Access — Chromium only), **GitHub** (`GitHubPanel`).
- One editor: `CodeEditor` = `@monaco-editor/react`, **loaded from a CDN at runtime**,
  **one file at a time**, vanilla (no markers, no cross-file language service). 8s
  timeout → falls back to a bare `<textarea>`.
- File "tree" in Build view = a **flat list of full paths** (no folders, no tabs).
- Preview = WebContainer (Chromium+COOP/COEP) or a server-free `srcdoc` for static.
- Strong, real differentiators already here: the on-device **agent loop** (plan →
  write → verify → repair), **time-travel history**, **P2P share + live co-edit**,
  **sessions**, **zip / one-file / save-to-folder** export, **BYOK frontier**.

---

## P0 — why it feels broken / like a toy (fix first)

### 1. The editor is unreliable and not "openable like VS Code"
- **CDN-loaded Monaco** (`@monaco-editor/react` default loader → jsdelivr). On the
  live site a strict CSP, slow network, or offline = "Loading editor…" for 8s then a
  plain textarea. This is almost certainly the **"I click a file and nothing happens"**
  report: the editor pane is dead while Monaco fails to fetch. It also violates the
  host-nothing / no-third-party ethos and the secret-tech rule.
  → **Self-host Monaco + its workers** (bundle via `monaco-editor` + a webpack/Next
  asset config, or `loader.config({ paths: { vs: '/monaco/vs' } })` pointing at our
  own static copy). Editor must mount in <500ms, fully offline, no third party.
- **No editor tabs.** Opening file B replaces file A — you lose your place. A real IDE
  keeps open files as tabs with dirty dots, Ctrl+Tab, close, reorder.
  → Add a tab strip above the editor (open set + active), wire the file list to "open
  in tab" not "replace".
- **No folder tree in Build view** — just flat paths. `CodeWorkspace` has a real
  collapsible `Tree`; Build/GitHub/Cloud should reuse it (nested dirs, expand/collapse).

### 2. We have a diagnostics engine and don't show it
- `typecheck.ts` `typeCheckFiles()` already returns `TypeDiag[]` (path/line/col/
  message/severity) in-browser, no install. The agent uses it as an oracle — but the
  **editor shows no squiggles and there is no Problems panel.**
  → On a debounce after edits, run `typeCheckFiles(files)` and push results as
  **Monaco markers** (`monaco.editor.setModelMarkers`) + a **Problems panel** (click →
  jump to line). This single wire turns "a textarea with colors" into "an IDE that
  catches your errors." Highest feel-per-effort win in the whole audit.

---

## P1 — core IDE primitives that are simply absent

### 3. Navigation & command surface
- **No Command Palette** (Ctrl/Cmd+K or P). The single most "VS Code" affordance.
  → A palette over actions we already have: New file, Run, Build/Fix, Save to folder,
  Download zip, Share, Versions, Switch surface, Open recent, Toggle preview.
- **No global search / find-in-files**, no in-file Find/Replace surfaced (Monaco has
  Ctrl+F built in once focused, but there's no project-wide search).
- **No keybindings** beyond Enter-to-submit. No Save (Cmd+S), Run (Cmd+Enter),
  palette, quick-open file (Cmd+P).
- **No breadcrumbs / quick file switcher.**

### 4. Editing intelligence
- **No cross-file IntelliSense.** Vanilla Monaco gives in-file TS only. Real
  completion/hover/go-to-def across the project needs the TS worker fed all files
  (`monaco.languages.typescript` + add every file as an extra lib / model). We already
  load `tslibs` for the oracle — feed the same to Monaco's TS service.
- **No go-to-definition, hover types, rename symbol, format-on-save.**
- **No diff view.** The agent rewrites files with zero visible diff. VS Code/Cursor's
  trust feature is the red/green review. We have `history.ts` snapshots and `patch.ts`
  — render a **before/after diff** (Monaco `DiffEditor`) when the agent changes a file,
  with accept/reject.

### 5. Run / terminal / debug
- **No interactive terminal in Build view** (CodeAgent's folder mode has `RunPanel`;
  Build mode only streams agent/preview logs). StackBlitz-grade IDEs give a real shell.
  → Surface a WebContainer-backed terminal (xterm) in Build + Cloud/GitHub surfaces,
  not just folder mode.
- **No Problems→fix loop in the editor** (you can't right-click an error → "ask oioxo
  to fix"). We have the agent + the diagnostics; connect them.
- **`debug-trace.ts` exists** (record/replay fault windows) but is **not surfaced** —
  no way to replay a runtime error in the UI.
- Preview has no device-size toggle, no console capture panel, no network tab.

### 6. Project / workspace management
- **No multi-folder, no rename file, no move/drag, no create folder** — only add file
  by typing a path and delete. `LocalWorkspace.remove` even throws "not supported".
- **No "new project from template" picker** — scaffolding is goal-driven only; a 2026
  IDE also offers blank/React/static/node starters explicitly.
- **No settings panel** (theme, font size, tab size, word-wrap, format-on-save,
  keymap). Monaco options are hardcoded. No **dark theme** in the IDE (the rest of
  oioxo has gold/dark; the editor is forced `theme="light"`).

---

## P2 — depth that separates a "real" IDE from a demo

- **Extensions/themes:** the desktop fork has OpenVSX; online can't run the extension
  host, but could offer a small set of **Monaco themes + language grammars** and
  formatter presets so it's not one-size.
- **Source control view** beyond GitHub commit: a diff/staging view, branch awareness,
  per-file revert (history.ts gives the data).
- **Snippets / emmet** (Monaco supports emmet for html/css with a plugin).
- **Markdown/HTML live preview** side-by-side for docs (separate from the app preview).
- **Image/binary file viewer** (today non-text files show "/* binary */").
- **Outline view** (symbols in the current file) — cheap via the TS service.
- **Multi-cursor/column already free in Monaco** once it loads reliably (P0).
- **Accessibility & mobile:** the 3-column layout collapses awkwardly on phones; a real
  mobile editor mode (editor-first, preview/terminal as sheets) matters since "online"
  is the surface people hit on a phone.

---

## Online vs Desktop parity (what online is missing that desktop already has)

| Capability | Desktop (Void fork) | Online today | Gap action |
|---|---|---|---|
| Editor engine | Full Code-OSS Monaco, bundled | Monaco via CDN, single file | Self-host + tabs (P0) |
| Tabs / palette / quick-open | ✅ | ✗ | Build them (P0/P1) |
| LSP / IntelliSense | ✅ (extension host) | in-file only | Feed TS worker all files (P1) |
| Inline diagnostics / Problems | ✅ | ✗ (engine exists!) | Wire `typeCheckFiles`→markers (P0) |
| Diff / accept-reject agent edits | ✅ | ✗ | Monaco DiffEditor + history (P1) |
| Integrated terminal | ✅ native | folder mode only | WebContainer xterm everywhere (P1) |
| Extensions / themes | ✅ OpenVSX | ✗ | Theme presets (P2) |
| Settings / keymap | ✅ | ✗ | Settings panel (P1) |
| On-device agent loop | ✅ | ✅ | (parity) |
| P2P share / live co-edit | (n/a) | ✅ | online-only strength |
| Time-travel history | ✅ | ✅ | (parity) |

---

## Progress
- ✅ **P0 #1 self-host Monaco** — `monaco-editor` declared; `scripts/copy-monaco.mjs`
  copies `min/vs` → `public/monaco/vs` (gitignored) on predev/prebuild; `CodeEditor`
  calls `loader.config({ paths: { vs: '/monaco/vs' } })`. No CDN; loads from our
  origin. Textarea fallback shortened to 4s. Cmd/Ctrl+S wired. (browser render not
  headlessly verified, but it's the documented self-host path; assets confirmed copied.)
- ✅ **P0 #2 diagnostics + Problems panel** — `useDiagnostics.ts` runs the existing
  `typeCheckFiles` (debounced, whole project) → Monaco squiggles (`setModelMarkers`) +
  `ProblemsPanel.tsx` (click → jump to line). Safety net: hides diagnostics if the TS
  libs can't load (avoids false "cannot find name" walls). Wired into the **Build**
  surface (`NewProject`).
- ✅ **P0 #3 tabs + folder tree** — `EditorTabs.tsx` (open files as tabs, dirty/error
  dots) + `FileTree.tsx` (collapsible nested folders, error dots) wired into Build.
- ✅ **TS libs self-hosted** — `copy-monaco.mjs` also vendors `typescript/lib/lib*.d.ts`
  → `public/monaco/ts-libs`; `tslibs.ts` passes a custom `fetcher` to vfs that redirects
  its CDN fetch to our origin. The type oracle (and Problems) now works with **zero
  third-party fetches**, offline.
- ✅ **GitHub surface upgraded** — tabs + collapsible `FileTree` + project diagnostics +
  Problems panel + Cmd+S (= commit & push). Same components as Build.
- ✅ **Folder surface** — Cmd+S wired (it already had a real tree). Full tabs + whole-
  project diagnostics deferred there (arbitrary on-disk repos = perf concern).
- ✅ **Command palette** (`CommandPalette.tsx`) — Cmd/Ctrl+K or Cmd/Ctrl+P, fuzzy
  quick-open files + project actions (new file, reload preview, download zip, save to
  folder, share, versions, new project). Wired into the Build surface.
- ✅ **Coherent diagnostics** — disabled Monaco's built-in single-file TS/JS validation
  so our project-aware `typeCheckFiles` markers are the only squiggles (no false
  "cannot find module" noise); completions/hover stay on.
- ✅ **Cross-file IntelliSense** — `CodeEditor` owns a `file:///` Monaco model per
  project file (`projectFiles` prop) + the open file uses a `file:///` `path`, with TS
  compiler options set, so completions/hover/go-to-def resolve across imports. Wired
  into Build + GitHub. Defensive (try/catch — never breaks editing). (Not browser-
  smoke-tested headlessly.)
- ✅ **Agent diff review** — `DiffModal.tsx` (Monaco `DiffEditor`, per-file before→after
  + Revert all), reached from the Versions list (agent edits are auto-snapshotted), so
  it needed NO change to the agent apply loop.

All P0 + P1 from this audit are now implemented. Next depth = P2 (settings/dark theme,
file rename/move, terminal everywhere, outline, image viewer) + applying full tabs to
folder mode.

## Recommended build order (feel-per-effort)
1. **Self-host Monaco + workers** (kills the "nothing happens" bug, offline, no 3rd
   party) — P0, unblocks everything else.
2. **Inline diagnostics + Problems panel** from the existing `typeCheckFiles` — P0,
   biggest "it's a real IDE" jump for the least code.
3. **Editor tabs + reuse the collapsible folder Tree** across Build/GitHub/Cloud — P0.
4. **Command palette + key bindings** (Cmd+S/Cmd+Enter/Cmd+P/Cmd+K) — P1.
5. **Cross-file IntelliSense** (feed all files + tslibs to Monaco's TS service) — P1.
6. **Agent diff review** (DiffEditor + accept/reject, backed by history.ts) — P1.
7. **Terminal everywhere + console/preview tooling** — P1.
8. **Settings (incl. dark theme) + file rename/move/folders** — P1/P2.

Net: items 1–3 alone convert the online IDE from "a textarea with an AI button" into a
credible editor; 4–6 make it feel like Cursor-in-the-browser; the rest is depth.
