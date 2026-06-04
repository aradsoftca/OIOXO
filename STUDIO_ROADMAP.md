# Creative Suite Roadmap — Browser-Only, On-Device, "Best in the World"

> Constraints (hard): no server compute; every model ≤180MB on-device download; load WASM/models from official CDN, never self-host assets; Free signs output, Pro removes.
> This doc is built from 8 per-studio competitive matrices + a mobile-UX audit, with key claims spot-verified against the codebase (see "Verified ground truth" notes).

**Verified ground truth (corrections to the raw matrices):**
- `studio-invoice`, `studio-avatar`, `studio-background`, `studio-gif` **DO exist and are built** (`tools/studio-*/ui.tsx`). The matrix marked them "NOT FOUND" — that was a read-set limit, not reality. `studio-background` already reuses the on-device `removeBackground` engine. `studio-invoice` rasterizes its PDF via html2canvas — **same ATS-killer flaw as the resume tool** (a flat image PDF, zero selectable text). Also present but un-audited: `office-studio`, `social-avatar`, `studio-redact`, `gen-invoice`, `video-to-gif`, `video-gif-to-video`.
- Video Studio `ui.tsx` does **not** import `videoToCaptions` or the TTS engine → captions/voiceover genuinely unwired.
- Voice Studio `ui.tsx` does **not** import `engines/transcribe` → ASR genuinely unwired.
- Subtitle Studio hardcodes `wordTimestamps: false` (line 318) → karaoke unwired, but the engine already returns word times.
- Compositor (`engines/video/compositor.ts`) has `transition`/`transDur` fields (lines 48-49) but only per-clip `globalAlpha` — **no cross-clip blend** in `renderTimelineFrame`. Transitions are a phantom feature.
- `studio-resume` export (lines 63-69) = `html2canvas → jsPDF.addImage` → image PDF, fails every ATS parser.

---

## 1. Scorecard

% values are honest gut-estimates of "distance to a killer/flagship tool," separately vs web/mobile rivals and vs pro-desktop rivals. "Killer" = a creator would *choose us over the rival*, not just tolerate us.

| Studio | One-line verdict | % to killer vs web/mobile | % to killer vs pro-desktop |
|---|---|---|---|
| **Video** | Real compositor, real color grading, real export — but transitions are fake, no captions/reframe/chroma despite owning the parts. | **70%** | 45% |
| **Image** | Genuinely strong layers/masks/curves + on-device BG removal; missing retouch (heal/clone) and inpaint makes it feel toy for photos. | **65%** | 50% |
| **PDF** | Best-in-class browser redaction; but it's an *annotator*, not an *editor* (can't fix existing text, can't fill forms, fake "encryption"). | **60%** | 40% |
| **Audio/Music** | Pro-grade DSP/loudness master chain, but the 8×16 grid + oscillator synths read as a toy next to any DAW. No piano roll, no real stems. | **45%** | 30% |
| **Voice** | Pro signal path + LUFS, but the category-defining features (transcript edit, Studio Sound, ASR) are unwired despite shipping the engines. | **40%** | 35% |
| **Docs** | Solid DOCX in, but export is plain-text-only, no tables/images/font controls/find-replace. Reads as a 2010 textarea. | **35%** | 20% |
| **Slides** | One title + one body textarea per slide. Not a deck editor — a note-taker. The biggest structural gap in the suite. | **20%** | 15% |
| **Sheets** | 8 math functions, single sheet, no IF/VLOOKUP, no formatting. Not yet a spreadsheet. | **25%** | 15% |
| **Diagram** | One rounded-rect shape, straight lines through boxes, fixed canvas. A proof of concept. | **30%** | 20% |
| **Chart** | Clean bar/line/area/pie with CSV — actually decent; just needs more types + interactivity. | **55%** | 40% |
| **Subtitle** | Strong pro sync/compliance feel + on-device ASR; but can't burn-in to video and no karaoke despite owning word timestamps. | **65%** | 55% |
| **Translate** | Real on-device MT + in-place image translation (a genuine differentiator); but won't take subtitle/video files. | **70%** | 60% |
| **Collage** | Solid fixed-grid; no drag-swap, no freeform, no text layer. | **60%** | n/a |
| **Meme** | Two hardcoded captions, upload-only. The defining feature (template gallery) is absent. | **30%** | n/a |
| **Poster** | Real layer model + drag, but `sans-serif`-hardcoded fonts and no resize/rotate handles scream toy. | **45%** | 30% |
| **Thumbnail** | Good base; one move (cut-out-subject-in-front-of-text) would make it pro. | **55%** | n/a |
| **QR** | Strong styled QR already; needs module/eye shapes + more payloads to lead. | **75%** | n/a |
| **Resume** | **Critically broken**: PDF is a rasterized image → fails every ATS. One layout, no save. | **30%** | n/a |
| **Mockup** | A screenshot beautifier, not a product-mockup tool. The whole Placeit category is missing. | **35%** | 25% |
| **Sticker** | Genuinely good die-cut maker; needs 512² messaging export + packs + animation. | **70%** | n/a |
| **Invoice** | Built, but **same image-PDF flaw as resume** (unparseable, no line-item math credibility). | **40%** | n/a |
| **Avatar / Background / GIF** | Built but thin (135-283 LOC). Background already on-device; GIF/avatar need the shared engines wired. | **45%** | n/a |

---

## 2. Table-stakes we still MISS (the embarrassing gaps — fix first)

Features *every* rival ships that we lack. Ordered worst-first within each studio.

### Resume (critical, reputational)
- **PDF is a rasterized image** (`html2canvas→addImage`) → fails every ATS parser. A resume tool that produces un-parseable resumes is actively harmful. → real text PDF via pdf-lib/@react-pdf.
- No template switcher (one hardcoded layout); no UI to add/edit Education or Skills (seeded constants only); no save/load (refresh wipes everything).

### Invoice (critical — same flaw)
- **PDF rasterized via html2canvas** → unparseable image. Invoices get re-keyed by accounting systems; a text PDF is table-stakes. → real text PDF + line-item math shown.

### Slides
- No free-canvas element model — exactly **one title + one body textarea per slide**. No images, shapes, free placement, speaker notes, present mode, or PPTX in/out. This is the single most structural "toy" gap in the suite.

### Sheets
- No logical/lookup/text/date functions (**no IF, VLOOKUP, COUNTIF, dates** — 8 math fns total). No cell formatting, no sort/filter, no multiple sheets, no undo/redo, no charts-from-range.

### Docs
- **DOCX export is plain-text only** (`textToDocx(innerText)` drops all bold/headings/lists/links/tables). No font/size/color/highlight controls, no tables, no image insert, no find & replace, no word count.

### Diagram
- Only **one shape** (rounded rect); arrows run straight through boxes; no shape library, no labels, no undo/redo.

### Meme
- **No template library** (upload-only) — the defining meme feature. Only two hardcoded captions; no font/color/size controls; no caption-bar-above mode.

### Chart
- Only 4 chart types (no scatter/stacked/donut/combo/radar); no axis titles, data labels, color picker, or legend placement.

### Video
- **Cross-clip transitions don't render** (phantom feature). No true rectangular crop tool. Project save drops media (must re-import).

### Image
- No selection refine (feather/grow/boolean) — replace-only hard-edge mask. No gradient *tool* (only as a layer style). No histogram/channels panel. No EXIF auto-orient (phone photos load sideways). No layer groups/clipping masks.

### PDF
- **Can't edit existing text** (overlay-only annotator). **Can't fill AcroForms.** "Password protect" is a **facade** (only sets metadata — misleading/dangerous claim). No PDF→Excel/PPT/per-page-images, no Office/image→PDF on-ramp. Merge exists but is hidden.

### Audio/Music
- **No MIDI piano roll** (fixed 8×16 grid). No audio recording/import-to-track. No undo for note edits beyond grid. Oscillator-only synths (no real instruments).

### Voice
- **No transcription wired** (engine ships, unimported). No SRT/VTT export. Saved projects drop audio buffers (re-import required).

### Subtitle
- **Can't burn-in to video** (sidecar text only). Translation uses browser-API-only and dead-ends with "unavailable on this device" while the real on-device MT engine sits unused.

### Translate
- Won't accept subtitle (SRT/VTT/ASS) or video files — the core subtitle-translate workflow rivals center on is absent.

### Collage / Thumbnail / Sticker / Mockup
- Collage: no drag-to-swap photos, no freeform, no text/sticker layer, PNG-only export.
- Thumbnail: locked 16:9, single fixed title+subtitle.
- Sticker: no 512×512 messaging-app export preset, no WebP.
- Mockup: no real device bezels (generic browser-bar only).

---

## 3. Cross-cutting wins (shared infra — highest leverage)

Each of these is built **once** and lifts many studios. These are the multipliers; prioritize them.

### C1 — Wire the on-device ASR/caption stack everywhere (HIGHEST LEVERAGE)
We **already ship** `engines/transcribe` (Whisper tiny ~40MB / base ~150MB, word timestamps, 99 langs, multi-thread WASM) and `engines/subtitle/auto.ts videoToCaptions`. They are imported by **almost nothing they should be**. One shared "transcribe(media) → {token,start,end}[]" hook unlocks:
- **Video**: auto-captions → TextClips; transcript/text-based editing.
- **Voice**: transcript panel, text-based edit, filler-word removal, SRT export, diarization labels.
- **Subtitle**: flip `wordTimestamps:true` (line 318) → karaoke word-highlight; transcript mode.
- **PDF**: (analogous extractPdfText path) chat-with-PDF.
Zero net new download — models are in budget and partly cached. **This is the single biggest unlock in the whole suite.**

### C2 — Shared transform/selection gizmo (on-canvas handles)
A reusable bounding-box component (8 scale handles + rotate + skew/distort corners, snap/align guides) wired to any `{x,y,w,h,rotation,scale}` element. Consumers: Image (free transform), Poster, Thumbnail, Meme, Slides (element model), Collage (freeform). Kills the "number-input-only / no rotation" toy tell across **6 studios** at once.

### C3 — Shared element-model + canvas layer engine
Poster already has `{TextLayer|ShapeLayer|ImageLayer}` + drag. Promote it to a shared module and adopt it in **Slides** (replaces the two-textarea slide — the structural fix), **Meme** (N draggable boxes), **Thumbnail** (multi-text + overlays), **Collage** (text/sticker layer). One engine, four studios flip from toy to real.

### C4 — Shared text-layout/font engine
Curated open-font set loaded via `FontFace` from CDN (Fontsource/Google Fonts, added to CSP), `await document.fonts.ready` before render; plus a glyph-on-path routine (curved/arc text) and proper line-height/letter-spacing/alignment/wrap. Consumers: Poster, Thumbnail, Meme, Slides, Image text, Collage, Translate image boxes. Removes the `sans-serif`-hardcoded tell everywhere.

### C5 — Shared WebGL filter/warp pass (glfx.js + homography)
One WebGL texture pipeline gives: Image (liquify, swirl/bulge/lens, perspective), Video (chroma-key shader), Mockup (perspective/displacement product warp), QR (n/a). Adopt glfx.js (CDN) + a small custom homography shader. Big visual-wow per unit effort across Image/Video/Mockup.

### C6 — Shared WYSIWYG frame-encoder (video out)
Video already has `compositor.ts` + WebCodecs + `mp4-muxer` + ffmpeg.wasm fallback. Expose a generic "render frames N→encoder" so **Subtitle** (burn-in), **Image** (animation→GIF/MP4), **Meme** (video/GIF meme), **GIF studio**, **Sticker** (animated WebP) all emit video/GIF instead of a single still. Converts several "preview-only gimmick" features into real deliverables.

### C7 — Shared on-device LLM/writer assist (≤180MB, already on HF)
The conductor/writer (SmolLM2-360M) used by oioxo search → "Rewrite/Summarize/Translate selection" (Docs), "Generate deck from prompt" (Slides), "diagram from description" (Diagram), "chat-with-PDF" (PDF), résumé bullet rephrase. Rivals charge for this behind cloud; offline + free + private is a flagship differentiator. Reuse the existing ECDHE model-key loader.

### C8 — Shared on-device segmentation matte → reuse 4 ways
`removeBackground` (already in `engines/image`, already used by Sticker + Background) → (a) Image "Select Subject" (threshold matte → selection mask), (b) Thumbnail "subject in front of text," (c) Video person-matting, (d) Background studio replacer. One model, four marquee features.

### C9 — Persist media in saved projects (fix re-import-required)
Video, Voice, Music, Image all drop decoded buffers on save and toast "files need reimport." Store encoded WAV/Opus/PNG blobs in the existing IndexedDB project layer keyed by `bufferKey`, rehydrate on load. A "real" studio doesn't lose your media — table-stakes credibility across 4 studios.

### C10 — Universal undo/redo + real text PDF utility
None of the 5 office studios has undo/redo. Add one generic command/snapshot hook. Separately, a shared "DocState → real-text PDF (pdf-lib, embedded fonts)" utility fixes **Resume + Invoice** (both currently rasterize) and upgrades Docs/Slides export quality.

---

## 4. Mobile UX (prioritized — shell fixes first)

The responsive foundation is solid (`StudioResponsive`, `MobilePanelHost` bottom-sheets, `usePinchPan`, 44px tab bar). The pain is inconsistent adoption + shared chrome that never got mobile sizing. **Shell fixes lift every studio at once — do them first.**

| # | Fix | Studios | Effort | Why |
|---|-----|---------|--------|-----|
| M1 | Route hand-rolled `fixed`/flex panels through `ResponsiveSidebar`; wrap every horizontal control strip in `overflow-x-auto [scrollbar-width:none]` like `StudioToolDock` | Audio, PDF, Video | M | Audio transport strip + PDF annotation toolbar + PDF comments (`w-80 fixed`) overflow off-screen on phones |
| M2 | Compute `--studio-top-offset` from header stack via ResizeObserver (or bottom-anchor sheet `inset-x-0 bottom-12 h-[70dvh]`) | all | S | The var is **never set**; sheets open at fixed 56/108px and paint over the live 120-170px toolbar |
| M3 | Responsive dialog widths in `SharedDialog` (`w-full max-w-[...]`) + bottom-sheet on phone | all | S | Fixed px widths (`w-[460px]`…`w-[820px]`) overflow + clip footer on 360px phones |
| M4 | Mobile size bump: `StudioButton`→h-10, `StudioSelect`→h-10, `StudioSlider` track→h-2.5 + 28px thumb, floating-panel toggle→≥44px | all | M | Below-44px targets throughout; slider thumb is ~6px tall (ungrabbable). Shared = one edit fixes all inspectors |
| M5 | `touch-action:none` on every pointer-drag surface; `pan-x` on timeline scroll axis. Standardize via `useDragSurface` | Video, Audio, Image, PDF | S-M | One-finger drags fight page/sheet scroll (timeline + sequencer grid lack it) |
| M6 | **Video timeline**: fat trim handles (≥24px hit via transparent `::before`), ≥24px playhead, always-visible track-X (no hover), pinch-zoom (reuse `usePinchPan`→px/s), mode-aware height | Video | L | **6px trim handles are the #1 finger-hostile surface in the suite**; track-X is hover-only = dead on touch |
| M7 | **Image**: merge Layers/Adjust/History into one tabbed bottom sheet (3 floating toggles collide at same coord); per-tool option sheets; enlarge swatches | Image | M-L | Three independent floating panels stack/collide on phone |
| M8 | **Audio**: long-press → pitch cycle (mirror right-click — currently **no touch path to edit pitch**); step cells ≥36px; octave chevrons ≥32px; collapse transport to sheet | Audio | M | Right-click-only pitch edit is impossible on phone; 28px cells, 10px chevrons |
| M9 | **PDF**: always-visible ≥40px page/annotation controls (currently `group-hover` = dead on touch); replace `window.prompt` text tool with existing `PromptDialog`; responsive comments | PDF | M | Hover-gated page actions + jarring OS prompt on mobile |

---

## 5. Ranked build order (across ALL studios)

Ordered by **(impact × reach) / effort**. Tier tag: **[TS]** table-stakes, **[PRO]**, **[KILL]** killer. Effort S/M/L/XL. Feasibility: yes / cdn-lib / needs-model (all ≤180MB) / no.

### Wave 0 — Stop the bleeding (broken/misleading things shipping now)
| # | Studio | Title | Tier | Effort | Feas | Approach |
|---|--------|-------|------|--------|------|----------|
| 0.1 | Resume | Real-text PDF (kill html2canvas) + ATS lint/score | TS+KILL | M | yes | Replace `html2canvas→addImage` with pdf-lib/@react-pdf `drawText` + embedded fonts → parseable PDF. Add on-device ATS lint (sections/length/contact/verbs/keyword-vs-JD, 0-100). **Reuse C10.** |
| 0.2 | Invoice | Real-text PDF (same fix) + line-item math | TS | S | yes | Same C10 utility; show subtotal/tax/total. Stop shipping an image invoice. |
| 0.3 | PDF | Remove the "password protect" facade; ship real AES + decrypt-on-open | TS | M | cdn-lib | Drop `encryptPdfWithMetadata` (only sets metadata — misleading). Use pdfcpu-wasm/qpdf-wasm (AES-256, in budget) to set passwords AND open encrypted PDFs (`addPdf` currently fails). |
| 0.4 | Mobile | Shell fixes M2+M3+M4+M5 | TS | M | yes | The cheapest reach in the doc — every studio improves. |

### Wave 1 — Wire the engines we already own (near-zero new download, transformative)
| # | Studio | Title | Tier | Effort | Feas | Approach |
|---|--------|-------|------|--------|------|----------|
| 1.1 | Video | Auto-captions → TextClips on the T track | KILL | M | needs-model* | `videoToCaptions(file,{size:'tiny'})` → one TextClip per chunk, caption preset. *Model already in repo/budget. Every rival has this; we have the parts unconnected. **Highest single leverage.** |
| 1.2 | Voice | Wire Whisper ASR → transcript panel + word times | TS | M | yes* | Import `engines/transcribe`; store `{token,start,end}` per clip. Gates 1.3/1.4/SRT/diarization. *Engine ships, unimported. **C1.** |
| 1.3 | Subtitle | Karaoke word-highlight (flip `wordTimestamps:true`) | KILL | M | yes | Engine already returns word times; store per cue, CSS-highlight active word, emit `\k`/`\kf` on ASS export. **The signature 2025 caption look.** |
| 1.4 | Voice/Video | Text-based editing (delete word → splice audio/footage) | KILL | L | yes | Map tokens→`[start,end]`; deleting = `splitAt`+ripple, reusing existing segment-rebuild path. Premiere/Descript's headline workflow, fully on-device. |
| 1.5 | Voice | Filler-word + silence cleanup (one button) | PRO | S | yes | Per-lang filler dict over tokens + existing `findSilences` → splice. Trivial once 1.2 lands. |
| 1.6 | Video | Remove-silences / Smart-Cut (RMS gap → ripple) | KILL | M | yes | No model: window RMS over the already-decoded AudioBuffer, ripple sub-threshold gaps. |
| 1.7 | Subtitle/Translate | Unify on-device MT pipeline | TS | M | yes | Replace subtitle's Translator-API-only path with `engines/doctranslate translateAll`; let Translate accept SRT/VTT/ASS. Kills the "unavailable on this device" dead-end. **C1-adjacent.** |
| 1.8 | Voice | SRT/VTT export + diarization labels (wire dead `diarization.ts`) | PRO/HIGH | S | yes | `chunksToSrt/Vtt` already exist; `diarizeAudio` is finished but dead — color clips by speaker. |
| 1.9 | Thumbnail | Subject-in-front-of-text (wire existing removeBg) | KILL | M | yes | Cutout layer drawn after title. **C8.** The signature modern YouTube thumbnail. |
| 1.10 | PDF | Chat-with-PDF / summarize / translate (on-device) | KILL | M | needs-model* | `extractPdfText`→chunk→existing on-device LLM, cite page numbers. *Model in budget. "AI that never sees the cloud." **C7.** |

### Wave 2 — Cross-cutting structural fixes (build the multipliers)
| # | Studio | Title | Tier | Effort | Feas | Approach |
|---|--------|-------|------|--------|------|----------|
| 2.1 | Slides | Free-canvas element model (text/image/shape, drag/resize/z) | TS | L | yes | **C3** — replaces the two-textarea slide. Unblocks images, animation, AI decks, PPTX. The structural flip from toy to real. |
| 2.2 | Sheets | HyperFormula engine (IF/VLOOKUP/COUNTIF/dates/text) | TS | M | cdn-lib | Swap hand-rolled 8-fn evaluator for HyperFormula (MIT, Excel grammar). Add multi-sheet tabs + cell formatting. |
| 2.3 | Image | Shared transform gizmo (free transform handles) | PRO | L | yes | **C2** — `scaleX/scaleY/rotation` fields exist but no UI. |
| 2.4 | Many | Shared element engine + text/font engine | TS/PRO | M | cdn-lib | **C3+C4** rolled out to Meme, Thumbnail, Poster, Collage. |
| 2.5 | Video | Render real cross-clip transitions in compositor | TS | M | yes | In `renderTimelineFrame`, blend overlapping clips (globalAlpha fade / clip-rect wipe). Mirror in preview. Kills the phantom feature. |
| 2.6 | Docs | Format-preserving DOCX export (DOM→OOXML) + toolbar (font/size/color/tables/images/find-replace) | TS | M | yes | Walk contentEditable DOM → OOXML runs. **C10-adjacent.** |
| 2.7 | Chart | Chart.js drop-in (types + interactivity + axis/labels) + bind to Sheets range | TS/HIGH | M | cdn-lib | Closes types/interactivity AND the embedded-chart gap in both studios. |
| 2.8 | Diagram | mermaid text→diagram + dagre auto-layout + shape enum + ortho routing | PRO/KILL | M | cdn-lib | "Diagram from text, offline" is a real differentiator. |

### Wave 3 — Marquee parity (on-device models, in budget)
| # | Studio | Title | Tier | Effort | Feas | Approach |
|---|--------|-------|------|--------|------|----------|
| 3.1 | Image | Content-aware / object-removal inpaint (brush-mask) | KILL | L | needs-model | MI-GAN 512 / LaMa ONNX (~20-30MB) via onnxruntime-web, tiled. Reuse brush+mask plumbing + the removeBg loader pattern. The defining 2025-26 web-rival feature. |
| 3.2 | Image | Healing brush + clone stamp + dodge/burn | TS/PRO | M | yes | Pure canvas. Closes the biggest photo-retouch credibility gap. |
| 3.3 | Music | MIDI piano roll + variable-length clips | TS | L | yes | The single biggest "toy" tell. `{pitch,start,length,velocity}` notes; scheduler already calls `scheduleSynth(freq,dur,vol)`. |
| 3.4 | Music | On-device AI stem separation (vocals/drums/bass/other) | KILL | L | needs-model | SCNet ONNX (22.6MB FP16) via onnxruntime-web, worker, ~3× realtime. BandLab Splitter parity, fully on-device. |
| 3.5 | Voice | Studio-Sound (denoise + de-reverb, one click) | KILL | L | needs-model | DeepFilterNet3 / GTCRN ONNX (few MB) via onnxruntime-web. The Adobe-Podcast-defining feature. |
| 3.6 | Video | Chroma key (green-screen) clip effect | PRO | M | yes | WebGL key shader (**C5**) or getImageData alpha-zero. Table-stakes for any "pro" claim. |
| 3.7 | Video | Auto-reframe / smart resize to 9:16/1:1 | KILL | L | needs-model | MediaPipe Selfie Seg (~3MB) → keyframe the (now keyframable) transform. #1 reason creators use CapCut/Canva. Depends on transform-keyframing. |
| 3.8 | Video | Make PiP transform keyframable (Ken Burns / fly-ins) | PRO | S | yes | Convert `transform` to the existing AnimatedParam machinery. Prereq for 3.7 + motion tracking. |
| 3.9 | Subtitle | Burn-in / hard-sub video export | KILL | L | yes | **C6** — composite CuePreview canvas per frame → WebCodecs encoder. Today it can't produce a captioned video at all. |
| 3.10 | Image/Mockup/Video | WebGL filter gallery + Liquify (Image), perspective warp (Mockup) | PRO | L | cdn-lib | **C5** — glfx.js + homography. |

### Wave 4 — Differentiation + breadth
| # | Studio | Title | Tier | Effort | Feas |
|---|--------|-------|------|--------|------|
| 4.1 | PDF | Edit existing PDF text (click-to-fix-a-line, font-matched) | KILL | L | yes |
| 4.2 | PDF | Real AcroForm fill + creation | TS/PRO | L | yes |
| 4.3 | Image | PSD import/export (ag-psd) | KILL | L | cdn-lib |
| 4.4 | Slides | AI deck generation + present mode + notes + PPTX export | KILL/TS | M-L | cdn-lib + model (**C7**) |
| 4.5 | Docs/Slides/Sheets | Server-free real-time co-edit (Yjs over existing WebRTC) | KILL | L | cdn-lib |
| 4.6 | Music | One-click AI Master (analyze→auto chain→-14 LUFS) | KILL | S | yes (we own all the parts) |
| 4.7 | Music | Per-track FX + automation lanes; real SF2 instruments | PRO | M | yes / cdn-lib |
| 4.8 | Image | AI denoise + super-resolution (Real-ESRGAN) | PRO | M | needs-model |
| 4.9 | Mockup | Product/device mockup library + perspective warp (the Placeit category) | KILL | XL | cdn-lib |
| 4.10 | Meme/GIF/Sticker | Video/GIF meme + animated stickers (512² messaging export) | KILL | L | cdn-lib (**C6**) |
| 4.11 | Video | AI background removal (person matting) | KILL | L | needs-model (**C8**) |
| 4.12 | PDF | PDF→Excel/PPT/images; merge as first-class verb; text-selection markup | TS/HIGH | M | yes |
| 4.13 | Collage | Drag-swap + freeform + text layer + 30 layouts | TS/PRO | M | yes (**C3**) |
| 4.14 | Resume | Templates + edu/skills editors + phrase bank + save | TS/PRO | M | yes |
| 4.15 | QR | Module/eye shapes + frames + gradient-true SVG + payloads | PRO | M | yes |

### Mobile UX waves (interleave; M6/M7/M8/M9 land with their studio's feature work)
- Wave 0: M2, M3, M4, M5 (shell). Wave 1+: M1. Then M6 (Video timeline) with Wave 3 video work; M7 (Image) with Wave 3 image work; M8 (Audio) with Wave 3 music work; M9 (PDF) with Wave 4 PDF work.

---

## 6. Killer differentiators (where we BEAT rivals, not match them)

These are only possible *because* of the constraints, not despite them. Lead marketing with these.

1. **"AI that never touches the cloud."** Chat-with-PDF, transcription, captions, translation, summarize/rewrite, stem separation, voice enhancement, background removal, inpaint — all on-device, free, private. Every rival charges for cloud AI and uploads your file. We do it offline. This single positioning beats Acrobat AI, Descript, CapCut, Canva Magic, Photoshop Firefly *on the privacy + cost + offline axis* even where our quality is a notch lower. **(C1, C7, C8)**

2. **On-device stem separation + true loudness mastering in a browser.** SCNet (22.6MB) + our already-shipped BS.1770 LUFS chain = BandLab-Splitter-class stems and streaming-loud masters, no upload, no account. Most web DAWs send audio to a server for this. **(3.4, 4.6)**

3. **In-place image/scan translation (already shipped).** OCR → translate → repaint editable boxes over the original layout, fully offline. A Google-Lens-class capability that almost no subtitle/translate rival has on the web. Lean into it; extend to multi-page + subtitle files. **(1.7)**

4. **Best browser PDF redaction (already shipped).** Destructive rasterize-burn-reOCR matches Acrobat's flatten-on-apply — genuinely best-in-class for a browser. Extend to whole-doc smart-redact + on-device NER for names/addresses. Market the "your sensitive doc never leaves the device" angle hard.

5. **Server-free real-time co-editing (Yjs over our existing WebRTC).** "Real-time co-edit with live cursors — no account, no server, fully on-device." Beats Google Docs/Canva on privacy + cost; reuses the Send/chat/call P2P stack. One implementation, every office studio. **(4.5)**

6. **One WYSIWYG video encoder powering everything.** Caption burn-in, animated-image export, video/GIF memes, animated stickers, GIF studio — all from one on-device frame→encoder pipeline. Rivals split these across separate cloud products; we ship them from one compositor. **(C6)**

**Honest non-goals (do NOT fake or chase):** generative video, true text-to-image gen-fill, instant voice cloning, voice changer, voice-preserving auto-dub, dynamic/trackable QR. These need GB-scale models or a server and violate the constraints. The honest substitutes (inpaint for removal, stock-voice TTS, translate-and-re-narrate, styled static QR) are in the waves above — ship those and say plainly we don't do the GPU-cloud version.

---

### Why this order

- **Wave 0** removes things that are *actively harmful or misleading* (ATS-failing PDFs, fake encryption) and the cheapest mobile reach.
- **Wave 1** is almost pure wiring of engines already in the repo and in budget — the best impact/effort ratio in the entire plan; ship it and several studios jump a tier overnight.
- **Wave 2** builds the shared multipliers (element model, transform gizmo, formula engine) so later waves are cheap.
- **Waves 3-4** are the model-backed marquee features and breadth, sequenced so dependencies (transform-keyframing before auto-reframe; ASR before text-based-edit; element model before PPTX/AI-decks) land first.
