import { X } from "lucide-react";
import { WordGroup } from "./types";
import { TagInput } from "../ui/TagInput";
import { ICON_BTN_DANGER, HOVER_TOOLS, LIST_CARD } from "../ui/tokens";

interface WordGroupEditorProps {
  wordGroups: WordGroup[];
  uniqueTags: string[];
  onAdd: () => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onWordsChange: (id: number, words: string[]) => void;
}

/**
 * "Tag Variables" list — each `{name}` alias group with its amber TagInput.
 * Renders list content only; RulesRail owns the tab header, scroll container and add button.
 */
export const WordGroupEditor = ({ wordGroups, uniqueTags, onAdd, onRename, onDelete, onWordsChange }: WordGroupEditorProps) => {
  if (wordGroups.length === 0) {
    return (
      <p className="text-[10px] text-neutral-500 leading-relaxed px-1 py-2">
        No variables. A variable collapses interchangeable tags into one placeholder —
        define <span className="text-amber-400 font-mono">{"{color}"}</span> as
        <span className="text-neutral-400"> red, blue, pink…</span> and a rule matching
        <span className="text-neutral-400"> {"{color} dress"}</span> catches every colour.
        <button onClick={onAdd} className="block mt-2 text-amber-400 hover:text-amber-300 font-black uppercase tracking-wide text-[9px]">
          + Add variable
        </button>
      </p>
    );
  }

  return (
    <>
      {wordGroups.map(wg => (
        <div key={wg.id} className={`group ${LIST_CARD} hover:border-white/10`}>
          <div className="flex items-center gap-1">
            <span className="text-amber-500 text-[11px] font-black shrink-0 leading-none">{"{"}</span>
            <input
              className="flex-1 min-w-0 bg-transparent text-[10.5px] font-black text-amber-400 lowercase focus:outline-none border-b border-transparent focus:border-amber-500/50 transition-colors"
              value={wg.name}
              onChange={e => onRename(wg.id, e.target.value.toLowerCase())}
              aria-label="Variable identifier name"
            />
            <span className="text-amber-500 text-[11px] font-black shrink-0 leading-none">{"}"}</span>
            <div className={HOVER_TOOLS}>
              <button onClick={() => onDelete(wg.id)} className={ICON_BTN_DANGER} title="Delete variable" aria-label={`Delete variable ${wg.name}`}>
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="mt-1">
            <TagInput tags={wg.words} onChange={tags => onWordsChange(wg.id, tags)} placeholder="alias…" colorClass="emerald" suggestions={uniqueTags} />
          </div>
        </div>
      ))}
    </>
  );
};
