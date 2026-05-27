"""
Train the oioxo QUERY WRITER on arad — a tiny model that turns a user's messy
message into the best web-search query (+ a refined fallback), entirely on-device.

Why: we proved the BASE 360M can't do this zero-shot (it ignores "give keywords"
and gives bad advice). Query-generation is a narrow, learnable skill, so we full-FT
a small instruct decoder to EMIT  {"query":"...","refine":"..."}  given the message.
Loss is MASKED to the JSON target. Teacher = Gemini (one-time, offline) built the
data via gen-querygen-data.ts; at RUNTIME this model does it free, no API.

The SYSTEM prompt + user format here are the SERVE CONTRACT — keep identical to the
engine's call AND to QUERYGEN_SYSTEM in gen-querygen-data.ts (train/serve parity).

Plain JSONL -> torch (no datasets/pyarrow). Offline, base model local. Run on arad:
  cd /d C:\\science\\brain && set "PYTHONUTF8=1"&& set "TRANSFORMERS_OFFLINE=1"&& ^
  C:\\science\\.venv\\Scripts\\python1.exe -u train_querygen.py querygen-data.jsonl .\\SmolLM2-360M-Instruct
Smoke test first:  set "MAX_STEPS=2"&& ...   Artifacts: ./querygen-final/
"""
import json
import os
import random
import sys
import torch
from torch.utils.data import Dataset
from transformers import (AutoModelForCausalLM, AutoTokenizer, Trainer,
                          TrainingArguments)

DATA = sys.argv[1] if len(sys.argv) > 1 else "querygen-data.jsonl"
MODEL = sys.argv[2] if len(sys.argv) > 2 else "HuggingFaceTB/SmolLM2-360M-Instruct"
MAX_LEN = 256  # query-gen is short -> small ctx = fast

# SERVE CONTRACT — must match QUERYGEN_SYSTEM in gen-querygen-data.ts and the engine.
SYSTEM = (
    "You turn the user's message into the best WEB SEARCH QUERY — the concise keywords "
    "a skilled researcher types into a search engine. Drop filler, emotion, greetings, "
    "and first-person (\"I'm 40, scared\"); keep the real entities (brands, models, "
    "places, error text) and the intent word (\"how to\", \"fix\", \"review\", \"best\", "
    "a year). Also give ONE different, more specific fallback query to try if the first "
    "returns weak results. Output ONLY JSON: {\"query\":\"...\",\"refine\":\"...\"}."
)

# Resilient load: skip malformed lines.
rows, skipped = [], 0
for l in open(DATA, encoding="utf-8"):
    l = l.strip()
    if not l:
        continue
    try:
        r = json.loads(l)
        if isinstance(r, dict) and "input" in r and "label" in r and r["input"].get("message"):
            rows.append(r)
        else:
            skipped += 1
    except Exception:
        skipped += 1
random.seed(0)
random.shuffle(rows)
print(f"loaded {len(rows)} query-gen examples (skipped {skipped} malformed)")

tok = AutoTokenizer.from_pretrained(MODEL)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token


def build(r):
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": r["input"]["message"]}]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    # only the fields we serve, in a fixed key order (stable target)
    target = json.dumps({"query": r["label"].get("query", ""),
                         "refine": r["label"].get("refine", "")}, ensure_ascii=False)
    full = prompt + target + tok.eos_token
    enc = tok(full, truncation=True, max_length=MAX_LEN)
    p_len = len(tok(prompt, truncation=True, max_length=MAX_LEN)["input_ids"])
    labels = list(enc["input_ids"])
    for i in range(min(p_len, len(labels))):
        labels[i] = -100  # loss only on the JSON, not the prompt
    enc["labels"] = labels
    return enc


class DS(Dataset):
    def __init__(self, rs):
        self.data = [build(r) for r in rs]

    def __len__(self):
        return len(self.data)

    def __getitem__(self, i):
        return self.data[i]


def collate(feats):
    m = max(len(f["input_ids"]) for f in feats)
    ids, mask, lab = [], [], []
    for f in feats:
        n = m - len(f["input_ids"])
        ids.append(f["input_ids"] + [tok.pad_token_id] * n)
        mask.append(f["attention_mask"] + [0] * n)
        lab.append(f["labels"] + [-100] * n)
    return {"input_ids": torch.tensor(ids), "attention_mask": torch.tensor(mask), "labels": torch.tensor(lab)}


n = int(len(rows) * 0.92)
train_ds, val_ds = DS(rows[:n]), DS(rows[n:])

model = AutoModelForCausalLM.from_pretrained(MODEL)
model.config.pad_token_id = tok.pad_token_id

_smoke = int(os.environ.get("MAX_STEPS", "0") or "0")
args = TrainingArguments(
    output_dir="querygen-out",
    num_train_epochs=4,
    max_steps=_smoke if _smoke > 0 else -1,
    per_device_train_batch_size=8,
    gradient_accumulation_steps=2,
    per_device_eval_batch_size=8,
    learning_rate=3e-5,
    warmup_ratio=0.05,
    lr_scheduler_type="cosine",
    logging_steps=20,
    eval_strategy="no" if _smoke > 0 else "epoch",
    save_strategy="no",
    report_to=[],
    fp16=torch.cuda.is_available(),
)
trainer = Trainer(model=model, args=args, train_dataset=train_ds,
                  eval_dataset=val_ds, data_collator=collate)
trainer.train()

model.save_pretrained("querygen-final")
tok.save_pretrained("querygen-final")
print("SAVED querygen-final")
