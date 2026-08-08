# Research Status, Assurance & Open TODOs

> Last updated: 2026-08-08 · Dataset **n = 49** · No invented metrics  
> Setup: [`SETUP.md`](SETUP.md) · Framing: [`docs/RESEARCH.md`](docs/RESEARCH.md)

---

## How claims are ensured

| Claim | Enforced / measured by | Reproduce |
|-------|------------------------|-----------|
| Hybrid retrieval | `rag_index` dense+sparse; API `mode` | `python Clustering/rag_ablation.py` |
| Structured CoT | Prompt + `parse_structured()` | Chat API `reasoning` / `answer` |
| Faithfulness proxies | Lexical support in `eval_rag.py` | `python Chatbot/Local-RAG/eval_rag.py` |
| Human κ / RAGAS hook | `human_eval_kappa.py` + template | Fill `human_ratings.json` |
| Multi-turn + persist | `session_id` + SQLite `session_store.py` | Restart Local-RAG; same session |
| Offline LLM | Fixed GGUF; `/api/health` gpu_layers | `SETUP.md` |
| MRR + CI | `bootstrap_mrr.py` | Pickles JSON |
| Thematic (non-civ) GT | `thematic_gt.py` | Pickles JSON |
| Scale FAISS/HDBSCAN | `scale_cluster_check.py` | N-conditioned metrics |

---

## Measured results (archive)

### Similarity (site-to-site) + bootstrap 95% CI

| Method | MRR@5 | CI95 |
|--------|-------|------|
| GraphSAGE | **0.552** | [0.413, 0.682] |
| Scalar+Arch | 0.540 | [0.408, 0.668] |
| Primary similarity | 0.490 | [0.357, 0.628] |

Cross-modal CLIP fine-tune retrieval MRR **1.0** (+27.5% vs pretrained).

### Thematic GT (no Civilization)

| Method | MRR@5 (share ≥1 field) | MRR@5 (share ≥2) |
|--------|------------------------|------------------|
| Primary | **0.719** | 0.357 |
| Scalar+Arch | 0.637 | 0.273 |
| GraphSAGE | 0.595 | 0.284 |

### RAG ablation (40 QA; abstain excluded → n=36)

| Mode | Hit@5 |
|------|-------|
| Dense | **1.000** |
| Hybrid | **1.000** |
| Sparse | 0.972 |

Retrieval-extractive on full 40 QA: Hit@K **1.0**, coverage ≈ **0.91**. Generation metrics: re-run `eval_rag.py --generate`.

### Scale (synthetic expand of real X; not new sites)

| N | FAISS speedup vs brute | HDBSCAN silhouette (clustered) |
|---|------------------------|--------------------------------|
| 49 | ≪1 (brute wins) | ~0.11 |
| 500 | ~2.5× | ~0.28 |
| 5000 | ~31× | ~0.33 |

### Local RAG systems

- Citations: `aspect` + `score` in API + UI  
- Sessions: SQLite under `Chatbot/Local-RAG/data/`  
- Streaming: `POST /api/chat/stream` (SSE)  
- Preference study: `POST /api/study/preference`, site-page A/B UI  

---

## Completed this cycle

### Evaluation rigor
- [x] Expand `qa_set.json` to **40** items (compare / multi-hop / abstain)
- [x] Dense vs sparse vs hybrid ablation → `rag_ablation_metrics.json`
- [x] Bootstrap CI + LOSO → `bootstrap_mrr_metrics.json`
- [x] Human rating template + Cohen κ harness + RAGAS note → `human_eval_kappa.py`
- [x] Non-civilization thematic GT → `thematic_gt_metrics.json`

### Application / systems
- [x] Citation UI (name · aspect · score)
- [x] Persist sessions (SQLite)
- [x] Preference study API + Sites UI (model vs random)
- [x] Token streaming (SSE)

### Dataset & scale
- [x] Growth gate: `Dataset/candidates/` + `scripts/validate_site_growth.py` (no invented sites; n stays 49 until verified)
- [x] Re-check FAISS + HDBSCAN across N → `scale_cluster_metrics.json`

---

## Open TODOs (remaining)

### Paper packaging
- [ ] Methods figure: Application ↔ Clustering ↔ Local-RAG dataflow
- [ ] Threats-to-validity subsection (n=49, lexical faithfulness, GNN circularity)
- [ ] Appendix: qualitative win/fail cases from `eval_rag.py` rows

### Human / optional (blocked on people or installs)
- [ ] Fill `human_ratings.json` and report κ
- [ ] Optional `pip install ragas` notebook run
- [ ] Collect preference-study N≥30 via `/api/study/summary`

### Real corpus growth (when you have sources)
- [ ] Add verified rows + images via candidates pipeline; then retrain all models

### Explicitly out of scope
- Frontier API as primary generator · inventing sites · FAISS speedup claims on n=49 alone  

### Application AI (user-facing) — DONE
- [x] Discover by description / photo (`/Explore`)
- [x] “You might also like” + what they share (site pages)
- [x] Compare two places
- [x] Heritage trail planner (`/Trail`)
- [x] Favourites + “Picked for you” (**device-local `localStorage`, no login**)
- [x] Puzzle hints (3 soft clues, no spoilers)
- [x] Surprise me · mood browse · ask about this page · listen · kids mode · before you go

---

## Ops

```bash
# eval suite
python Clustering/rag_ablation.py
python Clustering/bootstrap_mrr.py
python Clustering/thematic_gt.py
python Clustering/scale_cluster_check.py
python Chatbot/Local-RAG/eval_rag.py
python scripts/validate_site_growth.py
```

`scripts/start_all.py` · Express `:8175` · Local RAG `:8176` · Clustering `:8177` · WebGL `:8179`  
Port map: `scripts/PORTS.txt`
