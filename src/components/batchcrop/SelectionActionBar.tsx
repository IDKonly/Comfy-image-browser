import { X, Copy } from "lucide-react";

interface SelectionActionBarProps {
  count: number;
  onCopySize: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

/** Floating action bar shown while crop boxes are selected (copy size / delete). */
export const SelectionActionBar = ({ count, onCopySize, onDelete }: SelectionActionBarProps) => (
  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-neutral-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4">
    <div className="px-3 py-1 border-r border-white/5 flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" /><span className="text-[10px] font-black uppercase text-blue-500 tracking-tighter">{count} Selected</span></div>
    <button onClick={onCopySize} className="p-2 hover:bg-white/5 rounded-lg text-neutral-400" title="Copy Size"><Copy className="w-4 h-4" /></button>
    <button onClick={onDelete} className="p-2 hover:bg-red-500/20 rounded-lg text-neutral-400 hover:text-red-500" title="Delete Selected"><X className="w-4 h-4" /></button>
  </div>
);
