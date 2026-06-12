import { Rect } from "./types";
import { settingsStore } from "../../api/settings";

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

/** Prepend a pair to a recent list (dedup, max 3). Pure — persistence is handled separately. */
export const prependRecentPair = (
  list: [number, number][],
  a: number,
  b: number
): [number, number][] =>
  [[a, b], ...list.filter(g => g[0] !== a || g[1] !== b)].slice(0, 3) as [number, number][];

/** Load a recent "[a,b]" list from the shared settings store, migrating once from legacy localStorage. */
export const loadRecents = async (key: string, fallback: [number, number][]): Promise<[number, number][]> => {
  try {
    const fromStore = await settingsStore.get<[number, number][]>(key);
    if (fromStore != null) return fromStore;
    const legacy = localStorage.getItem(key);
    if (legacy) {
      const parsed = JSON.parse(legacy) as [number, number][];
      await settingsStore.set(key, parsed);
      await settingsStore.save();
      return parsed;
    }
  } catch { /* fall through to default */ }
  return fallback;
};

/** Persist a recent "[a,b]" list to the shared settings store. */
export const saveRecents = async (key: string, list: [number, number][]): Promise<void> => {
  try {
    await settingsStore.set(key, list);
    await settingsStore.save();
  } catch (e) {
    console.error("[batchcrop] failed to save recents", e);
  }
};
