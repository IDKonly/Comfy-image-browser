import { Copy, Download } from "lucide-react";

interface WorkshopResultsProps {
  results: string[];
  onCopy: () => void;
  onExport: () => void;
}

/** Results panel with copy / export actions and the numbered result rows. */
export const WorkshopResults = ({ results, onCopy, onExport }: WorkshopResultsProps) => {
  if (results.length === 0) return null;
  return (
    <div className="pt-6 border-t border-white/5 space-y-4 animate-in slide-in-from-bottom-4 duration-300 pb-10">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-neutral-500">Workshop Results ({results.length})</span>
        <div className="flex gap-2">
            <button onClick={onCopy} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase text-neutral-400 hover:text-white transition-all">
                <Copy className="w-3.5 h-3.5" /> Copy
            </button>
            <button onClick={onExport} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/20 rounded-lg text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 transition-all">
                <Download className="w-3.5 h-3.5" /> Export .txt
            </button>
        </div>
      </div>
      <div className="bg-neutral-950 border border-white/5 rounded-2xl p-4 max-h-[400px] overflow-y-auto space-y-2 scrollbar-thin shadow-inner">
        {results.map((res, i) => (
          <div key={i} className="group flex gap-3 p-3 bg-neutral-900/50 rounded-xl border border-white/5 hover:border-blue-500/30 transition-all shadow-sm">
            <div className="w-5 h-5 rounded-md bg-neutral-800 flex items-center justify-center text-[9px] font-black text-neutral-600 shrink-0">{i+1}</div>
            <code className="text-[11px] text-neutral-300 break-all select-all leading-relaxed">{res}</code>
          </div>
        ))}
      </div>
    </div>
  );
};
