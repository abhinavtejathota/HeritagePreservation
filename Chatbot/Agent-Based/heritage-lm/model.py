"""
Heritage Mini-LM: token embeddings + BiLSTM memory + causal Transformer.

Pipeline per token sequence:
  1) Token embedding + positional embedding
  2) Bidirectional LSTM memory (local bidirectional context within the window)
  3) N × blocks: LayerNorm → causal self-attention → residual
                 LayerNorm → feed-forward (GELU) → residual
  4) Final LayerNorm → tied LM head (token id logits)
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class MiniGPTConfig:
    vocab_size: int = 4000
    block_size: int = 384  # context window (tokens)
    n_layer: int = 4
    n_head: int = 4
    n_embd: int = 256
    dropout: float = 0.1
    # BiLSTM memory encoder (runs over the window before Transformer blocks)
    use_bilstm: bool = True
    lstm_layers: int = 1
    lstm_hidden: int = 128  # per direction; projected back to n_embd

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "MiniGPTConfig":
        defaults = asdict(cls())
        return cls(**{k: d.get(k, defaults[k]) for k in defaults.keys()})


class CausalSelfAttention(nn.Module):
    """Multi-head self-attention with causal mask (no future tokens)."""

    def __init__(self, cfg: MiniGPTConfig):
        super().__init__()
        assert cfg.n_embd % cfg.n_head == 0
        self.n_head = cfg.n_head
        self.head_dim = cfg.n_embd // cfg.n_head
        self.qkv = nn.Linear(cfg.n_embd, 3 * cfg.n_embd)
        self.proj = nn.Linear(cfg.n_embd, cfg.n_embd)
        self.dropout = nn.Dropout(cfg.dropout)
        mask = torch.tril(torch.ones(cfg.block_size, cfg.block_size))
        self.register_buffer("mask", mask.view(1, 1, cfg.block_size, cfg.block_size))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, C = x.shape
        qkv = self.qkv(x)
        q, k, v = qkv.split(C, dim=-1)
        q = q.view(B, T, self.n_head, self.head_dim).transpose(1, 2)
        k = k.view(B, T, self.n_head, self.head_dim).transpose(1, 2)
        v = v.view(B, T, self.n_head, self.head_dim).transpose(1, 2)
        att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(self.head_dim))
        att = att.masked_fill(self.mask[:, :, :T, :T] == 0, float("-inf"))
        att = F.softmax(att, dim=-1)
        att = self.dropout(att)
        y = att @ v
        y = y.transpose(1, 2).contiguous().view(B, T, C)
        return self.dropout(self.proj(y))


class FeedForward(nn.Module):
    def __init__(self, cfg: MiniGPTConfig):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(cfg.n_embd, 4 * cfg.n_embd),
            nn.GELU(),
            nn.Linear(4 * cfg.n_embd, cfg.n_embd),
            nn.Dropout(cfg.dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class Block(nn.Module):
    def __init__(self, cfg: MiniGPTConfig):
        super().__init__()
        self.ln1 = nn.LayerNorm(cfg.n_embd)
        self.attn = CausalSelfAttention(cfg)
        self.ln2 = nn.LayerNorm(cfg.n_embd)
        self.ff = FeedForward(cfg)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.attn(self.ln1(x))
        x = x + self.ff(self.ln2(x))
        return x


class BiLSTMMemory(nn.Module):
    """
    Bidirectional LSTM over the token window — captures left+right local context
    before causal Transformer layers refine next-token prediction.
    """

    def __init__(self, cfg: MiniGPTConfig):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=cfg.n_embd,
            hidden_size=cfg.lstm_hidden,
            num_layers=cfg.lstm_layers,
            batch_first=True,
            bidirectional=True,
            dropout=cfg.dropout if cfg.lstm_layers > 1 else 0.0,
        )
        self.proj = nn.Linear(2 * cfg.lstm_hidden, cfg.n_embd)
        self.ln = nn.LayerNorm(cfg.n_embd)
        self.drop = nn.Dropout(cfg.dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, C)
        h, _ = self.lstm(x)
        h = self.proj(h)
        return self.ln(x + self.drop(h))  # residual + normalize


class MiniGPT(nn.Module):
    def __init__(self, cfg: MiniGPTConfig):
        super().__init__()
        self.cfg = cfg
        # --- token + position embeddings ---
        self.tok_emb = nn.Embedding(cfg.vocab_size, cfg.n_embd)
        self.pos_emb = nn.Embedding(cfg.block_size, cfg.n_embd)
        self.drop = nn.Dropout(cfg.dropout)
        # --- BiLSTM memory context ---
        self.memory = BiLSTMMemory(cfg) if cfg.use_bilstm else None
        # --- Transformer stack ---
        self.blocks = nn.ModuleList([Block(cfg) for _ in range(cfg.n_layer)])
        self.ln_f = nn.LayerNorm(cfg.n_embd)
        self.head = nn.Linear(cfg.n_embd, cfg.vocab_size, bias=False)
        self.head.weight = self.tok_emb.weight  # weight tying
        self.apply(self._init)

    def _init(self, module: nn.Module) -> None:
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, idx: torch.Tensor, targets: torch.Tensor | None = None):
        B, T = idx.shape
        if T > self.cfg.block_size:
            raise ValueError(
                f"Sequence length {T} exceeds context window {self.cfg.block_size}"
            )
        pos = torch.arange(0, T, device=idx.device)
        x = self.drop(self.tok_emb(idx) + self.pos_emb(pos))
        if self.memory is not None:
            x = self.memory(x)
        for block in self.blocks:
            x = block(x)
        x = self.ln_f(x)
        logits = self.head(x)
        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                targets.view(-1),
                ignore_index=-100,
            )
        return logits, loss

    @torch.no_grad()
    def generate(
        self,
        idx: torch.Tensor,
        max_new_tokens: int = 80,
        temperature: float = 0.8,
        top_k: int = 40,
        eos_id: int | None = None,
        repetition_penalty: float = 1.15,
    ) -> torch.Tensor:
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -self.cfg.block_size :]
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :]
            # Discourage repeating tokens already in the prompt/generation
            if repetition_penalty and repetition_penalty != 1.0:
                for tid in set(idx_cond[0].tolist()):
                    logits[0, tid] /= repetition_penalty
            logits = logits / max(temperature, 1e-5)
            if top_k is not None and top_k > 0:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = -float("inf")
            probs = F.softmax(logits, dim=-1)
            next_id = torch.multinomial(probs, num_samples=1)
            idx = torch.cat([idx, next_id], dim=1)
            if eos_id is not None and int(next_id.item()) == eos_id:
                break
        return idx
