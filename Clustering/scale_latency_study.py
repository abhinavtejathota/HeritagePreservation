"""
Experiment 4: Index scale latency study — FAISS HNSW vs NumPy brute.

Synthetically expands the 49-site feature matrix to N ∈ {100, 500, 1000, 5000, 10000}
via Gaussian noise around real vectors, then measures mean query latency (ms) for top-5.

Output: Pickles/scale_latency_metrics.json
"""

from __future__ import annotations

import json
import os
import pickle
import time

import numpy as np
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler, normalize

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")


def load_base():
    with open(os.path.join(PICKLES_DIR, "X.pkl"), "rb") as f:
        X = pickle.load(f)
    X = np.asarray(X, dtype=np.float32)
    if X.ndim != 2:
        raise ValueError("X.pkl unexpected shape")
    return StandardScaler().fit_transform(X).astype(np.float32)


def expand(X, n_target, seed=42):
    rng = np.random.default_rng(seed)
    n0, d = X.shape
    if n_target <= n0:
        return X[:n_target].copy()
    extra = n_target - n0
    idx = rng.integers(0, n0, size=extra)
    noise = rng.normal(0, 0.05, size=(extra, d)).astype(np.float32)
    return np.vstack([X, X[idx] + noise])


def brute_latency(X, repeats=3):
    Xn = normalize(X)
    times = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        for i in range(min(50, len(Xn))):  # sample 50 queries
            sims = Xn @ Xn[i]
            np.argsort(sims)[::-1][:5]
        times.append((time.perf_counter() - t0) * 1000 / min(50, len(Xn)))
    return float(np.mean(times))


def sklearn_nn_latency(X, repeats=3):
    Xn = normalize(X)
    nn = NearestNeighbors(n_neighbors=5, metric="cosine", algorithm="brute")
    nn.fit(Xn)
    times = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        for i in range(min(50, len(Xn))):
            nn.kneighbors(Xn[i : i + 1], n_neighbors=5)
        times.append((time.perf_counter() - t0) * 1000 / min(50, len(Xn)))
    return float(np.mean(times))


def faiss_latency(X, repeats=3):
    try:
        import faiss
    except ImportError:
        return None, "faiss not installed"

    Xn = normalize(X).astype(np.float32)
    d = Xn.shape[1]
    index = faiss.IndexHNSWFlat(d, 16)
    index.hnsw.efConstruction = 40
    index.hnsw.efSearch = 32
    index.add(Xn)
    times = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        for i in range(min(50, len(Xn))):
            index.search(Xn[i : i + 1], 5)
        times.append((time.perf_counter() - t0) * 1000 / min(50, len(Xn)))
    return float(np.mean(times)), "faiss.IndexHNSWFlat"


def main():
    base = load_base()
    print(f"Base feature matrix: {base.shape}")
    sizes = [49, 100, 500, 1000, 5000, 10000]
    rows = []
    for n in sizes:
        X = expand(base, n)
        b = brute_latency(X)
        s = sklearn_nn_latency(X)
        f, backend = faiss_latency(X)
        row = {
            "N": n,
            "dim": int(X.shape[1]),
            "brute_ms": b,
            "sklearn_brute_ms": s,
            "faiss_hnsw_ms": f,
            "faiss_backend": backend,
            "speedup_faiss_vs_brute": (b / f) if f and f > 0 else None,
        }
        rows.append(row)
        print(
            f"N={n:<5} brute={b:.4f}ms  sklearn={s:.4f}ms  "
            f"faiss={f if f else float('nan'):.4f}ms  "
            f"speedup={row['speedup_faiss_vs_brute']}"
        )

    path = os.path.join(PICKLES_DIR, "scale_latency_metrics.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"rows": rows, "note": "synthetic expansion around real 49-site vectors"}, f, indent=2)
    print(f"Saved {path}")


if __name__ == "__main__":
    main()
