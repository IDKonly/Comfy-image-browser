import { useMemo } from "react";
import { Search, XCircle, CheckCircle } from "lucide-react";
import { LABEL, FIELD, SEGMENT, SEGMENT_BTN, TAG_TEXT } from "./tokens";
import { computeReach, filterAndSortTags, TagSortMode } from "./tagReach";

/**
 * How a tag currently relates to the list being edited.
 *
 * `*-soft` means "covered, but not by an entry equal to this tag" — a substring rule or a
 * variable pattern already reaches it. Rendered dashed so it reads as inherited rather than
 * explicitly chosen.
 */
export type TagTone = 'none' | 'include' | 'exclude' | 'include-soft' | 'exclude-soft';

export interface TagVisual {
  tone: TagTone;
  /** Prepended to the tooltip — why this tag looks the way it does. */
  note?: string;
  /** Replaces the default action hint for the plain tone. */
  hint?: string;
  /** Fade the chip: still listed, but selecting it would change nothing here. */
  dimmed?: boolean;
}

const TONE_STYLE: Record<TagTone, string> = {
  none: "bg-solid-card text-neutral-300 border-white/5 hover:text-white hover:border-blue-500/30",
  'include-soft': "bg-[#162235] text-blue-300 border-blue-500/25 border-dashed hover:bg-[#1f2e45]",
  'exclude-soft': "bg-[#2d1217] text-red-300 border-red-500/25 border-dashed hover:bg-[#3d1820]",
  include: "bg-blue-600 border-blue-500 text-white font-bold",
  exclude: "bg-red-600 border-red-500 text-white font-bold",
};

const TONE_HINT: Record<TagTone, string> = {
  none: "Toggle tag selection",
  'include-soft': "Covered by a broader include rule",
  'exclude-soft': "Covered by a broader exclude rule",
  include: "Explicitly included",
  exclude: "Explicitly excluded",
};

const toneIndicator = (tone: TagTone) => {
  if (tone === 'include') return <CheckCircle className="w-2.5 h-2.5" />;
  if (tone === 'exclude') return <XCircle className="w-2.5 h-2.5" />;
  if (tone === 'include-soft') return <span className="w-1 h-1 rounded-full bg-blue-500" />;
  if (tone === 'exclude-soft') return <span className="w-1 h-1 rounded-full bg-red-500" />;
  return null;
};

/** Reach/A–Z switch. Shared so both grids order their tags by the same rule. */
export const TagSortToggle = ({ value, onChange }: { value: TagSortMode; onChange: (m: TagSortMode) => void }) => (
  <>
    <span className={LABEL}>Sort</span>
    <div className={SEGMENT}>
      <button
        onClick={() => onChange('reach')}
        title="Widest first — the tag that would claim the most similar tags leads"
        className={`${SEGMENT_BTN} ${value === 'reach' ? 'bg-solid-element text-white' : 'text-neutral-400 hover:text-white'}`}
      >
        Reach
      </button>
      <button
        onClick={() => onChange('alpha')}
        title="Alphabetical"
        className={`${SEGMENT_BTN} ${value === 'alpha' ? 'bg-solid-element text-white' : 'text-neutral-400 hover:text-white'}`}
      >
        A–Z
      </button>
    </div>
  </>
);

export const TagSearchField = ({ value, onChange, id, placeholder = "Filter tags…" }: {
  value: string; onChange: (v: string) => void; id: string; placeholder?: string;
}) => (
  <div className="relative flex-1 min-w-[9rem]">
    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500 pointer-events-none" />
    <input
      id={id}
      className={`${FIELD} pl-7`}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  </div>
);

interface TagPickerGridProps {
  /** Full alphabetically-sorted tag universe; the grid handles search and sort itself. */
  tags: string[];
  query: string;
  sortMode: TagSortMode;
  /** Precomputed reach map. Pass one in when the caller already memoises it. */
  reach?: Map<string, number>;
  resolve: (tag: string) => TagVisual;
  onToggle: (tag: string) => void;
  /** Shown in place of the grid when the tag universe is empty. */
  emptyMessage: string;
}

/**
 * The toggleable tag grid used by the Tag Classifier's Library tab and the Workshop's
 * exclusion filters.
 *
 * Both screens are doing the same job — pick substring rules out of the tags a dataset
 * actually contains — so they share the chip rendering, the reach badge, and the
 * search/sort pipeline. Only the meaning of a click differs, which is what `resolve` and
 * `onToggle` carry.
 */
export const TagPickerGrid = ({
  tags, query, sortMode, reach: reachProp, resolve, onToggle, emptyMessage,
}: TagPickerGridProps) => {
  const localReach = useMemo(() => (reachProp ? null : computeReach(tags)), [reachProp, tags]);
  const reach = reachProp ?? localReach!;
  const filtered = useMemo(
    () => filterAndSortTags(tags, query, sortMode, reach),
    [tags, query, sortMode, reach]
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-950 rounded-lg border border-white/5 p-2 scrollbar-thin">
      {tags.length === 0 ? (
        <p className={LABEL}>{emptyMessage}</p>
      ) : (
        <div className="flex flex-wrap gap-1 content-start">
          {filtered.map(tag => {
            const v = resolve(tag);
            const n = reach.get(tag) ?? 1;
            return (
              <button
                key={tag}
                title={
                  (v.note ? `${v.note}\n` : '') +
                  `${v.hint ?? TONE_HINT[v.tone]}\n` +
                  `Claims ${n} tag${n === 1 ? '' : 's'} in this dataset`
                }
                onClick={() => onToggle(tag)}
                className={`min-h-[20px] max-lg:min-h-9 px-1.5 py-px rounded border font-mono leading-[1.5] transition-colors active:scale-95 flex items-center gap-1 ${TAG_TEXT} ${TONE_STYLE[v.tone]} ${v.dimmed ? 'opacity-40' : ''}`}
                aria-label={`Toggle tag ${tag}, claims ${n} tags${v.note ? `, ${v.note}` : ''}`}
              >
                {toneIndicator(v.tone)}
                {tag}
                {n > 1 && (
                  <span className="text-[8.5px] font-black opacity-50 tabular-nums" aria-hidden="true">{n}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
