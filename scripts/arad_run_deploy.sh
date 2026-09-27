#!/bin/bash
# Invoked by the Windows scheduled task "xonvert-deploy" on arad, so a dropped
# ssh session can't kill the build (a plain ssh→wsl run, and even setsid
# nohup, died when the session dropped). Result in /root/nx_deploy.done.
#
# Install once:  cp to /root/run_deploy.sh in WSL, then on Windows:
#   schtasks /create /tn xonvert-deploy /tr "wsl.exe -d Ubuntu -u root -- bash /root/run_deploy.sh" /sc once /st 23:59 /f
# Deploy:        schtasks /run /tn xonvert-deploy   (poll /root/nx_deploy.done)
cd /root/newxonvert || exit 1
git checkout -q -- lib/ai/wasm/wasm-bytes.ts 2>/dev/null
git fetch -q origin
git show origin/xonvert-main:scripts/arad_build_deploy.sh > /root/arad_build_deploy.sh
rm -f /root/nx_deploy.done
DEPLOY=1 bash /root/arad_build_deploy.sh > /root/nx_deploy.log 2>&1
echo "EXIT=$?" > /root/nx_deploy.done
