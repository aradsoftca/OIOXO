"""
Train the oioxo CONDUCTOR (the agentic planning brain) on arad.

Input = conductor-data.jsonl (gen-conductor-data.ts, Pro teacher): per-turn rows
{input:{message,hasFile,fileType,history}, label:{turnRole,goal,chain,params,
mediaNeed,ask,reply}}. We full-FT a small instruct decoder to EMIT the label JSON
given the turn — so at inference the engine calls it with (message+history+file)
and parses the plan. Loss is MASKED to the JSON target so it learns to plan, not
to echo the prompt.

The system prompt + user format here are the SERVE contract — keep them identical
in the engine's conductor call (train/serve parity, the anti-drift rule).

Plain JSONL -> torch (no datasets/pyarrow, arad's pyarrow crash). Offline: base
model shipped locally. Run on arad (cmd.exe, GPU free):
  cd /d C:\science\brain && set "PYTHONUTF8=1"&& set "TRANSFORMERS_OFFLINE=1"&& ^
  C:\science\.venv\Scripts\python1.exe -u train_conductor_brain.py conductor-data.jsonl .\SmolLM2-360M-Instruct
Artifacts: ./conductor-final/ -> export to ONNX/transformers.js next.
"""
import json
import os
import random
import sys
import torch
from torch.utils.data import Dataset
from transformers import (AutoModelForCausalLM, AutoTokenizer, Trainer,
                          TrainingArguments)

DATA = sys.argv[1] if len(sys.argv) > 1 else "conductor-data.jsonl"
MODEL = sys.argv[2] if len(sys.argv) > 2 else "HuggingFaceTB/SmolLM2-360M-Instruct"
MAX_LEN = 1024

# SERVE CONTRACT — must match the engine's conductor call exactly.
SYSTEM = (
    "You are oioxo's planning brain. You run on every turn. Given the user's latest "
    "message, the conversation so far, and whether a file is attached, output ONLY a "
    "JSON plan and nothing else: {\"turnRole\":one of new-goal|parameter|append-step|"
    "correction|confirmation|question|chitchat, \"goal\":string, \"chain\":[{\"step\":"
    "string,\"can\":bool,\"alternative\":string-when-can-false}], \"params\":object, "
    "\"mediaNeed\":none|image-search|ocr, \"ask\":string, \"reply\":string}. A step we "
    "cannot do must set can:false and name the nearest thing we CAN do as alternative. "
    "Track the goal across turns; a new message usually MODIFIES the running goal."
)


def build_user(inp):
    lines = []
    hist = inp.get("history") or []
    if hist:
        lines.append("Conversation so far:")
        for h in hist:
            who = "User" if h.get("role") == "user" else "oioxo"
            lines.append(f"{who}: {h.get('text', '')}")
    if inp.get("hasFile"):
        lines.append(f"[File attached: {inp.get('fileType') or 'file'}]")
    lines.append(f"User: {inp.get('message', '')}")
    return "\n".join(lines)


# Resilient load: skip any malformed line (a stray teacher reply with an embedded
# line-break shouldn't crash the run or corrupt the set).
rows, skipped = [], 0
for l in open(DATA, encoding="utf-8"):
    l = l.strip()
    if not l:
        continue
    try:
        r = json.loads(l)
        if isinstance(r, dict) and "input" in r and "label" in r:
            rows.append(r)
        else:
            skipped += 1
    except Exception:
        skipped += 1
random.seed(0)
random.shuffle(rows)
print(f"loaded {len(rows)} conductor turns (skipped {skipped} malformed)")

tok = AutoTokenizer.from_pretrained(MODEL)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token


# No padding here — we pad per-batch in collate() to the batch's longest example
# (dynamic padding). Conductor plans are mostly short, so this cuts wasted compute
# from a fixed 1024-token pad to the real lengths — ~2-3x faster, no quality change.
def build(r):
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": build_user(r["input"])}]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    target = json.dumps(r["label"], ensure_ascii=False)
    full = prompt + target + tok.eos_token
    enc = tok(full, truncation=True, max_length=MAX_LEN)
    p_len = len(tok(prompt, truncation=True, max_length=MAX_LEN)["input_ids"])
    labels = list(enc["input_ids"])
    for i in range(min(p_len, len(labels))):
        labels[i] = -100  # loss only on the JSON plan, not the prompt
    enc["labels"] = labels
    return enc


class DS(Dataset):
    def __init__(self, rs):
        self.data = [build(r) for r in rs]

    def __len__(self):
        return len(self.data)

    def __getitem__(self, i):
        return self.data[i]  # raw lists; collate() pads per-batch


def collate(feats):
    m = max(len(f["input_ids"]) for f in feats)
    ids, mask, lab = [], [], []
    for f in feats:
        n = m - len(f["input_ids"])
        ids.append(f["input_ids"] + [tok.pad_token_id] * n)
        mask.append(f["attention_mask"] + [0] * n)
        lab.append(f["labels"] + [-100] * n)
    return {
        "input_ids": torch.tensor(ids),
        "attention_mask": torch.tensor(mask),
        "labels": torch.tensor(lab),
    }


n = int(len(rows) * 0.92)
train_ds, val_ds = DS(rows[:n]), DS(rows[n:])

model = AutoModelForCausalLM.from_pretrained(MODEL)
model.config.pad_token_id = tok.pad_token_id

# MAX_STEPS=2 (env) → smoke test: prove the pipe end-to-end in seconds before the
# real multi-hour run. Unset / 0 → full training by epochs.
_smoke = int(os.environ.get("MAX_STEPS", "0") or "0")

args = TrainingArguments(
    output_dir="conductor-out",
    num_train_epochs=3,
    max_steps=_smoke if _smoke > 0 else -1,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=2,
    per_device_eval_batch_size=4,
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

model.save_pretrained("conductor-final")
tok.save_pretrained("conductor-final")
print("SAVED conductor-final")
