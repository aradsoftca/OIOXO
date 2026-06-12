# Studios — Master Audit + Beat-the-Rival PRD (2026-06-11)

Method: live Playwright on :3001 (Image Studio driven end-to-end: load image, live
adjustments, on-device Remove BG, Export dialog) + full line-cited source audit of all
7 flagship `tools/*-studio/ui.tsx` against the saved rival bars (`.claude/rival_bars/*`).
Scored on three weighted axes: **Features (F)**, **UX polish (U)**, **Honesty (H)**.

Honesty = does every claim hold (exports work, redaction redacts, "on-device" true,
no surprise watermark, no fake collab). Weighted verdict = do we beat the rival.

---

## SCORECARD (0–10 per axis; "Beat?" = composite vs the named rival)

| Studio | Rival | F | U | H | Beat rival? | One-line why |
|---|---|---|---|---|---|---|
| **PDF** | Sejda / Acrobat | 8 | 6 | 7 | **YES (edge)** | True redaction is REAL + byte-destructive + metadata-stripped; true in-place text edit; 100% client-side beats every rival's upload. Loses only on polish (no resize handles, no drag-reorder) + **undisclosed free footer**. |
| **Image** | Photopea | 7 | 6 | 9 | **CLOSE / partial** | Real layers+masks+adjustment layers+15 blends, on-device Remove BG/Object/Subject (Photopea uploads!), PSD export, no watermark, autosave. Loses on **no Ctrl+T transform UI**, no guides/snapping, no selection-refine, thin export dialog. |
| **Video** | CapCut | 6 | 5 | 8 | **NO (60%)** | Real WYSIWYG preview (NOT black — verified in code), real WebCodecs export, honest watermark, auto-caption, auto-reframe. Loses on **keyframe UI is a skeleton**, **no audio waveforms**, no beat-sync/auto-cut/TTS, text position preset-only. |
| **Subtitle** | CapCut / Aegisub | 6 | 5 | 6 | **NO** | Whisper word-level transcribe, waveform drag-region, commit-and-advance loop, diarization, karaoke preview. Loses on **no word-level retiming UI (karaoke is cosmetic)**, split-text bug, ASS import silently fails, burn-in uses server ffmpeg (on-device claim leaks). |
| **Voice** | Descript | 5 | 5 | 6 | **NO** | Multitrack, ripple, non-destructive trim, stem-split, LUFS export+meter, on-device AI. Loses on **word↔playhead link is one-way (Descript core stubbed)**, **filler-word removal advertised but NOT coded**, no real-time FX preview, single-clip select only, hardcoded bitrate (claims choice). |
| **Office** | Google Sheets | 5 | 4 | 4 | **NO** | Fill-series detect, pivots, 6 chart types, .xlsx round-trip, cond-format, crash recovery. Loses hard on **fake "comments" implies collab but is local-only**, **frozen panes stored but NOT rendered**, **data-validation dialog doesn't enforce**, no sort/filter, no formula autocomplete, no Tables. |
| **Music** | BandLab / GarageBand | 5 | 5 | 5 | **NO** | Real drag-paint steps, per-step velocity+chance, swing, pattern chain, procedural gen, real-time FX, autosave. Loses on **no loop library (claimed "loop browser" is FAKE)**, **no timeline/scrubbing**, **no stem export (claimed)**, no quantize (claimed), drum "kits" are 1 synth set, "AI" is procedural (overreach), undisclosed watermark. |

**Headline answer:** We **beat one rival outright (PDF, on trust/redaction)**, are **close on Image**
(architecture wins, transform UX loses), and **lose the other five** — not because the architecture
is weak (it's genuinely strong everywhere) but because each has **1–2 signature rival features that
are missing or skeletal**, plus a recurring set of **honesty bugs** that would erode trust at launch.

---

## CROSS-CUTTING FINDINGS (fix these once, helps everywhere)

### A. HONESTY BUGS (highest priority — these are launch-blockers, not polish)
1. **Office "comments" = fake collaboration.** Local `CommentsModel` ref, zero network/BroadcastChannel.
   UI implies multiplayer. → Either ship real relay (the `/api/collab` + `makeHttpSignal` infra exists
   per memory) or relabel as private notes. **TRUST RISK.**
2. **Voice "filler-word removal" advertised, not implemented.** Only silence removal exists. → Implement or remove the claim.
3. **Subtitle/Music "loop library" + "word retiming" + Music "stem export"/"quantize"** claimed in UX but
   absent/fake. → Implement the headline one per studio; drop the rest from copy until real.
4. **Undisclosed free-tier watermark** on PDF (brand footer), Music (ID3/WAV metadata), possibly Voice.
   Image/Video are clean+disclosed. → Add a one-line "Free exports include a small mark — upgrade to remove"
   in each export dialog. Inconsistency itself is the bug.
5. **"On-device/nothing-uploaded" leaks:** Subtitle burn-in + (some) translate route through server ffmpeg /
   Chrome-only Translator. → Gate the claim per-operation, or move burn-in on-device.

### B. UX POLISH PATTERN (repeated across all 7)
- No live drag tooltips / ghost-drag on timelines (Video, Voice, Music, Subtitle).
- No right-click context menus (Video, others).
- Audio waveforms missing on audio tracks (Video especially).
- Thin export dialogs: no size estimate / before-after / scale (Image, Video).
- Selection/transform refinement missing (Image: Ctrl+T, refine edge; PDF: resize handles).

### C. WHAT'S ALREADY WORLD-CLASS (protect these)
- PDF true redaction (rasterize+flatten+sanitizePdf) — genuinely beats Smallpdf/Acrobat-web data-leak.
- On-device AI everywhere (MediaPipe/MI-GAN/Whisper/RNNoise/Spleeter) with real "no upload".
- Crash recovery / autosave (localStorage 2s debounce, 7-day TTL) in every studio — rivals' #1 complaint, solved.
- Real export pipelines (WebCodecs video, ag-psd, SheetJS, lamejs, LUFS) — not demos.

---

## PER-STUDIO PRD (to PASS the rival)

### PDF Studio — "Win is closest; lock it in"
Already beats Sejda on trust. To make it undeniable:
- P0 Disclose the free brand footer in the export dialog (honesty).
- P0 Add resize handles (mutate nw/nh on drag) to annotations/signatures/images.
- P1 Visual drag-to-reorder thumbnails with insertion line (currently button-only).
- P1 In-app form FILLING (today fields only apply on export).
- P2 Find & Replace; signature upload; insert blank page.

### Image Studio — "Architecture wins, close the transform gap"
- P0 **Free Transform (Ctrl+T)**: interactive bbox + corner handles + rotate + numeric W/H/angle.
  `transformActive` state already exists (declared, unused) — wire it.
- P0 Guides + snapping (smart-guide lines); grid is currently visual-only with no snap math.
- P1 Selection refine: feather/expand/contract + refine-edge.
- P1 Adjustment-layer CLIPPING to the layer below (alt-click), + layer groups.
- P1 Export depth: quality slider + live size estimate + scale + AVIF.
- P2 Generative fill/expand (the only true Photopea-ceiling gap; needs a model — defer).

### Video Studio — "Finish the skeleton"
- P0 **Keyframe timeline UI**: lane on the clip + draggable diamonds + easing-curve editor.
  Data model + AnimatableSlider + export-sampling already exist — it's purely UI.
- P0 **Audio waveforms** on audio clips (peaks render) — major precision tax without it.
- P1 Free-form text XY drag in the preview (today: top/center/bottom presets only).
- P1 Dissolve transition; right-click clip context menu; live trim/duration tooltip.
- P2 Beat-sync (detect beats on user's own music) + AI auto-cut + TTS voiceover.

### Subtitle Studio — "Make karaoke real"
- P0 **True word-level retiming UI**: drag individual word boundaries; karaoke updates live;
  export corrected \k tags. (Word timings exist in data; just no edit UI.)
- P0 Fix split-at-playhead: actually bisect TEXT + reflow word timings (today both halves get full text).
- P1 Inline double-click edit; click-word-to-seek; multi-select batch shift.
- P1 Fix ASS import (accepts .ass but parser only does SRT/VTT) or stop accepting it.
- P2 Meaning-aware auto-segmentation; per-word emphasis animation; scene-cut snapping.

### Voice Studio — "Earn the Descript comparison"
- P0 **Bidirectional word↔playhead link**: click word → seek; scrub → highlight word. (Core Descript loop.)
- P0 Implement filler-word removal (it's advertised) OR remove the claim.
- P1 Real-time effect preview (today: applied only on export).
- P1 Multi-clip selection + marquee; per-track record arm.
- P1 Expose bitrate/sample-rate choice (UI claims it; values are hardcoded).
- P2 Multitrack auto-sync on import w/ speaker labels; AI command box.

### Office Studio — "Stop the lies, then add depth"
- P0 **Resolve fake collab**: ship real cross-device comment sync (reuse /api/collab relay) OR relabel as
  private notes. (Biggest trust risk in the whole suite.)
- P0 **Render frozen panes** (state is stored but grid ignores it).
- P0 **Enforce data validation** (dialog builds rules that do nothing on input).
- P1 Sort & filter (table-stakes vs Sheets, currently absent).
- P1 Formula autocomplete + colored range-highlight while editing + F4 anchor cycle.
- P2 Tables w/ structured refs; canvas/WebGL grid for 60fps large sheets.

### Music Studio — "Be honest, then add the loop economy"
- P0 Disclose watermark; relabel "AI" → "procedural"/"Genre Starter"; drop "loop browser"/"stem export"/
  "quantize" from copy until built.
- P0 **Stem export** (offline-render N times muting all-but-one) — it's claimed and high-value.
- P1 Loop library w/ click-to-preview in-tempo/in-key (the BandLab/Soundtrap core).
- P1 Timeline view w/ scrubbing playhead + region looping (today grid-only).
- P2 Polymeter (per-row length), per-row playback dir, quantize, real drum-kit samples, mic input.

---

## FIX-LOOP ORDER (highest impact first, see→fix→see)
1. **Office fake-collab + frozen panes + validation** — trust + 3 visibly-broken features in one studio.
2. **Image Ctrl+T Free Transform** — single biggest pro-user gap; state stub already present.
3. **Video keyframe UI + audio waveforms** — finishes the skeleton; unlocks beat-sync later.
4. **Subtitle word-retiming + split-text bug** — makes the headline feature real.
5. **Voice word↔playhead link + filler-removal honesty.**
6. **Cross-cutting: watermark disclosure in every export dialog.**
7. **Music stem export + honesty relabel.**
