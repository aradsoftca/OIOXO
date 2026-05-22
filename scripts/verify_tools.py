"""Walk every tool in the registry and HTTP-check its page on the deploy.

Run after a deploy to catch any tool whose UI bundle fails to import.
"""
import paramiko
import sys
import io
import re
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("194.247.182.248", username="root", password="D%G%CimhX5", timeout=15)


def run(cmd):
    _, so, se = ssh.exec_command(cmd, timeout=30)
    return so.read().decode("utf-8", "replace"), se.read().decode("utf-8", "replace")


# Read the manifest list off disk so we don't have to maintain it twice.
registry_path = Path(__file__).resolve().parents[1] / "lib" / "registry" / "index.ts"
ids = re.findall(r"@/tools/([a-z0-9-]+)/manifest", registry_path.read_text(encoding="utf-8"))

print(f"Verifying {len(ids)} tool pages via https://new.xonvert.com\n")

# A couple of static routes too
ROUTES = ["/", "/tools", "/convert", "/sitemap.xml", "/robots.txt"] + [f"/tools/{i}" for i in ids]

ok = 0
fail = 0
for path in ROUTES:
    url = f"https://new.xonvert.com{path}"
    out, _ = run(f"curl -sL -o /dev/null -w '%{{http_code}} %{{size_download}}' '{url}'")
    code, _, size = out.partition(" ")
    label = path or "/"
    status = "✓" if code == "200" else "✗"
    if code == "200":
        ok += 1
    else:
        fail += 1
    print(f"  {status} {code:>3} {size:>7}b   {label}")

ssh.close()
print(f"\n{ok}/{len(ROUTES)} OK, {fail} failed")
