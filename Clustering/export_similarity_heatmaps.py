"""
Export readable site-to-site similarity heatmaps for Word/Springer paste.
Uses a diverse subset of sites so axis labels stay legible.
"""
from __future__ import annotations

import os
import pickle

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler, normalize

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, ".."))
PICKLES = os.path.join(BASE, "Pickles")
CSV = os.path.join(ROOT, "Dataset", "heritage_sites_v2.csv")
OUT = os.path.join(ROOT, "docs", "paper_figures")
DPI = 280

# Curated diverse subset (readable axes in Word)
SUBSET = [
    "Ajanta Caves",
    "Ellora Caves",
    "Hampi Monuments",
    "Great Wall of China",
    "Forbidden City",
    "Colosseum",
    "Acropolis of Athens",
    "Alhambra",
    "Pyramids of Giza",
    "Great Zimbabwe Ruins",
]


def load_pkl(name):
    with open(os.path.join(PICKLES, name), "rb") as f:
        return pickle.load(f)


def index_subset(names: list[str], wanted: list[str]) -> tuple[list[int], list[str]]:
    name_to_i = {n: i for i, n in enumerate(names)}
    idx, labels = [], []
    for n in wanted:
        if n in name_to_i:
            idx.append(name_to_i[n])
            # shorter display labels
            lab = n.replace(" Group of Monuments", "").replace(" Archaeological Site", "")
            if len(lab) > 20:
                lab = lab[:18] + "…"
            labels.append(lab)
    return idx, labels


def heatmap(sim: np.ndarray, labels: list[str], title: str, cbar: str, out_name: str):
    os.makedirs(OUT, exist_ok=True)
    n = len(labels)
    s = np.asarray(sim, dtype=float)
    vmin = float(min(0.0, np.min(s)))
    vmax = float(max(1.0, np.max(s))) if np.max(s) > 1 else 1.0
    # keep a readable span
    if np.max(s) - np.min(s) < 0.2:
        vmin, vmax = float(np.min(s)), float(np.max(s))

    fig_w = max(8.0, 0.55 * n + 2.5)
    fig_h = max(7.2, 0.55 * n + 2.0)
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))

    im = ax.imshow(s, cmap="magma", vmin=vmin, vmax=vmax, interpolation="nearest")
    cb = fig.colorbar(im, ax=ax, fraction=0.045, pad=0.03)
    cb.set_label(cbar, fontsize=11)
    cb.ax.tick_params(labelsize=9)

    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels(labels, rotation=40, ha="right", fontsize=11)
    ax.set_yticklabels(labels, fontsize=11)

    mid = (vmin + vmax) / 2.0
    for i in range(n):
        for j in range(n):
            v = float(s[i, j])
            color = "white" if v < mid else "black"
            ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=9, color=color, fontweight="medium")

    ax.set_title(title, fontsize=13, pad=12)
    fig.tight_layout()
    path = os.path.join(OUT, out_name)
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"Wrote {path} ({n} sites)")
    return path


def tabular_sim(names: list[str], idx: list[int]) -> np.ndarray:
    df = pd.read_csv(CSV)
    df.columns = [c.strip() for c in df.columns]
    # align rows to pickle name order
    by = {str(r["Name"]): r for _, r in df.iterrows()}
    rows = [by[names[i]] for i in idx]
    sub = pd.DataFrame(rows)

    pieces = []
    pres_map = {
        "Excellent": 4, "Good": 3, "Moderate": 2,
        "Partially ruined, preserved": 1, "Ruins preserved": 1, "Low": 0,
    }
    pop_map = {
        "Very high": 4, "High": 3, "Moderate-High": 2.5,
        "Moderate": 2, "Low-Moderate": 1, "Low": 0,
    }
    pieces.append(sub["Preservation"].map(pres_map).fillna(2).to_numpy()[:, None])
    pieces.append(sub["Popularity"].map(pop_map).fillna(2).to_numpy()[:, None])
    area = pd.to_numeric(sub["Area(m2)"], errors="coerce").fillna(0).to_numpy()
    pieces.append(np.log1p(np.clip(area, 0, None))[:, None])
    year = pd.to_numeric(sub["Year(midpoint)"], errors="coerce").fillna(0).to_numpy()[:, None]
    pieces.append(year)
    dummies = pd.get_dummies(sub["Continent"].fillna("Unknown"))
    pieces.append(dummies.to_numpy(dtype=float))
    X = np.hstack(pieces)
    Xs = StandardScaler().fit_transform(X)
    return cosine_similarity(Xs)


def main():
    names = load_pkl("site_names.pkl")
    idx, labels = index_subset(names, SUBSET)
    if len(idx) < 8:
        raise SystemExit(f"Too few subset matches: {len(idx)}")

    # Fig-style tabular
    tab = tabular_sim(names, idx)
    heatmap(
        tab,
        labels,
        f"Site–site similarity (tabular cosine, subset n={len(labels)})",
        "Cosine similarity",
        "fig_similarity_heatmap.png",
    )

    # GraphSAGE
    gnn = np.asarray(load_pkl("gnn_similarity.pkl"), dtype=float)
    gnn_sub = gnn[np.ix_(idx, idx)]
    heatmap(
        gnn_sub,
        labels,
        f"Site–site similarity (GraphSAGE, subset n={len(labels)})",
        "Cosine similarity (GraphSAGE)",
        "fig_graphsage_similarity_heatmap.png",
    )

    # CLIP joint
    clip = load_pkl("clip_embeddings.pkl")
    clip_names = list(clip.get("site_names") or names)
    cidx, clabels = index_subset(clip_names, SUBSET)
    joint = normalize(np.asarray(clip["joint_embeddings"], dtype=float))
    clip_sim = cosine_similarity(joint)
    clip_sub = clip_sim[np.ix_(cidx, cidx)]
    heatmap(
        clip_sub,
        clabels,
        f"Site–site similarity (CLIP-Heritage joint, subset n={len(clabels)})",
        "Cosine similarity (CLIP joint)",
        "fig_clip_joint_similarity_heatmap.png",
    )

    # Primary fusion matrix
    prim = np.asarray(load_pkl("similarity.pkl"), dtype=float)
    prim_sub = prim[np.ix_(idx, idx)]
    heatmap(
        prim_sub,
        labels,
        f"Site–site similarity (feature fusion, subset n={len(labels)})",
        "Cosine similarity (fused features)",
        "fig_fusion_similarity_heatmap.png",
    )

    print("Done. Use these PNGs in Word; caption should say representative subset.")


if __name__ == "__main__":
    main()
