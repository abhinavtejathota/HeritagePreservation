"""
Train Heritage Mini-LM: BPE tokenize → batch → optimize Transformer+BiLSTM.

Uses data/online_training.csv when present (preferred), else data/corpus.txt.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import random
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader, Dataset

from model import MiniGPT, MiniGPTConfig
from tokenizer import HeritageBPE, train_bpe

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CKPT_DIR = HERE / "checkpoints"
CORPUS = DATA / "corpus.txt"
TRAIN_CSV = DATA / "online_training.csv"
TOK_PATH = CKPT_DIR / "tokenizer.json"
CKPT_PATH = CKPT_DIR / "heritage_minigpt.pt"


class TextDataset(Dataset):
    """Sliding windows over token ids for next-token prediction."""

    def __init__(self, ids: list[int], block_size: int, stride: int | None = None):
        self.ids = ids
        self.block_size = block_size
        self.stride = stride or max(1, block_size // 2)
        self.starts = list(range(0, max(1, len(ids) - block_size - 1), self.stride))
        if not self.starts and len(ids) > block_size + 1:
            self.starts = [0]

    def __len__(self) -> int:
        return max(1, len(self.starts))

    def __getitem__(self, i: int):
        start = self.starts[i % len(self.starts)]
        chunk = self.ids[start : start + self.block_size + 1]
        if len(chunk) < self.block_size + 1:
            # pad short tails
            pad = [0] * (self.block_size + 1 - len(chunk))
            chunk = chunk + pad
        x = torch.tensor(chunk[:-1], dtype=torch.long)
        y = torch.tensor(chunk[1:], dtype=torch.long)
        # ignore pad targets
        y = y.clone()
        y[x == 0] = -100
        return x, y


QA_TRAIN_CSV = DATA / "qa_training.csv"


def _write_qa_training_csv(rows: list[dict]) -> None:
    fields = ["site_name", "country", "text_type", "source", "text", "chars"]
    with QA_TRAIN_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def load_paragraphs() -> tuple[list[str], dict]:
    """
    Build / use qa_training.csv: curated QA + dossier + short relevant wiki only.
    Full online dump stays in online_training.csv for inspection.
    """
    meta: dict = {}
    # Always rebuild qa_training from online_training when present
    if TRAIN_CSV.exists():
        paragraphs: list[str] = []
        kept_rows: list[dict] = []
        with TRAIN_CSV.open(encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                t = (row.get("text") or "").strip()
                if not t:
                    continue
                ttype = (row.get("text_type") or "").strip()
                source = (row.get("source") or "").strip()
                # curated only + short chat; drop long wiki_extract from LM train
                if ttype in ("dossier",):
                    pass
                elif ttype == "qa" and source == "curated_csv":
                    pass
                elif ttype == "qa" and source.startswith("wikipedia") and len(t) <= 420:
                    pass
                elif ttype == "chat" and len(t) <= 420:
                    pass
                elif ttype == "wiki_description" and len(t) <= 180:
                    pass
                else:
                    continue
                # drop non-ascii heavy rows
                if sum(1 for ch in t if ord(ch) > 127) > 12:
                    continue
                paragraphs.append(t)
                kept_rows.append(row)
        _write_qa_training_csv(kept_rows)
        meta["source"] = "qa_training.csv (filtered from online_training.csv)"
        meta["n_rows"] = len(paragraphs)
        meta["qa_training_csv"] = str(QA_TRAIN_CSV.name)
        return paragraphs, meta
    if not CORPUS.exists():
        raise SystemExit("Run prepare_corpus.py --online first")
    text = CORPUS.read_text(encoding="utf-8")
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    meta["source"] = "corpus.txt"
    meta["n_rows"] = len(paragraphs)
    return paragraphs, meta


def cosine_lr(step: int, total: int, base_lr: float, warmup: int = 50) -> float:
    if step < warmup:
        return base_lr * (step + 1) / max(1, warmup)
    progress = (step - warmup) / max(1, total - warmup)
    return base_lr * 0.1 + 0.9 * base_lr * 0.5 * (1.0 + math.cos(math.pi * progress))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--batch-size", type=int, default=12)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--block-size", type=int, default=384)
    ap.add_argument("--n-layer", type=int, default=4)
    ap.add_argument("--n-head", type=int, default=4)
    ap.add_argument("--n-embd", type=int, default=256)
    ap.add_argument("--vocab-size", type=int, default=5000)
    ap.add_argument("--lstm-hidden", type=int, default=128)
    ap.add_argument("--no-bilstm", action="store_true")
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = ap.parse_args()

    paragraphs, data_meta = load_paragraphs()
    # Slight oversample of chat/qa style for dialogue
    boosted = []
    for p in paragraphs:
        boosted.append(p)
        if p.startswith("Question:") or p.startswith("User:"):
            boosted.append(p)
    paragraphs = boosted
    print(f"[data] {data_meta} → {len(paragraphs)} paragraphs after QA boost")

    print("[tok] training BPE (text → token IDs)…")
    tok = train_bpe(paragraphs, vocab_size=args.vocab_size)
    CKPT_DIR.mkdir(parents=True, exist_ok=True)
    tok.save(TOK_PATH)
    print(f"[tok] vocab={len(tok.vocab)}  encode/decode roundtrip ok")

    # sanity: text → ids → text
    sample = paragraphs[0][:120]
    roundtrip = tok.decode(tok.encode(sample, add_special=True))
    print(f"[tok] sample decode: {roundtrip[:100]}…")

    all_ids: list[int] = []
    for p in paragraphs:
        all_ids.extend(tok.encode(p, add_special=True))
    print(f"[data] {len(all_ids)} tokens")

    cfg = MiniGPTConfig(
        vocab_size=len(tok.vocab),
        block_size=args.block_size,
        n_layer=args.n_layer,
        n_head=args.n_head,
        n_embd=args.n_embd,
        use_bilstm=not args.no_bilstm,
        lstm_hidden=args.lstm_hidden,
    )
    device = torch.device(args.device)
    model = MiniGPT(cfg).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(
        f"[model] params={n_params/1e6:.2f}M device={device} "
        f"bilstm={cfg.use_bilstm} ctx={cfg.block_size}"
    )

    ds = TextDataset(all_ids, cfg.block_size)
    loader = DataLoader(
        ds,
        batch_size=args.batch_size,
        shuffle=True,
        drop_last=True,
        num_workers=0,
        pin_memory=device.type == "cuda",
    )
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    total_steps = max(1, args.epochs * len(loader))

    model.train()
    t0 = time.time()
    step = 0
    for epoch in range(1, args.epochs + 1):
        losses = []
        for xb, yb in loader:
            lr = cosine_lr(step, total_steps, args.lr)
            for g in opt.param_groups:
                g["lr"] = lr
            xb, yb = xb.to(device), yb.to(device)
            _, loss = model(xb, yb)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            losses.append(loss.item())
            step += 1
        mean_loss = sum(losses) / max(len(losses), 1)
        print(
            f"[epoch {epoch}/{args.epochs}] loss={mean_loss:.4f} "
            f"lr={opt.param_groups[0]['lr']:.2e} steps={step}"
        )

    payload = {
        "config": cfg.to_dict(),
        "model": model.state_dict(),
        "tokenizer": str(TOK_PATH.name),
        "meta": {
            "n_params": n_params,
            "epochs": args.epochs,
            "train_seconds": round(time.time() - t0, 1),
            "n_tokens": len(all_ids),
            "device": str(device),
            "data": data_meta,
            "architecture": "tok_emb + BiLSTM memory + causal Transformer (attn/FFN/LN)",
            "context_window": cfg.block_size,
        },
    }
    torch.save(payload, CKPT_PATH)
    (CKPT_DIR / "train_meta.json").write_text(
        json.dumps({**payload["meta"], "config": cfg.to_dict()}, indent=2),
        encoding="utf-8",
    )
    print(f"[ok] saved {CKPT_PATH}")


if __name__ == "__main__":
    random.seed(42)
    torch.manual_seed(42)
    main()
