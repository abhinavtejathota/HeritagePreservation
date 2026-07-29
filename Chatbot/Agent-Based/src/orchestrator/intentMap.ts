const AGENT_TERMS: Record<string, string[]> = {
  geo: ["country", "location", "where", "located"],
  civilization: ["civilization", "religion", "culture", "dynasty", "empire", "king", "ruler", "built", "founded", "made"],
  architecture: ["architecture", "style", "material", "design", "structure"],
  timeline: ["year", "era", "period", "century", "date", "when"],
  monument: ["monument", "site", "place", "heritage", "about"]
};

export function mapIntents(keywords: string[]): string[] {
  const intents = new Set<string>();

  for (const [agent, terms] of Object.entries(AGENT_TERMS)) {
    if (terms.some(term => keywords.includes(term))) {
      intents.add(agent);
    }
  }

  return [...intents];
}
