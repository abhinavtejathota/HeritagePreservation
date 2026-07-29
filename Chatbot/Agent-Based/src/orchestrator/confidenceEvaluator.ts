export function evaluateConfidence(
  agentResults: { confidence: number }[]
): number {
  if (agentResults.length === 0) return 0;

  const total = agentResults.reduce(
    (sum, r) => sum + r.confidence,
    0
  );

  return Number((total / agentResults.length).toFixed(2));
}
