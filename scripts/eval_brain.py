"""
Score the trained brain on the HELD-OUT adversarial set (brain-eval.jsonl).

Loads base + LoRA adapter, replays each runtime prompt, greedily decodes the
JSON decision, and compares the chosen `action` (and tool sanity) to the
hand-judged `expected`. Prints a per-case table + an accuracy scorecard, and
also runs the BASE model alone so we can see how much the fine-tune helped.

  python eval_brain.py --adapter out --eval brain-eval.jsonl
  python eval_brain.py --base-only --eval brain-eval.jsonl   # baseline
"""
import argparse, json, re
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

def load(base, adapter, base_only):
    tok = AutoTokenizer.from_pretrained(base)
    model = AutoModelForCausalLM.from_pretrained(base, torch_dtype=torch.bfloat16, device_map={"": 0})
    if not base_only and adapter:
        model = PeftModel.from_pretrained(model, adapter)
    model.eval()
    return tok, model

def decode_action(text):
    """Pull the first JSON object out of the model's reply; return (action, tools)."""
    m = re.search(r"\{.*?\}", text, re.S)
    if not m:
        return None, []
    try:
        obj = json.loads(m.group(0))
    except Exception:
        return None, []
    return obj.get("action"), obj.get("tools", []) or []

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Qwen/Qwen3-0.6B")
    ap.add_argument("--adapter", default="out")
    ap.add_argument("--eval", required=True)
    ap.add_argument("--base-only", action="store_true")
    ap.add_argument("--max-new", type=int, default=40)
    ap.add_argument("--show", action="store_true", help="print every case")
    args = ap.parse_args()

    tok, model = load(args.base, args.adapter, args.base_only)
    tag = "BASE" if args.base_only else "TUNED"

    cases = [json.loads(l) for l in open(args.eval, encoding="utf-8") if l.strip()]
    ok = 0
    by_action = {}
    misses = []
    for c in cases:
        prompt = tok.apply_chat_template(c["messages"], tokenize=False, add_generation_prompt=True)
        # Qwen3 thinks by default; disable to get the bare decision.
        prompt = prompt.replace("<think>\n\n</think>\n\n", "")
        ids = tok(prompt, return_tensors="pt").to(model.device)
        with torch.no_grad():
            out = model.generate(**ids, max_new_tokens=args.max_new, do_sample=False,
                                 pad_token_id=tok.eos_token_id)
        reply = tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True)
        act, tools = decode_action(reply)
        exp = c["expected"]
        hit = act == exp
        ok += hit
        d = by_action.setdefault(exp, [0, 0]); d[1] += 1; d[0] += hit
        if not hit:
            misses.append((c["prompt"], exp, act, reply.strip()[:60]))
        if args.show:
            print(f"{'OK ' if hit else 'XX '} exp={exp:7} got={str(act):7} :: {c['prompt'][:45]}")

    print(f"\n=== {tag}  {ok}/{len(cases)} = {ok/len(cases)*100:.0f}% ===")
    for a, (h, n) in sorted(by_action.items()):
        print(f"  {a:8} {h}/{n}")
    if misses:
        print("\nMISSES:")
        for p, e, g, r in misses:
            print(f"  [{e}->{g}] {p[:42]}  ::  {r}")

if __name__ == "__main__":
    main()
