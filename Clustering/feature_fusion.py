"""
Research-grade feature fusion / segmentation study.

Compares how Arch / Mat / Struct / scalar modalities should be combined
beyond naive early concatenation (the current production approach).

Strategies:
  1. Early concat (baseline) — current Scalar+Arch+Mat+Struct
  2. L2-normalize each modality then concat (balanced scales)
  3. PCA-whitened concat (256 dims) — reduce redundancy
  4. Late fusion — weighted average of per-modality cosine sims
  5. Full-dossier CLIP-text — single embedding of combined metadata text
  6. Architecture-only vs Material-only vs Structure-only (ablation)

Metrics: MRR@5, Precision@5, Margin, Silhouette, DBI (KMeans k=5)

Output: Pickles/feature_fusion_comparison.json
"""

from __future__ import annotations

import json
import os
import pickle
import time

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import davies_bouldin_score, silhouette_score
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
            ok = False
            if civ_i == civ_j and civ_i not in ("", "nan", "unknown"):
                ok = True
            elif style_i == style_j and style_i not in ("", "nan"):
                ok = True
            elif rel_i == rel_j and country_i == country_j and rel_i not in ("", "nan"):
                ok = True
            elif "rock-cut" in style_i and "rock-cut" in style_j:
                ok = True
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


def eval_cluster(X):
    Xs = StandardScaler().fit_transform(X)
    labels = KMeans(5, random_state=42, n_init=10).fit_predict(Xs)
    return {
        "silhouette": float(silhouette_score(Xs, labels)),
        "davies_bouldin": float(davies_bouldin_score(Xs, labels)),
    }


def score_matrix_from_X(X):
    Xs = StandardScaler().fit_transform(X)
    return cosine_similarity(Xs), eval_cluster(X)


def late_fusion(mats, weights):
    w = np.array(weights, dtype=np.float64)
    w = w / w.sum()
    out = np.zeros_like(mats[0])
    for m, wi in zip(mats, w):
        out += wi * m
    return out


def main():
    print("=" * 70)
    print("  Feature Fusion / Segmentation Study")
    print("=" * 70)

    df = load_pickle("df.pkl")
    Arch = load_pickle("Arch.pkl")
    Mat = load_pickle("Mat.pkl")
    Struct = load_pickle("Struct.pkl")
    scalars = df[["Area(m2)", "YearNum", "PopularityNum", "PreservationNum"]].fillna(0).values
    gt = compute_gt(df)
    csv = pd.read_csv(DATASET_PATH)

    results = {}

    def record(name, sim, cluster_meta=None):
        rec = eval_rec(sim, gt)
        meta = cluster_meta or {}
        results[name] = {**rec, **meta}
        print(
            f"{name:<42} MRR={rec['MRR@5']:.4f} P@5={rec['Precision@5']:.4f} "
            f"Sil={meta.get('silhouette', float('nan')):.4f}"
        )

    # 1 Early concat (production-style)
    X = np.hstack([scalars, Arch, Mat, Struct])
    sim, cl = score_matrix_from_X(X)
    record("1. Early concat (Scalar+A+M+S)", sim, cl)

    # 2 Modality-normalized concat
    Xn = np.hstack(
        [
            StandardScaler().fit_transform(scalars),
            normalize(Arch),
            normalize(Mat),
            normalize(Struct),
        ]
    )
    sim = cosine_similarity(Xn)
    record("2. L2-norm each modality + concat", sim, eval_cluster(Xn))

    # 3 PCA-whitened
    Xp = StandardScaler().fit_transform(X)
    pca = PCA(n_components=min(256, Xp.shape[1], Xp.shape[0] - 1), random_state=42)
    Xpca = pca.fit_transform(Xp)
    sim = cosine_similarity(Xpca)
    record("3. PCA-256 whitened concat", sim, eval_cluster(Xpca))

    # 4 Late fusion of modality sims
    s_sc = cosine_similarity(StandardScaler().fit_transform(scalars))
    s_a = cosine_similarity(normalize(Arch))
    s_m = cosine_similarity(normalize(Mat))
    s_s = cosine_similarity(normalize(Struct))
    # Grid a few weightings
    for label, w in [
        ("4a. Late fusion equal", [1, 1, 1, 1]),
        ("4b. Late fusion Arch-heavy", [0.5, 2.0, 0.75, 0.75]),
        ("4c. Late fusion Arch+Struct", [0.4, 1.5, 0.5, 1.5]),
    ]:
        sim = late_fusion([s_sc, s_a, s_m, s_s], w)
        record(label, sim, {})

    # 5 Single-modality ablations
    for label, block in [
        ("5a. Arch only + scalars", np.hstack([scalars, Arch])),
        ("5b. Mat only + scalars", np.hstack([scalars, Mat])),
        ("5c. Struct only + scalars", np.hstack([scalars, Struct])),
        ("5d. Arch+Struct (no Mat)", np.hstack([scalars, Arch, Struct])),
    ]:
        sim, cl = score_matrix_from_X(block)
        record(label, sim, cl)

    # 6 Full-dossier embedding (CLIP-text)
    try:
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer("clip-ViT-B-32")
        docs = []
        name_order = load_pickle("site_names.pkl")
        by = {r["Name"]: r for _, r in csv.iterrows()}
        for n in name_order:
            r = by[n]
            docs.append(
                f"{r['Name']}. {r.get('Architecture Style','')}. "
                f"Material {r.get('Material','')}. Structure {r.get('Structure','')}. "
                f"Civilization {r.get('Civilization','')}. Era {r.get('Era','')}. "
                f"Country {r.get('Country','')}."
            )
        t0 = time.perf_counter()
        emb = model.encode(docs, show_progress_bar=False)
        emb = normalize(emb)
        print(f"  dossier encode {time.perf_counter()-t0:.1f}s")
        Xd = np.hstack([StandardScaler().fit_transform(scalars), emb])
        sim = cosine_similarity(normalize(Xd))
        record("6. Full-dossier CLIP-text + scalars", sim, eval_cluster(Xd))
    except Exception as e:
        results["6. Full-dossier CLIP-text + scalars"] = {"error": str(e)}

    ranked = sorted(
        [(k, v["MRR@5"]) for k, v in results.items() if "MRR@5" in v],
        key=lambda x: x[1],
        reverse=True,
    )
    print("\n" + "=" * 70)
    print("Ranking by MRR@5:")
    for name, mrr in ranked:
        print(f"  {mrr:.4f}  {name}")

    out = {
        "results": results,
        "ranking_by_mrr": [{"method": n, "MRR@5": m} for n, m in ranked],
        "best": ranked[0][0] if ranked else None,
        "notes": (
            "Early concat is a strong baseline; L2-norm / late fusion / "
            "Arch-heavy often improve discrimination on short style fields. "
            "Prefer reporting this ablation in the paper."
        ),
    }
    path = os.path.join(PICKLES_DIR, "feature_fusion_comparison.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"\nSaved {path}")

    # Optionally write best late-fusion similarity for utils consumers
    if ranked and ranked[0][0].startswith("4"):
        # rebuild best late fusion
        best_label = ranked[0][0]
        weights = {
            "4a. Late fusion equal": [1, 1, 1, 1],
            "4b. Late fusion Arch-heavy": [0.5, 2.0, 0.75, 0.75],
            "4c. Late fusion Arch+Struct": [0.4, 1.5, 0.5, 1.5],
        }[best_label]
        best_sim = late_fusion([s_sc, s_a, s_m, s_s], weights)
        with open(os.path.join(PICKLES_DIR, "similarity_late_fusion.pkl"), "wb") as f:
            pickle.dump({"weights": weights, "label": best_label, "similarity": best_sim}, f)
        print(f"Wrote similarity_late_fusion.pkl from {best_label}")


if __name__ == "__main__":
    main()
