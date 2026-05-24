"""
oioxo Code P6 — fine-tune the tiny CONDUCTOR for the loop's orchestration roles
(PLAN / RANK / FIX). It does NOT need world-knowledge of code — it needs to turn
an exact error + buggy code into the minimal edit, pick the candidate that will
pass, and sketch a short plan. The data is oracle-labeled (verified red->green
repairs + an oracle-validated seed), so the targets are correct by construction.

A 0.5B instruct base is plenty (structured I/O, not knowledge); full FT fits an
8GB 3070 at this size. Mirrors train_writer.py conventions.

  python train_conductor.py --data conductor-seed.jsonl --out conductor --epochs 3

Then quantize for the browser the same way as writer8 (scripts/quantize_mixed_w8.py)
and load via the existing web-llm / transformers.js runtime.
"""
import argparse, torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTTrainer, SFTConfig

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Qwen/Qwen2.5-0.5B-Instruct")
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="conductor")
    ap.add_argument("--epochs", type=float, default=3.0)
    ap.add_argument("--max-steps", type=int, default=-1)   # set small (e.g. 2) to smoke-test the pipeline
    ap.add_argument("--lr", type=float, default=1.5e-5)    # full FT -> low lr
    ap.add_argument("--bsz", type=int, default=2)
    ap.add_argument("--grad-accum", type=int, default=8)
    ap.add_argument("--max-seq", type=int, default=2048)   # FIX prompts carry code
    args = ap.parse_args()
    assert torch.cuda.is_available(), "need a CUDA GPU (arad RTX 3070)"
    print(f"GPU: {torch.cuda.get_device_name(0)} | base: {args.base}")

    tok = AutoTokenizer.from_pretrained(args.base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(args.base, dtype=torch.bfloat16, device_map={"": 0})
    model.config.use_cache = False

    ds = load_dataset("json", data_files=args.data, split="train")
    print(f"examples: {len(ds)}")

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
        assistant_only_loss=True,   # learn the targets, not the (long) prompts
        packing=False,
    )
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=ds)
    trainer.train()
    trainer.save_model(args.out)
    tok.save_pretrained(args.out)
    print(f"saved conductor -> {args.out}")

if __name__ == "__main__":
    main()
