"""
Experiment 2: Hybrid Arch embeddings = CLIP-text ⊕ char-TF-IDF.

Compares:
  - CLIP-text Arch only + scalars
  - char-TF-IDF Arch only + scalars
  - Concat hybrid (CLIP || TF-IDF) + scalars
  - Weighted late fusion of the two Arch sims + scalars

Output: Pickles/hybrid_arch_metrics.json
Optionally writes Pickles/Arch_hybrid.pkl for downstream use.
"""

from __future__ import annotations

import json
import os
import pickle

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler, normalize

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")
DATASET_PATH = os.path.join(BASE_DIR, "..", "Dataset", "heritage_sites_v2.csv")


def load_pickle(name):
    with open(os.path.join(PICKLES_DIR, name), "rb") as f:
        return pickle.load(f)


def compute_gt(df):
    n = len(df)
    gt = np.zeros((n, n), dtype=int)
    for i in range(n):
        ri = df.iloc[i]
        civ_i = str(ri.get("Civilization", "")).strip().lower()
        style_i = str(ri.get("Architecture Style", "")).strip().lower()
        rel_i = str(ri.get("Religion", "")).strip().lower()
        country_i = str(ri.get("Country", "")).strip().lower()
        for j in range(n):
            if i == j:
                continue
            rj = df.iloc[j]
            civ_j = str(rj.get("Civilization", "")).strip().lower()
            style_j = str(rj.get("Architecture Style", "")).strip().lower()
            rel_j = str(rj.get("Religion", "")).strip().lower()
            country_j = str(rj.get("Country", "")).strip().lower()
            ok = (
                (civ_i == civ_j and civ_i not in ("", "nan", "unknown"))
                or (style_i == style_j and style_i not in ("", "nan"))
                or (rel_i == rel_j and country_i == country_j and rel_i not in ("", "nan"))
                or ("rock-cut" in style_i and "rock-cut" in style_j)
            )
            if ok:
                gt[i, j] = 1
    return gt


def eval_rec(sim, gt, k=5):
    n = sim.shape[0]
    mrr, prec = [], []
    rel, irrel = [], []
    for i in range(n):
        s = sim[i].copy()
        s[i] = -np.inf
        top = np.argsort(s)[::-1][:k]
        hit = 0.0
        for r, j in enumerate(top):
            if gt[i, j]:
                hit = 1.0 / (r + 1)
                break
        mrr.append(hit)
        prec.append(gt[i, top].sum() / k)
        for j in range(n):
            if i == j:
                continue
            (rel if gt[i, j] else irrel).append(sim[i, j])
    return {
        "MRR@5": float(np.mean(mrr)),
        "Precision@5": float(np.mean(prec)),
        "Margin": float(np.mean(rel) - np.mean(irrel)) if rel and irrel else 0.0,
    }


def sim_from(X):
    Xs = StandardScaler().fit_transform(X)
    return cosine_similarity(Xs)


def main():
    df = load_pickle("df.pkl")
    names = load_pickle("site_names.pkl")
    Arch_clip = load_pickle("Arch.pkl")  # already CLIP-text promoted
    scalars = df[["Area(m2)", "YearNum", "PopularityNum", "PreservationNum"]].fillna(0).values
    gt = compute_gt(df)

    csv = pd.read_csv(DATASET_PATH)
    by = {r["Name"]: r for _, r in csv.iterrows()}
    texts = [str(by[n].get("Architecture Style", "")) for n in names]

    tfidf = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1, max_features=4000)
    Arch_tfidf = tfidf.fit_transform(texts).toarray()

    # Hybrid early concat
    Arch_hybrid = np.hstack([normalize(Arch_clip), normalize(Arch_tfidf)])

    results = {}
    results["CLIP-text Arch + scalars"] = eval_rec(sim_from(np.hstack([scalars, Arch_clip])), gt)
    results["char-TF-IDF Arch + scalars"] = eval_rec(sim_from(np.hstack([scalars, Arch_tfidf])), gt)
    results["Hybrid concat (CLIP||TFIDF) + scalars"] = eval_rec(
        sim_from(np.hstack([scalars, Arch_hybrid])), gt
    )

    # Late fusion of the two Arch spaces (+ scalar sim)
    s_sc = cosine_similarity(StandardScaler().fit_transform(scalars))
    s_clip = cosine_similarity(normalize(Arch_clip))
    s_tf = cosine_similarity(normalize(Arch_tfidf))
    for label, w in [
        ("Late fusion equal CLIP+TFIDF+scalar", [1, 1, 1]),
        ("Late fusion CLIP-heavy", [0.5, 2.0, 1.0]),
        ("Late fusion TFIDF-heavy", [0.5, 1.0, 2.0]),
    ]:
        ww = np.array(w, dtype=float)
        ww /= ww.sum()
        sim = ww[0] * s_sc + ww[1] * s_clip + ww[2] * s_tf
        results[label] = eval_rec(sim, gt)

    ranked = sorted(results.items(), key=lambda x: x[1]["MRR@5"], reverse=True)
    print("=" * 70)
    print("Hybrid Arch embedding comparison")
    print("=" * 70)
    for name, m in ranked:
        print(f"{m['MRR@5']:.4f}  P@5={m['Precision@5']:.4f}  {name}")

    best = ranked[0][0]
    out = {"results": results, "best": best, "ranking": [n for n, _ in ranked]}
    path = os.path.join(PICKLES_DIR, "hybrid_arch_metrics.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)

    # Always save hybrid Arch for optional promotion
    with open(os.path.join(PICKLES_DIR, "Arch_hybrid.pkl"), "wb") as f:
        pickle.dump(Arch_hybrid, f)
    print(f"\nSaved {path}")
    print(f"Saved Arch_hybrid.pkl shape={Arch_hybrid.shape} (best={best})")


if __name__ == "__main__":
    main()
