"""
Export high-DPI paper figures for dataset distributions + similarity heatmap.

Addresses review feedback: enlarge illegible heatmaps / pie-style charts and
make distribution insights inspectable.

Usage:
  python Clustering/export_paper_figures.py

Outputs (git-friendly):
  docs/paper_figures/fig_continent_distribution.png
  docs/paper_figures/fig_preservation_popularity.png
  docs/paper_figures/fig_similarity_heatmap.png
  docs/paper_figures/fig_era_distribution.png
  docs/paper_figures/CAPTIONS.md
"""
from __future__ import annotations

import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, ".."))
CSV = os.path.join(ROOT, "Dataset", "heritage_sites_v2.csv")
OUT = os.path.join(ROOT, "docs", "paper_figures")
DPI = 220


def _ensure_out():
    os.makedirs(OUT, exist_ok=True)


def _load():
    df = pd.read_csv(CSV)
    df.columns = [c.strip() for c in df.columns]
    return df


def fig_continent(df: pd.DataFrame):
    counts = df["Continent"].value_counts()
    fig, ax = plt.subplots(figsize=(7, 5))
    wedges, texts, autotexts = ax.pie(
        counts.values,
        labels=counts.index,
        autopct="%1.0f%%",
        startangle=90,
        textprops={"fontsize": 12},
    )
    for t in autotexts:
        t.set_fontsize(11)
    ax.set_title(
        f"Heritage corpus by continent (n={len(df)})",
        fontsize=14,
        pad=12,
    )
    fig.tight_layout()
    path = os.path.join(OUT, "fig_continent_distribution.png")
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path, (
        f"Continent distribution of the curated corpus (n={len(df)}). "
        f"Asia dominates ({counts.get('Asia', 0)} sites); Europe and Africa "
        f"are represented ({counts.get('Europe', 0)} / {counts.get('Africa', 0)}). "
        "Americas and Oceania are absent in this release — a stated limitation."
    )


def fig_preservation_popularity(df: pd.DataFrame):
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
    for ax, col, title in [
        (axes[0], "Preservation", "Preservation labels"),
        (axes[1], "Popularity", "Popularity labels"),
    ]:
        counts = df[col].value_counts()
        ax.barh(counts.index.astype(str)[::-1], counts.values[::-1], color="#44403c")
        ax.set_title(title, fontsize=13)
        ax.set_xlabel("Count")
        ax.tick_params(axis="y", labelsize=10)
        for i, v in enumerate(counts.values[::-1]):
            ax.text(v + 0.15, i, str(v), va="center", fontsize=10)
    fig.suptitle(f"Feature distributions (n={len(df)})", fontsize=14, y=1.02)
    fig.tight_layout()
    path = os.path.join(OUT, "fig_preservation_popularity.png")
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path, (
        "Horizontal bar charts of Preservation and Popularity categorical fields. "
        "Most sites are labeled Good/Excellent preservation and High/Very high popularity, "
        "reflecting a well-known-landmark bias in the curated set."
    )


def fig_era(df: pd.DataFrame):
    # Prefer coarse era if present elsewhere; CSV uses free-text Era — bucket by century keyword is noisy.
    # Use Civilization top-N as a readable companion distribution for the paper.
    col = "Civilization" if "Civilization" in df.columns else df.columns[5]
    counts = df[col].value_counts().head(10)
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.barh(counts.index.astype(str)[::-1], counts.values[::-1], color="#57534e")
    ax.set_xlabel("Count")
    ax.set_title(f"Top civilizations in corpus (n={len(df)})", fontsize=14)
    fig.tight_layout()
    path = os.path.join(OUT, "fig_era_distribution.png")
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path, (
        f"Top-{len(counts)} civilization labels by frequency. "
        "Use alongside continent charts to discuss cultural coverage — not as a balanced world sample."
    )


def _numeric_matrix(df: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    """Build a simple numeric feature matrix for an interpretable cosine heatmap."""
    names = df["Name"].astype(str).tolist()
    pieces = []
    # ordinal-ish maps
    pres_map = {
        "Excellent": 4,
        "Good": 3,
        "Moderate": 2,
        "Partially ruined, preserved": 1,
        "Ruins preserved": 1,
        "Low": 0,
    }
    pop_map = {
        "Very high": 4,
        "High": 3,
        "Moderate-High": 2.5,
        "Moderate": 2,
        "Low-Moderate": 1,
        "Low": 0,
    }
    if "Preservation" in df.columns:
        pieces.append(df["Preservation"].map(pres_map).fillna(2).to_numpy()[:, None])
    if "Popularity" in df.columns:
        pieces.append(df["Popularity"].map(pop_map).fillna(2).to_numpy()[:, None])
    if "Area(m2)" in df.columns:
        area = pd.to_numeric(df["Area(m2)"], errors="coerce").fillna(0).to_numpy()
        area = np.log1p(np.clip(area, 0, None))[:, None]
        pieces.append(area)
    if "Year(midpoint)" in df.columns:
        year = pd.to_numeric(df["Year(midpoint)"], errors="coerce").fillna(0).to_numpy()[
            :, None
        ]
        pieces.append(year)

    # one-hot continent
    if "Continent" in df.columns:
        dummies = pd.get_dummies(df["Continent"].fillna("Unknown"))
        pieces.append(dummies.to_numpy(dtype=float))

    X = np.hstack(pieces) if pieces else np.eye(len(df))
    Xs = StandardScaler().fit_transform(X)
    return Xs, names


def fig_heatmap(df: pd.DataFrame):
    X, names = _numeric_matrix(df)
    sim = cosine_similarity(X)
    # subsample labels for readability
    step = max(1, len(names) // 16)
    tick_idx = list(range(0, len(names), step))
    tick_labels = [names[i][:22] for i in tick_idx]

    fig, ax = plt.subplots(figsize=(10, 9))
    im = ax.imshow(sim, cmap="magma", vmin=0, vmax=1, interpolation="nearest")
    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_label("Cosine similarity (tabular features)", fontsize=11)
    ax.set_xticks(tick_idx)
    ax.set_xticklabels(tick_labels, rotation=75, ha="right", fontsize=7)
    ax.set_yticks(tick_idx)
    ax.set_yticklabels(tick_labels, fontsize=7)
    ax.set_title(
        f"Site–site similarity heatmap (tabular cosine, n={len(names)})",
        fontsize=13,
        pad=10,
    )
    fig.tight_layout()
    path = os.path.join(OUT, "fig_similarity_heatmap.png")
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path, (
        "Cosine similarity among sites using scaled tabular features "
        "(preservation, popularity, log area, year midpoint, continent one-hots). "
        "Bright blocks indicate groups that share coarse metadata; "
        "this figure is for interpretability in the paper — learned CLIP/GraphSAGE "
        "matrices should be cited from Clustering Pickles when available."
    )


def main():
    if not os.path.isfile(CSV):
        print(f"Missing CSV: {CSV}", file=sys.stderr)
        sys.exit(1)
    _ensure_out()
    df = _load()
    captions = ["# Paper figure captions\n", f"Generated from `{os.path.relpath(CSV, ROOT)}` (n={len(df)}).\n"]
    for fn in (fig_continent, fig_preservation_popularity, fig_era, fig_heatmap):
        path, caption = fn(df)
        name = os.path.basename(path)
        captions.append(f"\n## {name}\n\n{caption}\n")
        print("wrote", path)
    cap_path = os.path.join(OUT, "CAPTIONS.md")
    with open(cap_path, "w", encoding="utf-8") as f:
        f.write("\n".join(captions))
    print("wrote", cap_path)


if __name__ == "__main__":
    main()
