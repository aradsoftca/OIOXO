"""
Expand the oioxo Bergamot repo to Mozilla's FULL language set so translation is
professional in ANY browser (Firefox/Safari/Node), on-device, no server, no 3rd
party. Today our HF repo (payam1394/oioxo-bergamot) hosts only the original ~16
sandbox languages; Mozilla's models cover ~46 (tiny) + high-quality ar/zh/ja/ko/ru
(base) — the major non-European languages our users actually need.

Mozilla stores models in git-LFS, so raw URLs give pointers, not binaries → we
LFS-clone, pick the best tier per pair, re-host on our HF repo, and MERGE the
registry. bergamot.ts then "just works" for the expanded set.

Run on arad or dev (network/disk only, NO GPU — fine alongside training):
  set "HF_TOKEN=<token>"&& C:\science\.venv\Scripts\python1.exe -u expand_bergamot.py
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

REPO = "https://github.com/mozilla/firefox-translations-models"
HF_REPO = "payam1394/oioxo-bergamot"
WORK = "bergamot-src"
STAGE = "bergamot-stage"
HOST = f"https://huggingface.co/{HF_REPO}/resolve/main"

# Prefer 'base' (higher quality) where it exists, else 'tiny'. en<->xx both ways.
BASE = ["ar", "zh", "ja", "ko", "ru", "cs", "de"]
TINY = ("az be bg bn bs ca cs da de el es et fa fi fr gu he hi hr hu id is it kn lt "
        "lv ml ms mt nb nl nn pl pt ro ru sk sl sq sr sv ta te tr uk vi").split()


def sh(*a):
    subprocess.run(a, check=True)


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def lfs_clone():
    if os.path.isdir(WORK):
        return
    # sparse, LFS — only the model dirs we need.
    sh("git", "clone", "--filter=blob:none", "--no-checkout", REPO, WORK)
    sh("git", "-C", WORK, "sparse-checkout", "set", "models/base", "models/tiny")
    sh("git", "-C", WORK, "checkout", "main")  # pulls LFS binaries for the sparse paths


def pick_dir(pair):
    """Return (tier_path) preferring base over tiny for a given pair dir name."""
    for tier in ("base", "tiny"):
        d = os.path.join(WORK, "models", tier, pair)
        if os.path.isdir(d):
            return d
    return None


def files_in(d):
    """model / lex / vocab files (Mozilla ships .gz; keep the convention the repo
    already uses — match an existing entry's filenames when uploading)."""
    out = {}
    for f in os.listdir(d):
        if "model." in f:
            out["model"] = f
        elif f.startswith("lex."):
            out["lex"] = f
        elif f.startswith("vocab.") or f.startswith("srcvocab.") or f.startswith("trgvocab."):
            out.setdefault("vocab", f)
    return out


def main():
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("set HF_TOKEN (rotate after).")
        sys.exit(2)
    langs = sorted(set(TINY) | set(BASE))
    pairs = [f"en{l}" for l in langs] + [f"{l}en" for l in langs]
    lfs_clone()
    os.makedirs(STAGE, exist_ok=True)
    registry = {}
    have = 0
    for pair in pairs:
        d = pick_dir(pair)
        if not d:
            print(f"(skip) no model for {pair}")
            continue
        fs = files_in(d)
        if "model" not in fs or "lex" not in fs or "vocab" not in fs:
            print(f"(skip) incomplete {pair}: {fs}")
            continue
        dst = os.path.join(STAGE, pair)
        os.makedirs(dst, exist_ok=True)
        entry = {}
        for kind in ("model", "lex", "vocab"):
            src = os.path.join(d, fs[kind])
            shutil.copy(src, os.path.join(dst, fs[kind]))
            sz = os.path.getsize(src)
            entry[kind] = {"name": f"{HOST}/{pair}/{fs[kind]}", "size": sz,
                           "estimatedCompressedSize": sz, "expectedSha256Hash": sha256(src),
                           "modelType": "prod"}
        registry[pair] = entry
        have += 1
        print(f"staged {pair}")

    # MERGE with the existing registry so the original 16 keep working.
    try:
        import urllib.request
        cur = json.loads(urllib.request.urlopen(f"{HOST}/registry.json").read())
        for k, v in cur.items():
            registry.setdefault(k, v)
    except Exception as e:
        print("warn: could not fetch existing registry:", e)
    with open(os.path.join(STAGE, "registry.json"), "w", encoding="utf-8") as f:
        json.dump(registry, f)

    # Upload everything (per-file, robust — see PRODUCER LESSONS).
    from huggingface_hub import HfApi
    api = HfApi(token=token)
    api.upload_folder(folder_path=STAGE, repo_id=HF_REPO, repo_type="model")
    print(f"\nDONE: {have} pairs staged + uploaded · registry has {len(registry)} pairs.")
    print("NEXT: set bergamot.ts SUPPORTED to:", sorted(set(TINY) | set(BASE)))


if __name__ == "__main__":
    main()
