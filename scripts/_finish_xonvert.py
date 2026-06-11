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

            # Build truly finished AND artifacts complete AND no build process left.
            if have == "YES" and procs.strip() == "0":
                if done.startswith("DONE:") and not done.endswith("DONE:0"):
                    # Build exited non-zero — but Next sometimes can't exit its own
                    # process after a COMPLETE build (lingering workers). Manifests
                    # present + process gone => treat as success (matches deploy.py).
                    print(f"  note: sentinel {done} but all artifacts present — treating as complete")
                sftp = ssh.open_sftp()
                print("\n========== SWAP + FINISH ==========")
                run(ssh, f"cd {R} && pm2 stop {PM2_NAME} 2>/dev/null || true; "
                         f"rm -rf .next.prev; [ -d .next ] && mv .next .next.prev; "
                         f"mv .next-build .next && rm -f _deploy.done",
                    label="atomic swap .next-build -> .next")
                deploy._finish_and_smoke(ssh, sftp)  # PM2 + Caddy + smoke + closes ssh/sftp
                print("\nSHIP OK — xonvert.com updated.")
                return

            # Sentinel done but artifacts missing => the build FAILED. Don't swap.
            if done.startswith("DONE:") and have != "YES":
                tail, _ = sh(ssh, f"tail -25 {R}/_deploy.log")
                print("BUILD FAILED (sentinel set, artifacts incomplete) — site UNTOUCHED. Tail:\n" + tail)
                run(ssh, f"rm -rf {R}/.next-build {R}/_deploy.done", label="clean failed build")
                ssh.close(); return

            ssh.close()
        except Exception as ex:
            print("poll error (continuing):", ex)
        time.sleep(45)
    print("did not finish within the window — re-run this script to resume")


if __name__ == "__main__":
    main()
