import { BaseAgent } from "../base/BaseAgent";
import { AgentResult } from "../base/AgentResult";
import { HeritageRepository } from "../../knowledge/repositories/heritage.repository";
import { reasonGeo } from "./geo.reasoning";

export class GeoAgent extends BaseAgent {
  agentName = "GeoAgent";

  supportedFields = [
    "country"
  ];

  private repo = new HeritageRepository();

  async execute(monumentName: string): Promise<AgentResult> {
    const site = await this.repo.findByName(monumentName);

    if (!site || !site.country) {
      return this.buildResult(
        "Geographical location information is unavailable.",
        0.4
      );
    }

    const content = reasonGeo(site.country);

    // Only one field → simpler confidence
    const confidence = 0.9;

    return this.buildResult(content, confidence);
  }
}
