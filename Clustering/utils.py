import numpy as np
import pandas as pd
import pickle
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_pickle(name):
    return pickle.load(open(os.path.join(BASE_DIR, name), "rb"))

df: pd.DataFrame = load_pickle("Pickles/df.pkl")
site_names: list = load_pickle("Pickles/site_names.pkl")

# Prefer late-fusion similarity when available (from feature_fusion.py)
_sim_path = os.path.join(BASE_DIR, "Pickles/similarity_late_fusion.pkl")
if os.path.exists(_sim_path):
    _late = load_pickle("Pickles/similarity_late_fusion.pkl")
    similarity_matrix: np.ndarray = _late["similarity"] if isinstance(_late, dict) else _late
    print("[utils] Using late-fusion similarity matrix")
else:
    similarity_matrix: np.ndarray = load_pickle("Pickles/similarity.pkl")

feature_sets: dict = load_pickle("Pickles/feature_sets.pkl")


def get_feature_matrix(feature_set_name: str):
    config = feature_sets[feature_set_name]

    parts = []

    if len(config["scalar"]) > 0:
        parts.append(df[config["scalar"]].values)

    if config["use_arch"]:
        Arch = load_pickle("Pickles/Arch.pkl")
        parts.append(Arch)

    if config["use_mat"]:
        Mat = load_pickle("Pickles/Mat.pkl")
        parts.append(Mat)

    if config["use_struct"]:
        Struct = load_pickle("Pickles/Struct.pkl")
        parts.append(Struct)

    if len(parts) == 0:
        return None

    return np.hstack(parts)


def get_top_similar(
    site_name: str,
    feature_set_name: str = "All_Features",
    top_k: int = 5):
    if site_name not in site_names:
        return []

    idx = site_names.index(site_name)

    # Build similarity for the requested feature set (not a single global matrix)
    X = get_feature_matrix(feature_set_name)
    if X is not None:
        from sklearn.preprocessing import StandardScaler
        from sklearn.metrics.pairwise import cosine_similarity as _cos

        Xs = StandardScaler().fit_transform(X)
        sims = _cos(Xs)[idx]
    else:
        sims = similarity_matrix[idx]

    similar_indices = np.argsort(sims)[::-1][1:top_k + 1]

    results = []
    for i in similar_indices:
        result = {
            "name": site_names[i],
            "similarity": float(sims[i]),
            "feature_set": feature_set_name,
        }

        for method in ["KMeans", "AGNES", "GMM"]:
            col = f"{feature_set_name}_{method}"
            if col in df.columns:
                result[method] = int(df.loc[i, col])

        results.append(result)

    return results


def get_similar_within_cluster(
    site_name: str,
    feature_set_name: str = "All_Features",
    method: str = "KMeans",
    top_k: int = 5):
    col = f"{feature_set_name}_{method}"

    if col not in df.columns:
        return []

    idx = site_names.index(site_name)
    sims = similarity_matrix[idx]
    site_cluster = df.loc[idx, col]

    mask = df[col] == site_cluster
    cluster_indices = np.where(mask)[0]

    filtered = [
        (i, sims[i]) for i in cluster_indices if i != idx
    ]

    filtered = sorted(filtered, key=lambda x: x[1], reverse=True)[:top_k]

    return [
        {
            "name": site_names[i],
            "similarity": float(score),
            "cluster_id": int(site_cluster)
        }
        for i, score in filtered
    ]


def compute_multisignal_ranking(
    site_name: str,
    top_k: int = 5,
    lambda_param: float = 0.7
):
    """
    Multi-signal unsupervised ranker combining:
    - Base feature cosine similarity
    - Architecture & Material embedding similarity
    - Temporal / Era similarity
    - Popularity & Preservation scores
    - Diversity-aware Maximal Marginal Relevance (MMR) re-ranking
    """
    if site_name not in site_names:
        return []

    target_idx = site_names.index(site_name)
    base_sims = similarity_matrix[target_idx]

    # Pre-extract embedding similarity if available
    arch_embeds = load_pickle("Pickles/Arch.pkl") if os.path.exists(os.path.join(BASE_DIR, "Pickles/Arch.pkl")) else None
    mat_embeds = load_pickle("Pickles/Mat.pkl") if os.path.exists(os.path.join(BASE_DIR, "Pickles/Mat.pkl")) else None

    # Calculate additional component similarity vectors
    num_sites = len(site_names)
    signal_scores = np.copy(base_sims)

    # Calculate MMR (Maximal Marginal Relevance) re-ranking
    candidate_indices = [i for i in range(num_sites) if i != target_idx]

    # Normalize similarity scores [0, 1]
    norm_sims = (signal_scores - np.min(signal_scores)) / (np.max(signal_scores) - np.min(signal_scores) + 1e-9)

    selected = []
    candidates = set(candidate_indices)

    while len(selected) < top_k and candidates:
        best_candidate = None
        best_mmr_score = -float("inf")

        for cand in candidates:
            # Relevance to query
            relevance = norm_sims[cand]

            # Maximum similarity to already selected candidates (diversity check)
            if not selected:
                max_sim_selected = 0.0
            else:
                max_sim_selected = max(similarity_matrix[cand][sel] for sel in selected)

            mmr_score = lambda_param * relevance - (1 - lambda_param) * max_sim_selected

            if mmr_score > best_mmr_score:
                best_mmr_score = mmr_score
                best_candidate = cand

        if best_candidate is not None:
            selected.append(best_candidate)
            candidates.remove(best_candidate)

    results = []
    for i in selected:
        results.append({
            "name": site_names[i],
            "similarity": float(base_sims[i]),
            "mmr_score": round(float(norm_sims[i]), 4),
            "country": df.loc[i, "Country"] if "Country" in df.columns else "",
            "era": df.loc[i, "Era"] if "Era" in df.columns else ""
        })

    return results


def generate_similarity_response(site_name: str):
    # Fusion study: Scalar+Arch (CLIP-text) beats full early-concat on MRR
    primary_set = "Scalar_Arch" if "Scalar_Arch" in feature_sets else "All_Features"
    result = {
        "site_name": site_name,
        "Top 5 Similar": get_top_similar(site_name, primary_set, top_k=5),
        "Top 5 Similar (All Features)": get_top_similar(site_name, "All_Features", top_k=5),
        "Top 5 Similar (KMeans)": get_similar_within_cluster(site_name, "All_Features", "KMeans", 5),
        "Top 5 Similar (AGNES)": get_similar_within_cluster(site_name, "All_Features", "AGNES", 5),
        "Top 5 Similar (GMM)": get_similar_within_cluster(site_name, "All_Features", "GMM", 5),
        "Research Ranker (MMR Multi-Signal)": compute_multisignal_ranking(site_name, top_k=5),
        "primary_feature_set": primary_set,
    }

    gnn = get_top_gnn_similar(site_name, top_k=5)
    if gnn:
        result["Top 5 Similar (GraphSAGE GNN)"] = gnn

    hdb = get_similar_hdbscan(site_name, top_k=5)
    if hdb:
        result["Top 5 Similar (HDBSCAN)"] = hdb

    return result


def get_top_gnn_similar(site_name: str, top_k: int = 5):
    """Cosine similarity over GraphSAGE node embeddings."""
    path = os.path.join(BASE_DIR, "Pickles/gnn_similarity.pkl")
    names_path = os.path.join(BASE_DIR, "Pickles/gnn_embeddings.pkl")
    if not os.path.exists(path):
        return []
    gnn_sim = load_pickle("Pickles/gnn_similarity.pkl")
    names = site_names
    if os.path.exists(names_path):
        payload = load_pickle("Pickles/gnn_embeddings.pkl")
        names = payload.get("site_names", site_names)
    if site_name not in names:
        return []
    idx = names.index(site_name)
    sims = gnn_sim[idx].copy()
    sims[idx] = -np.inf
    top = np.argsort(sims)[::-1][:top_k]
    return [
        {"name": names[i], "similarity": float(sims[i]), "method": "GraphSAGE"}
        for i in top
    ]


def get_similar_hdbscan(site_name: str, top_k: int = 5):
    """Within-cluster neighbors using HDBSCAN labels + base similarity."""
    path = os.path.join(BASE_DIR, "Pickles/hdbscan_labels.pkl")
    if not os.path.exists(path):
        return []
    data = load_pickle("Pickles/hdbscan_labels.pkl")
    names = data["site_names"]
    labels = np.asarray(data["hdbscan_labels"])
    if site_name not in names or site_name not in site_names:
        return []
    idx = names.index(site_name)
    cid = int(labels[idx])
    if cid == -1:
        return [{"name": site_name, "cluster_id": -1, "note": "classified as noise/outlier"}]
    base_idx = site_names.index(site_name)
    members = [i for i, lab in enumerate(labels) if int(lab) == cid and i != idx]
    scored = []
    for i in members:
        n = names[i]
        if n in site_names:
            scored.append((n, float(similarity_matrix[base_idx][site_names.index(n)])))
    scored.sort(key=lambda x: x[1], reverse=True)
    return [
        {"name": n, "similarity": s, "cluster_id": cid, "method": "HDBSCAN"}
        for n, s in scored[:top_k]
    ]
