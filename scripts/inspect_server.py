"""Inspect the Iceland server before deploying.

Reads nginx config, port usage, Node version, disk space.
Read-only — no changes.
"""
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


print("=" * 70)
print(" ICELAND SERVER INSPECTION ")
print("=" * 70)

sections = [
    ("OS + kernel", "uname -a && cat /etc/os-release | head -5"),
    ("Node + npm", "which node && node -v && which npm && npm -v"),
    ("PM2 list", "pm2 list 2>&1 | head -40"),
    ("Open ports (3001 area)", "ss -tlnp 2>/dev/null | grep -E ':(3000|3001|3002|3003|8011|80|443)' || netstat -tlnp 2>/dev/null | head"),
    ("Nginx config files", "ls /etc/nginx/sites-enabled/ 2>/dev/null; ls /etc/nginx/conf.d/ 2>/dev/null"),
    ("Nginx default vhost", "cat /etc/nginx/sites-enabled/default 2>/dev/null || cat /etc/nginx/conf.d/default.conf 2>/dev/null | head -60"),
    ("Nginx test", "nginx -t 2>&1"),
    ("Disk space", "df -h / | tail -1"),
    ("Free RAM", "free -h | head -2"),
    ("GPU current", "nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader 2>&1"),
    ("Existing /root content", "ls /root/ | head -20"),
    ("Postgres available?", "which psql 2>&1; systemctl is-active postgresql 2>&1"),
]

for title, cmd in sections:
    print(f"\n--- {title} ---")
    out, err = run(cmd)
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(f"[stderr] {err.rstrip()}")

ssh.close()
print("\n" + "=" * 70)
print(" INSPECTION COMPLETE ")
print("=" * 70)
