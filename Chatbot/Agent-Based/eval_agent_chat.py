"""
Evaluate Agent-Based chat stack for research metrics (honest proxies).

Measures:
  1) Hybrid retrieval Hit@K (Clustering /api/rag-context) on curated site QA
  2) Extractive answer keyword coverage (country / architecture / era)
  3) Heritage Mini-LM: site-name mention rate, keyword coverage, latency, PPL proxy
  4) Tokenizer round-trip character recovery on dossier snippets

Writes:
  docs/agent_chat_metrics.json
  (also prints a paper-ready summary)

Usage:
  python Chatbot/Agent-Based/eval_agent_chat.py
  python Chatbot/Agent-Based/eval_agent_chat.py --skip-minigpt
  python Chatbot/Agent-Based/eval_agent_chat.py --skip-live
"""
from __future__ import annotations

import argparse
import json
import math
import re
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd
import torch

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "Dataset" / "heritage_sites_v2.csv"
OUT = ROOT / "docs" / "agent_chat_metrics.json"
HERITAGE = Path(__file__).resolve().parent / "heritage-lm"
CLUSTERING = "http://localhost:8177"
AGENT = "http://localhost:8180"


def http_json(method: str, url: str, body: dict | None = None, timeout: float = 20.0):
    data = None
    headers = {"Content-Type": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return True, json.loads(resp.read().decode("utf-8")), None
    except Exception as e:
        return False, None, str(e)


def name_tokens(name: str) -> list[str]:
    stop = {"the", "of", "and", "group", "monuments", "site", "ruins"}
    return [t for t in re.findall(r"[A-Za-z]{3,}", name.lower()) if t not in stop]


def coverage(answer: str, keys: list[str]) -> float:
    if not keys:
        return 1.0
    a = (answer or "").lower()
    return sum(1 for k in keys if k and k.lower() in a) / len(keys)


def build_qa(df: pd.DataFrame) -> list[dict]:
    items = []
    for _, r in df.iterrows():
        name = str(r.get("Name", "")).strip()
        if not name:
            continue
        country = str(r.get("Country", "")).strip()
        continent = str(r.get("Continent", "")).strip()
        arch = str(r.get("Architecture Style", "")).strip()
        era = str(r.get("Era", "")).strip()
        items.append(
            {
                "q": f"Where is {name}?",
                "site": name,
                "keys": [k for k in [country, continent, name.split()[0]] if k],
                "kind": "location",
            }
        )
        items.append(
            {
                "q": f"What is the architecture of {name}?",
                "site": name,
                "keys": [k for k in [arch, name.split()[0]] if k],
                "kind": "architecture",
            }
        )
        items.append(
            {
                "q": f"What era is {name} from?",
                "site": name,
                "keys": [k for k in [era, name.split()[0]] if k],
                "kind": "era",
            }
        )
    return items


def retrieve_contexts(query: str, top_k: int = 5) -> tuple[list, float | None, str]:
    """Try Clustering HTTP, then local Clustering rag_index."""
    t0 = time.time()
    ok, data, err = http_json(
        "POST",
        f"{CLUSTERING}/api/rag-context",
        {"query": query, "top_k": top_k, "hybrid": True},
        timeout=5,
    )
    if ok and data is not None:
        return data.get("contexts") or [], (time.time() - t0) * 1000, "clustering_http"

    # Offline fallback (same as Local-RAG eval)
    try:
        import sys

        sys.path.insert(0, str(ROOT / "Clustering"))
        from rag_index import retrieve as local_retrieve

        ctxs = local_retrieve(query, top_k=top_k)
        return ctxs or [], (time.time() - t0) * 1000, "local_rag_index"
    except Exception as e:
        return [], None, f"unavailable:{e}"


def eval_retrieval(qa: list[dict], top_k: int = 5, max_items: int = 60) -> dict:
    hits = []
    latencies = []
    source = None
    subset = qa[:max_items]
    for item in subset:
        ctxs, lat, src = retrieve_contexts(item["q"], top_k=top_k)
        source = source or src
        if lat is not None:
            latencies.append(lat)
        if not ctxs and src.startswith("unavailable"):
            break
        blob = " ".join(
            str(c.get("text") or c.get("snippet") or c.get("name") or c)
            if isinstance(c, dict)
            else str(c)
            for c in ctxs
        ).lower()
        toks = name_tokens(item["site"])
        hits.append(1 if any(t in blob for t in toks) or item["site"].lower() in blob else 0)
    return {
        "n": len(hits),
        "clustering_reachable": bool(hits) and source in ("clustering_http", "local_rag_index"),
        "source": source,
        "answered": sum(hits),
        "hit_at_k": round(sum(hits) / max(len(hits), 1), 4) if hits else 0.0,
        "mean_latency_ms": round(sum(latencies) / max(len(latencies), 1), 1) if latencies else None,
        "top_k": top_k,
    }


def extractive_from_contexts(query: str, contexts: list) -> str:
    """Mirror of Agent extractive: stitch top contexts."""
    if not contexts:
        return ""
    parts = []
    for c in contexts[:3]:
        if isinstance(c, dict):
            parts.append(str(c.get("text") or c.get("snippet") or c.get("name") or ""))
        else:
            parts.append(str(c))
    return " ".join(p for p in parts if p)[:800]


def eval_extractive(qa: list[dict], max_items: int = 60) -> dict:
    covs = []
    site_mentions = []
    subset = qa[:max_items]
    for item in subset:
        ctxs, _, src = retrieve_contexts(item["q"], top_k=5)
        if not ctxs and str(src).startswith("unavailable"):
            break
        answer = extractive_from_contexts(item["q"], ctxs)
        covs.append(coverage(answer, item["keys"]))
        toks = name_tokens(item["site"])
        site_mentions.append(
            1 if any(t in answer.lower() for t in toks) or item["site"].lower() in answer.lower() else 0
        )
    n = len(covs)
    return {
        "n": n,
        "keyword_coverage": round(sum(covs) / max(n, 1), 4) if n else None,
        "site_mention_rate": round(sum(site_mentions) / max(n, 1), 4) if n else None,
        "note": "Extractive stitch of hybrid contexts (Agent primary path without cloud polish).",
    }


def eval_tokenizer_roundtrip(texts: list[str]) -> dict:
    import sys

    sys.path.insert(0, str(HERITAGE))
    from tokenizer import HeritageBPE

    tok_path = HERITAGE / "checkpoints" / "tokenizer.json"
    if not tok_path.exists():
        return {"ok": False, "error": "missing tokenizer"}
    tok = HeritageBPE.load(tok_path)
    scores = []
    for t in texts:
        ids = tok.encode(t, add_special=True)
        back = tok.decode(ids)
        # character bigram Jaccard as soft roundtrip score
        a = set(re.findall(r".{2}", t.lower()))
        b = set(re.findall(r".{2}", back.lower()))
        if not a:
            continue
        scores.append(len(a & b) / len(a | b) if (a | b) else 0.0)
    return {
        "ok": True,
        "n": len(scores),
        "bigram_jaccard": round(sum(scores) / max(len(scores), 1), 4),
        "vocab_size": len(tok.vocab),
    }


@torch.no_grad()
def eval_minigpt(qa: list[dict], max_items: int = 60) -> dict:
    import sys

    sys.path.insert(0, str(HERITAGE))
    from infer import answer_heritage, load_bundle
    from model import MiniGPT

    try:
        b = load_bundle()
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}

    model, tok, device, cfg = b["model"], b["tok"], b["device"], b["cfg"]
    subset = qa[:max_items]

    # Perplexity on short gold answers (teacher-forced)
    gold_texts = [
        f"Question: {it['q']} Answer: {it['site']} is associated with {', '.join(it['keys'][:2])}."
        for it in subset[:40]
    ]
    nlls = []
    for g in gold_texts:
        ids = tok.encode(g, add_special=True)
        if len(ids) < 4:
            continue
        ids = ids[: cfg.block_size]
        x = torch.tensor([ids[:-1]], device=device)
        y = torch.tensor([ids[1:]], device=device)
        _, loss = model(x, y)
        if loss is not None:
            nlls.append(float(loss.item()))
    ppl = math.exp(sum(nlls) / max(len(nlls), 1)) if nlls else None

    site_hit = []
    key_cov = []
    lat = []
    for it in subset:
        t0 = time.time()
        out = answer_heritage(it["q"], max_new_tokens=40)
        lat.append((time.time() - t0) * 1000)
        ans = (out.get("answer") or "") if out.get("ok") else ""
        toks = name_tokens(it["site"])
        site_hit.append(
            1 if any(t in ans.lower() for t in toks) or it["site"].lower() in ans.lower() else 0
        )
        key_cov.append(coverage(ans, it["keys"]))

    meta_path = HERITAGE / "checkpoints" / "train_meta.json"
    train_meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}

    return {
        "ok": True,
        "n": len(subset),
        "site_mention_rate": round(sum(site_hit) / max(len(site_hit), 1), 4),
        "keyword_coverage": round(sum(key_cov) / max(len(key_cov), 1), 4),
        "mean_latency_ms": round(sum(lat) / max(len(lat), 1), 1),
        "perplexity_on_gold_qa": round(ppl, 3) if ppl else None,
        "n_params": train_meta.get("n_params"),
        "context_window": train_meta.get("context_window") or cfg.block_size,
        "architecture": train_meta.get("architecture"),
        "train_epochs": train_meta.get("epochs"),
        "train_tokens": train_meta.get("n_tokens"),
        "data_source": train_meta.get("data"),
        "honesty": (
            "Generative quality of a ~2–5M param LM on n=49 is limited; "
            "report Mini-LM as a compact domain LM + architecture study, "
            "and Agent extractive hybrid RAG as the primary grounded chat path."
        ),
    }


def eval_agent_http(qa: list[dict], max_items: int = 12) -> dict:
    subset = qa[:max_items]
    covs, hits, lats = [], [], []
    reachable = False
    for i, it in enumerate(subset):
        t0 = time.time()
        ok, data, err = http_json(
            "POST",
            f"{AGENT}/api/chat",
            {"query": it["q"], "session_id": "research-eval"},
            timeout=12,
        )
        lats.append((time.time() - t0) * 1000)
        if not ok:
            if i >= 1 and not reachable:
                break
            continue
        reachable = True
        ans = data.get("answer") or ""
        covs.append(coverage(ans, it["keys"]))
        toks = name_tokens(it["site"])
        hits.append(
            1 if any(t in ans.lower() for t in toks) or it["site"].lower() in ans.lower() else 0
        )
    n = len(covs)
    return {
        "agent_reachable": reachable,
        "n": n,
        "keyword_coverage": round(sum(covs) / max(n, 1), 4) if n else None,
        "site_mention_rate": round(sum(hits) / max(n, 1), 4) if n else None,
        "mean_latency_ms": round(sum(lats) / max(len(lats), 1), 1) if lats else None,
        "modes_note": "End-to-end Agent :8180 (extractive RAG → Mini-LM → Local-RAG fallback).",
    }


def paper_framing(payload: dict) -> dict:
    """How to present this in a paper — claims vs metrics."""
    return {
        "primary_claim": (
            "Hybrid retrieval + extractive grounding over a curated heritage index "
            "(Agent-Based TypeScript orchestrator) yields measurable Hit@K and keyword coverage "
            "without requiring a fine-tuned frontier LLM."
        ),
        "secondary_claim": (
            "A compact in-repo Mini-LM (BPE → embeddings → BiLSTM memory → causal Transformer) "
            "trained on CSV dossiers + relevance-filtered Wikipedia extracts demonstrates an "
            "end-to-end local tokenization→train→infer stack with reported PPL / coverage / latency."
        ),
        "not_claimed": [
            "Parity with proprietary large LLMs on open-domain fluency",
            "Human κ for faithfulness (lexical proxies only unless preference study filled)",
            "Invented heritage sites beyond the curated n=49",
        ],
        "suggested_table_columns": [
            "System",
            "Hit@5 / site mention",
            "Keyword coverage",
            "Faithfulness proxy",
            "Latency",
            "Params / notes",
        ],
        "metrics_snapshot": {
            "hybrid_hit_at_5": payload.get("retrieval", {}).get("hit_at_k"),
            "extractive_keyword_coverage": payload.get("extractive", {}).get("keyword_coverage"),
            "minigpt_site_mention": (payload.get("minigpt") or {}).get("site_mention_rate"),
            "minigpt_ppl": (payload.get("minigpt") or {}).get("perplexity_on_gold_qa"),
            "agent_e2e_coverage": (payload.get("agent_http") or {}).get("keyword_coverage"),
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-minigpt", action="store_true")
    ap.add_argument("--skip-live", action="store_true", help="Skip Clustering/Agent HTTP probes")
    ap.add_argument("--max-minigpt", type=int, default=48)
    args = ap.parse_args()

    if not CSV.exists():
        raise SystemExit(f"Missing {CSV}")
    df = pd.read_csv(CSV)
    qa = build_qa(df)
    print(f"[qa] {len(qa)} items from n={len(df)} sites")

    dossiers = [
        f"Site: {r.Name}. Country: {r.Country}. Architecture: {r.get('Architecture Style','')}."
        for _, r in df.head(20).iterrows()
    ]

    payload: dict = {
        "title": "Agent-Based chat + Heritage Mini-LM — measured proxies",
        "last_updated": str(date.today()),
        "dataset_n": int(len(df)),
        "qa_items": len(qa),
    }

    payload["tokenizer"] = eval_tokenizer_roundtrip(dossiers)
    print("[tok]", payload["tokenizer"])

    if not args.skip_live:
        print("[retrieval] probing Clustering…")
        payload["retrieval"] = eval_retrieval(qa)
        print("[retrieval]", payload["retrieval"])
        if payload["retrieval"].get("clustering_reachable"):
            print("[extractive] …")
            payload["extractive"] = eval_extractive(qa)
            print("[extractive]", payload["extractive"])
        else:
            payload["extractive"] = {"n": 0, "note": "Clustering unreachable"}
        print("[agent] probing :8180…")
        payload["agent_http"] = eval_agent_http(qa)
        print("[agent]", payload["agent_http"])
    else:
        payload["retrieval"] = {"skipped": True}
        payload["extractive"] = {"skipped": True}
        payload["agent_http"] = {"skipped": True}

    if not args.skip_minigpt:
        print("[minigpt] evaluating…")
        payload["minigpt"] = eval_minigpt(qa, max_items=args.max_minigpt)
        print(
            "[minigpt]",
            {
                k: payload["minigpt"].get(k)
                for k in (
                    "site_mention_rate",
                    "keyword_coverage",
                    "perplexity_on_gold_qa",
                    "mean_latency_ms",
                    "n_params",
                )
            },
        )
    else:
        payload["minigpt"] = {"skipped": True}

    # Online corpus stats if present
    online_csv = HERITAGE / "data" / "online_training.csv"
    qa_csv = HERITAGE / "data" / "qa_training.csv"
    corpus_meta = HERITAGE / "data" / "corpus_meta.json"
    payload["training_data"] = {
        "online_training_csv": online_csv.exists(),
        "online_rows": (
            sum(1 for _ in open(online_csv, encoding="utf-8")) - 1 if online_csv.exists() else 0
        ),
        "qa_training_csv": qa_csv.exists(),
        "qa_rows": (
            sum(1 for _ in open(qa_csv, encoding="utf-8")) - 1 if qa_csv.exists() else 0
        ),
        "corpus_meta": json.loads(corpus_meta.read_text(encoding="utf-8"))
        if corpus_meta.exists()
        else None,
    }

    payload["paper_framing"] = paper_framing(payload)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[ok] wrote {OUT}")


if __name__ == "__main__":
    main()
