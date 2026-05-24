"""Run the REAL decision prompts through the actual Qwen3-0.6B GGUF WITH grammar
(JSON-schema), the faithful CLI proxy for the WebGPU+grammar runtime. Honest
adversarial check of the model-first decider — not a pass/fail eval.

Run:  npx tsx lib/ai/eval/gen-prompts.ts > /tmp/prompts.json
      <py313> scripts/decide_real.py /tmp/prompts.json
"""
import json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from llama_cpp import Llama

prompts = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/prompts.json", encoding="utf-8"))
gguf = os.path.join(os.path.dirname(__file__), "qwen3-q4.gguf")
llm = Llama(model_path=gguf, n_ctx=4096, n_threads=os.cpu_count(), verbose=False)

def strip(s): return re.sub(r"<think>.*?</think>", "", s, flags=re.S).strip()

print("\n=== REAL Qwen3-0.6B decisions (GGUF + grammar) ===\n")
ok = 0; total = 0
for p in prompts:
    try:
        out = llm.create_chat_completion(
            messages=[{"role": "system", "content": p["system"]}, {"role": "user", "content": p["user"]}],
            max_tokens=160, temperature=0.0,
            response_format={"type": "json_object", "schema": json.loads(p["schema"])},
        )
        raw = strip(out["choices"][0]["message"]["content"])
    except Exception as e:
        ftag = f"[{p['file']}] " if p.get("file") else ""
        print(f"{ftag}{p['q']}\n   => (ERROR) {str(e)[:100]}\n   candidates: {', '.join(p['candidates'])}\n")
        continue
    try:
        d = json.loads(raw)
        act = d.get("action"); tools = d.get("tools") or []; query = d.get("query") or ""
        if act == "offer":
            # Resourceful message comes from a SEPARATE free-form call.
            o2 = llm.create_chat_completion(
                messages=[{"role": "system", "content": p["offerSystem"]}, {"role": "user", "content": p["offerUser"]}],
                max_tokens=130, temperature=0.5)
            detail = strip(o2["choices"][0]["message"]["content"])
        else:
            detail = " → ".join(tools) if tools else (f'"{query}"' if act == "answer" else "")
    except Exception:
        act, detail = "(unparsed)", raw[:120]
    # The app forces a type-compatible, single-step confident match (guardrail).
    # Else parseDecision promotes a 2+ tool "tool" answer to a chain (model often
    # mislabels), so mirror that here for an honest verdict.
    # Mirror parseDecision: 2+ tools = chain, but only if it TYPE-CONNECTS;
    # an incompatible "chain" (audio→3d) becomes a resourceful offer.
    def connects(ts):
        byid = {c["id"]: c for c in p.get("cands", [])}
        for i in range(len(ts) - 1):
            a = byid.get(ts[i]); b = byid.get(ts[i + 1])
            if not a or not b: continue
            if a["produces"] and b["accepts"] and not (set(a["produces"]) & set(b["accepts"])): return False
        return True
    guard = p.get("guardId")
    if guard:
        eff = "tool"
    elif act == "tool" and len(tools) > 1:
        eff = "chain" if connects(tools) else "offer"
    else:
        eff = act
    want = p.get("want")
    verdict = ""
    if want:
        total += 1
        good = (eff == want) or (want == "tool" and eff == "chain")
        ok += 1 if good else 0
        verdict = ("  ✓" if good else f"  ✗ got {eff}, want {want}")
    gtag = f" {{guardrail→{guard}}}" if guard else ""
    ftag = f"[{p['file']}] " if p.get("file") else ""
    print(f"{ftag}{p['q']}{verdict}")
    print(f"   => {act}{gtag}   {detail}")
    print(f"   conf={p.get('conf')}  candidates: {', '.join(p['candidates']) or '(none)'}\n")
print(f"=== scored {ok}/{total} (cases with an expected action; guardrail applied) ===")
