export function reasonCivilization(
  civilization?: string,
  religion?: string
): string {

  if (!civilization && !religion) {
    return "Civilizational and religious details are unavailable for this monument.";
  }

  if (civilization && religion) {
    return `The monument belongs to the ${civilization} civilization and is associated with the ${religion} religion.`;
  }

  if (civilization) {
    return `The monument belongs to the ${civilization} civilization.`;
  }

  return `The monument is associated with the ${religion} religion.`;
}
