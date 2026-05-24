"""Upload writer8-hf to a NEW HF repo (does NOT touch the live oioxo-writer).
  set "HF_TOKEN=hf_..." && python upload_writer8.py
"""
import os
from huggingface_hub import HfApi, create_repo
tok = os.environ["HF_TOKEN"]
repo = "payam1394/oioxo-writer8"
create_repo(repo, exist_ok=True, token=tok, repo_type="model")
HfApi(token=tok).upload_folder(folder_path="writer8-hf", repo_id=repo, repo_type="model")
print("uploaded ->", f"https://huggingface.co/{repo}")
