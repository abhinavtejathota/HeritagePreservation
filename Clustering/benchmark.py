import os
import pickle
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.metrics.pairwise import cosine_similarity

# Define directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE_DIR, "..", "Dataset", "heritage_sites_v2.csv")
PICKLES_DIR = os.path.join(BASE_DIR, "Pickles")

def load_pickle(name):
    return pickle.load(open(os.path.join(PICKLES_DIR, name), "rb"))

# Load dataset and pickles
df = load_pickle("df.pkl")
site_names = load_pickle("site_names.pkl")
feature_sets = load_pickle("feature_sets.pkl")

# Define Ground Truth Relevance based on heuristics from CSV attributes
def compute_ground_truth(df, site_names):
    num_sites = len(site_names)
    gt = np.zeros((num_sites, num_sites), dtype=int)
    
    for i in range(num_sites):
        row_i = df.iloc[i]
        civ_i = str(row_i.get("Civilization", "")).strip().lower()
        style_i = str(row_i.get("Architecture Style", "")).strip().lower()
        rel_i = str(row_i.get("Religion", "")).strip().lower()
        country_i = str(row_i.get("Country", "")).strip().lower()
        era_i = str(row_i.get("Era", "")).strip().lower()
        
        for j in range(num_sites):
            if i == j:
                continue
            row_j = df.iloc[j]
            civ_j = str(row_j.get("Civilization", "")).strip().lower()
            style_j = str(row_j.get("Architecture Style", "")).strip().lower()
            rel_j = str(row_j.get("Religion", "")).strip().lower()
            country_j = str(row_j.get("Country", "")).strip().lower()
            era_j = str(row_j.get("Era", "")).strip().lower()
            
            # Match heuristics
            match = False
            # 1. Same civilization
            if civ_i == civ_j and civ_i not in ["", "nan", "unknown"]:
                match = True
            # 2. Same exact architecture style
            elif style_i == style_j and style_i not in ["", "nan"]:
                match = True
            # 3. Same religion in same country
            elif rel_i == rel_j and country_i == country_j and rel_i not in ["", "nan"]:
                match = True
            # 4. Rock-cut architectural style matches
            elif "rock-cut" in style_i and "rock-cut" in style_j:
                match = True
            # 5. Nabataean connection
            elif "nabataean" in civ_i and "nabataean" in civ_j:
                match = True
            # 6. Roman architectural or civilization connection
            elif ("roman" in civ_i or "roman" in style_i) and ("roman" in civ_j or "roman" in style_j):
                match = True
                
            if match:
                gt[i, j] = 1
                
    return gt

print("Computing Ground Truth relevance matrix...")
gt_matrix = compute_ground_truth(df, site_names)
print(f"Total relevant pairs in Ground Truth: {np.sum(gt_matrix)}")

# Evaluate a similarity matrix
def evaluate_similarity(sim_matrix, gt_matrix, top_k=5):
    num_sites = sim_matrix.shape[0]
    mrr_list = []
    precision_list = []
    
    # Cosine similarities for margin calculation
    rel_similarities = []
    irrel_similarities = []
    
    for i in range(num_sites):
        sims = sim_matrix[i].copy()
        sims[i] = -np.inf # Exclude self
        
        # Sort recommendations
        ranked_indices = np.argsort(sims)[::-1]
        top_indices = ranked_indices[:top_k]
        
        # MRR@K
        mrr = 0.0
        for rank_idx, idx in enumerate(top_indices):
            if gt_matrix[i, idx] == 1:
                mrr = 1.0 / (rank_idx + 1)
                break
        mrr_list.append(mrr)
        
        # Precision@K
        precision = np.sum(gt_matrix[i, top_indices]) / top_k
        precision_list.append(precision)
        
        # Collect values for margin
        for j in range(num_sites):
            if i == j:
                continue
            val = sim_matrix[i, j]
            if gt_matrix[i, j] == 1:
                rel_similarities.append(val)
            else:
                irrel_similarities.append(val)
                
    avg_rel = np.mean(rel_similarities) if rel_similarities else 0.0
    avg_irrel = np.mean(irrel_similarities) if irrel_similarities else 0.0
    margin = avg_rel - avg_irrel
    
    return {
        "MRR@5": np.mean(mrr_list),
        "Precision@5": np.mean(precision_list),
        "Avg_Rel_Sim": avg_rel,
        "Avg_Irrel_Sim": avg_irrel,
        "Margin": margin
    }

# 1. Iteration 1: Only Scalar Features
def get_scalar_sim():
    scalars = ['Area(m2)', 'YearNum', 'PopularityNum', 'PreservationNum']
    X = df[scalars].values
    X_scaled = StandardScaler().fit_transform(X)
    return cosine_similarity(X_scaled)

# 2. Iteration 2: Scalar + Arch
def get_scalar_arch_sim():
    scalars = ['Area(m2)', 'YearNum', 'PopularityNum', 'PreservationNum']
    Arch = load_pickle("Arch.pkl")
    X = np.hstack([df[scalars].values, Arch])
    X_scaled = StandardScaler().fit_transform(X)
    return cosine_similarity(X_scaled)

# 3. Iteration 3: Scalar + Arch + Mat
def get_scalar_arch_mat_sim():
    scalars = ['Area(m2)', 'YearNum', 'PopularityNum', 'PreservationNum']
    Arch = load_pickle("Arch.pkl")
    Mat = load_pickle("Mat.pkl")
    X = np.hstack([df[scalars].values, Arch, Mat])
    X_scaled = StandardScaler().fit_transform(X)
    return cosine_similarity(X_scaled)

# 4. Iteration 4: All Features (Scalar + Arch + Mat + Struct)
def get_all_features_sim():
    scalars = ['Area(m2)', 'YearNum', 'PopularityNum', 'PreservationNum']
    Arch = load_pickle("Arch.pkl")
    Mat = load_pickle("Mat.pkl")
    Struct = load_pickle("Struct.pkl")
    X = np.hstack([df[scalars].values, Arch, Mat, Struct])
    X_scaled = StandardScaler().fit_transform(X)
    return cosine_similarity(X_scaled)

# 5. Iterations 5 & 6: CLIP Embeddings (Pretrained and Fine-tuned)
def evaluate_clip(clip_pickle_path):
    if not os.path.exists(clip_pickle_path):
        return None, None
        
    with open(clip_pickle_path, "rb") as f:
        clip_data = pickle.load(f)
        
    raw_text = clip_data["raw_text_embeddings"]
    raw_image = clip_data["raw_image_embeddings"]
    proj_text = clip_data["text_embeddings"]
    proj_image = clip_data["image_embeddings"]
    joint_embeddings = clip_data["joint_embeddings"]
    
    # Pretrained similarities
    # We define raw joint embeddings as the average of normalized raw text and image embeddings
    raw_text_norm = raw_text / np.linalg.norm(raw_text, axis=-1, keepdims=True)
    raw_img_norm = raw_image / np.linalg.norm(raw_image, axis=-1, keepdims=True)
    raw_joint = (raw_text_norm + raw_img_norm) / 2.0
    raw_joint = raw_joint / np.linalg.norm(raw_joint, axis=-1, keepdims=True)
    pretrained_sim = cosine_similarity(raw_joint)
    
    # Fine-tuned similarities
    finetuned_sim = cosine_similarity(joint_embeddings)
    
    # Evaluate Zero-Shot Retrieval (Cross-Modal: Text Query -> Image Retrieval)
    # Ground truth is index i in text matches index i in image
    def evaluate_retrieval(text_embs, image_embs):
        sim_matrix = cosine_similarity(text_embs, image_embs)
        num_sites = sim_matrix.shape[0]
        mrr_ret = []
        p5_ret = []
        for i in range(num_sites):
            sims = sim_matrix[i]
            ranked = np.argsort(sims)[::-1]
            rank = np.where(ranked == i)[0][0] + 1
            mrr_ret.append(1.0 / rank)
            p5_ret.append(1.0 if rank <= 5 else 0.0)
        return np.mean(mrr_ret), np.mean(p5_ret)
        
    mrr_raw, p5_raw = evaluate_retrieval(raw_text_norm, raw_img_norm)
    mrr_proj, p5_proj = evaluate_retrieval(proj_text, proj_image)
    
    print("\n--- Cross-Modal Text-to-Image Retrieval Analysis ---")
    print(f"Pretrained CLIP Retrieval MRR: {mrr_raw:.4f} | Precision@5: {p5_raw:.4f}")
    print(f"Fine-Tuned CLIP Retrieval MRR: {mrr_proj:.4f} | Precision@5: {p5_proj:.4f}")
    print(f"Relative MRR Gain: {((mrr_proj - mrr_raw) / mrr_raw * 100):+.2f}%")
    
    return pretrained_sim, finetuned_sim

# Run all evaluations
results = {}

print("Running Iteration 1: Only Scalar Features...")
results["1. Only Scalar Features"] = evaluate_similarity(get_scalar_sim(), gt_matrix)

print("Running Iteration 2: Scalar + Arch Embeddings...")
results["2. Scalar + Arch (CLIP-text)"] = evaluate_similarity(get_scalar_arch_sim(), gt_matrix)

print("Running Iteration 3: Scalar + Arch + Material...")
results["3. Scalar + Arch + Mat (CLIP-text)"] = evaluate_similarity(get_scalar_arch_mat_sim(), gt_matrix)

print("Running Iteration 4: All Features (CLIP-text Arch/Mat/Struct + Scalars)...")
results["4. All Features (CLIP-text + Scalars)"] = evaluate_similarity(get_all_features_sim(), gt_matrix)

# CLIP
clip_path = os.path.join(PICKLES_DIR, "clip_embeddings.pkl")
pretrained_sim, finetuned_sim = evaluate_clip(clip_path)

if pretrained_sim is not None:
    print("Running Iteration 5: CLIP-Heritage Pretrained Joint Embeddings...")
    results["5. CLIP-Heritage (Pretrained Joint)"] = evaluate_similarity(pretrained_sim, gt_matrix)
    print("Running Iteration 6: CLIP-Heritage Fine-Tuned Joint Embeddings...")
    results["6. CLIP-Heritage (Fine-tuned Joint)"] = evaluate_similarity(finetuned_sim, gt_matrix)
else:
    print("\nWarning: clip_embeddings.pkl not found. Skipping CLIP metrics.")

# 7. GraphSAGE / GNN embeddings
gnn_sim_path = os.path.join(PICKLES_DIR, "gnn_similarity.pkl")
if os.path.exists(gnn_sim_path):
    print("Running Iteration 7: GraphSAGE GNN Embeddings...")
    gnn_sim = load_pickle("gnn_similarity.pkl")
    # Align size if needed
    if gnn_sim.shape[0] == gt_matrix.shape[0]:
        results["7. GraphSAGE GNN"] = evaluate_similarity(gnn_sim, gt_matrix)
    else:
        print(f"  Skipping GNN: shape mismatch {gnn_sim.shape} vs {gt_matrix.shape}")
else:
    print("Warning: gnn_similarity.pkl not found. Run train_gnn.py first.")

# Clustering quality + index latency from HDBSCAN pipeline
cluster_metrics = {}
hdb_path = os.path.join(PICKLES_DIR, "hdbscan_labels.pkl")
if os.path.exists(hdb_path):
    hdb_data = load_pickle("hdbscan_labels.pkl")
    cluster_metrics = hdb_data.get("metrics", {})
    print("\n--- Clustering / Index Metrics (HDBSCAN vs KMeans) ---")
    for k, v in cluster_metrics.items():
        print(f"  {k}: {v}")
else:
    print("Warning: hdbscan_labels.pkl not found. Run hdbscan_faiss.py first.")

# Print comparative report
print("\n" + "="*80)
print("             HISTORICAL TRAJECTORY OF SIMILARITY CALCULATION METRICS")
print("="*80)
print(f"{'Iteration Method':<40} | {'MRR@5':<8} | {'Precision@5':<12} | {'Similarity Margin':<17}")
print("-"*80)
for method, metrics in sorted(results.items()):
    print(f"{method:<40} | {metrics['MRR@5']:.4f}   | {metrics['Precision@5']:.4f}      | {metrics['Margin']:.4f}")
print("="*80)

# Save metrics report (include clustering block)
metrics_payload = {"similarity_iterations": results, "clustering_index": cluster_metrics}
metrics_output_path = os.path.join(PICKLES_DIR, "benchmark_metrics.pkl")
with open(metrics_output_path, "wb") as f:
    pickle.dump(metrics_payload, f)

# Also write a human-readable JSON for the paper / docs
import json
json_path = os.path.join(PICKLES_DIR, "benchmark_metrics.json")

def _to_float(obj):
    if isinstance(obj, dict):
        return {k: _to_float(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_float(v) for v in obj]
    try:
        return float(obj)
    except Exception:
        return obj

with open(json_path, "w", encoding="utf-8") as f:
    json.dump(_to_float(metrics_payload), f, indent=2)
print(f"Metrics results saved to {metrics_output_path}")
print(f"JSON report saved to {json_path}")
