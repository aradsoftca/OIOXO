#!/bin/bash
# Build (and optionally deploy) newxonvert on arad's WSL — the same steps as
# .github/workflows/deploy.yml, on the 3070 box instead of a GitHub runner.
#
#   bash scripts/arad_build_deploy.sh [branch]            # build (type-checked by next) + package
#   DEPLOY=1 bash scripts/arad_build_deploy.sh [branch]   # ...then ship to Iceland
#
# Checkout: /root/newxonvert (WSL ext4, origin = GitHub). Builds exactly the
# pushed commit — a dirty tree is refused, so what ships is what GitHub has.
set -euo pipefail
# arad's WSL has no working IPv6 route; next/font's Google Fonts fetch times
# out trying it first ("Failed to fetch `Geist`") unless IPv4 is preferred.
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"
# xonvert-main = what xonvert.com runs (the repo default branch belongs to oioxo).
BRANCH="${1:-xonvert-main}"
cd /root/newxonvert

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ABORT: tracked changes in /root/newxonvert — refusing to build a tree GitHub doesn't have"; exit 1
fi
git fetch -q origin
git checkout -q "$BRANCH" 2>/dev/null || git checkout -q -b "$BRANCH" "origin/$BRANCH"
git reset -q --hard "origin/$BRANCH"
COMMIT=$(git rev-parse --short HEAD)
echo "== building $BRANCH @ $COMMIT"

if ! cmp -s package-lock.json .built-lock 2>/dev/null; then
  npm ci --include=dev --no-audit --no-fund
  cp package-lock.json .built-lock
fi

# No separate tsc: `next build` already type-checks ("Checking validity of
# types") and fails the build on errors — running both cost ~1-2 min per deploy.

service postgresql start >/dev/null
KEY=$(openssl rand -base64 32)
# Fresh brain-WASM key + ciphertext for this build (deploy.py's rotate_brain_key).
BRAIN_KEY=$(node lib/ai/wasm/encrypt.mjs --rotate | sed -n 's/^ROTATED_BRAIN_WASM_KEY=//p')
[ -n "$BRAIN_KEY" ] || { echo "brain WASM rotate produced no key"; exit 1; }

# Build env = the deploy secrets + this build's worker key + the CI defaults.
cp .env.deploy.local .env
printf 'TOOL_WASM_KEY=%s\n' "$KEY" >> .env
grep -q '^DATABASE_URL=' .env || printf 'DATABASE_URL=postgresql://newxonvert:nx_pw_change_me@127.0.0.1:5432/newxonvert?schema=public\n' >> .env
grep -q '^NEXTAUTH_URL=' .env || printf 'NEXTAUTH_URL=https://xonvert.com\n' >> .env
grep -q '^NEXT_BASE_PATH=' .env || printf 'NEXT_BASE_PATH=\n' >> .env
grep -q '^NEXT_PUBLIC_BASE_PATH=' .env || printf 'NEXT_PUBLIC_BASE_PATH=\n' >> .env
printf 'BRAIN_WASM_KEY=%s\n' "$BRAIN_KEY" >> .env
# Leave the checkout clean for the next run (rotate rewrites a tracked file).
trap 'rm -f /root/newxonvert/.env; git -C /root/newxonvert checkout -q -- lib/ai/wasm/wasm-bytes.ts' EXIT

# The build DB must point at the throwaway local Postgres, whatever the secrets say.
DATABASE_URL='postgresql://newxonvert:nx_pw_change_me@127.0.0.1:5432/newxonvert?schema=public' \
  npx prisma db push --skip-generate
npx prisma generate

echo "== build"
# Keep .next/cache: webpack reuses it, so only changed modules recompile.
# (rm -rf .next threw it away every deploy.) Clear the build OUTPUT only.
mkdir -p .next && find .next -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} +
OBFUSCATE=1 NEXT_BASE_PATH='' TOOL_WASM_KEY="$KEY" \
  DATABASE_URL='postgresql://newxonvert:nx_pw_change_me@127.0.0.1:5432/newxonvert?schema=public' \
  npm run build
for f in BUILD_ID required-server-files.json routes-manifest.json prerender-manifest.json; do
  [ -f ".next/$f" ] || { echo "MISSING .next/$f — build is not bootable"; exit 1; }
done
rm -f .env

echo "== package"
ART=/root/nx-build-$COMMIT.tgz
printf '%s' "$KEY" > .tool_wasm_key
printf '%s' "$COMMIT" > public/build-commit.txt
# Same exclusions deploy.py applies: model weights are not self-hosted.
tar -czf "$ART" --exclude='*.gguf' --exclude='*.onnx' --exclude='*.bin' \
  --exclude='public/models/oioxo-conductor' --exclude='.next/cache' \
  .next public prisma .tool_wasm_key
rm -f .tool_wasm_key public/build-commit.txt
ls -la "$ART"
# Keep the last 3 artifacts (139 MB each) so /root doesn't fill up.
ls -t /root/nx-build-*.tgz 2>/dev/null | tail -n +4 | xargs -r rm -f

echo "== smoke"
bash scripts/arad_smoke.sh

if [ "${DEPLOY:-0}" = "1" ]; then
  echo "== deploy $COMMIT"
  TOOL_WASM_KEY="$KEY" BRAIN_WASM_KEY="$BRAIN_KEY" ICELAND_KEY=/root/.ssh/id_oioxo_deploy \
    python3 -u scripts/deploy.py --from-artifact "$ART"
  echo "== live commit: $(curl -s https://xonvert.com/build-commit.txt)"
  # Real conversions on the LIVE site in Chromium. A Node engine harness passed
  # 25/25 while every live CAD/3D/image-worker conversion failed — only this sees it.
  echo "== live e2e"
  [ -s "${SAMPLES_DIR:-/root/cadtest/samples}/box.fbx" ] || bash scripts/live_e2e_samples.sh >/dev/null
  if ! node scripts/live_e2e.mjs https://xonvert.com; then
    echo "LIVE_E2E_FAIL — the deploy is live but conversions are broken; fix or roll back (.next.prev on the server)"
    exit 1
  fi
  # Only a deploy that passed its live e2e is announced to search engines.
  node scripts/indexnow.mjs https://xonvert.com || true
fi
echo "ARAD_BUILD_DONE $COMMIT"
