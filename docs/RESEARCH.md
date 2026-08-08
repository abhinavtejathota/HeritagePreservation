# Research narrative (paper methods / contributions)

Use with measured tables in `TODO.md` and `Clustering/Pickles/*.json`.  
**How each claim is ensured:** see the assurance table at the top of `TODO.md`.

## What is research-grade here

| Pillar | Claim you can defend | Ensured by |
|--------|----------------------|------------|
| Multimodal similarity | CLIP + tabular fusion ablations | `benchmark.py` / `compare_vectorizers.py` / `feature_fusion.py` → JSON metrics |
| Graph recommenders | GraphSAGE + LORO sensitivity | `train_gnn.py` + `gnn_loro_eval.py` |
| Clustering at scale | HDBSCAN validity; FAISS vs N | `hdbscan_faiss.py` + `scale_latency_study.py` |
| Grounded dialogue | Hybrid RAG + extractive Agent + Mini-LM proxies | `eval_agent_chat.py` → `docs/agent_chat_metrics.json` · `/Research` |
| Systems | Offline consumer-GPU stack | `SETUP.md`, `/api/health` gpu_layers, no primary API keys |

## What local LLM is *not*

- Not SOTA generative quality vs frontier APIs  
- Not a new foundation model  

It **is**: fixed weights, no API dependency, measurable grounding on *your* index, deployable demo.

## Suggested paper framing

1. Problem: sparse heritage metadata + explainable recommend + **grounded** Q&A  
2. Methods: CLIP-Heritage, GraphSAGE, fusion ablations, HDBSCAN/FAISS, **hybrid retrieve + extractive Agent RAG**, optional **Heritage Mini-LM** (BPE + Transformer trained on the archive)  
3. Evaluation: MRR, cross-modal MRR, cluster metrics, LORO, Hit@K / faithfulness proxy / latency  
4. Systems: Agent-Based on `:8180` (primary; includes `heritage-lm/`); Local GGUF `:8176` as last **fallback**  
5. Honesty: n=49; Mini-LM is compact/domain — not a frontier chat model; extractive answers cite passages  

Open gaps: paper packaging + human κ fill-in + preference-study N — see **Open TODOs** in `TODO.md`.

## Reviewer-facing transparency (in the running app)

| Need | Where |
|------|--------|
| Dataset n / geography / distributions / sources | `GET /api/dataset/stats` · UI `/Research` · `Dataset/README.md` |
| Measured MRR / RAG / scale tables | `GET /api/research/metrics` · `docs/research_metrics.json` |
| Agent chat + Mini-LM experiment | `GET /api/research/dashboard` · UI `/Research` § Agent chat · `docs/agent_chat_metrics.json` |
| High-DPI figures + captions for the paper | `python Clustering/export_paper_figures.py` → `docs/paper_figures/` |

Word draft `Review/report.docx` still needs a prose rewrite to cite these tables (not automated by code).
