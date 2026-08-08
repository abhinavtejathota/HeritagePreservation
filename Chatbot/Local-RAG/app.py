"""
Local Heritage RAG Reasoner — no cloud API keys.

Pipeline:
  1. Hybrid retrieve from Clustering rag_index (or local fallback)
  2. Optional Postgres enrich
  3. Local GGUF LLM (llama-cpp-python) with CoT REASONING/ANSWER/CONFIDENCE

Designed for ~4GB VRAM (RTX 3050): default Qwen2.5-1.5B-Instruct Q4_K_M.
Falls back to CPU if CUDA build of llama-cpp is unavailable.

Usage:
  python download_model.py          # once
  python app.py                     # PORT=8176

Env (optional):
  LOCAL_LLM_PATH, LOCAL_LLM_N_GPU_LAYERS, LOCAL_LLM_CTX, PORT, CLUSTERING_URL
"""

from __future__ import annotations

import os
import re
import time
from typing import Any, Optional

from contextlib import asynccontextmanager
from collections import defaultdict
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

_ENV_FILE = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(_ENV_FILE)

# Windows: expose PyTorch/CUDA DLLs before llama-cpp loads
try:
    from cuda_path import add_cuda_dll_dirs

    add_cuda_dll_dirs()
except Exception:
    pass

PORT = int(os.getenv("PORT", "8176"))
CLUSTERING_URL = os.getenv("CLUSTERING_URL", "http://localhost:8177")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
DEFAULT_MODEL = os.path.join(
    MODEL_DIR, "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf"
)
LLM_PATH = os.getenv("LOCAL_LLM_PATH", DEFAULT_MODEL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Preload GGUF + warmup so the first chat is not cold-start slow."""
    print("[startup] Preloading local LLM (GPU defaults from .env)…")
    try:
        from local_llm import warmup

        warmup()
    except Exception as e:
        print(f"[startup] LLM preload deferred: {e}")
    # Warm retrieval path (sentence-transformers) if Clustering is down
    try:
        retrieve_contexts("Ajanta Caves", top_k=2)
        print("[startup] retrieval warmup done")
    except Exception as e:
        print(f"[startup] retrieval warmup skipped: {e}")
    yield


app = FastAPI(
    title="Heritage Local RAG Reasoner",
    version="1.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_llm = None
_llm_error: Optional[str] = None

SYSTEM_PROMPT = """You are PineAI, a cultural-heritage research assistant.
Use ONLY the provided CONTEXT. If insufficient, say so clearly.
Stay on heritage / architecture / history / geography.
Output EXACTLY:
REASONING: <1-2 short sentences>
ANSWER: <concise grounded reply>
CONFIDENCE: <0.0-1.0>"""

# Multi-turn session memory: session_id -> list[{role, content}]
# In-memory cache + SQLite persistence (session_store.py)
_SESSIONS: dict[str, list[dict]] = defaultdict(list)
MAX_TURNS = 6


def _load_history(session_id: str) -> list[dict]:
    if session_id in _SESSIONS and _SESSIONS[session_id]:
        return list(_SESSIONS[session_id])
    try:
        from session_store import load_session

        hist = load_session(session_id)
        if hist:
            _SESSIONS[session_id] = hist
        return list(hist)
    except Exception as e:
        print(f"[session] load failed: {e}")
        return list(_SESSIONS.get(session_id, []))


def _save_history(session_id: str, history: list[dict]) -> None:
    trimmed = history[-(MAX_TURNS * 2) :]
    _SESSIONS[session_id] = trimmed
    try:
        from session_store import save_session

        save_session(session_id, trimmed)
    except Exception as e:
        print(f"[session] save failed: {e}")


class ChatRequest(BaseModel):
    query: Optional[str] = None
    message: Optional[str] = None
    session_id: Optional[str] = None


def generate_local(prompt: str, history: Optional[list[dict]] = None) -> str:
    from local_llm import generate, backend_name, gpu_layers_used

    text = generate(SYSTEM_PROMPT, prompt, history=history)
    print(
        f"[gen] backend={backend_name()} gpu_layers={gpu_layers_used()} chars={len(text)}"
    )
    return text


def retrieve_contexts(query: str, top_k: int = 5) -> list[dict]:
    """Prefer Clustering hybrid index; fall back to local rag_index import."""
    try:
        import requests

        r = requests.post(
            f"{CLUSTERING_URL}/api/rag-context",
            json={"query": query, "top_k": top_k, "hybrid": True},
            timeout=30,
        )
        if r.status_code == 200:
            return r.json().get("contexts") or []
    except Exception as e:
        print(f"[retrieve] Clustering unavailable: {e}")

    try:
        import sys

        clustering = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "Clustering")
        )
        if clustering not in sys.path:
            sys.path.insert(0, clustering)
        from rag_index import retrieve

        return retrieve(query, top_k=top_k)
    except Exception as e:
        print(f"[retrieve] local rag_index failed: {e}")
        return []


def enrich_db(names: list[str]) -> list[dict]:
    try:
        import psycopg2

        load_dotenv(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "Application",
                "backend",
                "server",
                ".env",
            )
        )
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASS") or os.getenv("DB_PASSWORD"),
            dbname=os.getenv("DB_NAME"),
            port=os.getenv("DB_PORT"),
            connect_timeout=5,
        )
        cur = conn.cursor()
        rows = []
        for name in names[:4]:
            cur.execute(
                """
                SELECT name, country, civilization, religion, architecture_style,
                       material, era, description
                FROM heritage_sites
                WHERE LOWER(name) ILIKE %s
                LIMIT 1
                """,
                (f"%{name}%",),
            )
            r = cur.fetchone()
            if r:
                rows.append(
                    {
                        "name": r[0],
                        "country": r[1],
                        "civilization": r[2],
                        "religion": r[3],
                        "architecture_style": r[4],
                        "material": r[5],
                        "era": r[6],
                        "description": r[7],
                    }
                )
        conn.close()
        return rows
    except Exception as e:
        print(f"[db] enrich skipped: {e}")
        return []


def format_context(contexts: list[dict], db_rows: list[dict]) -> str:
    parts = []
    for i, c in enumerate(contexts[:4], 1):
        aspect = c.get("aspect", "")
        doc = str(c.get("document", ""))[:320]
        parts.append(
            f"[{i}] {c.get('name')} ({aspect}) score={c.get('score', 0):.3f}\n{doc}"
        )
    for i, r in enumerate(db_rows[:2], 1):
        keys = ("name", "country", "civilization", "religion", "architecture_style", "era")
        compact = ", ".join(f"{k}={r.get(k)}" for k in keys if r.get(k))
        parts.append(f"DB[{i}] {compact}")
    return "\n\n".join(parts) if parts else "(no context)"


def parse_structured(raw: str) -> dict[str, Any]:
    reasoning_m = re.search(r"REASONING:\s*(.*?)(?=\nANSWER:|$)", raw, re.I | re.S)
    answer_m = re.search(r"ANSWER:\s*(.*?)(?=\nCONFIDENCE:|$)", raw, re.I | re.S)
    conf_m = re.search(r"CONFIDENCE:\s*([0-9]*\.?[0-9]+)", raw, re.I)
    answer = (answer_m.group(1).strip() if answer_m else "").strip()
    if not answer:
        answer = re.sub(r"REASONING:.*?(?=ANSWER:|$)", "", raw, flags=re.I | re.S)
        answer = re.sub(r"ANSWER:\s*", "", answer, flags=re.I)
        answer = re.sub(r"CONFIDENCE:\s*[0-9.]+", "", answer, flags=re.I).strip()
    conf = float(conf_m.group(1)) if conf_m else 0.5
    conf = max(0.0, min(1.0, conf))
    return {
        "reasoning": reasoning_m.group(1).strip() if reasoning_m else "",
        "answer": answer
        or "I could not form a grounded answer from the retrieved heritage context.",
        "confidence": conf,
    }


UNSAFE = re.compile(r"\b(hack|bomb|kill|terror|weapon)\b", re.I)


@app.get("/api/health")
def health():
    try:
        from local_llm import backend_name, ensure_llm, gpu_layers_used

        ensure_llm()
        be = backend_name()
        gl = gpu_layers_used()
    except Exception as e:
        be = f"error:{e}"
        gl = 0
    return {
        "status": "ok",
        "mode": "local-rag",
        "backend": be,
        "gpu_layers": gl,
        "model_path": LLM_PATH,
        "model_exists": os.path.exists(LLM_PATH),
        "n_gpu_layers_env": os.getenv("LOCAL_LLM_N_GPU_LAYERS", "auto"),
        "active_sessions": len(_SESSIONS),
        "persisted_sessions": _persisted_count(),
    }


def _persisted_count() -> int:
    try:
        from session_store import session_count

        return session_count()
    except Exception:
        return 0


@app.post("/api/chat/reset")
def reset_session(body: ChatRequest):
    sid = body.session_id
    if sid and sid in _SESSIONS:
        del _SESSIONS[sid]
    try:
        from session_store import delete_session

        if sid:
            delete_session(sid)
    except Exception:
        pass
    return {"ok": True, "session_id": sid}


@app.post("/api/chat")
@app.post("/chat")
def chat(body: ChatRequest):
    query = (body.query or body.message or "").strip()
    if not query:
        return {"error": "Query is required", "answer": "", "confidence": 0}

    if UNSAFE.search(query):
        return {
            "answer": "I can only help with cultural heritage questions.",
            "confidence": 0,
            "agentsUsed": ["safety"],
            "mode": "local-rag",
        }

    session_id = body.session_id or str(uuid4())
    history = _load_history(session_id)

    t0 = time.perf_counter()
    # Query rewrite for follow-ups: include last user turn hint in retrieval
    retrieve_q = query
    if history:
        last_user = next(
            (h["content"] for h in reversed(history) if h.get("role") == "user"),
            "",
        )
        if last_user and len(query.split()) < 8:
            retrieve_q = f"{last_user}\n{query}"

    contexts = retrieve_contexts(retrieve_q, top_k=4)
    names = list(dict.fromkeys(c.get("name") for c in contexts if c.get("name")))
    db_rows = enrich_db(names)
    ctx = format_context(contexts, db_rows)
    avg_score = (
        sum(float(c.get("score") or 0) for c in contexts) / len(contexts)
        if contexts
        else 0.0
    )

    if not contexts and not db_rows:
        return {
            "answer": (
                "No heritage context retrieved. Is the Clustering service running, "
                "and have you built the RAG index (`python Clustering/rag_index.py`)?"
            ),
            "confidence": 0.15,
            "agentsUsed": ["local-rag"],
            "mode": "local-rag",
            "session_id": session_id,
            "ragContexts": [],
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }

    user_prompt = (
        f"USER QUESTION:\n{query}\n\nCONTEXT:\n{ctx}\n\n"
        f"Average retrieval score: {avg_score:.3f}\n"
        "Use conversation history if this is a follow-up. "
        "Respond with REASONING / ANSWER / CONFIDENCE."
    )

    try:
        raw = generate_local(user_prompt, history=history)
        parsed = parse_structured(raw)
        blended = round(0.6 * parsed["confidence"] + 0.4 * min(1.0, avg_score + 0.15), 2)

        # Update session memory (memory + SQLite)
        history.append({"role": "user", "content": query})
        history.append({"role": "assistant", "content": parsed["answer"][:2000]})
        _save_history(session_id, history)

        from local_llm import backend_name, gpu_layers_used

        citations = [
            {
                "name": c.get("name"),
                "aspect": c.get("aspect"),
                "score": round(float(c.get("score") or 0), 4),
            }
            for c in contexts
        ]

        return {
            "answer": parsed["answer"],
            "reasoning": parsed["reasoning"],
            "confidence": blended,
            "agentsUsed": ["local-rag", "gguf", "multi-turn"],
            "mode": "local-rag",
            "session_id": session_id,
            "backend": backend_name(),
            "gpu_layers": gpu_layers_used(),
            "ragContexts": citations,
            "citations": citations,
            "sources": names,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
            "model": os.path.basename(LLM_PATH),
        }
    except Exception as e:
        bullets = "\n".join(
            f"• **{c.get('name')}** ({c.get('aspect', 'overview')}): {c.get('document', '')[:280]}"
            for c in contexts[:4]
        )
        return {
            "answer": (
                f"Local LLM unavailable ({e}). Retrieved heritage evidence:\n\n{bullets}"
            ),
            "confidence": round(avg_score, 2),
            "agentsUsed": ["local-rag", "retrieval-only"],
            "mode": "local-rag",
            "session_id": session_id,
            "ragContexts": [
                {"name": c.get("name"), "score": c.get("score")} for c in contexts
            ],
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }


@app.post("/api/chat/stream")
def chat_stream(body: ChatRequest):
    """SSE token stream for perceived latency. Final event includes citations JSON."""
    import json as _json

    query = (body.query or body.message or "").strip()
    if not query:
        return {"error": "Query is required"}

    session_id = body.session_id or str(uuid4())
    history = _load_history(session_id)

    retrieve_q = query
    if history:
        last_user = next(
            (h["content"] for h in reversed(history) if h.get("role") == "user"),
            "",
        )
        if last_user and len(query.split()) < 8:
            retrieve_q = f"{last_user}\n{query}"

    contexts = retrieve_contexts(retrieve_q, top_k=4)
    names = list(dict.fromkeys(c.get("name") for c in contexts if c.get("name")))
    db_rows = enrich_db(names)
    ctx = format_context(contexts, db_rows)
    citations = [
        {
            "name": c.get("name"),
            "aspect": c.get("aspect"),
            "score": round(float(c.get("score") or 0), 4),
        }
        for c in contexts
    ]
    user_prompt = (
        f"USER QUESTION:\n{query}\n\nCONTEXT:\n{ctx}\n\n"
        "Respond with REASONING / ANSWER / CONFIDENCE."
    )

    def event_gen():
        yield f"data: {_json.dumps({'type': 'meta', 'session_id': session_id, 'citations': citations})}\n\n"
        raw_parts: list[str] = []
        try:
            from local_llm import generate_stream

            for delta in generate_stream(SYSTEM_PROMPT, user_prompt, history=history):
                raw_parts.append(delta)
                yield f"data: {_json.dumps({'type': 'token', 'text': delta})}\n\n"
            raw = "".join(raw_parts)
            parsed = parse_structured(raw)
            history.append({"role": "user", "content": query})
            history.append({"role": "assistant", "content": parsed["answer"][:2000]})
            _save_history(session_id, history)
            yield f"data: {_json.dumps({'type': 'done', 'answer': parsed['answer'], 'reasoning': parsed['reasoning'], 'confidence': parsed['confidence'], 'citations': citations, 'sources': names, 'session_id': session_id})}\n\n"
        except Exception as e:
            yield f"data: {_json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    print(
        f"Local RAG on :{PORT} | model={LLM_PATH} | "
        f"n_gpu_layers={os.getenv('LOCAL_LLM_N_GPU_LAYERS', '33')}"
    )
    uvicorn.run(app, host="0.0.0.0", port=PORT)
