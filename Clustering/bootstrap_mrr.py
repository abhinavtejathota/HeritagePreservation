"""
Bootstrap CI + leave-one-site-out stability for MRR@5 on main similarity matrices.

Uses civilization-style GT from benchmark.compute_ground_truth for continuity,
plus reports 95% bootstrap CI over sites.

Output: Clustering/Pickles/bootstrap_mrr_metrics.json
"""

from __future__ import annotations

import json
import os
import pickle
from pathlib import Path

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

BASE = Path(__file__).resolve().parent
PICKLES = BASE / "Pickles"
OUT = PICKLES / "bootstrap_mrr_metrics.json"


def load_pickle(name):
    with open(PICKLES / name, "rb") as f:
        return pickle.load(f)


def mrr_per_site(sim: np.ndarray, gt: np.ndarray, k: int = 5) -> np.ndarray:
    n = sim.shape[0]
    out = np.zeros(n)
    for i in range(n):
        sims = sim[i].copy()
        sims[i] = -np.inf
        ranked = np.argsort(sims)[::-1][:k]
        for r, j in enumerate(ranked):
            if gt[i, j] == 1:
                out[i] = 1.0 / (r + 1)
                break
    return out


def bootstrap_ci(values: np.ndarray, n_boot: int = 2000, seed: int = 42):
    rng = np.random.default_rng(seed)
    n = len(values)
    means = []
    for _ in range(n_boot):
        idx = rng.integers(0, n, size=n)
        means.append(float(values[idx].mean()))
    lo, hi = np.percentile(means, [2.5, 97.5])
    return {
        "mean": float(values.mean()),
        "ci95_low": float(lo),
        "ci95_high": float(hi),
        "n_boot": n_boot,
    }


def leave_one_site_out_mean(sim: np.ndarray, gt: np.ndarray, k: int = 5):
    """Mean of MRR when each site is excluded from the average (stability)."""
    per = mrr_per_site(sim, gt, k)
    n = len(per)
    loso = []
    for i in range(n):
        mask = np.ones(n, dtype=bool)
        mask[i] = False
        loso.append(float(per[mask].mean()))
    return {
        "loso_mean_of_means": float(np.mean(loso)),
        "loso_std": float(np.std(loso)),
        "full_mrr": float(per.mean()),
    }


def compute_ground_truth(df, site_names):
    """Same heuristic GT as benchmark.py (civilization / style / …)."""
    num_sites = len(site_names)
    gt = np.zeros((num_sites, num_sites), dtype=int)
    for i in range(num_sites):
        row_i = df.iloc[i]
        civ_i = str(row_i.get("Civilization", "")).strip().lower()
        style_i = str(row_i.get("Architecture Style", "")).strip().lower()
        rel_i = str(row_i.get("Religion", "")).strip().lower()
        country_i = str(row_i.get("Country", "")).strip().lower()
        for j in range(num_sites):
            if i == j:
                continue
            row_j = df.iloc[j]
            civ_j = str(row_j.get("Civilization", "")).strip().lower()
            style_j = str(row_j.get("Architecture Style", "")).strip().lower()
            rel_j = str(row_j.get("Religion", "")).strip().lower()
            country_j = str(row_j.get("Country", "")).strip().lower()
            match = False
            if civ_i == civ_j and civ_i not in ["", "nan", "unknown"]:
                match = True
            elif style_i == style_j and style_i not in ["", "nan"]:
                match = True
            elif rel_i == rel_j and country_i == country_j and rel_i not in ["", "nan"]:
                match = True
            elif "rock-cut" in style_i and "rock-cut" in style_j:
                match = True
            elif ("roman" in civ_i or "roman" in style_i) and (
                "roman" in civ_j or "roman" in style_j
            ):
                match = True
            if match:
                gt[i, j] = 1
    return gt


def _scalar_arch_matrix(df):
    """Build Scalar+Arch from Arch.pkl + numeric scalars (feature_sets stores flags only)."""
    arch = load_pickle("Arch.pkl")
    cols = [c for c in ("Area(m2)", "YearNum", "PopularityNum", "PreservationNum") if c in df.columns]
    if not cols:
        return np.asarray(arch, dtype=float)
    sc = StandardScaler().fit_transform(df[cols].values.astype(float))
    return np.hstack([sc, np.asarray(arch, dtype=float)])


def load_sim_matrices(df, site_names):
    mats = {}
    try:
        X = _scalar_arch_matrix(df)
        mats["Scalar_Arch"] = cosine_similarity(StandardScaler().fit_transform(X))
    except Exception as e:
        print(f"[warn] Scalar_Arch: {e}")

    for name, pkl in [
        ("CLIP_pretrained", "clip_embeddings.pkl"),
        ("gnn", "gnn_similarity.pkl"),
    ]:
        path = PICKLES / pkl
        if not path.exists():
            continue
        try:
            obj = load_pickle(pkl)
            if name == "gnn" and isinstance(obj, np.ndarray):
                mats["GraphSAGE"] = np.asarray(obj, dtype=float)
            elif isinstance(obj, dict):
                if "joint_sim" in obj:
                    mats[name] = np.asarray(obj["joint_sim"], dtype=float)
                elif "similarity" in obj:
                    mats[name] = np.asarray(obj["similarity"], dtype=float)
                elif "embeddings" in obj:
                    emb = np.asarray(obj["embeddings"], dtype=float)
                    mats[name] = cosine_similarity(emb)
        except Exception as e:
            print(f"[warn] {name}: {e}")

    for alt in ("similarity.pkl", "similarity_late_fusion.pkl"):
        if (PICKLES / alt).exists():
            try:
                mats[alt.replace(".pkl", "")] = np.asarray(load_pickle(alt), dtype=float)
            except Exception:
                pass
    return mats


def main():
    df = load_pickle("df.pkl")
    site_names = load_pickle("site_names.pkl")
    gt = compute_ground_truth(df, site_names)
    mats = load_sim_matrices(df, site_names)

    results = {}
    for label, sim in mats.items():
        if sim.shape[0] != gt.shape[0]:
            print(f"[skip] {label} shape {sim.shape} != gt {gt.shape}")
            continue
        per = mrr_per_site(sim, gt, 5)
        results[label] = {
            "bootstrap_MRR@5": bootstrap_ci(per),
            "leave_one_site_out": leave_one_site_out_mean(sim, gt, 5),
            "n_sites": int(len(per)),
            "sites_with_zero_mrr": int(np.sum(per == 0)),
        }
        b = results[label]["bootstrap_MRR@5"]
        print(
            f"{label}: MRR={b['mean']:.3f} CI95=[{b['ci95_low']:.3f}, {b['ci95_high']:.3f}]"
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
