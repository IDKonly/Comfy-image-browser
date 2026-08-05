import { Copy, Download, Wand2 } from "lucide-react";
import { LABEL, BAR_BTN, BAR_BTN_GHOST } from "../ui/tokens";

interface WorkshopResultsProps {
  results: string[];
  onCopy: () => void;
  onExport: () => void;
}

/** Right rail: generated wildcard lines with copy / export actions. */
export const WorkshopResults = ({ results, onCopy, onExport }: WorkshopResultsProps) => (
  <>
    <div className="h-7 max-lg:h-14 shrink-0 flex items-center gap-1.5 px-1.5 bg-solid-panel border-b border-white/5">
      <span className={LABEL}>{results.length} results</span>
      <div className="flex-1" />
      {results.length > 0 && (
        <>
          <button onClick={onCopy} className={`${BAR_BTN} ${BAR_BTN_GHOST}`}><Copy className="w-3 h-3" /> Copy</button>
          <button onClick={onExport} className={`${BAR_BTN} ${BAR_BTN_GHOST}`}><Download className="w-3 h-3" /> Export</button>
        </>
      )}
    </div>

    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-1.5 space-y-1">
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-3">
          <Wand2 className="w-7 h-7 mb-2 text-blue-500/60" />
          <p className={LABEL}>Generate wildcards to see them here</p>
        </div>
      ) : results.map((res, i) => (
        <div key={i} className="flex items-start gap-1.5 px-1.5 py-1 bg-solid-card border border-white/5 hover:border-blue-500/30 rounded-md transition-colors">
          <span className="w-6 shrink-0 text-right text-[9px] font-mono font-black text-neutral-600 tabular-nums leading-4">{i + 1}</span>
          <code className="flex-1 min-w-0 text-[10.5px] font-mono text-neutral-300 break-all select-all leading-4">{res}</code>
        </div>
      ))}
    </div>
  </>
);
