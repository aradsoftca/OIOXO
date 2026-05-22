"""Smoke test the deployed app — follow redirects and report HTML size."""
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
    ("HEAD direct /xonvert", "curl -sI http://127.0.0.1:3001/xonvert"),
    ("HEAD direct /xonvert/", "curl -sI http://127.0.0.1:3001/xonvert/"),
    ("HEAD direct /xonvert/tools", "curl -sI http://127.0.0.1:3001/xonvert/tools"),
    ("HEAD via caddy /xonvert/", "curl -sI http://127.0.0.1/xonvert/"),
    ("HEAD root /", "curl -sI http://127.0.0.1/"),
    ("FOLLOW /xonvert/ via caddy", "curl -sL -o /dev/null -w 'final: %{url_effective}\\nHTTP %{http_code}\\nsize %{size_download}\\n' http://127.0.0.1/xonvert/"),
    ("PM2 log tail (newxonvert)", "tail -30 /root/.pm2/logs/newxonvert-out.log"),
    ("PM2 err tail (newxonvert)", "tail -30 /root/.pm2/logs/newxonvert-error.log"),
]:
    print(f"\n--- {label} ---")
    out, err = run(cmd)
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(f"[stderr] {err.rstrip()}")

ssh.close()
