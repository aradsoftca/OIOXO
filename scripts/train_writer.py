"""
Fine-tune the tiny WRITER (SmolLM2-135M) on the synthesis distillation set so a
~67MB model produces clean summaries / short articles from source text in our
voice. Full fine-tune (135M fits comfortably on 8GB) — at this size full FT
beats LoRA for quality.

  python train_writer.py --data synth-train.jsonl --out writer --epochs 3
"""
import argparse, torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTTrainer, SFTConfig

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="HuggingFaceTB/SmolLM2-135M-Instruct")
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="writer")
    ap.add_argument("--epochs", type=float, default=3.0)
    ap.add_argument("--max-steps", type=int, default=-1)
    ap.add_argument("--lr", type=float, default=1.5e-5)   # full FT -> low lr
    ap.add_argument("--bsz", type=int, default=4)
    ap.add_argument("--grad-accum", type=int, default=4)
    ap.add_argument("--max-seq", type=int, default=1024)
    args = ap.parse_args()
    assert torch.cuda.is_available()
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
        logging_steps=10,
        save_strategy="no",
        bf16=True,
        warmup_ratio=0.05,
        lr_scheduler_type="cosine",
        report_to=[],
        assistant_only_loss=False,
        packing=False,
    )
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=ds)
    trainer.train()
    trainer.save_model(args.out)
    tok.save_pretrained(args.out)
    print(f"saved writer -> {args.out}")

if __name__ == "__main__":
    main()
