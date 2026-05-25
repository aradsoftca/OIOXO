"""Robust newxonvert -> xonvert.com deploy (detached build + reconnecting poll).

Why this exists: plain deploy.py holds ONE SSH channel open for the entire
~15-30 min `next build`. On this box that idle-ish channel gets reset
mid-build (ConnectionResetError / "exceeded wall-clock"), so a build that
actually SUCCEEDS is reported as a failure and never swapped in.

This deployer mirrors the proven oioxo detached pattern:
  1. quick steps synchronously (preflight, db, rotate key, upload, env),
  2. launch install+build under `setsid` writing a DONE sentinel — it
     survives any disconnect,
  3. POLL with fresh, short-lived connections (each command is quick, so the
     link never sits idle long enough to die; reconnects if it does),
  4. validate the side-dir .next-build, then atomically swap + restart + smoke.

The live `.next` keeps serving the whole time; nothing changes unless the new
build validates. Self-contained — run once:

    python -u scripts/deploy_safe.py
"""
import shlex
import sys
import time

sys.path.insert(0, "scripts")
import deploy
from deploy import (
    BASE_PATH, LOCAL_PORT, PM2_NAME, PROJECT, PUBLIC_HOST, REMOTE_DIR,
    ensure_caddy_route, ensure_db, mkdir_p, preflight, remote_exists,
    rotate_brain_key, run, upload_origin_cert, upload_tar, write_remote_env,
)

R = REMOTE_DIR
BUILD_BUDGET_S = 45 * 60       # hard ceiling for the whole build
POLL_EVERY_S = 20


def connect():
    ssh = deploy.open_ssh()
    try:
        ssh.get_transport().set_keepalive(30)
    except Exception:
        pass
    return ssh


def main():
    print("=" * 70)
    print(" DEPLOY (safe/detached): newxonvert -> xonvert.com ")
    print("=" * 70)

    ssh = connect()
    sftp = ssh.open_sftp()
    preflight(ssh)
    ensure_db(ssh)
    rotate_brain_key()  # fresh WASM key + re-encrypt BEFORE upload

    print("\n========== UPLOADING SOURCE ==========")
    mkdir_p(sftp, REMOTE_DIR)
    upload_tar(ssh, sftp, PROJECT, REMOTE_DIR)
    write_remote_env(sftp)

    install_cmd = "npm ci" if remote_exists(sftp, R + "/package-lock.json") else "npm install"
    build_env = f"OBFUSCATE=1 NEXT_BASE_PATH={BASE_PATH} NEXT_DIST_DIR=.next-build"
    inner = (
        f"cd {R} && {{ "
        f"{install_cmd} --no-audit --no-fund && "
        f"npx prisma db push --skip-generate && "
        f"npx prisma generate && "
        f"rm -rf .next-build && "
        f"{build_env} npm run build ; "
        f"}} > _deploy.log 2>&1 ; echo DONE:$? > _deploy.done"
    )
    launch = (
        f"cd {R} && rm -f _deploy.done && "
        f"setsid bash -lc {shlex.quote(inner)} </dev/null >/dev/null 2>&1 & echo launched pid $!"
    )
    print("\n========== LAUNCH DETACHED BUILD (live .next keeps serving) ==========")
    run(ssh, launch, t=60, label="launch (survives disconnect)")
    sftp.close()
    ssh.close()

    # ---- Poll for completion with fresh short connections ------------------
    print("\n========== BUILDING (polling) ==========")
    deadline = time.time() + BUILD_BUDGET_S
    done = None
    while time.time() < deadline:
        time.sleep(POLL_EVERY_S)
        try:
            s = connect()
            _, out, _ = run(s, f"cat {R}/_deploy.done 2>/dev/null || echo PENDING", t=30, quiet=True)
            if "PENDING" not in out:
                done = out.strip()
                s.close()
                break
            run(s, f"echo -n 'building… '; du -sh {R}/.next-build 2>/dev/null | cut -f1 || echo '0'", t=30, label=None)
            s.close()
        except Exception as e:  # transient disconnect — just retry next loop
            print(f"  (poll reconnect: {e})")

    if done is None:
        print("\n! build did not finish within budget — site UNCHANGED, old build still live.")
        sys.exit(1)
    if "DONE:0" not in done:
        s = connect()
        run(s, f"tail -40 {R}/_deploy.log", label="BUILD FAILED — log tail")
        s.close()
        print("\nBUILD FAILED — site UNCHANGED, old build still live.")
        sys.exit(1)

    # ---- Validate + atomic swap + restart ----------------------------------
    ssh = connect()
    sftp = ssh.open_sftp()
    _, val, _ = run(
        ssh,
        f"test -f {R}/.next-build/BUILD_ID && test -d {R}/.next-build/static && echo VALID || echo INVALID",
        label="validate .next-build (BUILD_ID + static)",
    )
    if "VALID" not in val:
        run(ssh, f"rm -rf {R}/.next-build", label="discard incomplete build (live .next kept)")
        ssh.close()
        print("\nBUILD INCOMPLETE — swap aborted, old build still serving.")
        sys.exit(1)

    print("\n========== VALID BUILD -> ATOMIC SWAP + RESTART ==========")
    run(ssh, f"cd {R} && pm2 stop {PM2_NAME} 2>/dev/null || true && rm -rf .next && mv .next-build .next", label="swap in validated build")
    _, plist, _ = run(ssh, "pm2 list --no-color 2>&1", label="pm2 list", quiet=True)
    if PM2_NAME in plist:
        run(ssh, f"pm2 delete {PM2_NAME} 2>&1 || true", label="pm2 delete (clean reset)")
    run(ssh, f"cd {R} && pm2 start ecosystem.config.js", label="pm2 start")
    run(ssh, "pm2 save", label="pm2 save")

    serve_primary = upload_origin_cert(ssh, sftp)
    ensure_caddy_route(ssh, sftp, serve_primary)

    print("\n========== SMOKE TEST ==========")
    time.sleep(3)
    run(ssh, f"curl -sS -o /dev/null -w 'direct :{LOCAL_PORT}/ -> HTTP %{{http_code}} (%{{size_download}} bytes)\\n' --max-time 20 http://127.0.0.1:{LOCAL_PORT}/", label="smoke direct")
    run(ssh, f"curl -sSI --max-time 30 https://{PUBLIC_HOST}/ | head -1", label="smoke https")
    run(ssh, f"rm -f {R}/_deploy.done", label="cleanup sentinel")

    sftp.close()
    ssh.close()
    print(f"\nDEPLOY COMPLETE — https://{PUBLIC_HOST}/ and https://xonvert.com/")


if __name__ == "__main__":
    main()
