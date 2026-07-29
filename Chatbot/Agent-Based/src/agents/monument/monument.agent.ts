import { BaseAgent } from "../base/BaseAgent";
import { AgentResult } from "../base/AgentResult";
import { HeritageRepository } from "../../knowledge/repositories/heritage.repository";
import { reasonMonument } from "./monument.reasoning";
import { monumentConfidence } from "./monument.confidence";
import { smartTruncate } from "../../utils/smartTruncate";

export class MonumentAgent extends BaseAgent {
  agentName = "MonumentAgent";

  //to be used
  supportedFields = ["name", "description"];

  private repo = new HeritageRepository();

  async execute(monumentName: string): Promise<AgentResult> {
    const site = await this.repo.findByName(monumentName);
	const MONUMENT_SNIPPET_WORDS = 8;

    if (!site) {
      return this.buildResult(
        "No monument information found.",
        0.3
      );
    }

	const descriptionSnippet = smartTruncate(
      site.description,
      MONUMENT_SNIPPET_WORDS
    );
	
    const content = reasonMonument(
      site.name,
      descriptionSnippet
    );

    const confidence = monumentConfidence(
      site.name,
      site.description
    );

    return this.buildResult(
      content,
      confidence
    );
  }
}

