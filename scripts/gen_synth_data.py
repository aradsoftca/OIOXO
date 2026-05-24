"""
Build a SYNTHESIS distillation set: teach a tiny student (SmolLM2-135M) to take
source text and produce a clean summary / short article — in OUR voice (faithful
to the source, engaging, NO "according to"/source attribution).

Real Wikipedia passages are the source (factual, diverse). A strong teacher
(Qwen2.5-1.5B-Instruct) writes the ideal output with extra style steering; the
student is trained on the SIMPLE ask -> that output, so good synthesis + our
voice end up baked into the small weights (the moat).

Output: JSONL {messages:[user, assistant]} -> synth-train.jsonl
  python gen_synth_data.py --n 300
"""
import argparse, json, time
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer

# The student sees these SIMPLE asks (style is learned, not prompted).
def ask_summary(src): return f"Summarize the following clearly in 2-3 sentences:\n\n{src}"
def ask_article(src): return f"Write a short, engaging article (about 120 words) based only on the facts below:\n\n{src}"

# The teacher gets EXTRA steering so the targets are high quality + engaging —
# this is what we distil into the tiny student's WRITING VOICE.
STYLE_SUMMARY = (
    " Use only facts present in the text. Be clear, natural, and tight. Do NOT mention "
    "sources, do NOT say 'according to', do NOT add a preamble — give only the summary."
)
STYLE_ARTICLE = (
    " Write with an engaging, vivid voice: open with a hook, flow in smooth paragraphs, "
    "and end with a sense of why it matters. Use ONLY facts present in the text — invent "
    "nothing. No headings, no bullet lists, no 'according to', no preamble like 'Here is' — "
    "just the finished article prose."
)

def gen(model, tok, ask):
    msgs = [{"role": "user", "content": ask}]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=260, do_sample=False, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True).strip()

def clean(s):
    for junk in ("Here is", "Here's", "Sure,", "Certainly"):
        if s.startswith(junk):
            s = s.split(":", 1)[-1].strip() if ":" in s[:40] else s
    return s.strip().strip('"')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300, help="number of source passages")
    ap.add_argument("--out", default="synth-train.jsonl")
    ap.add_argument("--teacher", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--load-4bit", action="store_true", help="4-bit (bitsandbytes) — fits a 7B teacher on 8GB")
    args = ap.parse_args()
    assert torch.cuda.is_available()

    print(f"teacher: {args.teacher}  (4bit={args.load_4bit})")
    tok = AutoTokenizer.from_pretrained(args.teacher)
    if args.load_4bit:
        from transformers import BitsAndBytesConfig
        bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
        model = AutoModelForCausalLM.from_pretrained(args.teacher, quantization_config=bnb, device_map={"": 0}).eval()
    else:
        model = AutoModelForCausalLM.from_pretrained(args.teacher, dtype=torch.bfloat16, device_map={"": 0}).eval()

    ds = load_dataset("wikimedia/wikipedia", "20231101.simple", split="train", streaming=True)
    rows, t0 = [], time.time()
    seen = 0
    for ex in ds:
        if len(rows) >= args.n * 2:
            break
        text = " ".join(ex["text"].split())
        # take a self-contained chunk: 60-170 words, skip stubs/lists
        words = text.split()
        if not (90 <= len(words) <= 320):
            continue
        src = " ".join(words[:170])
        seen += 1
        try:
            summ = clean(gen(model, tok, ask_summary(src) + STYLE_SUMMARY))
            art = clean(gen(model, tok, ask_article(src) + STYLE_ARTICLE))
        except Exception as e:
            print(f"[skip] {type(e).__name__}: {e}"); continue
        if len(summ) < 40 or len(art) < 80:
            continue
        rows.append({"messages": [{"role": "user", "content": ask_summary(src)}, {"role": "assistant", "content": summ}]})
        rows.append({"messages": [{"role": "user", "content": ask_article(src)}, {"role": "assistant", "content": art}]})
        if len(rows) % 20 == 0:
            print(f"{len(rows)} examples  ({(time.time()-t0)/60:.1f} min, {seen} passages seen)")

    with open(args.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"\nwrote {len(rows)} examples -> {args.out}  in {(time.time()-t0)/60:.1f} min")
    print("SAMPLE:\n", rows[1]["messages"][1]["content"][:300])

if __name__ == "__main__":
    main()
