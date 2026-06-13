# Xonvert/Xtudio Studios — Product PRD ("Superior, not a toy")

> Owner mandate (2026-06-13): "I don't want 'ok it works, video imported and exported'. I want
> something most superior — a real product flow, UX/UI. The 5‑minute‑movie test I described is
> ~1% of what I want; grow the other 99%." Build to this bar across ALL studios. Shared where it
> makes sense, studio‑specific where it matters — master‑class level.

This PRD is the SPEC. Each item is a checkbox with an acceptance bar. "Done" = built + device‑verified
on RFCW801EXWT with objective evidence + committed + pushed (the established discipline). Studios are the
shared code in `newxonvert/tools/*` + `newxonvert/lib/studios/*`; they ship to BOTH web Xonvert and the
native Capacitor apps, so every item lands in both.

---

## 0. The North‑Star Interaction Model (THE differentiator)

The single thing that separates "a tool that works" from "a product" is **direct manipulation with a
focused inspector**. Every visual studio must feel like Canva/Figma/CapCut, not a form with sliders.

### 0.1 Direct‑manipulation canvas (SHARED CORE — `lib/studios/stage.ts` + `Stage` component)
A reusable overlay/handle layer that any studio renders ON TOP of its preview canvas. Contract:

- **Select**: single click/tap on any on‑screen element selects it; shows a selection box.
- **Move**: drag the body → moves the element (normalized coords, letterbox‑aware — generalize the
  existing `previewNorm` in video‑studio).
- **Resize**: 8 handles (corners + edges); corner = proportional (Shift = free), edge = one axis.
- **Rotate**: a rotate handle above the box; Shift = snap to 15°.
- **Smart guides**: snap to frame center, edges, and other elements' edges/centers with pink guide lines
  (reuse the image‑studio guide work referenced in memory `project_studio_worldclass`).
- **Multi‑select + group transform** (phase 2): marquee + Shift‑click; transform the group as one.
- **Keyboard**: arrows nudge (Shift = 10×), Del removes, Ctrl+D duplicate, Esc deselects.
- **Touch**: one‑finger move, two‑finger pinch‑zoom + rotate the SELECTED element (not the canvas) when
  an element is selected; pinch the empty canvas = zoom the view.
- **Z‑order**: bring‑forward / send‑back via handle menu or `[`/`]`.
- WYSIWYG: the handle math and the renderer/exporter MUST agree pixel‑for‑pixel (same normalized model).

**Acceptance:** on device, a logo image and a text element can both be moved, corner‑resized, and rotated
by touch on the preview; the exported frame matches the preview within ±2px.

### 0.2 Element Inspector + "Back to timeline/canvas" (SHARED PATTERN)
- **Double‑click (or double‑tap) an element → its Inspector takes over** the side region (desktop) or
  slides up as a full sheet (mobile), showing ONLY that element's settings, grouped and titled with the
  element's name/type.
- A persistent **"‹ Back"** returns to the default view (timeline for video/audio, layer list for
  image/pdf). Selection is preserved on the way back.
- Inspector is **contextual**: text element → typography/anim/outline; image/logo → opacity/blend/
  crop/corner‑radius/shadow; video clip → trim/speed/grade/motion; audio → volume/fades/effects.
- Single‑click still just selects (shows handles); double‑click is the commit to "edit this element."

**Acceptance:** double‑tap the logo on the preview opens a Logo inspector (opacity/transparency, size,
corner radius, shadow); "‹ Back" returns to the timeline with the logo still selected.

### 0.3 Empty‑state & first‑run (SHARED)
Every studio opens to a **purposeful empty state**: large drop target, "Start from template" gallery,
"Import media," and 1‑line of what this studio is best at. No blank box.

---

## 1. VIDEO STUDIO — "make a 5‑minute movie" is the reference flow

Reference user journey (must be smooth end‑to‑end, no dead ends):
import clips → arrange on timeline → trim/split/ripple → transitions → color grade → **add logo overlay,
make it semi‑transparent, free‑move/resize on preview** → **auto‑subtitle the whole movie** → **review &
correct mistranscriptions inline** → restyle captions (font/box/position) → **add title + lower‑third text
layers, animate them, free‑move** → background music with ducking under voice → export with progress.

### Current state (audited 2026‑06‑13)
- ✅ Multi‑track timeline, trim/split/move, transitions, color grade, motion keyframes, 17 text anims,
  WYSIWYG export (WebCodecs + ffmpeg fallback), on‑device auto‑caption.
- ⚠️ Only TEXT overlays drag on preview; video/image overlays are numeric‑only.
- ❌ No resize/rotate handles on ANY element on preview.
- ❌ No double‑click→element inspector / no Back‑to‑timeline mode.
- ❌ Logo/image is not a first‑class overlay (it's a video‑track clip); no "make transparent" affordance.
- ❌ Auto‑captions land as static text clips; NO inline transcription‑correction UI in the video studio.

### Requirements
- [ ] **0.1 Stage on the video preview**: move+resize+rotate for text AND image/logo AND PiP video overlays.
- [ ] **0.2 Element inspector + Back** wired to the timeline.
- [ ] **Logo/overlay as first‑class**: an "Add logo/image overlay" action that drops an image overlay
      centered, with an inspector exposing **opacity/transparency**, scale, corner‑radius, drop‑shadow,
      blend mode, and "remove background" (reuse image‑studio bg‑removal). Free‑move/resize on preview.
- [ ] **Inline caption correction**: a Captions panel listing every caption with its time + editable text;
      editing updates the text clip live; click a caption → playhead jumps there + element selected on
      preview. Fixing a mistranscription is one tap into the field. (This is the subtitle‑studio's editor,
      embedded.)
- [ ] **Caption styling presets**: one‑tap subtitle styles (Clean, Boxed, Karaoke‑highlight, TikTok‑bold,
      Outline) that set font/size/box/position for ALL captions at once; then per‑caption overrides.
- [ ] **Audio ducking**: auto‑lower music under detected speech (sidechain‑style envelope from the voice
      track). One toggle.
- [ ] **Ripple edit + magnetic timeline** option (delete a clip → downstream clips close the gap).
- [ ] **Export dialog**: resolution/fps/format + estimated size + progress + cancel; remembers last choice.

**Acceptance bar:** a real 5‑min movie can be authored using ONLY the preview + inspector + timeline (no
dev tricks): logo placed/sized/made transparent by touch, captions generated and a wrong word fixed in
the panel, a title animated and positioned by drag, music ducks under narration, export produces an MP4
whose frames match the preview.

---

## 2. IMAGE STUDIO — Photoshop/Photopea bar
- ✅ Layers, blend, masks, clipping, adjustments, curves, gradient/selection tools, grades, styles,
      Upscale 2× (edge‑aware), remove‑bg, smart‑crop, enhance, autosave/recovery, paste.
- [ ] **0.1 Stage**: free‑transform (Ctrl+T) with rotate/scale handles on the active layer on canvas
      (memory notes "missing Ctrl+T" vs Photopea) — corner/edge/rotate, Shift constraints, smart guides.
- [ ] **0.2 Inspector**: double‑click a layer on canvas → that layer's inspector (style/blend/adjust);
      Back → layer list. (Image already has panels; make double‑click the entry + add Back affordance.)
- [ ] Text tool with on‑canvas editing (click to place, type in place), web‑font picker.
- [ ] Crop tool with aspect presets + straighten.
- [ ] Non‑destructive Smart Object‑style: keep original on resize/upscale so it can be re‑scaled.

## 3. PDF STUDIO — Sejda/Smallpdf bar (already strong)
- ✅ Real redaction (byte‑verified), Smart Redact whole‑doc, images→PDF, encrypt/decrypt, forms,
      edit‑text, export images.
- [ ] **0.1 Stage** for page objects: drag/resize/rotate added text boxes, images, signatures, redaction
      boxes directly on the page (currently mostly tool‑click based).
- [ ] **0.2 Inspector** for the selected annotation/field.
- [ ] Page organizer: thumbnail grid with drag‑reorder, rotate, delete, insert blank, split/merge.
- [ ] Fill‑&‑sign flow: place signature, date, checkmarks by tap.

## 4. SUBTITLE STUDIO — Whisper editor bar
- ✅ Import SRT/VTT, edit, timing, export, CJK burn‑in wrap.
- [x] **Waveform‑synced editor** (ALREADY BUILT — WaveformTimeline with draggable cue edges, snap, Q/W set-edge): cue list beside a waveform; drag cue edges on the waveform to retime.
- [ ] Inline transcription correction with playback‑follow (shared with §1 caption correction — build ONCE
      as `lib/studios/captions-editor`).
- [ ] Styling presets identical to §1 so video + subtitle share the look.
- [ ] Auto‑split long lines, CPS (chars/sec) warnings, gap/overlap fixer.

## 5. OFFICE — Sheets / Docs / Slides — Google bar
- Sheets: ✅ 140 formulas, sort, find‑replace, context menu, **column filter (new)**, pivot, charts,
      cond‑format, validation, freeze, named ranges, sparklines.
  - [ ] **0.1/0.2** not applicable to grid; instead: drag‑fill polish, multi‑range selection, chart
        direct‑manipulation (move/resize chart on sheet), filter‑views (saved filters).
  - [ ] Frozen‑header scroll polish + row/col resize affordances everywhere.
- Docs: ✅ rich text, anchored comments, track‑changes, find‑replace, collab.
  - [x] **inline image resize** by corner drag DONE (ae1e35b, device-verified 200→280px). Shapes/wrap-text TODO.
  - [ ] Styles/headings outline pane; export DOCX fidelity.
- Slides:
  - [ ] **0.1 Stage** is the core — slide objects (text/image/shape) must move/resize/rotate on the slide
        with guides; **0.2 inspector** per object; Back → slide sorter.
  - [ ] Slide sorter with drag‑reorder; speaker notes; present mode.

## 6. AUDIO — Voice / Music — Descript / GarageBand bar
- Voice: ✅ RNNoise denoise, broadcastChain (LUFS −16), de‑ess, normalize, limiter, EQ, **real
      filler‑removal (transcript‑timed)**, remove‑silences, transcript edit, SRT export.
  - [ ] Edit audio BY editing the transcript (delete a word in text → audio splices) — extend the
        existing word‑delete into a document‑style editor.
  - [ ] Multitrack with per‑clip gain envelopes drawn on the clip (direct‑manipulation on the waveform).
  - [ ] One‑click "Studio Sound" that chains denoise→EQ→deReverb→loudness with an A/B toggle.
- Music: ✅ procedural patterns, audio→MIDI, MIDI export, swing, modes, pan.
  - [x] Piano‑roll with **direct‑manipulation notes** (ALREADY BUILT — variable-length notes, velocity, chance, chromatic) (drag to move/resize/velocity), grid snap.
  - [ ] Song arrangement view (intro/verse/chorus blocks) drag‑arranged.
  - [ ] Per‑instrument mixer with meters.

---

## 7. CROSS‑CUTTING PRODUCT POLISH (applies to ALL)
- [ ] **Undo/redo everywhere** with labeled history; Ctrl+Z/Ctrl+Shift+Z; visible history panel.
- [ ] **Autosave + crash recovery** on every studio (image already has it — propagate).
- [x] **Keyboard shortcuts** + a "?" cheat‑sheet overlay per studio. DONE (6d965b4) — all 9 register shortcuts; added always-present "?" FAB in StudioShell so it's reachable on touch, device-verified. Web now; 8 non-image apps on next rebuild.
- [ ] **Loading/empty/error states** are designed, never a blank or a raw error.
- [ ] **Mobile parity**: every action reachable by touch; inspectors are bottom‑sheets; no hover‑only UI.
      (Memory `project_studio_mobile` — shared shell + bottom‑sheet coordinator already started.)
- [ ] **Performance**: 60fps preview where possible; never freeze the UI (memory `project_perf_policy`);
      heavy ops show progress + are cancelable.
- [ ] **Watermark honesty**: Free marks outputs, Pro clean — already global; keep verified.
- [ ] **Offline‑true**: no silent CDN dependency that breaks the "works offline" promise where claimed.

---

## Build order (re‑prioritized by the 5‑min‑movie test, highest leverage first)
1. **Shared `Stage` (0.1)** — move/resize/rotate + guides, generalized from video‑studio's text‑drag.
2. **Video: logo/image overlay as first‑class + Stage on it** (the test's explicit ask).
3. **Shared `captions-editor` (0.2 + inline correction)** — used by video §1 and subtitle §4.
4. **Element Inspector + Back pattern** wired in video first, then image/slides.
5. **Caption styling presets + audio ducking** (finishes the movie flow).
6. Propagate Stage/Inspector to image (Ctrl+T), slides, pdf, docs; then audio piano‑roll/waveform.

Each step: build → device‑verify (real creator action, objective proof) → commit → push. No "it works"
without the product‑grade UX around it.
