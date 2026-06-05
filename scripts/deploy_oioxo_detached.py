"""Deploy oioxo with the heavy install+build DETACHED on the server.

The plain deploy_oioxo.py ties the >20-min remote build to the SSH session, so if
the local process dies the build dies with it (it left a stale .next-build). This
variant does the quick steps synchronously (preflight, db, secrets, upload, env),
then launches install+build under `setsid` writing a sentinel — so it survives,
and `_poll_oioxo.py` finishes the swap when it's done (re-runnable, short).

  python -u scripts/deploy_oioxo_detached.py     # launch
  python -u scripts/_poll_oioxo.py               # poll + finish (repeat until done)
"""
import sys
sys.path.insert(0, "scripts")
import deploy
import deploy_oioxo as dx


def main():
    print("=" * 70)
    print(" DEPLOY (detached): oioxo -> Iceland :3002 / oioxo.com ")
    print("=" * 70)
    ssh = deploy.open_ssh()
    sftp = ssh.open_sftp()

    dx.preflight(ssh)
    dx.ensure_db(ssh)
    dx.ensure_oioxo_secrets()
    deploy.rotate_brain_key()  # fresh WASM key + re-encrypt before upload

    print("\n========== UPLOADING SOURCE ==========")
    deploy.mkdir_p(sftp, dx.REMOTE_DIR)
    deploy.upload_tar(ssh, sftp, deploy.PROJECT, dx.REMOTE_DIR)
    dx.write_env(sftp)

    R = dx.REMOTE_DIR
    # SIDE-DIR build (next.config honors NEXT_DIST_DIR=.next-build): the build writes
    # to .next-build while the live `.next` keeps serving — so the site (incl. CSS)
    # stays UP for the whole ~25-min build. The poller then VALIDATES .next-build and
    # atomically swaps + restarts (brief blip only). NEVER build in place (that rewrites
    # the live .next mid-build → assets 404 / no CSS until it finishes).
    build_env = f"OBFUSCATE=1 NEXT_BASE_PATH= NEXT_DIST_DIR=.next-build NEXT_PUBLIC_BRAND=oioxo NEXT_PUBLIC_BRAND_DOMAIN={dx.PUBLIC_HOST}"
    inner = (
        f"cd {R} && "
        f"{{ "
        f"if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi && "
        f"npx prisma db push --skip-generate && "
        f"npx prisma generate && "
        f"rm -rf .next-build && "
        f"{build_env} npm run build ; "
        f"}} > _deploy.log 2>&1 ; echo DONE:$? > _deploy.done"
    )
    launch = (
        f"cd {R} && rm -f _deploy.done && "
        f"setsid bash -lc {_q(inner)} </dev/null >/dev/null 2>&1 & echo launched pid $!"
    )
    print("\n========== LAUNCH DETACHED SIDE-DIR BUILD (live .next keeps serving) ==========")
    deploy.run(ssh, launch, t=60, label="launch (survives disconnect)")
    deploy.run(ssh, f"sleep 2 && tail -3 {R}/_deploy.log 2>/dev/null || true", t=20, label="first log lines")

    sftp.close()
    ssh.close()
    print("\nLAUNCHED. Now run:  python -u scripts/_poll_oioxo.py   (repeat until COMPLETE)")


def _q(s: str) -> str:
    import shlex
    return shlex.quote(s)


if __name__ == "__main__":
    main()
