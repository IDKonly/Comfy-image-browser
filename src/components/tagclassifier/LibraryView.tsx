import { useState, useMemo } from "react";
import { Subset } from "./types";
import { subsetClaims } from "./classify";
import { LABEL } from "../ui/tokens";
import { computeReach, TagSortMode } from "../ui/tagReach";
import { TagPickerGrid, TagSortToggle, TagSearchField, TagVisual } from "../ui/TagPickerGrid";

type ActionMode = 'include' | 'exclude';

interface LibraryViewProps {
  subsets: Subset[];
  uniqueTags: string[];
  dictActiveSubsetId: number | null;
  dictActionMode: ActionMode;
  tagSearchQuery: string;
  onSelectSubset: (id: number) => void;
  onActionModeChange: (mode: ActionMode) => void;
  onSearchChange: (value: string) => void;
  onToggleTag: (tag: string) => void;
}

/**
 * "Library" view: target-group selector + action mode + sort + search in one compact bar,
 * above the toggleable tag grid. The grid itself is shared with the Workshop's exclusion
 * filters (`ui/TagPickerGrid`) so both pickers behave identically.
 */
export const LibraryView = ({
  subsets, uniqueTags, dictActiveSubsetId, dictActionMode, tagSearchQuery,
  onSelectSubset, onActionModeChange, onSearchChange, onToggleTag,
}: LibraryViewProps) => {
  const [sortMode, setSortMode] = useState('reach' as TagSortMode);

  const reach = useMemo(() => computeReach(uniqueTags), [uniqueTags]);
  const activeSub = subsets.find(s => s.id === dictActiveSubsetId);

  const matchCount = useMemo(() => {
    const q = tagSearchQuery.trim().toLowerCase();
    return q ? uniqueTags.filter(t => t.includes(q)).length : uniqueTags.length;
  }, [uniqueTags, tagSearchQuery]);

  /**
   * Tags an earlier group in the waterfall already claims, mapped to that group's name.
   *
   * `parseLine` hands each subset only what upstream subsets left behind, so adding one of
   * these to the current target changes nothing — the tag never reaches this stage. They're
   * dimmed rather than hidden, since seeing *which* group took them is what tells you where
   * the rule actually belongs.
   */
  const claimedUpstream = useMemo(() => {
    const activeIdx = subsets.findIndex(s => s.id === dictActiveSubsetId);
    const upstream = activeIdx < 0 ? [] : subsets.slice(0, activeIdx);
    const map = new Map<string, string>();
    if (upstream.length === 0) return map;
    for (const tag of uniqueTags) {
      const owner = upstream.find(s => subsetClaims(tag, s));
      if (owner) map.set(tag, owner.name);
    }
    return map;
  }, [subsets, dictActiveSubsetId, uniqueTags]);

  const resolve = (tag: string): TagVisual => {
    const isInc = !!activeSub?.keywords.includes(tag);
    const isExc = !!activeSub?.excludeKeywords.includes(tag);
    const isIncVar = !isInc && !!activeSub?.keywords.some(k => tag.includes(k.replace(/\{.*?\}/, '')));
    const isExcVar = !isExc && !!activeSub?.excludeKeywords.some(k => tag.includes(k.replace(/\{.*?\}/, '')));

    const tone = isInc ? 'include'
      : isExc ? 'exclude'
      : isIncVar ? 'include-soft'
      : isExcVar ? 'exclude-soft'
      : 'none';

    const takenBy = claimedUpstream.get(tag);
    return {
      tone,
      note: takenBy ? `Already claimed upstream by "${takenBy}" — this group never sees it` : undefined,
      hint: /\{.*?\}/.test(tag) ? "Click 1: base | Click 2: full | Click 3: clear" : undefined,
      // Only fade tags with no rule of their own here — an explicit include/exclude on the
      // active group must stay legible even if it is currently unreachable.
      dimmed: !!takenBy && !isInc && !isExc,
    };
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-1.5">
      <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={LABEL}>Target</span>
        <div className="flex flex-wrap gap-1 min-w-0">
          {subsets.map(s => (
            <button
              key={s.id}
              onClick={() => onSelectSubset(s.id)}
              className={`h-6 max-lg:h-10 px-2 rounded-md border text-[9px] font-black uppercase tracking-wide transition-colors ${
                dictActiveSubsetId === s.id
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-neutral-950 border-white/10 text-neutral-300 hover:text-white hover:border-white/25'
              }`}
              aria-label={`Target group ${s.name}`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <span className="w-px h-4 bg-white/10 shrink-0" aria-hidden="true" />

        <div className="flex bg-neutral-950 border border-white/10 rounded-md p-0.5 shrink-0">
          <button
            onClick={() => onActionModeChange('include')}
            className={`h-5 max-lg:h-9 px-2.5 rounded flex items-center text-[9px] font-black uppercase tracking-wide transition-colors ${dictActionMode === 'include' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            Include +
          </button>
          <button
            onClick={() => onActionModeChange('exclude')}
            className={`h-5 max-lg:h-9 px-2.5 rounded flex items-center text-[9px] font-black uppercase tracking-wide transition-colors ${dictActionMode === 'exclude' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            Exclude −
          </button>
        </div>

        <TagSortToggle value={sortMode} onChange={setSortMode} />
        <TagSearchField id="search-global-tags" value={tagSearchQuery} onChange={onSearchChange} placeholder="Filter unique tags…" />

        <span className="text-[9px] font-mono text-neutral-500 tabular-nums shrink-0">
          {matchCount}/{uniqueTags.length}
        </span>
      </div>

      <TagPickerGrid
        tags={uniqueTags}
        query={tagSearchQuery}
        sortMode={sortMode}
        reach={reach}
        resolve={resolve}
        onToggle={onToggleTag}
        emptyMessage="No tags yet — import prompts to populate the library"
      />
    </div>
  );
};
