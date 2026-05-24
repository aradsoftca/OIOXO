"""Quick qualitative eval: writer8 (new, with answer/compare/converse shapes) vs
writer7 (old, summary/article only) on the EXACT canonical serve prompts. Greedy
decode like production. Eyeball whether writer8 now answers-from-notes + compares
instead of rambling."""
import sys, torch
from transformers import AutoModelForCausalLM, AutoTokenizer

PERSONA = ('You are oioxo — warm, clear and natural, a little witty, never robotic. '
           'Use ONLY the notes below; add nothing that isn\'t in them; never mention '
           '"notes" or sources, and never start with a preamble like "Here is".')
def answer_p(q, n): return f"{PERSONA}\n\nAnswer the question in 2-4 clear sentences. If it asks for an opinion or judgment, give the honest case briefly and then a clear take; otherwise answer directly. If the notes lack the specific detail, say what IS known.\n\nNotes:\n{n}\n\nQuestion: {q}"
def compare_p(q, n): return f"{PERSONA}\n\nHelp the person decide. In 3-5 sentences: what each option is known for, the key difference, who each suits — then a short, clear recommendation. If the notes don't favour one, say it honestly depends on priorities.\n\nNotes:\n{n}\n\nQuestion: {q}"

CASES = [
    ('compare', compare_p('Which is better, Mazda 3 or Toyota Camry?',
        'Mazda 3:\n- Known for sporty handling and an upscale interior.\n- Returns about 35 mpg combined.\n\nToyota Camry:\n- Popular for reliability, comfort and strong resale value.\n- Offers more rear legroom and a roomier trunk.')),
    ('answer/opinion', answer_p('do you think sushi is delicious?',
        '- Sushi is a Japanese dish of vinegared rice with seafood or vegetables.\n- Many people enjoy it for its fresh, delicate taste and variety.\n- Tastes are subjective and some dislike raw fish.')),
    ('answer/fact', answer_p('is rice ok for someone with diabetes?',
        '- White rice has a high glycemic index and can raise blood sugar quickly.\n- Brown rice and smaller portions raise it more slowly.\n- Pairing rice with protein, fiber and vegetables blunts the spike.')),
]

def gen(model, tok, prompt):
    res = tok.apply_chat_template([{"role":"user","content":prompt}], tokenize=False, add_generation_prompt=True)
    ids = tok(res, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=200, do_sample=False, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True).strip()

for name in (sys.argv[1:] or ['writer7','writer8']):
    print('\n' + '='*70 + f'\n MODEL: {name}\n' + '='*70)
    tok = AutoTokenizer.from_pretrained(name)
    m = AutoModelForCausalLM.from_pretrained(name, dtype=torch.bfloat16, device_map={"":0}).eval()
    for label, p in CASES:
        print(f"\n[{label}]\n-> {gen(m, tok, p)}")
    del m; torch.cuda.empty_cache()
