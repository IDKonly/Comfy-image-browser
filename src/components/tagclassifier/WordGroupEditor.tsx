import { Box, Plus, X } from "lucide-react";
import { WordGroup } from "./types";
import { TagInput } from "./TagInput";

interface WordGroupEditorProps {
  wordGroups: WordGroup[];
  uniqueTags: string[];
  onAdd: () => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onWordsChange: (id: number, words: string[]) => void;
}

/** "Tag Variables" panel: each {name} alias group with its emerald TagInput. */
export const WordGroupEditor = ({ wordGroups, uniqueTags, onAdd, onRename, onDelete, onWordsChange }: WordGroupEditorProps) => (
  <div className="p-4 border-t border-white/5 bg-solid-nested shrink-0">
    <div className="flex items-center justify-between mb-4">
      <span className="text-[10px] font-black uppercase text-neutral-305 tracking-widest flex items-center gap-2"><Box className="w-3.5 h-3.5 text-amber-500" /> Tag Variables</span>
      <button
        onClick={onAdd}
        className="w-11 h-11 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
        aria-label="Add tag variable group"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
    <div className="space-y-3 max-h-56 overflow-y-auto scrollbar-thin pr-2">
      {wordGroups.map(wg => (
        <div key={wg.id} className="p-4 bg-solid-card border border-white/5 rounded-3xl group">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-500 text-xs font-black">{"{"}</span>
            <input
              className="bg-transparent text-xs font-black text-amber-400 focus:outline-none w-full uppercase border-b border-transparent focus:border-blue-500/35"
              value={wg.name}
              onChange={e => onRename(wg.id, e.target.value.toLowerCase())}
              aria-label="Variable identifier name"
            />
            <span className="text-amber-500 text-xs font-black">{"}"}</span>
            <span
              role="button"
              onClick={() => onDelete(wg.id)}
              className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer md:opacity-0 md:group-hover:opacity-100"
              title="Delete variable group"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          </div>
          <TagInput tags={wg.words} onChange={tags => onWordsChange(wg.id, tags)} placeholder="Add alias tag..." colorClass="emerald" suggestions={uniqueTags} />
        </div>
      ))}
    </div>
  </div>
);
