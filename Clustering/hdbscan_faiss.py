"""
Phase 2 Option 3: HDBSCAN density clustering + FAISS/HNSW-style vector index.

Uses sklearn.cluster.HDBSCAN (no extra package required).
Uses faiss if installed; otherwise falls back to a NumPy brute-force index
with the same API so latency can still be benchmarked honestly.

Outputs:
  Pickles/hdbscan_labels.pkl
  Pickles/faiss_index.pkl   (metadata + vectors; optional faiss binary)
  Pickles/spatial_polygons.json
"""

from __future__ import annotations

import json
import os
import pickle
import time
from typing import Any

import numpy as np
import pandas as pd
from scipy.spatial import ConvexHull
from sklearn.cluster import HDBSCAN, KMeans
from sklearn.metrics import (
    adjusted_rand_score,
    davies_bouldin_score,
    silhouette_score,
)
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")
DATASET_PATH = os.path.join(BASE_DIR, "..", "Dataset", "heritage_sites_v2.csv")


def load_pickle(name: str):
    with open(os.path.join(PICKLES_DIR, name), "rb") as f:
        return pickle.load(f)


def build_feature_matrix() -> tuple[np.ndarray, list[str], pd.DataFrame]:
    df = load_pickle("df.pkl")
    site_names = load_pickle("site_names.pkl")
    Arch = load_pickle("Arch.pkl")
    Mat = load_pickle("Mat.pkl")
    Struct = load_pickle("Struct.pkl")
    scalars = ["Area(m2)", "YearNum", "PopularityNum", "PreservationNum"]
    X = np.hstack([df[scalars].values, Arch, Mat, Struct])
    X = StandardScaler().fit_transform(X)
    return X.astype(np.float32), site_names, df


class BruteForceIndex:
    """Drop-in stand-in when faiss is unavailable."""

    def __init__(self, vectors: np.ndarray):
        self.vectors = vectors.astype(np.float32)
        # L2-normalize for cosine via inner product
        norms = np.linalg.norm(self.vectors, axis=1, keepdims=True) + 1e-9
        self.vectors = self.vectors / norms
        self.nn = NearestNeighbors(metric="cosine", algorithm="brute")
        self.nn.fit(self.vectors)

    def search(self, query: np.ndarray, k: int = 5):
        q = query.astype(np.float32)
        if q.ndim == 1:
            q = q.reshape(1, -1)
        q = q / (np.linalg.norm(q, axis=1, keepdims=True) + 1e-9)
        dists, idxs = self.nn.kneighbors(q, n_neighbors=k)
        # convert cosine distance -> similarity-like scores
        sims = 1.0 - dists
        return sims, idxs


def try_build_faiss(vectors: np.ndarray):
    try:
        import faiss  # type: ignore

        dim = vectors.shape[1]
        xb = vectors.copy().astype(np.float32)
        faiss.normalize_L2(xb)
        index = faiss.IndexHNSWFlat(dim, 16)
        index.hnsw.efConstruction = 40
        index.add(xb)
        return index, "faiss.IndexHNSWFlat"
    except Exception:
        return BruteForceIndex(vectors), "numpy.NearestNeighbors(brute)"


def compute_spatial_polygons(df: pd.DataFrame, labels: np.ndarray, site_names: list[str]) -> list[dict]:
    """Convex hulls per HDBSCAN cluster using lat/lon when available."""
    csv = pd.read_csv(DATASET_PATH)
    # Prefer DB-aligned coords from df if present
    lat_col = lon_col = None
    for a, b in [("latitude", "longitude"), ("Latitude", "Longitude"), ("lat", "lng")]:
        if a in df.columns and b in df.columns:
            lat_col, lon_col = a, b
            break
    if lat_col is None:
        # merge from CSV by name
        name_key = "Name" if "Name" in csv.columns else csv.columns[0]
        coord_map = {}
        # CSV may not have lat/lon — try pickle / skip
        if "latitude" in csv.columns:
            for _, row in csv.iterrows():
                coord_map[row[name_key]] = (row["latitude"], row["longitude"])
        polygons = []
        return polygons

    polygons = []
    unique = sorted(set(labels.tolist()))
    for cid in unique:
        if cid == -1:
            continue
        idxs = np.where(labels == cid)[0]
        pts = []
        members = []
        for i in idxs:
            lat = df.iloc[i][lat_col]
            lon = df.iloc[i][lon_col]
            if pd.isna(lat) or pd.isna(lon):
                continue
            pts.append([float(lon), float(lat)])  # GeoJSON order: lon, lat
            members.append(site_names[i])
        if len(pts) < 3:
            # degenerate: return points only
            polygons.append(
                {
                    "cluster_id": int(cid),
                    "type": "MultiPoint",
                    "coordinates": pts,
                    "members": members,
                }
            )
            continue
        try:
            hull = ConvexHull(np.array(pts))
            ring = [pts[v] for v in hull.vertices]
            ring.append(ring[0])
            polygons.append(
                {
                    "cluster_id": int(cid),
                    "type": "Polygon",
                    "coordinates": [ring],
                    "members": members,
                }
            )
        except Exception:
            polygons.append(
                {
                    "cluster_id": int(cid),
                    "type": "MultiPoint",
                    "coordinates": pts,
                    "members": members,
                }
            )
    return polygons


def main():
    print("=" * 60)
    print("  Phase 2 Option 3: HDBSCAN + Vector Index")
    print("=" * 60)

    X, site_names, df = build_feature_matrix()
    n = X.shape[0]
    print(f"Feature matrix: {X.shape}")

    # --- Baselines: KMeans ---
    kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
    km_labels = kmeans.fit_predict(X)

    # --- HDBSCAN (tune min_cluster_size for small n=49) ---
    hdb = HDBSCAN(min_cluster_size=2, min_samples=1, metric="euclidean")
    hdb_labels = hdb.fit_predict(X)
    n_clusters = len(set(hdb_labels.tolist()) - {-1})
    n_noise = int(np.sum(hdb_labels == -1))
    print(f"HDBSCAN clusters: {n_clusters} | noise points: {n_noise}")

    # Clustering quality (ignore noise for silhouette/DBI when possible)
    metrics: dict[str, Any] = {
        "n_sites": n,
        "hdbscan_n_clusters": n_clusters,
        "hdbscan_n_noise": n_noise,
        "kmeans_k": 5,
    }

    # Pseudo ground-truth: civilization labels for ARI (honest external criterion)
    if "Civilization" in df.columns:
        civ = df["Civilization"].astype(str).fillna("Unknown")
        civ_codes = pd.factorize(civ)[0]
        metrics["ARI_HDBSCAN_vs_Civilization"] = float(adjusted_rand_score(civ_codes, hdb_labels))
        metrics["ARI_KMeans_vs_Civilization"] = float(adjusted_rand_score(civ_codes, km_labels))

    # Silhouette / DBI on non-noise subset for HDBSCAN
    mask = hdb_labels != -1
    if mask.sum() > n_clusters >= 2:
        metrics["silhouette_HDBSCAN"] = float(silhouette_score(X[mask], hdb_labels[mask]))
        metrics["davies_bouldin_HDBSCAN"] = float(davies_bouldin_score(X[mask], hdb_labels[mask]))
    metrics["silhouette_KMeans"] = float(silhouette_score(X, km_labels))
    metrics["davies_bouldin_KMeans"] = float(davies_bouldin_score(X, km_labels))

    # --- Vector index + latency ---
    index, backend = try_build_faiss(X)
    metrics["index_backend"] = backend

    # Query latency: average over all sites as queries, top-5
    latencies = []
    for i in range(n):
        q = X[i : i + 1]
        t0 = time.perf_counter()
        if hasattr(index, "search") and backend.startswith("faiss"):
            import faiss  # type: ignore

            qq = q.copy()
            faiss.normalize_L2(qq)
            index.search(qq, 5)
        else:
            index.search(q, 5)
        latencies.append((time.perf_counter() - t0) * 1000.0)

    # Brute-force matrix multiply baseline latency
    brute_lat = []
    Xn = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
    for i in range(n):
        t0 = time.perf_counter()
        sims = Xn @ Xn[i]
        np.argsort(sims)[::-1][:5]
        brute_lat.append((time.perf_counter() - t0) * 1000.0)

    metrics["query_latency_ms_mean"] = float(np.mean(latencies))
    metrics["query_latency_ms_p95"] = float(np.percentile(latencies, 95))
    metrics["brute_latency_ms_mean"] = float(np.mean(brute_lat))
    if metrics["brute_latency_ms_mean"] > 0:
        metrics["speedup_vs_brute"] = float(
            metrics["brute_latency_ms_mean"] / max(metrics["query_latency_ms_mean"], 1e-9)
        )

    print("\nClustering / Index metrics:")
    for k, v in metrics.items():
        print(f"  {k}: {v}")

    # Save labels
    label_out = {
        "site_names": site_names,
        "hdbscan_labels": hdb_labels,
        "kmeans_labels": km_labels,
        "metrics": metrics,
    }
    with open(os.path.join(PICKLES_DIR, "hdbscan_labels.pkl"), "wb") as f:
        pickle.dump(label_out, f)

    # Save index vectors + backend name (faiss object may not pickle portably — store vectors)
    index_out = {
        "site_names": site_names,
        "vectors": X,
        "backend": backend,
        "metrics": metrics,
    }
    with open(os.path.join(PICKLES_DIR, "faiss_index.pkl"), "wb") as f:
        pickle.dump(index_out, f)

    # Spatial polygons — need lat/lon. Try loading from CSV merge with DB-style names.
    # Attach coords from heritage CSV if present; else from a thin SQL-less join file.
    df_coords = df.copy()
    if "latitude" not in df_coords.columns:
        # Attempt to read from Application env via optional coords in Dataset
        try:
            from dotenv import load_dotenv
            import psycopg2

            load_dotenv(os.path.join(BASE_DIR, "..", "Application", "backend", "server", ".env"))
            conn = psycopg2.connect(
                host=os.getenv("DB_HOST"),
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASS"),
                dbname=os.getenv("DB_NAME"),
                port=os.getenv("DB_PORT"),
                connect_timeout=10,
            )
            cur = conn.cursor()
            cur.execute("SELECT name, latitude, longitude FROM heritage_sites")
            rows = cur.fetchall()
            conn.close()
            cmap = {r[0]: (r[1], r[2]) for r in rows}
            df_coords["latitude"] = [cmap.get(n, (None, None))[0] for n in site_names]
            df_coords["longitude"] = [cmap.get(n, (None, None))[1] for n in site_names]
            print(f"Loaded coordinates from DB for {sum(v is not None for v in df_coords['latitude'])} sites")
        except Exception as e:
            print(f"Could not load coordinates from DB: {e}")

    polygons = compute_spatial_polygons(df_coords, hdb_labels, site_names)
    poly_path = os.path.join(PICKLES_DIR, "spatial_polygons.json")
    with open(poly_path, "w", encoding="utf-8") as f:
        json.dump({"polygons": polygons, "noise_cluster_id": -1}, f, indent=2)
    print(f"Saved {len(polygons)} spatial polygons -> {poly_path}")

    print("\nOK HDBSCAN + index artifacts saved.")
    return metrics


if __name__ == "__main__":
    main()
