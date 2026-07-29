import numpy as np
import pandas as pd
import pickle
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_pickle(name):
    return pickle.load(open(os.path.join(BASE_DIR, name), "rb"))

df: pd.DataFrame = load_pickle("Pickles/df.pkl")
site_names: list = load_pickle("Pickles/site_names.pkl")
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
    sims = similarity_matrix[idx]

    similar_indices = np.argsort(sims)[::-1][1:top_k + 1]

    results = []
    for i in similar_indices:
        result = {
            "name": site_names[i],
            "similarity": float(sims[i])
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


def generate_similarity_response(site_name: str):
    result = {
        "site_name": site_name,
        "Top 5 Similar": get_top_similar(site_name, "All_Features", top_k=5),
        "Top 5 Similar (KMeans)": get_similar_within_cluster(site_name, "All_Features", "KMeans", 5),
        "Top 5 Similar (AGNES)": get_similar_within_cluster(site_name, "All_Features", "AGNES", 5),
        "Top 5 Similar (GMM)": get_similar_within_cluster(site_name, "All_Features", "GMM", 5)
    }

    return result
