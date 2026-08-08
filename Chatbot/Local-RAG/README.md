# Local RAG Reasoner (no cloud API keys)

Heritage chatbot pipeline:

1. Hybrid retrieve (`Clustering` `/api/rag-context` or local `rag_index`)
2. Optional Postgres enrich
3. Local GGUF (`Qwen2.5-1.5B-Instruct-Q4_K_M`) via `llama-cpp-python`
4. Structured CoT: `REASONING` / `ANSWER` / `CONFIDENCE`
5. Multi-turn via `session_id`

Startup **preloads** the model and warms retrieval so the first user reply is not a cold load.

---

## One-time GPU setup

```powershell
# from repo root
.\scripts\install_gpu_llm.ps1
cd Chatbot/Local-RAG
python download_model.py
```

`cuda_path.py` adds Torch CUDA DLLs so the llama-cpp CUDA wheel works on Windows without a full CUDA Toolkit.

---

## Run (defaults already set)

No `$env:LOCAL_LLM_*` exports needed. Defaults: **33 GPU layers**, **4096 ctx**, **192 max tokens**.

```powershell
# Terminal A
cd Clustering; python app.py
# Terminal B
cd Chatbot\Local-RAG; python app.py
```

Or from repo root: `python scripts/start_all.py`

Check: `GET http://localhost:8176/api/health` → `llama-cpp-gguf-gpu`, `gpu_layers: 33`.

Optional overrides: copy `.env.example` → `.env`.

| Variable | Default |
|----------|---------|
| `PORT` | 8176 |
| `LOCAL_LLM_N_GPU_LAYERS` | 33 |
| `LOCAL_LLM_CTX` | 4096 |
| `LOCAL_LLM_MAX_TOKENS` | 192 |
| `LOCAL_LLM_N_BATCH` | 512 |
| `CLUSTERING_URL` | http://localhost:8177 |

---

## Latency

| Stage | Expectation (RTX 3050-class) |
|-------|------------------------------|
| Process start + warmup | once, tens of seconds |
| Chat after warmup | ~2–5 s (`latency_ms` in response) |
| CPU fallback | much slower |

Shorter `LOCAL_LLM_MAX_TOKENS` and compact prompts trade verbosity for speed.

---

## Eval

```bash
python eval_rag.py              # retrieval
python eval_rag.py --generate   # + generation metrics
```

See root `TODO.md` for Hit@K / faithfulness / hallucination numbers.

---

## Research framing

Novelty is **grounded hybrid RAG + measurable faithfulness**, not frontier-model size. Local GGUF supports reproducible offline demos and papers without API cost/bias. Pair with Clustering ablations for a full methods section.
