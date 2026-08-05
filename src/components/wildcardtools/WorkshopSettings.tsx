import { FilterState } from "../../store/useAppStore";
import { splitCommaTrimNonEmpty } from "./utils";
import { LABEL, FIELD } from "../ui/tokens";

interface WorkshopSettingsProps {
  threshold: number;
  onThresholdChange: (n: number) => void;
  filter: FilterState;
  onFilterChange: (next: FilterState) => void;
}

/** Inline label + control pair, sized to sit several-per-row. */
const Cell = ({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) => (
  <label className="flex items-center gap-1.5 min-w-0" title={title}>
    <span className={`${LABEL} shrink-0 whitespace-nowrap`}>{label}</span>
    {children}
  </label>
);

/** Small on/off pill used for the three mode switches. */
const ModeToggle = ({ label, active, onToggle, color, title }: {
  label: string; active: boolean; onToggle: () => void; color: 'amber' | 'indigo' | 'emerald'; title: string;
}) => {
  const on = {
    amber: 'bg-amber-600/25 border-amber-500/50 text-amber-300',
    indigo: 'bg-indigo-600/25 border-indigo-500/50 text-indigo-300',
    emerald: 'bg-emerald-600/25 border-emerald-500/50 text-emerald-300',
  }[color];
  return (
    <button
      onClick={onToggle}
      title={title}
      aria-pressed={active}
      className={`h-6 max-lg:h-11 px-2 rounded-md border text-[9px] font-black uppercase tracking-wide transition-colors shrink-0 ${
        active ? on : 'bg-neutral-950 border-white/10 text-neutral-500 hover:text-neutral-300'
      }`}
    >
      {label}
    </button>
  );
};

/**
 * Similarity / word / tag / depth controls, the Simple·Mix·Order mode switches, and the
 * advanced Mix sliders. Laid out as wrapping inline rows rather than a 5-column grid of
 * `p-3 rounded-2xl` cards, so the whole settings block costs two rows instead of five.
 */
export const WorkshopSettings = ({ threshold, onThresholdChange, filter, onFilterChange }: WorkshopSettingsProps) => (
  <div className="space-y-1.5">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {!filter.simple_mode && (
        <>
          <Cell label="Similarity" title="How close two prompts must be to share a wildcard branch">
            <input
              type="range" min={0} max={1} step={0.05}
              value={filter.preserve_order ? 1 : threshold}
              disabled={filter.preserve_order}
              onChange={e => { if (!filter.preserve_order) onThresholdChange(parseFloat(e.target.value)); }}
              aria-label="Similarity threshold"
              className="w-24 accent-blue-600 h-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            />
            <span className="w-8 text-[10px] font-mono font-black text-blue-400 tabular-nums">
              {filter.preserve_order ? '1.00' : threshold.toFixed(2)}
            </span>
          </Cell>

          <Cell label="Max words" title="Maximum words allowed in a single tag">
            <input
              type="number" value={filter.max_words}
              onChange={e => onFilterChange({ ...filter, max_words: parseInt(e.target.value) })}
              aria-label="Max words per tag"
              className={`${FIELD} w-12`}
            />
          </Cell>

          <Cell label="Min tags" title="Minimum tags a group must have to be emitted">
            <input
              type="number" value={filter.min_tags}
              onChange={e => onFilterChange({ ...filter, min_tags: parseInt(e.target.value) })}
              aria-label="Min tags per group"
              className={`${FIELD} w-12`}
            />
          </Cell>

          <Cell label="Max depth" title="Limits recursive pattern matching. Lower values give flatter, simpler wildcards.">
            <input
              type="number" value={filter.max_depth}
              onChange={e => onFilterChange({ ...filter, max_depth: parseInt(e.target.value) })}
              aria-label="Max recursive depth"
              className={`${FIELD} w-12`}
            />
          </Cell>
        </>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <ModeToggle
          label="Simple" color="amber" active={filter.simple_mode}
          title="Simple mode — plain string removal only, no similarity analysis"
          onToggle={() => onFilterChange({ ...filter, simple_mode: !filter.simple_mode })}
        />
        <ModeToggle
          label="Mix" color="indigo" active={filter.mix_mode}
          title="Mix mode — recombine branches across prompts"
          onToggle={() => onFilterChange({ ...filter, mix_mode: !filter.mix_mode })}
        />
        <ModeToggle
          label="Order" color="emerald" active={filter.preserve_order}
          title="Preserve order — keeps original tag order and locks similarity to 1.00"
          onToggle={() => onFilterChange({ ...filter, preserve_order: !filter.preserve_order })}
        />
      </div>
    </div>

    {filter.simple_mode && (
      <div className="flex items-start gap-2">
        <span className={`${LABEL} w-[5rem] shrink-0 text-right leading-6 text-amber-400`}>Simple excl.</span>
        <textarea
          value={filter.simple_exclusions.join(', ')}
          onChange={e => onFilterChange({ ...filter, simple_exclusions: splitCommaTrimNonEmpty(e.target.value) })}
          aria-label="Simple mode exclusions"
          className="flex-1 min-w-0 h-10 bg-neutral-950 border border-amber-900/50 focus:border-amber-500/40 rounded-md px-1.5 py-1 text-[10px] font-mono text-neutral-200 placeholder-neutral-600 outline-none resize-none scrollbar-thin transition-colors"
          placeholder="masterpiece, best quality, solo, rating:safe…"
        />
      </div>
    )}

    {!filter.simple_mode && filter.mix_mode && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1.5 py-1 bg-indigo-950/25 border border-indigo-500/25 rounded-md">
        <Cell label="Mix depth" title="Branch depth at which mixing starts">
          <input
            type="range" min={0} max={10} step={1} value={filter.mix_depth}
            onChange={e => onFilterChange({ ...filter, mix_depth: parseInt(e.target.value) })}
            aria-label="Mix depth"
            className="w-20 accent-indigo-500 h-1 cursor-pointer"
          />
          <span className="w-5 text-[10px] font-mono font-black text-indigo-300 tabular-nums">{filter.mix_depth}</span>
        </Cell>
        <Cell label="Min branches" title="Minimum sibling branches required before mixing">
          <input
            type="range" min={1} max={10} step={1} value={filter.mix_tandem_min_branches}
            onChange={e => onFilterChange({ ...filter, mix_tandem_min_branches: parseInt(e.target.value) })}
            aria-label="Minimum branches"
            className="w-20 accent-indigo-500 h-1 cursor-pointer"
          />
          <span className="w-5 text-[10px] font-mono font-black text-indigo-300 tabular-nums">{filter.mix_tandem_min_branches}</span>
        </Cell>
        <Cell label="Tandem" title="Share of branches that must move together">
          <input
            type="range" min={0.1} max={1} step={0.01} value={filter.mix_tandem_ratio}
            onChange={e => onFilterChange({ ...filter, mix_tandem_ratio: parseFloat(e.target.value) })}
            aria-label="Tandem ratio"
            className="w-20 accent-indigo-500 h-1 cursor-pointer"
          />
          <span className="w-8 text-[10px] font-mono font-black text-indigo-300 tabular-nums">
            {((filter.mix_tandem_ratio || 0.51) * 100).toFixed(0)}%
          </span>
        </Cell>
      </div>
    )}
  </div>
);
