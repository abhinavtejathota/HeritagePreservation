/**
 * Extractive grounded answer — no LLM required.
 * Uses retrieved heritage chunks from Clustering hybrid RAG index
 * (CLIP / dense + sparse — the project’s fine-tuned retrieval stack).
 *
 * Paper framing: contribution is retrieve-then-ground, not “we fine-tuned a chat LLM.”
 */
import type { RagContext } from "../knowledge/ragRetriever";

export type ExtractiveResult = {
  answer: string;
  reasoning: string;
  confidence: number;
  citations: Array<{
    name: string;
    aspect?: string;
    score: number;
    snippet: string;
  }>;
  sources: string[];
};

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "are",
  "was",
  "were",
  "what",
  "where",
  "when",
  "which",
  "who",
  "how",
  "about",
  "tell",
  "please",
  "with",
  "from",
  "that",
  "this",
  "have",
  "has",
  "into",
  "your",
  "you",
]);

function scoreSentence(sentence: string, terms: string[]): number {
  const s = sentence.toLowerCase();
  if (s.length < 40) return 0;
  let hit = 0;
  for (const t of terms) {
    if (s.includes(t)) hit += 1;
  }
  // Prefer denser overlap
  return hit + Math.min(sentence.length, 400) / 2000;
}

function pickSnippets(doc: string, terms: string[], max = 2): string[] {
  const raw = String(doc || "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return [];
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!sentences.length) return [raw.slice(0, 320)];

  const ranked = sentences
    .map((sent) => ({ sent, sc: scoreSentence(sent, terms) }))
    .sort((a, b) => b.sc - a.sc);

  const out: string[] = [];
  for (const r of ranked) {
    if (out.length >= max) break;
    if (r.sc <= 0 && out.length > 0) continue;
    const snippet = r.sent.length > 360 ? `${r.sent.slice(0, 357)}…` : r.sent;
    if (!out.includes(snippet)) out.push(snippet);
  }
  if (!out.length) {
    out.push(raw.slice(0, 320) + (raw.length > 320 ? "…" : ""));
  }
  return out;
}

/**
 * Build a citation-backed answer from hybrid RAG contexts.
 */
export function buildExtractiveAnswer(
  query: string,
  contexts: RagContext[]
): ExtractiveResult | null {
  if (!contexts.length) return null;

  const terms = tokenize(query);
  const top = contexts.slice(0, 5);
  const citations = top.map((c) => {
    const snippets = pickSnippets(c.document, terms, 2);
    return {
      name: c.name,
      aspect: c.aspect,
      score: Number(c.score) || 0,
      snippet: snippets[0] || "",
    };
  });

  const lead = citations[0];
  if (!lead) return null;
  const others = citations.slice(1).filter((c) => c.snippet);

  const parts: string[] = [];
  parts.push(
    `Based on the heritage archive (hybrid retrieval), the closest match is **${lead.name}**` +
      (lead.aspect ? ` (${lead.aspect})` : "") +
      "."
  );
  if (lead.snippet) {
    parts.push(lead.snippet);
  }
  if (others.length) {
    parts.push("Related places in the archive:");
    for (const o of others.slice(0, 3)) {
      parts.push(
        `• **${o.name}**` +
          (o.aspect ? ` — ${o.aspect}` : "") +
          (o.snippet ? `: ${o.snippet}` : "")
      );
    }
  }
  parts.push(
    "_Answer assembled from retrieved site passages (extractive RAG). No chat-model fine-tune required for this mode._"
  );

  const avgScore =
    top.reduce((s, c) => s + (Number(c.score) || 0), 0) / Math.max(top.length, 1);
  // Map retrieval score into a soft confidence; keep honest (not 1.0)
  const confidence = Math.max(0.35, Math.min(0.92, 0.45 + avgScore * 0.4));

  const reasoning = [
    "1. Query embedded / matched against the hybrid heritage index (dense + sparse).",
    `2. Top-${top.length} passages retrieved from Clustering \`/api/rag-context\`.`,
    "3. Sentences selected by lexical overlap with the question (extractive grounding).",
    "4. Response cites site names + aspects; generation LLM is optional polish / offline fallback only.",
  ].join("\n");

  return {
    answer: parts.join("\n\n"),
    reasoning,
    confidence: Number(confidence.toFixed(3)),
    citations: citations.map((c) => {
      const row: {
        name: string;
        aspect?: string;
        score: number;
        snippet: string;
      } = {
        name: c.name,
        score: c.score,
        snippet: c.snippet,
      };
      if (c.aspect) row.aspect = c.aspect;
      return row;
    }),
    sources: [...new Set(citations.map((c) => c.name))],
  };
}
