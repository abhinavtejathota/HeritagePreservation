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
    sims, site_names = _similarity_to_bank(query_vec, emb_key)
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


def _similarity_to_bank(query_vec, emb_key: str):
    site_names = clip_embeddings_data["site_names"]
    bank = clip_embeddings_data.get(emb_key)
    if bank is None:
        bank = clip_embeddings_data["joint_embeddings"]
    bank = np.asarray(bank, dtype=np.float32)
    query_vec = np.asarray(query_vec, dtype=np.float32).reshape(-1)
    q = query_vec / (np.linalg.norm(query_vec) + 1e-9)
    bank_n = bank / (np.linalg.norm(bank, axis=1, keepdims=True) + 1e-9)
    sims = bank_n @ q
    return sims, site_names


def _meta_overlap(a_row, b_row) -> float:
    """0..1 overlap on heritage fields (not bare continent)."""
    keys = [
        "Architecture Style",
        "Civilization",
        "Structure",
        "Material",
        "Era",
        "Country",
    ]
    weights = {
        "Architecture Style": 0.35,
        "Civilization": 0.25,
        "Structure": 0.2,
        "Material": 0.1,
        "Era": 0.05,
        "Country": 0.05,
    }
    score = 0.0
    for k in keys:
        va = str(a_row.get(k, "") or "").strip().lower()
        vb = str(b_row.get(k, "") or "").strip().lower()
        if not va or not vb or va == "nan" or vb == "nan":
            continue
        if va == vb:
            score += weights[k]
        elif va in vb or vb in va:
            score += weights[k] * 0.5
    return min(1.0, score)


def _heritage_rerank_photo(visual_sims: np.ndarray, site_names: list, top_k: int):
    """
    Precision-first photo match: keep a confident top hit even for different
    viewpoints of the same monument; only add neighbors that are both visually
    close and heritage-related.
    """
    from utils import similarity_matrix, site_names as util_names, df, get_top_similar

    order = np.argsort(visual_sims)[::-1]
    if len(order) == 0:
        return []

    name_to_util = {n: i for i, n in enumerate(util_names)}
    df_by_name = {str(r["Name"]).strip(): r for _, r in df.iterrows()}

    anchor_idx = int(order[0])
    anchor_name = site_names[anchor_idx]
    anchor_vis = float(visual_sims[anchor_idx])
    second_vis = float(visual_sims[int(order[1])]) if len(order) > 1 else 0.0
    margin = anchor_vis - second_vis
    anchor_util = name_to_util.get(anchor_name)
    anchor_row = df_by_name.get(anchor_name)

    # Tourist photos of the same site rarely score near 1.0 vs the archive JPG.
    # Accept a clear winner (~0.42+) or a moderate score with margin over #2.
    confident_top = anchor_vis >= 0.42 or (anchor_vis >= 0.36 and margin >= 0.035)
    if not confident_top:
        return []

    similar_names = set()
    try:
        for item in get_top_similar(anchor_name, top_k=8) or []:
            if item.get("name"):
                similar_names.add(str(item["name"]).strip())
    except Exception:
        pass

    vis_floor = max(0.40, anchor_vis - (0.06 if anchor_vis >= 0.55 else 0.04))

    picked = []
    for idx in order:
        idx = int(idx)
        name = site_names[idx]
        v = float(visual_sims[idx])

        h = 0.0
        u = name_to_util.get(name)
        if anchor_util is not None and u is not None:
            h = max(0.0, min(1.0, float(similarity_matrix[anchor_util, u])))

        meta = 0.0
        row = df_by_name.get(name)
        if anchor_row is not None and row is not None:
            meta = _meta_overlap(anchor_row, row)

        if len(picked) == 0:
            # Always keep the best hit when above absolute floor
            ok = True
        else:
            # Secondary: must look almost as close AND be heritage-related
            near_visual = v >= vis_floor
            heritage_ok = (
                name in similar_names
                or h >= 0.55
                or meta >= 0.45
            )
            ok = near_visual and heritage_ok

        if not ok:
            continue

        final = 0.55 * v + 0.30 * h + 0.15 * meta
        picked.append(
            {
                "name": name,
                "similarity": round(float(final), 4),
                "visual_similarity": round(v, 4),
                "heritage_similarity": round(float(h), 4),
                "image_url": _site_image_url(name),
                "has_3d_asset": name
                in [
                    "Great Temple (Petra)",
                    "Blue Pillar Chapel",
                    "Temple of the Winged Lions",
                    "The Nabataean Theatre",
                ],
            }
        )
        if len(picked) >= min(top_k, 5):
            break

    return picked


@app.post("/api/multimodal-search-image")
def multimodal_search_image(data: ImageSearchRequest):
    """Strict photo → site match (CLIP + hard heritage gates)."""
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
            raw_emb = np.asarray(clip_model.encode([img])[0], dtype=np.float32)
            raw_t = torch.tensor(raw_emb, dtype=torch.float32).unsqueeze(0)
            proj = proj_model.img_proj(raw_t)
            proj = nn.functional.normalize(proj, dim=-1).squeeze(0).numpy()

        sims_raw, names = _similarity_to_bank(raw_emb, "raw_image_embeddings")
        img_bank = (
            "image_embeddings"
            if "image_embeddings" in clip_embeddings_data
            else "joint_embeddings"
        )
        sims_proj, _ = _similarity_to_bank(proj, img_bank)

        # Lean harder on projected heritage image space for accuracy
        visual = 0.25 * sims_raw + 0.75 * sims_proj
        results = _heritage_rerank_photo(visual, names, data.top_k)
        return {
            "results": results,
            "mode": "image_strict",
            "note": (
                "Strict match: only high-confidence visual hits that also agree "
                "with archive similarity. Weak look-alikes are dropped."
                if results
                else "No strict match in the archive for that photo."
            ),
        }
    except Exception as e:
        return {"error": str(e), "results": []}


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
        has_3d = site_name in ["Great Temple (Petra)", "Blue Pillar Chapel", "Temple of the Winged Lions", "The Nabataean Theatre"]
        
        results.append({
            "name": site_name,
            "similarity": score,
            "image_url": _site_image_url(site_name),
            "has_3d_asset": has_3d
        })
        
    return {"query": query_text, "results": results}


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

