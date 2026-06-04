Roadmap written to `D:\appz\xonvert\newxonvert\STUDIO_ROADMAP.md`.

Key things I corrected against the matrices after verifying directly in the codebase:

- **The four "NOT FOUND" studios all exist and are built** — `tools/studio-invoice/ui.tsx` (327 LOC), `tools/studio-avatar` (283), `tools/studio-background` (135, already reuses the on-device `removeBackground` engine), `tools/studio-gif` (273). The matrix's read-set missed them. There are also un-audited ones: `office-studio`, `social-avatar`, `studio-redact`, `gen-invoice`, `video-to-gif`, `video-gif-to-video`.
- **`studio-invoice` has the same ATS-killer flaw as the resume tool** — it rasterizes its PDF via `html2canvas → jsPDF.addImage` (lines 93-105), producing an unparseable image PDF. The matrix never flagged this because it thought the studio didn't exist. I promoted it to Wave 0 alongside the resume fix.
- Confirmed the three "engine ships but unwired" claims that drive Wave 1: Video Studio doesn't import `videoToCaptions`/TTS, Voice Studio doesn't import `engines/transcribe`, and Subtitle Studio hardcodes `wordTimestamps: false` (line 318).
- Confirmed the phantom-transition claim: `compositor.ts` has `transition`/`transDur` fields (lines 48-49) but only per-clip `globalAlpha`, no cross-clip blend.
- Confirmed resume export rasterization (lines 63-69).

The doc has all six requested sections: scorecard (22 studios, %-to-killer vs web and pro), table-stakes misses grouped by studio, 10 cross-cutting multipliers (C1-C10), the prioritized mobile-UX fix list (shell first), a single ranked build order across all studios in 5 waves with tier/effort/feasibility/approach per item, and the killer on-device differentiators plus explicit honest non-goals.

The highest-leverage finding, stated plainly in the doc: **Wave 1 is almost pure wiring of on-device engines already in the repo and in budget** (ASR, captions, TTS, MT, segmentation) — the best impact/effort ratio in the plan, and it makes the "AI that never touches the cloud" positioning (differentiator #1) real across Video, Voice, Subtitle, Translate, PDF, and Thumbnail at near-zero new download.