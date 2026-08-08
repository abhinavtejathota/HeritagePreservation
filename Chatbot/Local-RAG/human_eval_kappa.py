"""
Optional human faithfulness ratings + Cohen's kappa.

1. Fill Chatbot/Local-RAG/human_ratings.json from the template (two raters).
2. python human_eval_kappa.py

Also tries optional RAGAS if installed (best-effort; skips cleanly if missing).

Output: Clustering/Pickles/human_kappa_metrics.json
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RATINGS = ROOT / "human_ratings.json"
TEMPLATE = ROOT / "human_ratings_template.json"
OUT = ROOT.parent.parent / "Clustering" / "Pickles" / "human_kappa_metrics.json"


def cohen_kappa(a: list[int], b: list[int]) -> float:
    """Binary or ordinal labels as ints."""
    n = len(a)
    if n == 0 or n != len(b):
        return float("nan")
    labels = sorted(set(a) | set(b))
    po = sum(1 for x, y in zip(a, b) if x == y) / n
    pe = 0.0
    for lab in labels:
        pe += (a.count(lab) / n) * (b.count(lab) / n)
    if pe >= 1.0:
        return 1.0
    return (po - pe) / (1.0 - pe)


def try_ragas_note() -> str:
    try:
        import importlib.util

        if importlib.util.find_spec("ragas") is None:
            return "ragas not installed — lexical proxy remains primary (eval_rag.py)"
        return (
            "ragas is installed. Run a notebook with ragas.metrics.faithfulness "
            "on qa_set generations when preparing the paper appendix."
        )
    except Exception as e:
        return str(e)


def main():
    if not RATINGS.exists():
        # Ensure template exists
        if not TEMPLATE.exists():
            sample = {
                "scale": "1=ungrounded … 5=fully grounded in retrieved context",
                "instructions": "Rate each answer independently; do not discuss until both finish.",
                "rater_A": [{"id": "q1", "faithfulness_1to5": 0}],
                "rater_B": [{"id": "q1", "faithfulness_1to5": 0}],
            }
            with open(TEMPLATE, "w", encoding="utf-8") as f:
                json.dump(sample, f, indent=2)
        out = {
            "status": "awaiting_human_ratings",
            "template": str(TEMPLATE),
            "copy_to": str(RATINGS),
            "ragas": try_ragas_note(),
            "note": "Copy template → human_ratings.json and fill rater_A / rater_B scores.",
        }
        OUT.parent.mkdir(parents=True, exist_ok=True)
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
        print(json.dumps(out, indent=2))
        return

    data = json.loads(RATINGS.read_text(encoding="utf-8"))
    a_map = {r["id"]: int(r["faithfulness_1to5"]) for r in data["rater_A"]}
    b_map = {r["id"]: int(r["faithfulness_1to5"]) for r in data["rater_B"]}
    ids = sorted(set(a_map) & set(b_map))
    a = [a_map[i] for i in ids]
    b = [b_map[i] for i in ids]
    # also binary grounded (>=4)
    a_bin = [1 if x >= 4 else 0 for x in a]
    b_bin = [1 if x >= 4 else 0 for x in b]
    result = {
        "n_items": len(ids),
        "cohen_kappa_ordinal": cohen_kappa(a, b),
        "cohen_kappa_binary_ge4": cohen_kappa(a_bin, b_bin),
        "mean_A": sum(a) / len(a) if a else None,
        "mean_B": sum(b) / len(b) if b else None,
        "ids": ids,
        "ragas": try_ragas_note(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
