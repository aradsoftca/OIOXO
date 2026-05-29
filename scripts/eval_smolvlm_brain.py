"""
Evaluate the trained SmolVLM-256M-Brain on held-out turns.

This is the SHIP GATE. We measured every prior brain at: JSON-valid % /
turn-role acc / honest rate (every can:false names alternative) / chain
typechecks. Conductor v2 cleared 94/84/100/100. The brain must clear:
  - JSON-valid       ≥ 92%
  - Turn-role acc    ≥ 82%
  - HONEST rate      = 100%  (never below — this is the moat)
  - Chain typechecks ≥ 95%
  - Vision subset    ≥ 85%  (on the image-modality subset)
  - No regression vs conductor v2 baseline on text-only turns

If any gate fails → DIAGNOSE the failure class, expand dataset for that
class, retrain. Never patch with regex. Discipline that produced
conductor v2 (94/84/100) from conductor v1 (82/82/100).

Usage on arad:
  set "PYTHONUTF8=1"&& set "TRANSFORMERS_OFFLINE=1"&& ^
  C:\\science\\.venv\\Scripts\\python1.exe -u eval_smolvlm_brain.py brain-final brain-eval.jsonl

  --vision-only : restrict eval to image-modality turns (gate #5)
  --text-only   : restrict to text-only turns (regression gate)
"""
import argparse
import json
import sys

import torch
from transformers import AutoModelForImageTextToText, AutoTokenizer

ap = argparse.ArgumentParser()
ap.add_argument("model_dir", help="brain-final/ — the trained merged checkpoint")
ap.add_argument("eval_jsonl", help="held-out turns in the same row format as train")
ap.add_argument("--vision-only", action="store_true")
ap.add_argument("--text-only", action="store_true")
ap.add_argument("--max-rows", type=int, default=0, help="limit rows (smoke)")
args = ap.parse_args()

# Same SERVE CONTRACT as training — train/serve parity is the anti-drift rule.
SYSTEM = (
    "You are oioxo's planning brain. You run on every user turn. Given the "
    "user's latest message, any attached file/image, and the conversation so "
    "far, output ONLY a JSON plan and nothing else: "
    "{\"turnRole\":one of new-goal|parameter|append-step|correction|confirmation|"
    "question|chitchat|outcome,"
    "\"goal\":string,"
    "\"chain\":[{\"step\":\"surface:id\",\"can\":bool,\"alternative\":string-when-false}],"
    "\"params\":object,"
    "\"mediaNeed\":none|image-search|ocr|video-transcript,"
    "\"style\":{\"format\":string,\"length\":string,\"tone\":string,\"lang\":string},"
    "\"remember\":string-when-user-states-a-preference-to-store,"
    "\"ask\":string-when-blocked-on-missing-info,"
    "\"reply\":string}. "
    "Surfaces: tool:<id> chain:<id1,id2,...> studio:<id> app:<id> vision:<op> "
    "search:<shape> memory:<op> limit:<what>. "
    "Honesty: can:false REQUIRES a non-empty alternative naming what we CAN do. "
    "Reply rules: NEVER 'As an AI', NEVER 'Sure! Here's', NEVER 'Hope this helps', "
    "NEVER 'Is there anything else'. Match user brevity. Match emotional register. "
    "Cite verifiable claims, skip for math/personal. Refer to human experts for "
    "medical/legal/financial/crisis. Never claim physical perception. Defer recency "
    "to live search. Confirm before destructive ops. Respect cultural context. "
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
        ft = inp.get("fileType") or "file"
        desc = inp.get("imageDescription") or ""
        if ft == "image" and desc:
            lines.append(f"[IMAGE attached: {desc}]")
        else:
            lines.append(f"[File attached: {ft}]")
    lines.append(f"User: {inp.get('message', '')}")
    return "\n".join(lines)


# ─── Load held-out data ──────────────────────────────────────────────────────
rows = []
for line in open(args.eval_jsonl, encoding="utf-8"):
    line = line.strip()
    if not line:
        continue
    try:
        r = json.loads(line)
        if "input" not in r or "label" not in r:
            continue
        has_image = (r["input"].get("fileType") == "image")
        if args.vision_only and not has_image:
            continue
        if args.text_only and has_image:
            continue
        rows.append(r)
    except Exception:
        continue

if args.max_rows:
    rows = rows[:args.max_rows]
print(f"eval rows: {len(rows)} ({'vision-only' if args.vision_only else 'text-only' if args.text_only else 'all'})")

# ─── Load model ──────────────────────────────────────────────────────────────
tok = AutoTokenizer.from_pretrained(args.model_dir)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
model = AutoModelForImageTextToText.from_pretrained(
    args.model_dir,
    dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
    device_map="auto" if torch.cuda.is_available() else None,
)
model.eval()


def predict(r):
    # SmolVLM chat template requires content as a LIST of dicts; see train script for why.
    msgs = [
        {"role": "system", "content": [{"type": "text", "text": SYSTEM}]},
        {"role": "user", "content": [{"type": "text", "text": build_user(r["input"])}]},
    ]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    enc = tok(prompt, return_tensors="pt", truncation=True, max_length=2048).to(model.device)
    with torch.no_grad():
        out = model.generate(
            **enc,
            max_new_tokens=1024,
            do_sample=False,           # greedy — plan output should be structured, not creative
            # NOTE: we tried no_repeat_ngram_size=4 + repetition_penalty=1.1 to fix
            # decoder loops (e.g. "0000…"); they HURT — JSON has legitimate token
            # repetition (",", '"', "step", "can") that the penalties broke. Pure
            # greedy at v3 (rank 32 / 5 epochs) gave the best numbers.
            pad_token_id=tok.pad_token_id,
            eos_token_id=tok.eos_token_id,
        )
    gen = tok.decode(out[0][enc.input_ids.shape[1]:], skip_special_tokens=True).strip()
    return gen


# ─── Metrics ─────────────────────────────────────────────────────────────────
valid = 0
role_correct = 0
ROLES = ["new-goal", "parameter", "append-step", "correction",
         "confirmation", "question", "chitchat", "outcome"]
# confusion[gold][pred] — the v4 diagnosis: WHICH roles the brain conflates,
# so the dataset rebalance + classifier head target the real failure, not a guess.
confusion = {g: {p: 0 for p in ROLES + ["<other>"]} for g in ROLES}
gold_counts = {g: 0 for g in ROLES}
honest = 0           # every can:false has a non-empty alternative
honest_eligible = 0  # how many rows had any can:false to check
chain_nonempty = 0
chain_typecheck = 0  # well-formed (each step has surface:id form)
samples = []

for i, r in enumerate(rows):
    if (i % 25) == 0 and i > 0:
        print(f"  …{i}/{len(rows)}")
    gen = predict(r)
    # Try to parse JSON
    parsed = None
    try:
        s = gen[gen.index("{"):gen.rindex("}") + 1]
        parsed = json.loads(s)
    except Exception:
        pass
    if not parsed or not isinstance(parsed, dict):
        if len(samples) < 5:
            samples.append({"i": i, "user": r["input"]["message"][:80], "gen": gen[:200], "issue": "json-parse"})
        continue
    valid += 1
    # turn-role + confusion tracking
    gold_role = r["label"].get("turnRole")
    pred_role = parsed.get("turnRole")
    if gold_role == pred_role:
        role_correct += 1
    if gold_role in gold_counts:
        gold_counts[gold_role] += 1
        confusion[gold_role][pred_role if pred_role in ROLES else "<other>"] += 1
    # honesty
    chain = parsed.get("chain") or []
    if isinstance(chain, list) and chain:
        chain_nonempty += 1
        all_step_well_formed = all(
            isinstance(c, dict) and isinstance(c.get("step"), str) and ":" in c.get("step", "")
            for c in chain
        )
        if all_step_well_formed:
            chain_typecheck += 1
        # Honesty check
        any_false = any(isinstance(c, dict) and c.get("can") is False for c in chain)
        if any_false:
            honest_eligible += 1
            all_have_alt = all(
                isinstance(c, dict) and (c.get("can") is True or (isinstance(c.get("alternative"), str) and c["alternative"].strip()))
                for c in chain
            )
            if all_have_alt:
                honest += 1
    # collect a few diverse samples
    if len(samples) < 8 and (i % max(1, len(rows) // 8)) == 0:
        samples.append({
            "i": i,
            "user": r["input"]["message"][:80],
            "gold_role": r["label"].get("turnRole"),
            "pred_role": parsed.get("turnRole"),
            "pred_chain": parsed.get("chain"),
            "pred_reply": (parsed.get("reply") or "")[:120],
        })


# ─── Report ──────────────────────────────────────────────────────────────────
n = len(rows)
def pct(num, denom): return f"{num}/{denom} = {(100 * num / max(1, denom)):.1f}%"

print("\n═══════════════════════════════════════════════════════════════════")
print(f"BRAIN EVAL — {n} rows ({args.model_dir})")
print("═══════════════════════════════════════════════════════════════════")
print(f"JSON-valid:        {pct(valid, n)}            gate ≥92% {'✓' if 100*valid/max(1,n) >= 92 else '✗ FAIL'}")
print(f"Turn-role acc:     {pct(role_correct, n)}            gate ≥82% {'✓' if 100*role_correct/max(1,n) >= 82 else '✗ FAIL'}")
print(f"Honest (alt named):{pct(honest, max(1, honest_eligible))}   (of {honest_eligible} eligible)  gate =100% {'✓' if honest == honest_eligible else '✗ FAIL'}")
print(f"Chain non-empty:   {pct(chain_nonempty, n)}")
print(f"Chain typecheck:   {pct(chain_typecheck, n)}            gate ≥95% {'✓' if 100*chain_typecheck/max(1,n) >= 95 else '✗ FAIL'}")

# ─── Turn-role per-class recall + confusion (THE v4 diagnosis) ──────────────
print("\nTurn-role per-class recall (gold → correct%):")
weak = []
for g in ROLES:
    tot = gold_counts[g]
    if not tot:
        print(f"  {g:14s}  (0 in eval set — UNDER-COVERED, add to v4 data)")
        continue
    rec = 100 * confusion[g][g] / tot
    flag = '  ← WEAK' if rec < 82 else ''
    if rec < 82:
        # top confusion target
        others = sorted(((p, c) for p, c in confusion[g].items() if p != g and c), key=lambda x: -x[1])
        top = f" (mostly → {others[0][0]})" if others else ''
        weak.append(f"{g} {rec:.0f}%{top}")
    print(f"  {g:14s}  {confusion[g][g]}/{tot} = {rec:.0f}%{flag}")
if weak:
    print("\n  WEAK ROLES (v4 targets): " + " · ".join(weak))
print()
print("Sample predictions:")
for s in samples[:6]:
    print(f"  [{s.get('i')}] user: {s.get('user')}")
    if "gen" in s:
        print(f"      raw: {s['gen']!r}  ({s['issue']})")
    else:
        print(f"      role: gold={s['gold_role']} / pred={s['pred_role']}")
        print(f"      chain: {s['pred_chain']}")
        print(f"      reply: {s['pred_reply']}")

# Exit non-zero if any gate failed → CI / scripts can detect.
gates_ok = (
    100 * valid / max(1, n) >= 92 and
    100 * role_correct / max(1, n) >= 82 and
    honest == honest_eligible and
    100 * chain_typecheck / max(1, n) >= 95
)
print(f"\nSHIP GATE: {'PASS' if gates_ok else 'FAIL — diagnose failure class, expand data, retrain'}")
sys.exit(0 if gates_ok else 1)
