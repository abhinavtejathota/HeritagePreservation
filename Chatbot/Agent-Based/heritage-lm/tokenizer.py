"""
Minimal BPE tokenizer trained on the heritage corpus (implemented in-repo).
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Iterable

SPECIAL = ["<pad>", "<unk>", "<bos>", "<eos>"]


class HeritageBPE:
    def __init__(
        self,
        vocab: dict[str, int] | None = None,
        merges: list[tuple[str, str]] | None = None,
    ):
        self.vocab = vocab or {t: i for i, t in enumerate(SPECIAL)}
        self.id_to_token = {i: t for t, i in self.vocab.items()}
        self.merges = merges or []
        self._merge_ranks = {pair: i for i, pair in enumerate(self.merges)}

    @property
    def pad_id(self) -> int:
        return self.vocab["<pad>"]

    @property
    def bos_id(self) -> int:
        return self.vocab["<bos>"]

    @property
    def eos_id(self) -> int:
        return self.vocab["<eos>"]

    @property
    def unk_id(self) -> int:
        return self.vocab["<unk>"]

    def _word_to_chars(self, word: str) -> list[str]:
        return list(word) + ["</w>"]

    def _get_pairs(self, symbols: list[str]) -> set[tuple[str, str]]:
        return {(symbols[i], symbols[i + 1]) for i in range(len(symbols) - 1)}

    def _apply_merges(self, symbols: list[str]) -> list[str]:
        if len(symbols) < 2 or not self._merge_ranks:
            return symbols
        while True:
            pairs = self._get_pairs(symbols)
            if not pairs:
                break
            ranked = [
                (self._merge_ranks[p], p) for p in pairs if p in self._merge_ranks
            ]
            if not ranked:
                break
            _, best = min(ranked, key=lambda x: x[0])
            a, b = best
            new: list[str] = []
            i = 0
            while i < len(symbols):
                if i < len(symbols) - 1 and symbols[i] == a and symbols[i + 1] == b:
                    new.append(a + b)
                    i += 2
                else:
                    new.append(symbols[i])
                    i += 1
            symbols = new
        return symbols

    def encode(self, text: str, add_special: bool = True) -> list[int]:
        text = re.sub(r"\s+", " ", (text or "").strip())
        ids: list[int] = []
        if add_special:
            ids.append(self.bos_id)
        for word in text.split(" "):
            if not word:
                continue
            symbols = self._apply_merges(self._word_to_chars(word))
            for s in symbols:
                ids.append(self.vocab.get(s, self.unk_id))
        if add_special:
            ids.append(self.eos_id)
        return ids

    def decode(self, ids: Iterable[int]) -> str:
        toks = []
        for i in ids:
            t = self.id_to_token.get(int(i), "<unk>")
            if t in SPECIAL:
                continue
            toks.append(t)
        text = "".join(toks).replace("</w>", " ")
        return re.sub(r"\s+", " ", text).strip()

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {"vocab": self.vocab, "merges": [list(m) for m in self.merges]},
                indent=2,
            ),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path) -> "HeritageBPE":
        data = json.loads(path.read_text(encoding="utf-8"))
        merges = [tuple(m) for m in data.get("merges", [])]
        return cls(vocab=data["vocab"], merges=merges)


def train_bpe(texts: list[str], vocab_size: int = 4000, max_merges: int = 3500) -> HeritageBPE:
    """Train BPE from whitespace-split words."""
    word_freq: Counter[str] = Counter()
    for text in texts:
        for w in re.sub(r"\s+", " ", text.strip()).split(" "):
            if w:
                word_freq[w] += 1

    # Start with character vocabulary
    vocab: dict[str, int] = {t: i for i, t in enumerate(SPECIAL)}
    alphabet = set()
    splits: dict[str, list[str]] = {}
    for w, _ in word_freq.items():
        chs = list(w) + ["</w>"]
        splits[w] = chs
        alphabet.update(chs)
    for ch in sorted(alphabet):
        if ch not in vocab:
            vocab[ch] = len(vocab)

    merges: list[tuple[str, str]] = []

    def pair_stats() -> Counter[tuple[str, str]]:
        stats: Counter[tuple[str, str]] = Counter()
        for w, freq in word_freq.items():
            sym = splits[w]
            for i in range(len(sym) - 1):
                stats[(sym[i], sym[i + 1])] += freq
        return stats

    target_merges = min(max_merges, max(0, vocab_size - len(vocab)))
    for _ in range(target_merges):
        stats = pair_stats()
        if not stats:
            break
        best, _ = stats.most_common(1)[0]
        a, b = best
        merges.append(best)
        merged = a + b
        if merged not in vocab:
            vocab[merged] = len(vocab)
        # Apply merge to all splits
        for w in list(splits.keys()):
            sym = splits[w]
            new: list[str] = []
            i = 0
            while i < len(sym):
                if i < len(sym) - 1 and sym[i] == a and sym[i + 1] == b:
                    new.append(merged)
                    i += 2
                else:
                    new.append(sym[i])
                    i += 1
            splits[w] = new

    return HeritageBPE(vocab=vocab, merges=merges)
