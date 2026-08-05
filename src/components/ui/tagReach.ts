/**
 * How many tags in a dataset a keyword would claim if selected.
 *
 * Both tag-matching surfaces in the app match by substring — the classifier's rules
 * (`classify.ts` → `lower.includes(k)`) and the Workshop's partial-exclusion list — so
 * picking "hair" claims "long hair", "blue hair", … while picking "long hair" claims only
 * itself. Reach is exactly that count, and ordering by it descending mirrors how these
 * lists are meant to be built: broad terms first, then the narrow exact-match tags that
 * punch back through them.
 *
 * Tags are expected pre-lowercased by the caller, so no case folding happens here.
 * Sorting by length first lets the inner loop skip everything shorter than the candidate —
 * a shorter string can never contain a longer one — which halves the comparisons.
 */
export const computeReach = (uniqueTags: string[]): Map<string, number> => {
  const byLength = [...uniqueTags].sort((a, b) => a.length - b.length);
  const reach = new Map<string, number>();
  for (let i = 0; i < byLength.length; i++) {
    const candidate = byLength[i];
    let n = 0;
    for (let j = i; j < byLength.length; j++) {
      if (byLength[j].includes(candidate)) n++;
    }
    reach.set(candidate, n);
  }
  return reach;
};

export type TagSortMode = 'reach' | 'alpha';

/**
 * The shared "search + sort" pipeline behind every tag grid.
 *
 * `tags` must already be sorted alphabetically (both callers derive them from a sorted
 * unique list), which is why 'alpha' needs no re-sort.
 */
export const filterAndSortTags = (
  tags: string[],
  query: string,
  sortMode: TagSortMode,
  reach: Map<string, number>,
): string[] => {
  const q = query.trim().toLowerCase();
  const list = q ? tags.filter(t => t.includes(q)) : tags;
  if (sortMode === 'alpha') return list;
  return [...list].sort((a, b) =>
    ((reach.get(b) ?? 1) - (reach.get(a) ?? 1)) ||  // widest net first
    (a.length - b.length) ||                        // then the more general-looking of a tie
    a.localeCompare(b)
  );
};
