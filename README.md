# newxonvert

Xonvert 2026 — browser-first file tools and conversion platform.

This folder lives alongside the legacy `xonvert/` app while we migrate.
The plan, design system, and decisions are documented in
[../upgrade/2026-master-plan.md](../upgrade/2026-master-plan.md) (if present)
and in Claude's memory under `~/.claude/projects/d--appz-xonvert/memory/`.

## What ships in Phase 0

- **Next.js 15 + React 19 + Tailwind v4** with CSS-first design tokens
- **XonTiles design language** — Liquid Metro on near-black, muted OKLCH palette
- Core primitives: `Tile`, `TileGrid`, `ToolTile`, `CategoryTile`, `HeroDropTile`, `AppShell`, `CommandPalette`, `DragMagicProvider`
- **Reference tool: Image Blur (`/tools/image-blur`)**
  - OffscreenCanvas worker, debounced live render, before/after compare slider
  - Saves a thumb to localStorage → tile on the homepage becomes "alive"
- Routes: `/`, `/tools`, `/tools/[slug]`, `/convert`, `/auth/sign-in`, 404
- Auth + DB + Stripe stubs (NextAuth credentials, Prisma, Stripe checkout + webhook)
- GPU bridge stub at `/api/gpu/enqueue` ready for Phase 7

## Run it

```bash
cd newxonvert
npm install
cp .env.example .env.local
# fill DATABASE_URL and run prisma db push
npx prisma db push
npm run dev
# open http://localhost:3001
```

Notes:
- The dev port is **3001** to avoid colliding with the legacy app on 3000.
- COOP/COEP headers are on in `next.config.mjs` so we can drop in
  ffmpeg.wasm + Transformers.js multi-thread in later phases.

## Folder map

```
newxonvert/
├─ app/
│  ├─ layout.tsx              root shell + theme
│  ├─ page.tsx                XonTiles homepage
│  ├─ tools/page.tsx          tile index
│  ├─ tools/[slug]/page.tsx   dynamic loader → tools/<id>/ui.tsx
│  ├─ convert/page.tsx        convert hub
│  ├─ auth/sign-in/page.tsx   credentials sign-in
│  └─ api/
│     ├─ auth/[...nextauth]/  NextAuth
│     ├─ stripe/checkout/     Stripe Checkout (Pro)
│     ├─ stripe/webhook/      Stripe webhook
│     └─ gpu/enqueue/         Iceland GPU bridge (stub)
├─ components/
│  ├─ tiles/                  Tile primitives
│  ├─ layout/                 AppShell, CommandPalette, DragMagic
│  └─ tool/                   ToolFrame (shared tool page chrome)
├─ tools/
│  └─ image-blur/             manifest + worker + ui
├─ lib/
│  ├─ cn.ts                   tailwind-merge helper
│  ├─ auth.ts, db.ts, stripe.ts
│  ├─ registry/               tool registry + types + CATEGORIES
│  └─ storage/                recent tile thumbs + pinned tools (localStorage)
├─ prisma/schema.prisma       minimal NextAuth + Pro tier
└─ public/                    static assets
```

## Adding a new tool

1. `mkdir tools/<id>` with `manifest.ts`, optional `worker.ts`, and `ui.tsx`
2. Import the manifest in `lib/registry/index.ts` and add to `TOOLS`
3. Register the UI loader in `app/tools/[slug]/page.tsx` `ToolModules`
4. (Optional) Pin to home with `pinDefault: true` in the manifest

That's the migration unit — Phases 1–5 will codegen these for the existing 250+
tools, while Phases 6–7 stand up the Convert hub assistant and the Iceland GPU
queue.

## Design tokens

Everything is in `app/globals.css` under `@theme` — change a single OKLCH
variable and every tile picks it up.

## Compute tiers

| Tier      | Runs on                | Examples                                          |
|-----------|------------------------|---------------------------------------------------|
| instant   | main thread            | text, calc, formatters                            |
| local     | Web Worker + WASM      | image, audio, video, PDF                          |
| webgpu    | OffscreenCanvas/WebGPU | upscale 2x, filters, small ML models              |
| pro       | Iceland 1080Ti queue   | Whisper-large, RMBG-2 HD, Demucs, 4x upscale      |

`pro` is always opt-in. Browser fallback is always available.
