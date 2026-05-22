# Xonvert SEO Strategy 2026 — Climbing Out of the Spam Hole

> **Context:** Google de-indexed (or heavily demoted) xonvert.com after ~1 year, treating it as spam. The 400+ tool URLs and largely templated content are the most likely root cause. This doc is the recovery plan, written so we don't fall into the same trap with newxonvert.

## Why we got penalised — honest diagnosis

Modern Google (post Helpful Content Update, March 2024 core updates) penalises sites where:

1. **Templated thin content at scale** — 400 tool pages with the same scaffold, only the headline changing. Algorithmically detectable as "mass-produced for ranking, not for users."
2. **Pairwise duplication** — `/convert/png-to-jpg` and `/convert/jpg-to-png` reading identical except two strings swapped.
3. **No author / E-E-A-T signals** — no real bylines, no about page with names, no original content beyond tool UI.
4. **Indexable stubs** — coming-soon pages, empty result pages, error pages all in the sitemap.
5. **Keyword stuffing in titles** — "Free Online PNG to JPG Converter — Best Free Online PNG to JPG Converter 2024".
6. **No backlinks from sources Google trusts** — every link comes from low-DA aggregators.
7. **Auto-generated FAQ blocks** that don't answer the actual question.

Once Google labels the domain "spam-pattern," everything new on it gets discounted. That's the hell we're in.

## The recovery path

### Decision: launch newxonvert at a new URL, then bridge

Two options, ordered by my recommendation:

**A. Launch at `new.xonvert.com` (subdomain).** Google treats subdomains as related-but-separate. Lets us rebuild reputation while keeping brand recall. After 3–6 months of clean indexing on `new.`, we 301 `xonvert.com` → `new.xonvert.com` and merge. **(Recommended.)**

**B. Rebuild at xonvert.com root, mass-noindex everything old first.** Faster timeline but risks the new content getting tarred with the old domain reputation. Only choose if you can wait 6+ months before reindexing kicks in.

For testing, the subpath `194.247.182.248/xonvert/` is fine — internal-only, no SEO impact.

### Pillar 1 — Quality, not quantity

- **Cut tools that are stubs.** If the 173-tool plan from earlier had stubs, drop them. 80 deeply-built tools > 400 thin ones.
- **Differentiate every page.** Every tool's page needs at least 250 words of genuinely useful content that's NOT auto-generated. Examples, edge cases, why-you-might-use-this, who-shouldn't-use-this. Write it once per tool, not by template.
- **Real "How-to" sections.** Step-by-step. With actual screenshots from the new UI. No lorem-ipsum, no AI-spew without editing.
- **Honest empty states.** If a tool has known limitations ("max 50MB", "AVIF needs Chrome 100+"), say so on the page.

### Pillar 2 — Architecture that doesn't look mass-produced

- **Conversion pages: stop the pairwise duplication trick.** Instead of 200 `/convert/X-to-Y` doorway pages, make **one strong** `/convert/png` page covering "PNG to everything," with anchors per target. Same for other source formats. ~20 pages instead of 200, each genuinely useful.
- **noindex thin pages.** Login, sign-in, dashboard, anything with <300 words of unique content, anything broken. Use Next.js `metadata.robots`.
- **Single canonical URL per concept.** No `/png-to-jpg` AND `/jpg-from-png` AND `/convert/png/to/jpg`.
- **Clean URL structure.** `/tools/[slug]` and `/convert/[source]` — that's it. No tracking IDs, no slugs with `?ref=...` in sitemap.
- **Static rendering.** newxonvert tool pages are prerendered (`generateStaticParams`). Lighthouse 100, INP <100ms, no CWV failures.

### Pillar 3 — E-E-A-T signals

- **Real `/about`** with founder name, photo, country, contact. Not generic stock-photo bios.
- **Real `/privacy` + `/terms`** that match the product's actual behaviour. With newxonvert's browser-first promise, the privacy story is a strength — lean into it.
- **Original blog at `/blog`.** 1 post/week minimum for 6 months. Topics: explainers (HEIC vs JPG, lossless vs lossy, what is OKLCH color, etc.), case studies, comparisons. Each post 800+ words, hand-written. This is the long lever — it's the channel that pulls the rest of the domain up.
- **Open-source the engine code.** Publish `tools/image-blur/engine.ts` and friends on GitHub under a permissive license. Earns real backlinks from devs.
- **List on real registries.** Awesome-* repos, ProductHunt, Hacker News show-HN, Indie Hackers. One quality launch beats 100 SEO listicle citations.

### Pillar 4 — Schema markup

Every tool page ships these JSON-LD blocks (in `app/tools/[slug]/page.tsx`):

```jsonc
// SoftwareApplication for the tool itself
{ "@type": "WebApplication", "name": "...", "applicationCategory": "...",
  "browserRequirements": "Requires HTML5", "offers": { "@type": "Offer", "price": "0" }}

// HowTo for the workflow
{ "@type": "HowTo", "name": "How to blur an image in your browser",
  "step": [ { "@type": "HowToStep", "text": "..." }, ... ] }

// FAQPage if there are real FAQs (do not stuff)
{ "@type": "FAQPage", "mainEntity": [ ... ] }

// BreadcrumbList tying tool → category → home
```

A small `lib/seo/jsonld.ts` helper renders these from the manifest + per-tool MDX content.

### Pillar 5 — Internal linking that makes sense

- Every tool page links to **3 related tools** by name in body text — not just a sidebar.
- Every category page is a real index, not just a list — short paragraph per category, real internal links to the strong tools first.
- The home tile grid IS the primary internal-link map. Google can follow it.

### Pillar 6 — Backlink building (the hard part)

- **GitHub.** Open-source the engines. README links back to the live tool. Stars + forks = backlinks.
- **DEV.to / Medium technical posts** announcing each engine ("How we built browser-side background removal with WebGPU in 8KB").
- **Reddit (r/webdev, r/learnprogramming, r/SideProject)** — show-don't-spam.
- **Tool directories** that actually matter: AlternativeTo, ToolsAdvisor, IndieToolHunt — manually written submissions, not bulk-listed.
- **Domain trust signals**: Set up `security.txt`, `humans.txt`, real DMARC, SSL HSTS preload. Google notices.

### Pillar 7 — Don't repeat the past mistakes

- **No auto-generated FAQ.** Either write them by hand or omit.
- **No “best free X” keyword-stuffed titles.** Use natural titles: "Blur an image in your browser — Xonvert."
- **No hidden text, no cloaking, no doorway pages.**
- **Don't index every conversion permutation.** Just the strong source-pages plus high-traffic specific pairs (max 30, hand-picked from search-volume data).
- **No AI-spun blog posts.** Hand-write or hire one writer.

## Concrete 90-day plan

### Days 1–14 — Foundation
- Pick recovery URL strategy (A vs B above) — decision needed week 1.
- Build `lib/seo/jsonld.ts` helper and wire into the tool page template.
- Write `metadata.robots` strategy: only canonical, fully-built tool pages get `index: true`. Defaults to `noindex`.
- Set up Google Search Console + Bing Webmaster Tools on new property.
- Write `/about`, `/privacy`, `/terms`, `/security.txt`, `/humans.txt`, real DMARC.
- Submit `sitemap.xml` containing **only the polished pages**, never the whole tree.

### Days 15–45 — Content
- Hand-write the 250-word body section for each of the top 30 tools (the rest get default boilerplate that is marked `noindex`).
- Publish first 6 blog posts (1.5 per week). Each is a real explainer tied to a tool: "When to use AVIF vs WebP", "The trick browsers use for fast image blur", etc.
- Open-source 3 engines on GitHub with real READMEs.

### Days 46–90 — Authority
- Show-HN launch (one shot, after the site is polished).
- ProductHunt launch.
- 10 outreach emails/week to tech-blog writers offering one-off "how we built X" guest posts.
- Submit re-consideration request to Google (only if penalty was manual; if algorithmic, just keep shipping).

### Months 4–6 — Reindex sweep
- Monitor Search Console. Once newxonvert pages consistently rank for low-comp queries, plan the 301 from xonvert.com.
- Before 301: ensure every old URL has a mapped new URL (use `app/sitemap.ts` to build the redirect map) and that every redirect is 301 (not 302).
- Submit a fresh sitemap on the old domain pointing to itself, then a re-crawl request after 301 goes live.

## Telemetry to watch (weekly)

| Metric | Source | Target by day 90 |
|---|---|---|
| Indexed pages (clean) | GSC Coverage | 60+ |
| Impressions | GSC Performance | 5k/week |
| Avg position | GSC Performance | <30 |
| CWV (75th pct) | GSC Page Experience | All "good" |
| Backlinks from DA >40 | Ahrefs free / GSC Links | 15+ |
| Branded queries | GSC Performance | Trend up |

## Engineering hooks newxonvert needs (work goes into Phase 1 templates)

- `lib/seo/jsonld.ts` — JSON-LD helpers (SoftwareApplication, HowTo, FAQPage, BreadcrumbList)
- `lib/seo/metadata.ts` — `buildToolMetadata(manifest)` returns Next `Metadata` with canonical, OG, Twitter, robots-by-completeness
- `tools/<id>/content.mdx` — optional per-tool long-form content. If present, page is indexable; if absent, page is `noindex`.
- `app/sitemap.ts` — pulls from registry, filters to `seo.indexable === true`
- `app/robots.ts` — disallows `/api`, `/auth`, `/dashboard`, anything noindex
- `lib/seo/canonical.ts` — single helper to build the canonical URL (with basePath awareness)
- `app/(seo)/security.txt`, `humans.txt`, `.well-known/` — static files

The newxonvert tile-driven design helps SEO: deep internal linking via tiles, fast static renders, clean URLs. We just need the content depth on top.

## What I'd decide first

The biggest single decision is **subdomain vs root recovery** (A vs B above). Everything else is mechanics. Pick A unless you have a strong reason — it gives us a clean slate.
