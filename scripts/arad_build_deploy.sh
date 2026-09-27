#!/bin/bash
# Build (and optionally deploy) newxonvert on arad's WSL — the same steps as
# .github/workflows/deploy.yml, on the 3070 box instead of a GitHub runner.
#
#   bash scripts/arad_build_deploy.sh <branch>            # typecheck + build + package
#   DEPLOY=1 bash scripts/arad_build_deploy.sh <branch>   # ...then ship to Iceland
#
# Checkout: /root/newxonvert (WSL ext4, origin = GitHub). Builds exactly the
# pushed commit — a dirty tree is refused, so what ships is what GitHub has.
set -euo pipefail
BRANCH="${1:?usage: arad_build_deploy.sh <branch>}"
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

echo "== typecheck"
npx tsc --noEmit -p tsconfig.json

service postgresql start >/dev/null
KEY=$(openssl rand -base64 32)

# Build env = the deploy secrets + this build's worker key + the CI defaults.
cp .env.deploy.local .env
printf 'TOOL_WASM_KEY=%s\n' "$KEY" >> .env
grep -q '^DATABASE_URL=' .env || printf 'DATABASE_URL=postgresql://newxonvert:nx_pw_change_me@127.0.0.1:5432/newxonvert?schema=public\n' >> .env
grep -q '^NEXTAUTH_URL=' .env || printf 'NEXTAUTH_URL=https://xonvert.com\n' >> .env
grep -q '^NEXT_BASE_PATH=' .env || printf 'NEXT_BASE_PATH=\n' >> .env
grep -q '^NEXT_PUBLIC_BASE_PATH=' .env || printf 'NEXT_PUBLIC_BASE_PATH=\n' >> .env
trap 'rm -f /root/newxonvert/.env' EXIT

# The build DB must point at the throwaway local Postgres, whatever the secrets say.
DATABASE_URL='postgresql://newxonvert:nx_pw_change_me@127.0.0.1:5432/newxonvert?schema=public' \
  npx prisma db push --skip-generate
npx prisma generate

echo "== build"
rm -rf .next
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

if [ "${DEPLOY:-0}" = "1" ]; then
  echo "== deploy $COMMIT"
  TOOL_WASM_KEY="$KEY" ICELAND_KEY=/root/.ssh/id_oioxo_deploy \
    python3 -u scripts/deploy.py --from-artifact "$ART"
  echo "== live commit: $(curl -s https://xonvert.com/build-commit.txt)"
fi
echo "ARAD_BUILD_DONE $COMMIT"
