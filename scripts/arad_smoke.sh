#!/bin/bash
# Boot the freshly built .next on a spare port and assert the xonvert
# survival fixes against real HTTP responses. Any failure blocks the deploy.
set -uo pipefail
cd /root/newxonvert
PORT=3099
B="http://127.0.0.1:$PORT"
DATABASE_URL='postgresql://newxonvert:nx_pw_change_me@127.0.0.1:5432/newxonvert?schema=public' \
  NEXTAUTH_SECRET=smoke POW_SECRET=smoke NEXTAUTH_URL=https://xonvert.com \
  npx next start -p $PORT > /root/nx_smoke_server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null "$B/" && break; sleep 1; done

FAIL=0
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected [$2] got [$3]"; FAIL=1; fi
}
st() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$@"; }
canon() { curl -s "$B$1" | grep -o '<link rel="canonical" href="[^"]*"' | head -1 | sed 's/.*href="//;s/"$//'; }

check "/studios -> /tools"            "307 $B/tools" "$(st $B/studios)"
check "/tools/image-studio -> /tools" "307 $B/tools" "$(st $B/tools/image-studio)"
check "/tools/video-auto-subtitle"    "307 $B/tools" "$(st $B/tools/video-auto-subtitle)"
check "/upgrade -> /pricing"          "308 $B/pricing" "$(st $B/upgrade)"
check "www -> apex"                   "308 https://xonvert.com/tools" "$(st -H 'Host: www.xonvert.com' $B/tools)"
check "/tools/pdf-compress 200"       "200 " "$(st $B/tools/pdf-compress)"
check "/tools/resume-studio-like kept" "200 " "$(st $B/tools/studio-resume)"
check "home canonical"                "https://xonvert.com" "$(canon / | sed 's:/$::')"
check "/tools not canonical to home"  "" "$(canon /tools | grep -x 'https://xonvert.com/\?' )"
check "/convert not canonical to home" "" "$(canon /convert | grep -x 'https://xonvert.com/\?' )"
check "/tools/pdf-compress canonical" "https://xonvert.com/tools/pdf-compress" "$(canon /tools/pdf-compress)"
check "legacy /mp4-to-mp3"            "308 https://xonvert.com/tools/video-extract-audio" "$(st $B/mp4-to-mp3)"
check "legacy /png-to-jpg"            "308 https://xonvert.com/convert/png-to-jpg" "$(st $B/png-to-jpg)"
check "legacy /cfg-to-txt -> hub"     "308 https://xonvert.com/convert" "$(st $B/cfg-to-txt)"
check "/pricing untouched by legacy"  "200 " "$(st $B/pricing)"
SM=$(curl -s $B/sitemap.xml)
check "sitemap has no studios"        "0" "$(echo "$SM" | grep -cE '/(studios|tools/(image-studio|video-studio|pdf-studio|office-docs))<')"
check "sitemap still has tools"       "yes" "$( [ $(echo "$SM" | grep -c '<loc>') -gt 300 ] && echo yes || echo no)"
HOME_HTML=$(curl -s $B/)
check "home links no studio"          "0" "$(echo "$HOME_HTML" | grep -cE 'href="/(studios|tools/image-studio)"')"

[ $FAIL = 0 ] && echo "SMOKE_PASS" || { echo "SMOKE_FAIL"; tail -20 /root/nx_smoke_server.log; exit 1; }
