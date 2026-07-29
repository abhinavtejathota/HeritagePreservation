export function calculateConfidence(
  matchedIntents: string[],
  keywordCount: number
): number {
  if (matchedIntents.length === 0) return 0;
  return Math.min(1, matchedIntents.length / Math.max(1, keywordCount * 0.4));
}
