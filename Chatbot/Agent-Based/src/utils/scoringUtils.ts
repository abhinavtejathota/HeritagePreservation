//This file will not be used for now
export function normalizeScore(
  value: number,
  min = 0,
  max = 1
): number {
  if (value < min) return min;
  if (value > max) return max;
  return Number(value.toFixed(2));
}

export function average(scores: number[]): number {
  if (scores.length === 0) return 0;
  const total = scores.reduce((a, b) => a + b, 0);
  return Number((total / scores.length).toFixed(2));
}
