"""
Hybrid RAG index for heritage sites.

Builds:
  - Dense embeddings (MiniLM) over multi-aspect dossiers
  - Sparse TF-IDF over the same corpus
  - Hybrid score: alpha * dense_cos + (1-alpha) * tfidf_cos

Multi-chunk per site (overview / architecture / culture) improves recall
for diverse user questions.

Outputs: Pickles/rag_index.pkl
"""

from __future__ import annotations

import os
import pickle
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")
DATASET_PATH = os.path.join(BASE_DIR, "..", "Dataset", "heritage_sites_v2.csv")

DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_ALPHA = 0.65  # dense weight in hybrid


def _load_descriptions() -> dict[str, str]:
    """Optional descriptions from Postgres."""
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
            connect_timeout=8,
        )
        cur = conn.cursor()
        cur.execute(
            "SELECT name, description, latitude, longitude, era_category "
            "FROM heritage_sites"
        )
        rows = cur.fetchall()
        conn.close()
        return {
            r[0]: {
                "description": r[1] or "",
                "latitude": r[2],
                "longitude": r[3],
                "era_category": r[4] or "",
            }
            for r in rows
        }
    except Exception as e:
        print(f"[rag] DB enrich skipped: {e}")
        return {}


def build_chunks(row: pd.Series, extra: Optional[dict] = None) -> list[dict]:
    name = str(row.get("Name", ""))
    extra = extra or {}
    desc = extra.get("description") or ""
    overview = (
        f"{name} is a heritage site in {row.get('Country', '')}, {row.get('Continent', '')}. "
        f"Era: {row.get('Era', '')}. Civilization: {row.get('Civilization', '')}. "
        f"Religion: {row.get('Religion', '')}. "
        f"Preservation: {row.get('Preservation', '')}. Popularity: {row.get('Popularity', '')}."
    )
    if desc:
        overview += f" Description: {desc}"
    if extra.get("latitude") is not None:
        overview += f" Coordinates: ({extra.get('latitude')}, {extra.get('longitude')})."
    if extra.get("era_category"):
        overview += f" Era category: {extra.get('era_category')}."

    architecture = (
        f"{name} architecture: style={row.get('Architecture Style', '')}, "
        f"material={row.get('Material', '')}, structure={row.get('Structure', '')}, "
        f"area_m2={row.get('Area(m2)', '')}."
    )
    culture = (
        f"{name} cultural context: civilization={row.get('Civilization', '')}, "
        f"religion={row.get('Religion', '')}, country={row.get('Country', '')}, "
        f"era={row.get('Era', '')}."
    )
    return [
        {"site": name, "aspect": "overview", "document": overview},
        {"site": name, "aspect": "architecture", "document": architecture},
        {"site": name, "aspect": "culture", "document": culture},
    ]


def build_index(model_name: str = DEFAULT_MODEL):
    print("Building hybrid multi-chunk RAG index...")
    df = pd.read_csv(DATASET_PATH)
    extras = _load_descriptions()

    chunks: list[dict] = []
    for _, row in df.iterrows():
        chunks.extend(build_chunks(row, extras.get(str(row["Name"]), {})))

    docs = [c["document"] for c in chunks]
    print(f"  {len(df)} sites -> {len(chunks)} chunks")

    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(model_name)
    dense = model.encode(docs, show_progress_bar=True)
    dense = dense / (np.linalg.norm(dense, axis=1, keepdims=True) + 1e-9)

    tfidf = TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=8000)
    sparse = tfidf.fit_transform(docs)

    out = {
        "version": 2,
        "model_name": model_name,
        "alpha": DEFAULT_ALPHA,
        "chunks": chunks,
        "documents": docs,
        "embeddings": dense.astype(np.float32),
        "tfidf_vectorizer": tfidf,
        "tfidf_matrix": sparse,
        "site_names": df["Name"].tolist(),
    }
    path = os.path.join(PICKLES_DIR, "rag_index.pkl")
    with open(path, "wb") as f:
        pickle.dump(out, f)
    print(f"Saved hybrid RAG index -> {path}")
    return out


def load_index():
    path = os.path.join(PICKLES_DIR, "rag_index.pkl")
    if not os.path.exists(path):
        return build_index()
    with open(path, "rb") as f:
        return pickle.load(f)


_query_model = None


def retrieve(query: str, top_k: int = 5, alpha: Optional[float] = None) -> list[dict]:
    """Hybrid dense + TF-IDF retrieval; returns top_k chunks (may include multiple per site).

    alpha=1.0 → dense only; alpha=0.0 → sparse only; otherwise hybrid blend.
    """
    global _query_model
    index = load_index()
    if alpha is None:
        alpha = float(index.get("alpha", DEFAULT_ALPHA))
    else:
        alpha = float(alpha)

    if _query_model is None:
        from sentence_transformers import SentenceTransformer

        _query_model = SentenceTransformer(index.get("model_name", DEFAULT_MODEL))

    q_dense = _query_model.encode([query])
    q_dense = q_dense / (np.linalg.norm(q_dense, axis=1, keepdims=True) + 1e-9)
    dense_sims = cosine_similarity(q_dense, index["embeddings"])[0]
    sparse_sims = np.zeros_like(dense_sims)

    if "tfidf_matrix" in index and "tfidf_vectorizer" in index:
        try:
            q_sparse = index["tfidf_vectorizer"].transform([query])
            sparse_sims = cosine_similarity(q_sparse, index["tfidf_matrix"])[0]
        except Exception:
            sparse_sims = np.zeros_like(dense_sims)

    sims = alpha * dense_sims + (1.0 - alpha) * sparse_sims

    ranked = np.argsort(sims)[::-1]
    results = []
    seen_sites: set[str] = set()
    chunks = index.get("chunks") or [
        {"site": index["site_names"][i], "aspect": "overview", "document": index["documents"][i]}
        for i in range(len(index["documents"]))
    ]

    for i in ranked:
        chunk = chunks[i] if i < len(chunks) else {
            "site": "?",
            "aspect": "?",
            "document": index["documents"][i],
        }
        site = chunk.get("site", "?")
        site_count = sum(1 for r in results if r["name"] == site)
        if site_count >= 2 and len(seen_sites) < top_k:
            continue
        if len(results) >= top_k and site in seen_sites:
            continue
        results.append(
            {
                "name": site,
                "aspect": chunk.get("aspect", "overview"),
                "score": float(sims[i]),
                "dense_score": float(dense_sims[i]),
                "sparse_score": float(sparse_sims[i]),
                "document": chunk.get("document", index["documents"][i]),
            }
        )
        seen_sites.add(site)
        if len(results) >= top_k:
            break

    return results


def retrieve_by_site(site_name: str) -> list[dict]:
    index = load_index()
    chunks = index.get("chunks") or []
    return [
        {
            "name": c["site"],
            "aspect": c.get("aspect", "overview"),
            "score": 1.0,
            "document": c["document"],
        }
        for c in chunks
        if c["site"].lower() == site_name.lower()
    ]


def faithfulness_proxy(answer: str, contexts: list[str]) -> float:
    if not answer or not contexts:
        return 0.0
    ctx = " ".join(contexts).lower()
    tokens = [t for t in answer.lower().split() if len(t) > 3]
    if not tokens:
        return 0.0
    return sum(1 for t in tokens if t in ctx) / len(tokens)


if __name__ == "__main__":
    build_index()
    for r in retrieve("rock-cut Buddhist caves in India", top_k=5):
        print(f"  {r['score']:.3f} [{r['aspect']}] {r['name']}")
