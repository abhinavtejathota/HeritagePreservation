export function reasonTimeline(
  yearMidpoint?: string
): string {
  if (!yearMidpoint) {
    return "The construction period of this monument is unknown.";
  }
  return `The monument dates back to around ${yearMidpoint}.`;
}
