import { Terminal, Download, ChevronRight } from "lucide-react";
import { Subset } from "./types";
import { ICON_BTN, LIST_CARD } from "../ui/tokens";

interface OutputPanelProps {
  hasProcessed: boolean;
  fullResults: any[];
  subsets: Subset[];
  lines: string[];
  expandedLines: Set<number>;
  removeDuplicates: boolean;
  onExportAll: () => void;
  onExportSubset: (sub: Subset) => void;
  onExportUnclassified: () => void;
  onToggleExpanded: (lineIndex: number) => void;
  onRemoveDuplicatesChange: (checked: boolean) => void;
}

/** Right rail "Output Streams": idle state, export controls, and the results accordion. */
export const OutputPanel = ({
  hasProcessed, fullResults, subsets, lines, expandedLines, removeDuplicates,
  onExportAll, onExportSubset, onExportUnclassified, onToggleExpanded, onRemoveDuplicatesChange,
}: OutputPanelProps) => {
  if (!hasProcessed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <Terminal className="w-7 h-7 mb-2 text-blue-500/60" />
        <h3 className="text-[10px] font-black uppercase tracking-wide text-neutral-300">System idle</h3>
        <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-wide mt-1">Compile to explore results</p>
      </div>
    );
  }

  return (
    <>
      <div className="shrink-0 px-1.5 py-1.5 border-b border-white/5 bg-solid-panel space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-wide text-neutral-300 tabular-nums">
            {fullResults.length} records
          </span>
          <div className="flex-1" />
          <label className="flex items-center gap-1 cursor-pointer select-none" title="Drop duplicate output lines on export">
            <input
              type="checkbox"
              id="checkbox-unique-records"
              checked={removeDuplicates}
              onChange={e => onRemoveDuplicatesChange(e.target.checked)}
              className="w-3 h-3 accent-blue-600"
            />
            <span className="text-[9px] font-black uppercase tracking-wide text-neutral-400">Unique only</span>
          </label>
          <button onClick={onExportAll} className={`${ICON_BTN} bg-blue-600 text-white hover:bg-blue-500 hover:text-white`} title="Save all merged" aria-label="Export all merged results">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1">
          {subsets.map(sub => (
            <button
              key={sub.id}
              onClick={() => onExportSubset(sub)}
              className="h-5 max-lg:h-10 px-1.5 bg-solid-card hover:bg-solid-active border border-white/5 hover:border-blue-500/30 rounded text-[9px] font-black uppercase tracking-wide text-neutral-300 hover:text-white transition-colors truncate"
              title={`Export ${sub.name}`}
              aria-label={`Export group ${sub.name}`}
            >
              {sub.name}
            </button>
          ))}
          <button
            onClick={onExportUnclassified}
            className="h-5 max-lg:h-10 px-1.5 bg-[#2d1217] hover:bg-[#3d1820] border border-red-500/20 rounded text-[9px] font-black uppercase tracking-wide text-red-400 hover:text-white transition-colors truncate"
            aria-label="Export unclassified items"
          >
            Unclassified
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
        {fullResults.map(res => {
          const isOpen = expandedLines.has(res.lineIndex);
          const hits = res.data.filter((s: any) => s.matches.length > 0);
          return (
            <div
              key={res.lineIndex}
              className={`${LIST_CARD} cursor-pointer ${isOpen ? 'border-blue-500/40 bg-solid-element' : 'hover:border-white/10'}`}
              onClick={() => onToggleExpanded(res.lineIndex)}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono font-black text-neutral-500 tabular-nums">#L-{String(res.lineIndex).padStart(4, '0')}</span>
                <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                  {!isOpen && hits.map((s: any) => (
                    <span key={s.id} className={`h-[15px] px-1 rounded text-[9px] font-black uppercase tracking-wide flex items-center ${s.id === 0 ? 'bg-neutral-900 text-neutral-500' : 'bg-blue-955/30 text-blue-400'}`}>
                      {s.name}
                    </span>
                  ))}
                </div>
                <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? 'rotate-90 text-blue-500' : 'text-neutral-500'}`} />
              </div>

              {isOpen && (
                <div className="mt-1 space-y-1 animate-in fade-in duration-150">
                  {hits.map((s: any) => (
                    <div key={s.id} className="flex items-start gap-1.5">
                      <span className={`w-[4.5rem] shrink-0 text-right text-[9px] font-black uppercase tracking-wide leading-4 truncate ${s.id === 0 ? 'text-neutral-500' : 'text-blue-400'}`} title={s.name}>
                        {s.name}
                      </span>
                      <p className="flex-1 min-w-0 text-[10px] font-mono text-neutral-200 break-all leading-4">{s.matches.join(', ')}</p>
                    </div>
                  ))}
                  <div className="pt-1 mt-1 border-t border-white/5">
                    <span className="text-[8px] font-black text-neutral-600 uppercase tracking-wide">Source</span>
                    <p className="text-[10px] font-mono text-neutral-400 break-all leading-4">{lines[res.lineIndex - 1]}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};
