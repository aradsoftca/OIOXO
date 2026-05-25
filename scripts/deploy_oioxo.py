"""Deploy the SEPARATE oioxo instance to Iceland — isolated from live xonvert.

Same codebase, second process: /root/oioxo on port 3002, PM2 name `oioxo`, its
own Postgres DB `oioxo`, Caddy serving oioxo.com. The live `newxonvert` process
(/root/newxonvert, :3001, xonvert.com) is NEVER touched.

Reuses the proven helpers from deploy.py; only the targets differ. Zero-downtime
side-dir build. Safe to re-run.

  python scripts/deploy_oioxo.py
"""
import base64
import os
import posixpath
import sys
import time

# Reuse the battle-tested helpers (host/ssh/upload/secrets) verbatim.
import deploy  # module ref, for deploy.ROTATED_KEY after rotation
from deploy import (
    open_ssh, run, mkdir_p, remote_exists, upload_tar, load_deploy_secrets, PROJECT,
)


def ensure_oioxo_secrets():
    """Provision the licensing secrets the entitlement gate needs, ONCE, into the
    gitignored .env.deploy.local so they persist across deploys (load_deploy_secrets
    then ships them to the remote .env):
      - OIOXO_ENTITLEMENT_SECRET: signs entitlements. STABLE — rotating it would
        invalidate every issued entitlement, so we generate it once and keep it.
      - OIOXO_PRO_KEY: base64 of 32 bytes; decrypts the Pro brain asset. Stable for
        now (no hosted Pro asset yet); switch to per-deploy rotation + re-encrypt
        (encrypt_asset.mjs) once the conductor weights are served.
    """
    print("\n========== OIOXO LICENSING SECRETS ==========")
    secrets_file = PROJECT / ".env.deploy.local"
    existing = secrets_file.read_text(encoding="utf-8") if secrets_file.exists() else ""
    have = {ln.split("=", 1)[0].strip() for ln in existing.splitlines() if "=" in ln and not ln.strip().startswith("#")}
    add = []
    if "OIOXO_ENTITLEMENT_SECRET" not in have:
        add.append(("OIOXO_ENTITLEMENT_SECRET", base64.urlsafe_b64encode(os.urandom(48)).decode().rstrip("=")))
    if "OIOXO_PRO_KEY" not in have:
        add.append(("OIOXO_PRO_KEY", base64.b64encode(os.urandom(32)).decode()))
    if add:
        with secrets_file.open("a", encoding="utf-8") as f:
            if existing and not existing.endswith("\n"):
                f.write("\n")
            for k, v in add:
                f.write(f"{k}={v}\n")
        print(f"      generated {', '.join(k for k, _ in add)} → {secrets_file.name} (stable, gitignored)")
    else:
        print("      entitlement secrets already present ✓")

REMOTE_DIR = "/root/oioxo"
PM2_NAME = "oioxo"
LOCAL_PORT = 3002
PUBLIC_HOST = "oioxo.com"
DB_NAME = "oioxo"           # isolated DB — never touches the xonvert data
DB_ROLE = "newxonvert"      # reuse the existing role (no new creds)
DB_PASS = "nx_pw_change_me"

# Don't disturb these — abort if a neighbor is missing.
NEIGHBORS = ["translation-lab", "traxlate-web", "newxonvert"]

CADDY_OIOXO_BLOCK = f"""
# oioxo — platform instance (auto-HTTPS via Let's Encrypt; isolated from xonvert)
{PUBLIC_HOST} {{
    encode zstd gzip
    reverse_proxy 127.0.0.1:{LOCAL_PORT} {{
        header_up Host {{host}}
        header_up X-Forwarded-Proto {{scheme}}
    }}
}}
""".strip("\n")


def preflight(ssh):
    print("\n========== PRE-FLIGHT (oioxo) ==========")
    rc, out, _ = run(ssh, "pm2 list --no-color 2>&1", label="PM2 processes")
    for name in NEIGHBORS:
        if name in out:
            print(f"      ✓ {name} present")
        else:
            print(f"      ! {name} NOT FOUND — aborting to avoid breaking the box")
            sys.exit(1)
    # Port 3002 must be free or already owned by our own oioxo process.
    rc, port_out, _ = run(ssh, f"ss -tlnp 2>/dev/null | grep ':{LOCAL_PORT}' || true",
                          label=f"Port {LOCAL_PORT} availability")
    if port_out.strip():
        import re
        m = re.search(r"pid=(\d+)", port_out)
        if m:
            _, pm2_out, _ = run(ssh, f"pm2 pid {PM2_NAME} 2>/dev/null | tr -d '[:space:]'",
                                label=f"PM2 pid for {PM2_NAME}")
            if pm2_out.strip() != m.group(1):
                print(f"      ! port {LOCAL_PORT} held by pid {m.group(1)}, not {PM2_NAME} — aborting")
                sys.exit(1)
            print(f"      ✓ port {LOCAL_PORT} owned by {PM2_NAME}")


def ensure_db(ssh):
    print("\n========== POSTGRES DB (oioxo) ==========")
    # Role already exists from the xonvert deploy; only ensure the isolated DB.
    rc, out, _ = run(ssh, f"sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname='{DB_NAME}';\"",
                     label="check oioxo db")
    if "1" not in out:
        run(ssh, f"sudo -u postgres psql -c \"CREATE DATABASE {DB_NAME} OWNER {DB_ROLE};\"", label="create oioxo db")
    run(ssh, f"sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE {DB_NAME} TO {DB_ROLE};\"", label="grant db")
    run(ssh, f"sudo -u postgres psql -d {DB_NAME} -c \"GRANT ALL ON SCHEMA public TO {DB_ROLE};\"", label="grant schema")


def write_env(sftp):
    print("\n========== WRITING REMOTE .env (oioxo) ==========")
    base = {
        "DATABASE_URL": f"postgresql://{DB_ROLE}:{DB_PASS}@127.0.0.1:5432/{DB_NAME}?schema=public",
        "NEXTAUTH_URL": f"https://{PUBLIC_HOST}",
        "NEXT_BASE_PATH": "",
        "NEXT_PUBLIC_BASE_PATH": "",
        # Rebrand this instance to oioxo at build time (xonvert build leaves these unset).
        "NEXT_PUBLIC_BRAND": "oioxo",
        "NEXT_PUBLIC_BRAND_DOMAIN": PUBLIC_HOST,
        "ICELAND_GPU_URL": "",
        "ICELAND_GPU_TOKEN": "",
    }
    merged = {**base, **load_deploy_secrets()}
    if deploy.ROTATED_KEY:  # this deploy's fresh WASM key wins over the stored one
        merged["BRAIN_WASM_KEY"] = deploy.ROTATED_KEY
    body = ("\n".join(f"{k}={v}" for k, v in merged.items()) + "\n").encode("utf-8")
    remote_env = posixpath.join(REMOTE_DIR, ".env")
    with sftp.open(remote_env, "wb") as f:
        f.write(body)
    sftp.chmod(remote_env, 0o600)
    print(f"      wrote {remote_env} ({len(merged)} keys, DB={DB_NAME})")


def ensure_caddy(ssh, sftp):
    print("\n========== CADDY ROUTE (oioxo.com) ==========")
    caddyfile = "/etc/caddy/Caddyfile"
    with sftp.open(caddyfile, "r") as f:
        body = f.read().decode("utf-8")
    if f"\n{PUBLIC_HOST} " in body or body.startswith(f"{PUBLIC_HOST} ") or f"\n{PUBLIC_HOST}{{" in body:
        print("      oioxo.com block already present — leaving as-is")
    else:
        body = body.rstrip() + "\n\n" + CADDY_OIOXO_BLOCK + "\n"
        ts = time.strftime("%Y%m%d-%H%M%S")
        run(ssh, f"cp -a {caddyfile} {caddyfile}.bak_oioxo_{ts}", label="backup Caddyfile")
        with sftp.open(caddyfile, "w") as f:
            f.write(body)
        rc, _, _ = run(ssh, "caddy validate --config /etc/caddy/Caddyfile", label="validate")
        if rc != 0:
            print("      ! caddy validate failed — restoring backup")
            run(ssh, f"cp -a {caddyfile}.bak_oioxo_{ts} {caddyfile}")
            sys.exit(1)
    run(ssh, "systemctl reload caddy", label="reload caddy")


def main():
    print("=" * 70)
    print(" DEPLOY: oioxo -> Iceland (isolated :3002, oioxo.com) ")
    print("=" * 70)

    ssh = open_ssh()
    sftp = ssh.open_sftp()

    preflight(ssh)
    ensure_db(ssh)

    ensure_oioxo_secrets()     # provision entitlement signing key + Pro content key (stable)
    deploy.rotate_brain_key()  # mint a fresh WASM key + re-encrypt BEFORE upload

    print("\n========== UPLOADING SOURCE ==========")
    mkdir_p(sftp, REMOTE_DIR)
    upload_tar(ssh, sftp, PROJECT, REMOTE_DIR)
    write_env(sftp)

    print("\n========== INSTALL + BUILD ==========")
    install_cmd = "npm ci" if remote_exists(sftp, posixpath.join(REMOTE_DIR, "package-lock.json")) else "npm install"
    rc, _, _ = run(ssh, f"cd {REMOTE_DIR} && {install_cmd} --no-audit --no-fund", t=1200, label=install_cmd)
    if rc != 0:
        print("      ! install failed"); sys.exit(1)
    rc, _, _ = run(ssh, f"cd {REMOTE_DIR} && npx prisma db push --skip-generate", t=180, label="prisma db push")
    if rc != 0:
        print("      ! prisma db push failed"); sys.exit(1)
    rc, _, _ = run(ssh, f"cd {REMOTE_DIR} && npx prisma generate", t=180, label="prisma generate")
    if rc != 0:
        print("      ! prisma generate failed"); sys.exit(1)
    run(ssh, f"rm -rf {REMOTE_DIR}/.next-build", label="clean stale .next-build")
    rc, _, _ = run(ssh, f"cd {REMOTE_DIR} && OBFUSCATE=1 NEXT_BASE_PATH= NEXT_DIST_DIR=.next-build "
                        f"NEXT_PUBLIC_BRAND=oioxo NEXT_PUBLIC_BRAND_DOMAIN={PUBLIC_HOST} npm run build",
                   t=3000, label="next build (side dir, brand=oioxo)")  # CPU box + obfuscation > 20min
    if rc != 0:
        print("      ! build failed — oioxo instance unchanged"); run(ssh, f"rm -rf {REMOTE_DIR}/.next-build"); sys.exit(1)

    print("\n========== SWAP + PM2 ==========")
    run(ssh, f"cd {REMOTE_DIR} && pm2 stop {PM2_NAME} 2>/dev/null || true && rm -rf .next && mv .next-build .next",
        label="swap in new build")
    rc, out, _ = run(ssh, "pm2 list --no-color 2>&1", label="pm2 list", quiet=True)
    if PM2_NAME in out:
        run(ssh, f"pm2 delete {PM2_NAME} 2>&1 || true", label="pm2 delete (clean reset)")
    run(ssh, f"cd {REMOTE_DIR} && pm2 start ecosystem.oioxo.config.js", label="pm2 start oioxo")
    run(ssh, "pm2 save", label="pm2 save")

    ensure_caddy(ssh, sftp)

    print("\n========== SMOKE TEST ==========")
    time.sleep(3)
    run(ssh, f"curl -sS -o /dev/null -w 'HTTP %{{http_code}} (%{{size_download}}b)\\n' http://127.0.0.1:{LOCAL_PORT}/oioxo",
        label="GET /oioxo (direct to PM2)")
    run(ssh, f"curl -sS -o /dev/null -w 'HTTP %{{http_code}}\\n' -H 'Host: {PUBLIC_HOST}' http://127.0.0.1/",
        label=f"GET / with Host: {PUBLIC_HOST} (should rewrite to shell)")
    run(ssh, f"curl -sSI --max-time 30 https://{PUBLIC_HOST}/ | head -1", label=f"HTTPS https://{PUBLIC_HOST}/")
    run(ssh, f"pm2 describe {PM2_NAME} | grep -E 'status|uptime|restarts' | head -5", label="pm2 describe")

    sftp.close(); ssh.close()
    print("\n" + "=" * 70)
    print(f"  DONE.  Open https://{PUBLIC_HOST}/   (xonvert untouched)")
    print("=" * 70)


if __name__ == "__main__":
    main()
