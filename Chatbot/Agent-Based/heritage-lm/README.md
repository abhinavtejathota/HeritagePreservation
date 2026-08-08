# Heritage Mini-LM (bundled under Agent-Based)

Owned by **Agent-Based** — not a separate chatbot product.

## Architecture

1. **BPE tokenizer** — text ↔ token IDs (`tokenizer.py`)
2. **Token + positional embeddings**
3. **BiLSTM memory** — bidirectional context inside the window
4. **Causal Transformer blocks** — self-attention, feed-forward (GELU), LayerNorm
5. **Context window** — `block_size` tokens (default 384); chat history truncated to fit

## Data (49 sites only)

```bash
# from Chatbot/Agent-Based
python heritage-lm/prepare_corpus.py --online
# → data/online_training.csv   (full dossier + Wikipedia rows, relevance-filtered)
# → data/qa_training.csv       (built at train time — short QA for the tiny LM)
# → data/corpus.txt
```

Wikipedia extracts are cached under `data/wiki_cache/` (CC BY-SA). Irrelevant alias hits are dropped.

## Train / infer

```bash
python heritage-lm/train.py --epochs 35
python heritage-lm/infer.py -q "Tell me about Ajanta Caves"
```

Architecture: BPE → token+pos embeddings → **BiLSTM memory** → causal **self-attention** + **FFN** + **LayerNorm** → LM head. Context window = `block_size` (default 192–384).

Agent passes session history into `infer.py --json-in` for multi-turn context.
