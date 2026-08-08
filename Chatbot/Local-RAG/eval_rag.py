"""
Experiment 3: Labeled QA evaluation for Local RAG (faithfulness / hallucination proxies).

Metrics (research-honest; not full RAGAS unless installed):
  - RetrievalHit@K: gold site appears in retrieved contexts
  - AnswerCoverage: fraction of required answer keywords present
  - FaithfulnessProxy: answer tokens supported by retrieved context
  - HallucinationRate: 1 - FaithfulnessProxy (lexical)
  - AbstainAccuracy: for expect_abstain questions, model refuses/out-of-scope
  - Optional RAGAS faithfulness if `ragas` + datasets available
  - Human ratings + Cohen kappa via `human_eval_kappa.py`

Usage:
  # Clustering API should be running OR local rag_index.pkl present
  python eval_rag.py
  python eval_rag.py --generate   # also call local LLM (slower)
  python human_eval_kappa.py      # after filling human_ratings.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent.parent / "Clustering"))

QA_PATH = ROOT / "qa_set.json"
OUT_PATH = ROOT.parent.parent / "Clustering" / "Pickles" / "rag_eval_metrics.json"


def load_qa():
    with open(QA_PATH, encoding="utf-8") as f:
        return json.load(f)


def retrieve(query: str, top_k: int = 5):
    try:
        import requests

        r = requests.post(
            "http://localhost:8177/api/rag-context",
            json={"query": query, "top_k": top_k, "hybrid": True},
            timeout=20,
        )
        if r.status_code == 200:
            return r.json().get("contexts") or []
    except Exception:
        pass
    from rag_index import retrieve as local_retrieve

    return local_retrieve(query, top_k=top_k)


def faithfulness_proxy(answer: str, contexts: list[str]) -> float:
    if not answer or not contexts:
        return 0.0
    ctx = " ".join(contexts).lower()
    tokens = [t for t in re.findall(r"[a-zA-Z]{4,}", answer.lower())]
    if not tokens:
        return 0.0
    return sum(1 for t in tokens if t in ctx) / len(tokens)


def coverage(answer: str, keys: list[str]) -> float:
    if not keys:
        return 1.0
    a = answer.lower()
    return sum(1 for k in keys if k.lower() in a) / len(keys)


def abstain_ok(answer: str, keys: list[str]) -> bool:
    a = answer.lower()
    return any(k.lower() in a for k in keys)


def generate_answer(question: str, contexts: list[dict]) -> str:
    from local_llm import generate

    ctx = "\n\n".join(
        f"[{i+1}] {c.get('name')} ({c.get('aspect','')}): {c.get('document','')[:350]}"
        for i, c in enumerate(contexts[:4])
    )
    system = (
        "You are a heritage assistant. Use ONLY the context. "
        "If insufficient, say you cannot find it in the dataset. "
        "Format: REASONING: ...\nANSWER: ...\nCONFIDENCE: 0.0-1.0"
    )
    user = f"QUESTION: {question}\n\nCONTEXT:\n{ctx}"
    raw = generate(system, user, max_tokens=256)
    m = re.search(r"ANSWER:\s*(.*?)(?=\nCONFIDENCE:|$)", raw, re.I | re.S)
    return (m.group(1).strip() if m else raw).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate", action="store_true", help="Run local LLM answers")
    parser.add_argument("--top-k", type=int, default=5)
    args = parser.parse_args()

    qa = load_qa()
    rows = []
    for item in qa:
        q = item["question"]
        t0 = time.perf_counter()
        contexts = retrieve(q, top_k=args.top_k)
        ret_ms = (time.perf_counter() - t0) * 1000
        names = [c.get("name") for c in contexts]
        gold = item.get("gold_sites") or []
        hit = 1.0 if (not gold) or any(g in names for g in gold) else 0.0

        if args.generate:
            t1 = time.perf_counter()
            answer = generate_answer(q, contexts)
            gen_ms = (time.perf_counter() - t1) * 1000
        else:
            # Retrieval-only extractive baseline answer for metrics without LLM
            answer = " ".join(c.get("document", "") for c in contexts[:3])
            gen_ms = 0.0

        docs = [c.get("document", "") for c in contexts]
        faith = faithfulness_proxy(answer, docs)
        cov = coverage(answer, item.get("answer_must_include_any") or [])
        if item.get("expect_abstain"):
            cov = 1.0 if abstain_ok(answer, item.get("answer_must_include_any") or []) else 0.0

        rows.append(
            {
                "id": item["id"],
                "question": q,
                "retrieval_hit": hit,
                "answer_coverage": cov,
                "faithfulness_proxy": faith,
                "hallucination_proxy": 1.0 - faith,
                "retrieved": names,
                "latency_retrieve_ms": round(ret_ms, 2),
                "latency_generate_ms": round(gen_ms, 2),
                "answer_preview": answer[:240],
                "generated": bool(args.generate),
            }
        )
        print(
            f"{item['id']}: hit={hit:.0f} cov={cov:.2f} faith={faith:.2f} "
            f"hall={1-faith:.2f} ret={ret_ms:.0f}ms"
        )

    summary = {
        "n": len(rows),
        "mode": "generate" if args.generate else "retrieval-extractive",
        "RetrievalHit@K_mean": float(sum(r["retrieval_hit"] for r in rows) / len(rows)),
        "AnswerCoverage_mean": float(sum(r["answer_coverage"] for r in rows) / len(rows)),
        "FaithfulnessProxy_mean": float(sum(r["faithfulness_proxy"] for r in rows) / len(rows)),
        "HallucinationProxy_mean": float(sum(r["hallucination_proxy"] for r in rows) / len(rows)),
        "retrieve_ms_mean": float(sum(r["latency_retrieve_ms"] for r in rows) / len(rows)),
        "generate_ms_mean": float(sum(r["latency_generate_ms"] for r in rows) / len(rows)),
    }

    # Optional RAGAS
    ragas_note = "ragas not run"
    if args.generate:
        try:
            import importlib.util

            if importlib.util.find_spec("ragas") is None:
                ragas_note = "ragas package not installed (optional)"
            else:
                ragas_note = "ragas installed — full suite left for offline notebook"
        except Exception as e:
            ragas_note = str(e)

    out = {"summary": summary, "per_question": rows, "ragas": ragas_note}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print("\nSUMMARY:", json.dumps(summary, indent=2))
    print(f"Saved {OUT_PATH}")


if __name__ == "__main__":
    main()
