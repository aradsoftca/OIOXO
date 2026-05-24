"""
Tier-1 ENCODER distillation set (ANSWER_BRAIN.md §6/§8.3).

The encoder is the "million styles -> structured plan" absorber: it reads any
phrasing and outputs intent / shape / move / media-need. It REPLACES the regex in
comprehendAnswer + decideMove, so it must see hugely varied phrasings (typos,
slang, run-ons, polite, terse) for each label — that diversity is exactly what a
regex can't cover and what makes the encoder general.

We use CONTROLLED generation: for each category (a fixed label set + a style
description) the teacher writes many varied real-user messages; the category's
labels apply to all of them. Balanced, diverse, no fragile labeling step.

Base model at serve time = Xenova/all-MiniLM-L6-v2 — ALREADY downloaded in the
browser for embeddings, so the heads add ~0 MB.

Output: JSONL {text, intent, shape, move, media}  -> encoder-train.jsonl
  python gen_encoder_data.py --per 40 --out encoder-train.jsonl --teacher Qwen/Qwen2.5-7B-Instruct --load-4bit
"""
import argparse, json, re, time, random
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# (label dict, style description for the teacher). shape uses the ANSWER_BRAIN set
# plus a few non-answer shapes (tool/transform_text/creative/compute/chat).
CATEGORIES = [
    ({"intent": "answer", "shape": "fact",          "move": "route", "media": 0}, "asks a single factual question (a name, date, number, place)"),
    ({"intent": "answer", "shape": "define",         "move": "route", "media": 0}, "asks what something is / to explain a concept"),
    ({"intent": "answer", "shape": "why",            "move": "route", "media": 0}, "asks WHY something happens or happened (causal)"),
    ({"intent": "answer", "shape": "howto",          "move": "route", "media": 1}, "asks how to DO something, a process or recipe"),
    ({"intent": "answer", "shape": "compare",        "move": "route", "media": 0}, "asks to compare two things or which of two is better"),
    ({"intent": "answer", "shape": "opinion",        "move": "route", "media": 0}, "asks for an opinion/judgment (is X good, worth it, healthy, tasty)"),
    ({"intent": "answer", "shape": "recommend",      "move": "route", "media": 0}, "asks for the best / a recommendation / a ranked pick"),
    ({"intent": "answer", "shape": "live",           "move": "route", "media": 0}, "asks something current/live (price, score, weather, latest news, today)"),
    ({"intent": "answer", "shape": "list",           "move": "route", "media": 0}, "asks for a list / types / examples of something"),
    ({"intent": "transform", "shape": "transform_text", "move": "route", "media": 0}, "asks to summarize / rewrite / translate a piece of text they give"),
    ({"intent": "create", "shape": "creative",       "move": "route", "media": 0}, "asks to write something creative from nothing (poem, story, caption)"),
    ({"intent": "answer", "shape": "compute",        "move": "route", "media": 0}, "asks a math / calculation / logic / code question"),
    ({"intent": "transform", "shape": "tool",        "move": "route", "media": 0}, "asks to do a file operation (compress, convert, resize, crop, transcribe)"),
    ({"intent": "answer", "shape": "list",           "move": "route", "media": 1}, "asks to SEE images/photos/pictures of something (visual request)"),
    ({"intent": "chat",   "shape": "chat",           "move": "talk",  "media": 0}, "a personal/emotional statement, an aspiration ('i want to learn X'), or a greeting — NOT a question"),
    ({"intent": "answer", "shape": "recommend",      "move": "offer", "media": 0}, "states a RESOURCE need without asking a direct question ('i need money for school', 'i need a cheap laptop')"),
    ({"intent": "assist", "shape": "tool",           "move": "route", "media": 0}, "is stuck / asks how to do something the app might support ('why can't I edit my pdf')"),
]

def build_teacher(name, four_bit):
    tok = AutoTokenizer.from_pretrained(name)
    if four_bit:
        from transformers import BitsAndBytesConfig
        bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                 bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
        model = AutoModelForCausalLM.from_pretrained(name, quantization_config=bnb, device_map={"": 0}).eval()
    else:
        model = AutoModelForCausalLM.from_pretrained(name, dtype=torch.bfloat16, device_map={"": 0}).eval()
    return tok, model

def gen(tok, model, user, max_new=400):
    msgs = [{"role": "user", "content": user}]
    prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=max_new, do_sample=True, temperature=0.9, top_p=0.95, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True).strip()

def parse_lines(raw):
    out = []
    for ln in raw.split("\n"):
        s = ln.strip()
        s = re.sub(r"^\s*(\d+[.)]|[-*•])\s*", "", s).strip().strip('"').strip()
        if 2 <= len(s) <= 200 and not s.lower().startswith(("here", "sure", "of course")):
            out.append(s)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per", type=int, default=40, help="messages per category")
    ap.add_argument("--out", default="encoder-train.jsonl")
    ap.add_argument("--teacher", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--load-4bit", action="store_true")
    args = ap.parse_args()
    assert torch.cuda.is_available()
    random.seed(0)
    tok, model = build_teacher(args.teacher, args.load_4bit)

    rows, t0 = [], time.time()
    for labels, desc in CATEGORIES:
        got = []
        tries = 0
        while len(got) < args.per and tries < 4:
            tries += 1
            n = min(25, args.per - len(got) + 5)
            instr = (
                f"Write {n} DIFFERENT short messages a real user might type that {desc}. "
                "Vary the wording, length and tone widely — some terse, some chatty, some with typos or slang, "
                "some polite. Each on its own line, no numbering, no quotes, just the messages."
            )
            got.extend(parse_lines(gen(tok, model, instr)))
        seen = set()
        for m in got[: args.per]:
            k = m.lower()
            if k in seen:
                continue
            seen.add(k)
            rows.append({"text": m, **labels})
        print(f"{labels['shape']:14s}/{labels['move']:5s} -> {len(seen)} msgs  ({(time.time()-t0)/60:.1f} min)")

    random.shuffle(rows)
    with open(args.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"\nwrote {len(rows)} -> {args.out} in {(time.time()-t0)/60:.1f} min")

if __name__ == "__main__":
    main()
