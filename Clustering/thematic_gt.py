"""
Non-civilization thematic ground truth for recommenders.

Relevance if sites share Architecture Style, Material, Structure, Religion,
or Era (NOT Civilization). Evaluates available similarity matrices with MRR@5.

Also writes expert-style thematic pair list derived from multi-attribute overlap
(≥2 shared thematic fields) for paper appendix.

Output: Clustering/Pickles/thematic_gt_metrics.json
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

BASE = Path(__file__).resolve().parent
PICKLES = BASE / "Pickles"
OUT = PICKLES / "thematic_gt_metrics.json"

FIELDS = [
    "Architecture Style",
    "Material",
    "Structure",
    "Religion",
    "Era",
]


def load_pickle(name):
    with open(PICKLES / name, "rb") as f:
        return pickle.load(f)


def _norm(v) -> str:
    s = str(v).strip().lower()
    if s in ("", "nan", "none", "unknown", "n/a"):
        return ""
    return s


def thematic_gt(df, min_shared: int = 1) -> np.ndarray:
    n = len(df)
    gt = np.zeros((n, n), dtype=int)
    for i in range(n):
        vals_i = {f: _norm(df.iloc[i].get(f, "")) for f in FIELDS}
        for j in range(n):
            if i == j:
                continue
            shared = 0
            for f in FIELDS:
                a, b = vals_i[f], _norm(df.iloc[j].get(f, ""))
                if a and b and a == b:
                    shared += 1
                # soft rock-cut / gothic theme tokens
                elif a and b and (
                    ("rock" in a and "rock" in b)
                    or ("gothic" in a and "gothic" in b)
                ):
                    shared += 1
            if shared >= min_shared:
                gt[i, j] = 1
    return gt


def strong_pairs(df, site_names, min_shared: int = 2, limit: int = 40):
    pairs = []
    n = len(df)
    for i in range(n):
        for j in range(i + 1, n):
            shared_fields = []
            for f in FIELDS:
                a, b = _norm(df.iloc[i].get(f, "")), _norm(df.iloc[j].get(f, ""))
                if a and b and a == b:
                    shared_fields.append(f)
            if len(shared_fields) >= min_shared:
                pairs.append(
                    {
                        "a": site_names[i] if hasattr(site_names, "__getitem__") else str(df.iloc[i].get("Name")),
                        "b": site_names[j] if hasattr(site_names, "__getitem__") else str(df.iloc[j].get("Name")),
                        "shared_fields": shared_fields,
                    }
                )
    pairs.sort(key=lambda p: -len(p["shared_fields"]))
    return pairs[:limit]


def eval_mrr(sim, gt, k=5):
    n = sim.shape[0]
    mrrs, precs = [], []
    for i in range(n):
        s = sim[i].copy()
        s[i] = -np.inf
        top = np.argsort(s)[::-1][:k]
        mrr = 0.0
        for r, j in enumerate(top):
            if gt[i, j] == 1:
                mrr = 1.0 / (r + 1)
                break
        mrrs.append(mrr)
        precs.append(gt[i, top].sum() / k)
    return {"MRR@5": float(np.mean(mrrs)), "Precision@5": float(np.mean(precs))}


def main():
    df = load_pickle("df.pkl")
    site_names = list(load_pickle("site_names.pkl"))
    gt1 = thematic_gt(df, min_shared=1)
    gt2 = thematic_gt(df, min_shared=2)

    mats = {}
    try:
        arch = load_pickle("Arch.pkl")
        cols = [c for c in ("Area(m2)", "YearNum", "PopularityNum", "PreservationNum") if c in df.columns]
        if cols:
            sc = StandardScaler().fit_transform(df[cols].values.astype(float))
            X = np.hstack([sc, np.asarray(arch, dtype=float)])
        else:
            X = np.asarray(arch, dtype=float)
        mats["Scalar_Arch"] = cosine_similarity(StandardScaler().fit_transform(X))
    except Exception as e:
        print("Scalar_Arch skip", e)

    if (PICKLES / "gnn_similarity.pkl").exists():
        mats["GraphSAGE"] = np.asarray(load_pickle("gnn_similarity.pkl"), dtype=float)

    for pkl, key in [("clip_embeddings.pkl", "CLIP"), ("similarity.pkl", "primary")]:
        if not (PICKLES / pkl).exists():
            continue
        obj = load_pickle(pkl)
        if isinstance(obj, np.ndarray):
            mats[key] = obj
        elif isinstance(obj, dict) and "embeddings" in obj:
            mats[key] = cosine_similarity(np.asarray(obj["embeddings"]))
        elif isinstance(obj, dict) and "joint_sim" in obj:
            mats[key] = np.asarray(obj["joint_sim"])

    results = {
        "gt_definition": "shared Architecture Style / Material / Structure / Religion / Era (no Civilization)",
        "gt_pairs_min1": int(gt1.sum() // 2),
        "gt_pairs_min2": int(gt2.sum() // 2),
        "metrics_min_shared_1": {},
        "metrics_min_shared_2": {},
        "thematic_pairs_min2": strong_pairs(df, site_names, 2),
    }

    for label, sim in mats.items():
        if sim.shape[0] != gt1.shape[0]:
            continue
        results["metrics_min_shared_1"][label] = eval_mrr(sim, gt1)
        results["metrics_min_shared_2"][label] = eval_mrr(sim, gt2)
        print(
            label,
            "min1",
            results["metrics_min_shared_1"][label],
            "min2",
            results["metrics_min_shared_2"][label],
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
