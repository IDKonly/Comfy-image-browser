import { Info, X } from "lucide-react";
import { basename } from "./utils";

interface CleaningBaseCardProps {
  comparisonPath: string | null;
  onClearComparisonPath: () => void;
  comparisonText: string;
  onComparisonTextChange: (v: string) => void;
}

/** "Cleaning Base" card: subtract common tags via a base image and/or subtractive text. */
export const CleaningBaseCard = ({ comparisonPath, onClearComparisonPath, comparisonText, onComparisonTextChange }: CleaningBaseCardProps) => (
  <div className="grid grid-cols-2 gap-4 bg-[#241a10] border border-[#4a351a] p-4 rounded-2xl">
    <div className="col-span-2 flex items-center gap-2 mb-1">
        <span className="text-[10px] font-black uppercase text-amber-400 tracking-widest">Cleaning Base (Subtract Common Tags)</span>
        <Info className="w-3 h-3 text-amber-500" />
    </div>
    {/* Base Image */}
     <div className="space-y-2">
        <span className="text-[8px] font-black uppercase text-neutral-400 tracking-widest">Base Image</span>
        <div className={`p-3 rounded-xl border min-h-[50px] flex items-center justify-between transition-all ${comparisonPath ? 'bg-neutral-950 border-amber-500/30 shadow-[inner_0_2px_4px_rgba(0,0,0,0.3)]' : 'bg-neutral-950 border-white/5'}`}>
            <span className="text-[10px] text-neutral-400 truncate">{comparisonPath ? basename(comparisonPath) : "Drag image here"}</span>
            {comparisonPath && <button onClick={onClearComparisonPath} className="w-11 h-11 flex items-center justify-center hover:bg-red-900/20 rounded text-red-500 shrink-0"><X className="w-4 h-4" /></button>}
        </div>
    </div>
    {/* Subtractive Text */}
    <div className="space-y-2">
        <span className="text-[8px] font-black uppercase text-neutral-400 tracking-widest">Subtractive Tags</span>
        <textarea
            value={comparisonText}
            onChange={e => onComparisonTextChange(e.target.value)}
            className="w-full h-[50px] bg-neutral-950 border border-white/5 rounded-xl p-3 text-[10px] font-mono text-neutral-300 focus:outline-none focus:border-amber-500/30 resize-none scrollbar-thin"
            placeholder="masterpiece, best quality, solo..."
        />
    </div>
  </div>
);
