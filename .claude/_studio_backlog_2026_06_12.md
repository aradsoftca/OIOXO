# Studios — prioritized backlog (post rival-audit, 2026-06-12)

Live Playwright audit of all 7 flagship studios vs their two named rivals, on `:3001` dev.
This is the ranked "why we lose / what to do" list. **DONE** items were fixed and committed
this session (branch `fix/studios-brutal-audit-2026-06-11`).

## Scoreboard (where each studio stands vs its rivals)

| Studio | Rivals | Standing | Headline gap |
|---|---|---|---|
| **PDF** | Sejda, Acrobat | **WINS** | True in-place edit + true redaction both work on-device |
| **Music** | GarageBand, BandLab | **At parity** | Sound-library depth (8 voices vs 60+ kits) |
| **Image** | Photopea, Canva | Strong | Remove-BG is person-only; export dialog thin |
| **Office (Sheets)** | Google Sheets, Excel | Computes right | Collaboration UX (room-code vs share-link/presence) |
| **Video** | CapCut, Clipchamp | Engine good | Auto-caption was broken (FIXED runtime); transport/auto-cut |
| **Voice** | Descript, Adobe Podcast | DAW good | Text-based editing was broken (FIXED runtime); no per-clip waveform |
| **Subtitle** | CapCut, Aegisub | Best-designed | Auto-transcribe was broken (FIXED runtime) |

## DONE this session

1. **[DONE] Transcription runtime (Video + Voice + Subtitle).** One bug killed all three
   (transformers.js v2 ONNX `ort-wasm-simd-threaded.jsep.mjs` 404). Switched `engines/transcribe`
   to transformers.js v3. Runtime loads clean. *Commit 64fdf85.*
   → **Open:** confirm cues actually render in a REAL browser (headless can't finish inference).
2. **[DONE] PDF brand footer** — dialog string `xonvert.com` → `BRAND_DOMAIN`. *Commit 8111032.*
3. **[DONE] Office "3 tracks" copy bug** → "3 sheets" (lever `unit:'sheets'`). *Commit 8111032.*
4. **[DONE] Image free-tier caps** — layers 6→12, export 2048→4096px. *Commit 8111032.*
5. **[DONE] Shortcut overlay** — "?" panel now lists shortcuts (was empty due to provider tree
   position). NOTE: Image "no keyboard / no Ctrl+T" was a FALSE ALARM — shortcuts always worked;
   only discovery was broken. *Commit 8111032.*

## OPEN — ranked by leverage

### P1 — verify + highest impact
- **Confirm transcription end-to-end in a real browser.** 1-minute check; until done, the
  runtime fix is "loads" not "works." Open `/tools/subtitle-studio`, drop a talking-head clip,
  Auto-transcribe, watch cues land. Then spot-check Video auto-caption + Voice transcribe.

### P2 — close the rival-defining gaps
- **Image: general-matting Remove-BG.** Today it's MediaPipe *selfie/person* segmentation — on a
  product/object photo it does nothing. Canva/Photoshop use general matting. Swap to a
  BiRefNet/RMBG-class ONNX model (on-device, CDN-loaded) → real one-click cutout on any subject.
- **Office: share-link collaboration with presence.** "Share" is a room-code `prompt()`. Sheets
  wins on effortless share-link + cursors + permissions + comments. A real `/api/collab`-backed
  link with presence is the single biggest Sheets-parity move. (collab relay already exists.)
- **Video: transport reliability + Auto-Cut.** Wire ruler-click-to-seek, J/K/L, arrow frame-step
  (clicking a clip currently fights the playhead). Then add beat-sync/auto-cut — CapCut *Web*
  lacks Auto-Cut, so shipping it is a leapfrog.

### P3 — depth / polish
- **Music: previewable kit/loop library.** Only clear gap vs BandLab; everything else is at parity.
  Add a browsable, click-to-preview kit + loop gallery (sound depth, not engine work).
- **Image: richer export dialog.** Add quality slider + live file-size estimate + scale/resize +
  before/after (currently a bare format toggle). Table-stakes vs Photopea.
- **Voice: per-clip waveform rendering** on the timeline (imported clips show as flat blocks).
- **PDF: confirm Smart-Redact auto-detect actually fires** (manual redaction works; the
  auto-find-SSN/email path showed no result in the audit) and raise the 50-page free cap.
- **Subtitle: verify the Aegisub-precision loop** (q/w/g commit-advance, word-level retiming)
  end-to-end once transcription produces cues.

### Cross-cutting
- **Brand audit:** other hard-coded `xonvert.com` strings exist outside PDF (watermark/email/
  stream-overlay already use BRAND_DOMAIN; sweep the rest for display strings).
- **Dev stability:** `:3001` OOM/HMR-crashes during long sessions — restart with 8GB heap.
