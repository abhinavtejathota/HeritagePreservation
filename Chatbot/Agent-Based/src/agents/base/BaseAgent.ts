import { AgentResult } from "./AgentResult";

export abstract class BaseAgent {
  abstract agentName: string;
  abstract supportedFields: string[];

  abstract execute(
    monumentName: string
  ): Promise<AgentResult>;

  protected buildResult(
    content: string,
    confidence: number,
    source: "database" | "llm" = "database"
  ): AgentResult {
    return {
      agentName: this.agentName,
      fields: this.supportedFields,
      content,
      confidence,
      source
    };
  }
}
