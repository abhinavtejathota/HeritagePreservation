"""
Compare NLP / vectorization methods for heritage Arch / Mat / Struct text fields.

Methods evaluated (recommendation + clustering quality):
  - TF-IDF (word 1-2 grams)
  - TF-IDF (char 3-5 grams)
  - HashingVectorizer (baseline sparse)
  - all-MiniLM-L6-v2          (current production)
  - paraphrase-MiniLM-L6-v2
  - all-mpnet-base-v2         (stronger ST)
  - CLIP text encoder (clip-ViT-B-32) on concatenated style texts

Metrics per method:
  - MRR@5, Precision@5, Similarity Margin  (same GT as benchmark.py)
  - Silhouette, Davies-Bouldin on KMeans(K=5) of the joint feature matrix
  - Encode wall-time (seconds)

Outputs:
  Pickles/vectorizer_comparison.json
  Pickles/vectorizer_comparison.pkl
  Optionally --promote-best writes Arch/Mat/Struct.pkl from the best MRR method
    (dense ST/CLIP only; sparse TF-IDF not written as drop-in for GNN dim).

Usage:
  python compare_vectorizers.py
  python compare_vectorizers.py --promote-best
  python compare_vectorizers.py --skip-heavy   # skip mpnet + CLIP
"""

from __future__ import annotations

import argparse
import json
import os
import pickle
import time
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import HashingVectorizer, TfidfVectorizer
from sklearn.metrics import davies_bouldin_score, silhouette_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")
DATASET_PATH = os.path.join(BASE_DIR, "..", "Dataset", "heritage_sites_v2.csv")


def load_pickle(name: str):
    with open(os.path.join(PICKLES_DIR, name), "rb") as f:
        return pickle.load(f)


def compute_ground_truth(df: pd.DataFrame) -> np.ndarray:
    n = len(df)
    gt = np.zeros((n, n), dtype=int)
    for i in range(n):
        row_i = df.iloc[i]
        civ_i = str(row_i.get("Civilization", "")).strip().lower()
        style_i = str(row_i.get("Architecture Style", "")).strip().lower()
        rel_i = str(row_i.get("Religion", "")).strip().lower()
        country_i = str(row_i.get("Country", "")).strip().lower()
        for j in range(n):
            if i == j:
                continue
            row_j = df.iloc[j]
            civ_j = str(row_j.get("Civilization", "")).strip().lower()
            style_j = str(row_j.get("Architecture Style", "")).strip().lower()
            rel_j = str(row_j.get("Religion", "")).strip().lower()
            country_j = str(row_j.get("Country", "")).strip().lower()
            match = False
            if civ_i == civ_j and civ_i not in ("", "nan", "unknown"):
                match = True
            elif style_i == style_j and style_i not in ("", "nan"):
                match = True
            elif rel_i == rel_j and country_i == country_j and rel_i not in ("", "nan"):
                match = True
            elif "rock-cut" in style_i and "rock-cut" in style_j:
                match = True
            elif "nabataean" in civ_i and "nabataean" in civ_j:
                match = True
            elif ("roman" in civ_i or "roman" in style_i) and (
                "roman" in civ_j or "roman" in style_j
            ):
                match = True
            if match:
                gt[i, j] = 1
    return gt


def evaluate_similarity(sim: np.ndarray, gt: np.ndarray, top_k: int = 5) -> dict:
    n = sim.shape[0]
    mrr_list, p_list = [], []
    rel_sims, irrel_sims = [], []
    for i in range(n):
        sims = sim[i].copy()
        sims[i] = -np.inf
        ranked = np.argsort(sims)[::-1]
        top = ranked[:top_k]
        mrr = 0.0
        for r, idx in enumerate(top):
            if gt[i, idx] == 1:
                mrr = 1.0 / (r + 1)
                break
        mrr_list.append(mrr)
        p_list.append(np.sum(gt[i, top]) / top_k)
        for j in range(n):
            if i == j:
                continue
            (rel_sims if gt[i, j] == 1 else irrel_sims).append(sim[i, j])
    avg_rel = float(np.mean(rel_sims)) if rel_sims else 0.0
    avg_irrel = float(np.mean(irrel_sims)) if irrel_sims else 0.0
    return {
        "MRR@5": float(np.mean(mrr_list)),
        "Precision@5": float(np.mean(p_list)),
        "Margin": avg_rel - avg_irrel,
    }


def clustering_quality(X: np.ndarray) -> dict:
    if X.ndim == 1:
        X = X.reshape(-1, 1)
    # Sparse → dense for KMeans on small n
    if hasattr(X, "toarray"):
        X = X.toarray()
    X = np.asarray(X, dtype=np.float64)
    # Cap dims for speed / stability if huge sparse densified
    if X.shape[1] > 2048:
        # PCA-ish via random projection
        rng = np.random.default_rng(42)
        R = rng.normal(size=(X.shape[1], 256)) / np.sqrt(256)
        X = X @ R
    Xs = StandardScaler().fit_transform(X)
    labels = KMeans(n_clusters=5, random_state=42, n_init=10).fit_predict(Xs)
    return {
        "silhouette_KMeans5": float(silhouette_score(Xs, labels)),
        "davies_bouldin_KMeans5": float(davies_bouldin_score(Xs, labels)),
    }


def encode_sparse(texts_a, texts_m, texts_s, vectorizer) -> np.ndarray:
    # Fit on all three corpora concatenated for shared vocab
    corpus = list(texts_a) + list(texts_m) + list(texts_s)
    vectorizer.fit(corpus)
    A = vectorizer.transform(texts_a)
    M = vectorizer.transform(texts_m)
    S = vectorizer.transform(texts_s)
    from scipy import sparse

    return sparse.hstack([A, M, S]).tocsr()


def encode_sentence_transformer(texts_a, texts_m, texts_s, model_name: str) -> np.ndarray:
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(model_name)
    A = model.encode(list(texts_a), show_progress_bar=False)
    M = model.encode(list(texts_m), show_progress_bar=False)
    S = model.encode(list(texts_s), show_progress_bar=False)
    return np.hstack([A, M, S]).astype(np.float32), A, M, S


def encode_clip_text(texts_a, texts_m, texts_s) -> np.ndarray:
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("clip-ViT-B-32")
    # CLIP text tower — encode each field separately then concat
    A = model.encode(list(texts_a), show_progress_bar=False)
    M = model.encode(list(texts_m), show_progress_bar=False)
    S = model.encode(list(texts_s), show_progress_bar=False)
    return np.hstack([A, M, S]).astype(np.float32), A, M, S


def joint_with_scalars(emb, scalars: np.ndarray) -> np.ndarray:
    if hasattr(emb, "toarray"):
        emb = emb.toarray()
    return np.hstack([scalars, np.asarray(emb, dtype=np.float64)])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--promote-best", action="store_true")
    parser.add_argument("--skip-heavy", action="store_true", help="Skip mpnet and CLIP")
    args = parser.parse_args()

    print("=" * 70)
    print("  NLP / Vectorization Method Comparison")
    print("=" * 70)

    df_pkl = load_pickle("df.pkl")
    site_names = load_pickle("site_names.pkl")
    csv = pd.read_csv(DATASET_PATH)

    # Align texts by Name order in site_names / df_pkl
    name_to_row = {r["Name"]: r for _, r in csv.iterrows()}
    texts_a, texts_m, texts_s = [], [], []
    for name in site_names:
        row = name_to_row.get(name)
        if row is None:
            # fallback to df_pkl
            idx = site_names.index(name)
            row = df_pkl.iloc[idx]
            texts_a.append(str(row.get("Architecture Style", "")))
            texts_m.append(str(row.get("Material", "")))
            texts_s.append(str(row.get("Structure", "")))
        else:
            texts_a.append(str(row.get("Architecture Style", "")))
            texts_m.append(str(row.get("Material", "")))
            texts_s.append(str(row.get("Structure", "")))

    scalars = df_pkl[["Area(m2)", "YearNum", "PopularityNum", "PreservationNum"]].fillna(0).values
    gt = compute_ground_truth(df_pkl)
    print(f"Sites: {len(site_names)} | GT relevant pairs: {int(gt.sum())}")

    methods: list[tuple[str, str, Any]] = [
        ("TF-IDF word (1-2gram)", "sparse", TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=4000)),
        ("TF-IDF char (3-5gram)", "sparse", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1, max_features=4000)),
        ("HashingVectorizer", "sparse", HashingVectorizer(n_features=1024, alternate_sign=False, ngram_range=(1, 2))),
        ("all-MiniLM-L6-v2", "st", "sentence-transformers/all-MiniLM-L6-v2"),
        ("paraphrase-MiniLM-L6-v2", "st", "sentence-transformers/paraphrase-MiniLM-L6-v2"),
    ]
    if not args.skip_heavy:
        methods.append(("all-mpnet-base-v2", "st", "sentence-transformers/all-mpnet-base-v2"))
        methods.append(("CLIP-text ViT-B-32", "clip", None))

    results: dict[str, dict] = {}
    dense_payloads: dict[str, tuple] = {}  # name -> (A, M, S) for promote

    for label, kind, spec in methods:
        print(f"\n--- {label} ---")
        t0 = time.perf_counter()
        try:
            if kind == "sparse":
                emb = encode_sparse(texts_a, texts_m, texts_s, spec)
                A = M = S = None
            elif kind == "st":
                emb, A, M, S = encode_sentence_transformer(texts_a, texts_m, texts_s, spec)
                dense_payloads[label] = (A, M, S)
            else:
                emb, A, M, S = encode_clip_text(texts_a, texts_m, texts_s)
                dense_payloads[label] = (A, M, S)
            encode_s = time.perf_counter() - t0

            X = joint_with_scalars(emb, scalars)
            Xs = StandardScaler().fit_transform(
                X if not hasattr(X, "toarray") else X
            ) if not hasattr(X, "toarray") else StandardScaler().fit_transform(X.toarray() if hasattr(X, "toarray") else X)

            if hasattr(emb, "toarray"):
                # For sim: scale joint dense
                Xd = joint_with_scalars(emb, scalars)
                Xd = StandardScaler().fit_transform(Xd)
                sim = cosine_similarity(Xd)
                cq = clustering_quality(Xd)
            else:
                Xd = StandardScaler().fit_transform(joint_with_scalars(emb, scalars))
                sim = cosine_similarity(Xd)
                cq = clustering_quality(Xd)

            rec = evaluate_similarity(sim, gt)
            metrics = {
                **rec,
                **cq,
                "encode_seconds": round(encode_s, 3),
                "kind": kind,
                "feature_dim": int(Xd.shape[1]),
            }
            results[label] = metrics
            print(
                f"  MRR@5={metrics['MRR@5']:.4f}  P@5={metrics['Precision@5']:.4f}  "
                f"Margin={metrics['Margin']:.4f}  Sil={metrics['silhouette_KMeans5']:.4f}  "
                f"DBI={metrics['davies_bouldin_KMeans5']:.4f}  t={encode_s:.1f}s"
            )
        except Exception as e:
            print(f"  FAILED: {e}")
            results[label] = {"error": str(e)}

    # Ranking
    scored = [(k, v["MRR@5"]) for k, v in results.items() if "MRR@5" in v]
    scored.sort(key=lambda x: x[1], reverse=True)

    print("\n" + "=" * 70)
    print(f"{'Method':<28} | {'MRR@5':<7} | {'P@5':<7} | {'Sil↑':<7} | {'DBI↓':<7}")
    print("-" * 70)
    for name, _ in scored:
        m = results[name]
        print(
            f"{name:<28} | {m['MRR@5']:.4f}  | {m['Precision@5']:.4f}  | "
            f"{m['silhouette_KMeans5']:.4f}  | {m['davies_bouldin_KMeans5']:.4f}"
        )
    print("=" * 70)
    best_name = scored[0][0] if scored else None
    print(f"Best by MRR@5: {best_name}")

    out = {
        "n_sites": len(site_names),
        "gt_pairs": int(gt.sum()),
        "results": results,
        "ranking_by_mrr": [{"method": n, "MRR@5": s} for n, s in scored],
        "best_method": best_name,
    }
    json_path = os.path.join(PICKLES_DIR, "vectorizer_comparison.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    with open(os.path.join(PICKLES_DIR, "vectorizer_comparison.pkl"), "wb") as f:
        pickle.dump(out, f)
    print(f"Saved -> {json_path}")

    if args.promote_best and best_name and best_name in dense_payloads:
        A, M, S = dense_payloads[best_name]
        for fname, arr in [("Arch.pkl", A), ("Mat.pkl", M), ("Struct.pkl", S)]:
            with open(os.path.join(PICKLES_DIR, fname), "wb") as f:
                pickle.dump(arr, f)
        meta = {"promoted_from": best_name, "dims": int(A.shape[1])}
        with open(os.path.join(PICKLES_DIR, "vectorizer_active.json"), "w") as f:
            json.dump(meta, f, indent=2)
        print(f"Promoted {best_name} -> Arch/Mat/Struct.pkl (re-run GNN/HDBSCAN/benchmark)")
    elif args.promote_best:
        print("Promote skipped: best method is sparse or failed (keep existing MiniLM pickles).")

    return out


if __name__ == "__main__":
    main()
