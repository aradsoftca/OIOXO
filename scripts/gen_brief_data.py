"""
writer8 distillation set — teach the tiny writer the tasks oioxo ACTUALLY asks of
it, which writer7 never saw: answer-a-question-from-a-brief, decide/compare-from-a-
brief, and short conversational turns — all in oioxo's persona voice. (writer7 only
learned summarize/article, so those prompts were out-of-distribution and answers
failed; see ANSWER_BRAIN.md §8 and the training-gap note.)

CRITICAL: the user-message templates below are BYTE-IDENTICAL to the serve prompts
in lib/oioxo/writer.ts. The student must train on exactly what it will be asked at
runtime. If you change a prompt in writer.ts, change it HERE too.

Real Wikipedia passages are the grounding (factual, diverse). A strong teacher
(Qwen2.5-7B-Instruct, 4-bit, fits the 3070's 8GB) writes the ideal output with
extra style steering; the student trains on the canonical prompt -> that output, so
good synthesis + our voice bake into the small weights.

Output: JSONL {messages:[user, assistant]} mixing all shapes.
  python gen_brief_data.py --n 400 --out writer8-train.jsonl --teacher Qwen/Qwen2.5-7B-Instruct --load-4bit
"""
import argparse, json, re, time, random
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer

# ── CANONICAL serve prompts (must match lib/oioxo/writer.ts EXACTLY) ──────────
PERSONA = (
    "You are oioxo — warm, clear and natural, a little witty, never robotic. "
    "Use ONLY the notes below; add nothing that isn't in them; never mention "
    '"notes" or sources, and never start with a preamble like "Here is".'
)

def prompt_answer(question, notes):
    return (
        f"{PERSONA}\n\n"
        "Answer the question in 2-4 clear sentences. If it asks for an opinion or judgment, "
        "give the honest case briefly and then a clear take; otherwise answer directly. "
        "If the notes lack the specific detail, say what IS known.\n\n"
        f"Notes:\n{notes}\n\nQuestion: {question}"
    )

def prompt_compare(question, notes):
    return (
        f"{PERSONA}\n\n"
        "Help the person decide. In 3-5 sentences: what each option is known for, the key "
        "difference, who each suits — then a short, clear recommendation. If the notes don't "
        "favour one, say it honestly depends on priorities.\n\n"
        f"Notes:\n{notes}\n\nQuestion: {question}"
    )

def prompt_converse(message, history=""):
    convo = f"Conversation so far:\n{history}\n\n" if history else ""
    return (
        "You are oioxo, a warm, upbeat and lightly witty assistant. Reply to the user in "
        "1-2 short, friendly, encouraging sentences — natural conversation, no lists, no "
        f"sources, no preamble.\n\n{convo}User: {message}\noioxo:"
    )

def prompt_summary(src): return f"Summarize the following clearly in 2-3 sentences:\n\n{src}"
def prompt_article(src): return f"Write a short, engaging article (about 120 words) based only on the facts below:\n\n{src}"

# ── teacher-only style steering (the student never sees these; it learns the voice
#    from the OUTPUTS). Appended to the teacher's instruction for quality. ────────
STEER_ANSWER  = " Be accurate and natural, faithful to the notes; no preamble, no source mentions."
STEER_COMPARE = " Be balanced and decisive; faithful to the notes for each side; warm and clear; no source mentions."
STEER_CONV    = " Be genuinely warm and a touch witty; never robotic; 1-2 sentences; do not give facts you cannot know."
STEER_SUMMARY = " Use only facts present in the text. Clear, natural, tight. No source mentions, no preamble."
STEER_ARTICLE = " Engaging voice: a hook, smooth flow, a closing line on why it matters. Only facts in the text. No preamble."

def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) >= 24]

def to_bullets(text, k=6):
    return "\n".join(f"- {s}" for s in sentences(text)[:k])

# Seed CATEGORIES of conversational user turns (the teacher expands each into a
# VARIED concrete line, so the student learns general warmth, not these strings).
CONV_SEEDS = [
    "an aspiration to learn or do something new",
    "a tired or low-energy feeling after a long day",
    "excitement about a personal plan or goal",
    "a casual greeting / how are you",
    "a small frustration with everyday life",
    "a light opinion or preference they share",
    "curiosity about what oioxo can do",
    "missing someone or feeling nostalgic",
]

class Teacher:
    def __init__(self, name, four_bit):
        self.tok = AutoTokenizer.from_pretrained(name)
        if four_bit:
            from transformers import BitsAndBytesConfig
            bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                     bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
            self.model = AutoModelForCausalLM.from_pretrained(name, quantization_config=bnb, device_map={"": 0}).eval()
        else:
            self.model = AutoModelForCausalLM.from_pretrained(name, dtype=torch.bfloat16, device_map={"": 0}).eval()

    def gen(self, user, system=None, max_new=260):
        msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": user}]
        prompt = self.tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        ids = self.tok(prompt, return_tensors="pt").to(self.model.device)
        with torch.no_grad():
            out = self.model.generate(**ids, max_new_tokens=max_new, do_sample=True, temperature=0.7, top_p=0.9, pad_token_id=self.tok.eos_token_id)
        return self.tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True).strip()

def clean(s):
    s = s.strip().strip('"')
    for junk in ("Here is", "Here's", "Sure,", "Certainly", "Of course"):
        if s.startswith(junk):
            s = s.split(":", 1)[-1].strip() if ":" in s[:40] else s
    return s.strip().strip('"')

# Reject a target that breaks the persona by referring to its own inputs — the
# model must NEVER say "the notes / the passage / according to the sources".
META = re.compile(r"\b(the notes?|in the notes?|the passage|the provided|according to the (notes?|passage|text|sources?)|not (specified|provided|mentioned|stated) in|sources? provided|notes? provided)\b", re.I)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=400, help="passages to draw (each yields several examples)")
    ap.add_argument("--out", default="writer8-train.jsonl")
    ap.add_argument("--teacher", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--load-4bit", action="store_true")
    args = ap.parse_args()
    assert torch.cuda.is_available()
    random.seed(0)

    print(f"teacher: {args.teacher} (4bit={args.load_4bit})")
    t = Teacher(args.teacher, args.load_4bit)

    ds = load_dataset("wikimedia/wikipedia", "20231101.simple", split="train", streaming=True)
    rows, t0 = [], time.time()

    def emit(prompt, answer, lo):
        a = clean(answer or "")
        if a and len(a) >= lo and not META.search(a):
            rows.append({"messages": [{"role": "user", "content": prompt}, {"role": "assistant", "content": a}]})

    seen = 0
    for ex in ds:
        if seen >= args.n:
            break
        words = " ".join(ex["text"].split()).split()
        if not (90 <= len(words) <= 320):
            continue
        title = ex.get("title", "").strip()
        src = " ".join(words[:170])
        seen += 1
        notes = to_bullets(src)
        if not notes:
            continue
        try:
            # 1) summary + article (keep writer7's strengths)
            emit(prompt_summary(src), t.gen(prompt_summary(src) + STEER_SUMMARY, max_new=200), 40)
            emit(prompt_article(src), t.gen(prompt_article(src) + STEER_ARTICLE, max_new=260), 80)
            # 2) answer-from-brief — teacher writes the question, then answers from notes
            q = clean(t.gen(f"Read this passage and write ONE natural question a curious person might ask that it answers. Reply with only the question.\n\n{src}", max_new=40))
            if q and "?" in q:
                emit(prompt_answer(q, notes), t.gen(prompt_answer(q, notes) + STEER_ANSWER, max_new=200), 40)
            # 3) compare-from-brief — teacher proposes a COMPARABLE alternative
            #    (same category) + its facts, so we weigh like-with-like (two cars,
            #    two foods), NOT random pairs ("Andouille vs Arithmetic"). Side A is
            #    real Wikipedia; side B is the teacher's facts (fine — the student
            #    learns to WEAVE labelled notes, grounded in whatever notes it's given).
            if title and seen % 2 == 0:
                alt = clean(t.gen(f'Name ONE well-known thing in the SAME category as "{title}" that people commonly compare it with. Reply with ONLY the name.', max_new=20))
                if alt and alt.lower() != title.lower() and 1 < len(alt) < 60 and "\n" not in alt:
                    af = t.gen(f'Give 3 short factual bullet points about "{alt}" (one per line, each starting with "- "). Facts only.', max_new=140)
                    altnotes = "\n".join(l.strip() for l in af.split("\n") if l.strip().startswith("-"))[:600]
                    if altnotes:
                        cq = random.choice([f"Which is better, {title} or {alt}?", f"Compare {title} and {alt}."])
                        cnotes = f"{title}:\n{to_bullets(src, 4)}\n\n{alt}:\n{altnotes}"
                        emit(prompt_compare(cq, cnotes), t.gen(prompt_compare(cq, cnotes) + STEER_COMPARE, max_new=240), 60)
            # 4) conversational turn (one per few passages, varied)
            if seen % 3 == 0:
                cat = random.choice(CONV_SEEDS)
                um = clean(t.gen(f"Write a single short, casual first-person chat message from a user that expresses: {cat}. Reply with only the message, no quotes.", max_new=40))
                if um:
                    emit(prompt_converse(um), t.gen(prompt_converse(um) + "\n" + STEER_CONV, max_new=80), 8)
        except Exception as e:
            print(f"[skip] {type(e).__name__}: {e}")
            continue
        if len(rows) % 25 == 0 and rows:
            print(f"{len(rows)} examples · {seen} passages · {(time.time()-t0)/60:.1f} min")

    random.shuffle(rows)
    with open(args.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"\nwrote {len(rows)} examples -> {args.out} in {(time.time()-t0)/60:.1f} min")
    # quick shape histogram
    import collections
    c = collections.Counter()
    for r in rows:
        u = r["messages"][0]["content"]
        c["compare" if "Help the person decide" in u else
          "answer" if "Answer the question in 2-4" in u else
          "converse" if "warm, upbeat" in u else
          "summary" if u.startswith("Summarize") else
          "article" if u.startswith("Write a short") else "other"] += 1
    print("shapes:", dict(c))

if __name__ == "__main__":
    main()
