"""
Xonvert brain — distil the deterministic decider into a small model (LoRA).

Teaches Qwen3-0.6B to emit our routing JSON {action, tools?, query?} directly,
so the "smartness" lives in weights (the moat) instead of a fragile prompt. The
labels come from our capability-graph oracle (gen-dataset.ts), so the model
learns OUR feasibility judgement, not generic web behaviour.

Runs on an 8GB GPU (RTX 3070). bf16 base + LoRA adapters fit with room to spare.

  Smoke:  python train_brain.py --data brain-train.jsonl --max-steps 20 --out out-smoke
  Full:   python train_brain.py --data brain-train.jsonl --epochs 3 --out out
"""
import argparse, json, os
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from trl import SFTTrainer, SFTConfig

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Qwen/Qwen3-0.6B")
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="out")
    ap.add_argument("--epochs", type=float, default=3.0)
    ap.add_argument("--max-steps", type=int, default=-1)   # >0 overrides epochs (smoke)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--bsz", type=int, default=8)
    ap.add_argument("--grad-accum", type=int, default=2)
    ap.add_argument("--max-seq", type=int, default=1024)
    ap.add_argument("--merge", action="store_true", help="also save a merged fp16 model")
    args = ap.parse_args()

    assert torch.cuda.is_available(), "no CUDA — this must run on the GPU box"
    print(f"GPU: {torch.cuda.get_device_name(0)}  | base: {args.base}")

    tok = AutoTokenizer.from_pretrained(args.base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.base, torch_dtype=torch.bfloat16, device_map={"": 0}
    )
    model.config.use_cache = False

    ds = load_dataset("json", data_files=args.data, split="train")
    print(f"examples: {len(ds)}  | sample keys: {list(ds[0].keys())}")

    lora = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )

    cfg = SFTConfig(
        output_dir=args.out,
        per_device_train_batch_size=args.bsz,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        max_length=args.max_seq,
        logging_steps=5,
        save_strategy="no",
        bf16=True,
        warmup_ratio=0.05,
        lr_scheduler_type="cosine",
        report_to=[],
        # Full-sequence loss. (assistant_only_loss needs {% generation %} markers
        # Qwen's template lacks; the completions here are short JSON and we only
        # ever read the generated continuation at inference, so masking the long
        # prompt buys little and the unmasked path is robust + correct.)
        assistant_only_loss=False,
        packing=False,
    )

    trainer = SFTTrainer(model=model, args=cfg, train_dataset=ds, peft_config=lora)
    trainer.train()

    os.makedirs(args.out, exist_ok=True)
    trainer.save_model(args.out)         # LoRA adapter
    tok.save_pretrained(args.out)
    print(f"saved adapter -> {args.out}")

    if args.merge:
        merged = trainer.model.merge_and_unload()
        mdir = os.path.join(args.out, "merged")
        merged.save_pretrained(mdir, safe_serialization=True)
        tok.save_pretrained(mdir)
        print(f"saved merged model -> {mdir}")

if __name__ == "__main__":
    main()
