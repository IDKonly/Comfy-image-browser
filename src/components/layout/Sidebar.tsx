import { Search, Zap, Filter } from "lucide-react";
import { FilterPanel } from "../FilterPanel";
import { ImageGrid } from "../ImageGrid";

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
  reloadTimestamp
}: SidebarProps) => {
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
              onChange={e => setSearchQuery(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSearch()} 
              className="w-full bg-neutral-950 border border-white/5 rounded-xl py-2.5 pl-10 text-[11px] focus:outline-none focus:border-blue-500/50 transition-all" 
            />
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
