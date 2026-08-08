# Implementation Plan — Status (2026-08-08)

Original CLIP-Heritage plan is **complete**, plus GraphSAGE, HDBSCAN+FAISS, spatial hulls, vectorizer/fusion ablations, and **Local Hybrid RAG** (no cloud keys).

## Measured highlights (n=49)

See `Clustering/Pickles/benchmark_metrics.json` and `TODO.md`.

- **Best site-to-site MRR@5:** GraphSAGE ≈ CLIP pretrained (~0.55)
- **Best cross-modal:** CLIP fine-tuned (MRR 1.0)
- **RAG QA:** Hit@K=1.0; Faithfulness≈0.79; Hallucination≈0.21; ~3s/gen after GPU warmup

## Regenerate ML stack

```bash
cd Clustering
python train_clip_heritage.py
python train_gnn.py
python hdbscan_faiss.py
python rag_index.py
python benchmark.py
```

## Application + chat

- Express serves `Application/frontend/build` on `:8175`
- Primary chatbot: `Chatbot/Local-RAG` on `:8176` (GPU defaults in code / `.env.example`)
- Orchestrator: `scripts/start_all.py`
- Clone instructions: `SETUP.md`
