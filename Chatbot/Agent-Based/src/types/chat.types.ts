export interface ChatRequestBody {
  query: string;
}

export interface ChatResponse {
  answer: string;
  confidence: number;
  agentsUsed: string[];
}
