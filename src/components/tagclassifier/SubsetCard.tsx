import { ChevronRight, ArrowUp, ArrowDown, Trash2, MousePointer2 } from "lucide-react";
import { Subset } from "./types";
import { TagInput } from "../ui/TagInput";
import { ICON_BTN, ICON_BTN_DANGER, HOVER_TOOLS, LIST_CARD } from "../ui/tokens";

interface SubsetCardProps {
  sub: Subset;
  idx: number;
  isActive: boolean;
  isActiveInLibrary: boolean;
  isCollapsed: boolean;
  uniqueTags: string[];
  onActivate: () => void;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onIncludeChange: (tags: string[]) => void;
  onExcludeChange: (tags: string[]) => void;
}

/**
 * One pipeline-rule group card: collapse/activate/rename/move/delete + include/exclude TagInputs.
 * Collapsed cards fall back to an include/exclude count so the row still carries information.
 */
export const SubsetCard = ({
  sub, idx, isActive, isActiveInLibrary, isCollapsed, uniqueTags,
  onActivate, onToggleCollapse, onRename, onMoveUp, onMoveDown, onDelete, onIncludeChange, onExcludeChange,
}: SubsetCardProps) => (
  <div
    className={`group ${LIST_CARD} ${isActiveInLibrary ? 'border-blue-500/40 bg-solid-element' : 'hover:border-white/10'}`}
  >
    <div className="flex items-center gap-1">
      <button
        onClick={onToggleCollapse}
        className={ICON_BTN}
        aria-label={isCollapsed ? `Expand group ${sub.name}` : `Collapse group ${sub.name}`}
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`} />
      </button>

      <button
        onClick={onActivate}
        className={`w-4 h-4 max-lg:w-7 max-lg:h-7 shrink-0 rounded flex items-center justify-center text-[9px] font-black transition-colors ${isActive ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
        title="Activate this group for the Library view"
        aria-label={`Activate group ${sub.name}`}
      >
        {idx + 1}
      </button>

      <input
        className={`flex-1 min-w-0 bg-transparent text-[10.5px] font-black uppercase tracking-wide focus:outline-none border-b border-transparent focus:border-blue-500/50 transition-colors ${isActive ? 'text-blue-400' : 'text-neutral-300 focus:text-white'}`}
        value={sub.name}
        onChange={e => onRename(e.target.value)}
        aria-label={`Group ${idx + 1} name`}
      />

      {isActiveInLibrary && <MousePointer2 className="w-3 h-3 text-blue-400 shrink-0" />}

      {isCollapsed ? (
        <span className="text-[9px] font-mono text-neutral-500 shrink-0 tabular-nums px-1" title="include / exclude tag count">
          {sub.keywords.length}/{sub.excludeKeywords.length}
        </span>
      ) : (
        <div className={HOVER_TOOLS}>
          <button onClick={onMoveUp} className={ICON_BTN} title="Move up" aria-label={`Move ${sub.name} up`}><ArrowUp className="w-3 h-3" /></button>
          <button onClick={onMoveDown} className={ICON_BTN} title="Move down" aria-label={`Move ${sub.name} down`}><ArrowDown className="w-3 h-3" /></button>
          <button onClick={onDelete} className={ICON_BTN_DANGER} title="Delete group" aria-label={`Delete ${sub.name}`}><Trash2 className="w-3 h-3" /></button>
        </div>
      )}
    </div>

    {!isCollapsed && (
      <div className="mt-1 space-y-1">
        <TagInput tags={sub.keywords} onChange={onIncludeChange} placeholder="include…" colorClass="indigo" suggestions={uniqueTags} />
        <TagInput tags={sub.excludeKeywords} onChange={onExcludeChange} placeholder="exclude…" colorClass="red" suggestions={uniqueTags} />
      </div>
    )}
  </div>
);
