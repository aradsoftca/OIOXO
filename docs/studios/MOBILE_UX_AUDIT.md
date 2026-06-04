The interaction patterns for CapCut/Canva/Procreate (bottom toolbar + bottom sheets, pinch-zoom canvas, 44px touch targets per Apple HIG / 48dp per Material) are well-established and I already know them with high confidence; my analysis doesn't hinge on a fresh fact. I'll skip the web search and write up the grounded audit.

# Mobile/Touch UX Audit — Studios

The shell has a real responsive layer (`StudioResponsive` → phone/tablet/desktop at 640/1024px, `MobilePanelHost` bottom-sheet system, `usePinchPan`, 44px-min tab bar). So this is *not* "just the desktop shrunk" — but the good infrastructure is **inconsistently adopted**, and the studios that bypass it are the worst offenders. Fixes below lead with the shell because each one improves every studio at once.

## Cross-cutting shell fixes (do these first)

### 1. Two studios bypass the responsive sidebar system entirely → desktop layout on phones
- **Studios:** Audio-Music, PDF (comments panel), Video (partially).
- **Problem:** `MobilePanelHost`/`MobileFloatingPanel` only kick in for content rendered through `StudioSidebar`/`ResponsiveSidebar`. Several panels are hand-rolled `fixed`/flex divs that never collapse:
  - `audio-music-studio/ui.tsx:858` mounts `<StudioSidebar width={260}>` (good) — but its main control strip `audio-music-studio/ui.tsx:791` is a single `flex h-12 … gap-4` row with BPM/Key/Swing/Master/Loop/pattern-list all inline. On a phone this overflows with no scroll container (no `overflow-x-auto`), so Master, Loop and the pattern buttons fall off-screen / wrap into a broken stack.
  - `pdf-studio/ui.tsx:787` comments panel is `fixed right-0 … w-80` (320px) — on a 360px phone it covers the whole canvas with no responsive variant.
  - `pdf-studio/ui.tsx:623` the annotation toolbar is a `flex h-10 … gap-2` row with ~10 buttons + an OCR-language `<select>` and a color picker, all inline with no horizontal scroll → overflow.
- **Fix:** Route every secondary panel through `ResponsiveSidebar` (registers a bottom-sheet automatically), and wrap every horizontal control strip in `overflow-x-auto [scrollbar-width:none]` exactly like `StudioToolDock` already does (`lib/studios/ui.tsx:67`). For the PDF/audio top control strips, add a `mode !== 'desktop'` branch that collapses sliders into a "⚙ Settings" bottom sheet.
- **Effort:** M (audio strip + pdf toolbar/comments) — mechanical once the pattern is the dock's.

### 2. The bottom-sheet top offset is hardcoded and wrong for tall mobile headers → sheet overlaps the toolbar
- **Studios:** all (most visible in Image, PDF, Video which add a 2nd/3rd header row).
- **Problem:** `MobilePanelHost` sheet uses `top-14` (`lib/studios/ui.tsx:66` = 56px) and `MobileFloatingPanel` uses `top-[var(--studio-top-offset,108px)]` (`lib/studios/ui.tsx:162`). **`--studio-top-offset` is never set anywhere** (grep returns only the default). Meanwhile on mobile `StudioTopBar` becomes a 2-row flex-col (`ui.tsx:31`), and studios stack extra bars on top: Image adds `ToolOptionsBar` (h-10) + `StudioToolDock` (h-12); PDF adds the annotation strip (h-10); Video adds the transport bar. So the real header is ~120–170px but the sheet opens at a fixed 56/108px and **paints over the live toolbar**, or leaves a dead gap.
- **Fix:** Have `StudioResponsive`/`StudioBody` measure the header stack via `ResizeObserver` and write `--studio-top-offset` on the shell root; make both sheet variants consume it. Or simpler: render the bottom sheet as a true overlay from the bottom (`inset-x-0 bottom-12 h-[70dvh]`) regardless of header height, like CapCut/Canva.
- **Effort:** S.

### 3. Dialogs use fixed pixel widths → horizontal overflow on phones
- **Studios:** all (every Export/New/Template/Watermark/Split/Signature/Filter dialog goes through `SharedDialog`).
- **Problem:** `lib/studios/dialog.tsx:24` `WIDTHS = { sm:'w-[360px]', md:'w-[460px]', lg:'w-[600px]', xl:'w-[820px]' }`. The backdrop adds `p-4` (`dialog.tsx:69`). On a 360px phone even `sm` is edge-to-edge-plus-overflow; `md`/`lg`/`xl` (used by Video Export, PDF OCR `wide`, Signature `wide`, Text dialogs) blow well past the viewport and clip the Confirm/Cancel footer.
- **Fix:** Make widths responsive: `sm:'w-full max-w-[360px]'`, …, `xl:'w-full max-w-[820px]'`, and switch to a bottom-anchored sheet on phone (`items-end`, `rounded-b-none`, `max-h-[88vh]` already present). `SignatureDialog`'s canvas is `aspect-3/1` full-width — fine once the dialog itself fits.
- **Effort:** S.

### 4. Touch targets below 44px throughout the chrome
- **Studios:** all, via shared components.
- **Problem:** the tool dock buttons correctly bump to `h-11 w-11` on mobile (`ui.tsx:83`) — good — but most other controls don't: `StudioButton` is `h-7/h-8` (`ui.tsx:208`), `StudioSelect` `h-7` (`ui.tsx:274`), `StudioPanel` header chevron-row is `py-2` text-only, and `StudioSlider` thumb sits on a `h-1.5` track (`ui.tsx:256`) — a ~6px-tall drag target. The floating-panel toggle in `MobileFloatingPanel` is `h-10 w-7` (`ui.tsx:152`) = 28px wide.
- **Fix:** Add a `mode !== 'desktop'` size bump to `StudioButton` (→ `h-10`), `StudioSelect` (→ `h-10`), and especially `StudioSlider` (→ `h-2.5` track + an explicit `[&::-webkit-slider-thumb]{width:28px;height:28px}` so the thumb is grabbable). Widen the floating-panel toggle to ≥44px. Because these are shared, one edit fixes all four studios' inspectors.
- **Effort:** M (slider thumb styling is the fiddly part; the rest is trivial).

### 5. No global `touch-action`/scroll-conflict guard on draggable surfaces
- **Studios:** Video timeline, PDF editor, Image canvas, Audio grid.
- **Problem:** `usePinchPan` only handles 2-finger gestures and calls `preventDefault` only when `touches.length >= 2` (`responsive.tsx:139,155`). Single-finger drags (move clip, draw annotation, paint) are wired with pointer events but the containers don't all set `touch-action: none`, so one-finger drags fight the page/sheet scroll. Some do (`pdf editorRef` has `touchAction:'none'` `pdf-studio/ui.tsx:705`; video preview wrap has `touch-none` `video:1113`), but the **video timeline scroll container** (`video:1480`) and **audio sequencer grid** (`audio:828`) do not — so dragging a clip or painting steps will also scroll the timeline/grid.
- **Fix:** add `touch-action: none` to every pointer-drag surface, and `touch-action: pan-x` to the timeline's intended scroll axis. Standardize via a `useDragSurface` helper.
- **Effort:** S–M.

---

## Per-studio worst offenders

### Video Studio — the timeline is unusable by finger (biggest single problem)
- **Layout:** Three-pane (left media sidebar + center preview/timeline + right inspector) via `StudioSidebar` — the two sidebars *do* collapse to bottom-sheets. **But the timeline itself is hard-coded** `h-72` (`video:1439`) and is its own thing, not responsive. On a phone in portrait the preview + transport + scopes + a 288px timeline leaves almost nothing for the preview.
- **Touch targets (critical):** clip trim handles are `w-1.5` = **6px wide** (`video:1528,1540`); the playhead grab head is `h-3 w-4` (`video:1550`); track mute/lock are `p-1` ~20px; the per-track remove "X" only appears on `group-hover` (`video:1473`) — **no hover on touch, so it's unreachable**; the add-track V/A/T buttons are `text-[9px]` in a `h-6` strip (`video:1441`). Trimming/splitting/moving clips precisely with a fingertip on a 6px handle is effectively impossible — this is the "studios are bad on mobile" core complaint for video.
- **Gestures:** timeline drag uses pointer events (good) but the scroll container has no `touch-action`, and there's **no pinch-to-zoom on the timeline** (zoom is +/- buttons only); preview pinch-zoom works (`usePinchPan` at `video:694`).
- **Fixes:** (a) bump trim handles to ≥24px hit area on touch (visually thin, padded hit-zone via a transparent `::before`); (b) make playhead head ≥24px; (c) replace hover-only track X with an always-visible control on touch; (d) add pinch-zoom to the timeline reusing `usePinchPan` mapped to the `zoom` px/s value; (e) make timeline height `mode`-aware (shorter, with a drag-to-expand handle like CapCut).
- **Effort:** L.

### Image Studio — dual/triple right sidebars + bottom-bar collision
- **Layout:** Renders **up to three** `StudioSidebar`s simultaneously (Layers 296px + Adjust 260px + History 200px — `image:1829,1908,1930`), each toggled by a top-bar button. On desktop they tile; on phone each becomes a separate `MobileFloatingPanel` with its own `▶` edge toggle — so you can get **multiple overlapping floating toggles stacked at the same `right-1 top-1/2`** (`ui.tsx:153`), which collide. These should be tabs in one bottom sheet, not three independent floating panels.
- **Tool options bar:** `ToolOptionsBar` (`image:2115`) is `overflow-x-auto` (good) but packs 4 sliders for the brush at `w-32`/`w-24` each — horizontally scrolling through brush Size/Hardness/Opacity/Flow on a phone is painful; should be a bottom-sheet "Brush" panel.
- **Touch:** the FG/BG color swatches are `h-6 w-6` (24px) stacked in a `h-9 w-9` box (`image:1731`); curve/lasso/wand precision relies on a crosshair cursor that doesn't exist on touch. Canvas pinch-zoom/pan works (`usePinchPan` at `image:768`) — the one solid bit.
- **Fixes:** consolidate Layers/Adjust/History into a single bottom sheet with a segmented tab header (register all three via `ResponsiveSidebar` with a shared host that shows tabs when >1 panel registered); move tool-options into per-tool bottom sheets; enlarge swatches.
- **Effort:** M–L.

### Audio-Music Studio — sequencer grid + overflowing transport
- **Layout:** Main grid uses `overflow-auto` (good) and the mixer is a `StudioSidebar` (collapses, good). **The transport/params strip (`audio:791`) is the offender** — single non-scrolling `flex gap-4` row that overflows on phones (see shell fix #1).
- **Sequencer grid:** Each `StepCell` is `aspect-square min-w-[28px]` (`audio:1042`) — 28px is *under* the 44px target and a 16-step row needs `16×28 + 128px label gutter` ≈ 576px, so the grid horizontally scrolls but each cell is a tiny tap. The label gutter is a fixed `w-32` (`audio:983,990`) eating 128px on a 360px screen. Synth pitch editing is **right-click only** (`onContextMenu`, `audio:1032`) — **no touch equivalent** (long-press), so changing a note's pitch is impossible on a phone.
- **Octave up/down chevrons are `h-2.5 w-2.5` (`audio:996`)** — ~10px, untappable.
- **Fixes:** add long-press → pitch cycle for synth cells (mirror the right-click handler); bump cells to ≥36px and octave chevrons to ≥32px; make the label gutter narrower on mobile or float it; collapse the transport strip into a sheet.
- **Effort:** M.

### PDF Studio — tool strip overflow + hover-only page controls
- **Layout:** Tool dock (`StudioToolDock`, collapses correctly) + left Pages sidebar (`StudioSidebar`, collapses) + canvas. The **annotation toolbar (`pdf:623`) and the per-page action bar overflow / are hover-gated.**
- **Touch:** page thumbnails reveal Move/Rotate/Duplicate/Delete only on `group-hover` (`pdf:685`) with `h-5 w-5` icon buttons (`IconBtn`, `pdf:966`) — **invisible and 20px on touch**. Annotation move/delete is `onPointerDown`-move + `onDoubleClick`-to-delete (`pdf:713`) — double-tap-to-delete is unreliable on touch and there's no visible delete affordance. Text tool uses `window.prompt()` (`pdf:287`) which on mobile is a jarring OS dialog.
- **Comments panel** is the `w-80 fixed` non-responsive panel (shell fix #1).
- **Fixes:** make page-action buttons always-visible + ≥40px on touch; replace double-tap-delete with a visible handle/menu on the selected annotation; replace `window.prompt` with the existing `PromptDialog` (`dialog.tsx:159`); route comments through `ResponsiveSidebar`.
- **Effort:** M.

---

## Priority summary

| # | Fix | Studios | Effort |
|---|-----|---------|--------|
| 1 | Route hand-rolled panels through `ResponsiveSidebar`; wrap all horizontal control strips in `overflow-x-auto` | Audio, PDF, (Video) | M |
| 2 | Compute `--studio-top-offset` from header stack (or bottom-anchor the sheet) | all | S |
| 3 | Responsive dialog widths + bottom-sheet on phone in `SharedDialog` | all | S |
| 4 | Mobile size bump for `StudioButton`/`StudioSelect`/`StudioSlider` thumb + floating-panel toggle | all | M |
| 5 | `touch-action: none` on all pointer-drag surfaces (timeline, grid) | Video, Audio, Image, PDF | S–M |
| 6 | Video timeline: fat trim handles + playhead, always-visible track controls, pinch-zoom, mode-aware height | Video | L |
| 7 | Image: merge Layers/Adjust/History into one tabbed bottom sheet; per-tool option sheets | Image | M–L |
| 8 | Audio: long-press pitch edit, bigger step cells + octave chevrons, collapse transport | Audio | M |
| 9 | PDF: always-visible ≥40px page/annotation controls, replace `window.prompt`, responsive comments | PDF | M |

**Bottom line:** the responsive *foundation* is solid (bottom-sheet host, pinch/pan hook, 44px tab bar). The pain is (a) studios that don't use it for their bespoke panels/toolbars (#1), (b) shared chrome that never got mobile sizing — sliders, buttons, dialogs (#2–4), and (c) two genuinely finger-hostile interaction surfaces: the **video timeline 6px trim handles** (#6) and the **audio right-click-only pitch editing + 28px cells** (#8). Hover-only controls (track-X, PDF page actions, annotation delete) are dead on touch across the board. Files of record: `lib/studios/ui.tsx`, `lib/studios/responsive.tsx`, `lib/studios/dialog.tsx`, `tools/video-studio/ui.tsx`, `tools/image-studio/ui.tsx`, `tools/pdf-studio/ui.tsx`, `tools/audio-music-studio/ui.tsx`.