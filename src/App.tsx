import { useState, useEffect, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { useAppStore, ImageMetadata } from "./store/useAppStore";
import { FolderOpen, Image as ImageIcon, Info, Trash2, CheckCircle, Layers, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
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
      const result = await invoke("scan_directory", { path: folderPath });
      setImages(result as any);
      return;
    }

    try {
      setLoading(true);
      const paths = await invoke("search_images", { folder: folderPath, query: searchQuery }) as string[];
      // We need to map paths back to ImageInfo. 
      // For simplicity, we filter the existing images array in state.
      const filtered = images.filter(img => paths.includes(img.path));
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
    if (folderPath) {
      setLoading(true);
      const result = await invoke("scan_directory", { path: folderPath });
      setImages(result as any);
      setLoading(false);
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
      console.error("Failed to get batch range:", error);
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
        console.error("Delete failed:", error);
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
      console.error("Move to keep failed:", error);
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
      // Don't trigger shortcuts if user is typing in search bar
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

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans select-none overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-12 bg-neutral-900 border-b border-neutral-800 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-black flex items-center gap-2 tracking-tighter uppercase italic text-blue-500">
            <ImageIcon className="w-5 h-5" />
            ComfyView
          </h1>
          <div className="h-4 w-px bg-neutral-800" />
          <button
            onClick={() => setBatchMode(!batchMode)}
            className={`flex items-center gap-2 px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${
              batchMode ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)]' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Batch Mode
          </button>
        </div>

        <div className="flex items-center gap-2">
           {images.length > 0 && (
             <div className="flex items-center gap-1 bg-neutral-800 p-1 rounded-md border border-neutral-700/50">
               <button
                onClick={handleKeep}
                className="flex items-center gap-2 px-3 py-1 bg-neutral-900 hover:bg-green-900/40 hover:text-green-400 rounded text-[10px] font-bold uppercase transition-all"
                title="Move to _Keep (K)"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Keep
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-1 bg-neutral-900 hover:bg-red-900/40 hover:text-red-400 rounded text-[10px] font-bold uppercase transition-all"
                title="Delete to _Trash (Del)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Trash
              </button>
             </div>
           )}
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-[10px] font-bold uppercase transition-all ml-2"
          >
            <FolderOpen className="w-4 h-4" />
            Open Folder
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex">
        {/* Sidebar / List */}
        <aside className="w-64 border-r border-neutral-800 bg-neutral-900 flex flex-col shrink-0 overflow-hidden">
          {/* Search Bar */}
          <div className="p-3 bg-neutral-900/50 border-b border-neutral-800">
            <div className="relative group">
              <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors ${searchQuery ? 'text-blue-500' : 'text-neutral-600'}`} />
              <input
                id="search-input"
                type="text"
                placeholder="Search Prompt... (/)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-md py-1.5 pl-8 pr-8 text-[10px] text-neutral-200 placeholder:text-neutral-700 focus:outline-none focus:border-blue-900/50 focus:ring-1 focus:ring-blue-900/20 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={clearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-neutral-800 rounded-full text-neutral-600 hover:text-neutral-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="p-8 flex flex-col items-center gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Processing</div>
              </div>
            ) : images.length > 0 ? (
              <div className="py-2">
                {images.map((img, idx) => (
                  <div
                    key={img.path}
                    onClick={() => setCurrentIndex(idx)}
                    className={`px-4 py-1.5 text-[10px] truncate cursor-pointer transition-all border-l-2 ${
                      idx === currentIndex 
                        ? 'bg-blue-600/10 border-blue-500 text-blue-400 font-medium' 
                        : isInBatch(idx)
                          ? 'bg-blue-500/5 border-blue-500/30 text-neutral-400'
                          : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <span className="opacity-30 mr-2 tabular-nums">{String(idx + 1).padStart(3, '0')}</span>
                    {img.name}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-neutral-600 text-center text-[10px] font-bold uppercase tracking-widest mt-10 opacity-30">
                {searchQuery ? 'No Results' : 'Ready to Scan'}
              </div>
            )}
          </div>
        </aside>

        {/* Viewer */}
        <section className="flex-1 flex flex-col items-center justify-center p-8 bg-neutral-950 overflow-hidden relative group">
          {images.length > 0 && currentImage ? (
            <div className="relative w-full h-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-500">
               <img 
                 key={currentImage.path}
                 src={convertFileSrc(currentImage.path)} 
                 alt={currentImage.name}
                 className="max-w-full max-h-full object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] z-0 animate-image-change"
               />
               
               <button 
                onClick={prevImage}
                className="absolute left-4 p-2 rounded-full bg-neutral-900/50 border border-neutral-800 text-neutral-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-neutral-800 hover:text-white"
               >
                 <ChevronLeft className="w-6 h-6" />
               </button>
               <button 
                onClick={nextImage}
                className="absolute right-4 p-2 rounded-full bg-neutral-900/50 border border-neutral-800 text-neutral-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-neutral-800 hover:text-white"
               >
                 <ChevronRight className="w-6 h-6" />
               </button>

               <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
                  <span className="bg-neutral-900/80 px-4 py-1.5 rounded-full text-[10px] font-bold text-neutral-400 border border-neutral-800 backdrop-blur-md shadow-2xl uppercase tracking-tighter">
                    {currentImage.name}
                  </span>
               </div>
            </div>
          ) : (
            <div className="text-neutral-800 flex flex-col items-center gap-6">
               <ImageIcon className="w-32 h-32 opacity-20 animate-pulse" />
               <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Drop folder here or open manually</p>
            </div>
          )}
        </section>

        {/* Metadata Sidebar */}
        <aside className="w-80 border-l border-neutral-800 bg-neutral-900 overflow-y-auto shrink-0 p-6 scrollbar-thin">
          <div className="flex items-center gap-2 mb-6 text-neutral-400 text-[10px] font-black uppercase tracking-widest border-b border-neutral-800 pb-4">
            <Info className="w-4 h-4 text-blue-500" />
            Metadata Inspector
          </div>
          {currentMetadata ? (
            <div className="space-y-6 text-[10px]">
              {currentMetadata.prompt && (
                <div className="space-y-2">
                  <div className="text-blue-500/60 font-black uppercase tracking-widest flex justify-between items-center">
                    <span>Positive Prompt</span>
                    <button onClick={() => { navigator.clipboard.writeText(currentMetadata.prompt!); showToast('Prompt Copied', 'success'); }} className="hover:text-white transition-colors">Copy</button>
                  </div>
                  <div className="bg-neutral-950 p-3 rounded-lg leading-relaxed select-all text-neutral-300 border border-neutral-800 hover:border-blue-900/30 transition-colors">
                    {currentMetadata.prompt}
                  </div>
                </div>
              )}
              {currentMetadata.negative_prompt && (
                <div className="space-y-2">
                  <div className="text-red-500/60 font-black uppercase tracking-widest">Negative Prompt</div>
                  <div className="bg-neutral-950 p-3 rounded-lg leading-relaxed select-all text-neutral-300 border border-neutral-800 hover:border-red-900/30 transition-colors">
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
                  <div key={i} className={`bg-neutral-950 p-3 rounded-lg border border-neutral-800 ${item.full ? 'col-span-2' : ''}`}>
                    <div className="text-neutral-600 font-black uppercase tracking-tighter mb-1">{item.label}</div>
                    <div className="font-bold text-neutral-300 truncate" title={String(item.value)}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-700 text-center space-y-4">
               <div className="w-12 h-px bg-neutral-800" />
               <div className="text-[10px] font-bold uppercase tracking-widest">No Meta Data</div>
               <div className="w-12 h-px bg-neutral-800" />
            </div>
          )}
        </aside>
      </main>

      {/* Footer / Status */}
      <footer className="px-4 h-8 bg-neutral-900 border-t border-neutral-800 text-[9px] text-neutral-500 flex items-center justify-between shrink-0 z-10">
        <div className="truncate pr-8 font-mono opacity-50">
          {folderPath || '---'}
        </div>
        <div className="flex gap-6 font-bold uppercase tracking-tighter items-center">
          {images.length > 0 && (
            <>
              {batchMode && batchRange && (
                <div className="flex items-center gap-2 px-2 py-0.5 bg-blue-900/20 border border-blue-900/50 rounded text-blue-400 text-[8px]">
                   BATCH: {batchRange[1] - batchRange[0] + 1} IMAGES
                </div>
              )}
              <span className="text-neutral-600">{images[currentIndex]?.size ? `${(images[currentIndex].size / 1024 / 1024).toFixed(2)} MB` : ''}</span>
              <div className="w-px h-3 bg-neutral-800" />
              <span className="text-blue-500/60">{currentIndex + 1} <span className="text-neutral-700 mx-1">/</span> {images.length}</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;
