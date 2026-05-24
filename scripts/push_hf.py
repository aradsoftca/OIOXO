"""Publish oioxo-writer to HuggingFace: writes a model card + uploads the
   packaged folder (q4 ~92MB + int8 ~130MB variants). Token via env HF_TOKEN.
"""
import os, shutil
from huggingface_hub import HfApi

OUT = "writer7-hf"
token = os.environ["HF_TOKEN"]
api = HfApi(token=token)
who = api.whoami()["name"]
repo = f"{who}/oioxo-writer"

# Include the int8 variant too (transformers.js v2 loads onnx/model_quantized.onnx).
int8 = "writer7-onnx/model_quantized.onnx"
if os.path.exists(int8):
    shutil.copy(int8, os.path.join(OUT, "onnx", "model_quantized.onnx"))

card = """---
license: apache-2.0
library_name: transformers.js
base_model: HuggingFaceTB/SmolLM2-135M-Instruct
pipeline_tag: text-generation
tags:
  - oioxo
  - on-device
  - text-generation
  - summarization
---

# oioxo-writer

A tiny **on-device writer** for [oioxo](https://oioxo.com) — produces clean
summaries and short articles from source text, running entirely in the browser
via transformers.js (no server, private).

- Base: **SmolLM2-135M-Instruct** (Apache-2.0)
- Trained by knowledge distillation from a **Qwen2.5-7B-Instruct** teacher
  (Apache-2.0) on Wikipedia-derived synthesis pairs.
- `onnx/model_q4.onnx` — 4-bit weights + int8 embeddings (~92 MB)
- `onnx/model_quantized.onnx` — int8 (~130 MB)

## License
Apache-2.0 (inherits from the SmolLM2-135M base). Attribution to SmolLM2 retained.
"""
with open(os.path.join(OUT, "README.md"), "w", encoding="utf-8") as f:
    f.write(card)

api.create_repo(repo, repo_type="model", exist_ok=True, private=False)
api.upload_folder(folder_path=OUT, repo_id=repo, repo_type="model", commit_message="oioxo-writer: 135M distilled writer (q4 + int8)")
print("PUBLISHED:", f"https://huggingface.co/{repo}")
