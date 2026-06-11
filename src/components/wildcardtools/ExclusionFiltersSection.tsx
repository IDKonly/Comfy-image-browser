import { ChevronUp, ChevronDown, FileUp, Save } from "lucide-react";
import { FilterState } from "../../store/useAppStore";
import { splitCommaTrim } from "./utils";

interface ExclusionFiltersSectionProps {
  open: boolean;
  onToggle: () => void;
  filter: FilterState;
  onFilterChange: (next: FilterState) => void;
  onMergeTarget: (key: keyof FilterState) => void;
  onSaveFilterList: (key: keyof FilterState, filename: string) => void;
}

/** Collapsible editor for the partial/exact/exceptions exclusion lists. */
export const ExclusionFiltersSection = ({ open, onToggle, filter, onFilterChange, onMergeTarget, onSaveFilterList }: ExclusionFiltersSectionProps) => (
  <div className="space-y-4 pt-4 border-t border-white/5">
    <button
        onClick={onToggle}
        className="flex items-center justify-between w-full min-h-[44px] px-4 py-2.5 bg-solid-element border border-white/5 hover:bg-solid-active rounded-xl text-[10px] font-black uppercase tracking-widest text-neutral-300 transition-all"
    >
        <span className="flex items-center gap-2">Exclusion Filters</span>
        {open ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
    </button>

    {open && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in zoom-in-95 duration-300">
            {[
                { id: 'partial_match', label: 'Partial Match', filename: 'default_partial_exclusion.txt', color: 'blue' },
                { id: 'exact_match', label: 'Exact Match', filename: 'default_exact_exclusion.txt', color: 'red' },
                { id: 'exceptions', label: 'Exceptions', filename: 'default_exception_exclusion.txt', color: 'green' },
            ].map(f => (
                <div key={f.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase text-neutral-500">{f.label}</span>
                        <div className="flex gap-1">
                            <button onClick={() => onMergeTarget(f.id as any)} className="w-11 h-11 flex items-center justify-center hover:bg-white/5 rounded-xl transition-all" title="Merge from text/file">
                                <FileUp className="w-4 h-4 text-neutral-600 hover:text-blue-400" />
                            </button>
                            <button onClick={() => onSaveFilterList(f.id as any, f.filename)} className="w-11 h-11 flex items-center justify-center hover:bg-white/5 rounded-xl transition-all" title="Save as Default">
                                <Save className="w-4 h-4 text-neutral-600 hover:text-blue-400" />
                            </button>
                        </div>
                    </div>
                    <textarea
                        value={filter[f.id as keyof FilterState] as string[]}
                        onChange={e => onFilterChange({...filter, [f.id]: splitCommaTrim(e.target.value)})}
                        className="w-full h-24 bg-neutral-950 border border-white/5 rounded-xl p-3 text-[10px] font-mono focus:outline-none focus:border-blue-500/50 resize-none scrollbar-thin"
                        placeholder="tag1, tag2..."
                    />
                </div>
            ))}
        </div>
    )}
  </div>
);
