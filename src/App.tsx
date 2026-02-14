import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { useAppStore, ImageMetadata } from "./store/useAppStore";
import { FolderOpen, Image as ImageIcon, Info, Trash2, CheckCircle, Layers, ChevronLeft, ChevronRight, Search, X, FolderInput } from "lucide-react";
import { useToast } from "./components/Toast";

function App() {
  const { 
    folderPath, images, currentIndex, currentMetadata,
    setFolderPath, setImages, setCurrentIndex, setCurrentMetadata, removeImage
  } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchRange, setBatchRange] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const { showToast } = useToast();

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        setLoading(true);
        setFolderPath(selected);
        const result = await invoke("scan_directory", { path: selected });
        setImages(result as any);
        setLoading(false);
        showToast(`Loaded ${ (result as any[]).length } images`, 'success');
      }
    } catch (error) {
      console.error("Failed to open folder:", error);
      setLoading(false);
      showToast("Failed to open folder", 'error');
    }
  };

  const handleSearch = async () => {
    if (!folderPath) return;
    if (!searchQuery.trim()) {
      setIsSearching(false);
      const result = await invoke("scan_directory", { path: folderPath });
      setImages(result as any);
      return;
    }

    try {
      setLoading(true);
      setIsSearching(true);
      const paths = await invoke("search_images", { folder: folderPath, query: searchQuery }) as string[];
      const filtered = (await invoke("scan_directory", { path: folderPath }) as any[]).filter(img => paths.includes(img.path));
      setImages(filtered);
      setLoading(false);
      showToast(`Found ${filtered.length} matches`, 'info');
    } catch (error) {
      console.error("Search failed:", error);
      setLoading(false);
    }
  };

  const clearSearch = async () => {
    setSearchQuery("");
    setIsSearching(false);
    if (folderPath) {
      setLoading(true);
      const result = await invoke("scan_directory", { path: folderPath });
      setImages(result as any);
      setLoading(false);
    }
  };

  const moveSearchResults = async () => {
    if (!isSearching || images.length === 0 || !searchQuery) return;
    
    const folderName = searchQuery.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const ok = await confirm(`Move ${images.length} files to folder "${folderName}"?`);
    if (ok) {
      try {
        await invoke("move_files_to_folder", { 
          paths: images.map(img => img.path), 
          folderName 
        });
        showToast(`Moved ${images.length} files to ${folderName}`, 'success');
        clearSearch();
      } catch (error) {
        showToast("Move failed", 'error');
      }
    }
  };

  const updateBatchRange = useCallback(async (index: number, currentImages: any[]) => {
    if (!batchMode || currentImages.length === 0 || !currentImages[index]) {
      setBatchRange(null);
      return;
    }
    try {
      const paths = currentImages.map(img => img.path);
      const range = await invoke("get_batch_range", { paths, currentIndex: index });
      setBatchRange(range as [number, number]);
    } catch (error) {
      setBatchRange(null);
    }
  }, [batchMode]);

  useEffect(() => {
    updateBatchRange(currentIndex, images);
  }, [currentIndex, images, batchMode, updateBatchRange]);

  const handleDelete = useCallback(async () => {
    if (images.length === 0) return;
    const current = images[currentIndex];
    const ok = await confirm(`Are you sure you want to delete ${current.name}?`, { title: 'Confirm Delete', kind: 'warning' });
    if (ok) {
      try {
        await invoke("delete_to_trash", { path: current.path });
        removeImage(currentIndex);
        showToast(`Deleted ${current.name}`, 'info');
      } catch (error) {
        showToast("Delete failed", 'error');
      }
    }
  }, [images, currentIndex, removeImage, showToast]);

  const handleKeep = useCallback(async () => {
    if (images.length === 0) return;
    const current = images[currentIndex];
    try {
      await invoke("move_to_keep", { path: current.path });
      removeImage(currentIndex);
      showToast(`Moved ${current.name} to _Keep`, 'success');
    } catch (error) {
      showToast("Move failed", 'error');
    }
  }, [images, currentIndex, removeImage, showToast]);

  const nextImage = useCallback(() => {
    if (images.length === 0) return;
    if (batchMode && batchRange) {
        const nextIndex = (batchRange[1] + 1) % images.length;
        setCurrentIndex(nextIndex);
    } else {
        setCurrentIndex((currentIndex + 1) % images.length);
    }
  }, [images.length, currentIndex, batchMode, batchRange, setCurrentIndex]);

  const prevImage = useCallback(() => {
    if (images.length === 0) return;
    if (batchMode && batchRange) {
        let prevIndex = (batchRange[0] - 1 + images.length) % images.length;
        setCurrentIndex(prevIndex);
    } else {
        setCurrentIndex((currentIndex - 1 + images.length) % images.length);
    }
  }, [images.length, currentIndex, batchMode, batchRange, setCurrentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (images.length === 0) return;
      
      switch(e.key) {
        case 'ArrowRight':
          nextImage();
          break;
        case 'ArrowLeft':
          prevImage();
          break;
        case 'Delete':
          handleDelete();
          break;
        case 'k':
        case 'K':
          handleKeep();
          break;
        case 'b':
        case 'B':
          setBatchMode(prev => !prev);
          showToast(`Batch Mode ${!batchMode ? 'ON' : 'OFF'}`, 'info');
          break;
        case '/':
          e.preventDefault();
          document.getElementById('search-input')?.focus();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, nextImage, prevImage, handleDelete, handleKeep, batchMode, showToast]);

  useEffect(() => {
    if (images.length > 0 && images[currentIndex]) {
      const fetchMetadata = async () => {
        try {
          const meta = await invoke("get_metadata", { path: images[currentIndex].path });
          setCurrentMetadata(meta as ImageMetadata);
        } catch (error) {
          console.error("Failed to fetch metadata:", error);
        }
      };
      fetchMetadata();
    }
  }, [currentIndex, images, setCurrentMetadata]);

  const currentImage = images[currentIndex];

  const isInBatch = (idx: number) => {
    if (!batchRange) return false;
    return idx >= batchRange[0] && idx <= batchRange[1];
  };

  // Helper to ensure path is correctly formatted for asset protocol in Tauri v2
  const getImageUrl = (path: string) => {
    return convertFileSrc(path);
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-14 bg-neutral-900 border-b border-white/5 shrink-0 z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-black tracking-tighter uppercase italic text-white">
              ComfyView
            </h1>
          </div>
          
          <div className="h-6 w-px bg-white/5" />
          
          <button
            onClick={() => setBatchMode(!batchMode)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all border ${
              batchMode 
                ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]' 
                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700 hover:border-neutral-600'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Batch Mode
          </button>
        </div>

        <div className="flex items-center gap-3">
           {images.length > 0 && (
             <div className="flex items-center gap-2 bg-neutral-800/50 p-1.5 rounded-xl border border-white/5">
               <button
                onClick={handleKeep}
                className="flex items-center gap-2 px-4 py-1.5 bg-neutral-900 hover:bg-green-600 text-neutral-300 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm"
                title="Move to _Keep (K)"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Keep
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-1.5 bg-neutral-900 hover:bg-red-600 text-neutral-300 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm"
                title="Delete to _Trash (Del)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Trash
              </button>
             </div>
           )}
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-blue-900/20 active:scale-95"
          >
            <FolderOpen className="w-4 h-4" />
            Open Folder
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex">
        {/* Sidebar / List */}
        <aside className="w-72 border-r border-white/5 bg-neutral-900 flex flex-col shrink-0 overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 space-y-3">
            <div className="relative group">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${searchQuery ? 'text-blue-500' : 'text-neutral-600'}`} />
              <input
                id="search-input"
                type="text"
                placeholder="Search prompt or filename... (/)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full bg-neutral-950 border border-white/5 rounded-xl py-2.5 pl-10 pr-10 text-[11px] text-neutral-200 placeholder:text-neutral-700 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
              />
              {searchQuery && (
                <button 
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-neutral-800 rounded-full text-neutral-600 hover:text-neutral-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {isSearching && (
              <button 
                onClick={moveSearchResults}
                className="w-full flex items-center justify-center gap-2 py-2 bg-neutral-800 hover:bg-blue-600/20 border border-white/5 hover:border-blue-500/30 rounded-xl text-[10px] font-bold text-neutral-400 hover:text-blue-400 transition-all"
              >
                <FolderInput className="w-3.5 h-3.5" />
                Classify results to folder
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
            {loading ? (
              <div className="p-12 flex flex-col items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <div className="text-[10px] text-neutral-500 font-black uppercase tracking-[0.2em]">Processing</div>
              </div>
            ) : images.length > 0 ? (
              <div className="space-y-0.5">
                {images.map((img, idx) => (
                  <div
                    key={img.path}
                    onClick={() => setCurrentIndex(idx)}
                    className={`group px-4 py-2.5 text-[11px] truncate cursor-pointer rounded-xl transition-all border ${
                      idx === currentIndex 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20 font-bold' 
                        : isInBatch(idx)
                          ? 'bg-blue-500/5 border-blue-500/20 text-blue-300'
                          : 'border-transparent text-neutral-500 hover:text-neutral-200 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] font-mono opacity-40 tabular-nums ${idx === currentIndex ? 'opacity-100' : ''}`}>
                        {String(idx + 1).padStart(3, '0')}
                      </span>
                      <span className="truncate">{img.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                <ImageIcon className="w-12 h-12 mb-4" />
                <div className="text-[10px] font-black uppercase tracking-widest text-center">
                  {searchQuery ? 'No Matches Found' : 'Select a Folder'}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Viewer */}
        <section className="flex-1 flex flex-col items-center justify-center p-10 bg-neutral-950 overflow-hidden relative group">
          {images.length > 0 && currentImage ? (
            <div className="relative w-full h-full flex items-center justify-center">
               <img 
                 key={currentImage.path}
                 src={getImageUrl(currentImage.path)} 
                 alt={currentImage.name}
                 className="max-w-full max-h-full object-contain shadow-[0_0_100px_rgba(0,0,0,0.8)] z-0 animate-image-change rounded-sm"
                 onError={(e) => {
                   console.error("Image load failed:", currentImage.path);
                   (e.target as HTMLImageElement).src = "https://placehold.co/600x400/000/FFF?text=Load+Error";
                 }}
               />
               
               <button 
                onClick={prevImage}
                className="absolute left-6 p-4 rounded-2xl bg-neutral-900/80 border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:border-blue-500 hover:scale-110 shadow-2xl backdrop-blur-xl"
               >
                 <ChevronLeft className="w-8 h-8" />
               </button>
               <button 
                onClick={nextImage}
                className="absolute right-6 p-4 rounded-2xl bg-neutral-900/80 border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:border-blue-500 hover:scale-110 shadow-2xl backdrop-blur-xl"
               >
                 <ChevronRight className="w-8 h-8" />
               </button>

               <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                  <div className="bg-neutral-900/90 px-6 py-2 rounded-full text-[11px] font-bold text-neutral-300 border border-white/10 backdrop-blur-2xl shadow-2xl flex items-center gap-4">
                    <span className="opacity-50">{currentImage.name}</span>
                    <div className="w-px h-3 bg-white/10" />
                    <span className="text-blue-400">{(currentImage.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
               </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-8 opacity-10">
               <ImageIcon className="w-48 h-48 animate-pulse" />
               <p className="text-sm font-black uppercase tracking-[0.5em]">System Ready</p>
            </div>
          )}
        </section>

        {/* Metadata Sidebar */}
        <aside className="w-80 border-l border-white/5 bg-neutral-900 flex flex-col shrink-0 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white text-[11px] font-black uppercase tracking-widest">
              <Info className="w-4 h-4 text-blue-500" />
              Inspector
            </div>
            {currentMetadata && (
              <button 
                onClick={() => { navigator.clipboard.writeText(currentMetadata.raw); showToast('Raw Meta Copied', 'success'); }}
                className="text-[9px] font-bold text-neutral-500 hover:text-white transition-colors uppercase"
              >
                Copy Raw
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin">
            {currentMetadata ? (
              <div className="space-y-8">
                {currentMetadata.prompt && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="text-blue-500 text-[9px] font-black uppercase tracking-widest">Positive Prompt</div>
                      <button 
                        onClick={() => { navigator.clipboard.writeText(currentMetadata.prompt!); showToast('Prompt Copied', 'success'); }} 
                        className="text-[9px] text-neutral-600 hover:text-white transition-colors font-bold"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="bg-neutral-950 p-4 rounded-2xl leading-relaxed text-neutral-300 text-[11px] border border-white/5 hover:border-blue-500/20 transition-all shadow-inner select-text">
                      {currentMetadata.prompt}
                    </div>
                  </div>
                )}
                
                {currentMetadata.negative_prompt && (
                  <div className="space-y-3">
                    <div className="text-red-500 text-[9px] font-black uppercase tracking-widest">Negative Prompt</div>
                    <div className="bg-neutral-950 p-4 rounded-2xl leading-relaxed text-neutral-400 text-[11px] border border-white/5 hover:border-red-500/20 transition-all shadow-inner select-text">
                      {currentMetadata.negative_prompt}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Steps', value: currentMetadata.steps },
                    { label: 'CFG', value: currentMetadata.cfg },
                    { label: 'Sampler', value: currentMetadata.sampler, full: true },
                    { label: 'Model', value: currentMetadata.model, full: true }
                  ].map((item, i) => item.value && (
                    <div key={i} className={`bg-neutral-950 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all ${item.full ? 'col-span-2' : ''}`}>
                      <div className="text-neutral-600 text-[9px] font-black uppercase tracking-tighter mb-1">{item.label}</div>
                      <div className="font-bold text-neutral-200 text-[11px] truncate select-text" title={String(item.value)}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 opacity-20 italic text-[10px]">
                 No Metadata Available
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Footer / Status */}
      <footer className="px-6 h-10 bg-neutral-950 border-t border-white/5 text-[10px] text-neutral-600 flex items-center justify-between shrink-0 z-10 font-medium">
        <div className="truncate pr-10 font-mono italic opacity-50">
          {folderPath || '---'}
        </div>
        <div className="flex gap-8 items-center">
          {images.length > 0 && (
            <>
              {batchMode && batchRange && (
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-600/10 border border-blue-500/20 rounded-full text-blue-500 font-black text-[9px] animate-pulse">
                   BATCH: {batchRange[1] - batchRange[0] + 1} IMAGES
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-white/60 font-black tracking-tighter">{currentIndex + 1}</span>
                <span className="opacity-20 text-[8px] uppercase font-black">of</span>
                <span className="text-neutral-400 font-black tracking-tighter">{images.length}</span>
              </div>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;
