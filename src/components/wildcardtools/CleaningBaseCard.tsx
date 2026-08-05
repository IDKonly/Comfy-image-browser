import { X } from "lucide-react";
import { basename } from "./utils";
import { LABEL, FIELD, ICON_BTN_DANGER } from "../ui/tokens";

interface CleaningBaseCardProps {
  comparisonPath: string | null;
  onClearComparisonPath: () => void;
  comparisonText: string;
  onComparisonTextChange: (v: string) => void;
}

/**
 * "Cleaning Base": tags listed here (or carried by the base image) are subtracted from
 * every result, so boilerplate like `masterpiece, best quality` never reaches the output.
 */
export const CleaningBaseCard = ({
  comparisonPath, onClearComparisonPath, comparisonText, onComparisonTextChange,
}: CleaningBaseCardProps) => (
  <div className="bg-[#1c1509] border border-amber-900/50 rounded-lg p-1.5 space-y-1">
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-black uppercase tracking-wide text-amber-400">Cleaning base</span>
      <span className="text-[9px] text-neutral-600 truncate">Tags subtracted from every result</span>
    </div>

    <div className="flex items-center gap-2">
      <span className={`${LABEL} w-[4.5rem] shrink-0 text-right`}>Base image</span>
      <span className={`${FIELD} flex items-center truncate ${comparisonPath ? 'border-amber-500/40 text-neutral-200' : 'text-neutral-600'}`}>
        {comparisonPath ? basename(comparisonPath) : "Drop an image here"}
      </span>
      {comparisonPath && (
        <button onClick={onClearComparisonPath} className={ICON_BTN_DANGER} aria-label="Clear base image">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>

    <div className="flex items-start gap-2">
      <span className={`${LABEL} w-[4.5rem] shrink-0 text-right leading-6`}>Subtract</span>
      <textarea
        value={comparisonText}
        onChange={e => onComparisonTextChange(e.target.value)}
        aria-label="Subtractive tags"
        className="flex-1 min-w-0 h-10 bg-neutral-950 border border-white/10 focus:border-amber-500/40 rounded-md px-1.5 py-1 text-[10px] font-mono text-neutral-200 placeholder-neutral-600 outline-none resize-none scrollbar-thin transition-colors"
        placeholder="masterpiece, best quality, solo…"
      />
    </div>
  </div>
);
