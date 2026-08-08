/** Saved places — stored only in this browser (no login / no server account). */

const KEY = "vheritage_favourites";

/** Shown in the UI so visitors know where data lives */
export const STORAGE_NOTE =
  "Saved on this device only — no account or login. Clearing browser data or using another phone/computer will not show the same list.";

export function getFavourites() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function isFavourite(name) {
  return getFavourites().includes(name);
}

export function toggleFavourite(name) {
  const cur = getFavourites();
  let next;
  if (cur.includes(name)) next = cur.filter((n) => n !== name);
  else next = [...cur, name];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function addFavourite(name) {
  const cur = getFavourites();
  if (cur.includes(name)) return cur;
  const next = [...cur, name];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearFavourites() {
  localStorage.removeItem(KEY);
  return [];
}

export const toSlug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
