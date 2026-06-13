# Xtudio Studios — Pro-Depth Campaign ("Grow to 100 Layers")

> Owner mandate 2026-06-13: my examples were a SAMPLE. A real product (CapCut/DaVinci/Photoshop/Acrobat) is deep in every direction. Grow EVERY studio to rival-grade pro depth. Web xonvert + mobile apps stay identical (shared newxonvert/ code). Build wave after wave, device-verify each, commit+push, no asking.

Audit 2026-06-13: every studio scored 28-38/100 vs its real rival (parallel agent audit reading actual code). This file = the canonical campaign spec.

This is a documentation synthesis task — the audit data is fully provided in the prompt, so I'll write the campaign spec directly without needing to explore the codebase.

# Cross-Studio Pro-Depth Backlog — "Grow to 100 Layers" Campaign Spec

The mandate: take 9 browser studios from ~30/100 to rival-grade depth. This spec is buildable wave-by-wave. Build shared engines ONCE, reuse across all 9. Device-verify every wave.

---

## 1. Scorecard

| Studio | Rival | Overall /100 | One-line state |
|---|---|---|---|
| Video Studio | CapCut + DaVinci + Premiere | 28 | Clean WYSIWYG foundation; flat timeline, no masking/tracking, no speed-ramp, no render queue |
| Image Studio | Photoshop + Photopea | 28 | Layers/masks/adjustments exist but no groups, no pen/vector, no smart objects, no warp/liquify |
| PDF Studio | Acrobat Pro + Sejda | 32 | Strong redaction + OCR; zero compare/diff, no Bates, no real digital sigs, weak forms |
| Office Sheets | Google Sheets + Excel | 32 | 140 formulas + pivots; no LAMBDA/spill, lossy XLSX, no goal-seek, no macros |
| Office Docs | Google Docs + Word | 32 | Real track-changes + CRDT collab; no styles, no page layout, no footnotes, lossy DOCX |
| Office Slides | PowerPoint + Keynote + Slides | 32 | Element anim + smart guides; no transitions, no master/layouts, no presenter view, lossy PPTX |
| Audio-Voice | Audition + Descript | 28 | Real LUFS + transcript word-edit; 4 fixed tracks, no envelopes, 3-band EQ, no spectral edit |
| Audio-Music | GarageBand + Ableton + FL | 28 | Constraint-aware synthesis + MIDI I/O; 8 fixed tracks, no automation, no sampler, master-only FX |
| Subtitle Studio | Aegisub + CapCut | 38 | Waveform + Whisper + burn-in; single-track, no overlap-repair, per-cue styling, no per-word retime |

---

## 2. Per-Studio Ranked Backlog (grouped into Build Waves)

Effort key: S/M/L/XL. Impact key: critical/high/medium/low. Within each wave, ordered highest-impact-first.

### Video Studio (28 → target 75)
**Wave 1 — quick depth wins (S/M)**
- LUT import & application (cube/1D) — S / medium
- Ripple/Roll/Slip/Slide trimming (4 tools unlock 80% of edit speed) — M / high
- Speed ramping with keyframes (animate speed param) — M / high
- Render queue & batch export (presets: YouTube/TikTok/IG specs) — M / high

**Wave 2 — graph + mixer systems (L)**
- Keyframe graph editor / dope sheet (uses shared keyframe engine) — L / medium
- Mixer UI + track sends/aux bus routing — M / medium
- Multicam / multi-angle editor — L / medium

**Wave 3 — big color + comp systems (L/XL)**
- HSL/HLS color-range qualifiers (secondary color, skin-tone) — L / critical
- Nested sequences / compound clips — XL / critical
- Masking (vector roto + layer masks + feather) — XL / high
- Motion tracking & stabilization — XL / high
- Media bins / organization / metadata tagging — M / low

### Image Studio (28 → target 78)
**Wave 1 — quick depth wins (M)**
- Layer groups + hierarchy (folders, group mask/opacity/blend) — M / critical
- Channels panel + CMYK/Lab support — M / medium
- Select & Mask workspace + Refine Edge — M / medium
- Brush library + dynamics (size/angle/scatter/color jitter) — M / medium
- Action recorder + batch processing — M / medium
- Type panel + OpenType + font search — M / medium

**Wave 2 — vector + non-destructive (L)**
- Pen tool + vector paths (bezier selections/masks) — L / critical
- Smart Objects (non-destructive imports, linked instances) — L / high
- Camera Raw filter / advanced color grading (HSL-by-hue, clarity, texture) — L / high
- 16/32-bit float + HDR — L / medium

**Wave 3 — deform + filter galleries (XL)**
- Warp + Perspective + Liquify (mesh deform, fluid brush) — XL / high
- Blur Gallery (Focus/Iris/Tilt-Shift pins) + advanced filters — XL / high

### PDF Studio (32 → target 72)
**Wave 1 — quick depth wins (S/M)**
- Markup toolbar (strikethrough/underline/squiggly + ink smoothing) — S / high
- Document properties / XMP metadata editor UI — S / medium
- Bates numbering (sequential, prefix/suffix, date stamps, bulk) — M / critical
- Batch operations (multi-page/multi-doc actions, bulk export) — M / high
- Search & replace (regex, whole-doc, replace-all) — M / medium
- Rich text formatting in text tool (font/bold/italic/size/align) — M / high
- Hyperlinks & bookmarks / TOC outline — M / medium
- Layer/object management panel (z-order, lock, multi-select) — M / medium

**Wave 2 — review + forms + a11y (L)**
- Document comparison / diff (side-by-side, redline, change tracking) — L / critical
- Advanced form creation (field props, validation, dropdown/radio, tab order, submission) — L / high
- Accessibility / tagging (PDF/UA, structure tree, alt-text, WCAG checker) — L / high

**Wave 3 — crypto signatures (XL)**
- Digital signatures with X.509 + timestamping (PKCS#7, LTV) — XL / critical

### Office Sheets (32 → target 74)
**Wave 1 — quick depth wins (S/M)**
- Find & Replace with regex + format matching — S / medium
- Advanced formula breadth (OFFSET, INDIRECT, AGGREGATE, XIRR/XNPV/MIRR, +~200) — M / high
- Filter views (named, saveable, multi-column, sort memory) — M / high
- Pivot refresh on source edit + in-pivot filter UI — M / high
- List-from-range validation + cascading dropdowns — M / medium
- Chart types (waterfall/funnel/histogram/box-plot/secondary axis) — M / medium
- Array formula UI + arg-hint autocomplete — M / medium
- Multi-sheet dependency graph + rename-refactor — M / medium

**Wave 2 — interop + analysis (L)**
- XLSX round-trip fidelity (styles, charts, validation, named ranges) — L / critical
- Goal Seek / Solver (iterative what-if) — L / high
- PDF + Google Sheets sync export — L / medium

**Wave 3 — the big engine (XL)**
- Dynamic array spilling + LAMBDA/LET custom functions — XL / critical

### Office Docs (32 → target 76)
**Wave 1 — quick depth wins (S/M)**
- Paragraph/line spacing + indentation controls — S / high
- Find/Replace with regex + formatting search — M / medium
- Advanced list formatting (multilevel, restart, bullet shapes, legal numbering) — M / high
- Footnotes & endnotes + cross-references — M / high
- Page breaks + section breaks — M / high
- Presence awareness / cursor tracking in collab — M / medium
- Template gallery (resume/letter/report) — M / medium
- Auto-updating TOC + citation/bibliography — M / medium

**Wave 2 — styles + fidelity (L)**
- Paragraph + character styles system (named, inheritance) — L / critical
- Images: wrapping + captions + DOCX preservation — L / high
- Full DOCX fidelity (images, hyperlinks, complex tables) — L / high

**Wave 3 — page model (XL)**
- Page layout control (margins, columns, headers/footers, orientation, sections) — XL / critical

### Office Slides (32 → target 74)
**Wave 1 — quick depth wins (S/M)**
- Hyperlinks & internal slide refs — S / medium
- Slide transitions (30+ types, duration/sound) — M / critical
- Animation timeline/sequencer (per-element order, triggers) — M / high
- Layer/z-order management (front/back, group, lock/hide) — M / medium
- Outline/normal view (edit content as tree) — M / medium
- Video/audio media embed — M / medium

**Wave 2 — objects + masters (L)**
- Slide master & reusable layout system — L / critical
- Presenter view (current+next+notes+timer) — L / critical
- Table creation & editing — L / high
- Chart/graph engine with data editor — L / high
- Full PPTX export fidelity (images/arrows/anim/notes/layouts) — L / high

**Wave 3 — collab (XL)**
- Collaborative editing (real-time, cursor awareness) — XL / high (reuse Docs/Sheets CRDT)

### Audio-Voice (28 → target 72)
**Wave 1 — quick depth wins (S/M)**
- Batch operations (batch LUFS-normalize, batch fade, multi-clip FX paste) — S / medium
- Parametric compression (sidechain, lookahead, makeup-gain UI) — S / medium
- Advanced de-noise UI (strength, threshold, preview, noise-profile) — S / low
- Undo/redo history panel — S / low
- Parametric (31-band/graphical) EQ — M / high
- Unlimited tracks + groups/buses + aux routing — M / high
- De-reverb + de-click/de-pop — M / high
- Sentence-level transcript editing + transcript search/replace — M / medium
- Markers/regions + SMPTE timecode — M / medium

**Wave 2 — envelopes + spectral (L)**
- Clip gain/volume envelopes (draw curves, ducking) — M / critical
- Spectral interactive editing (paint to erase noise/hum) — L / high
- Multiband compression — L / low

### Audio-Music (28 → target 70)
**Wave 1 — quick depth wins (S/M)**
- Metronome + count-in + tap-tempo — S / medium
- Quantize grid + snap-to-scale in piano roll — M / high
- Full MIDI multitrack export (per-track files, zip) — M / high
- Metering (track peak/RMS + master, clip indicator, spectrum) — M / high
- Humanize UI (per-step micro-timing knobs) — M / medium
- Full ADSR + filter envelope editor per voice — M / high

**Wave 2 — track architecture (L)**
- Per-track insert FX + send/return buses — L / critical
- Dedicated arrangement/timeline window (drag pattern blocks) — L / high
- Add-track (beyond 8 fixed) — L / high
- LFO + modulation matrix — L / medium

**Wave 3 — the big systems (XL)**
- Automation lanes (volume + FX params over time) — XL / critical
- Sampler (load/loop/pitch + envelope/filter) — XL / critical

### Subtitle Studio (38 → target 75)
**Wave 1 — quick depth wins (S/M)**
- Sidecar SRT/VTT export alongside video — S / medium
- Framerate-aware timing / FPS conversion helper — S / medium
- Real-time spell-check + char-count warnings — S / low
- Automatic overlap/gap detection + one-click repair — M / critical
- Per-cue styling overrides + inheritance — M / high
- Batch timing ops (scale, stretch-to-fit, shift-on-selection) — M / high
- ASS/SSA override parsing & preservation on import — M / medium
- Confidence-score review UI (Whisper already computes) — M / medium
- Speaker ID + per-speaker cue coloring — M / medium

**Wave 2 — tracks + standards (L)**
- Multi-track subtitle management + visibility UI — L / critical
- Per-word retime on the waveform timeline — L / high
- DFXP/TTML export (broadcast/streaming a11y) — L / medium

---

## 3. Cross-Cutting Shared Engines (build ONCE, reuse everywhere)

These are the force multipliers. Building each engine once and wiring it into N studios is the entire economic logic of the campaign.

| # | Shared engine | Consumers | What it provides | Effort |
|---|---|---|---|---|
| C1 | **Keyframe / Automation Engine** | Video, Image (anim layers), Slides (anim sequencer), Audio-Voice (gain envelopes), Audio-Music (automation lanes) | Param→track model, interpolation (linear/bezier/hold/ease), graph/dope-sheet editor UI, breakpoint draw, copy/paste KFs, easing curves | L |
| C2 | **Effects-Rack pattern** | Video (effects), Image (LayerFx), Audio-Voice (effect chain), Audio-Music (per-track inserts) | Ordered chain of `{uid, effectId, params, bypassed}`, reorder/disable/preset-save, preview==export guarantee, per-effect param UI generator | M |
| C3 | **Render / Export Queue** | Video, Image (batch), PDF (batch/multi-format), Audio-Voice (batch export), Slides | Enqueue N jobs, background render, preset I/O profiles, progress + backpressure, multi-variant output | M |
| C4 | **Preset System** | ALL 9 | Save/load/share named presets (color grades, FX chains, styles, layouts, export profiles, validation rules); import/export JSON; favorites | S |
| C5 | **Vector / Mask layer** | Image (pen/masks), Video (roto masks), PDF (shapes), Slides (shapes) | Bezier path model, pen tool, feather/grow/shrink, path→selection/mask, boolean ops | L |
| C6 | **Direct-Manip Stage** | Image, Video preview, Slides canvas, PDF editor, Subtitle preview | Transform handles (scale/rotate/skew), smart guides + snap, multi-select, z-order, group/lock, marquee | M |
| C7 | **CRDT Collab + Presence** | Docs (have it), Sheets (have it), Slides (gap), PDF (comments) | HTTP-signal CRDT, cursor/presence awareness, comment threads, room URLs — already exists in Docs/Sheets, generalize | M |
| C8 | **Parametric EQ / Audio-graph** | Audio-Voice, Audio-Music | Shared Web Audio node graph, 31-band/graphical EQ, sends/buses, metering (LUFS/peak/RMS/spectrum) | M |
| C9 | **Project Management** | ALL 9 | Bins/folders, metadata tagging, search, version history, crash recovery (some exist), template library | M |
| C10 | **Batch/Action Recorder** | Image, PDF, Audio-Voice, Sheets, Subtitle | Record op macro → replay on selection/folder; the automation backbone | M |
| C11 | **Office-format fidelity layer** | Sheets (XLSX), Docs (DOCX), Slides (PPTX) | Round-trip styles/images/charts/validation/named-ranges/notes; the shared OOXML read+write core | L |

---

## 4. Recommended Global Build Order (next ~10 waves)

Sequenced so each wave ships visible depth AND lands a shared engine that later waves consume. Device-verify (real phone + desktop) at the end of every wave.

**Wave 0 — Engine foundations (enables everything after)**
- C4 Preset System (S) + C2 Effects-Rack pattern (M). Smallest engines, immediately reused. Retrofit existing FX racks onto C2.

**Wave 1 — Quick-win depth blitz across ALL studios (S/M only)**
Ship the entire "Wave 1 quick wins" S-effort tier everywhere: Video LUT/ripple-trim, Image groups/channels/refine-edge, PDF markup/Bates/search-replace, Sheets regex-find/filter-views, Docs spacing/lists/footnotes, Slides transitions/hyperlinks, Audio-Voice batch/param-comp, Audio-Music metronome/quantize, Subtitle overlap-repair/sidecar. Highest impact-per-hour of the campaign.

**Wave 2 — Keyframe/Automation Engine (C1)**
Build C1, wire into Video (speed-ramp + graph editor), Image (layer anim), Slides (anim sequencer). Lands 3 high-impact features off one engine.

**Wave 3 — Audio engine + automation (C8 + C1 reuse)**
C8 parametric-EQ/audio-graph → Audio-Voice (31-band, buses, unlimited tracks) + Audio-Music (per-track inserts, sends, metering). Then C1→audio = Voice gain envelopes + Music automation lanes.

**Wave 4 — Render/Export Queue + Batch (C3 + C10)**
C3 queue + C10 action recorder. Wire into Video render queue, Image batch, PDF batch, Audio-Voice batch export, Sheets/Docs/Slides export presets.

**Wave 5 — Office fidelity layer (C11)**
The shared OOXML round-trip core → Sheets XLSX, Docs DOCX, Slides PPTX all gain styles/images/charts/notes preservation simultaneously. Unblocks "we lose your work" dealbreaker across all 3 office tools.

**Wave 6 — Vector/Mask + Direct-Manip Stage (C5 + C6)**
C6 Stage (transform handles/snap/group/z-order) → Image, Slides z-order, Video preview, PDF. C5 vector/pen → Image pen tool + Video roto masks + Slides/PDF shapes.

**Wave 7 — Collab generalization (C7)**
Generalize existing Docs/Sheets CRDT → Slides real-time + PDF comments + presence/cursor awareness everywhere.

**Wave 8 — Office page/structure systems**
Docs page-layout (margins/columns/headers/footers/sections, XL) + Slides master/layouts + presenter view + Sheets goal-seek/solver. The big office systems.

**Wave 9 — Color + composition heavy systems**
Video HSL qualifiers + nested sequences + Image Camera-Raw + 16/32-bit. The DaVinci/Photoshop-grade color depth.

**Wave 10 — XL frontier systems**
Video motion-tracking/stabilization + masking-roto, Image warp/liquify + blur-gallery, Sheets LAMBDA/dynamic-spill, PDF X.509 digital signatures, Audio-Music sampler, Subtitle multi-track. The hardest, highest-ceiling features, each now resting on engines built in Waves 0–7.

**Sequencing rationale:** quick wins first (morale + immediate rival-parity), then the 4 cross-cutting engines that the XL features depend on (keyframe, audio-graph, queue/batch, fidelity), then the heavy per-studio systems last — so by Wave 8–10 every XL feature plugs into an existing engine instead of rebuilding scaffolding. Per the project's see-fix-see mandate, each wave is device-verified on a real phone + desktop before advancing.
