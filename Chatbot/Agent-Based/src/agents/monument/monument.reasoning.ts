export function reasonMonument(
  name?: string,
  description?: string
): string {

  if (!name && !description) {
    return "Monument details are unavailable.";
  }

  if (name && description) {
    return `${name} is a historical monument. ${description}`;
  }

  if (name) {
    return `${name} is a historical monument.`;
  }

  return description!;
}
