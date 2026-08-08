import os
import pickle
import torch
import torch.nn as nn
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import requests
from utils import generate_similarity_response
from query import INSERT_SIMILARITY
from db import conn, get_cursor
from sentence_transformers import SentenceTransformer

app = FastAPI(
    title="Heritage Site Similarity API",
    description="Returns similar world heritage sites using cosine similarity + clustering",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # can be modified to localhost:<port> later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Contrastive Projection Model Definition — must match train_clip_heritage.py
# proj_dim=256, Dropout=0.1 (tuned to prevent overfitting on 49-site dataset)
class ContrastiveProjection(nn.Module):
    def __init__(self, emb_dim=512, proj_dim=256):
        super().__init__()
        self.text_proj = nn.Sequential(
            nn.Linear(emb_dim, proj_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(proj_dim, proj_dim)
        )
        self.img_proj = nn.Sequential(
            nn.Linear(emb_dim, proj_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(proj_dim, proj_dim)
        )
        self.tex_proj = nn.Sequential(
            nn.Linear(emb_dim, proj_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(proj_dim, proj_dim)
        )

    def forward(self, text_embs, img_embs=None):
        t_proj = self.text_proj(text_embs)
        return t_proj

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")

clip_model = None
proj_model = None
clip_embeddings_data = None

def load_models():
    global clip_model, proj_model, clip_embeddings_data
    if clip_model is None:
        print("Loading CLIP-Heritage model...")
        clip_model = SentenceTransformer('clip-ViT-B-32')
    if proj_model is None:
        model_path = os.path.join(PICKLES_DIR, "clip_projection.pt")
        proj_model = ContrastiveProjection(emb_dim=512, proj_dim=256)
        if os.path.exists(model_path):
            proj_model.load_state_dict(torch.load(model_path, map_location="cpu"))
        proj_model.eval()
    if clip_embeddings_data is None:
        embeddings_path = os.path.join(PICKLES_DIR, "clip_embeddings.pkl")
        if os.path.exists(embeddings_path):
            with open(embeddings_path, "rb") as f:
                clip_embeddings_data = pickle.load(f)

class RequestData(BaseModel):
    site_name: str

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


class ImageSearchRequest(BaseModel):
    image_base64: str
    top_k: int = 5


def _site_image_url(site_name: str) -> str:
    clean_name = (
        site_name.replace("Schnbrunn", "Schönbrunn")
        .replace("Sch\u00f6nbrunn", "Schönbrunn")
        .lower()
        .strip()
    )
    clean_name = clean_name.replace("ö", "o")
    clean_name = (
        clean_name.replace("(", "")
        .replace(")", "")
        .replace("&", "and")
        .replace(",", "")
        .replace("  ", " ")
        .replace(" ", "-")
    )
    clean_name = clean_name.replace("'", "").replace("/", "-")
    while "--" in clean_name:
        clean_name = clean_name.replace("--", "-")
    return f"/sites/{clean_name}.jpg"


def _rank_against_embeddings(query_vec, emb_key: str, top_k: int):
    site_names = clip_embeddings_data["site_names"]
    bank = clip_embeddings_data.get(emb_key) or clip_embeddings_data["joint_embeddings"]
    # normalize
    q = query_vec / (np.linalg.norm(query_vec) + 1e-9)
    bank_n = bank / (np.linalg.norm(bank, axis=1, keepdims=True) + 1e-9)
    sims = bank_n @ q
    top_indices = np.argsort(sims)[::-1][:top_k]
    results = []
    for idx in top_indices:
        site_name = site_names[idx]
        results.append(
            {
                "name": site_name,
                "similarity": float(sims[idx]),
                "image_url": _site_image_url(site_name),
                "has_3d_asset": site_name
                in [
                    "Great Temple (Petra)",
                    "Blue Pillar Chapel",
                    "Temple of the Winged Lions",
                    "The Nabataean Theatre",
                ],
            }
        )
    return results

@app.post("/get-similarity")
def get_similarity(data: RequestData):
    result = generate_similarity_response(data.site_name)

    try:
        cursor = get_cursor()
        cursor.execute(
            INSERT_SIMILARITY,
            (
                result["site_name"],
                json.dumps(result["Top 5 Similar"]),
                json.dumps(result["Top 5 Similar (KMeans)"]),
                json.dumps(result["Top 5 Similar (AGNES)"]),
                json.dumps(result["Top 5 Similar (GMM)"])
            )
        )
        conn.commit()
    except Exception as e:
        print("Similarity DB insert error:", e)

    return result

@app.post("/api/multimodal-search")
def multimodal_search(data: SearchRequest):
    load_models()
    if clip_model is None or clip_embeddings_data is None:
        return {"error": "CLIP-Heritage embeddings or model weights not found. Please run the training script first."}
    
    query_text = data.query
    site_names = clip_embeddings_data["site_names"]
    
    # Process text query zero-shot
    with torch.no_grad():
        raw_q_emb = clip_model.encode(query_text)
        raw_q_tensor = torch.tensor(raw_q_emb, dtype=torch.float32).unsqueeze(0)
        proj_q_tensor = proj_model(raw_q_tensor)
        proj_q_tensor = nn.functional.normalize(proj_q_tensor, dim=-1)
        proj_q_emb = proj_q_tensor.squeeze(0).numpy()
        
    joint_embs = clip_embeddings_data["joint_embeddings"]
    
    # Compute cosine similarity
    sims = np.dot(joint_embs, proj_q_emb)
    
    # Sort
    top_indices = np.argsort(sims)[::-1][:data.top_k]
    
    results = []
    for idx in top_indices:
        site_name = site_names[idx]
        score = float(sims[idx])
        
        # Helper to convert site name to image path URL / relative path
        clean_name = site_name.replace("Schnbrunn", "Schönbrunn").replace("Sch\u00f6nbrunn", "Schönbrunn").lower().strip()
        clean_name = clean_name.replace("ö", "o")
        clean_name = clean_name.replace("(", "").replace(")", "").replace("&", "and").replace(",", "").replace("  ", " ").replace(" ", "-")
        clean_name = clean_name.replace("'", "").replace("/", "-")
        while "--" in clean_name:
            clean_name = clean_name.replace("--", "-")
        img_url = f"/sites/{clean_name}.jpg"
        
        # Check if it has 3D assets
        has_3d = site_name in ["Great Temple (Petra)", "Blue Pillar Chapel", "Temple of the Winged Lions", "The Nabataean Theatre"]
        
        results.append({
            "name": site_name,
            "similarity": score,
            "image_url": _site_image_url(site_name),
            "has_3d_asset": has_3d
        })
        
    return {"query": query_text, "results": results}


@app.post("/api/multimodal-search-image")
def multimodal_search_image(data: ImageSearchRequest):
    """Find heritage sites that look like an uploaded photo."""
    import base64
    import io

    load_models()
    if clip_model is None or clip_embeddings_data is None:
        return {"error": "Visual search model not ready", "results": []}
    try:
        from PIL import Image

        raw = data.image_base64
        if "," in raw:
            raw = raw.split(",", 1)[1]
        img = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")
        with torch.no_grad():
            # sentence-transformers CLIP encodes PIL images → 512-d
            emb = clip_model.encode([img])
            emb = np.asarray(emb[0], dtype=np.float32)
            bank_key = (
                "raw_image_embeddings"
                if "raw_image_embeddings" in clip_embeddings_data
                else "image_embeddings"
            )
            results = _rank_against_embeddings(emb, bank_key, data.top_k)
        return {"results": results, "mode": "image"}
    except Exception as e:
        return {"error": str(e), "results": []}

# Test function for multimodal search endpoint
def test_multimodal_search(sample_query="rock-cut cave architecture with pillars", top_k=5, output_path=os.path.join(PICKLES_DIR, "api_test_results.json")):
    try:
        response = requests.post(
            f"http://127.0.0.1:{os.getenv('PORT', '8177')}/api/multimodal-search",
            json={"query": sample_query, "top_k": top_k},
        )
        if response.status_code == 200:
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(response.json(), f, ensure_ascii=False, indent=2)
            print(f"API test results saved to {output_path}")
        else:
            print(f"API test failed with status {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Error during API test: {e}")

@app.get("/test-multimodal")
def test_endpoint():
    """Trigger the multimodal search test and return its saved results."""
    test_multimodal_search()
    try:
        with open(os.path.join(PICKLES_DIR, "api_test_results.json"), "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/")
def home():
    return {"message": "Heritage Similarity API Running"}


class RagRequest(BaseModel):
    query: str
    top_k: int = 5
    hybrid: bool = True
    alpha: float | None = None
    # hybrid | dense | sparse — overrides hybrid/alpha when set
    mode: str | None = None


@app.post("/api/rag-context")
def rag_context(data: RagRequest):
    """Dense / sparse / hybrid retrieval for the Local RAG chatbot."""
    try:
        from rag_index import retrieve

        mode = (data.mode or "").lower().strip()
        if mode == "dense" or (not data.hybrid and not mode):
            alpha = 1.0
            mode_out = "dense"
        elif mode == "sparse":
            alpha = 0.0
            mode_out = "sparse"
        else:
            alpha = data.alpha  # None → index default blend
            mode_out = "hybrid"

        results = retrieve(data.query, top_k=data.top_k, alpha=alpha)
        return {
            "query": data.query,
            "hybrid": mode_out == "hybrid",
            "mode": mode_out,
            "alpha": alpha,
            "contexts": results,
        }
    except Exception as e:
        return {"error": str(e), "contexts": []}


@app.get("/api/clusters/spatial-polygons")
def spatial_polygons():
    path = os.path.join(PICKLES_DIR, "spatial_polygons.json")
    if not os.path.exists(path):
        return {"error": "Run hdbscan_faiss.py first", "polygons": []}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/benchmarks")
def get_benchmarks():
    path = os.path.join(PICKLES_DIR, "benchmark_metrics.json")
    if not os.path.exists(path):
        pkl = os.path.join(PICKLES_DIR, "benchmark_metrics.pkl")
        if not os.path.exists(pkl):
            return {"error": "Run benchmark.py first"}
        with open(pkl, "rb") as f:
            raw = pickle.load(f)
        return raw
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    import uvicorn
    from dotenv import load_dotenv

    load_dotenv()
    port = int(os.getenv("PORT", "8177"))
    uvicorn.run(app, host="0.0.0.0", port=port)

