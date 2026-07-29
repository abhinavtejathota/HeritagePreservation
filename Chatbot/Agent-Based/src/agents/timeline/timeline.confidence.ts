export function timelineConfidence(
  yearMidpoint?: string
): number {

  let score = 0;

  if (yearMidpoint) score += 0.9;
  if (!yearMidpoint) score += 0.3;
  return Math.min(1, score);
}
