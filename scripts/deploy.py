"""Deploy newxonvert to Iceland.

Pattern matches D:/appz/traxlate/_ship_*.py — paramiko SSH + sftp,
strict pre-flight checks, no surprises for translation-lab.

What this does:
  1. Pre-flight: confirm translation-lab + traxlate-web are running.
  2. Rsync project source to /root/newxonvert/ (excludes node_modules, .next).
  3. npm ci on server.
  4. prisma db push (creates schema in newxonvert Postgres DB).
  5. next build with NEXT_BASE_PATH=/xonvert.
  6. PM2: register/restart `newxonvert` process.
  7. Ensure Caddyfile routes /xonvert/* → :3001 (idempotent).
  8. Reload Caddy.
  9. Smoke-test http://127.0.0.1:3001/xonvert/ from the server itself.

Safe to re-run.
"""

import io
import os
import posixpath
import stat
import subprocess
import sys
import time
from pathlib import Path

import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

HOST = "194.247.182.248"
USER = "root"
PASSWORD = "D%G%CimhX5"

REMOTE_DIR = "/root/newxonvert"
PM2_NAME = "newxonvert"
LOCAL_PORT = 3001

# Staging hostname (DNS-only at Cloudflare → Caddy auto-issues Let's Encrypt).
PUBLIC_HOST = "new.xonvert.com"
# Primary domain — Cloudflare-PROXIED, so Caddy can't run an ACME challenge for
# it. We serve a Cloudflare Origin Certificate instead (SSL mode: Full strict).
# Certs live under /etc/caddy so the unprivileged 'caddy' user can read them.
# (/root is mode 0700 — Caddy there fails with "permission denied" on reload.)
PRIMARY_HOST = "xonvert.com"
REMOTE_CERT_DIR = "/etc/caddy/certs"
ORIGIN_CERT = f"{REMOTE_CERT_DIR}/origin.pem"
ORIGIN_KEY = f"{REMOTE_CERT_DIR}/origin.key"
# basePath stays empty now that we have a real hostname — Next serves at root.
BASE_PATH = ""

PROJECT = Path(__file__).resolve().parents[1]

# Fresh per-deploy WASM key, minted by rotate_brain_key() and written to the
# server env by write_remote_env() so any previously-leaked key dies each deploy.
ROTATED_KEY = None

# Fresh per-deploy master key for the ENCRYPTED TOOL ENGINE WORKERS (image/codec/
# audio/cad/model3d). Minted by mint_tool_key(), passed into the server build so
# prebuild's encrypt-workers.mjs encrypts with it, and written to the remote .env
# so /api/tool-key derives the matching per-asset keys. Rotating it each deploy
# kills any leaked key on the next ship (same model as BRAIN_WASM_KEY).
TOOL_KEY = None


def mint_tool_key():
    """Generate a fresh 256-bit TOOL_WASM_KEY (base64) for this deploy."""
    global TOOL_KEY
    import base64
    import os as _os
    TOOL_KEY = base64.b64encode(_os.urandom(32)).decode("ascii")
    print("\n========== TOOL WORKER KEY ==========")
    print("      minted fresh TOOL_WASM_KEY ✓ (server build encrypts workers with it)")


def rotate_brain_key():
    """Mint a new BRAIN_WASM_KEY + re-encrypt the WASM locally before upload, so a
    leaked key only works until the next deploy. Best-effort: on any failure we
    keep the existing encryption/key (the gate still works, just no rotation)."""
    global ROTATED_KEY
    print("\n========== ROTATE BRAIN KEY ==========")
    try:
        res = subprocess.run(
            ["node", "lib/ai/wasm/encrypt.mjs", "--rotate"],
            cwd=str(PROJECT), capture_output=True, text=True, timeout=120,
        )
        for line in (res.stdout or "").splitlines():
            if line.startswith("ROTATED_BRAIN_WASM_KEY="):
                ROTATED_KEY = line.split("=", 1)[1].strip()
        if ROTATED_KEY:
            print("      minted new key + re-encrypted wasm ✓ (uploads below)")
        else:
            print("      ! no key produced — keeping existing encryption")
            print("      ", (res.stdout or "")[-200:], (res.stderr or "")[-200:])
    except Exception as e:
        print(f"      ! rotate skipped ({e}) — keeping existing encryption")

# Patterns we never upload (cwd-relative). Order: directories first.
EXCLUDES = {
    "node_modules",
    ".next",
    ".git",
    ".vercel",
    "out",
    "dist",
    ".next-build", # zero-downtime side build dir (server-only)
    "target",      # Rust/wasm build output (lib/ai/wasm/target, ~68M) — never ship
    "pkg-node",    # wasm-pack node test build — never ship (browser uses pkg/)
    "_models_plain",  # DEV plaintext model weights — only the .enc ships
    "_ai_secret.txt", # the AI master key — NEVER ship the raw file (it's seeded into .env)
    "_hf_token.txt",  # Hugging Face write token — local-only; never leaves this machine
    "_hf_push.py",    # one-off HF upload util — no need on the server
    "tsconfig.tsbuildinfo",
    ".tool-wasm-key.dev",  # ephemeral DEV worker key — never ship (server mints its own)
    "protected",   # public/protected/*.enc — regenerated on the server with the real key
    "jsquash",     # public/jsquash/* — regenerated on the server by copy-jsquash
    ".env",
    ".env.local",
    ".env.production",
    ".env.deploy.local",
    ".DS_Store",
}


def excluded(rel: str) -> bool:
    parts = rel.replace("\\", "/").split("/")
    base = parts[-1]
    # Never ship local model weights / large binaries used only for dev testing,
    # nor throwaway debug scratch (`_test_*.ts`, `_*.py` one-offs) sitting in the
    # tree — they aren't part of the app and can break the remote `next build`
    # typecheck (tsconfig includes **/*.ts).
    if base.startswith("_test_") or (base.startswith("_") and base.endswith(".py")):
        return True
    return any(p in EXCLUDES for p in parts) or rel.endswith((".log", ".gguf", ".onnx", ".bin"))


def open_ssh():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    return ssh


def run(ssh, cmd, t=600, label=None, quiet=False):
    """Run cmd in `bash -c` with pipefail so piping through tail still
    surfaces real exit codes. If `quiet=True` we don't print stdout
    (used for noisy commands like `pm2 jlist` that dump every env var)."""
    if label:
        print(f"\n>>> {label}")
    print(f"    $ {cmd}")
    # Only wrap commands that actually pipe — otherwise bash -c eats single
    # quotes around SQL literals.
    needs_pipefail = "|" in cmd and "pipefail" not in cmd
    wrapped = f"bash -c \"set -o pipefail; {cmd}\"" if needs_pipefail else cmd
    si, so, se = ssh.exec_command(wrapped, timeout=60, get_pty=False)
    # Deadline-bounded streaming read. paramiko's so.read()/recv_exit_status()
    # block FOREVER if the remote step hangs (the `timeout=` above only bounds
    # channel-open, not execution) — which once stalled a whole deploy. Poll the
    # channel with a wall-clock deadline and abort the step if it's exceeded.
    chan = so.channel
    deadline = time.time() + t
    out_chunks, err_chunks = [], []
    while True:
        while chan.recv_ready():
            out_chunks.append(chan.recv(65536))
        while chan.recv_stderr_ready():
            err_chunks.append(chan.recv_stderr(65536))
        if chan.exit_status_ready() and not chan.recv_ready() and not chan.recv_stderr_ready():
            break
        if time.time() > deadline:
            try: chan.close()
            except Exception: pass
            print(f"  err ! step exceeded {t}s wall-clock — aborting (no progress from server)")
            return 124, "".join(c.decode("utf-8", "replace") for c in out_chunks), "client-side timeout"
        time.sleep(0.1)
    while chan.recv_ready():
        out_chunks.append(chan.recv(65536))
    while chan.recv_stderr_ready():
        err_chunks.append(chan.recv_stderr(65536))
    out = b"".join(out_chunks).decode("utf-8", "replace")
    err = b"".join(err_chunks).decode("utf-8", "replace")
    rc = chan.recv_exit_status()
    if not quiet and out.strip():
        for line in out.rstrip().splitlines():
            print(f"      {line}")
    if err.strip():
        # Filter Caddy adapter logs that show up on stderr but aren't errors.
        for line in err.rstrip().splitlines():
            if line.startswith('{"level":"info"') or line.startswith('{"level":"warn"'):
                continue
            print(f"  err {line}")
    return rc, out, err


def remote_exists(sftp, path: str) -> bool:
    try:
        sftp.stat(path)
        return True
    except FileNotFoundError:
        return False


def mkdir_p(sftp, path):
    parts = path.split("/")
    cur = ""
    for p in parts:
        if not p:
            cur = "/"
            continue
        cur = posixpath.join(cur, p)
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)


def upload_tar(ssh, sftp, local: Path, remote: str):
    """Fast upload: build ONE gzipped tarball locally (respecting EXCLUDES) and
    extract it on the server. One transfer instead of ~660 per-file SFTP
    round-trips — turns a 15-minute upload into seconds. Falls back to nothing;
    if tar isn't available remotely the extract step surfaces an error."""
    import tarfile, tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False)
    tmp.close()
    count = 0
    try:
        with tarfile.open(tmp.name, "w:gz") as tar:
            for root, dirs, files in os.walk(local):
                rel_root = os.path.relpath(root, local).replace("\\", "/")
                rel_root = "" if rel_root == "." else rel_root
                dirs[:] = [d for d in dirs if not excluded(f"{rel_root}/{d}" if rel_root else d)]
                for fname in files:
                    rel = f"{rel_root}/{fname}" if rel_root else fname
                    if excluded(rel):
                        continue
                    tar.add(os.path.join(root, fname), arcname=rel)
                    count += 1
        size_mb = os.path.getsize(tmp.name) / (1024 * 1024)
        print(f"      packed {count} files into {size_mb:.1f} MB tarball")
        mkdir_p(sftp, remote)
        remote_tar = posixpath.join(remote, ".deploy.tar.gz")
        sftp.put(tmp.name, remote_tar)
        print("      uploaded tarball, extracting on server ...")
        rc, _, _ = run(ssh, f"cd {remote} && tar xzf .deploy.tar.gz && rm -f .deploy.tar.gz",
                       label="extract tarball", t=300)
        if rc != 0:
            print("      ! extract failed")
            sys.exit(1)
    finally:
        try: os.unlink(tmp.name)
        except OSError: pass


def upload_dir(sftp, local: Path, remote: str):
    """Legacy per-file upload (slow). Kept as a fallback; upload_tar is used."""
    pushed = 0
    skipped = 0
    for root, dirs, files in os.walk(local):
        # Filter dirs in-place so os.walk doesn't descend into excluded
        rel_root = os.path.relpath(root, local).replace("\\", "/")
        rel_root = "" if rel_root == "." else rel_root
        dirs[:] = [d for d in dirs if not excluded(f"{rel_root}/{d}" if rel_root else d)]
        # Mirror dir on remote
        if rel_root:
            remote_dir = posixpath.join(remote, rel_root)
            mkdir_p(sftp, remote_dir)
        else:
            remote_dir = remote
            mkdir_p(sftp, remote_dir)

        for fname in files:
            rel = f"{rel_root}/{fname}" if rel_root else fname
            if excluded(rel):
                skipped += 1
                continue
            local_path = os.path.join(root, fname)
            remote_path = posixpath.join(remote_dir, fname)
            sftp.put(local_path, remote_path)
            pushed += 1
            if pushed % 25 == 0:
                print(f"      uploaded {pushed} files ...")
    print(f"      uploaded {pushed} files (skipped {skipped})")


def preflight(ssh):
    print("\n========== PRE-FLIGHT ==========")
    # Use `pm2 list` (table) instead of `jlist` (JSON with full env dump)
    # so we don't echo other tenants' secrets into the deploy log.
    rc, out, _ = run(ssh, "pm2 list --no-color 2>&1", label="PM2 processes")
    needed = ["translation-lab", "traxlate-web"]
    for name in needed:
        if name in out:
            print(f"      ✓ {name} present")
        else:
            print(f"      ! {name} NOT FOUND — aborting to avoid breaking it")
            sys.exit(1)
    # Make sure 3001 isn't taken by anyone other than the existing newxonvert
    # PM2 process. ss shows the binary name (e.g. 'next-server'), not the PM2
    # display name, so cross-reference the PID.
    rc, port_out, _ = run(ssh, f"ss -tlnp 2>/dev/null | grep ':{LOCAL_PORT}' || true",
                          label=f"Port {LOCAL_PORT} availability")
    if port_out.strip():
        import re
        pid_match = re.search(r"pid=(\d+)", port_out)
        if pid_match:
            port_pid = pid_match.group(1)
            rc, pm2_out, _ = run(
                ssh,
                f"pm2 pid {PM2_NAME} 2>/dev/null | tr -d '[:space:]'",
                label=f"PM2 pid for {PM2_NAME}",
            )
            if pm2_out.strip() != port_pid:
                print(f"      ! port {LOCAL_PORT} is held by pid {port_pid}, not the {PM2_NAME} pid ({pm2_out.strip()})")
                sys.exit(1)
            print(f"      ✓ port {LOCAL_PORT} owned by {PM2_NAME} (pid {port_pid})")


def ensure_db(ssh):
    print("\n========== POSTGRES DB ==========")
    # Always ensure role + password are consistent (idempotent).
    run(
        ssh,
        "sudo -u postgres psql -c \"DO \\$\\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='newxonvert') THEN CREATE ROLE newxonvert LOGIN PASSWORD 'nx_pw_change_me'; END IF; END \\$\\$;\"",
        label="ensure role",
    )
    run(
        ssh,
        "sudo -u postgres psql -c \"ALTER ROLE newxonvert WITH LOGIN PASSWORD 'nx_pw_change_me';\"",
        label="set role password",
    )
    # Create DB if missing.
    rc, out, _ = run(
        ssh,
        "sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname='newxonvert';\"",
        label="check db exists",
    )
    if "1" not in out:
        run(
            ssh,
            "sudo -u postgres psql -c \"CREATE DATABASE newxonvert OWNER newxonvert;\"",
            label="create newxonvert db",
        )
    run(
        ssh,
        "sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE newxonvert TO newxonvert;\"",
        label="grant db",
    )
    run(
        ssh,
        "sudo -u postgres psql -d newxonvert -c \"GRANT ALL ON SCHEMA public TO newxonvert;\"",
        label="grant schema",
    )


# Secrets (Stripe/Google/NOWPayments + NEXTAUTH_SECRET) live ONLY in this
# gitignored file — never hardcoded here. Built from France via _build_secrets_file.py.
SECRETS_FILE = PROJECT / ".env.deploy.local"

# Keys we expect for full billing + OAuth. Reported (present/missing) on deploy.
_REQUIRED_SECRETS = (
    "NEXTAUTH_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRO_PRICE_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
    "NOWPAYMENTS_API_KEY",
)


def load_deploy_secrets():
    """Read KEY=VALUE pairs from the gitignored .env.deploy.local (if present)."""
    out = {}
    if not SECRETS_FILE.exists():
        print(f"      WARNING: {SECRETS_FILE.name} not found — billing/OAuth will be DISABLED.")
        return out
    for line in SECRETS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def write_remote_env(sftp):
    print("\n========== WRITING REMOTE .env ==========")
    # Deploy-managed infra defaults. The gitignored secrets file overrides/extends
    # these (NEXTAUTH_SECRET, STRIPE_*, GOOGLE_*, NOWPAYMENTS_*).
    base = {
        "DATABASE_URL":
            "postgresql://newxonvert:nx_pw_change_me@127.0.0.1:5432/newxonvert?schema=public",
        "NEXTAUTH_URL": f"https://{PUBLIC_HOST}",
        "NEXT_BASE_PATH": BASE_PATH,
        "NEXT_PUBLIC_BASE_PATH": BASE_PATH,
        "ICELAND_GPU_URL": "",
        "ICELAND_GPU_TOKEN": "",
    }
    merged = {**base, **load_deploy_secrets()}  # secrets win
    if ROTATED_KEY:  # this deploy's fresh key wins over any stored one
        merged["BRAIN_WASM_KEY"] = ROTATED_KEY
    if TOOL_KEY:  # fresh tool-worker key (must match what the server build encrypts with)
        merged["TOOL_WASM_KEY"] = TOOL_KEY

    present = [k for k in _REQUIRED_SECRETS if merged.get(k)]
    missing = [k for k in _REQUIRED_SECRETS if not merged.get(k)]
    print(f"      secrets present: {', '.join(present) or 'NONE'}")
    if missing:
        print(f"      secrets MISSING:  {', '.join(missing)}  <-- those features stay off")

    body = ("\n".join(f"{k}={v}" for k, v in merged.items()) + "\n").encode("utf-8")
    remote_env = posixpath.join(REMOTE_DIR, ".env")
    with sftp.open(remote_env, "wb") as f:
        f.write(body)
    sftp.chmod(remote_env, 0o600)
    print(f"      wrote {remote_env} ({len(merged)} keys)")


# new.xonvert.com is RETIRED — it was the temporary staging hostname. We now
# serve the app only on the primary domain (xonvert.com) and keep new.xonvert.com
# as a 301 redirect so any old bookmarked links still resolve.
CADDY_NEW_HOST_BLOCK = """
# new.xonvert.com retired → 301 to the primary domain
{host} {{
    redir https://{primary}{{uri}} permanent
}}

""".strip("\n").format(host=PUBLIC_HOST, primary=PRIMARY_HOST)


# Primary domain block — Cloudflare Origin Cert (not ACME). Covers apex + www.
CADDY_PRIMARY_BLOCK = """
# Xonvert 2026 — primary domain (Cloudflare-proxied; Origin Cert, Full strict)
{host}, www.{host} {{
    tls {cert} {key}
    encode zstd gzip
    reverse_proxy 127.0.0.1:{port} {{
        header_up Host {{host}}
        header_up X-Forwarded-Proto {{scheme}}
    }}
}}
""".strip("\n").format(host=PRIMARY_HOST, port=LOCAL_PORT, cert=ORIGIN_CERT, key=ORIGIN_KEY)

# Idempotency markers (PRIMARY_HOST is a substring of PUBLIC_HOST, so we match
# on the unique comment lines rather than the bare hostname).
_NEW_MARKER = "Xonvert 2026 — public test hostname"
_PRIMARY_MARKER = "Xonvert 2026 — primary domain"


def upload_origin_cert(ssh, sftp):
    """Upload the Cloudflare Origin Cert + key (gitignored local certs/).
    Returns True if the primary-domain TLS block can be served."""
    cert = PROJECT / "certs" / "origin.pem"
    key = PROJECT / "certs" / "origin.key"
    if not (cert.exists() and key.exists()):
        print(f"      WARNING: certs/origin.pem or origin.key missing locally — "
              f"skipping {PRIMARY_HOST} block (it would fail TLS).")
        return False
    # Caddy runs as an unprivileged user that cannot read /root. Place certs in
    # /etc/caddy/certs owned by the caddy user (cert 0644, key 0600).
    caddy_user = (run(ssh, "systemctl show -p User --value caddy", quiet=True)[1] or "caddy").strip() or "caddy"
    run(ssh, f"mkdir -p {REMOTE_CERT_DIR}", label="mkdir certs dir", quiet=True)
    for src, dst in ((cert, ORIGIN_CERT), (key, ORIGIN_KEY)):
        sftp.put(str(src), dst)
    run(ssh, f"chown -R {caddy_user}:{caddy_user} {REMOTE_CERT_DIR} && "
             f"chmod 755 {REMOTE_CERT_DIR} && chmod 644 {ORIGIN_CERT} && chmod 600 {ORIGIN_KEY}",
        label="set cert ownership", quiet=True)
    print(f"      uploaded Origin Cert + key to {REMOTE_CERT_DIR}/ (owner {caddy_user}, key 0600)")
    return True


def ensure_caddy_route(ssh, sftp, serve_primary):
    print("\n========== CADDY ROUTE ==========")
    caddyfile = "/etc/caddy/Caddyfile"
    with sftp.open(caddyfile, "r") as f:
        body = f.read().decode("utf-8")

    # Append site blocks at the END. The Caddyfile begins with a global-options
    # block ({ email ... }) which Caddy requires to be FIRST — never prepend a
    # site block above it. Site blocks may appear in any order after it.
    # Match the staging block by hostname, not by comment: the live block was
    # hand-added after an earlier Caddy hiccup and has no marker, so a
    # marker-only check would append a duplicate → "ambiguous site definition".
    if PUBLIC_HOST not in body:
        body = body.rstrip() + "\n\n" + CADDY_NEW_HOST_BLOCK + "\n"
    if serve_primary and _PRIMARY_MARKER not in body:
        body = body.rstrip() + "\n\n" + CADDY_PRIMARY_BLOCK + "\n"

    ts = time.strftime("%Y%m%d-%H%M%S")
    run(ssh, f"cp -a {caddyfile} {caddyfile}.bak_xonvert_{ts}", label="backup Caddyfile")
    with sftp.open(caddyfile, "w") as f:
        f.write(body)
    print(f"      wrote updated Caddyfile (will serve https://{PUBLIC_HOST})")

    rc, _, _ = run(ssh, "caddy validate --config /etc/caddy/Caddyfile", label="validate")
    if rc != 0:
        print("      ! caddy validate failed — restoring backup")
        run(ssh, f"cp -a {caddyfile}.bak_xonvert_{ts} {caddyfile}")
        sys.exit(1)
    run(ssh, "systemctl reload caddy", label="reload caddy")


def main():
    print("=" * 70)
    print(" DEPLOY: newxonvert -> Iceland (subpath /xonvert) ")
    print("=" * 70)

    ssh = open_ssh()
    sftp = ssh.open_sftp()

    preflight(ssh)
    ensure_db(ssh)

    rotate_brain_key()  # re-encrypt with a fresh key BEFORE upload
    mint_tool_key()     # fresh tool-worker key; server build encrypts with it

    print("\n========== UPLOADING SOURCE ==========")
    mkdir_p(sftp, REMOTE_DIR)
    upload_tar(ssh, sftp, PROJECT, REMOTE_DIR)
    write_remote_env(sftp)

    print("\n========== INSTALL + BUILD ==========")
    # First run uses `npm install` to create the lock file; subsequent
    # deploys upload the lock and we could switch to `npm ci` for speed.
    install_cmd = "npm ci" if remote_exists(sftp, posixpath.join(REMOTE_DIR, "package-lock.json")) else "npm install"
    # --include=dev: the prebuild (encrypt-workers.mjs) needs esbuild, a devDependency.
    # Force it even if the server shell has NODE_ENV=production (which would skip devDeps).
    rc, _, _ = run(ssh, f"cd {REMOTE_DIR} && {install_cmd} --include=dev --no-audit --no-fund",
                   t=1200, label=install_cmd)
    if rc != 0:
        print("      ! install failed")
        sys.exit(1)
    rc, _, _ = run(ssh, f"cd {REMOTE_DIR} && npx prisma db push --skip-generate",
                   t=180, label="prisma db push")
    if rc != 0:
        print("      ! prisma db push failed")
        sys.exit(1)
    rc, _, _ = run(ssh, f"cd {REMOTE_DIR} && npx prisma generate",
                   t=180, label="prisma generate")
    if rc != 0:
        print("      ! prisma generate failed")
        sys.exit(1)
    # Stop PM2 BEFORE wiping .next, then full clean rebuild. This avoids the
    # "Next serves stale prerendered chunks from in-memory cache" bug we hit
    # when basePath changed between builds.
    # ZERO-DOWNTIME BUILD: build into a SIDE dir (.next-build) while PM2 keeps
    # serving the live .next. A failed build then changes NOTHING — the site
    # stays up on the old build. Only on success do we swap + restart, so the
    # only downtime is the PM2 restart itself (seconds), not the whole build.
    # OBFUSCATE=1 = worker-safe obfuscation (hex renaming + compact, minify off;
    # stringArray/selfDefending/domainLock stay off — they break blob workers).
    run(ssh, f"rm -rf {REMOTE_DIR}/.next-build", label="clean stale .next-build")
    # TOOL_WASM_KEY is passed into the build so prebuild's encrypt-workers.mjs
    # encrypts the engine workers with the SAME key written to the remote .env.
    tool_key_env = f"TOOL_WASM_KEY={TOOL_KEY} " if TOOL_KEY else ""
    rc, _, _ = run(ssh, f"cd {REMOTE_DIR} && {tool_key_env}OBFUSCATE=1 NEXT_BASE_PATH={BASE_PATH} NEXT_DIST_DIR=.next-build npm run build",
                   t=5400, label="next build (side dir — live site stays up)")  # CPU box + obfuscation + worker-encrypt prebuild + AI bundle chunking
    if rc != 0:
        # `next build` can finish writing a COMPLETE .next-build and then fail to
        # exit its own process (lingering jest-workers / open handles), so run()
        # hits its wall-clock cap (rc 124) even though the build itself succeeded.
        # We just cleaned .next-build above, so any BUILD_ID present now was
        # written by THIS build — if the final artifacts exist, treat it as done.
        _, art, _ = run(
            ssh,
            f"test -f {REMOTE_DIR}/.next-build/BUILD_ID "
            f"&& test -f {REMOTE_DIR}/.next-build/required-server-files.json "
            f"&& test -f {REMOTE_DIR}/.next-build/routes-manifest.json "
            f"&& echo BUILD_OK || echo BUILD_INCOMPLETE",
            label="verify build artifacts (process did not exit cleanly)",
        )
        if "BUILD_OK" not in art:
            print("\n      ! build failed — site UNTOUCHED, still live on the old build")
            run(ssh, f"rm -rf {REMOTE_DIR}/.next-build", label="clean failed build")
            sys.exit(1)
        print("      build artifacts complete despite non-zero exit — continuing")

    print("\n========== SWAP + PM2 ==========")
    # Stop → atomically swap the fresh build in → restart. Fresh .next + fresh
    # process avoids the stale-prerendered-chunk bug a build-in-place can cause.
    run(ssh, f"cd {REMOTE_DIR} && pm2 stop {PM2_NAME} 2>/dev/null || true && rm -rf .next && mv .next-build .next",
        label="swap in new build")
    # Use pm2 list (table) rather than jlist (JSON env dump) to keep
    # other tenants' secrets out of the deploy log.
    # Always re-register the process — covers fresh installs AND ensures
    # ecosystem.config changes (env, args) take effect.
    rc, out, _ = run(ssh, "pm2 list --no-color 2>&1", label="pm2 list", quiet=True)
    if PM2_NAME in out:
        run(ssh, f"pm2 delete {PM2_NAME} 2>&1 || true", label="pm2 delete (clean reset)")
    run(ssh, f"cd {REMOTE_DIR} && pm2 start ecosystem.config.js", label="pm2 start")
    run(ssh, "pm2 save", label="pm2 save")

    serve_primary = upload_origin_cert(ssh, sftp)
    ensure_caddy_route(ssh, sftp, serve_primary)

    print("\n========== SMOKE TEST ==========")
    time.sleep(3)
    run(ssh, f"curl -sS -o /dev/null -w 'HTTP %{{http_code}} (%{{size_download}} bytes)\\n' http://127.0.0.1:{LOCAL_PORT}/",
        label="GET / (direct to PM2)")
    run(ssh, f"curl -sS -o /dev/null -w 'HTTP %{{http_code}}\\n' -H 'Host: {PUBLIC_HOST}' http://127.0.0.1/",
        label=f"GET / with Host: {PUBLIC_HOST}")
    # Let's Encrypt cert issuance can take 10-30s on first request — give it a moment.
    run(ssh, f"curl -sSI --max-time 30 https://{PUBLIC_HOST}/ | head -1",
        label=f"HTTPS check https://{PUBLIC_HOST}/")
    if serve_primary:
        # Verify the Origin Cert serves locally (resolve apex to the origin so we
        # bypass Cloudflare and test Caddy directly).
        # -k: CF Origin Certs aren't publicly trusted (only CF trusts them), so
        # skip local trust verification — we just confirm Caddy serves 200 here.
        run(ssh, f"curl -skSI --max-time 30 --resolve {PRIMARY_HOST}:443:127.0.0.1 https://{PRIMARY_HOST}/ | head -1",
            label=f"HTTPS check origin https://{PRIMARY_HOST}/ (Caddy serving cert?)")
    run(ssh, f"pm2 describe {PM2_NAME} | grep -E 'status|uptime|restarts' | head -5",
        label="pm2 describe")

    sftp.close()
    ssh.close()

    print("\n" + "=" * 70)
    target = PRIMARY_HOST if serve_primary else PUBLIC_HOST
    print(f"  DONE.  Open https://{target}/  ")
    print("=" * 70)


if __name__ == "__main__":
    main()
