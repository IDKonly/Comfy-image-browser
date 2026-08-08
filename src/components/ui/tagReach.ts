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
 *
 * Comparing every pair is O(n²) and blocks the main thread on real datasets — a folder
 * yielding 20k unique tags measured at ~2.6s, which the Library grid pays on mount. So the
 * candidates are narrowed first: any tag containing `candidate` must contain *every* bigram
 * of `candidate`, so the rarest of those bigrams gives a superset of the answer that is
 * usually a small fraction of the corpus. Each survivor is still verified with `includes`,
 * making this exactly equivalent to the pairwise scan — just ~16x faster at 20k tags
 * (2.6s → 160ms), and more as the corpus grows.
 *
 * Tags are sorted by length so `j >= i` cheaply skips everything too short to contain the
 * candidate. One-character tags have no bigram and fall back to the direct scan.
 */
export const computeReach = (uniqueTags: string[]): Map<string, number> => {
  const byLength = [...uniqueTags].sort((a, b) => a.length - b.length);
  const total = byLength.length;
  const reach = new Map<string, number>();
  if (total === 0) return reach;

  // bigram -> ascending indices into byLength of every tag containing it
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < total; i++) {
    const tag = byLength[i];
    const seen = new Set<string>();
    for (let k = 0; k + 1 < tag.length; k++) {
      const bigram = tag.slice(k, k + 2);
      if (seen.has(bigram)) continue;   // a repeated bigram must not push i twice
      seen.add(bigram);
      const bucket = buckets.get(bigram);
      if (bucket === undefined) buckets.set(bigram, [i]);
      else bucket.push(i);
    }
  }

  const scanAll = (candidate: string, from: number) => {
    let n = 0;
    for (let j = from; j < total; j++) if (byLength[j].includes(candidate)) n++;
    return n;
  };

  for (let i = 0; i < total; i++) {
    const candidate = byLength[i];
    if (candidate.length < 2) {
      reach.set(candidate, scanAll(candidate, i));
      continue;
    }

    let narrowest: number[] | undefined;
    for (let k = 0; k + 1 < candidate.length; k++) {
      const bucket = buckets.get(candidate.slice(k, k + 2));
      // Absent bigram is impossible — the candidate is itself indexed — but bail safely.
      if (bucket === undefined) { narrowest = []; break; }
      if (narrowest === undefined || bucket.length < narrowest.length) narrowest = bucket;
    }

    let n = 0;
    for (const j of narrowest!) {
      if (j >= i && byLength[j].includes(candidate)) n++;
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
