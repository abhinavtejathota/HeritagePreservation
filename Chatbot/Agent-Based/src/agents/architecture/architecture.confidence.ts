export function architectureConfidence(
  architectureStyle?: string,
  material?: string
): number {

  let score = 0;

  if (architectureStyle) score += 0.5;
  if (material) score += 0.5;

  return Math.min(1, score);
}
