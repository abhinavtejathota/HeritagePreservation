# Global Heritage Preservation & Virtual Exploration Ecosystem

End-to-end research + product stack for **cultural heritage**: multimodal site similarity, graph-based recommenders, **local hybrid RAG** (no cloud LLM keys), React exploration UI, and Unity WebGL tours.

**Dataset:** n = **49** verified heritage sites (CSV ↔ PostgreSQL). Metrics in `TODO.md` are measured — not invented.

**New clone?** Start with **[SETUP.md](SETUP.md)**.

---

## Architecture

| Module | Stack | Role |
|--------|--------|------|
| **Application** | React 19, Express 5, PostgreSQL | Dashboard, map, favorites, Play puzzle, serves SPA from `:8175` |
| **Clustering** | FastAPI, sklearn, CLIP, GraphSAGE, HDBSCAN, FAISS | Similarity, clusters, multimodal search, hybrid RAG index |
| **Local RAG** | FastAPI, llama-cpp GGUF (Qwen2.5-1.5B Q4), MiniLM+TF-IDF | Grounded chat with CoT — primary chatbot on `:8176` |
| **WebGL** | Unity URP builds | 1st-person tours (Petra sites, etc.) on `:8179` |

Legacy `Chatbot/Agent-Based` (Gemini/Groq) and `Api-Based` are optional fallbacks only.

---

## Ports & env

| Service | Path | Port | Env file |
|---------|------|------|----------|
| App API + UI | `Application/backend/server` | **8175** | `server/.env` (`DB_*`) |
| Clustering | `Clustering/` | **8177** | `.env` (`DB_*`) |
| **Local RAG** | `Chatbot/Local-RAG/` | **8176** | `.env` optional — **GPU defaults baked in** |
| WebGL | `WebGLBuilds/` | **8179** | — |
| Frontend env | `Application/frontend` | — | `REACT_APP_CHA_URL=http://localhost:8176/api` |

### Local LLM defaults (no PowerShell exports)

`LOCAL_LLM_N_GPU_LAYERS=33`, `LOCAL_LLM_CTX=4096`, `LOCAL_LLM_MAX_TOKENS=192` are defaults in code / `Chatbot/Local-RAG/.env.example`. Just:

```bash
cd Chatbot/Local-RAG
python app.py
```

---

## Quick start

```powershell
.\scripts\start-all.ps1
.\scripts\start-all.ps1 --stop
.\scripts\start-all.ps1 --restart
.\scripts\start-all.ps1 --status
# same flags: python scripts/start_all.py …  /  ./scripts/start-all.sh …
```

```bash
python scripts/start_all.py
./scripts/start-all.sh
```

| URL | What |
|-----|------|
| http://localhost:8175 | Full app (API + React build) |
| http://localhost:8177 | Clustering / RAG retrieve |
| http://localhost:8176 | Local RAG chat |

`start_all` does **not** start WebGL or Api-Based (WebGL comes from your existing `REACT_APP_SIM_URL`; Api-Based is opt-in via `--with-api-fallback`).

---

## Research contributions (paper-facing)

This is **not** “we called a frontier API.” Research-grade pieces:

1. **Multimodal heritage embeddings** — CLIP-Heritage + honest site-to-site vs cross-modal ablations  
2. **Heterogeneous GraphSAGE** recommenders + leave-one-relation-out sensitivity  
3. **Vectorizer / fusion ablations** — CLIP-text vs TF-IDF; Arch-only vs full concat  
4. **HDBSCAN + FAISS** — cluster validity + scale latency (wins at N≫49)  
5. **Hybrid RAG** — multi-aspect chunks, dense+sparse retrieve, structured CoT, faithfulness/hallucination proxies on a labeled QA set, **reproducible offline** GGUF (consumer GPU)

Local LLM impact on the paper: strengthens **reproducibility**, **grounding evaluation**, and **deployment** claims; the scientific novelty is retrieval + ablations + metrics, not model scale. Report faithfulness ~0.79 / hallucination ~0.21 / Hit@K=1.0 (see `TODO.md`).

---

## Module map

```
Application/          # Express + React (unified :8175)
Chatbot/Local-RAG/    # Primary chatbot (GGUF + hybrid RAG)
Chatbot/Agent-Based/  # Legacy proxy / cloud (optional)
Clustering/           # ML API, train_*, benchmark, rag_index
Dataset/              # heritage_sites_v*.csv
WebGLBuilds/          # Static Unity builds
scripts/              # start_all, sync_sites_to_db, install_gpu_llm
docs/                 # PHASE2_HANDOFF, plans
SETUP.md              # Clone-friendly setup
TODO.md               # Measured benchmarks & roadmap
```

---

## Key APIs

**Clustering `:8177`**
- `POST /get-similarity` — cosine / KMeans / AGNES / GMM / MMR / GraphSAGE / HDBSCAN  
- `POST /api/multimodal-search` — CLIP text→site  
- `POST /api/rag-context` — hybrid contexts for Local RAG  
- `GET /api/clusters/spatial-polygons` — hull overlays  
- `GET /api/benchmarks` — metric tables  

**Local RAG `:8176`**
- `POST /api/chat` — `{ "query", "session_id?" }` → answer, reasoning, sources, `latency_ms`  
- `GET /api/health` — backend + `gpu_layers`  
- `POST /api/chat/reset` — clear session  

**Express `:8175`**
- `GET /api/health`, `/api/sites`, `/api/sites/:name/similar`, spatial polygons proxy  
- Serves `frontend/build` SPA  

---

## Database

- `heritage_sites` — attributes, coords, ranks  
- `site_similarity` — logged recommendation JSON  

Sync: `python scripts/sync_sites_to_db.py` (never invent sites).

---

## WebGL

Configured via `REACT_APP_SIM_URL` (your existing static host). Not launched by `start_all`.

To serve locally only if you need it:

```bash
cd WebGLBuilds && npx serve -p 8179 --cors
# or: python scripts/start_all.py --with-webgl
```

Sites include Great Temple (Petra), Temple of the Winged Lions, Blue Pillar Chapel, Nabataean Theatre.

---

## Docs

| Doc | Purpose |
|-----|---------|
| [SETUP.md](SETUP.md) | Clone → deps → run (for GitHub collaborators) |
| [TODO.md](TODO.md) | Honest metrics & experiments |
| [docs/RESEARCH.md](docs/RESEARCH.md) | Paper framing for local LLM + ML stack |
| [docs/PHASE2_HANDOFF.md](docs/PHASE2_HANDOFF.md) | Research stack handoff |
| [Chatbot/Local-RAG/README.md](Chatbot/Local-RAG/README.md) | GPU install + eval |

---

## License / academic use

Use measured numbers from `Clustering/Pickles/*.json` and `TODO.md` in papers. Prefer ablations over single “best” claims on n=49.
