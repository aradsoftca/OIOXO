"""Read the Caddyfile so we add /xonvert routing cleanly."""
import paramiko
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("194.247.182.248", username="root", password="D%G%CimhX5", timeout=15)


def run(cmd, t=30):
    si, so, se = ssh.exec_command(cmd, timeout=t)
    return so.read().decode("utf-8", "replace"), se.read().decode("utf-8", "replace")


for title, cmd in [
    ("Caddy binary version", "caddy version 2>&1"),
    ("Caddyfile location", "ls -la /etc/caddy/ 2>&1; ls -la /root/ | grep -i caddy 2>&1"),
    ("Caddyfile content", "cat /etc/caddy/Caddyfile 2>&1"),
    ("Caddy service file", "systemctl cat caddy 2>&1 | head -30"),
    ("Caddy auto-cert dir", "ls /var/lib/caddy 2>&1 | head"),
    ("Translation-lab nginx-style cfg", "cat /etc/nginx/sites-enabled/translation-lab 2>&1 | head -40"),
]:
    print(f"\n--- {title} ---")
    out, err = run(cmd)
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(f"[stderr] {err.rstrip()}")

ssh.close()
