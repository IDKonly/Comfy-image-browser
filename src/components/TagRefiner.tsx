import { useState, useMemo } from "react";
import { X, Search, CheckSquare, Square, EyeOff, Filter } from "lucide-react";

interface TagRefinerProps {
  tagCounts: Record<string, number>;
  initialExcluded: string[];
  partialMatch?: string[];
  onApply: (excluded: string[]) => void;
  onClose: () => void;
}

export const TagRefiner = ({ tagCounts, initialExcluded, partialMatch = [], onApply, onClose }: TagRefinerProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [excludedTags, setExcludedTags] = useState<Set<string>>(new Set(initialExcluded));
  const [hideChecked, setHideChecked] = useState(false);

  // Helper to check if a tag matches any partial filter
  const isPartiallyMatched = (tag: string) => {
    if (partialMatch.length === 0) return false;
    const lowTag = tag.toLowerCase();
    return partialMatch.some(p => p && p.trim() !== "" && lowTag.includes(p.toLowerCase().trim()));
  };

  const sortedTags = useMemo(() => {
    return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  }, [tagCounts]);

  const filteredTags = useMemo(() => {
    return sortedTags.filter(([tag]) => {
      const matchesSearch = tag.toLowerCase().includes(searchTerm.toLowerCase());
      const isExcluded = excludedTags.has(tag) || isPartiallyMatched(tag);
      const isHidden = hideChecked && isExcluded;
      return matchesSearch && !isHidden;
    });
  }, [sortedTags, searchTerm, hideChecked, excludedTags, partialMatch]);

  const toggleTag = (tag: string) => {
    const newExcluded = new Set(excludedTags);
    if (newExcluded.has(tag)) {
      newExcluded.delete(tag);
    } else {
      newExcluded.add(tag);
    }
    setExcludedTags(newExcluded);
  };

  const checkAllVisible = () => {
    const newExcluded = new Set(excludedTags);
    filteredTags.forEach(([tag]) => newExcluded.add(tag));
    setExcludedTags(newExcluded);
  };

  const uncheckAllVisible = () => {
    const newExcluded = new Set(excludedTags);
    filteredTags.forEach(([tag]) => newExcluded.delete(tag));
    setExcludedTags(newExcluded);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-lg h-[80vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
              <Filter className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest">Refine Tags</h2>
              <p className="text-[10px] text-neutral-500 font-bold uppercase">Select tags to exclude</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Controls */}
        <div className="p-6 space-y-4 border-b border-white/5 bg-neutral-950/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
            <input 
              type="text" 
              placeholder="Search tags..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-950 border border-white/5 rounded-xl py-2.5 pl-10 text-[11px] focus:outline-none focus:border-blue-500/50 transition-all"
            />
          </div>
          
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button 
                onClick={checkAllVisible}
                className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase transition-all"
              >
                <CheckSquare className="w-3.5 h-3.5" /> Check All
              </button>
              <button 
                onClick={uncheckAllVisible}
                className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase transition-all"
              >
                <Square className="w-3.5 h-3.5" /> Uncheck All
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={hideChecked} 
                onChange={e => setHideChecked(e.target.checked)}
                className="hidden"
              />
              <div className={`p-1.5 rounded-lg border transition-all ${hideChecked ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-500 group-hover:text-neutral-300'}`}>
                <EyeOff className="w-3.5 h-3.5" />
              </div>
              <span className="text-[9px] font-black uppercase text-neutral-500 group-hover:text-neutral-300 transition-colors">Hide Checked</span>
            </label>
          </div>
        </div>

        {/* Tag List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
          {filteredTags.map(([tag, count]) => {
            const isPartial = isPartiallyMatched(tag);
            const isChecked = excludedTags.has(tag) || isPartial;
            
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`w-full flex items-center justify-between px-4 py-2 rounded-xl transition-all group ${isChecked ? 'bg-blue-600/10 text-blue-400' : 'hover:bg-white/5 text-neutral-400 hover:text-white'}`}
              >
                <div className="flex items-center gap-3 truncate">
                  {isChecked ? <CheckSquare className={`w-4 h-4 shrink-0 ${isPartial ? 'text-amber-500' : ''}`} /> : <Square className="w-4 h-4 shrink-0 opacity-20 group-hover:opacity-100" />}
                  <span className={`text-[11px] font-medium truncate ${isPartial ? 'text-amber-500/80' : ''}`}>{tag}</span>
                  {isPartial && <span className="text-[7px] font-black uppercase bg-amber-500/20 text-amber-500 px-1 rounded shrink-0">Auto:Partial</span>}
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${isChecked ? 'bg-blue-600/20' : 'bg-neutral-800'}`}>{count}</span>
              </button>
            );
          })}
          {filteredTags.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
              <Search className="w-12 h-12 mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">No tags found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-neutral-950/30 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={() => onApply(Array.from(excludedTags))}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20"
          >
            Apply Filters ({excludedTags.size})
          </button>
        </div>
      </div>
    </div>
  );
};
