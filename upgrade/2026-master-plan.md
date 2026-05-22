# Xonvert 2026 — Master Plan

Snapshot of the agreed direction. Source of truth lives in conversation +
Claude memory; this file makes it easy to read in repo.

## Two pillars
1. **Convert** — universal file conversion at `/convert` and SEO landing pages `/convert/[from]/[to]`
2. **Tools** — editors/generators/calculators at `/tools/[slug]`, registry-driven

## Browser-first compute strategy

| Tier      | Where                  | Examples                                          |
|-----------|------------------------|---------------------------------------------------|
| instant   | main thread            | text, calc, formatters                            |
| local     | Web Worker + WASM      | image, audio, video, PDF                          |
| webgpu    | OffscreenCanvas/WebGPU | 2x upscale, real-time filters, small ML           |
| pro       | Iceland 1080Ti queue   | Whisper-large, RMBG-2 HD, Demucs, 4x upscale      |

Default = browser. Pro is always opt-in with a clear toggle.

## Engines we'll wire in (by phase)

| Phase | Domain  | Engine                                                                |
|-------|---------|-----------------------------------------------------------------------|
| 1     | Text/Dev/Calc | pure JS                                                          |
| 2     | Image   | OffscreenCanvas + WebGPU + @jsquash/* codecs + ImageMagick WASM + @imgly/background-removal |
| 3     | PDF     | pdf-lib + pdf.js + mupdf.wasm + Tesseract.js                          |
| 4     | Audio   | Web Audio + ffmpeg.wasm (SAB threaded) + RNNoise + Transformers.js Whisper |
| 5     | Video   | WebCodecs primary + ffmpeg.wasm fallback                              |
| 6     | Convert | universal pipeline + intent classifier (regex/embedding, no LLM)      |
| 7     | Pro     | Iceland GPU queue, Cloudflare Worker bridge, R2 storage               |

## Design — XonTiles (Liquid Metro 2026)

- Bold Metro grid structure, muted OKLCH palette, near-black canvas
- 1x1, 2x1, 2x2, 4x2 tile sizes
- Live tiles show user's recent output per tool
- View Transitions for tile-zoom navigation
- Drop-magic: dragging a file dims non-accepting tiles
- Cmd+K palette across all tools
- Pin/reorder personal Start screen via localStorage

## Iceland GPU constraints
- Shared 1080Ti, **2GB VRAM peak budget**
- 1–2 concurrent jobs total
- Browser fallback when busy or down
- Inputs deleted immediately, outputs auto-deleted in 1 hour

## Migration roadmap

| Phase | Scope                                                  |
|-------|--------------------------------------------------------|
| 0     | Scaffold + reference tool — **DONE**                   |
| 1     | Text + Dev + Calc + Converters + Generators (~180)     |
| 2     | Image (49)                                             |
| 3     | PDF (~14)                                              |
| 4     | Audio (34)                                             |
| 5     | Video (28)                                             |
| 6     | Convert hub + intent assistant                         |
| 7     | GPU server stand-up + Pro toggles                      |
| 8     | Redirects, sunset old xonvert, decommission French CPU |

## Out of scope (browser cannot do well)
- Real ICMP ping / TCP port scan — drop or replace with educational pages
- Server-side virus scan
- Email SMTP probing
- 500-page PDF OCR in <60s without GPU
