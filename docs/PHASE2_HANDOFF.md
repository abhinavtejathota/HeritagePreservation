# PHASE 2 Handoff — Full Research Stack

> Updated: 2026-08-08

## What exists now

| Component | Entry point | Key outputs |
|-----------|-------------|-------------|
| CLIP-Heritage | `Clustering/train_clip_heritage.py` | `clip_embeddings.pkl`, `clip_projection.pt` |
| GraphSAGE | `Clustering/train_gnn.py` | `gnn_embeddings.pkl`, `gnn_similarity.pkl` |
| HDBSCAN+FAISS | `Clustering/hdbscan_faiss.py` | `hdbscan_labels.pkl`, `faiss_index.pkl`, `spatial_polygons.json` |
| RAG index | `Clustering/rag_index.py` | `rag_index.pkl` |
| Benchmarks | `Clustering/benchmark.py` | `benchmark_metrics.pkl` + `.json` |
| Vectorizer / fusion | `compare_vectorizers.py`, `feature_fusion.py` | comparison JSONs |
| Clustering API | `python Clustering/app.py` | `:8177` |
| **Local RAG** | `python Chatbot/Local-RAG/app.py` | `:8176` (GGUF GPU defaults) |
| App UI+API | Express serves `frontend/build` | `:8175` |
| Start all | `python scripts/start_all.py` | all services |
| Clone setup | `SETUP.md` | deps, env, GPU, run |

## Similarity leaderboard (n=49)

| Method | MRR@5 | Notes |
|--------|-------|--------|
| GraphSAGE GNN | **~0.55** | Best site-to-site (narrow) |
| CLIP Pretrained joint | ~0.55 | Strong baseline |
| Scalar+Arch (CLIP-text) | ~0.54 | Best tabular fusion path |
| CLIP Fine-tuned joint | lower site-to-site | **Cross-modal MRR 1.0** |

See `TODO.md` for full honest tables (LORO, fusion, scale latency, RAG QA).

## Local LLM (research note)

Primary chat is **offline GGUF** (Qwen2.5-1.5B Q4, 33 layers on 4GB). Paper value: reproducible grounded RAG + faithfulness proxies — not SOTA LLM size. Defaults in `Chatbot/Local-RAG/` — no shell env required.

## One-command run

```powershell
.\scripts\start-all.ps1
# or
python scripts/start_all.py --build-frontend
```

Manual chat path:

```powershell
cd Clustering; python app.py
cd Chatbot\Local-RAG; python app.py
```

## Re-benchmark after training

```bash
cd Clustering
python train_clip_heritage.py
python train_gnn.py
python hdbscan_faiss.py
python rag_index.py
python benchmark.py
```

Collaborators: follow **`SETUP.md`**. Metrics narrative: **`TODO.md`**.
