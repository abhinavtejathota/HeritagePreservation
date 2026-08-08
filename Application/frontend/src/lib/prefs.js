/** Visitor preferences - also device-local (no login). */

const KIDS_KEY = "vheritage_kids_mode";

export function getKidsMode() {
  try {
    return localStorage.getItem(KIDS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setKidsMode(on) {
  try {
    localStorage.setItem(KIDS_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("vheritage:kids", { detail: { on: !!on } }));
  return !!on;
}

/** Open PineAI with a ready-made question about the current page */
export function askPineAI(question) {
  window.dispatchEvent(
    new CustomEvent("pineai:ask", { detail: { question: String(question || "") } })
  );
}
