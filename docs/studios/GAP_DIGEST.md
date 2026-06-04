# Studios — ranked gap digest (all studios)

| # | Studio | Gap | Impact | Effort | Feasible |
|---|---|---|---|---|---|
| 1 | Video Studio | Wire on-device auto-captions into the timeline (Whisper → auto TextClips) | critical | M | needs-model |
| 2 | Image Studio | Healing brush + clone stamp + dodge/burn retouch | critical | M | yes |
| 3 | PDF Studio | Chat-with-PDF / summarize / translate, fully on-device | critical | M | needs-model |
| 4 | audio-voice-studio | Wire the Whisper ASR we already ship into Voice Studio (transcript panel + word timestamps) | critical | M | yes |
| 5 | studio-sheets | Real formula engine via HyperFormula (IF/VLOOKUP/COUNTIF/dates/text, 390+ fns) | critical | M | with-cdn-lib |
| 6 | subtitle-studio | Word-level karaoke highlighting (the signature 2025 caption look) | critical | M | yes |
| 7 | studio-resume | Make resume PDF real selectable text + add ATS lint/score | critical | M | yes |
| 8 | studio-meme | Bundled meme template gallery + N draggable text boxes + font/color | critical | M | yes |
| 9 | Video Studio | Auto-reframe / smart resize one project to 9:16 / 1:1 / 16:9 | critical | L | needs-model |
| 10 | Image Studio | Content-aware / AI object removal (brush-mask inpainting) | critical | L | needs-model |
| 11 | PDF Studio | Edit existing PDF text (click-to-fix-a-line, font-matched) | critical | L | yes |
| 12 | Music Studio Pro | Replace the 8x16 grid with a real MIDI piano roll + variable-length clips | critical | L | yes |
| 13 | Music Studio Pro | On-device AI stem separation (vocals/drums/bass/other) — flagship killer | critical | L | needs-model |
| 14 | audio-voice-studio | On-device AI voice enhancement (denoise + de-reverb 'Studio Sound' button) | critical | L | needs-model |
| 15 | audio-voice-studio | Text-based editing: delete/move words in the transcript → splice the audio | critical | L | yes |
| 16 | studio-slides | Free-canvas element model (text boxes + images + shapes, drag/resize/z-order) | critical | L | yes |
| 17 | subtitle-studio | Burn-in / hard-sub video export (styled + animated captions baked onto video) | critical | L | yes |
| 18 | Video Studio | Make the PiP transform keyframable (motion graphics / Ken Burns / fly-ins) | high | S | yes |
| 19 | PDF Studio | Surface MERGE as a first-class verb + arbitrary page extract/delete-to-new-file | high | S | yes |
| 20 | Music Studio Pro | One-click AI Master (analyze mix -> auto EQ/comp/limiter -> -14 LUFS) | high | S | yes |
| 21 | audio-voice-studio | One-click filler-word + silence cleanup driven by the transcript | high | S | yes |
| 22 | audio-voice-studio | Wire the existing diarization into clip/segment speaker labels | high | S | yes |
| 23 | studio-background (NOT FOUND) | Ship a dedicated Background studio (remover + replacer) on the existing engine | high | S | yes |
| 24 | Video Studio | Render real cross-clip transitions in the WYSIWYG compositor | high | M | yes |
| 25 | Video Studio | Remove-silences / Smart-Cut (RMS gap detection → auto ripple) | high | M | yes |
| 26 | Video Studio | Chroma key (green-screen) clip effect | high | M | yes |
| 27 | Video Studio | AI voiceover from script + auto-dub, surfaced in the Studio | high | M | needs-model |
| 28 | Image Studio | Selection refine (feather/grow/contract/smooth) + boolean add/subtract + Select-Subject | high | M | yes |
| 29 | Image Studio | Layer groups/folders + clipping masks | high | M | yes |
| 30 | PDF Studio | Real password protection + open encrypted PDFs (AES) | high | M | with-cdn-lib |
| 31 | PDF Studio | PDF → Excel / PowerPoint / per-page images (export verbs) | high | M | yes |
| 32 | PDF Studio | Whole-document smart redact + search-and-redact + NER names/addresses | high | M | needs-model |
| 33 | Music Studio Pro | Real recorded instruments + drum kits via SoundFont (SF2) playback | high | M | with-cdn-lib |
| 34 | Music Studio Pro | Per-track insert effects + parameter automation lanes | high | M | yes |
| 35 | audio-voice-studio | Caption/subtitle export (SRT/VTT) + improve TTS voice count/quality | high | M | yes |
| 36 | studio-docs | Format-preserving DOCX export (HTML DOM -> OOXML runs) | high | M | yes |
| 37 | studio-diagram | Text-to-diagram + auto-layout via mermaid (and dagre/elkjs) | high | M | with-cdn-lib |
| 38 | studio-chart | Chart.js drop-in for chart types + interactivity + axis/labels | high | M | with-cdn-lib |
| 39 | studio-slides | Present mode + speaker notes + PPTX export | high | M | with-cdn-lib |
| 40 | studio-docs | On-device AI writing/diagram/deck assist (reuse the existing <=180MB model) | high | M | needs-model |
| 41 | subtitle-studio | Animated caption presets (pop-on, typewriter, bounce, glow, slide-up) | high | M | yes |
| 42 | translate-studio | Unify on-device subtitle/video translation across both studios | high | M | yes |
| 43 | subtitle-studio | Broadcast/web export formats: TTML/DFXP, SCC/CEA-608, SBV, plus min-gap/duration/line-length profiles (Netflix/EBU) | high | M | yes |
| 44 | subtitle-studio | Transcript-mode editing with click-to-seek and word sync | high | M | yes |
| 45 | studio-poster | Real font library + on-canvas resize/rotate handles + alignment guides | high | M | with-cdn-lib |
| 46 | studio-thumbnail | Wire existing background remover into a 'subject pops in front of text' layer | high | M | yes |
| 47 | studio-qr | Custom module + finder-eye shapes, decorative frames, gradient-true SVG, more payloads | high | M | yes |
| 48 | Video Studio | On-device AI background removal (person matting, no green screen) | high | L | needs-model |
| 49 | Image Studio | PSD import/export | high | L | with-cdn-lib |
| 50 | Image Studio | WebGL filter gallery + Liquify | high | L | with-cdn-lib |
| 51 | Image Studio | Free Transform handles (scale/rotate/skew/distort/perspective) | high | L | yes |
| 52 | PDF Studio | Real interactive form fill + form creation (AcroForm) | high | L | yes |
| 53 | Music Studio Pro | Mic + file recording onto real audio tracks (then comping) | high | L | yes |
| 54 | studio-docs | Server-free real-time co-editing across docs/slides/sheets (Yjs over WebRTC) | high | L | with-cdn-lib |
| 55 | Video Studio | Transcript / text-based editing | high | XL | needs-model |
| 56 | studio-mockup (screenshot/device-frame) | Real product/device mockup library with perspective warp (the Placeit category) | high | XL | with-cdn-lib |
| 57 | Image Studio | Gradient tool + histogram/channels panel + EXIF auto-orient | medium | S | yes |
| 58 | Music Studio Pro | Live meters: spectrum analyzer + LUFS/peak/RMS on the master | medium | S | yes |
| 59 | translate-studio | Glossary / do-not-translate terms + bilingual output | medium | S | yes |
| 60 | subtitle-studio | Auto-emoji insertion from caption context | medium | S | yes |
| 61 | Video Studio | Sticker / shape / emoji library + built-in screen & webcam recorder | medium | M | yes |
| 62 | Image Studio | AI denoise + super-resolution upscale | medium | M | needs-model |
| 63 | Image Studio | Export animation to GIF/WebP/MP4 | medium | M | yes |
| 64 | PDF Studio | Text-selection markup (highlight/underline/strikethrough on real words) + point-anchored comments | medium | M | yes |
| 65 | PDF Studio | Compare two PDFs (text + visual diff with change list) | medium | M | with-cdn-lib |
| 66 | PDF Studio | Headers/footers with tokens + Bates numbering + crop + metadata editor (pro polish bundle) | medium | M | yes |
| 67 | Music Studio Pro | Pitch correction / Auto-Tune to scale | medium | M | yes |
| 68 | audio-voice-studio | Persist audio buffers in saved projects (fix re-import-required save) | medium | M | yes |
| 69 | studio-sheets | Conditional formatting + sort/filter + data validation | medium | M | yes |
| 70 | studio-docs | Universal undo/redo across all five studios | medium | M | yes |
| 71 | subtitle-studio | OCR image-based / hardcoded subtitles into editable cues | medium | M | with-cdn-lib |
| 72 | studio-collage | Drag-to-swap photos, freeform layout mode, text/sticker layer, more layouts + export presets | medium | M | yes |
| 73 | studio-resume | Multiple resume templates + UI editors for education/skills + content phrase bank + save/load | medium | M | yes |
| 74 | studio-diagram | Infinite pan/zoom canvas + sticky notes + freehand (Miro/FigJam parity) | medium | L | yes |
| 75 | studio-sticker | 512x512 messaging export, sticker pack/sheet builder, animated WebP stickers, manual edge brush | medium | L | with-cdn-lib |
