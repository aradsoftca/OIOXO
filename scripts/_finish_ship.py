"""One-shot: wait for the detached oioxo build to truly finish (BUILD_ID), then
atomic-swap + restart + smoke. Decoupled from the deploy's SSH-channel deadline,
which kept cutting the build on the slow Iceland box. Temp helper — safe to delete."""
import time
import deploy

REMOTE = "/root/oioxo"


def sh(ssh, c, timeout=60):
    _, o, e = ssh.exec_command(c, timeout=timeout)
    return o.read().decode("utf-8", "replace").strip(), e.read().decode("utf-8", "replace").strip()


def main():
    deadline = time.time() + 80 * 60
    while time.time() < deadline:
        time.sleep(60)
        try:
            ssh = deploy.open_ssh()
            bid, _ = sh(ssh, f"cat {REMOTE}/.next-build/BUILD_ID 2>/dev/null || echo NO")
            proc, _ = sh(ssh, "ps aux | grep -E 'next build|npm run build' | grep -v grep | wc -l")
            if bid and bid != "NO":
                # require ALL the manifests next start needs — BUILD_ID alone can be
                # written before page-data collection finishes; swapping then ships an
                # incomplete build that crash-loops on a missing prerender-manifest.
                need = "required-server-files.json prerender-manifest.json routes-manifest.json build-manifest.json"
                rsf, _ = sh(ssh, f"cd {REMOTE}/.next-build && for f in {need}; do test -f $f || {{ echo no; exit; }}; done; echo yes")
                if rsf == "yes" and proc == "0":  # complete AND the build process has exited
                    out, _ = sh(ssh, f"cd {REMOTE} && pm2 stop oioxo && rm -rf .next && mv .next-build .next "
                                     f"&& pm2 restart oioxo --update-env && pm2 save 2>/dev/null && echo SWAPPED", timeout=120)
                    time.sleep(5)
                    ent, _ = sh(ssh, "curl -sS -o /dev/null -w '%{http_code}' -X POST "
                                     "http://127.0.0.1:3002/api/entitlement -H 'content-type: application/json' -d '{\"device\":\"x\"}'")
                    oio, _ = sh(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/oioxo")
                    pub, _ = sh(ssh, "curl -sSI --max-time 30 https://oioxo.com/ | head -1")
                    print(f"SHIP OK | {out.splitlines()[-1] if out else '?'} | local /api/entitlement={ent} /oioxo={oio} | public={pub}")
                    ssh.close(); return
                else:
                    print("BUILD_ID present but build not fully complete — waiting more"); ssh.close(); continue
            if proc == "0":
                tail, _ = sh(ssh, f"tail -30 {REMOTE}/oioxo-build.log")
                print("BUILD STOPPED with no BUILD_ID — likely failed. Tail:\n" + tail)
                ssh.close(); return
            ssh.close()
        except Exception as ex:
            print("poll error (continuing):", ex)
    print("did not finish within the window")


if __name__ == "__main__":
    main()
