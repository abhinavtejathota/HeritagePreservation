"""
Local LLM backends for Heritage RAG (no cloud API keys).

Defaults tuned for RTX 3050 4GB (override via Chatbot/Local-RAG/.env):
  LOCAL_LLM_N_GPU_LAYERS=33
  LOCAL_LLM_CTX=4096
  LOCAL_LLM_MAX_TOKENS=192
  LOCAL_LLM_N_BATCH=512
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

# Load Local-RAG/.env before reading defaults
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except Exception:
    pass

# Make CUDA DLLs visible before llama-cpp import (Windows + torch cuXXX wheels)
try:
    from cuda_path import add_cuda_dll_dirs

    _dlls = add_cuda_dll_dirs()
    if _dlls:
        print(f"[cuda] dll dirs: {_dlls[:3]}")
except Exception as _e:
    print(f"[cuda] path helper skipped: {_e}")

_llm = None
_backend: Optional[str] = None
_error: Optional[str] = None
_gpu_layers_used = 0

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
DEFAULT_GGUF = os.path.join(MODEL_DIR, "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf")
HF_MODEL = os.getenv("LOCAL_HF_MODEL", "Qwen/Qwen2.5-1.5B-Instruct")
GGUF_PATH = os.getenv("LOCAL_LLM_PATH", DEFAULT_GGUF)
N_CTX = int(os.getenv("LOCAL_LLM_CTX", "4096"))
N_THREADS = int(os.getenv("LOCAL_LLM_THREADS", str(max(4, (os.cpu_count() or 4) - 1))))
N_BATCH = int(os.getenv("LOCAL_LLM_N_BATCH", "512"))
DEFAULT_MAX_TOKENS = int(os.getenv("LOCAL_LLM_MAX_TOKENS", "192"))


def backend_name() -> str:
    return _backend or "none"


def gpu_layers_used() -> int:
    return _gpu_layers_used


def default_max_tokens() -> int:
    return DEFAULT_MAX_TOKENS


def _llama_supports_gpu() -> bool:
    try:
        from llama_cpp import llama_cpp as _C

        for name in (
            "ggml_backend_cuda_init",
            "llama_supports_gpu_offload",
            "ggml_cpu_has_cuda",
        ):
            if hasattr(_C, name):
                fn = getattr(_C, name)
                try:
                    return bool(fn() if callable(fn) else True)
                except Exception:
                    return True
    except Exception:
        pass
    try:
        import subprocess

        r = subprocess.run(
            ["nvidia-smi", "-L"], capture_output=True, text=True, timeout=5
        )
        return r.returncode == 0 and "GPU" in (r.stdout or "")
    except Exception:
        return False


def _resolve_n_gpu_layers() -> int:
    # Default 33 for 1.5B Q4 on 4GB when GPU present (no shell export needed)
    raw = os.getenv("LOCAL_LLM_N_GPU_LAYERS", "33").strip()
    if raw.lower() == "auto":
        return 33 if _llama_supports_gpu() else 0
    n = int(raw)
    if n < 0:
        return 99
    # If user set 33 but no GPU / CPU wheel, fall back quietly after failed load
    return n


def _try_llama_cpp():
    global _llm, _backend, _gpu_layers_used
    if not os.path.exists(GGUF_PATH):
        return False
    try:
        from llama_cpp import Llama

        n_gpu = _resolve_n_gpu_layers()
        print(
            f"[llm] loading GGUF n_gpu_layers={n_gpu} n_ctx={N_CTX} "
            f"n_batch={N_BATCH} path={GGUF_PATH}"
        )
        kwargs = dict(
            model_path=GGUF_PATH,
            n_ctx=N_CTX,
            n_threads=N_THREADS,
            n_gpu_layers=n_gpu,
            n_batch=N_BATCH,
            verbose=False,
        )
        try:
            _llm = Llama(**kwargs)
        except Exception:
            if n_gpu > 0:
                print("[llm] GPU load failed — retrying CPU (n_gpu_layers=0)")
                kwargs["n_gpu_layers"] = 0
                n_gpu = 0
                _llm = Llama(**kwargs)
            else:
                raise
        _gpu_layers_used = n_gpu
        _backend = "llama-cpp-gguf-gpu" if n_gpu > 0 else "llama-cpp-gguf-cpu"
        print(f"[llm] ready backend={_backend}")
        return True
    except Exception as e:
        print(f"[llm] llama-cpp unavailable: {e}")
        return False


def _try_transformers():
    global _llm, _backend, _gpu_layers_used
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        print(f"[llm] loading transformers {HF_MODEL} on {device}…")
        tok = AutoTokenizer.from_pretrained(HF_MODEL, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            HF_MODEL,
            dtype=dtype,
            device_map="auto" if device == "cuda" else None,
            trust_remote_code=True,
            low_cpu_mem_usage=True,
        )
        if device == "cpu":
            model = model.to(device)
        model.eval()
        _llm = (tok, model, device)
        _backend = f"transformers-{device}"
        _gpu_layers_used = -1 if device == "cuda" else 0
        print(f"[llm] transformers ready on {device}")
        return True
    except Exception as e:
        print(f"[llm] transformers unavailable: {e}")
        return False


def ensure_llm():
    global _error
    if _llm is not None:
        return _llm
    if os.path.exists(GGUF_PATH) and _try_llama_cpp():
        return _llm
    if _try_transformers():
        return _llm
    _error = (
        "No local LLM backend. See SETUP.md — run scripts/install_gpu_llm.ps1 "
        "and Chatbot/Local-RAG/download_model.py"
    )
    raise RuntimeError(_error)


def warmup():
    """Cheap completion so first user query is not cold-start slow."""
    ensure_llm()
    try:
        generate(
            "Reply with ANSWER: ok",
            "Say ANSWER: ok\nCONFIDENCE: 1.0",
            max_tokens=8,
        )
        print("[llm] warmup complete")
    except Exception as e:
        print(f"[llm] warmup skipped: {e}")


def generate(
    system_prompt: str,
    user_prompt: str,
    max_tokens: Optional[int] = None,
    history: Optional[list[dict]] = None,
) -> str:
    """
    history: optional list of {role: user|assistant, content: str} for multi-turn.
    """
    if max_tokens is None:
        max_tokens = DEFAULT_MAX_TOKENS
    ensure_llm()
    messages = _build_messages(system_prompt, user_prompt, history)

    if _backend and _backend.startswith("llama-cpp"):
        out = _llm.create_chat_completion(
            messages=messages,
            temperature=0.15,
            max_tokens=max_tokens,
            top_p=0.9,
        )
        return out["choices"][0]["message"]["content"].strip()

    import torch

    tok, model, device = _llm
    if hasattr(tok, "apply_chat_template"):
        text = tok.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
    else:
        text = "\n".join(f"{m['role']}: {m['content']}" for m in messages)

    inputs = tok(text, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        out_ids = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            do_sample=False,
            pad_token_id=tok.eos_token_id,
        )
    gen = out_ids[0][inputs["input_ids"].shape[1] :]
    return tok.decode(gen, skip_special_tokens=True).strip()


def _build_messages(system_prompt, user_prompt, history):
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for h in history[-6:]:
            role = h.get("role", "user")
            if role not in ("user", "assistant", "system"):
                role = "user"
            messages.append({"role": role, "content": str(h.get("content", ""))[:800]})
    messages.append({"role": "user", "content": user_prompt})
    return messages


def generate_stream(
    system_prompt: str,
    user_prompt: str,
    max_tokens: Optional[int] = None,
    history: Optional[list[dict]] = None,
):
    """Yield text deltas (llama-cpp stream) or one-shot full text."""
    if max_tokens is None:
        max_tokens = DEFAULT_MAX_TOKENS
    ensure_llm()
    messages = _build_messages(system_prompt, user_prompt, history)

    if _backend and _backend.startswith("llama-cpp"):
        stream = _llm.create_chat_completion(
            messages=messages,
            temperature=0.15,
            max_tokens=max_tokens,
            top_p=0.9,
            stream=True,
        )
        for chunk in stream:
            delta = chunk["choices"][0].get("delta") or {}
            content = delta.get("content") or ""
            if content:
                yield content
        return

    # transformers / fallback: chunk the full answer for perceived streaming
    full = generate(system_prompt, user_prompt, max_tokens=max_tokens, history=history)
    step = max(8, len(full) // 24)
    for i in range(0, len(full), step):
        yield full[i : i + step]
