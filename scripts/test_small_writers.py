"""
Find the WRITING FLOOR by size. The writer's real job is SYNTHESIS — take source
text (search snippets) and produce a clean summary / short article — not recall
from knowledge. Synthesis is easier, so small models may be good enough.

This loads a ladder of small instruct models, gives them the SAME source text +
the same two asks (summarize, write a short article), and prints each output so
we can see where quality breaks. Prints param count + approx q4/fp16 size too.

  python test_small_writers.py
  python test_small_writers.py --models HuggingFaceTB/SmolLM2-135M-Instruct
"""
import argparse, gc, time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

LADDER = [
    "HuggingFaceTB/SmolLM2-135M-Instruct",   # ~135M  -> ~70MB q4
    "HuggingFaceTB/SmolLM2-360M-Instruct",   # ~360M  -> ~190MB q4
    "Qwen/Qwen2.5-0.5B-Instruct",            # ~500M  -> ~280MB q4
    "Qwen/Qwen3-0.6B",                        # ~600M  baseline
]

# Source text = the kind of raw material our search step hands the writer.
SOURCE = (
    "Honeybees live in colonies of up to 60,000 individuals. A colony has one "
    "queen, thousands of female workers, and some male drones. The queen can lay "
    "up to 2,000 eggs a day. Workers do everything else: cleaning, feeding larvae, "
    "building wax comb, guarding the entrance, and foraging for nectar and pollen. "
    "Bees communicate the direction and distance of flowers with a 'waggle dance'. "
    "A single bee may visit 50 to 100 flowers per trip. Honeybees are responsible "
    "for pollinating about a third of the food crops humans eat. Colonies have "
    "declined in many regions due to pesticides, parasites like the varroa mite, "
    "and loss of wildflower habitat."
)

ASKS = [
    ("summary", f"Summarize the following in 2-3 sentences:\n\n{SOURCE}"),
    ("article", f"Using only the facts below, write a short, engaging article (about 120 words) titled 'The Busy World of Honeybees'.\n\n{SOURCE}"),
]

def approx(nparams):
    return f"{nparams/1e6:.0f}M params | ~{nparams*0.5/1e6:.0f}MB q4 | ~{nparams*2/1e6:.0f}MB fp16"

def run(model_id):
    print("\n" + "=" * 78 + f"\nMODEL: {model_id}\n" + "=" * 78)
    tok = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(model_id, dtype=torch.bfloat16, device_map={"": 0})
    model.eval()
    nparams = sum(p.numel() for p in model.parameters())
    print(approx(nparams))
    for label, ask in ASKS:
        msgs = [{"role": "user", "content": ask}]
        prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        prompt = prompt.replace("<think>\n\n</think>\n\n", "")  # Qwen3: skip thinking
        ids = tok(prompt, return_tensors="pt").to(model.device)
        t = time.time()
        with torch.no_grad():
            out = model.generate(**ids, max_new_tokens=220, do_sample=False, pad_token_id=tok.eos_token_id)
        gen = out[0][ids.input_ids.shape[1]:]
        txt = tok.decode(gen, skip_special_tokens=True).strip()
        toks = gen.shape[0]; dt = time.time() - t
        print(f"\n--- {label}  ({toks} tok, {toks/dt:.1f} tok/s) ---\n{txt}")
    del model; gc.collect(); torch.cuda.empty_cache()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="*", default=LADDER)
    args = ap.parse_args()
    assert torch.cuda.is_available()
    for m in args.models:
        try:
            run(m)
        except Exception as e:
            print(f"\n[FAILED {m}] {type(e).__name__}: {e}")

if __name__ == "__main__":
    main()
