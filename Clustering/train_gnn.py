"""
Phase 2, Option 2: Heterogeneous Heritage Knowledge Graph + GraphSAGE GNN
==========================================================================
Builds a Knowledge Graph G=(V, E) from heritage_sites_v2.csv:
  - Node types: Sites, Civilizations, Eras, Architectural Styles, Materials
  - Edge types: BUILT_BY, LOCATED_IN, USES_STYLE, USES_MATERIAL

Trains a 2-layer GraphSAGE using pure PyTorch (no torch_geometric needed).
Produces 128-dim node embeddings for all heritage sites, then computes
cosine similarity on those embeddings for recommendation.

Outputs:
  - Pickles/gnn_embeddings.pkl  → 128-dim site embeddings
  - Pickles/gnn_similarity.pkl  → 49x49 cosine similarity matrix
"""

import os
import pickle
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
import networkx as nx
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import LabelEncoder, StandardScaler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE_DIR, "..", "Dataset", "heritage_sites_v2.csv")
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")

def load_pickle(name):
    return pickle.load(open(os.path.join(PICKLES_DIR, name), "rb"))

print("="*60)
print("   Phase 2 Option 2: Heritage Knowledge Graph + GNN")
print("="*60)

# ─────────────────────────────────────────────────────────────
# 1. LOAD DATA
# ─────────────────────────────────────────────────────────────
print("\n[1/5] Loading dataset...")
df = pd.read_csv(DATASET_PATH)
df = df.fillna("Unknown")
site_names = df["Name"].tolist()
N = len(site_names)
print(f"      Loaded {N} sites.")

# ─────────────────────────────────────────────────────────────
# 2. BUILD KNOWLEDGE GRAPH
# ─────────────────────────────────────────────────────────────
print("\n[2/5] Building Heritage Knowledge Graph G=(V, E)...")

G = nx.Graph()

# --- Node registries ---
# Sites (0 .. N-1)
site_id = {name: i for i, name in enumerate(site_names)}

# Encode categorical concept nodes
civ_le = LabelEncoder().fit(df["Civilization"])
era_le = LabelEncoder().fit(df["Era"])
style_le = LabelEncoder().fit(df["Architecture Style"])
mat_le = LabelEncoder().fit(df["Material"])

n_civ   = len(civ_le.classes_)
n_era   = len(era_le.classes_)
n_style = len(style_le.classes_)
n_mat   = len(mat_le.classes_)

# Global node offsets
CIV_OFFSET   = N
ERA_OFFSET   = N + n_civ
STYLE_OFFSET = N + n_civ + n_era
MAT_OFFSET   = N + n_civ + n_era + n_style
TOTAL_NODES  = N + n_civ + n_era + n_style + n_mat

print(f"      Nodes: {N} Sites | {n_civ} Civilizations | {n_era} Eras | {n_style} Styles | {n_mat} Materials")
print(f"      Total node count: {TOTAL_NODES}")

# Add all nodes
for i in range(TOTAL_NODES):
    G.add_node(i)

# Add edges
for idx, row in df.iterrows():
    s = site_id[row["Name"]]
    civ_node   = CIV_OFFSET   + int(civ_le.transform([row["Civilization"]])[0])
    era_node   = ERA_OFFSET   + int(era_le.transform([row["Era"]])[0])
    style_node = STYLE_OFFSET + int(style_le.transform([row["Architecture Style"]])[0])
    mat_node   = MAT_OFFSET   + int(mat_le.transform([row["Material"]])[0])

    G.add_edge(s, civ_node)    # BUILT_BY Civilization
    G.add_edge(s, era_node)    # LOCATED_IN Era
    G.add_edge(s, style_node)  # USES_STYLE Architecture
    G.add_edge(s, mat_node)    # USES_MATERIAL Material

print(f"      Total edges: {G.number_of_edges()}")

# Build adjacency list as list of lists
adj = [list(G.neighbors(i)) for i in range(TOTAL_NODES)]

# ─────────────────────────────────────────────────────────────
# 3. INITIAL NODE FEATURES
# ─────────────────────────────────────────────────────────────
print("\n[3/5] Computing initial node features...")

# Load existing MiniLM embeddings for sites
Arch   = load_pickle("Arch.pkl")    # (49, 384)
Mat_   = load_pickle("Mat.pkl")     # (49, 384)
Struct = load_pickle("Struct.pkl")  # (49, 384)

# Scalar features for sites
# Prefer engineered columns from df.pkl (YearNum, PopularityNum, …)
try:
    df_pkl = load_pickle("df.pkl")
    scalars = df_pkl[["Area(m2)", "YearNum", "PopularityNum", "PreservationNum"]].fillna(0).values
    civ_source = df_pkl
except Exception:
    df_pkl = None
    civ_source = df
    # Derive numeric columns from raw CSV if pickle unavailable
    year_raw = pd.to_numeric(df.get("Year(midpoint)", pd.Series([0] * N)), errors="coerce").fillna(0)
    pop_map = {"Very High": 6, "High": 5, "Moderate-High": 4, "Moderate": 3, "Low-Moderate": 2, "Low": 1}
    pres_map = {
        "Excellent": 5,
        "Good": 4,
        "Moderate": 3,
        "Partially ruined, preserved": 2,
        "Ruins preserved": 1,
    }
    pop = df["Popularity"].map(pop_map).fillna(3)
    pres = df["Preservation"].map(pres_map).fillna(3)
    area = pd.to_numeric(df["Area(m2)"], errors="coerce").fillna(0)
    scalars = np.column_stack([area, year_raw, pop, pres])

scaler = StandardScaler()
scalars_scaled = scaler.fit_transform(scalars)

# Site features: concat scalars + arch + mat + struct embeddings
site_features = np.hstack([scalars_scaled, Arch, Mat_, Struct])   # (49, 4+384+384+384)
site_feat_dim = site_features.shape[1]

# Concept node features: one-hot style embeddings (simple identity-ish initialization)
civ_feat   = np.eye(n_civ)
era_feat   = np.eye(n_era)
style_feat = np.eye(n_style)
mat_feat   = np.eye(n_mat)

# Pad all to same dimension (site_feat_dim) with zeros
def pad_to(X, target_dim):
    if X.shape[1] >= target_dim:
        return X[:, :target_dim]
    return np.hstack([X, np.zeros((X.shape[0], target_dim - X.shape[1]))])

civ_feat   = pad_to(civ_feat,   site_feat_dim)
era_feat   = pad_to(era_feat,   site_feat_dim)
style_feat = pad_to(style_feat, site_feat_dim)
mat_feat   = pad_to(mat_feat,   site_feat_dim)

# Stack all node features
X_init = np.vstack([site_features, civ_feat, era_feat, style_feat, mat_feat])
X_tensor = torch.tensor(X_init, dtype=torch.float32)
print(f"      Initial feature matrix shape: {X_tensor.shape}")

# ─────────────────────────────────────────────────────────────
# 4. GRAPHSAGE MODEL (Pure PyTorch, no torch_geometric)
# ─────────────────────────────────────────────────────────────
print("\n[4/5] Training 2-layer GraphSAGE model...")

class GraphSAGELayer(nn.Module):
    """
    Single GraphSAGE layer:
      h_v = ReLU( W · CONCAT(h_v, MEAN(h_neighbors)) )
    """
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.linear = nn.Linear(in_dim * 2, out_dim)
        self.norm   = nn.LayerNorm(out_dim)

    def forward(self, X, adj):
        """
        X   : (N, in_dim) node features
        adj : list of neighbor index lists
        Returns: (N, out_dim)
        """
        N = X.shape[0]
        # Mean-aggregate neighbors
        agg = torch.zeros(N, X.shape[1], device=X.device)
        for v in range(N):
            nbrs = adj[v]
            if nbrs:
                agg[v] = X[nbrs].mean(dim=0)
            else:
                agg[v] = X[v]  # self-loop fallback
        # Concat self + aggregated
        h = torch.cat([X, agg], dim=-1)
        h = self.linear(h)
        h = self.norm(h)
        return torch.relu(h)


class HeritageSAGE(nn.Module):
    """2-layer GraphSAGE → 128-dim embeddings"""
    def __init__(self, in_dim, hidden_dim=256, out_dim=128):
        super().__init__()
        self.sage1 = GraphSAGELayer(in_dim, hidden_dim)
        self.sage2 = GraphSAGELayer(hidden_dim, out_dim)
        self.dropout = nn.Dropout(0.2)

    def forward(self, X, adj):
        h = self.sage1(X, adj)
        h = self.dropout(h)
        h = self.sage2(h, adj)
        return h   # (N, out_dim)


in_dim = X_tensor.shape[1]
gnn = HeritageSAGE(in_dim=in_dim, hidden_dim=256, out_dim=128)
optimizer_gnn = optim.Adam(gnn.parameters(), lr=5e-4, weight_decay=1e-4)

# Self-supervised loss: contrastive between same-civilization site pairs
# Build positive pairs: sites sharing the same Civilization
civ_labels = civ_source["Civilization"].fillna("Unknown").tolist()

positive_pairs = []
for i in range(N):
    for j in range(i + 1, N):
        if civ_labels[i] == civ_labels[j]:
            positive_pairs.append((i, j))

print(f"      Positive training pairs (same civilization): {len(positive_pairs)}")

def graph_contrastive_loss(embeddings, positive_pairs, temperature=0.1):
    """
    InfoNCE-style loss on site node embeddings:
    Positive pairs pull together, all others repel.
    """
    emb = nn.functional.normalize(embeddings[:N], dim=-1)  # Only site nodes
    loss = torch.tensor(0.0, requires_grad=True)

    if not positive_pairs:
        return loss

    for (i, j) in positive_pairs:
        sim_ij = (emb[i] * emb[j]).sum() / temperature
        # Denominator: i against all other sites
        sims_i = (emb[i:i+1] * emb).sum(dim=-1) / temperature
        log_denom = torch.logsumexp(sims_i, dim=0)
        loss = loss + (log_denom - sim_ij)

    return loss / len(positive_pairs)


gnn.train()
epochs_gnn = 80
print_every = 20

for epoch in range(epochs_gnn):
    optimizer_gnn.zero_grad()
    embeddings = gnn(X_tensor, adj)
    loss = graph_contrastive_loss(embeddings, positive_pairs)
    loss.backward()
    optimizer_gnn.step()

    if (epoch + 1) % print_every == 0:
        print(f"      Epoch [{epoch+1}/{epochs_gnn}], GNN Loss: {loss.item():.4f}")

# ─────────────────────────────────────────────────────────────
# 5. EXTRACT SITE EMBEDDINGS & COMPUTE SIMILARITY
# ─────────────────────────────────────────────────────────────
print("\n[5/5] Extracting 128-dim site embeddings and computing similarity matrix...")

gnn.eval()
with torch.no_grad():
    all_embeddings = gnn(X_tensor, adj)
    site_embeddings = all_embeddings[:N].numpy()  # (49, 128)
    site_embeddings_norm = site_embeddings / np.linalg.norm(site_embeddings, axis=-1, keepdims=True)

gnn_sim_matrix = cosine_similarity(site_embeddings_norm)  # (49, 49)

# Save
output = {
    "site_names": site_names,
    "gnn_embeddings": site_embeddings_norm,
    "graph": {
        "n_sites": N,
        "n_civ": n_civ,
        "n_era": n_era,
        "n_style": n_style,
        "n_mat": n_mat,
        "total_nodes": TOTAL_NODES,
        "total_edges": G.number_of_edges()
    }
}

with open(os.path.join(PICKLES_DIR, "gnn_embeddings.pkl"), "wb") as f:
    pickle.dump(output, f)

with open(os.path.join(PICKLES_DIR, "gnn_similarity.pkl"), "wb") as f:
    pickle.dump(gnn_sim_matrix, f)

print(f"      Site embeddings shape: {site_embeddings_norm.shape}")
print(f"      GNN similarity matrix shape: {gnn_sim_matrix.shape}")
print(f"\nOK  Saved: Pickles/gnn_embeddings.pkl")
print(f"OK  Saved: Pickles/gnn_similarity.pkl")

# Quick sanity check: top-3 similar for Ajanta Caves
target = "Ajanta Caves"
if target in site_names:
    idx = site_names.index(target)
    sims = gnn_sim_matrix[idx].copy()
    sims[idx] = -1
    top3 = np.argsort(sims)[::-1][:3]
    print(f"\nGNN Top-3 similar to '{target}':")
    for rank, t in enumerate(top3, 1):
        print(f"   {rank}. {site_names[t]}  (sim={sims[t]:.4f})")

print("\n" + "="*60)
print("   Phase 2 Option 2: GNN Training Complete!")
print("="*60)
