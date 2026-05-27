import json, torch
from transformers import AutoModelForCausalLM, AutoTokenizer

M = r"C:\science\brain\querygen-final"
SYSTEM = (
    "You turn the user's message into a SET of 3 DIVERSE web-search queries that attack "
    "it from different angles (different keywords/synonyms, the specific entity or error, "
    "the key constraint, the broader category). Each query is concise KEYWORDS (max 7 "
    "words): drop filler, emotion, greetings and first-person; KEEP real entities (brands, "
    "models, places, error text) and the intent word (\"how to\", \"fix\", \"review\", "
    "\"best\", a year). Not paraphrases — genuinely different angles. Output ONLY JSON: "
    "{\"queries\":[\"...\",\"...\",\"...\"]}."
)
tok = AutoTokenizer.from_pretrained(M)
dev = "cuda" if torch.cuda.is_available() else "cpu"
model = AutoModelForCausalLM.from_pretrained(M, torch_dtype=torch.float16 if dev == "cuda" else torch.float32).to(dev).eval()

def query_of(msg):
    ids = tok.apply_chat_template([{"role": "system", "content": SYSTEM}, {"role": "user", "content": msg}],
                                  add_generation_prompt=True, return_tensors="pt").to(dev)
    out = model.generate(ids, max_new_tokens=48, do_sample=False, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids.shape[1]:], skip_special_tokens=True).strip()

# The user's own examples + the base-model failure cases (held-out phrasings).
tests = [
    "how can I ride a bike? I'm 40, first time, I have fear of falling",
    "my car mazda 3 has a noise under the seat rail, step by step guide me to fix it",
    "find best review product for cleaning car vacuum",
    "estimate revenue a carwash in mongolia",
    "what is best gift for my wife (60 yrs old), she does not like jewelery",
    "new way for making tts so light on cpu instead of gpu",
    "my rice is not white what should i do",
    "what is best host in 2026",
]
for q in tests:
    raw = query_of(q)
    try:
        j = json.loads(raw); line = " | ".join(j.get("queries", [])) or ("RAW: " + raw[:120])
    except Exception:
        line = "RAW(badjson): " + raw[:120]
    print(f"\nMSG: {q}\n  -> {line}")
