import { MousePointer2 } from "lucide-react";

/** Bottom status/help bar for the batch crop workspace. */
export const CropHints = ({ fileName }: { fileName: string }) => (
  <footer className="h-10 bg-neutral-950 border-t border-white/5 flex items-center justify-between px-6 shrink-0 text-[9px] text-neutral-500 uppercase font-bold">
    <div className="flex gap-6">
      <div className="flex items-center gap-1.5"><MousePointer2 className="w-3 h-3" /> Drag to Draw</div>
      <div className="flex items-center gap-1.5 text-blue-500"><div className="w-1 h-1 bg-blue-500 rounded-full" /> Shift+Click: Multi-select</div>
      <div className="flex items-center gap-1.5 text-amber-500"><div className="w-1 h-1 bg-amber-500 rounded-full" /> Shift+Drag: Axis/Ratio Lock</div>
      <div className="flex items-center gap-1.5 text-neutral-400"><div className="w-1 h-1 bg-neutral-400 rounded-full" /> Alt: Ignore Snap</div>
    </div>
    <div className="font-mono text-[10px]">{fileName}</div>
  </footer>
);
