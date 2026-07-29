export function reasonArchitecture(
  architectureStyle?: string,
  material?: string
): string {

  if (!architectureStyle && !material) {
    return "Architectural details are not available for this monument.";
  }

  if (architectureStyle && material) {
    return `The monument follows the ${architectureStyle} style and is primarily constructed using ${material}.`;
  }

  if (architectureStyle) {
    return `The monument is built in the ${architectureStyle} architectural style.`;
  }

  return `The monument is primarily constructed using ${material}.`;
}
