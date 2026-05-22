"""Inspect server state after deploy to figure out the 404 + cert situation."""
import paramiko
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("194.247.182.248", username="root", password="D%G%CimhX5", timeout=15)


def run(cmd):
    _, so, se = ssh.exec_command(cmd, timeout=30)
    return so.read().decode("utf-8", "replace"), se.read().decode("utf-8", "replace")


for label, cmd in [
    ("BUILD ID", "cat /root/newxonvert/.next/BUILD_ID 2>&1"),
    ("Routes manifest (basePath?)", "grep -o '\"basePath\":[^,}]*' /root/newxonvert/.next/routes-manifest.json 2>&1 | head -1"),
    ("Prerender manifest top", "head -1 /root/newxonvert/.next/prerender-manifest.json 2>&1 | head -c 500"),
    ("Pages built", "ls /root/newxonvert/.next/server/app/ 2>&1"),
    (".env on server", "cat /root/newxonvert/.env 2>&1"),
    ("PM2 out log last 25", "tail -25 /root/.pm2/logs/newxonvert-out.log"),
    ("PM2 err log last 25", "tail -25 /root/.pm2/logs/newxonvert-error.log"),
    ("Caddy data (cert)", "ls /var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/ 2>&1"),
    ("Caddy logs", "journalctl -u caddy --since '5 minutes ago' --no-pager | tail -40"),
    ("HEAD via Host header", "curl -sI -H 'Host: new.xonvert.com' http://127.0.0.1/ 2>&1"),
    ("HEAD direct 3001 with Host", "curl -sI -H 'Host: new.xonvert.com' http://127.0.0.1:3001/ 2>&1"),
]:
    print(f"\n--- {label} ---")
    out, err = run(cmd)
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(f"[stderr] {err.rstrip()}")

ssh.close()
