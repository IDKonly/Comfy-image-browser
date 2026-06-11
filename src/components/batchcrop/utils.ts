import { Rect } from "./types";

/** "#RRGGBB" -> [r, g, b]. */
export const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Round a rect's geometry to integer pixels (for final crop output). */
export const roundRect = (r: Rect): Rect => ({
  ...r,
  x: Math.round(r.x),
  y: Math.round(r.y),
  width: Math.round(r.width),
  height: Math.round(r.height),
});

/** Snap a value to the nearest target within `sensitivity`, else return it unchanged. */
export const snapValue = (v: number, targets: number[], sensitivity: number): number => {
  for (const t of targets) if (Math.abs(v - t) <= sensitivity) return t;
  return v;
};

/** Load a recent "[a,b]" pair list from localStorage, falling back on missing/invalid data. */
export const loadRecentPairs = (storageKey: string, fallback: [number, number][]): [number, number][] => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

/** Prepend a pair to a recent list (dedup, max 3), persist it, and return the new list. */
export const pushRecentPair = (
  list: [number, number][],
  a: number,
  b: number,
  storageKey: string
): [number, number][] => {
  const next = [[a, b], ...list.filter(g => g[0] !== a || g[1] !== b)].slice(0, 3) as [number, number][];
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
};
