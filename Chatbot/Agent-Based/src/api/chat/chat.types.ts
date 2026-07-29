export interface ChatRequest {
  query?: string;
  message?: string;
}

export interface ChatResponse {
  answer: string;
  confidence: number;
  agentsUsed: string[];
}
