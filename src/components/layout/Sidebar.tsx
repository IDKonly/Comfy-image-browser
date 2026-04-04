import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Zap, Filter, Database } from "lucide-react";
import { FilterPanel } from "../FilterPanel";
import { ImageGrid } from "../ImageGrid";
import { useAppStore } from "../../store/useAppStore";

interface SidebarProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  handleSearch: () => void;
  handleAutoClassify: () => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  activeFilters: { model: string, sampler: string };
  folderPath: string | null;
  handleFilterChange: (f: any) => void;
  isSearching: boolean;
  moveSearchResults: () => void;
  images: any[];
  currentIndex: number;
  batchRange: [number, number] | null;
  setCurrentIndex: (index: number) => void;
  reloadTimestamp: number;
  setShowTagClassifier: (v: boolean) => void;
}

export const Sidebar = ({
  searchQuery,
  setSearchQuery,
  handleSearch,
  handleAutoClassify,
  showFilters,
  setShowFilters,
  activeFilters,
  folderPath,
  handleFilterChange,
  isSearching,
  moveSearchResults,
  images,
  currentIndex,
  batchRange,
  setCurrentIndex,
  reloadTimestamp,
  setShowTagClassifier
}: SidebarProps) => {
  const { recursive } = useAppStore();
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
    <aside className="w-72 border-r border-white/5 bg-neutral-900 flex flex-col shrink-0 overflow-hidden relative">
      <div className="p-4 space-y-3 shrink-0">
        <div className="relative group flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-blue-500" />
            <input 
              id="search-input" 
              type="text" 
              placeholder="Search... (/)" 
              value={searchQuery} 
              onChange={e => { setSearchQuery(e.target.value); setShowSuggestions(true); }} 
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              className="w-full bg-neutral-950 border border-white/5 rounded-xl py-2.5 pl-10 text-[11px] focus:outline-none focus:border-blue-500/50 transition-all" 
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl">
                {suggestions.map((sug, idx) => (
                  <div 
                    key={idx} 
                    className="px-3 py-2 text-[10px] text-neutral-300 hover:bg-blue-600/30 hover:text-white cursor-pointer transition-colors"
                    onClick={() => {
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
          <div className="flex gap-1">
            <button onClick={handleAutoClassify} title="Auto-Classify into subfolders" className="p-2.5 rounded-xl border bg-neutral-950 border-white/5 text-neutral-500 hover:text-amber-400 hover:border-amber-500/30 transition-all">
              <Zap className="w-4 h-4" />
            </button>
            <button onClick={() => setShowFilters(!showFilters)} className={`p-2.5 rounded-xl border transition-all ${showFilters || activeFilters.model || activeFilters.sampler ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-neutral-950 border-white/5 text-neutral-500 hover:text-white'}`}>
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex gap-2 p-2">
          {isSearching && (
            <button onClick={moveSearchResults} className="flex-1 py-2 bg-neutral-800 hover:bg-blue-600/20 border border-blue-500/10 rounded-xl text-[10px] font-bold text-neutral-400 uppercase transition-all">
              Classify results
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 relative min-h-0">
        {showFilters && (
          <div className="absolute inset-0 z-20 bg-neutral-900/95 backdrop-blur-sm animate-in fade-in duration-200">
            <FilterPanel folderPath={folderPath} onFilterChange={handleFilterChange} onClose={() => setShowFilters(false)} />
          </div>
        )}

        <ImageGrid 
          images={images}
          currentIndex={currentIndex}
          batchRange={batchRange}
          setCurrentIndex={setCurrentIndex}
          reloadTimestamp={reloadTimestamp}
        />
      </div>
    </aside>
  );
};
