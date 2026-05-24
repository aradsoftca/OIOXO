"""
Train the Tier-1 ENCODER: all-MiniLM-L6-v2 + four tiny classification heads
(intent / shape / move / media-need). Multi-task cross-entropy. The base is the
SAME model the browser already loads for embeddings, so at serve time we run one
feature-extraction pass and apply the heads — ~0 extra MB. (ANSWER_BRAIN.md §6.)

  python train_encoder.py --data encoder-train.jsonl --out encoder --epochs 6

Saves: encoder/ (fine-tuned base via save_pretrained) + encoder/heads.pt +
encoder/labels.json. Export to ONNX/transformers.js is a later step.
"""
import argparse, json, random
import torch, torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModel, AutoTokenizer

HEADS = ["intent", "shape", "move", "media"]

class DS(Dataset):
    def __init__(self, rows, maps):
        self.rows, self.maps = rows, maps
    def __len__(self): return len(self.rows)
    def __getitem__(self, i):
        r = self.rows[i]
        return r["text"], {h: self.maps[h][str(r[h])] for h in HEADS}

def mean_pool(out, mask):
    h = out.last_hidden_state
    m = mask.unsqueeze(-1).float()
    return (h * m).sum(1) / m.sum(1).clamp(min=1e-9)

class Encoder(nn.Module):
    def __init__(self, base, sizes):
        super().__init__()
        self.base = base
        d = base.config.hidden_size
        self.heads = nn.ModuleDict({h: nn.Linear(d, sizes[h]) for h in HEADS})
    def forward(self, ids, mask):
        pooled = mean_pool(self.base(input_ids=ids, attention_mask=mask), mask)
        return {h: self.heads[h](pooled) for h in HEADS}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--base", default="sentence-transformers/all-MiniLM-L6-v2")
    ap.add_argument("--out", default="encoder")
    ap.add_argument("--epochs", type=float, default=6.0)
    ap.add_argument("--bsz", type=int, default=32)
    ap.add_argument("--lr", type=float, default=3e-5)
    args = ap.parse_args()
    assert torch.cuda.is_available()
    dev = "cuda"

    rows = [json.loads(l) for l in open(args.data, encoding="utf-8")]
    random.seed(0); random.shuffle(rows)
    # Build label maps + a small held-out split for accuracy.
    maps, sizes = {}, {}
    for h in HEADS:
        vals = sorted({str(r[h]) for r in rows})
        maps[h] = {v: i for i, v in enumerate(vals)}
        sizes[h] = len(vals)
    n_val = max(1, len(rows) // 10)
    val, train = rows[:n_val], rows[n_val:]
    print(f"train {len(train)} · val {len(val)} · sizes {sizes}")

    tok = AutoTokenizer.from_pretrained(args.base)
    base = AutoModel.from_pretrained(args.base)
    model = Encoder(base, sizes).to(dev)

    def collate(batch):
        texts = [b[0] for b in batch]
        enc = tok(texts, padding=True, truncation=True, max_length=64, return_tensors="pt")
        labels = {h: torch.tensor([b[1][h] for b in batch]) for h in HEADS}
        return enc, labels

    dl = DataLoader(DS(train, maps), batch_size=args.bsz, shuffle=True, collate_fn=collate)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    ce = nn.CrossEntropyLoss()
    steps = int(len(dl) * args.epochs)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, steps))

    model.train()
    step = 0
    for ep in range(int(args.epochs)):
        for enc, labels in dl:
            ids, mask = enc["input_ids"].to(dev), enc["attention_mask"].to(dev)
            logits = model(ids, mask)
            loss = sum(ce(logits[h], labels[h].to(dev)) for h in HEADS)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            step += 1
            if step % 20 == 0:
                print(f"ep{ep} step{step} loss {loss.item():.3f}")

    # eval
    model.eval()
    enc, labels = collate([DS(val, maps)[i] for i in range(len(val))])
    with torch.no_grad():
        logits = model(enc["input_ids"].to(dev), enc["attention_mask"].to(dev))
    print("VAL acc:", {h: round((logits[h].argmax(1).cpu() == labels[h]).float().mean().item(), 3) for h in HEADS})

    # save base (HF layout) + heads + label maps
    model.base.save_pretrained(args.out)
    tok.save_pretrained(args.out)
    torch.save({h: model.heads[h].state_dict() for h in HEADS}, f"{args.out}/heads.pt")
    json.dump({"maps": maps, "sizes": sizes, "heads": HEADS}, open(f"{args.out}/labels.json", "w"), indent=2)
    print(f"saved encoder -> {args.out}")

if __name__ == "__main__":
    main()
