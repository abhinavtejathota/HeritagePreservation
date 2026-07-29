import { BaseAgent } from "../base/BaseAgent";
import { AgentResult } from "../base/AgentResult";
import { HeritageRepository } from "../../knowledge/repositories/heritage.repository";
import { reasonCivilization } from "./civilization.reasoning";
import { civilizationConfidence } from "./civilization.confidence";

export class CivilizationAgent extends BaseAgent {
  agentName = "CivilizationAgent";

  supportedFields = [
    "civilization",
    "religion"
  ];

  private repo = new HeritageRepository();

  async execute(monumentName: string): Promise<AgentResult> {
    const site = await this.repo.findByName(monumentName);

    if (!site) {
      return this.buildResult(
        "No civilization or religious information found.",
        0.3
      );
    }

    const content = reasonCivilization(
      site.civilization,
      site.religion
    );

    const confidence = civilizationConfidence(
      site.civilization,
      site.religion
    );

    return this.buildResult(content, confidence);
  }
}
