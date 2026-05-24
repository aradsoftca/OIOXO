"""
Host the Bergamot on-device translation models on HuggingFace (CORS-enabled,
free — the same delivery as the writer model). The app's lib/ai/bergamot.ts
points its registryUrl at the registry.json this uploads.

Why: Mozilla's default bucket has NO Access-Control-Allow-Origin, so browsers
can't fetch it. HF serves with ACAO:* . This is STATIC file hosting for
on-device inference — not a translation server.

Run once (needs a HF WRITE token for the target repo):
  set "HF_TOKEN=hf_xxx"
  python upload_bergamot_hf.py --repo payam1394/oioxo-bergamot
  # optional: --pairs enfa,faen,enes,esen,ende,deen,enfr,fren,enru,ruen,enar...
  # (default = ALL pairs in the source registry)
"""
import argparse, json, os, tempfile, urllib.request

SRC = "https://storage.googleapis.com/bergamot-models-sandbox/0.3.3"

def fetch(url):
    with urllib.request.urlopen(url) as r:
        return r.read()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="payam1394/oioxo-bergamot")
    ap.add_argument("--pairs", default="", help="comma list, e.g. enfa,faen; default = all")
    args = ap.parse_args()
    token = os.environ.get("HF_TOKEN")
    assert token, "set HF_TOKEN to a HuggingFace WRITE token"

    from huggingface_hub import HfApi, create_repo
    api = HfApi(token=token)
    create_repo(args.repo, repo_type="model", token=token, exist_ok=True)

    src_reg = json.loads(fetch(f"{SRC}/registry.json").decode())
    pairs = [p for p in args.pairs.split(",") if p] or list(src_reg.keys())
    base = f"https://huggingface.co/{args.repo}/resolve/main"
    out_reg = {}

    with tempfile.TemporaryDirectory() as tmp:
        for p in pairs:
            if p not in src_reg:
                print(f"[skip] {p} not in source registry"); continue
            out_reg[p] = {}
            for part, f in src_reg[p].items():
                if not f or not f.get("name"):
                    out_reg[p][part] = f; continue
                name = f["name"]
                data = fetch(f"{SRC}/{p}/{name}")
                local = os.path.join(tmp, name)
                open(local, "wb").write(data)
                api.upload_file(path_or_fileobj=local, path_in_repo=f"{p}/{name}", repo_id=args.repo, repo_type="model")
                # The app fetches file.name relative to the page, so it MUST be the
                # absolute HF URL here.
                out_reg[p][part] = {**f, "name": f"{base}/{p}/{name}"}
                print(f"uploaded {p}/{name} ({len(data)/1e6:.1f} MB)")
        reg_path = os.path.join(tmp, "registry.json")
        json.dump(out_reg, open(reg_path, "w"))
        api.upload_file(path_or_fileobj=reg_path, path_in_repo="registry.json", repo_id=args.repo, repo_type="model")

    print(f"\nDONE -> https://huggingface.co/{args.repo}  ({len(out_reg)} pairs)")
    print(f"registry: {base}/registry.json")

if __name__ == "__main__":
    main()
