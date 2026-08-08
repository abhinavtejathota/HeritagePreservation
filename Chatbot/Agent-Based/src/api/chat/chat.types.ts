export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  query?: string;
  message?: string;
  session_id?: string;
  history?: ChatTurn[];
  messages?: ChatTurn[];
}

export interface ChatResponse {
  answer: string;
  confidence: number;
  agentsUsed: string[];
}
