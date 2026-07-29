export interface AgentResult {
  agentName: string;
  fields: string[];        //what fields this agent answered
  content: string;         //natural language output
  confidence: number;      //0 → 1
  source: "database" | "llm";
}
