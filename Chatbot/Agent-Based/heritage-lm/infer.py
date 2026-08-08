"""
Inference for Heritage Mini-LM with a chat context window.

Accepts a single question, or multi-turn history truncated to the model's
block_size (context window).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch

from model import MiniGPT, MiniGPTConfig
from tokenizer import HeritageBPE

HERE = Path(__file__).resolve().parent
CKPT = HERE / "checkpoints" / "heritage_minigpt.pt"
TOK = HERE / "checkpoints" / "tokenizer.json"

_bundle = None


def load_bundle(device: str | None = None):
    global _bundle
    if _bundle is not None:
        return _bundle
    if not CKPT.exists() or not TOK.exists():
        raise FileNotFoundError(f"Missing checkpoint. Run train.py first ({CKPT})")
    dev = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    tok = HeritageBPE.load(TOK)
    payload = torch.load(CKPT, map_location=dev, weights_only=False)
    cfg = MiniGPTConfig.from_dict(payload["config"])
    model = MiniGPT(cfg).to(dev)
    model.load_state_dict(payload["model"])
    model.eval()
    _bundle = {
        "model": model,
        "tok": tok,
        "device": dev,
        "meta": payload.get("meta", {}),
        "cfg": cfg,
    }
    return _bundle


def build_prompt(
    question: str,
    history: list[dict] | None = None,
    max_history_turns: int = 4,
) -> str:
    """
    history items: {"role": "user"|"assistant", "content": "..."}
    or {"q": "...", "a": "..."}.
    """
    parts: list[str] = []
    if history:
        turns = history[-max_history_turns:]
        for t in turns:
            if "q" in t or "a" in t:
                if t.get("q"):
                    parts.append(f"Question: {t['q'].strip()} Answer: {t.get('a', '').strip()}")
            else:
                role = (t.get("role") or "").lower()
                content = (t.get("content") or "").strip()
                if not content:
                    continue
                if role in ("user", "human"):
                    parts.append(f"Question: {content}")
                elif role in ("assistant", "bot", "ai"):
                    # complete previous Question line if needed
                    if parts and parts[-1].startswith("Question:") and " Answer:" not in parts[-1]:
                        parts[-1] = parts[-1] + f" Answer: {content}"
                    else:
                        parts.append(f"Answer: {content}")
    parts.append(f"Question: {question.strip()} Answer:")
    return " ".join(parts)


def truncate_ids_to_context(ids: list[int], block_size: int, keep_tail: bool = True) -> list[int]:
    """Fit prompt into the model context window (leave room for generation)."""
    # leave ~25% of window for new tokens conceptually; still feed up to block_size-1
    max_prompt = max(32, block_size - 1)
    if len(ids) <= max_prompt:
        return ids
    if keep_tail:
        return ids[-max_prompt:]
    return ids[:max_prompt]


def generate(
    prompt: str,
    max_new_tokens: int = 100,
    temperature: float = 0.45,
    top_k: int = 25,
) -> str:
    b = load_bundle()
    model, tok, device, cfg = b["model"], b["tok"], b["device"], b["cfg"]
    ids = tok.encode(prompt, add_special=True)
    if ids and ids[-1] == tok.eos_id:
        ids = ids[:-1]
    ids = truncate_ids_to_context(ids, cfg.block_size)
    idx = torch.tensor([ids], dtype=torch.long, device=device)
    out = model.generate(
        idx,
        max_new_tokens=max_new_tokens,
        temperature=temperature,
        top_k=top_k,
        eos_id=tok.eos_id,
        repetition_penalty=1.2,
    )
    gen_ids = out[0].tolist()
    return tok.decode(gen_ids[len(ids) :])


def answer_heritage(
    question: str,
    max_new_tokens: int = 120,
    history: list[dict] | None = None,
) -> dict:
    prompt = build_prompt(question, history=history)
    try:
        b = load_bundle()
        completion = generate(prompt, max_new_tokens=max_new_tokens)
    except FileNotFoundError as e:
        return {
            "ok": False,
            "error": str(e),
            "answer": None,
            "backend": "heritage-minigpt",
        }
    answer = completion.strip()
    for stop in ("Question:", "User:", "\n\n"):
        if stop in answer:
            answer = answer.split(stop)[0].strip()
    cfg = b["cfg"]
    return {
        "ok": True,
        "answer": answer or "(empty generation)",
        "backend": "heritage-minigpt",
        "prompt": prompt[:500],
        "context_window": cfg.block_size,
        "architecture": b["meta"].get("architecture"),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("-q", "--query", default=None)
    ap.add_argument("--tokens", type=int, default=100)
    ap.add_argument(
        "--history-json",
        default=None,
        help='JSON list of turns, e.g. [{"role":"user","content":"..."},{"role":"assistant","content":"..."}]',
    )
    ap.add_argument(
        "--json-in",
        action="store_true",
        help="Read {\"query\",\"history\"} JSON from stdin (used by Agent-Based).",
    )
    args = ap.parse_args()

    history = None
    query = args.query
    if args.json_in:
        payload = json.load(sys.stdin)
        query = payload.get("query") or payload.get("message") or ""
        history = payload.get("history") or payload.get("messages")
    elif args.history_json:
        history = json.loads(args.history_json)

    if not query or not str(query).strip():
        print("Missing query", file=sys.stderr)
        sys.exit(1)

    out = answer_heritage(str(query), max_new_tokens=args.tokens, history=history)
    if args.json_in:
        print(json.dumps(out, ensure_ascii=False))
    else:
        print(out.get("answer") or out.get("error"))


if __name__ == "__main__":
    main()
