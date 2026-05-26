"""
Evaluate the trained CONDUCTOR on the held-out val slice (run on arad after training).

Reproduces train_conductor_brain.py's split (seed 0, last 8% — never trained on),
runs the model with the SAME serve contract, parses the emitted JSON plan, and scores
what matters for the agentic brain:
  • JSON-valid rate         (does it emit a parseable plan at all?)
  • turn-role accuracy       (did it read the turn's role correctly?)
  • honesty rate             (every can:false step names an alternative — no dishonest plan)
  • chain non-empty rate
Plus a few predicted-vs-gold samples to eyeball. Run on arad:
  set "PYTHONUTF8=1"&& C:\science\.venv\Scripts\python1.exe -u eval_conductor.py conductor-data.jsonl conductor-final
"""
import json
import random
import sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

DATA = sys.argv[1] if len(sys.argv) > 1 else "conductor-data.jsonl"
MODEL = sys.argv[2] if len(sys.argv) > 2 else "conductor-final"

# MUST match train_conductor_brain.py exactly (train/serve parity).
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
    for h in inp.get("history") or []:
        who = "User" if h.get("role") == "user" else "oioxo"
        lines.append(f"{who}: {h.get('text', '')}")
    if lines:
        lines.insert(0, "Conversation so far:")
    if inp.get("hasFile"):
        lines.append(f"[File attached: {inp.get('fileType') or 'file'}]")
    lines.append(f"User: {inp.get('message', '')}")
    return "\n".join(lines)


rows = []
for l in open(DATA, encoding="utf-8"):
    l = l.strip()
    if not l:
        continue
    try:
        r = json.loads(l)
        if isinstance(r, dict) and "input" in r and "label" in r:
            rows.append(r)
    except Exception:
        pass
random.seed(0)
random.shuffle(rows)
val = rows[int(len(rows) * 0.92):]
print(f"val turns (held out): {len(val)}")

tok = AutoTokenizer.from_pretrained(MODEL)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
model = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=torch.float16).cuda().eval()


def gen(inp):
    msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": build_user(inp)}]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    enc = tok(prompt, return_tensors="pt").to("cuda")
    with torch.no_grad():
        out = model.generate(**enc, max_new_tokens=400, do_sample=False, pad_token_id=tok.pad_token_id)
    return tok.decode(out[0][enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()


valid = role_ok = honest = chain_ok = 0
samples = []
for r in val:
    raw = gen(r["input"])
    try:
        pred = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
    except Exception:
        samples.append((r, None, raw))
        continue
    valid += 1
    gold = r["label"]
    if pred.get("turnRole") == gold.get("turnRole"):
        role_ok += 1
    chain = pred.get("chain") or []
    if chain:
        chain_ok += 1
    if all((c.get("can") is not False) or (c.get("alternative", "").strip()) for c in chain):
        honest += 1
    if len(samples) < 8:
        samples.append((r, pred, raw))

n = len(val)
print(f"\n=== CONDUCTOR EVAL ({n} held-out turns) ===")
print(f"JSON-valid     : {valid}/{n} ({100*valid//max(1,n)}%)")
print(f"turn-role acc  : {role_ok}/{valid} ({100*role_ok//max(1,valid)}% of valid)")
print(f"honest plans   : {honest}/{valid} (can:false always has an alternative)")
print(f"chain non-empty: {chain_ok}/{valid}")
print("\n--- samples (gold role -> pred role | pred reply) ---")
for r, pred, raw in samples[:8]:
    g = r["label"].get("turnRole")
    if pred is None:
        print(f"[{g} -> PARSE-FAIL] {raw[:80]}")
    else:
        print(f"[{g} -> {pred.get('turnRole')}] {str(pred.get('reply',''))[:90]}")
