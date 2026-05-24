"""
oioxo Code — OPTIONAL coder-LoRA. NOT a new coder (training one from scratch is a
trap — we can't out-train Qwen2.5-Coder and it improves for free). This is a thin
LoRA *adapter* on top of the existing strong coder that nudges it toward OUR loop's
behavior: emit the SMALLEST diff, in our fenced-by-PATH format, fixing from the
exact compiler error, calling our retrieved APIs. LoRA (not full FT) on purpose —
it preserves the base model's broad coding ability (no catastrophic forgetting)
and the adapter is tiny (~tens of MB).

Data = the device-collected trajectories (export from the workspace → JSONL of
{messages:[user,assistant]}), i.e. real verified red→green repairs. Same shape as
the conductor set; here we point it at the FIX examples.

  python train_coder_lora.py --data oioxo-trajectories.jsonl --out coder-lora

Serving: merge + convert to GGUF for Ollama / the native tier (`--merge`), where a
base+adapter or merged model loads directly. The browser (web-llm/MLC) tier would
need an MLC recompile of the merged weights — so the LoRA lands first on the
heavy/desktop tier; the browser keeps the stock Qwen2.5-Coder until a merged MLC
build is produced. Mirrors train_conductor.py / train_writer.py conventions.
"""
import argparse, torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from trl import SFTTrainer, SFTConfig

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Qwen/Qwen2.5-Coder-1.5B-Instruct",
                    help="the coder to adapt (1.5B for breadth of devices; 7B for the Pro tier)")
    ap.add_argument("--data", required=True, help="JSONL of {messages:[user,assistant]} fix examples")
    ap.add_argument("--out", default="coder-lora")
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--max-steps", type=int, default=-1)   # set small to smoke-test
    ap.add_argument("--lr", type=float, default=1e-4)      # LoRA -> higher lr than full FT
    ap.add_argument("--bsz", type=int, default=1)
    ap.add_argument("--grad-accum", type=int, default=16)
    ap.add_argument("--max-seq", type=int, default=4096)   # code + error context is long
    ap.add_argument("--lora-r", type=int, default=16)
    ap.add_argument("--lora-alpha", type=int, default=32)
    ap.add_argument("--lora-dropout", type=float, default=0.05)
    ap.add_argument("--merge", action="store_true", help="also save base+adapter merged (for GGUF/Ollama)")
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

    # LoRA on attention + MLP projections — adapt behavior, keep base knowledge.
    lora = LoraConfig(
        r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout,
        bias="none", task_type="CAUSAL_LM",
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
        assistant_only_loss=True,   # learn the edit, not the (long) prompt
        packing=False,
    )
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=ds, peft_config=lora)
    trainer.train()
    trainer.save_model(args.out)            # the LoRA adapter
    tok.save_pretrained(args.out)
    print(f"saved coder-LoRA adapter -> {args.out}")

    if args.merge:
        merged = trainer.model.merge_and_unload()
        merged.save_pretrained(args.out + "-merged")
        tok.save_pretrained(args.out + "-merged")
        print(f"saved merged base+adapter -> {args.out}-merged  (convert to GGUF for Ollama)")

if __name__ == "__main__":
    main()
