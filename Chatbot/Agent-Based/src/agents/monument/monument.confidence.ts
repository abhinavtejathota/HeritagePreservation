export function monumentConfidence(
  name?: string,
  description?: string
): number {

  let score = 0;

  if (name) score += 0.4;
  if (description) score += 0.6;

  return Math.min(1, score);
}
