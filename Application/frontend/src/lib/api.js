/**
 * API base for the Express backend.
 * When the UI is served from Express (:8175), use same-origin ("").
 * That avoids stale builds still pointing at a wrong host/port.
 */
function cleanEnvUrl(raw) {
  return String(raw || "")
    .split("#")[0]
    .trim()
    .replace(/\/$/, "");
}

export function getApiBase() {
  if (typeof window !== "undefined") {
    const { port, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      if (port === "8175" || port === "5000" || port === "") {
        return "";
      }
    }
  }
  return cleanEnvUrl(import.meta.env.REACT_APP_API_URL) || "http://localhost:8175";
}

export function getChatApiBase() {
  return (
    cleanEnvUrl(import.meta.env.REACT_APP_CHA_URL) || "http://localhost:8180/api"
  );
}
