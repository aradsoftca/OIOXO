"""
Head-to-head: the 135M vs 360M fuser, on the HELD-OUT validation slice.

Reproduces train_fusion.py's exact split (seed 0, last 8% = never trained on),
generates an answer from EACH model for every val question using the SAME serving
decode as lib/ai/fusion.ts (temp 0.3 / top_p 0.9 / rep-penalty 1.2), and reports:
  • repetition-degenerate answers  (the tiny-decoder collapse the gemini-bench saw)
  • fabricated-number answers       (a number in the answer NOT present in the notes)
  • a side-by-side vs the teacher target so quality is eyeball-judgeable.

Self-contained: no network, no gather, no Gemini key. The val targets ARE the
teacher (gemini-2.5-pro) answers, so "close to teacher + no degeneration + no
fabrication" = a good model. Run on arad:
  set "PYTHONUTF8=1"&& C:\science\.venv\Scripts\python1.exe -u eval_compare.py
"""
import json, random, re, torch
from transformers import AutoModelForCausalLM, AutoTokenizer

DATA = "fusion-data.jsonl"
rows = [json.loads(l) for l in open(DATA, encoding="utf-8") if l.strip()]
random.seed(0); random.shuffle(rows)          # MATCH train_fusion.py
val = rows[int(len(rows) * 0.92):]            # the held-out slice
print(f"held-out val examples: {len(val)}")


def load(path):
    tok = AutoTokenizer.from_pretrained(path)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(path, torch_dtype=torch.float16).cuda().eval()
    return tok, model


def gen(tok, model, system, user):
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    enc = tok(prompt, return_tensors="pt").to("cuda")
    with torch.no_grad():
        out = model.generate(**enc, max_new_tokens=160, do_sample=True, temperature=0.3,
                             top_p=0.9, repetition_penalty=1.2, pad_token_id=tok.pad_token_id)
    return tok.decode(out[0][enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()


def degenerate(t):
    w = t.lower().split()
    if len(w) < 8:
        return False
    grams = [tuple(w[i:i + 3]) for i in range(len(w) - 2)]
    return len(set(grams)) < len(grams) * 0.6   # heavy 3-gram repetition


def fabricates_number(t, notes):
    in_notes = set(re.findall(r"\d+", " ".join(notes)))
    in_out = set(re.findall(r"\d+", t))
    in_out = {x for x in in_out if len(x) >= 2}  # ignore "2-4 sentences"-type single digits
    return bool(in_out) and not in_out.issubset(in_notes)


results = {}
for name, path in [("135M", "fusion-135"), ("360M", "fusion-360")]:
    print(f"\n#### {name}  ({path})")
    tok, model = load(path)
    outs, rep, fab = [], 0, 0
    torch.manual_seed(0)
    for r in val:
        o = gen(tok, model, r["system"], r["user"])
        outs.append(o)
        if degenerate(o):
            rep += 1
        if fabricates_number(o, r["notes"]):
            fab += 1
    results[name] = outs
    print(f"{name}: {len(val)} answers | degenerate/looping: {rep} | fabricated-number: {fab} | "
          f"avg len: {sum(len(o) for o in outs) // max(1, len(outs))}c")
    del model
    torch.cuda.empty_cache()

print("\n\n================ SIDE BY SIDE (held-out) ================")
for i, r in enumerate(val):
    print(f"\n--- Q: {r['question']}")
    print(f"[TEACHER] {r['target'][:400]}")
    print(f"[135M]    {results['135M'][i][:400]}")
    print(f"[360M]    {results['360M'][i][:400]}")
