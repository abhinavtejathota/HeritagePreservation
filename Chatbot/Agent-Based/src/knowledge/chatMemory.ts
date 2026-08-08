/**
 * In-memory chat context window for Agent-Based sessions.
 * Keeps recent user/assistant turns for Mini-LM / polish continuity.
 */
export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type SessionState = {
  turns: ChatTurn[];
  updatedAt: number;
};

const MAX_TURNS = 8; // 4 user + 4 assistant
const TTL_MS = 60 * 60 * 1000;

const sessions = new Map<string, SessionState>();

function prune(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > TTL_MS) sessions.delete(id);
  }
}

export function getHistory(sessionId?: string | null): ChatTurn[] {
  if (!sessionId) return [];
  prune();
  return sessions.get(sessionId)?.turns?.slice() ?? [];
}

export function appendTurn(
  sessionId: string | undefined | null,
  role: "user" | "assistant",
  content: string
): ChatTurn[] {
  if (!sessionId || !content?.trim()) return getHistory(sessionId);
  prune();
  const prev = sessions.get(sessionId)?.turns ?? [];
  const next = [...prev, { role, content: content.trim() }].slice(-MAX_TURNS);
  sessions.set(sessionId, { turns: next, updatedAt: Date.now() });
  return next;
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}
