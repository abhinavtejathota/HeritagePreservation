import { classifyIntent } from "./intentClassifier";
import { planTasks } from "./taskPlanner";
import { evaluateConfidence } from "./confidenceEvaluator";
import { synthesizeResponse } from "./responseSynthesizer";
import { escalationGuard } from "../external/safety/escalation.guard";
import { logger } from "../utils/logger";
import { SAFETY } from "../config/constants";
import { extractEntities } from "../nlp/entityExtractor";
import { AGENT_PRIORITY } from "./taskPlanner";
//import { HeritageRepository } from "../knowledge/repositories/heritage.repository";
// Agents
import { MonumentAgent } from "../agents/monument/monument.agent";
import { GeoAgent } from "../agents/geo/geo.agent";
import { CivilizationAgent } from "../agents/civilization/civilization.agent";
import { ArchitectureAgent } from "../agents/architecture/architecture.agent";
import { TimelineAgent } from "../agents/timeline/timeline.agent";

const AGENT_MAP: Record<string, any> = {
  monument: MonumentAgent,
  geo: GeoAgent,
  civilization: CivilizationAgent,
  architecture: ArchitectureAgent,
  timeline: TimelineAgent
};

  /*
  const repo = new HeritageRepository();
  const site = await repo.findByName("hampi");
  console.log(site);
  */

const ABSTRACT_TERMS = new Set([
  "religion",
  "culture",
  "history",
  "architecture",
  "civilization",
  "dynasty",
  "empire",
  "kingdom"
]);

export async function runOrchestrator(query: string) {
  const safety = escalationGuard(query);
  if (!safety.allowed) {
    logger.warn("Query blocked by safety guard", { query });
    return {
      answer: SAFETY.DEFAULT_BLOCK_MESSAGE,
      confidence: 0,
      agentsUsed: []
    };
  }

  logger.info("Orchestrator started", { query });

  const intents = await classifyIntent(query);
  
  const tasks = planTasks(intents);
  
  const entities = extractEntities(query);

  console.log("[DEBUG] Extracted entities:", entities);

  // Pick primary entity: Place > PossiblePlace
  const primaryEntity =
    entities.find(
      e =>
        e.tags.includes("Place") &&
        !ABSTRACT_TERMS.has(e.normalized)
    ) ||
    entities.find(
      e =>
        e.tags.includes("ProperNoun") &&
        !ABSTRACT_TERMS.has(e.normalized)
    ) ||
    entities
      .filter(
        e =>
          e.tags.includes("PossiblePlace") &&
          !ABSTRACT_TERMS.has(e.normalized)
      )
      .sort((a, b) => b.text.length - a.text.length)[0];

  if (!primaryEntity) {
    // No valid entity found
    return {
      answer: "I can help with information about historical monuments and heritage sites. Try asking about a specific place.",
      confidence: 0.9,
      agentsUsed: []
    };
  }

  const agentInput = primaryEntity.normalized;
  console.log("[DEBUG] Agent input resolved as:", agentInput);

  const agentOutputs: Record<string, any> = {};
  let weightedConfidence = 0;
  let totalWeight = 0;

  // Execute agents
  for (const task of tasks) {
    logger.info("Executing agent", { agent: task.agent });
    const AgentClass = AGENT_MAP[task.agent];
    if (!AgentClass) continue;

    const agent = new AgentClass();
    const result = await agent.execute(agentInput);

    agentOutputs[task.agent] = result.content;
    const weight = AGENT_PRIORITY[task.agent] ?? 1;

	weightedConfidence += result.confidence * weight;
	totalWeight += weight;
  }

  const finalConfidence =
    totalWeight === 0
      ? 0
      : Number((weightedConfidence / totalWeight).toFixed(2));

  const response = synthesizeResponse(agentOutputs);

  return {
    answer: response?.text || "Sorry, I couldn't find an answer.",
    confidence: finalConfidence,
    agentsUsed: tasks.map(t => t.agent)
  };
}

