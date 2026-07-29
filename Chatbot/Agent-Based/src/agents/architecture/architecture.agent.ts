import { BaseAgent } from "../base/BaseAgent";
import { AgentResult } from "../base/AgentResult";
import { HeritageRepository } from "../../knowledge/repositories/heritage.repository";
import { reasonArchitecture } from "./architecture.reasoning";
import { architectureConfidence } from "./architecture.confidence";

export class ArchitectureAgent extends BaseAgent {
  agentName = "ArchitectureAgent";

  supportedFields = [
    "architectureStyle",
    "material"
  ];

  private repo = new HeritageRepository();

  async execute(monumentName: string): Promise<AgentResult> {
    const site = await this.repo.findByName(monumentName);

    if (!site) {
      return this.buildResult(
        "No architectural information found.",
        0.3
      );
    }

    const content = reasonArchitecture(
      site.architectureStyle,
      site.material
    );

    const confidence = architectureConfidence(
      site.architectureStyle,
      site.material
    );

    return this.buildResult(content, confidence);
  }
}
