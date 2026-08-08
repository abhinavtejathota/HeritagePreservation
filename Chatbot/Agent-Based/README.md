# Agent-Based — **the** PineAI chat layer (TypeScript)

Frontend talks **only** to this service (`:8180`). TypeScript is intentional — it is the app chat orchestrator.

## What lives here

| Piece | Path | Role |
|--------|------|------|
| HTTP chat API | `src/` | `POST /api/chat`, `/api/chat/stream` |
| Hybrid retrieve | `src/knowledge/ragRetriever.ts` | Clustering `:8177` |
| Extractive RAG | `src/knowledge/extractiveAnswer.ts` | Grounded answers in code |
| Heritage Mini-LM | `heritage-lm/` | BPE + MiniGPT train/infer (called by Agent via Python) |
| Optional cloud polish | `src/external/llm/` | Gemini/Groq if keys set |
| Last fallback | Local-RAG `:8176` | Pretrained GGUF — **not** the UI entrypoint |

There is **no** separate `Chatbot/Heritage-LM` folder anymore — the mini LM is under this package.

## Run

```bash
cd Chatbot/Agent-Based
cp .env.example .env   # PORT=8180
npm install && npm run build && npm start
```

Train the bundled mini LM (once):

```bash
python heritage-lm/prepare_corpus.py
python heritage-lm/prepare_corpus.py --online   # optional Wiki extracts
python heritage-lm/train.py --epochs 8
```

Frontend:

```
REACT_APP_CHA_URL=http://localhost:8180/api
```

## Pipeline

1. Safety  
2. Clustering hybrid retrieve  
3. Extractive grounded answer  
4. Optional cloud polish  
5. `heritage-lm` MiniGPT (subprocess)  
6. Local-RAG GGUF if still needed  

## Endpoints

- `GET /api/health`
- `POST /api/chat`
- `POST /api/chat/stream`
