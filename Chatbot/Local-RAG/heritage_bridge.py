"""Optional bridge: Local-RAG can call Heritage Mini-LM before GGUF."""
from __future__ import annotations

import os
import sys
from pathlib import Path

_HERITAGE = (
    Path(__file__).resolve().parents[1] / "Agent-Based" / "heritage-lm"
)


def try_heritage_answer(question: str) -> str | None:
    if os.getenv("USE_HERITAGE_LM", "0") not in ("1", "true", "True"):
        # Auto-use if checkpoint exists
        ckpt = _HERITAGE / "checkpoints" / "heritage_minigpt.pt"
        if not ckpt.exists():
            return None
    if str(_HERITAGE) not in sys.path:
        sys.path.insert(0, str(_HERITAGE))
    try:
        from infer import answer_heritage

        out = answer_heritage(question)
        if out.get("ok") and out.get("answer"):
            return str(out["answer"])
    except Exception as e:
        print(f"[heritage-lm] skip: {e}")
    return None
