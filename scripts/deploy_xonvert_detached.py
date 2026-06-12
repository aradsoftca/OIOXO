"""Deploy newxonvert (xonvert.com) with the heavy install+build DETACHED on the
server — so a dropped local SSH connection can NEVER strand a finished build.

The plain deploy.py runs `next build` synchronously over SSH (5400s wall-clock).
On the flaky local→Iceland link the channel drops mid-build, run() aborts, and
the swap+restart never fire — the build finishes on the server but the site keeps
serving the OLD .next forever (looks like "deploying for hours"). This variant
does the quick steps synchronously, then launches install+build under `setsid`
writing a sentinel, so it survives a disconnect. `_finish_xonvert.py` then does
the atomic swap + PM2 restart + smoke when the sentinel says DONE (re-runnable,
short — immune to SSH drops).

  python -u scripts/deploy_xonvert_detached.py     # launch (quick)
  python -u scripts/_finish_xonvert.py             # swap + restart when ready
"""
import sys
sys.path.insert(0, "scripts")
import deploy
from deploy import (
    open_ssh, run, mkdir_p, write_remote_env, mint_tool_key, rotate_brain_key,
    upload_tar, preflight, ensure_db, remote_exists,
    REMOTE_DIR, BASE_PATH,
)
import posixpath
import shlex


def main():
    print("=" * 70)
    print(" DEPLOY (detached): newxonvert -> Iceland :3001 / xonvert.com ")
    print("=" * 70)
    ssh = open_ssh()
    sftp = ssh.open_sftp()

    preflight(ssh)
    ensure_db(ssh)
    rotate_brain_key()  # fresh WASM key + re-encrypt BEFORE upload
    mint_tool_key()     # fresh tool-worker key; server build encrypts with it

    print("\n========== UPLOADING SOURCE ==========")
    mkdir_p(sftp, REMOTE_DIR)
    upload_tar(ssh, sftp, deploy.PROJECT, REMOTE_DIR)
    write_remote_env(sftp)

    R = REMOTE_DIR
    install_cmd = "npm ci" if remote_exists(sftp, posixpath.join(R, "package-lock.json")) else "npm install"
    tool_key_env = f"TOOL_WASM_KEY={deploy.TOOL_KEY} " if deploy.TOOL_KEY else ""
    # SIDE-DIR build (NEXT_DIST_DIR=.next-build): the build writes to .next-build
    # while the live .next keeps serving — site stays UP for the whole build. The
    # finisher VALIDATES .next-build then atomically swaps + restarts (brief blip).
    #
    # MEMORY-SAFE BUILD (the box is shared — ~2GB free with 6 other tenants): the
    # build kept THRASHING (262% CPU, no progress) then writing a CORRUPT chunk
    # (HTML/RSC bytes where CSS should be → "Unexpected token" minifier crash) =
    # classic OOM under memory pressure. Two fixes:
    #   - DISABLE_WEBPACK_BUILD_WORKER=1: don't fork the parallel build worker
    #     (it ~doubles peak memory). next.config honours this env.
    #   - NODE_OPTIONS=--max-old-space-size=4096: cap V8 heap so it GCs hard
    #     instead of letting the OS OOM-corrupt/kill the process. 4GB fits the
    #     free headroom; aggressive GC is slower but COMPLETES instead of dying.
    build_env = (
        f"{tool_key_env}OBFUSCATE=1 NEXT_BASE_PATH={BASE_PATH} NEXT_DIST_DIR=.next-build "
        f"DISABLE_WEBPACK_BUILD_WORKER=1 NODE_OPTIONS=--max-old-space-size=4096 "
    )
    inner = (
        f"cd {R} && "
        f"{{ "
        f"{install_cmd} --include=dev --no-audit --no-fund && "
        f"npx prisma db push --skip-generate && "
        f"npx prisma generate && "
        f"rm -rf .next-build && "
        f"{build_env}npm run build ; "
        f"}} > _deploy.log 2>&1 ; echo DONE:$? > _deploy.done"
    )
    launch = (
        f"cd {R} && rm -f _deploy.done && "
        f"setsid bash -lc {shlex.quote(inner)} </dev/null >/dev/null 2>&1 & echo launched pid $!"
    )
    print("\n========== LAUNCH DETACHED SIDE-DIR BUILD (live .next keeps serving) ==========")
    run(ssh, launch, t=60, label="launch (survives disconnect)")
    run(ssh, f"sleep 2 && tail -3 {R}/_deploy.log 2>/dev/null || true", t=20, label="first log lines")

    sftp.close()
    ssh.close()
    print("\nLAUNCHED. Now run:  python -u scripts/_finish_xonvert.py   (repeat until SHIP OK)")


if __name__ == "__main__":
    main()
