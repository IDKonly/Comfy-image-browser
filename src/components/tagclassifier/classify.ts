import { Subset, WordGroup } from "./types";

/**
 * Replace wordgroup member words in a tag with their {groupName} variable (length-sorted).
 * Mirrors the Rust `get_merged_tag_optimized` exactly: the trailing boundary `(\s|$)` is
 * captured and restored (`$2`) — NOT a lookahead — so consecutive matches behave identically
 * to the backend classifier used at compile time.
 */
export const getMergedTag = (tag: string, groups: WordGroup[]) => {
  let merged = tag;
  groups.forEach(wg => {
    if (!wg.name || !wg.words.length) return;
    const sortedWords = [...wg.words].sort((a, b) => b.length - a.length);
    sortedWords.forEach(word => {
      const regex = new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(\\s|$)`, 'gi');
      merged = merged.replace(regex, `$1{${wg.name}}$2`);
    });
  });
  return merged;
};

/**
 * Would `sub` claim `tag` at its stage of the waterfall?
 *
 * `tag` must already be lowercased and variable-merged — which is how `uniqueTags` is built,
 * so the Library grid can call this directly. An exact include beats an exclude: that is the
 * escape hatch for pulling one specific tag back out of a broad exclude.
 *
 * Extracted from `parseLine` so both share one definition of "claims"; `parseLine` still
 * evaluates against the raw and merged forms separately, since prompt tags arrive unmerged.
 */
export const subsetClaims = (tag: string, sub: Subset) => {
  const isInc = sub.keywords.some(k => tag.includes(k.toLowerCase()));
  const isExactInc = sub.keywords.some(k => tag === k.toLowerCase());
  const isExc = !isExactInc && sub.excludeKeywords.some(k => tag.includes(k.toLowerCase()));
  return isInc && !isExc;
};

/**
 * Sequential "waterfall" classification of one comma-separated prompt line: each subset
 * claims its matching tags in order; the rest fall through to an "Unclassified" bucket.
 */
export const parseLine = (lineStr: string, subsets: Subset[], wordGroups: WordGroup[]) => {
  if (!lineStr.trim()) return [];
  let remainingTags = lineStr.split(',').map(t => t.trim()).filter(t => t);
  const parsedSubsets = subsets.map(sub => {
    const matched: string[] = [];
    const nextRemaining: string[] = [];
    remainingTags.forEach(tag => {
      const lower = tag.toLowerCase();
      const merged = getMergedTag(lower, wordGroups).toLowerCase();
      const isInc = sub.keywords.some(k => lower.includes(k.toLowerCase()) || merged.includes(k.toLowerCase()));
      const isExactInc = sub.keywords.some(k => lower === k.toLowerCase() || merged === k.toLowerCase());
      const isExc = !isExactInc && sub.excludeKeywords.some(k => lower.includes(k.toLowerCase()) || merged.includes(k.toLowerCase()));
      if (isInc && !isExc) matched.push(tag); else nextRemaining.push(tag);
    });
    remainingTags = nextRemaining;
    return { id: sub.id, name: sub.name, matches: matched };
  });
  parsedSubsets.push({ id: 0, name: 'Unclassified', matches: remainingTags });
  return parsedSubsets;
};
