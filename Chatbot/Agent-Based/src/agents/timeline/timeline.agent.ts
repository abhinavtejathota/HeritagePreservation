import { BaseAgent } from "../base/BaseAgent";
import { AgentResult } from "../base/AgentResult";
import { HeritageRepository } from "../../knowledge/repositories/heritage.repository";
import { reasonTimeline } from "./timeline.reasoning";
import { timelineConfidence } from "./timeline.confidence";

export class TimelineAgent extends BaseAgent {
  agentName = "TimelineAgent";

  supportedFields = [
    "yearMidpoint"
  ];

  private repo = new HeritageRepository();

  async execute(monumentName: string): Promise<AgentResult> {
    const site = await this.repo.findByName(monumentName);

    if (!site || !site.yearMidpoint) {
      return this.buildResult(
        "The historical time period of this monument is not available.",
        0.3
      );
    }

    const content = reasonTimeline(site.yearMidpoint);
    const confidence = timelineConfidence(site.yearMidpoint);

    return this.buildResult(content, confidence);
  }
}
