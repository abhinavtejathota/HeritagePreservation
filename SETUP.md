# Setup Guide (clone → run)

For anyone who pulls this repo from GitHub. No cloud LLM API keys are required for the primary stack.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|--------|
| Node.js | 18+ | Application backend + frontend |
| Python | 3.10–3.12 recommended | Clustering + Local-RAG |
| PostgreSQL | 14+ or Supabase | Heritage site DB |
| NVIDIA GPU (optional) | CUDA-capable | Faster Local-RAG; CPU works but slower |
| Git LFS (optional) | — | Large GGUF models are **downloaded**, not committed |

---

## 1. Clone & secrets

```bash
git clone <your-repo-url>
cd Major
```

Copy env templates (do **not** commit real passwords):

```bash
# Application DB
cp Application/backend/server/.env.example Application/backend/server/.env
# edit DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT

# Clustering (same DB credentials)
cp Clustering/.env.example Clustering/.env   # if present; else mirror Application .env keys

# Local RAG — optional; code already defaults to GPU-friendly settings
cp Chatbot/Local-RAG/.env.example Chatbot/Local-RAG/.env
```

Frontend defaults (optional `Application/frontend/.env`):

```
REACT_APP_API_URL=http://localhost:8175
REACT_APP_CHA_URL=http://localhost:8176/api
REACT_APP_SIM_URL=http://localhost:8179
```

---

## 2. Database

1. Create a database and run your existing schema (or create `heritage_sites` / `site_similarity` as in `README.md`).
2. Sync CSV → Postgres:

```bash
python scripts/sync_sites_to_db.py
```

Expect **n = 49** sites. Do not invent extra sites without images + verified metadata.

---

## 3. Python deps

```bash
# Clustering
cd Clustering
pip install -r requirements.txt   # or: fastapi uvicorn scikit-learn pandas numpy psycopg2-binary python-dotenv sentence-transformers torch networkx scipy faiss-cpu

# Local RAG
cd ../Chatbot/Local-RAG
pip install -r requirements.txt
```

### GPU LLM (recommended on Windows + NVIDIA)

From repo root (once):

```powershell
.\scripts\install_gpu_llm.ps1
```

This installs PyTorch CUDA + `llama-cpp-python` CUDA wheel. `cuda_path.py` exposes Torch’s CUDA DLLs so a full CUDA Toolkit install is usually unnecessary.

Then download the GGUF (≈1GB, gitignored):

```bash
cd Chatbot/Local-RAG
python download_model.py
```

**Defaults (no shell exports needed):**

| Variable | Default | Meaning |
|----------|---------|---------|
| `LOCAL_LLM_N_GPU_LAYERS` | `33` | Offload layers to GPU (RTX 3050 4GB / 1.5B Q4) |
| `LOCAL_LLM_CTX` | `4096` | Context window |
| `LOCAL_LLM_MAX_TOKENS` | `192` | Shorter replies → lower latency |
| `LOCAL_LLM_N_BATCH` | `512` | Prompt processing batch |
| `PORT` | `8176` | Chat API |
| `CLUSTERING_URL` | `http://localhost:8177` | Hybrid RAG retrieve |

You do **not** need:

```powershell
$env:LOCAL_LLM_N_GPU_LAYERS = "33"
$env:LOCAL_LLM_CTX = "4096"
```

Those were one-off session overrides. Defaults live in `local_llm.py` + optional `Chatbot/Local-RAG/.env`.

---

## 4. Node deps & frontend build

```bash
cd Application
npm run install:all
cd frontend && npm run build && cd ../..
```

---

## 5. Run

### One command (recommended)

```powershell
.\scripts\start-all.ps1
.\scripts\start-all.ps1 --stop
.\scripts\start-all.ps1 --restart
.\scripts\start-all.ps1 --status
# same: python scripts/start_all.py …  /  ./scripts/start-all.sh …
```

| Service | URL |
|---------|-----|
| App UI + API | http://localhost:8175 |
| Clustering | http://localhost:8177 |
| Local RAG chat | http://localhost:8176 |

WebGL and Api-Based are **not** started. Use `REACT_APP_SIM_URL` for your existing WebGL host. Optional flags: `--with-webgl`, `--with-api-fallback`.

### Manual (two terminals for chat)

```bash
# Terminal A — required for retrieval
cd Clustering && python app.py

# Terminal B — chatbot (preloads GPU GGUF on startup)
cd Chatbot/Local-RAG && python app.py
```

Health: `GET http://localhost:8176/api/health` → expect `backend: llama-cpp-gguf-gpu`, `gpu_layers: 33`.

### Latency expectations

| Phase | Typical |
|-------|---------|
| First startup (load GGUF + warmup) | 15–60 s once |
| Steady-state chat after warmup | ~2–5 s / reply on RTX 3050 |
| CPU-only GGUF | often 15–40+ s / reply |

If replies feel slow: confirm `/api/health` shows GPU layers > 0, Clustering is up, and you are not cold-starting every request.

---

## 6. Optional: rebuild ML artifacts

Only if you change the CSV or retrain:

```bash
cd Clustering
python train_clip_heritage.py
python train_gnn.py
python hdbscan_faiss.py
python rag_index.py
python benchmark.py
python compare_vectorizers.py
python feature_fusion.py
```

Committed / generated pickles under `Clustering/Pickles/` may already exist locally; regenerating is for research reproduction.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Chat: “No heritage context” | Start Clustering; run `python Clustering/rag_index.py` once |
| `backend: llama-cpp-gguf-cpu` | Re-run `install_gpu_llm.ps1`; check `nvidia-smi` |
| Context / n_ctx errors | Keep `LOCAL_LLM_CTX=4096` (default) |
| DB connection failed | Fix Application + Clustering `.env` credentials |
| Frontend chat fails | `REACT_APP_CHA_URL=http://localhost:8176/api` |

Legacy cloud chatbots (`Agent-Based`, `Api-Based`) need API keys and are **not** required. Use `--with-api-fallback` only if you want them.

See also: root `README.md`, `TODO.md` (measured metrics), `docs/PHASE2_HANDOFF.md`.
