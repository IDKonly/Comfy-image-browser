import { useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "./store/useAppStore";
import { FolderOpen, Image as ImageIcon } from "lucide-react";

function App() {
  const { folderPath, images, currentIndex, setFolderPath, setImages, setCurrentIndex } = useAppStore();
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

  const currentImage = images[currentIndex];

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-white font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-neutral-800 border-b border-neutral-700">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-blue-400" />
          Comfy Image Browser
        </h1>
        <button
          onClick={handleOpenFolder}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          Open Folder
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex">
        {/* Sidebar / List */}
        <aside className="w-64 border-r border-neutral-700 bg-neutral-800/50 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-neutral-400 text-sm italic">Scanning...</div>
          ) : images.length > 0 ? (
            <ul className="divide-y divide-neutral-700/50">
              {images.map((img, idx) => (
                <li
                  key={img.path}
                  onClick={() => setCurrentIndex(idx)}
                  className={`p-2 text-xs truncate cursor-pointer hover:bg-neutral-700 transition-colors ${
                    idx === currentIndex ? 'bg-blue-900/30 text-blue-300' : 'text-neutral-400'
                  }`}
                >
                  {img.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-neutral-500 text-sm">No folder selected</div>
          )}
        </aside>

        {/* Viewer */}
        <section className="flex-1 flex flex-col items-center justify-center p-4 bg-black overflow-hidden">
          {images.length > 0 ? (
            <div className="relative w-full h-full flex items-center justify-center">
               <img 
                 src={convertFileSrc(currentImage.path)} 
                 alt={currentImage.name}
                 className="max-w-full max-h-full object-contain shadow-2xl"
               />
            </div>
          ) : (
            <div className="text-neutral-600 flex flex-col items-center gap-4">
               <ImageIcon className="w-16 h-16 opacity-20" />
               <p>Select a folder to start browsing</p>
            </div>
          )}
        </section>
      </main>

      {/* Footer / Status */}
      <footer className="px-4 py-1 bg-neutral-800 border-t border-neutral-700 text-[10px] text-neutral-500 flex justify-between">
        <div>
          {folderPath || 'No folder selected'}
        </div>
        <div>
          {images.length > 0 ? `${currentIndex + 1} / ${images.length} images` : '0 images'}
        </div>
      </footer>
    </div>
  );
}

export default App;
