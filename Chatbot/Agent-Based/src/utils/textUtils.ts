export function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function safeJoin(
  parts: (string | undefined | null)[],
  separator = " "
): string {
  return parts.filter(Boolean).join(separator);
}

export function truncateText(
  text: string,
  maxLength = 300
): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastPeriod = slice.lastIndexOf(".");
  if (lastPeriod > 0) {
    return slice.slice(0, lastPeriod + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 0) {
    return slice.slice(0, lastSpace).trim() + "...";
  }

  return slice.trim() + "...";
}

