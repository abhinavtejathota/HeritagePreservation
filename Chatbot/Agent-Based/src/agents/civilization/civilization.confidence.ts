export function civilizationConfidence(
  civilization?: string,
  religion?: string
): number {

  let score = 0;

  if (civilization) score += 0.5;
  if (religion) score += 0.5;

  return Math.min(1, score);
}
