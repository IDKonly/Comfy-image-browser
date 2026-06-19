import { useState } from "react";
import { X } from "lucide-react";
import { splitCommaOrNewline } from "./utils";

interface MergeFilterModalProps {
  onMerge: (tags: string[]) => void;
  onClose: () => void;
}

/** Small modal to paste comma/newline-separated tags and merge them into a filter list. */
export const MergeFilterModal = ({ onMerge, onClose }: MergeFilterModalProps) => {
  const [input, setInput] = useState("");

  const processMerge = () => {
    const tags = splitCommaOrNewline(input);
    onMerge(tags);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-white">Merge Tags</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
            <p className="text-[10px] text-neutral-300 font-bold uppercase">Paste tags (comma or newline separated)</p>
            <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                className="w-full h-40 bg-neutral-950 border border-white/5 rounded-2xl p-4 text-[11px] font-mono focus:outline-none focus:border-blue-500/50 resize-none scrollbar-thin"
                placeholder="tag1, tag2, tag3..."
            />
            <button
                onClick={processMerge}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-xl"
            >
                Merge Into List
            </button>
        </div>
      </div>
    </div>
  );
};
