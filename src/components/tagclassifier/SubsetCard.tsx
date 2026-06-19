import { ChevronRight, ArrowUp, ArrowDown, Trash2, MousePointer2 } from "lucide-react";
import { Subset } from "./types";
import { TagInput } from "./TagInput";

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

/** One pipeline-rule group card: collapse/activate/rename/move/delete + include/exclude TagInputs. */
export const SubsetCard = ({
  sub, idx, isActive, isActiveInLibrary, isCollapsed, uniqueTags,
  onActivate, onToggleCollapse, onRename, onMoveUp, onMoveDown, onDelete, onIncludeChange, onExcludeChange,
}: SubsetCardProps) => (
  <div className="relative group animate-in slide-in-from-left-2 duration-300">
    <div className={`border rounded-3xl p-4 relative z-10 transition-all shadow-md ${isActiveInLibrary ? 'border-blue-500/40 bg-solid-element ring-1 ring-blue-500/25' : 'border-white/5 bg-solid-card hover:border-white/10 hover:bg-solid-active'}`}>
      <div className="flex items-center justify-between mb-4 relative">
        <div
          onClick={onActivate}
          className="flex items-center gap-3 flex-1 cursor-pointer py-1 min-h-[44px] pr-20"
          title="Click to activate group"
        >
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
            className="w-11 h-11 flex items-center justify-center hover:bg-white/5 rounded-xl text-neutral-400 transition-transform"
            aria-label={isCollapsed ? `Collapse group ${sub.name}` : `Expand group ${sub.name}`}
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`} />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${isActive ? 'bg-blue-600 text-white shadow-md' : 'bg-neutral-850 text-neutral-350'}`}
            >
              {idx + 1}
            </div>
            <input
              className={`bg-transparent text-xs font-black uppercase focus:outline-none w-full transition-all border-b border-transparent focus:border-blue-500/40 ${isActive ? 'text-blue-400' : 'text-neutral-350 focus:text-white'}`}
              value={sub.name}
              onChange={e => onRename(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Group ${idx + 1} Name`}
            />
            {isActiveInLibrary && <MousePointer2 className="w-3.5 h-3.5 text-blue-400 animate-pulse" />}
          </div>
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900/90 backdrop-blur-sm p-1 rounded-xl border border-white/5 z-20">
          <span role="button" onClick={onMoveUp} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg cursor-pointer" title="Move Up"><ArrowUp className="w-3.5 h-3.5" /></span>
          <span role="button" onClick={onMoveDown} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg cursor-pointer" title="Move Down"><ArrowDown className="w-3.5 h-3.5" /></span>
          <span role="button" onClick={onDelete} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></span>
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-1.5">
            <TagInput tags={sub.keywords} onChange={onIncludeChange} placeholder="Add include tag..." colorClass="indigo" suggestions={uniqueTags} />
          </div>
          <div className="space-y-1.5">
            <TagInput tags={sub.excludeKeywords} onChange={onExcludeChange} placeholder="Add exclude tag..." colorClass="red" suggestions={uniqueTags} />
          </div>
        </div>
      )}
    </div>
  </div>
);
