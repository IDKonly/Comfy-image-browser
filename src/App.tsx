import { useState, useEffect, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { useAppStore, ImageMetadata } from "./store/useAppStore";
import { FolderOpen, Image as ImageIcon, Info, Trash2, CheckCircle } from "lucide-react";

function App() {
  const { 
    folderPath, images, currentIndex, currentMetadata,
    setFolderPath, setImages, setCurrentIndex, setCurrentMetadata, removeImage
  } = useAppStore();
  const [loading, setLoading] = useState(false);

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
      }
    } catch (error) {
      console.error("Failed to open folder:", error);
      setLoading(false);
    }
  };

  const handleDelete = useCallback(async () => {
    if (images.length === 0) return;
    const current = images[currentIndex];
    const ok = await confirm(`Are you sure you want to delete ${current.name}?`, { title: 'Confirm Delete', kind: 'warning' });
    if (ok) {
      try {
        await invoke("delete_to_trash", { path: current.path });
        removeImage(currentIndex);
      } catch (error) {
        console.error("Delete failed:", error);
      }
    }
  }, [images, currentIndex, removeImage]);

  const handleKeep = useCallback(async () => {
    if (images.length === 0) return;
    const current = images[currentIndex];
    try {
      await invoke("move_to_keep", { path: current.path });
      removeImage(currentIndex);
    } catch (error) {
      console.error("Move to keep failed:", error);
    }
  }, [images, currentIndex, removeImage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (images.length === 0) return;
      
      switch(e.key) {
        case 'ArrowRight':
          setCurrentIndex((currentIndex + 1) % images.length);
          break;
        case 'ArrowLeft':
          setCurrentIndex((currentIndex - 1 + images.length) % images.length);
          break;
        case 'Delete':
          handleDelete();
          break;
        case 'k':
        case 'K':
          handleKeep();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, currentIndex, setCurrentIndex, handleDelete, handleKeep]);

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
  }, [currentIndex, images]);

  const currentImage = images[currentIndex];

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-white font-sans select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700 shrink-0">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-blue-400" />
          Comfy Image Browser
        </h1>
        <div className="flex items-center gap-2">
           {images.length > 0 && (
             <>
               <button
                onClick={handleKeep}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs transition-colors"
                title="Move to _Keep (K)"
              >
                <CheckCircle className="w-4 h-4" />
                Keep
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
                title="Delete to _Trash (Del)"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
             </>
           )}
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors ml-4"
          >
            <FolderOpen className="w-4 h-4" />
            Open Folder
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex">
        {/* Sidebar / List */}
        <aside className="w-64 border-r border-neutral-700 bg-neutral-800/50 overflow-y-auto shrink-0">
          {loading ? (
            <div className="p-4 text-neutral-400 text-sm italic">Scanning...</div>
          ) : images.length > 0 ? (
            <ul className="divide-y divide-neutral-700/50">
              {images.map((img, idx) => (
                <li
                  key={img.path}
                  onClick={() => setCurrentIndex(idx)}
                  className={`p-2 text-[10px] truncate cursor-pointer hover:bg-neutral-700 transition-colors ${
                    idx === currentIndex ? 'bg-blue-900/40 text-blue-300' : 'text-neutral-500'
                  }`}
                >
                  {img.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-neutral-500 text-sm text-center mt-10">No folder selected</div>
          )}
        </aside>

        {/* Viewer */}
        <section className="flex-1 flex flex-col items-center justify-center p-4 bg-black overflow-hidden relative">
          {images.length > 0 ? (
            <div className="relative w-full h-full flex items-center justify-center">
               <img 
                 key={currentImage.path}
                 src={convertFileSrc(currentImage.path)} 
                 alt={currentImage.name}
                 className="max-w-full max-h-full object-contain shadow-2xl transition-opacity duration-200"
               />
               <div className="absolute bottom-4 left-4 right-4 text-center pointer-events-none">
                  <span className="bg-black/60 px-3 py-1 rounded-full text-xs text-neutral-400 backdrop-blur-sm">
                    {currentImage.name}
                  </span>
               </div>
            </div>
          ) : (
            <div className="text-neutral-600 flex flex-col items-center gap-4">
               <ImageIcon className="w-16 h-16 opacity-10" />
               <p className="text-sm">Select a folder to start browsing</p>
            </div>
          )}
        </section>

        {/* Metadata Sidebar */}
        <aside className="w-80 border-l border-neutral-700 bg-neutral-800 overflow-y-auto shrink-0 p-4">
          <div className="flex items-center gap-2 mb-4 text-neutral-300 font-bold border-b border-neutral-700 pb-2">
            <Info className="w-4 h-4" />
            Metadata
          </div>
          {currentMetadata ? (
            <div className="space-y-4 text-[11px]">
              {currentMetadata.prompt && (
                <div>
                  <div className="text-blue-400 font-bold mb-1 uppercase tracking-tighter opacity-50">Prompt</div>
                  <div className="bg-neutral-900/50 p-2 rounded leading-relaxed select-all text-neutral-300 border border-neutral-700/50">
                    {currentMetadata.prompt}
                  </div>
                </div>
              )}
              {currentMetadata.negative_prompt && (
                <div>
                  <div className="text-red-400 font-bold mb-1 uppercase tracking-tighter opacity-50">Negative Prompt</div>
                  <div className="bg-neutral-900/50 p-2 rounded leading-relaxed select-all text-neutral-300 border border-neutral-700/50">
                    {currentMetadata.negative_prompt}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {currentMetadata.steps && (
                  <div className="bg-neutral-900/50 p-2 rounded border border-neutral-700/50">
                    <div className="text-neutral-500 scale-90 origin-left mb-1">Steps</div>
                    <div className="font-bold text-neutral-200">{currentMetadata.steps}</div>
                  </div>
                )}
                {currentMetadata.cfg && (
                  <div className="bg-neutral-900/50 p-2 rounded border border-neutral-700/50">
                    <div className="text-neutral-500 scale-90 origin-left mb-1">CFG</div>
                    <div className="font-bold text-neutral-200">{currentMetadata.cfg}</div>
                  </div>
                )}
                {currentMetadata.sampler && (
                  <div className="bg-neutral-900/50 p-2 rounded col-span-2 border border-neutral-700/50">
                    <div className="text-neutral-500 scale-90 origin-left mb-1">Sampler</div>
                    <div className="font-bold text-neutral-200">{currentMetadata.sampler}</div>
                  </div>
                )}
                {currentMetadata.model && (
                  <div className="bg-neutral-900/50 p-2 rounded col-span-2 border border-neutral-700/50">
                    <div className="text-neutral-500 scale-90 origin-left mb-1">Model</div>
                    <div className="font-bold text-neutral-200 truncate" title={currentMetadata.model}>{currentMetadata.model}</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-neutral-500 italic text-xs text-center mt-10">No metadata found</div>
          )}
        </aside>
      </main>

      {/* Footer / Status */}
      <footer className="px-4 py-1.5 bg-neutral-800 border-t border-neutral-700 text-[10px] text-neutral-500 flex justify-between shrink-0">
        <div className="truncate pr-4 italic">
          {folderPath || 'No folder selected'}
        </div>
        <div className="shrink-0 flex gap-4">
          {images.length > 0 && (
            <>
              <span>{images[currentIndex]?.size ? `${(images[currentIndex].size / 1024 / 1024).toFixed(2)} MB` : ''}</span>
              <span className="text-neutral-400 font-bold">{currentIndex + 1} / {images.length} images</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;
