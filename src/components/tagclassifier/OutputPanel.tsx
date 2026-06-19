import { Terminal, CheckCircle, Download, ChevronRight } from "lucide-react";
import { Subset } from "./types";

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

/** Right sidebar "Output Streams": idle state, export controls, and the results accordion. */
export const OutputPanel = ({
  hasProcessed, fullResults, subsets, lines, expandedLines, removeDuplicates,
  onExportAll, onExportSubset, onExportUnclassified, onToggleExpanded, onRemoveDuplicatesChange,
}: OutputPanelProps) => {
  if (!hasProcessed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-solid-nested">
        <Terminal className="w-12 h-12 mb-4 text-blue-505 animate-pulse" />
        <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-neutral-200">System Idle</h3>
        <p className="text-[10px] font-bold text-neutral-400 uppercase leading-relaxed tracking-wider">Compile dataset to<br/>explore results</p>
      </div>
    );
  }

  return (
    <>
      {/* Output Controls Box */}
      <div className="p-6 border-b border-white/5 bg-solid-panel flex flex-col gap-4 shrink-0 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase text-blue-400 tracking-wider flex items-center gap-3"><CheckCircle className="w-4 h-4 text-blue-500" /> Output Stream</span>
            <p className="text-[10px] text-neutral-400 font-bold uppercase mt-1">{fullResults.length} Records Compiled</p>
          </div>
          <div className="flex gap-2">
              <button
                onClick={onExportAll}
                className="w-11 h-11 flex items-center justify-center bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-all shadow-md border border-blue-500/20"
                title="Save All Merged"
                aria-label="Export all merged results"
              >
                <Download className="w-5 h-5" />
              </button>
          </div>
        </div>

        {/* Unique Records Checkbox */}
        <div className="flex items-center gap-3 px-4 py-3 bg-solid-card rounded-xl border border-white/5 text-neutral-300 font-extrabold uppercase text-[10px] shadow-inner select-none cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            id="checkbox-unique-records"
            checked={removeDuplicates}
            onChange={e => onRemoveDuplicatesChange(e.target.checked)}
            className="w-4 h-4 rounded bg-black/40 border-white/10 text-blue-600 focus:ring-0 focus:ring-offset-0"
          />
          <label className="cursor-pointer" htmlFor="checkbox-unique-records">Unique Records Only</label>
        </div>
      </div>

      {/* Outputs Accordion list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin bg-solid-nested">
        <div className="grid grid-cols-2 gap-2 mb-4">
            {subsets.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => onExportSubset(sub)}
                  className="px-3 py-2.5 min-h-[44px] bg-solid-card hover:bg-solid-active border border-white/5 rounded-xl text-[10px] font-black uppercase text-neutral-200 hover:text-white hover:border-blue-500/30 transition-all truncate"
                  aria-label={`Export group ${sub.name}`}
                >
                  Save {sub.name}
                </button>
            ))}
            <button
              onClick={onExportUnclassified}
              className="px-3 py-2.5 min-h-[44px] bg-[#2d1217] hover:bg-[#3d1820] border border-red-500/10 rounded-xl text-[10px] font-black uppercase text-red-400 hover:text-white transition-all truncate"
              aria-label="Export unclassified items"
            >
              Unclassified
            </button>
        </div>

        {fullResults.map(res => (
          <div
            key={res.lineIndex}
            className={`p-5 border rounded-2xl cursor-pointer transition-all hover:border-blue-500/30 hover:bg-solid-active ${expandedLines.has(res.lineIndex) ? 'border-blue-500/40 bg-solid-element ring-1 ring-blue-500/25' : 'border-white/5 bg-solid-card'}`}
            onClick={() => onToggleExpanded(res.lineIndex)}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black text-neutral-355 uppercase">#L-{String(res.lineIndex).padStart(4, '0')}</span>
              <ChevronRight className={`w-4 h-4 text-neutral-400 transition-transform ${expandedLines.has(res.lineIndex) ? 'rotate-90 text-blue-500' : ''}`} />
            </div>
            <div className="space-y-3">
              {res.data.filter((s: any) => s.matches.length > 0).map((s: any) => (
                <div key={s.id} className="space-y-1.5">
                  <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg ${s.id === 0 ? 'text-neutral-200 bg-solid-nested border border-white/5' : 'text-blue-400 bg-blue-955/20 border border-blue-500/20'}`}>{s.name}</span>
                  {expandedLines.has(res.lineIndex) && (
                    <p className="text-[11px] font-mono text-neutral-200 break-all pl-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-300">
                      {s.matches.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {expandedLines.has(res.lineIndex) && (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-1">
                    <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">Original Source</span>
                    <p className="text-[10.5px] font-mono text-neutral-300 break-all leading-relaxed pl-2 bg-neutral-950 p-2 rounded-lg border border-white/5">{lines[res.lineIndex-1]}</p>
                </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};
