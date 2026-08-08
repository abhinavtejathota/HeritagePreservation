/**
 * Dense + hybrid retrieval helper for the RAG reasoner.
 * Calls Clustering service `/api/rag-context`.
 */
const CLUSTERING_URL =
  process.env.CLUSTERING_URL || "http://localhost:8177";

export type RagContext = {
  name: string;
  score: number;
  document: string;
  aspect?: string;
  dense_score?: number;
};

export async function fetchRagContexts(
  query: string,
  topK = 5
): Promise<RagContext[]> {
  try {
    const res = await fetch(`${CLUSTERING_URL}/api/rag-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: topK, hybrid: true }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { contexts?: RagContext[] };
    return data.contexts || [];
  } catch (err) {
    console.warn("[RAG] Clustering retrieval unavailable:", err);
    return [];
  }
}

export function formatRagBlock(contexts: RagContext[]): string {
  if (!contexts.length) return "";
  const lines = contexts.map((c, i) => {
    const aspect = c.aspect ? ` / ${c.aspect}` : "";
    return `[${i + 1}] ${c.name}${aspect} (score=${c.score.toFixed(3)}):\n${c.document}`;
  });
  return lines.join("\n\n");
}
