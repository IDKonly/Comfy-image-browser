import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Zap, Filter, FolderPlus } from "lucide-react";
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
  handleFilterChange
}: SidebarProps) => {
  const { sortMethod, setSortMethod, recursive } = useAppStore();
  const [suggestions, setSuggestions] = useState<string[]>([]);
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
        const res = await invoke("get_tag_suggestions", {
          folder: folderPath,
          currentInput: currentWord,
          recursive: recursive
        }) as string[];
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
      words[words.length - 1] = " " + suggestions[0];
      setSearchQuery(words.join(',').trimStart() + ", ");
      setShowSuggestions(false);
    }
  };

  return (
    <aside className="w-16 md:w-72 flex flex-col bg-neutral-900 border-r border-white/5 h-full shrink-0 transition-all text-white">
      <div className="p-4 border-b border-white/5 flex flex-col gap-4">
        <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest hidden md:block">Search & Discovery</span>
        
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-blue-500 transition-colors" />
          <input 
            id="search-input"
            className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-neutral-700 outline-none focus:border-blue-500/50 transition-all shadow-inner"
            placeholder="Filter prompt..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl">
              {suggestions.map((sug, idx) => (
                <div 
                  key={idx} 
                  className="px-3 py-2 text-[10px] text-neutral-300 hover:bg-blue-600/30 hover:text-white cursor-pointer transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const words = searchQuery.split(',');
                    words[words.length - 1] = " " + sug;
                    setSearchQuery(words.join(',').trimStart() + ", ");
                    setShowSuggestions(false);
                    document.getElementById('search-input')?.focus();
                  }}
                >
                  {sug}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${showFilters || activeFilters.model || activeFilters.sampler ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-white/5 border-white/5 text-neutral-500 hover:text-white'}`}
          >
            <Filter className="w-3 h-3" /> Filters
          </button>
          <button 
            onClick={handleAutoClassify}
            className="p-2 bg-white/5 hover:bg-amber-500/20 border border-white/5 rounded-xl text-neutral-500 hover:text-amber-500 transition-all"
            title="Auto-classify folders"
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 flex items-center justify-between border-b border-white/5 bg-black/20">
          <span className="text-[10px] font-black uppercase text-neutral-600 tracking-tighter">Library View</span>
          <button 
            onClick={() => setSortMethod(sortMethod === 'Newest' ? 'Oldest' : sortMethod === 'Oldest' ? 'NameAsc' : sortMethod === 'NameAsc' ? 'NameDesc' : 'Newest')}
            className="text-[9px] font-black uppercase text-blue-500 hover:text-blue-400"
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