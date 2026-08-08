/**
 * Agent-Based chat pipeline (TypeScript) — THIS is the product chat layer.
 *
 *  1) Safety
 *  2) Hybrid retrieve (Clustering)
 *  3) Extractive grounded answer (code)
 *  4) Optional Gemini/Groq polish if keys
 *  5) Heritage Mini-LM (BiLSTM+Transformer) with session context window
 *  6) Local-RAG GGUF :8176 last-resort fallback
 */
import { escalationGuard } from "../external/safety/escalation.guard";
import { SAFETY } from "../config/constants";
import { logger } from "../utils/logger";
import { fetchRagContexts, formatRagBlock } from "../knowledge/ragRetriever";
import { buildExtractiveAnswer } from "../knowledge/extractiveAnswer";
import { runHeritageLm } from "../knowledge/heritageLm";
import { appendTurn, getHistory, type ChatTurn } from "../knowledge/chatMemory";
import { env } from "../config/env";

const LOCAL_RAG_URL = env.LOCAL_RAG_URL || "http://localhost:8176";

export type ChatResult = {
  answer: string;
  reasoning?: string;
  confidence: number;
  agentsUsed: string[];
  mode: string;
  backend?: string;
  citations?: unknown[];
  ragContexts?: unknown[];
  sources?: string[];
  latency_ms?: number;
  session_id?: string | undefined;
  retrieval?: {
    n_contexts: number;
    top_score: number | null;
  };
};

export type OrchestratorInput = {
  query: string;
  session_id?: string | undefined;
  history?: ChatTurn[] | undefined;
};

async function optionalLlmPolish(
  query: string,
  ragBlock: string,
  extractive: string,
  history: ChatTurn[]
): Promise<{ text: string; provider: string } | null> {
  if (!env.GOOGLE_API_KEY && !env.GROQ_API_KEY) return null;
  try {
    const { generateWithFallback } = await import("../external/llm/generate");
    const prior = history
      .slice(-4)
      .map((t) => `${t.role}: ${t.content}`)
      .join("\n");
    const system = `You are PineAI for a virtual heritage archive.
Use ONLY the retrieved passages. Do not invent sites or facts.
Write a clear, concise answer (120–220 words). Cite site names from the passages.
If passages are insufficient, say what is missing. Respect prior chat turns when relevant.`;
    const user = `${prior ? `Prior turns:\n${prior}\n\n` : ""}Question: ${query}\n\nRetrieved passages:\n${ragBlock}\n\nExtractive draft (may reuse):\n${extractive}`;
    const out = await generateWithFallback(system, user);
    return { text: out.text, provider: out.provider };
  } catch (err) {
    logger.warn("Optional LLM polish skipped", { err });
    return null;
  }
}

async function heritageLmFallback(
  query: string,
  history: ChatTurn[]
): Promise<ChatResult | null> {
  const out = await runHeritageLm(query, history);
  if (!out?.answer) return null;
  return {
    answer: out.answer,
    reasoning:
      "Heritage Mini-LM (BPE → token emb → BiLSTM memory → causal self-attention/FFN) with chat context window.",
    confidence: 0.55,
    agentsUsed: ["heritage-minigpt"],
    mode: "agent-heritage-minigpt",
    backend: out.backend,
    sources: [],
  };
}

async function localRagFallback(query: string): Promise<ChatResult | null> {
  try {
    const res = await fetch(`${LOCAL_RAG_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`Local RAG HTTP ${res.status}`);
    const data = await res.json();
    return {
      ...data,
      mode: data.mode || "local-rag-fallback",
      backend: data.backend || "local-gguf",
      agentsUsed: [
        ...(Array.isArray(data.agentsUsed) ? data.agentsUsed : []),
        "local-rag-fallback",
      ],
    };
  } catch (err) {
    logger.error("Local RAG fallback failed", { err });
    return null;
  }
}

export async function runRagReasoner(input: OrchestratorInput | string): Promise<ChatResult> {
  const t0 = Date.now();
  const query = typeof input === "string" ? input : input.query;
  const sessionId = typeof input === "string" ? undefined : input.session_id;
  const clientHistory = typeof input === "string" ? [] : input.history || [];
  const history =
    clientHistory.length > 0 ? clientHistory : getHistory(sessionId);

  const safety = escalationGuard(query);
  if (!safety.allowed) {
    return {
      answer: SAFETY.DEFAULT_BLOCK_MESSAGE,
      confidence: 0,
      agentsUsed: ["safety"],
      mode: "blocked",
      latency_ms: Date.now() - t0,
      session_id: sessionId,
    };
  }

  if (sessionId) appendTurn(sessionId, "user", query);

  const contexts = await fetchRagContexts(query, 6);
  const extractive = buildExtractiveAnswer(query, contexts);

  let result: ChatResult | null = null;

  if (extractive && contexts.length > 0) {
    const ragBlock = formatRagBlock(contexts);
    const polished = await optionalLlmPolish(
      query,
      ragBlock,
      extractive.answer,
      history
    );

    if (polished) {
      result = {
        answer: polished.text,
        reasoning: `${extractive.reasoning}\n5. Optional cloud LLM polish (${polished.provider}) with session context.`,
        confidence: Math.min(0.95, extractive.confidence + 0.05),
        agentsUsed: ["hybrid-retriever", "extractive-rag", `llm-${polished.provider}`],
        mode: "agent-hybrid-rag+llm",
        backend: "agent-extractive+cloud",
        citations: extractive.citations,
        ragContexts: contexts,
        sources: extractive.sources,
        latency_ms: Date.now() - t0,
        retrieval: {
          n_contexts: contexts.length,
          top_score: contexts[0]?.score ?? null,
        },
      };
    } else {
      result = {
        answer: extractive.answer,
        reasoning: extractive.reasoning,
        confidence: extractive.confidence,
        agentsUsed: ["hybrid-retriever", "extractive-rag"],
        mode: "agent-hybrid-rag",
        backend: "agent-extractive",
        citations: extractive.citations,
        ragContexts: contexts,
        sources: extractive.sources,
        latency_ms: Date.now() - t0,
        retrieval: {
          n_contexts: contexts.length,
          top_score: contexts[0]?.score ?? null,
        },
      };
    }
  }

  if (!result) {
    const heritage = await heritageLmFallback(query, history);
    if (heritage) {
      result = {
        ...heritage,
        latency_ms: Date.now() - t0,
        agentsUsed: ["hybrid-retriever-miss-or-empty", ...(heritage.agentsUsed || [])],
      };
    }
  }

  if (!result) {
    const fallback = await localRagFallback(query);
    if (fallback) {
      result = {
        ...fallback,
        latency_ms: fallback.latency_ms ?? Date.now() - t0,
        agentsUsed: [
          "hybrid-retriever-miss-or-empty",
          ...(fallback.agentsUsed || []),
        ],
        mode: fallback.mode?.includes("fallback")
          ? fallback.mode
          : "local-rag-fallback",
      };
    }
  }

  if (!result) {
    result = {
      answer:
        "Chat stack unavailable. Start Clustering (:8177) and Agent-Based (:8180). Optional: train Agent-Based/heritage-lm or start Local-RAG (:8176).",
      confidence: 0,
      agentsUsed: ["orchestrator"],
      mode: "unavailable",
      latency_ms: Date.now() - t0,
    };
  }

  if (sessionId && result.answer) {
    appendTurn(sessionId, "assistant", result.answer);
  }
  result.session_id = sessionId;
  return result;
}

export async function runOrchestrator(input: OrchestratorInput | string) {
  return runRagReasoner(input);
}
