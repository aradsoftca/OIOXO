#!/bin/bash
# Nightly full-site breakage sweep on arad (Windows task "xonvert-sweep", 04:00,
# after the 02:00 deploy). Signed in as the Pro QA account; writes a dated JSON
# report plus a one-line summary, and keeps 14 days. Read-only against the site.
#
# Install once (WSL):  cp scripts/arad_nightly_sweep.sh /root/nightly_sweep.sh
# Windows:  schtasks /create /tn xonvert-sweep /tr "wsl.exe -d Ubuntu -u root -- bash /root/nightly_sweep.sh" /sc daily /st 04:00 /f
set -uo pipefail
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"
OUT=/root/cadtest/nightly
mkdir -p "$OUT"
D=$(date +%F)
# Read the scripts from GitHub's head WITHOUT touching the deploy checkout's tree.
cd /root/newxonvert && git fetch -q origin
mkdir -p /root/cadtest/sweepbin
git show origin/xonvert-main:scripts/live_sweep.mjs > /root/cadtest/sweepbin/live_sweep.mjs
git show origin/xonvert-main:scripts/live_e2e_samples.sh > /root/cadtest/sweepbin/live_e2e_samples.sh
ln -sfn /root/newxonvert/node_modules /root/cadtest/sweepbin/node_modules
bash /root/cadtest/sweepbin/live_e2e_samples.sh > "$OUT/$D.samples.log" 2>&1
REPO=/root/newxonvert OUT_JSON="$OUT/$D.json" \
  node /root/cadtest/sweepbin/live_sweep.mjs https://xonvert.com > "$OUT/$D.log" 2>&1
echo "$(date +%F_%T) live=$(curl -s https://xonvert.com/build-commit.txt) \
ok=$(grep -c UPLOAD-OK "$OUT/$D.log") fail=$(grep -cE 'UPLOAD-FAIL|LOAD-ERROR|NO-UI' "$OUT/$D.log")" > "$OUT/$D.summary"
cat "$OUT/$D.summary"
find "$OUT" -type f -mtime +14 -delete
