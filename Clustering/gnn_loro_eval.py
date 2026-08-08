"""
Experiment 1: Leave-One-Relation-Out (LORO) GraphSAGE evaluation.

Trains GraphSAGE while holding out one edge type from the knowledge graph,
then measures:
  A) Site-to-site recommendation MRR@5 / P@5 (metadata GT without the held-out cue)
  B) Link-prediction AUC for the held-out relation (site ↔ concept)

Held-out relations: style | material | civilization | era

Output: Pickles/gnn_loro_metrics.json
"""

from __future__ import annotations

import json
import os
import pickle
from typing import Literal

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
import networkx as nx
from sklearn.metrics import roc_auc_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import LabelEncoder, StandardScaler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")
DATASET_PATH = os.path.join(BASE_DIR, "..", "Dataset", "heritage_sites_v2.csv")

Holdout = Literal["style", "material", "civilization", "era", "none"]


def load_pickle(name):
    with open(os.path.join(PICKLES_DIR, name), "rb") as f:
        return pickle.load(f)


def compute_gt(df, exclude: Holdout):
    """Metadata relevance GT that does NOT use the held-out cue (fairer eval)."""
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
            match = False
            if exclude != "civilization" and civ_i == civ_j and civ_i not in ("", "nan", "unknown"):
                match = True
            if exclude != "style" and style_i == style_j and style_i not in ("", "nan"):
                match = True
            if rel_i == rel_j and country_i == country_j and rel_i not in ("", "nan"):
                match = True
            if exclude != "style" and "rock-cut" in style_i and "rock-cut" in style_j:
                match = True
            if match:
                gt[i, j] = 1
    return gt


def eval_rec(sim, gt, k=5):
    n = sim.shape[0]
    mrr, prec = [], []
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
    return {"MRR@5": float(np.mean(mrr)), "Precision@5": float(np.mean(prec))}


class GraphSAGELayer(nn.Module):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.linear = nn.Linear(in_dim * 2, out_dim)
        self.norm = nn.LayerNorm(out_dim)

    def forward(self, X, adj):
        N = X.shape[0]
        agg = torch.zeros(N, X.shape[1], device=X.device)
        for v in range(N):
            nbrs = adj[v]
            agg[v] = X[nbrs].mean(dim=0) if nbrs else X[v]
        h = torch.relu(self.norm(self.linear(torch.cat([X, agg], dim=-1))))
        return h


class HeritageSAGE(nn.Module):
    def __init__(self, in_dim, hidden=256, out=128):
        super().__init__()
        self.sage1 = GraphSAGELayer(in_dim, hidden)
        self.sage2 = GraphSAGELayer(hidden, out)
        self.drop = nn.Dropout(0.2)

    def forward(self, X, adj):
        return self.sage2(self.drop(self.sage1(X, adj)), adj)


def build_graph(df, holdout: Holdout):
    site_names = df["Name"].tolist()
    N = len(site_names)
    site_id = {n: i for i, n in enumerate(site_names)}

    civ_le = LabelEncoder().fit(df["Civilization"])
    era_le = LabelEncoder().fit(df["Era"])
    style_le = LabelEncoder().fit(df["Architecture Style"])
    mat_le = LabelEncoder().fit(df["Material"])

    n_civ, n_era, n_style, n_mat = map(len, [civ_le.classes_, era_le.classes_, style_le.classes_, mat_le.classes_])
    CIV_OFF = N
    ERA_OFF = N + n_civ
    STYLE_OFF = N + n_civ + n_era
    MAT_OFF = N + n_civ + n_era + n_style
    TOTAL = N + n_civ + n_era + n_style + n_mat

    G = nx.Graph()
    G.add_nodes_from(range(TOTAL))

    held_edges = []  # (site_idx, concept_idx) for link prediction
    for _, row in df.iterrows():
        s = site_id[row["Name"]]
        civ = CIV_OFF + int(civ_le.transform([row["Civilization"]])[0])
        era = ERA_OFF + int(era_le.transform([row["Era"]])[0])
        style = STYLE_OFF + int(style_le.transform([row["Architecture Style"]])[0])
        mat = MAT_OFF + int(mat_le.transform([row["Material"]])[0])

        if holdout != "civilization":
            G.add_edge(s, civ)
        else:
            held_edges.append((s, civ))
        if holdout != "era":
            G.add_edge(s, era)
        else:
            held_edges.append((s, era))
        if holdout != "style":
            G.add_edge(s, style)
        else:
            held_edges.append((s, style))
        if holdout != "material":
            G.add_edge(s, mat)
        else:
            held_edges.append((s, mat))

    adj = [list(G.neighbors(i)) for i in range(TOTAL)]
    meta = {
        "N": N,
        "TOTAL": TOTAL,
        "offsets": {"civ": CIV_OFF, "era": ERA_OFF, "style": STYLE_OFF, "mat": MAT_OFF},
        "n_edges": G.number_of_edges(),
        "held_edges": held_edges,
    }
    return adj, meta, site_names


def build_features(df, N, TOTAL):
    Arch = load_pickle("Arch.pkl")
    Mat = load_pickle("Mat.pkl")
    Struct = load_pickle("Struct.pkl")
    df_pkl = load_pickle("df.pkl")
    scalars = df_pkl[["Area(m2)", "YearNum", "PopularityNum", "PreservationNum"]].fillna(0).values
    scalars = StandardScaler().fit_transform(scalars)
    site_feat = np.hstack([scalars, Arch, Mat, Struct])
    dim = site_feat.shape[1]
    concept = np.zeros((TOTAL - N, dim), dtype=np.float32)
    X = np.vstack([site_feat, concept])
    return torch.tensor(X, dtype=torch.float32)


def contrastive_loss(emb, pairs, N, temperature=0.1):
    e = nn.functional.normalize(emb[:N], dim=-1)
    if not pairs:
        return torch.tensor(0.0, requires_grad=True)
    loss = 0.0
    for i, j in pairs:
        sim_ij = (e[i] * e[j]).sum() / temperature
        sims = (e[i : i + 1] * e).sum(-1) / temperature
        loss = loss + (torch.logsumexp(sims, 0) - sim_ij)
    return loss / len(pairs)


def link_auc(emb, held_edges, N, TOTAL, n_neg=200):
    if not held_edges:
        return None
    e = nn.functional.normalize(emb.detach(), dim=-1).cpu().numpy()
    y_true, y_score = [], []
    rng = np.random.default_rng(42)
    for s, c in held_edges:
        y_true.append(1)
        y_score.append(float(np.dot(e[s], e[c])))
    # negatives: random site-concept pairs not in held
    held_set = set(held_edges)
    for _ in range(n_neg):
        s = int(rng.integers(0, N))
        c = int(rng.integers(N, TOTAL))
        if (s, c) in held_set:
            continue
        y_true.append(0)
        y_score.append(float(np.dot(e[s], e[c])))
    if len(set(y_true)) < 2:
        return None
    return float(roc_auc_score(y_true, y_score))


def run_one(df, holdout: Holdout, epochs=60):
    print(f"\n=== LORO holdout={holdout} ===")
    adj, meta, site_names = build_graph(df, holdout)
    N, TOTAL = meta["N"], meta["TOTAL"]
    X = build_features(df, N, TOTAL)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    X = X.to(device)

    # positives: same civilization (unless civilization held out — then same country)
    if holdout == "civilization":
        labels = df["Country"].fillna("Unknown").tolist()
    else:
        labels = df["Civilization"].fillna("Unknown").tolist()
    pairs = [(i, j) for i in range(N) for j in range(i + 1, N) if labels[i] == labels[j]]

    gnn = HeritageSAGE(X.shape[1]).to(device)
    opt = optim.Adam(gnn.parameters(), lr=5e-4, weight_decay=1e-4)
    gnn.train()
    for ep in range(epochs):
        opt.zero_grad()
        emb = gnn(X, adj)
        loss = contrastive_loss(emb, pairs, N)
        loss.backward()
        opt.step()
        if (ep + 1) % 20 == 0:
            print(f"  epoch {ep+1}/{epochs} loss={loss.item():.4f}")

    gnn.eval()
    with torch.no_grad():
        emb = gnn(X, adj)
        site = nn.functional.normalize(emb[:N], dim=-1).cpu().numpy()
    sim = cosine_similarity(site)
    gt = compute_gt(df if "Civilization" in df.columns else load_pickle("df.pkl"), holdout)
    # align df for GT — use pickle df
    df_pkl = load_pickle("df.pkl")
    gt = compute_gt(df_pkl, holdout)
    rec = eval_rec(sim, gt)
    auc = link_auc(emb, meta["held_edges"], N, TOTAL)
    out = {
        "holdout": holdout,
        "n_edges_kept": meta["n_edges"],
        "n_held_edges": len(meta["held_edges"]),
        "device": str(device),
        **rec,
        "held_link_AUC": auc,
    }
    print(f"  MRR@5={rec['MRR@5']:.4f} P@5={rec['Precision@5']:.4f} link_AUC={auc}")
    return out


def main():
    df = pd.read_csv(DATASET_PATH).fillna("Unknown")
    results = {}
    for h in ["none", "style", "material", "civilization", "era"]:
        results[h] = run_one(df, h)  # type: ignore

    # delta vs full graph
    base = results["none"]["MRR@5"]
    for h, m in results.items():
        m["MRR_delta_vs_full"] = float(m["MRR@5"] - base)

    path = os.path.join(PICKLES_DIR, "gnn_loro_metrics.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"results": results, "note": "GT excludes held-out cue; link AUC on held edges"}, f, indent=2)
    print(f"\nSaved {path}")
    print("\nSummary (MRR@5):")
    for h, m in results.items():
        print(f"  {h:<14} {m['MRR@5']:.4f}  (Δ {m['MRR_delta_vs_full']:+.4f})  AUC={m['held_link_AUC']}")


if __name__ == "__main__":
    main()
