"""
Dense vs sparse vs hybrid RAG retrieval ablation on labeled QA.

Output: Clustering/Pickles/rag_ablation_metrics.json
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(ROOT / "Chatbot" / "Local-RAG"))

QA_PATH = ROOT / "Chatbot" / "Local-RAG" / "qa_set.json"
OUT = BASE / "Pickles" / "rag_ablation_metrics.json"


def load_qa():
    with open(QA_PATH, encoding="utf-8") as f:
        return json.load(f)


def hit_at_k(names: list, gold: list) -> float:
    if not gold:
        return 1.0  # abstain queries: retrieval not scored as miss
    return 1.0 if any(g in names for g in gold) else 0.0


def main():
    from rag_index import retrieve

    qa = load_qa()
    modes = {
        "dense": 1.0,
        "sparse": 0.0,
        "hybrid": None,  # index default alpha
    }
    summary = {}
    per_mode = {}

    for mode, alpha in modes.items():
        hits = []
        rows = []
        for item in qa:
            if item.get("expect_abstain"):
                continue
            ctx = retrieve(item["question"], top_k=5, alpha=alpha)
            names = [c.get("name") for c in ctx]
            h = hit_at_k(names, item.get("gold_sites") or [])
            hits.append(h)
            rows.append(
                {
                    "id": item["id"],
                    "hit": h,
                    "retrieved": names[:5],
                    "gold": item.get("gold_sites"),
                }
            )
        mean_hit = float(sum(hits) / len(hits)) if hits else 0.0
        summary[mode] = {
            "n_scored": len(hits),
            "RetrievalHit@5_mean": mean_hit,
            "alpha": alpha if alpha is not None else "index_default",
        }
        per_mode[mode] = rows
        print(f"{mode}: Hit@5={mean_hit:.3f} (n={len(hits)})")

    # Winner
    best = max(summary.items(), key=lambda kv: kv[1]["RetrievalHit@5_mean"])
    out = {
        "summary": summary,
        "best_mode": best[0],
        "note": "Abstain questions excluded from Hit@K. Hybrid uses index alpha.",
        "per_mode": per_mode,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"Saved {OUT} best={best[0]}")


if __name__ == "__main__":
    main()
