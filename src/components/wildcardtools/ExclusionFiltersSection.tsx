import { useState, useMemo } from "react";
import { ChevronDown, FileUp, Save, RefreshCw } from "lucide-react";
import { FilterState } from "../../store/useAppStore";
import { LABEL, ICON_BTN } from "../ui/tokens";
import { computeReach, TagSortMode } from "../ui/tagReach";
import { TagPickerGrid, TagSortToggle, TagSearchField, TagVisual } from "../ui/TagPickerGrid";
import { TagInput } from "../ui/TagInput";

type ListId = 'partial_match' | 'exact_match' | 'exceptions';

interface ExclusionFiltersSectionProps {
  open: boolean;
  onToggle: () => void;
  filter: FilterState;
  onFilterChange: (next: FilterState) => void;
  onMergeTarget: (key: keyof FilterState) => void;
  onSaveFilterList: (key: keyof FilterState, filename: string) => void;
  /** Tags present in the current Workshop input — the universe the grid picks from. */
  uniqueTags: string[];
  /** Re-reads tags from the current images + text prompts. */
  onRescan: () => void;
  scanning: boolean;
}

const LISTS: { id: ListId; label: string; filename: string; hint: string }[] = [
  { id: 'partial_match', label: 'Partial', filename: 'default_partial_exclusion.txt', hint: 'Drops any tag containing these as a substring' },
  { id: 'exact_match',   label: 'Exact',   filename: 'default_exact_exclusion.txt',   hint: 'Drops tags matching exactly' },
  { id: 'exceptions',    label: 'Exceptions', filename: 'default_exception_exclusion.txt', hint: 'Always kept, even when another list would drop them' },
];

/**
 * Editor for the partial/exact/exceptions exclusion lists.
 *
 * Built on the same picker as the Tag Classifier's Library tab: choose a target list, then
 * toggle tags out of the dataset the Workshop is actually about to process, ordered by how
 * many tags each one would claim. The chip strip above the grid takes free-text entry for
 * rules that are not present verbatim in the data (splitting on commas *and* newlines), and
 * doubles as the removal affordance.
 *
 * Tone resolution mirrors `filter.rs`: exact and exception match by equality, partial by
 * substring, and exceptions override both.
 */
export const ExclusionFiltersSection = ({
  open, onToggle, filter, onFilterChange, onMergeTarget, onSaveFilterList,
  uniqueTags, onRescan, scanning,
}: ExclusionFiltersSectionProps) => {
  const [target, setTarget] = useState('partial_match' as ListId);
  const [sortMode, setSortMode] = useState('reach' as TagSortMode);
  const [query, setQuery] = useState('');

  const reach = useMemo(() => computeReach(uniqueTags), [uniqueTags]);
  const activeList = LISTS.find(l => l.id === target)!;
  const entries = filter[target] as string[];

  const matchCount = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? uniqueTags.filter(t => t.includes(q)).length : uniqueTags.length;
  }, [uniqueTags, query]);

  /** First partial rule that is a proper substring of `tag` (i.e. covers it without being it). */
  const coveringPartial = (tag: string) =>
    filter.partial_match.find(p => p && p !== tag && tag.includes(p));

  const resolve = (tag: string): TagVisual => {
    const isException = filter.exceptions.includes(tag);

    if (target === 'exceptions') {
      const droppedByExact = filter.exact_match.includes(tag);
      const droppedByPartial = filter.partial_match.find(p => p && tag.includes(p));
      const inert = !droppedByExact && !droppedByPartial;
      return {
        tone: isException ? 'include' : 'none',
        hint: isException ? 'Kept — overrides the exclusion lists' : 'Add as an exception',
        note: inert
          ? 'Nothing currently drops this tag — an exception would have no effect'
          : droppedByExact
            ? 'Dropped by Exact — an exception rescues it'
            : `Dropped by Partial rule "${droppedByPartial}" — an exception rescues it`,
        dimmed: inert && !isException,
      };
    }

    const listed = entries.includes(tag);
    if (listed) {
      return {
        tone: 'exclude',
        hint: target === 'partial_match' ? 'Listed — drops this and anything containing it' : 'Listed — dropped exactly',
        note: isException ? 'Rescued by an entry in Exceptions' : undefined,
        dimmed: isException,
      };
    }

    // Not listed here — say whether it is already handled somewhere else.
    const covering = coveringPartial(tag);
    if (target === 'exact_match') {
      const alreadyGone = covering ?? (filter.partial_match.includes(tag) ? tag : undefined);
      return {
        tone: alreadyGone ? 'exclude-soft' : 'none',
        note: alreadyGone ? `Already dropped by Partial rule "${alreadyGone}" — an exact entry adds nothing` : undefined,
        dimmed: !!alreadyGone,
      };
    }

    return {
      tone: covering ? 'exclude-soft' : 'none',
      note: covering ? `Already covered by Partial rule "${covering}"` : undefined,
      dimmed: !!covering,
    };
  };

  const toggle = (tag: string) => {
    const next = entries.includes(tag) ? entries.filter(t => t !== tag) : [...entries, tag];
    onFilterChange({ ...filter, [target]: next });
  };

  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full h-6 max-lg:h-11 px-1.5 flex items-center gap-1.5 bg-solid-panel hover:bg-solid-active text-[9px] font-black uppercase tracking-wide text-neutral-300 transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} />
        Exclusion filters
        <span className="text-neutral-600 font-mono tabular-nums">
          {filter.partial_match.length} / {filter.exact_match.length} / {filter.exceptions.length}
        </span>
      </button>

      {open && (
        <div className="p-1.5 space-y-1.5">
          {/* Picker bar — mirrors the Library tab's target / sort / search row. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={LABEL}>Target</span>
            <div className="flex flex-wrap gap-1 min-w-0">
              {LISTS.map(l => (
                <button
                  key={l.id}
                  onClick={() => setTarget(l.id)}
                  title={l.hint}
                  aria-pressed={target === l.id}
                  className={`h-6 max-lg:h-10 px-2 rounded-md border text-[9px] font-black uppercase tracking-wide transition-colors ${
                    target === l.id
                      ? (l.id === 'exceptions' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-red-600 border-red-500 text-white')
                      : 'bg-neutral-950 border-white/10 text-neutral-300 hover:text-white hover:border-white/25'
                  }`}
                >
                  {l.label}
                  <span className="ml-1 font-mono tabular-nums opacity-60">{(filter[l.id] as string[]).length}</span>
                </button>
              ))}
            </div>

            <span className="w-px h-4 bg-white/10 shrink-0" aria-hidden="true" />

            <TagSortToggle value={sortMode} onChange={setSortMode} />
            <TagSearchField id="search-exclusion-tags" value={query} onChange={setQuery} placeholder="Filter input tags…" />

            <span className="text-[9px] font-mono text-neutral-500 tabular-nums shrink-0">
              {matchCount}/{uniqueTags.length}
            </span>

            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={onRescan} className={ICON_BTN} title="Re-read tags from the current images and text prompts" aria-label="Rescan input tags" disabled={scanning}>
                <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => onMergeTarget(target)} className={ICON_BTN} title={`Merge pasted tags into ${activeList.label}`} aria-label={`Merge into ${activeList.label}`}>
                <FileUp className="w-3 h-3" />
              </button>
              <button onClick={() => onSaveFilterList(target, activeList.filename)} className={ICON_BTN} title={`Save ${activeList.label} as the default list`} aria-label={`Save ${activeList.label} as default`}>
                <Save className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Entries of the active list. Accepts comma- AND newline-separated input. */}
          <div className="bg-neutral-950 border border-white/5 rounded-md px-1.5 py-1">
            <TagInput
              tags={entries}
              onChange={next => onFilterChange({ ...filter, [target]: next })}
              placeholder={`add to ${activeList.label.toLowerCase()}…`}
              colorClass={target === 'exceptions' ? 'indigo' : 'red'}
              suggestions={uniqueTags}
            />
          </div>

          <div className="h-56 flex flex-col">
            <TagPickerGrid
              tags={uniqueTags}
              query={query}
              sortMode={sortMode}
              reach={reach}
              resolve={resolve}
              onToggle={toggle}
              emptyMessage={scanning ? "Reading tags from the current input…" : "No input tags — add images or text prompts, then rescan"}
            />
          </div>
        </div>
      )}
    </div>
  );
};
