import { safeJoin } from "../utils/textUtils";

interface SynthesizedResponse {
  text: string;
}

export function synthesizeResponse(
  agentOutputs: Record<string, any>
): SynthesizedResponse {
  const parts: string[] = [];

  if (agentOutputs.monument) {
    parts.push(agentOutputs.monument);
  }

  if (agentOutputs.geo) {
    parts.push(agentOutputs.geo);
  }

  if (agentOutputs.civilization) {
    parts.push(agentOutputs.civilization);
  }

  if (agentOutputs.architecture) {
    parts.push(agentOutputs.architecture);
  }

  if (agentOutputs.timeline) {
    parts.push(agentOutputs.timeline);
  }

  return {
    text: safeJoin(parts)
  };
}
