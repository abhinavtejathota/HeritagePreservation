"""
Scale check: FAISS latency + HDBSCAN cluster metrics on expanded real feature space.

Uses Gaussian expansion of X.pkl (same honesty as scale_latency_study) but also
reports HDBSCAN silhouette/DBI at each N so paper claims are N-conditioned.

Output: Clustering/Pickles/scale_cluster_metrics.json
"""

from __future__ import annotations

import json
import pickle
import time
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import davies_bouldin_score, silhouette_score
from sklearn.preprocessing import StandardScaler, normalize

BASE = Path(__file__).resolve().parent
PICKLES = BASE / "Pickles"
OUT = PICKLES / "scale_cluster_metrics.json"


def expand(X, n_target, seed=42):
    rng = np.random.default_rng(seed)
    n0, d = X.shape
    if n_target <= n0:
        return X[:n_target].copy()
    extra = n_target - n0
    idx = rng.integers(0, n0, size=extra)
    noise = rng.normal(0, 0.05, size=(extra, d)).astype(np.float32)
    return np.vstack([X, X[idx] + noise])


def faiss_vs_brute(X):
    Xn = normalize(X).astype(np.float32)
    # brute sample
    t0 = time.perf_counter()
    qn = min(40, len(Xn))
    for i in range(qn):
        sims = Xn @ Xn[i]
        np.argsort(sims)[::-1][:5]
    brute_ms = (time.perf_counter() - t0) * 1000 / qn

    faiss_ms = None
    try:
        import faiss

        index = faiss.IndexHNSWFlat(Xn.shape[1], 16)
        index.hnsw.efConstruction = 40
        index.hnsw.efSearch = 32
        index.add(Xn)
        t0 = time.perf_counter()
        for i in range(qn):
            index.search(Xn[i : i + 1], 5)
        faiss_ms = (time.perf_counter() - t0) * 1000 / qn
    except Exception as e:
        return {"brute_ms": brute_ms, "faiss_ms": None, "error": str(e)}

    return {
        "brute_ms": float(brute_ms),
        "faiss_ms": float(faiss_ms),
        "speedup": float(brute_ms / faiss_ms) if faiss_ms and faiss_ms > 0 else None,
    }


def cluster_metrics(X, n_clusters_hint=5):
    Xn = StandardScaler().fit_transform(X)
    out = {}
    try:
        km = KMeans(n_clusters=min(n_clusters_hint, len(X) - 1), n_init=10, random_state=42)
        lab = km.fit_predict(Xn)
        out["kmeans_silhouette"] = float(silhouette_score(Xn, lab))
        out["kmeans_dbi"] = float(davies_bouldin_score(Xn, lab))
    except Exception as e:
        out["kmeans_error"] = str(e)

    try:
        import hdbscan

        clusterer = hdbscan.HDBSCAN(min_cluster_size=max(3, len(X) // 25))
        lab = clusterer.fit_predict(Xn)
        mask = lab >= 0
        out["hdbscan_noise_frac"] = float(1.0 - mask.mean())
        if mask.sum() > n_clusters_hint and len(set(lab[mask])) > 1:
            out["hdbscan_silhouette"] = float(silhouette_score(Xn[mask], lab[mask]))
            out["hdbscan_dbi"] = float(davies_bouldin_score(Xn[mask], lab[mask]))
        else:
            out["hdbscan_silhouette"] = None
            out["hdbscan_note"] = "too few clustered points for silhouette"
    except ImportError:
        # sklearn approx: Agglomerative as stand-in note
        out["hdbscan"] = "hdbscan package not installed — install for full check"
    except Exception as e:
        out["hdbscan_error"] = str(e)
    return out


def main():
    with open(PICKLES / "X.pkl", "rb") as f:
        X0 = np.asarray(pickle.load(f), dtype=np.float32)
    X0 = StandardScaler().fit_transform(X0).astype(np.float32)

    sizes = [49, 100, 500, 1000, 5000]
    rows = []
    for n in sizes:
        X = expand(X0, n)
        lat = faiss_vs_brute(X)
        cl = cluster_metrics(X)
        row = {"N": n, "latency": lat, "clusters": cl, "synthetic_expand": n > 49}
        rows.append(row)
        print(n, lat.get("speedup"), cl.get("hdbscan_silhouette") or cl.get("hdbscan"))

    out = {
        "note": (
            "N>49 uses noisy clones of real feature rows — not new UNESCO sites. "
            "Use for index/cluster scaling behavior only. Real growth needs validated CSV+images."
        ),
        "base_n": 49,
        "rows": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
