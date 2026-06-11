import { Search, XCircle, CheckCircle } from "lucide-react";
import { Subset } from "./types";

type ActionMode = 'include' | 'exclude';

interface LibraryViewProps {
  subsets: Subset[];
  uniqueTags: string[];
  dictActiveSubsetId: number | null;
  dictActionMode: ActionMode;
  tagSearchQuery: string;
  onSelectSubset: (id: number) => void;
  onActionModeChange: (mode: ActionMode) => void;
  onSearchChange: (value: string) => void;
  onToggleTag: (tag: string) => void;
}

/** "Library" view: layer selector + action mode + tag search + the toggleable tag grid. */
export const LibraryView = ({
  subsets, uniqueTags, dictActiveSubsetId, dictActionMode, tagSearchQuery,
  onSelectSubset, onActionModeChange, onSearchChange, onToggleTag,
}: LibraryViewProps) => (
  <div className="flex-1 flex flex-col gap-6 overflow-hidden animate-in slide-in-from-right-4 duration-500">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 bg-solid-panel p-5 rounded-3xl border border-white/5 shadow-2xl">
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase text-neutral-300 tracking-widest block ml-2">Active Pipeline Layer</label>
        <div className="flex flex-wrap gap-2">
            {subsets.map(s => (
                <button
                    key={s.id}
                    onClick={() => onSelectSubset(s.id)}
                    className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border min-h-[44px] ${dictActiveSubsetId === s.id ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-black/30 border-white/10 text-neutral-200 hover:text-white'}`}
                    aria-label={`Activate layer ${s.name}`}
                >
                    {s.name}
                </button>
            ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase text-neutral-350 tracking-widest block ml-2">Action Mode</label>
        <div className="flex bg-neutral-950 rounded-xl border border-white/5 p-1 shadow-inner min-h-[44px] items-center">
            <button onClick={() => onActionModeChange('include')} className={`flex-1 py-2.5 min-h-[38px] flex items-center justify-center rounded-lg text-[10px] font-black uppercase transition-all ${dictActionMode === 'include' ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-300 hover:text-white'}`}>Include (+)</button>
            <button onClick={() => onActionModeChange('exclude')} className={`flex-1 py-2.5 min-h-[38px] flex items-center justify-center rounded-lg text-[10px] font-black uppercase transition-all ${dictActionMode === 'exclude' ? 'bg-red-600 text-white shadow-md' : 'text-neutral-300 hover:text-white'}`}>Exclude (-)</button>
        </div>
      </div>
      <div className="space-y-2 relative">
        <label className="text-[10px] font-black uppercase text-neutral-350 tracking-widest block ml-2" htmlFor="search-global-tags">Search Global Dataset</label>
        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              id="search-global-tags"
              className="w-full bg-neutral-950 border border-white/5 focus:border-blue-500/50 rounded-xl pl-12 pr-4 py-2.5 text-xs font-bold text-white outline-none placeholder-neutral-600 shadow-inner min-h-[44px]"
              value={tagSearchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Filter unique tags..."
            />
        </div>
      </div>
    </div>

    {/* Library tag items layout */}
    <div className="flex-1 overflow-y-auto bg-neutral-950 rounded-3xl border border-white/5 p-6 shadow-inner scrollbar-thin">
        <div className="flex flex-wrap gap-2.5 content-start">
        {uniqueTags.filter(t => t.toLowerCase().includes(tagSearchQuery.toLowerCase())).map(tag => {
            const activeSub = subsets.find(s => s.id === dictActiveSubsetId);
            const isInc = activeSub?.keywords.includes(tag);
            const isExc = activeSub?.excludeKeywords.includes(tag);
            const isIncVar = !isInc && activeSub?.keywords.some(k => tag.includes(k.replace(/\{.*?\}/, '')));
            const isExcVar = !isExc && activeSub?.excludeKeywords.some(k => tag.includes(k.replace(/\{.*?\}/, '')));

            let style = "bg-solid-card text-neutral-300 border-white/5 hover:bg-solid-active hover:text-white hover:border-blue-500/20";
            let tooltip = "Toggle Tag Selection";
            let indicator = null;

            if (isIncVar) {
              style = "bg-[#162235] text-blue-405 border-blue-500/20 border-dashed hover:bg-[#1f2e45]";
              indicator = <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />;
            }
            if (!isInc && isExcVar) {
              style = "bg-[#2d1217] text-red-405 border-red-500/20 border-dashed hover:bg-[#3d1820]";
              indicator = <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />;
            }
            if (isExc) {
              style = "bg-red-600 border-red-500 text-white shadow-md font-black";
              tooltip = "Explicitly Excluded";
              indicator = <XCircle className="w-3.5 h-3.5 text-white" />;
            }
            if (isInc) {
              style = "bg-blue-600 border-blue-500 text-white shadow-md font-black";
              tooltip = "Explicitly Included";
              indicator = <CheckCircle className="w-3.5 h-3.5 text-white" />;
            }

            const hasVar = /\{.*?\}/.test(tag);

            return (
              <button
                key={tag}
                title={hasVar ? "Click 1: Base | Click 2: Full | Click 3: Clear" : tooltip}
                onClick={() => onToggleTag(tag)}
                className={`px-4 py-2.5 rounded-2xl text-[11px] font-mono border transition-all active:scale-95 flex items-center gap-2 min-h-[44px] ${style}`}
                aria-label={`Toggle tag ${tag}`}
              >
                {indicator}
                {tag}
              </button>
            );
        })}
    </div></div>
  </div>
);
