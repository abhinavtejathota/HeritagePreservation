# Agent-Based (legacy / optional)

**Primary chatbot is [`../Local-RAG`](../Local-RAG)** — local GGUF, no cloud API keys, port **8176**.

This package may act as a thin proxy or older Gemini/Groq path. Prefer Local-RAG for demos and papers.

```bash
# Recommended
cd Chatbot/Local-RAG && python app.py
```

Cloud fallback (needs keys): use `python scripts/start_all.py --with-api-fallback` for Api-Based, not this folder by default.
