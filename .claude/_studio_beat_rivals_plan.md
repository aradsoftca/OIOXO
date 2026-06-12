# Studios — Beat-the-Frontier-Rivals Execution Plan

Tracked plan to make each studio beat its two named rivals on UX + UI + features.
Graded against the live audit (2026-06-12) + the saved rival bars (`.claude/rival_bars/`).
"Beat" = a frontier user switches to us and doesn't miss their tool.

**Status keys:** `[ ]` todo · `[~]` in progress · `[x]` done · `[?]` needs live re-check first

## Two structural weapons (weaponize in every item)
- 100% on-device / no upload / no account.
- One suite, one creative loop (output of any studio → into the others).

## Three rules
- No honesty gaps (fake collab / undisclosed watermark / fake-AI = an instant loss).
- The micro-interaction IS the product (snap guides, ghost-drag, fill-handle preview, cursor-ring, instant undo).
- Reliability is a headline (bulletproof autosave + 60fps + never-freeze).

---

## Execution order (by leverage)
1. [x] Transcription proven end-to-end (Node test: verbatim transcript + timestamps; WebGPU+WASM fallback shipped 814989b). Unblocks Video+Voice+Subtitle.
2. [x] Image general-matting Remove-BG — RMBG-1.4 via v3, soft matte, any subject (929ec5c; proven in Node).
3. [x] Office: cell-feel + fill-handle ALREADY DONE; shipped F4 + autocomplete (91bdd69) + share-link collab + presence (a021183).
4. [~] Video transport: mostly already worked; fixed empty-area seek + scroll-offset bug (30abc1e). Next = AI Auto-Cut.
5. [x] Music: 5 browsable parametric sound kits + click-to-preview (9c40160). Loop-library-with-tempo-match = future bigger add.
6. [ ] Cross-cutting X1 (reliability) + X2 (honesty), continuous.

---

## 1. PDF — vs Sejda + Acrobat  (WE WIN; defend & extend)
- [x] P0 Smart-Redact auto-detect CONFIRMED working: findPii matches email/phone/SSN/CC/IBAN/IPv4 + handler places rects at glyph positions (verified on audit text). Audit "no result" was a timing artifact.
- [x] P1 Raised free page cap 50 → 200 to match Sejda (0a78f50).
- [ ] P1 Brand footer honest/off for edited docs.
- [ ] P2 "Verify redaction" button — re-open export, prove the string is unfindable in-UI.

## 2. Music — vs GarageBand + BandLab  (at parity; one gap)
- [x] P0 Browsable sound kits + click-to-preview — 5 parametric kits (Classic/808 Trap/Lo-Fi/Acoustic/Synthwave) re-voice the synth, zero asset weight, auto-preview on pick (9c40160). (Loop library w/ tempo/key-match is a later, bigger add.)
- [ ] P1 Drop-and-it's-in-key/in-tempo (auto time-stretch + pitch-match on drop).
- [ ] P1 Drag-across-to-paint steps + per-row playback dir (fwd/rev/ping-pong/random) + polymeter loop points.

## 3. Image — vs Photopea + Canva  (3 real gaps)
- [x] P0 General-object matting Remove-BG — RMBG-1.4 (briaai) via transformers.js v3, soft alpha, any subject; selfie segmenter kept as fallback (929ec5c).
- [x] P1 Export dialog: had Format+Quality+PSD; ADDED scale (10-200% + presets + out-dims) + live file-size estimate (0d269f6). (before/after still TODO)
- [x] P1 Smart guides on layer drag — magenta snap lines to doc centre/edges, Alt to disable (7b62fba). (thirds/equal-spacing + rotate-cursor still TODO; numeric W/H/angle already exists)
- [x] P2 Magic Eraser / object-remove — ALREADY DONE: "Remove Object" button runs MI-GAN inpaint on the selection mask, on-device (tools/image-studio runRemoveObject). False gap.

## 4. Office (Sheets) — vs Google Sheets + Excel  (win on feel + privacy)
- [x] P0 Cell-editing micro-model — ALREADY DONE (audited): type-to-overwrite, F2/Esc, Enter=down/Tab=right, Ctrl+Arrow data-edge, Ctrl+Shift+Arrow extend.
- [x] P0 Fill handle — ALREADY DONE (audited): series auto-detect + double-click-fill-down + ghost preview + Autofill-options chip.
- [x] P1 Formula affordances (partial): F4 anchor cycle + function autocomplete shipped (91bdd69). Still TODO: color-coded range highlighting, click-to-insert ref, arg hints.
- [x] P1 Real share-link collaboration + presence cursors — Share mints ?collab=<room> link + copies it; opening a link auto-joins; remote selections render as colored cell + name flag; avatar stack (a021183). Collab engine was already real; this fixed entry UX + presence.
- [ ] P2 On-device fill-with-AI (infer transform from 2 examples) + NL "build me this sheet".
- [ ] P2 Honesty: ship Docs/Slides OR rename "Office" → "Sheets".

## 5. Video — vs CapCut + Clipchamp  (fix fundamentals, then leapfrog)
- [x] P0 Transcription/auto-caption — runtime fixed (64fdf85) + WebGPU (814989b); proven via Node.
- [x] P0 Transport reliability — MOSTLY false alarm: ruler-seek/drag-scrub/J-K-L/←→-frame-step/Home-End/playhead-line all already work. Fixed: empty-timeline click now seeks + corrected scroll-offset scrub bug (30abc1e).
- [ ] P1 AI Auto-Cut / Auto-Edit (footage + song → beat-synced rough cut). CapCut WEB lacks this = leapfrog.
- [ ] P1 Timeline feel: ripple-close on delete, ghost-drag, snap guide line, live trim/duration tooltip.

## 6. Voice — vs Descript + Adobe Podcast  (make text-based editing real)
- [~] P0 Text-based editing works (transcription runtime fixed; verify transcript→audio cut).
- [ ] P0 Per-clip waveform rendering (clips currently flat blocks).
- [ ] P1 One-click Studio-Sound/Enhance (non-destructive, A/B); verify de-ess/silence-removal run.
- [ ] P1 Honest filler-word removal (reviewable tokens + count badge + soft-strike, not blind nuke).

## 7. Subtitle — vs CapCut + Aegisub  (best-designed; turn it on)
- [~] P0 Auto-transcribe working (runtime fixed; verify cues land).
- [ ] P0 Verify Aegisub precision loop: q/w in-out, r preview, g commit+advance, word-level boundary drag.
- [ ] P1 Karaoke/word-by-word animated captions one click from transcribe (wire preset to word timestamps).
- [ ] P1 Meaning-aware auto-segmentation + onset-accurate timing (kills CapCut's 2 top complaints).

---

## Cross-cutting (do once, win everywhere)
- [ ] X1 Reliability pass: autosave + crash-recovery + never-freeze 60fps + visible "auto-saved" indicator.
- [ ] X2 Honesty audit: kill every fake/undisclosed claim across all studios.
- [x] X3 Discoverability: `?` shortcut overlay (FIXED 2026-06-12) + contextual action bar (action bar still TODO).
- [ ] X4 Suite loop: send any studio's output into the others.
- [ ] X5 On-device AI default, not paywall: caption/transcribe/matting/transform free + local.

---

## Zero-cost / high-value sweep (2026-06-12)
Owner asked for more "costs nothing, big value, on-device" features like Auto-Cut
across all studios. Built Auto-Cut (ffcebd2 — the ONE genuinely-missing such
feature). Swept the rest; nearly all such features ALREADY EXIST:
- [x] Video AI Auto-Cut — BUILT (ffcebd2): beat-detect DSP + energy-scored,
      beat-aligned assembly. On-device, no model. Leapfrogs CapCut Web.
- [x] Subtitle karaoke word-by-word captions — already shipped (CuePreview
      word-highlight on live preview + Karaoke toggle + ASS \k export).
- [x] Voice one-click Enhance (RNNoise denoise) + compressor + gate + de-ess —
      already shipped. Text-based editing (deleteWord + filler removal via word
      timings) already shipped. Per-clip waveform (WaveformView) already renders.
- [x] Image Auto-Enhance (white balance + levels) — already shipped (Enhance btn).
- [x] Music humanize + swing — already shipped.
- [x] Office smartFill (infer transform from examples) — already shipped + wired.
GENUINE remaining zero-cost gaps are now few. On-device upscale (Image) would be
high-value but needs a model (not zero-cost). Conclusion: the studios are far
more feature-complete than the live audit implied — the rival-defining work is
substantially done.

## Notes
- Each P0/P1 starts with a 5-min live re-check — several may already be done (cf the Ctrl+T false alarm).
- Edge is privacy + no-friction + one-roof, PLUS not leaving the holes (matting, collab, auto-cut, transcription) that send a pro back.
- Done log: transcription→v3 (64fdf85); PDF footer / Office "3 sheets" / Image caps / shortcut overlay (8111032). See [[project_studio_audit_fixes_2026_06_12]].
