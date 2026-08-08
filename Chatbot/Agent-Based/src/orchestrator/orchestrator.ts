/**
 * Thin proxy → Local RAG (Python, no cloud API keys).
 * Keeps POST /api/chat shape for any legacy callers.
 */
import { escalationGuard } from "../external/safety/escalation.guard";
import { SAFETY } from "../config/constants";
import { logger } from "../utils/logger";

const LOCAL_RAG_URL =
  process.env.LOCAL_RAG_URL || "http://localhost:8176";

export async function runRagReasoner(query: string) {
  const safety = escalationGuard(query);
  if (!safety.allowed) {
    return {
      answer: SAFETY.DEFAULT_BLOCK_MESSAGE,
      confidence: 0,
      agentsUsed: ["safety"],
      mode: "local-rag-proxy",
    };
  }

  try {
    const res = await fetch(`${LOCAL_RAG_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      throw new Error(`Local RAG HTTP ${res.status}`);
    }
    const data = await res.json();
    return { ...data, mode: data.mode || "local-rag" };
  } catch (err) {
    logger.error("Local RAG proxy failed", { err });
    return {
      answer:
        "Local RAG service is not running. Start `Chatbot/Local-RAG` with `python app.py` (after `python download_model.py`).",
      confidence: 0,
      agentsUsed: ["local-rag-proxy"],
      mode: "local-rag-proxy",
    };
  }
}

export async function runOrchestrator(query: string) {
  return runRagReasoner(query);
}
