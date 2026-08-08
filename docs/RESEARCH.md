# Research narrative (paper methods / contributions)

Use with measured tables in `TODO.md` and `Clustering/Pickles/*.json`.  
**How each claim is ensured:** see the assurance table at the top of `TODO.md`.

## What is research-grade here

| Pillar | Claim you can defend | Ensured by |
|--------|----------------------|------------|
| Multimodal similarity | CLIP + tabular fusion ablations | `benchmark.py` / `compare_vectorizers.py` / `feature_fusion.py` → JSON metrics |
| Graph recommenders | GraphSAGE + LORO sensitivity | `train_gnn.py` + `gnn_loro_eval.py` |
| Clustering at scale | HDBSCAN validity; FAISS vs N | `hdbscan_faiss.py` + `scale_latency_study.py` |
| Grounded dialogue | Hybrid RAG + local CoT + proxies | `rag_index` hybrid + `eval_rag.py` + fixed GGUF |
| Systems | Offline consumer-GPU stack | `SETUP.md`, `/api/health` gpu_layers, no primary API keys |

## What local LLM is *not*

- Not SOTA generative quality vs frontier APIs  
- Not a new foundation model  

It **is**: fixed weights, no API dependency, measurable grounding on *your* index, deployable demo.

## Suggested paper framing

1. Problem: sparse heritage metadata + explainable recommend + grounded Q&A  
2. Methods: CLIP-Heritage, GraphSAGE, vectorizer/fusion ablations, HDBSCAN/FAISS, hybrid RAG+GGUF CoT  
3. Evaluation: MRR, cross-modal MRR, cluster metrics, LORO, Hit@K / faithfulness proxy / latency  
4. Honesty: n=49; lexical (not human) faithfulness; FAISS wins at large N; fine-tune helps cross-modal more than site-to-site here  

Open gaps: paper packaging + human κ fill-in + preference-study N — see **Open TODOs** in `TODO.md`.
