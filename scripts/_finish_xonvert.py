"""Finish a detached xonvert build: wait for the sentinel, VALIDATE the side-dir
build is complete + bootable, atomic-swap .next-build -> .next, then reuse
deploy._finish_and_smoke (PM2 re-register + Caddy + smoke). Decoupled from the
build's SSH channel, so a dropped local connection can't strand a finished build.

Re-runnable and short. Run after deploy_xonvert_detached.py:
  python -u scripts/_finish_xonvert.py
"""
import sys, time
sys.path.insert(0, "scripts")
import deploy
from deploy import open_ssh, run, REMOTE_DIR, PM2_NAME

R = REMOTE_DIR
# next start crash-loops without these — never swap an incomplete build.
NEED = "BUILD_ID required-server-files.json routes-manifest.json prerender-manifest.json build-manifest.json"


def sh(ssh, c, timeout=60):
    _, o, e = ssh.exec_command(c, timeout=timeout)
    return o.read().decode("utf-8", "replace").strip(), e.read().decode("utf-8", "replace").strip()


def main():
    deadline = time.time() + 90 * 60
    while time.time() < deadline:
        try:
            ssh = open_ssh()
            done, _ = sh(ssh, f"cat {R}/_deploy.done 2>/dev/null || echo PENDING")
            have, _ = sh(ssh, f"cd {R}/.next-build 2>/dev/null && for f in {NEED}; do test -f $f || {{ echo NO; exit; }}; done; echo YES")
            procs, _ = sh(ssh, "ps aux | grep -E 'next build|npm run build' | grep -v grep | wc -l")
            print(f"sentinel={done!r} manifests={have!r} build_procs={procs!r}")

            # PRIMARY gate: the sentinel MUST say the build process exited. While it
            # reads PENDING the build is still writing into .next-build (manifests can
            # already exist mid-build — that earlier race swapped a half-written dir
            # and crash-looped the site). Never swap on PENDING.
            if not done.startswith("DONE:"):
                ssh.close()
                time.sleep(45)
                continue

            # Sentinel set but build exited non-zero OR artifacts incomplete => FAILED.
            if not done.endswith("DONE:0") or have != "YES":
                tail, _ = sh(ssh, f"tail -25 {R}/_deploy.log")
                print(f"BUILD FAILED (sentinel={done}, artifacts={have}) — site UNTOUCHED. Tail:\n" + tail)
                run(ssh, f"rm -rf {R}/.next-build {R}/_deploy.done", label="clean failed build")
                ssh.close(); return

            # DONE:0 + all artifacts present => safe to swap. Keep .next.prev for
            # rollback, then VERIFY the new build actually boots (BUILD_ID landed in
            # .next + PM2 serves 200). If it doesn't, auto-rollback — never leave the
            # site 502'd on a bad swap.
            sftp = ssh.open_sftp()
            print("\n========== SWAP + VERIFY ==========")
            run(ssh, f"cd {R} && pm2 stop {PM2_NAME} 2>/dev/null || true; "
                     f"rm -rf .next.prev; [ -d .next ] && mv .next .next.prev; "
                     f"mv .next-build .next && rm -f _deploy.done && "
                     f"pm2 restart {PM2_NAME} --update-env 2>/dev/null || (cd {R} && pm2 start ecosystem.config.js)",
                label="atomic swap + restart")
            time.sleep(7)
            code, _ = sh(ssh, "curl -sS -o /dev/null -w '%{http_code}' --max-time 20 http://127.0.0.1:3001/ 2>/dev/null")
            has_bid, _ = sh(ssh, f"test -f {R}/.next/BUILD_ID && echo YES || echo NO")
            if code == "200" and has_bid == "YES":
                deploy._finish_and_smoke(ssh, sftp)  # PM2 re-register + Caddy + smoke
                print("\nSHIP OK — xonvert.com updated (verified booting).")
                return
            # Bad swap → ROLL BACK to the known-good previous build.
            print(f"  ! new build does NOT boot (HTTP {code}, BUILD_ID={has_bid}) — ROLLING BACK")
            run(ssh, f"cd {R} && pm2 stop {PM2_NAME} 2>/dev/null; rm -rf .next.bad; mv .next .next.bad; "
                     f"mv .next.prev .next && (pm2 restart {PM2_NAME} --update-env || pm2 start ecosystem.config.js) && pm2 save 2>/dev/null && echo ROLLED_BACK",
                label="rollback to previous build")
            time.sleep(6)
            rb, _ = sh(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/ 2>/dev/null")
            print(f"  rollback complete — site HTTP {rb}. The build was bad; check _deploy.log.")
            sftp.close(); ssh.close(); return
        except Exception as ex:
            print("poll error (continuing):", ex)
        time.sleep(45)
    print("did not finish within the window — re-run this script to resume")


if __name__ == "__main__":
    main()
