import { useState, useMemo } from "react";
import { Search, CheckSquare, Square, EyeOff, Filter } from "lucide-react";
import { ModalLayout } from "./ui";
import { FilterState } from "../store/types";
import { tagExclusionReason, REASON_LABEL, TagExclusionReason } from "./wildcardtools/filterState";

interface TagRefinerProps {
  /** Tag -> occurrence count for the images in scope. */
  tagCounts: Record<string, number>;
  /** The live filter. Everything the dialog shows is derived from this. */
  filter: FilterState;
  /** Receives the new `exact_match` list. */
  onApply: (excluded: string[]) => void;
  onClose: () => void;
}

export const TagRefiner = ({ tagCounts, filter, onApply, onClose }: TagRefinerProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [excludedTags, setExcludedTags] = useState<Set<string>>(new Set(filter.exact_match ?? []));
  const [hideChecked, setHideChecked] = useState(false);

  /**
   * The tags in scope, most frequent first — nothing else.
   *
   * Exclusions set on other images stay in `excludedTags` and survive Apply, but they are
   * deliberately not listed: the viewer opens this dialog for one image, so the list is
   * that image's tags.
   */
  const sortedTags = useMemo(
    () => Object.entries(tagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [tagCounts]
  );

  /**
   * What the *saved* filter does to each tag, with this dialog's pending `exact_match`
   * edits substituted in — so the badges track the checkboxes live.
   */
  const reasonFor = useMemo(() => {
    const pending: FilterState = { ...filter, exact_match: Array.from(excludedTags) };
    const map = new Map<string, TagExclusionReason>();
    for (const [tag] of sortedTags) map.set(tag, tagExclusionReason(tag, pending));
    return map;
  }, [sortedTags, filter, excludedTags]);

  const filteredTags = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return sortedTags.filter(([tag]) => {
      if (!tag.toLowerCase().includes(q)) return false;
      if (!hideChecked) return true;
      const reason = reasonFor.get(tag);
      return reason === null || reason === 'exception';
    });
  }, [sortedTags, searchTerm, hideChecked, reasonFor]);

  /**
   * The checkbox owns `exact_match` and nothing else.
   *
   * It used to render checked for partial-rule matches too while toggling only the exact
   * set, so clicking such a row changed the saved list with no visible feedback and the
   * dialog looked stuck. Auto rules now show as a badge instead, leaving one meaning per
   * control.
   */
  const toggleTag = (tag: string) => {
    const next = new Set(excludedTags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setExcludedTags(next);
  };

  const setAllVisible = (excluded: boolean) => {
    const next = new Set(excludedTags);
    filteredTags.forEach(([tag]) => (excluded ? next.add(tag) : next.delete(tag)));
    setExcludedTags(next);
  };

  const autoCount = filteredTags.filter(([t]) => {
    const r = reasonFor.get(t);
    return r !== null && r !== 'exception' && r !== 'exact';
  }).length;

  return (
    <ModalLayout
      onClose={onClose}
      title="Refine Tags"
      subtitle="Select tags to exclude"
      icon={<Filter className="w-5 h-5 text-blue-500" />}
      maxWidthClass="max-w-lg"
      heightClass="h-[80vh]"
      zClass="z-[60]"
      footer={
        <div className="p-6 border-t border-white/5 bg-neutral-950/30 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(Array.from(excludedTags))}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20"
          >
            Apply Filters ({excludedTags.size})
          </button>
        </div>
      }
    >
        {/* Search & Controls */}
        <div className="p-6 space-y-4 border-b border-white/5 bg-neutral-950/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
            <input
              type="text"
              placeholder="Search tags..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-950 border border-white/5 rounded-xl py-2.5 pl-10 text-[11px] focus:outline-none focus:border-blue-500/50 transition-all"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setAllVisible(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase transition-all"
              >
                <CheckSquare className="w-3.5 h-3.5" /> Check All
              </button>
              <button
                onClick={() => setAllVisible(false)}
                className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase transition-all"
              >
                <Square className="w-3.5 h-3.5" /> Uncheck All
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={hideChecked}
                onChange={e => setHideChecked(e.target.checked)}
                className="hidden"
              />
              <div className={`p-1.5 rounded-lg border transition-all ${hideChecked ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500 group-hover:text-neutral-300'}`}>
                <EyeOff className="w-3.5 h-3.5" />
              </div>
              <span className="text-[9px] font-black uppercase text-neutral-500 group-hover:text-neutral-300 transition-colors">Hide Excluded</span>
            </label>
          </div>

          {autoCount > 0 && (
            <p className="text-[9px] font-bold uppercase tracking-wide text-amber-500/80">
              {autoCount} tag{autoCount === 1 ? '' : 's'} already dropped by another rule — badge shows which
            </p>
          )}
        </div>

        {/* Tag List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
          {filteredTags.map(([tag, count]) => {
            const reason = reasonFor.get(tag) ?? null;
            const isChecked = excludedTags.has(tag);
            const isAuto = reason !== null && reason !== 'exception' && reason !== 'exact';
            const isRescued = reason === 'exception';

            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                title={
                  isRescued ? `Kept: listed in exceptions, which overrides the ${isChecked ? 'exclusion' : 'matching rule'}`
                  : isAuto ? `Dropped by the ${REASON_LABEL[reason]} rule, with or without this checkbox`
                  : isChecked ? 'Excluded explicitly' : 'Click to exclude'
                }
                className={`w-full flex items-center justify-between px-4 py-2 rounded-xl transition-all group ${
                  isRescued ? 'bg-emerald-600/10 text-emerald-400'
                  : isAuto ? 'bg-amber-500/10 text-amber-500/90'
                  : isChecked ? 'bg-blue-600/10 text-blue-400'
                  : 'hover:bg-white/5 text-neutral-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  {isChecked
                    ? <CheckSquare className="w-4 h-4 shrink-0" />
                    : <Square className="w-4 h-4 shrink-0 opacity-20 group-hover:opacity-100" />}
                  <span className="text-[11px] font-medium truncate">{tag}</span>
                  {isAuto && (
                    <span className="text-[7px] font-black uppercase bg-amber-500/20 text-amber-500 px-1 rounded shrink-0">
                      auto:{REASON_LABEL[reason]}
                    </span>
                  )}
                  {isRescued && (
                    <span className="text-[7px] font-black uppercase bg-emerald-500/20 text-emerald-400 px-1 rounded shrink-0">
                      exception
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md shrink-0 ${isChecked ? 'bg-blue-600/20' : 'bg-neutral-800'}`}
                  title={`${count} occurrence(s)`}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {filteredTags.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
              <Search className="w-12 h-12 mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">No tags found</p>
            </div>
          )}
        </div>
    </ModalLayout>
  );
};
