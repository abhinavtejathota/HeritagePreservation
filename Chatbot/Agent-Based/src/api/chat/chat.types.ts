export interface ChatRequest {
  query: string;
}

export interface ChatResponse {
  answer: string;
  confidence: number;
  agentsUsed: string[];
}
