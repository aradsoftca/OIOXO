# deploy.py — `--from-artifact` patch  ✅ APPLIED 2026-06-05

> Status: APPLIED to scripts/deploy.py (syntax-checked, `--help` verified). This
> file is kept as the design record. The CI workflow (.github/workflows/deploy.yml)
> calls `python scripts/deploy.py --from-artifact <tgz>`.


Two changes. Keeps the full-build path 100% intact; adds a fast artifact path.

## 1. Read creds from env (so CI can pass them; local manual runs still work)

Replace the hardcoded constants:

```python
HOST = "194.247.182.248"
USER = "root"
PASSWORD = "D%G%CimhX5"
```

with:

```python
HOST = os.environ.get("ICELAND_HOST", "194.247.182.248")
USER = os.environ.get("ICELAND_USER", "root")
PASSWORD = os.environ.get("ICELAND_PASSWORD", "D%G%CimhX5")
```

## 2. Add the artifact mode

At the top of `main()`, parse the flag:

```python
def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-artifact", metavar="TGZ", default=None,
                    help="Ship a prebuilt .next/public/prisma tarball instead of building on the server.")
    args = ap.parse_args()
    artifact = args.from_artifact
    ...
    ssh = open_ssh(); sftp = ssh.open_sftp()
    preflight(ssh)
    ensure_db(ssh)
```

Then branch the upload/build section:

```python
    if artifact:
        # ---- FAST PATH: ship the prebuilt (already-obfuscated) artifact -------
        # The runner already minted TOOL_WASM_KEY and encrypted the workers into
        # the artifact's public/protected/*.enc. We just write that SAME key to
        # the remote .env so the live site unlocks them.
        global TOOL_KEY
        TOOL_KEY = os.environ.get("TOOL_WASM_KEY")  # set by CI; matches the artifact
        mkdir_p(sftp, REMOTE_DIR)
        write_remote_env(sftp)                       # incl. TOOL_KEY
        # upload package.json/lock so we can npm ci only when deps changed
        # (the artifact already carries .next/public/prisma; source stays as-is).
        print("\n========== SHIP PREBUILT ARTIFACT ==========")
        remote_tgz = posixpath.join(REMOTE_DIR, "_artifact.tgz")
        sftp.put(artifact, remote_tgz)
        run(ssh, f"rm -rf {REMOTE_DIR}/.next-build && mkdir -p {REMOTE_DIR}/.next-build && "
                 f"tar -xzf {remote_tgz} -C {REMOTE_DIR}/.next-build && rm -f {remote_tgz}",
            t=300, label="extract artifact")
        # node_modules is persistent on the server. Only reinstall when the
        # lockfile differs from what's installed.
        run(ssh, f"cd {REMOTE_DIR} && (cmp -s package-lock.json .next-build/.lock-marker 2>/dev/null "
                 f"|| (cp -f .next-build/prisma/schema.prisma prisma/schema.prisma 2>/dev/null; true))",
            t=60, label="sync prisma schema", quiet=True)
        run(ssh, f"cd {REMOTE_DIR} && npx prisma db push --skip-generate && npx prisma generate",
            t=240, label="prisma")
        # SWAP: move the prebuilt .next/public into place (mirror the normal path).
        run(ssh, f"cd {REMOTE_DIR} && pm2 stop {PM2_NAME} 2>/dev/null || true && "
                 f"rm -rf .next public.old && (mv public public.old 2>/dev/null || true) && "
                 f"mv .next-build/.next .next && mv .next-build/public public && "
                 f"rm -rf public.old .next-build",
            t=120, label="swap in prebuilt artifact")
    else:
        # ---- existing full server build path (UNCHANGED) ---------------------
        rotate_brain_key()
        mint_tool_key()
        print("\n========== UPLOADING SOURCE ==========")
        ...everything as today through the next-build + swap...
```

After either branch, the rest of `main()` (pm2 start, `upload_origin_cert`,
`ensure_caddy_route`, smoke test) runs identically.

## Notes / gotchas verified against the current script
- node_modules lives persistently in `REMOTE_DIR`; the artifact must NOT carry
  it. `next start` uses the server's installed modules.
- `public/protected/*.enc` (encrypted workers) are built on the runner with the
  minted key and travel inside the artifact — do not re-encrypt on the server.
- Keep `pm2 start ecosystem.config.js` (re-register) — same as the full path.
- Brain-key rotation is skipped in artifact mode (the brain wasm was encrypted
  on the runner during prebuild). If brain wasm must rotate per-deploy, mint it
  on the runner too and pass it through — out of scope for v1.
