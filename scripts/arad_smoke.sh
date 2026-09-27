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
ROBOTS=$(curl -s $B/robots.txt)
check "robots allows /_next/"         "1" "$(echo "$ROBOTS" | grep -cx 'Allow: /_next/')"
check "robots no Disallow /_next/"    "0" "$(echo "$ROBOTS" | grep -cx 'Disallow: /_next/')"
check "/tools self-canonical"         "https://xonvert.com/tools" "$(canon /tools)"
check "/convert self-canonical"       "https://xonvert.com/convert" "$(canon /convert)"
check "/tools links uncatalogued tool" "1" "$(curl -s $B/tools | grep -c 'href="/tools/video-info"')"
check "thin pair is noindex,follow"   "1" "$(curl -s $B/convert/avif-to-jpg | grep -c 'content="noindex, follow"')"
check "no SearchAction"               "0" "$(curl -s $B/ | grep -c 'SearchAction')"
check "/cad-3d hub 200 + canonical"   "https://xonvert.com/cad-3d" "$(canon /cad-3d)"
CAD=$(curl -s $B/convert/step-to-stl)
check "step-to-stl indexable"         "0" "$(echo "$CAD" | grep -c 'content="noindex')"
check "step-to-stl hand-written copy" "1" "$( echo "$CAD" | grep -q 'tessellates every surface' && echo 1 || echo 0)"
check "fbx-to-glb page 200"           "200 " "$(st $B/convert/fbx-to-glb)"
check "home links CAD hub"            "1" "$( curl -s $B/ | grep -q 'href="/cad-3d"' && echo 1 || echo 0)"
check "engine uses GetPath"           "0" "$(grep -c 'GetName()' engines/model3d/index.ts)"
for w in image codec audio cad model3d; do
  check "worker $w.worker.js.enc served" "200 " "$(st $B/protected/$w.worker.js.enc)"
done
TP=$(curl -s $B/tools/pdf-compress)
check "tool page: no AI-hardware FAQ"  "0" "$(echo "$TP" | grep -c 'What hardware does the AI need')"
check "tool page: no fake undo/redo"   "0" "$(echo "$TP" | grep -c 'Undo and redo are local')"
check "tool page: hand-written copy"   "1" "$( echo "$TP" | grep -q 'can no longer be selected' && echo 1 || echo 0)"
check "tool page: honest free answer"  "1" "$( echo "$TP" | grep -q 'daily free allowance' && echo 1 || echo 0)"
check "format page /formats/dwg"      "200 " "$(st $B/formats/dwg)"
check "no bulk format pages"          "404 " "$(st $B/formats/mobi)"
check "PWA manifest is Xonvert's"     "1" "$(curl -s $B/ | grep -c 'href="/xonvert.webmanifest"')"
check "/oioxo not served on xonvert"  "308 $B/" "$(st $B/oioxo)"
check "/ai not served on xonvert"     "308 $B/" "$(st $B/ai)"
check "legacy /mp4-to-mp3"            "308 https://xonvert.com/convert/mp4-to-mp3" "$(st $B/mp4-to-mp3)"
check "png-to-jpg has real copy"       "1" "$( curl -s $B/convert/png-to-jpg | grep -q 'cannot store transparency' && echo 1 || echo 0)"
check "legacy /png-to-jpg"            "308 https://xonvert.com/convert/png-to-jpg" "$(st $B/png-to-jpg)"
check "legacy /cfg-to-txt -> hub"     "308 https://xonvert.com/convert" "$(st $B/cfg-to-txt)"
check "/pricing untouched by legacy"  "200 " "$(st $B/pricing)"
SM=$(curl -s $B/sitemap.xml)
check "sitemap has no studios"        "0" "$(echo "$SM" | grep -cE '/(studios|tools/(image-studio|video-studio|pdf-studio|office-docs))<')"
check "sitemap still has tools"       "yes" "$( [ $(echo "$SM" | grep -c '<loc>') -gt 300 ] && echo yes || echo no)"
HOME_HTML=$(curl -s $B/)
check "home HTML under 400 KB"         "yes" "$( [ $(echo "$HOME_HTML" | wc -c) -lt 400000 ] && echo yes || echo no)"
check "home links no studio"          "0" "$(echo "$HOME_HTML" | grep -cE 'href="/(studios|tools/image-studio)"')"

[ $FAIL = 0 ] && echo "SMOKE_PASS" || { echo "SMOKE_FAIL"; tail -20 /root/nx_smoke_server.log; exit 1; }
