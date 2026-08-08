# Global Heritage Preservation & Virtual Exploration Ecosystem

End-to-end research + product stack for **cultural heritage**: multimodal site similarity, graph-based recommenders, **local hybrid RAG** (no cloud LLM keys), React exploration UI, and Unity WebGL tours.

**Dataset:** n = **49** verified heritage sites (CSV ↔ PostgreSQL). Metrics in `TODO.md` are measured — not invented.

**New clone?** Start with **[SETUP.md](SETUP.md)**.

**Python:** no project venv is committed. From the repo root you can create one and install everything with [`requirements.txt`](requirements.txt) (Clustering + Local-RAG + scripts).

```bash
python -m venv .venv
# Windows: .\.venv\Scripts\activate
# Unix:    source .venv/bin/activate
pip install -r requirements.txt
```

---

## Architecture

| Module | Stack | Role |
|--------|--------|------|
| **Application** | React 19, Express 5, PostgreSQL | Dashboard, map, favorites, Play puzzle, serves SPA from `:8175` |
| **Clustering** | FastAPI, sklearn, CLIP, GraphSAGE, HDBSCAN, FAISS | Similarity, clusters, multimodal search, **hybrid RAG index** |
| **Agent Hybrid RAG** | Node/TS on `:8180` | **Primary chat** — retrieve from your index + extractive grounded answers; optional cloud polish |
| **Local RAG** | FastAPI, llama-cpp GGUF on `:8176` | **Offline fallback** fluent generation (not the claimed novelty) |
| **WebGL** | Unity URP builds | 1st-person tours (Petra sites, etc.) on `:8179` |

Cloud Gemini/Groq are **optional polish** inside Agent-Based when keys exist. Prefer extractive RAG for demos without keys.

---

## Ports & env

| Service | Path | Port | Env file |
|---------|------|------|----------|
| App API + UI | `Application/backend/server` | **8175** | `server/.env` (`DB_*`) |
| **Agent Hybrid RAG** | `Chatbot/Agent-Based` | **8180** | `.env` (`PORT=8180`) |
| Local RAG (fallback) | `Chatbot/Local-RAG/` | **8176** | `.env` optional |
| Clustering | `Clustering/` | **8177** | `.env` (`DB_*`) |
| WebGL | `WebGLBuilds/` | **8179** | — |
| Frontend env | `Application/frontend` | — | `REACT_APP_CHA_URL=http://localhost:8180/api` |

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
| http://localhost:8180/api | **Primary chat** — Agent hybrid RAG |
| http://localhost:8177 | Clustering / RAG retrieve |
| http://localhost:8176 | Local RAG GGUF (**fallback**) |

`start_all` does **not** start WebGL or Api-Based (WebGL comes from your existing `REACT_APP_SIM_URL`; Api-Based is opt-in via `--with-api-fallback`).

---

## Exclusive research endpoints (not in the UI)

These are **hidden from navigation** — no menu item or button. Open them by typing the URL (or calling the API) when you need the metrics demo / paper figures.

| Path | What |
|------|------|
| http://localhost:8175/Research | Metrics dashboard (dataset, MRR, RAG, scale, preference study, figures) |
| `GET /api/dataset/stats` | Corpus n, geography, feature distributions, sources |
| `GET /api/research/metrics` | Measured multi-process metrics snapshot (+ Pickles overlays if present) |
| `GET /api/research/dashboard` | One-shot: headline metrics + live Clustering/RAG health + study log |
| `GET /api/research/overview` | Short overview (n, preference N, figure list) |
| `/paper-figures/…` | High-DPI exports from `docs/paper_figures/` |

Regenerate figures:

```bash
python Clustering/export_paper_figures.py
```

Snapshot source: [`docs/research_metrics.json`](docs/research_metrics.json). Dataset notes: [`Dataset/README.md`](Dataset/README.md).

---

## Research contributions (paper-facing)

This is **not** “we fine-tuned a local chat LLM.” Prefer this framing:

1. **Hybrid heritage retrieval** — dense + sparse index over your corpus (`Clustering/rag_index`), with CLIP-Heritage / fusion ablations you trained  
2. **Agent Hybrid RAG** — retrieve-then-**extractive** grounded answers in code (`Chatbot/Agent-Based`), citing passages  
3. **GraphSAGE / clustering / FAISS** — recommendation and scale studies (see `TODO.md`)  
4. **Local GGUF RAG** — optional **offline fallback** for fluent generation when retrieval is empty or Agent is down  

Local LLM impact: strengthens **offline demos**, not the core novelty. Report retrieval Hit@K / faithfulness from `TODO.md`; chat `mode` field shows `agent-hybrid-rag` vs `local-rag-fallback`.

---

## Module map

```
Application/          # Express + React (unified :8175)
Chatbot/Agent-Based/  # Primary chat (TS) — RAG + bundled heritage-lm MiniGPT (:8180)
Chatbot/Local-RAG/    # GGUF offline fallback only (:8176) — not the UI entrypoint
Clustering/           # ML API, train_*, benchmark, rag_index
Dataset/              # heritage_sites_v*.csv
WebGLBuilds/          # Static Unity builds
scripts/              # start_all, sync_sites_to_db, install_gpu_llm
docs/                 # PHASE2_HANDOFF, plans
SETUP.md              # Clone-friendly setup
TODO.md               # Measured benchmarks & roadmap
requirements.txt      # Root Python deps (create your own venv)
```

---

## Key APIs

**Clustering `:8177`**
- `POST /get-similarity` — cosine / KMeans / AGNES / GMM / MMR / GraphSAGE / HDBSCAN  
- `POST /api/multimodal-search` — CLIP text→site  
- `POST /api/rag-context` — hybrid contexts for Local RAG  
- `GET /api/clusters/spatial-polygons` — hull overlays  
- `GET /api/benchmarks` — metric tables  

**Local RAG `:8176` (fallback)**
- `POST /api/chat` — GGUF fluent generation when Agent retrieval path needs fallback  

**Agent Hybrid RAG `:8180` (primary PineAI)**
- `POST /api/chat` — hybrid retrieve → extractive grounded answer (+ optional cloud polish)  
- `POST /api/chat/stream` — SSE for the React widget  
- `GET /api/health` — mode + clustering / fallback URLs  

**Express `:8175`**
- `GET /api/health`, `/api/sites`, `/api/sites/:name/similar`, spatial polygons proxy  
- Serves `frontend/build` SPA  
- Exclusive research routes (not linked in UI): see **Exclusive research endpoints** above  

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
