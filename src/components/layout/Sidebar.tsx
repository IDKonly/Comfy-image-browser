import { useState, useEffect } from "react";
import { api } from "../../api";
import { Search, Zap, Filter, FolderPlus, X, Minus, Plus } from "lucide-react";
import { ImageInfo, useAppStore } from "../../store/useAppStore";
import { ImageGrid } from "../ImageGrid";
import { FilterPanel } from "../FilterPanel";

interface SidebarProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  handleSearch: (overrideFilters?: { model: string, sampler: string }, overrideSort?: any) => Promise<void>;
  handleAutoClassify: () => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  folderPath: string | null;
  isSearching: boolean;
  moveSearchResults: () => void;
  images: ImageInfo[];
  currentIndex: number;
  batchRange: [number, number] | null;
  setCurrentIndex: (i: number) => void;
  reloadTimestamp: number;
  activeFilters: { model: string, sampler: string };
  handleFilterChange: (f: any) => void;
  onImageContextMenu?: (e: React.MouseEvent, path: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const Sidebar = ({
  searchQuery,
  setSearchQuery,
  handleSearch,
  handleAutoClassify,
  showFilters,
  setShowFilters,
  folderPath,
  isSearching,
  moveSearchResults,
  images,
  currentIndex,
  batchRange,
  setCurrentIndex,
  reloadTimestamp,
  activeFilters,
  handleFilterChange,
  onImageContextMenu,
  className,
  style
}: SidebarProps) => {
  const {
    sortMethod, setSortMethod, recursive, checkedIndices, clearChecks, setCheckedIndices, viewMode,
    searchAuthFolders, setSearchAuthFolders, similaritySearchActive, setSimilaritySearchActive,
    peakingColumns, setPeakingColumns,
  } = useAppStore();
  const [suggestions, setSuggestions] = useState<[string, number][]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!folderPath || !searchQuery) {
      setSuggestions([]);
      return;
    }
    const words = searchQuery.split(',');
    const currentWord = words[words.length - 1].trim();
    if (currentWord.length < 2) {
      setSuggestions([]);
      return;
    }
    const fetchSuggestions = async () => {
      try {
        const res = await api.getTagSuggestions(folderPath, currentWord, recursive);
        setSuggestions(res);
      } catch (e) {
        console.error("Failed to fetch suggestions", e);
      }
    };
    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, folderPath, recursive]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setShowSuggestions(false);
      handleSearch();
    } else if (e.key === 'Tab' && suggestions.length > 0 && showSuggestions) {
      e.preventDefault();
      const words = searchQuery.split(',');
      words[words.length - 1] = " " + suggestions[0][0];
      setSearchQuery(words.join(',').trimStart() + ", ");
      setShowSuggestions(false);
    }
  };

  return (
    <aside 
      className={`flex flex-col bg-neutral-900 border-r border-white/5 h-full shrink-0 transition-none text-white ${className || ''}`}
      style={style}
    >
      <div className="p-4 border-b border-white/5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest hidden md:block">Search & Discovery</span>
            {viewMode === 'Peaking' && checkedIndices.length > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                    <span className="text-[9px] font-black text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">{checkedIndices.length} Selected</span>
                    <button onClick={clearChecks} className="w-11 h-11 flex items-center justify-center hover:bg-white/5 rounded-md text-neutral-500 hover:text-white transition-colors" title="Clear Selection"><X className="w-4 h-4" /></button>
                </div>
            )}
        </div>
        
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-blue-500 transition-colors" />
          <input 
            id="search-input"
            className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 min-h-[44px] text-xs text-white placeholder:text-neutral-600 outline-none focus:border-blue-500/50 transition-all shadow-inner"
            placeholder="Filter prompt..."
            value={searchQuery}
            onChange={(e) => { 
              setSearchQuery(e.target.value); 
              setShowSuggestions(true); 
              if (similaritySearchActive) setSimilaritySearchActive(false);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl">
              {suggestions.map(([sug, count], idx) => (
                <div 
                  key={idx} 
                  className="group px-3 py-2 text-[10px] text-neutral-300 hover:bg-blue-600/30 hover:text-white cursor-pointer transition-colors flex items-center justify-between"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const words = searchQuery.split(',');
                    words[words.length - 1] = " " + sug;
                    setSearchQuery(words.join(',').trimStart() + ", ");
                    setShowSuggestions(false);
                    document.getElementById('search-input')?.focus();
                  }}
                >
                  <span>{sug}</span>
                  <span className="text-[9px] text-neutral-500 px-1.5 py-0.5 bg-neutral-900/50 rounded-full font-mono group-hover:text-blue-200 group-hover:bg-blue-900/30 transition-all">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <label className="flex items-center gap-2 px-1 cursor-pointer select-none group/lbl">
          <input 
            type="checkbox" 
            checked={searchAuthFolders} 
            onChange={(e) => {
              setSearchAuthFolders(e.target.checked);
              if (similaritySearchActive) setSimilaritySearchActive(false);
            }} 
            className="w-3.5 h-3.5 accent-blue-600 rounded bg-neutral-950 border-white/5 cursor-pointer"
          />
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider group-hover/lbl:text-neutral-200 transition-colors">
            Search Authorized Folders
          </span>
        </label>
        
        <div className="flex gap-2 items-center">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-xl text-[10px] font-black uppercase transition-all border ${showFilters || activeFilters.model || activeFilters.sampler ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-solid-element border-white/5 text-neutral-300 hover:text-white hover:bg-neutral-800'}`}
          >
            <Filter className="w-3 h-3" /> Filters
          </button>
          <button 
            onClick={handleAutoClassify}
            className="w-11 h-11 flex items-center justify-center bg-white/5 hover:bg-amber-500/20 border border-white/5 rounded-xl text-neutral-500 hover:text-amber-500 transition-all"
            title="Auto-classify folders"
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 flex items-center justify-between border-b border-white/5 bg-solid-panel h-14 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-neutral-200 tracking-tighter">Library View</span>
            {viewMode === 'Peaking' && images.length > 0 && (
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => {
                            if (checkedIndices.length === images.length) clearChecks();
                            else setCheckedIndices(images.map((_, i) => i));
                        }}
                        className={`text-[8px] font-black uppercase px-3 py-1.5 min-h-[32px] rounded transition-all ${checkedIndices.length === images.length ? 'bg-blue-600 text-white' : 'bg-white/5 text-neutral-400 hover:text-neutral-200'}`}
                    >
                        {checkedIndices.length === images.length ? 'Unselect All' : 'Select All'}
                    </button>
                    <div className="flex items-center gap-1 bg-white/5 rounded px-1.5 py-1">
                        <button
                            onClick={() => setPeakingColumns(Math.max(1, peakingColumns - 1))}
                            className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                            title="Fewer columns"
                        >
                            <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-[9px] font-black text-neutral-300 w-4 text-center">{peakingColumns}</span>
                        <button
                            onClick={() => setPeakingColumns(Math.min(12, peakingColumns + 1))}
                            className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                            title="More columns"
                        >
                            <Plus className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            )}
          </div>
          <button 
            onClick={() => setSortMethod(sortMethod === 'Newest' ? 'Oldest' : sortMethod === 'Oldest' ? 'NameAsc' : sortMethod === 'NameAsc' ? 'NameDesc' : 'Newest')}
            className="text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 min-h-[44px] h-11 px-2 flex items-center"
          >
            {sortMethod}
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          {showFilters && (
            <div className="absolute inset-0 z-20 bg-neutral-900/95 backdrop-blur-sm animate-in fade-in duration-200">
              <FilterPanel folderPath={folderPath} onFilterChange={handleFilterChange} onClose={() => setShowFilters(false)} />
            </div>
          )}
          <ImageGrid
            images={images}
            currentIndex={currentIndex}
            setCurrentIndex={setCurrentIndex}
            batchRange={batchRange}
            reloadTimestamp={reloadTimestamp}
            onImageContextMenu={onImageContextMenu}
          />
        </div>
      </div>

      {isSearching && searchQuery.trim() && (
        <div className="p-4 border-t border-white/5 bg-blue-600/10 backdrop-blur-md">
          <button 
            onClick={moveSearchResults}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-95 flex flex-col items-center gap-1"
          >
            <div className="flex items-center gap-2">
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Save {images.length} Results</span>
            </div>
            <span className="text-[8px] opacity-70 normal-case font-medium">to /{searchQuery.replace(/[^a-z0-9]/gi, '_').toLowerCase()}</span>
          </button>
        </div>
      )}
    </aside>
  );
};