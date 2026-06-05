# Fast obfuscated deploys (CI build → ship artifact)

**Problem:** every deploy ran a cold, full `OBFUSCATE=1 next build` on the
Iceland CPU box (~90 min budget, `t=5400`). Obfuscation is slow but
deterministic and cacheable — the cost was being paid in full, every time, on a
slow machine.

**Fix:** move the build to a fast GitHub Linux runner with Next's build cache
warm (so obfuscation only re-runs on changed files), then ship the prebuilt
`.next` to the server. The server stops compiling — deploys become a few
minutes. **Obfuscation stays fully ON.**

`deploy.py` remains the single source of truth for the ship steps (env, prisma,
zero-downtime `.next` swap, PM2, Caddy, smoke test). CI just calls it in a new
`--from-artifact` mode that uploads the prebuilt `.next` instead of building.

## What runs where

| Step | Before (all on server) | After |
|---|---|---|
| npm ci | server | runner (server only if lockfile changed) |
| prebuild (encrypt workers) | server | runner |
| OBFUSCATE=1 next build | server (~90 min) | runner (incremental, cached) |
| env / prisma / swap / PM2 / Caddy / smoke | server | server (unchanged) |

## One-time setup

### 1. GitHub repo secrets (Settings → Secrets and variables → Actions)

- `ICELAND_HOST` — `194.247.182.248`
- `ICELAND_USER` — `root`
- `ICELAND_PASSWORD` — the server password (currently hardcoded in deploy.py;
  moving it to a secret also removes it from source).
- `NEWXONVERT_DEPLOY_ENV` — the **entire body** of `newxonvert/.env.deploy.local`
  (Stripe/NextAuth/Google/DB keys). CI writes it to `.env.deploy.local` before
  calling deploy.py. **Do not** include `TOOL_WASM_KEY` — CI mints a fresh one
  per build and appends it (same as deploy.py today).

Recommended: also set the `production` **Environment** (Settings → Environments)
with a required reviewer, so a human approves the `ship` job before it touches
the live site.

### 2. Apply the `deploy.py --from-artifact` patch

See `docs/_deploy_from_artifact.patch.md` for the exact change. In short:
- Read `HOST/USER/PASSWORD` from env vars when set (falls back to the hardcoded
  values for manual local runs).
- Add `--from-artifact <tgz>`: skip `rotate_brain_key`/server build; instead
  upload + extract the prebuilt `.next` + `public` into `.next-build`, then run
  the existing swap/PM2/Caddy/smoke path. Skip `npm ci` unless
  `package-lock.json` changed.

## Result

- **Cold first CI build:** ~obfuscation cost once (cache empty).
- **Every deploy after:** only changed files re-obfuscate → a few minutes total,
  full obfuscation intact, zero server compile, zero-downtime swap unchanged.

## Manual deploy still works

`python scripts/deploy.py` (no flag) keeps doing the full server-side build —
unchanged — for when you want to deploy straight from your machine without CI.
