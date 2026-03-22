import { useState, useEffect, useCallback, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, confirm, message } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Image as ImageIcon, ChevronLeft, ChevronRight, Filter } from "lucide-react";

import { useAppStore, ImageMetadata } from "./store/useAppStore";
import { useToast } from "./components/Toast";
import { ZoomPanViewer } from "./components/ZoomPanViewer";
import { WildcardTools } from "./components/WildcardTools";
import { DebugPanel } from "./components/DebugPanel";
import { TagRefiner } from "./components/TagRefiner";
import { BatchCropModule } from "./components/BatchCropModule";

// New Modular Components
import { Thumbnail, scheduleThumbnailGeneration } from "./components/Thumbnail";
import { SettingsModal } from "./components/SettingsModal";
import { AppHeader } from "./components/layout/AppHeader";
import { Sidebar } from "./components/layout/Sidebar";
import { Inspector } from "./components/layout/Inspector";
import { AppFooter } from "./components/layout/AppFooter";

export type SortMethod = 'Newest' | 'Oldest' | 'NameAsc' | 'NameDesc';

// Pre-caching components
const ImageCache = ({ images, currentIndex, batchMode, batchRange, reloadTimestamp, cacheSize }: { 
  images: any[], currentIndex: number, batchMode: boolean, batchRange: [number, number] | null, reloadTimestamp: number, cacheSize: number 
}) => {
  const fullImageIndices = new Set<number>();
  const thumbIndices = new Set<number>();

  if (images.length > 0) {
    if (batchMode && batchRange) {
      // In batch mode, cache thumbnails for the adjacent batches
      for (let i = 1; i <= cacheSize; i++) {
        const prev = batchRange[0] - i;
        const next = batchRange[1] + i;
        if (prev >= 0) thumbIndices.add(prev);
        if (next < images.length) thumbIndices.add(next);
      }
      // Cache full images for the first few in the current batch (for instant zoom view)
      for (let i = batchRange[0]; i <= Math.min(batchRange[1], batchRange[0] + 3); i++) {
        fullImageIndices.add(i);
      }
    } else {
      // Single mode logic
      for (let i = 1; i <= cacheSize; i++) {
        if (currentIndex + i < images.length) fullImageIndices.add(currentIndex + i);
        if (currentIndex - i >= 0) fullImageIndices.add(currentIndex - i);
      }
    }
  }

  return (
    <div className="hidden" aria-hidden="true">
      {Array.from(fullImageIndices).map(idx => {
        const img = images[idx];
        if (!img || !img.path) return null;
        return (
          <img 
            key={`full-${img.path}-${reloadTimestamp}`}
            src={reloadTimestamp ? `${convertFileSrc(img.path.replace(/\//g, '\\'))}?t=${reloadTimestamp}` : convertFileSrc(img.path.replace(/\//g, '\\'))} 
          />
        );
      })}
      {Array.from(thumbIndices).map(idx => {
        const img = images[idx];
        if (!img || !img.path) return null;
        return (
          <Thumbnail 
            key={`thumb-${img.path}-${reloadTimestamp}`}
            path={img.path}
            mtime={img.mtime}
            reloadTimestamp={reloadTimestamp}
            delay={0}
            className="hidden"
          />
        );
      })}
    </div>
  );
};

function App() {
  const { 
    folderPath, images, currentIndex, currentMetadata, shortcuts, batchMode, indexProgress, twitterSettings, recursive, sortMethod, imageCacheSize,
    setFolderPath, setImages, setCurrentIndex, setCurrentMetadata, removeImages, setShortcuts, setBatchMode, setIndexProgress, setTwitterSettings, setRecursive, setSortMethod: setAppSortMethod,
    setWorkshopTargetPaths, workshopFilter, setWorkshopFilter
  } = useAppStore();

  const { showToast } = useToast();
  
  // Local UI States
  const [batchRange, setBatchRange] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showWildcards, setShowWildcards] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showBatchCrop, setShowBatchCrop] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ model: "", sampler: "" });
  const [reloadTimestamp, setReloadTimestamp] = useState<number>(0);
  const [showViewerRefiner, setShowViewerRefiner] = useState(false);
  const [viewerTagCounts, setViewerTagCounts] = useState<Record<string, number>>({});

  const showWildcardsRef = useRef(showWildcards);
  const isTrashFolder = folderPath?.split(/[\\/]/).pop()?.toLowerCase() === '_trash';

  useEffect(() => { showWildcardsRef.current = showWildcards; }, [showWildcards]);

  // Handlers
  const handleSortChange = (method: SortMethod) => { setAppSortMethod(method); };

  const handleTwitterUpload = useCallback(async () => {
    if (images.length === 0 || !images[currentIndex]) return;
    try {
      showToast("Preparing X upload...", "info");
      await invoke("twitter_upload", { 
        path: images[currentIndex].path, 
        settings: twitterSettings 
      });
      if (twitterSettings.apiKey && twitterSettings.accessToken) {
        showToast("Directly Uploaded to X", "success");
      } else {
        showToast("Copied Image! Press Ctrl+V in browser", "success");
      }
    } catch (e: any) {
      showToast(e.toString(), "error");
    }
  }, [images, currentIndex, twitterSettings, showToast]);

  const handleOpenFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      const result = await invoke("scan_directory", { path: selected, sortMethod, recursive }) as any;
      setFolderPath(result.folder);
      setImages(result.images);
      setCurrentIndex(result.initial_index);
      showToast(`Loaded ${ result.images.length } images`, 'success');
    }
  };

  const handleReload = async () => {
    if (!folderPath) return;
    const ts = Date.now();
    setReloadTimestamp(ts);
    const result = await invoke("scan_directory", { path: folderPath, sortMethod, recursive }) as any;
    setFolderPath(result.folder);
    setImages(result.images);
    if (result.images[currentIndex]) {
        const current = result.images[currentIndex];
        invoke("get_metadata", { path: current.path }).then(m => setCurrentMetadata(m as ImageMetadata)).catch(() => {});
        setImageSrc(`${convertFileSrc(current.path)}?t=${ts}`);
    }
    showToast("Reloaded", 'info');
  };

  const handleSearch = async (overrideFilters?: { model: string, sampler: string }, overrideSort?: SortMethod) => {
    if (!folderPath) return;
    const progress = useAppStore.getState().indexProgress;
    if (progress?.is_indexing) {
        showToast(`Indexing in progress (${progress.current}/${progress.total}). Search results may be incomplete.`, "info");
    }
    const filters = overrideFilters || activeFilters;
    const currentSort = overrideSort || sortMethod;
    if (!searchQuery.trim() && !filters.model && !filters.sampler) {
      setIsSearching(false);
      const result = await invoke("scan_directory", { path: folderPath, sortMethod: currentSort, recursive }) as any;
      setImages(result.images);
      return;
    }
    setIsSearching(true);
    const results = await invoke("search_advanced_images", { 
        folder: folderPath, query: searchQuery, model: filters.model, sampler: filters.sampler, sortMethod: currentSort, recursive
    }) as any[];
    setImages(results);
    showToast(`Found ${results.length} matches`, 'info');
  };

  const handleAutoClassify = async () => {
    if (!folderPath) return;
    if (await confirm("Automatically classify images into subfolders based on their names/tags?")) {
        try {
            const result = await invoke("auto_classify", { root: folderPath, recursive }) as any;
            if (result.total_moved > 0) {
                let summary = `Successfully moved ${result.total_moved} images:\n\n`;
                for (const [folder, count] of Object.entries(result.folder_summary)) {
                    summary += `• ${folder}: ${count} images\n`;
                }
                await message(summary, { title: "Auto-classification Complete", kind: "info" });
                handleReload();
            } else { showToast("No matching images found", "info"); }
        } catch (e: any) { showToast(`Failed: ${e}`, "error"); }
    }
  };

  const handleDelete = useCallback(async () => {
    if (images.length === 0) return;
    let targets = [currentIndex];
    if (batchMode && batchRange) {
        targets = [];
        for (let i = batchRange[0]; i <= batchRange[1]; i++) targets.push(i);
    }
    if (isTrashFolder) {
        if (await confirm(`Permanently delete ${targets.length} image(s)?`)) {
            await invoke("delete_to_trash", { paths: targets.map(i => images[i].path) });
            removeImages(targets);
            showToast("Permanently Deleted", 'error');
        }
    } else {
        await invoke("delete_to_trash", { paths: targets.map(i => images[i].path) });
        removeImages(targets, 'trash');
        showToast("Moved to _Trash", 'info');
    }
  }, [images, currentIndex, batchMode, batchRange, isTrashFolder, removeImages, showToast]);

  const handleKeep = useCallback(async () => {
    if (images.length === 0) return;
    let targets = [currentIndex];
    if (batchMode && batchRange) {
        targets = [];
        for (let i = batchRange[0]; i <= batchRange[1]; i++) targets.push(i);
    }
    await invoke("move_to_keep", { paths: targets.map(i => images[i].path) });
    removeImages(targets, 'keep');
    showToast("Moved to _Keep", 'success');
  }, [images, currentIndex, batchMode, batchRange, removeImages, showToast]);

  const handleUndo = useCallback(async () => {
    const action = useAppStore.getState().popUndo();
    if (!action) { showToast("Nothing to undo", "info"); return; }
    try {
      for (const item of action.originalImages) {
        const fileName = item.info.path.split(/[\\/]/).pop();
        const currentPath = `${item.info.path.substring(0, item.info.path.lastIndexOf(fileName!) - 1)}/${action.targetFolder}/${fileName}`;
        await invoke("undo_move", { originalPath: item.info.path, currentPath: currentPath.replace(/\/\//g, '/') });
        useAppStore.getState().insertImage(item.info, item.index);
      }
      showToast(`Undid ${action.type} operation`, "success");
    } catch (e: any) { showToast(`Undo failed: ${e}`, "error"); }
  }, [showToast]);

  const nextImage = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex(batchMode && batchRange ? (batchRange[1] + 1) % images.length : (currentIndex + 1) % images.length);
  }, [images, batchMode, batchRange, currentIndex, setCurrentIndex]);

  const prevImage = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex(batchMode && batchRange ? (batchRange[0] - 1 + images.length) % images.length : (currentIndex - 1 + images.length) % images.length);
  }, [images, batchMode, batchRange, currentIndex, setCurrentIndex]);

  const handleRandom = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex(Math.floor(Math.random() * images.length));
  }, [images, setCurrentIndex]);

  // Events & Listeners
  useEffect(() => {
    const unlisten = listen('tauri://drag-drop', async (event: any) => {
      if (showWildcardsRef.current || document.querySelector('[data-wildcard-modal]')) return;
      const paths = (event.payload as any).paths as string[];
      if (paths && paths.length > 0) {
        try {
          const result = await invoke("scan_directory", { path: paths[0], sortMethod, recursive }) as any;
          setFolderPath(result.folder); setImages(result.images); setCurrentIndex(result.initial_index);
          showToast(`Loaded ${result.images.length} images`, 'success');
        } catch (e) {}
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [sortMethod, recursive, setFolderPath, setImages, setCurrentIndex, showToast]);

  useEffect(() => {
    const unlistenProgress = listen('index-progress', (event: any) => setIndexProgress(event.payload));
    const unlistenUpdate = listen('folder-updated', (event: any) => {
      const payload = event.payload as any;
      if (payload.folder === folderPath || recursive) {
        const state = useAppStore.getState();
        const currentImages = state.images;
        const currentIdx = state.currentIndex;
        
        let targetIndex = payload.initial_index !== undefined ? payload.initial_index : 0;
        if (currentImages.length > 0 && currentIdx !== undefined && currentImages[currentIdx]) {
            const currentPath = currentImages[currentIdx].path;
            const newIndex = payload.images.findIndex((img: any) => img.path === currentPath);
            if (newIndex !== -1) {
                targetIndex = newIndex;
            }
        }
        
        setImages(payload.images);
        setCurrentIndex(targetIndex);
      }
    });

    const unlistenChunk = listen('metadata-chunk-updated', () => {
        // When a chunk of metadata is saved to DB, re-fetch metadata for the CURRENT image
        // just in case it was part of that chunk and is currently missing details.
        const state = useAppStore.getState();
        if (state.images.length > 0 && state.currentIndex !== undefined) {
            const currentImg = state.images[state.currentIndex];
            if (currentImg && !state.currentMetadata?.prompt) {
                invoke("get_metadata", { path: currentImg.path })
                    .then(m => setCurrentMetadata(m as ImageMetadata))
                    .catch(() => {});
            }
        }
    });

    return () => { 
        unlistenProgress.then(f => f()); 
        unlistenUpdate.then(f => f()); 
        unlistenChunk.then(f => f());
    };
  }, [setIndexProgress, folderPath, recursive, setImages, setCurrentMetadata]);

  // Scans & Updates
  const initialScanDone = useRef(false);
  useEffect(() => {
    if (folderPath && !initialScanDone.current) {
      invoke("scan_directory", { path: folderPath, sortMethod, recursive })
        .then((result: any) => {
          setImages(result.images);
          if (currentIndex !== undefined && result.images.length > currentIndex) setCurrentIndex(currentIndex);
          initialScanDone.current = true;
        }).catch(() => {});
    }
  }, [folderPath]);

  useEffect(() => {
    if (folderPath && initialScanDone.current) {
        if (isSearching) handleSearch(activeFilters, sortMethod);
        else {
            const currentPath = images[currentIndex]?.path;
            invoke("scan_directory", { path: folderPath, sortMethod, recursive }).then((result: any) => {
                setImages(result.images);
                if (currentPath) {
                    const newIndex = result.images.findIndex((img: any) => img.path === currentPath);
                    if (newIndex !== -1) setCurrentIndex(newIndex);
                }
            });
        }
    }
  }, [recursive, sortMethod]);

  useEffect(() => {
    if (batchMode && images.length > 0 && images[currentIndex]) {
      invoke("get_batch_range", { paths: images.map(img => img.path), currentIndex })
        .then(r => setBatchRange(r as [number, number]))
        .catch(() => setBatchRange(null));
    } else setBatchRange(null);
  }, [currentIndex, images, batchMode]);

  useEffect(() => {
    if (images.length > 0 && images[currentIndex]) {
      const current = images[currentIndex];
      invoke("get_metadata", { path: current.path }).then(m => setCurrentMetadata(m as ImageMetadata)).catch(() => {});
      setImageSrc(reloadTimestamp ? `${convertFileSrc(current.path.replace(/\//g, '\\'))}?t=${reloadTimestamp}` : convertFileSrc(current.path.replace(/\//g, '\\')));
    } else setImageSrc(null);
  }, [currentIndex, images, reloadTimestamp, setCurrentMetadata]);

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || showSettings || showWildcards || showBatchCrop || showViewerRefiner || showDebug) return;
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') { setShowDebug(prev => !prev); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); return; }
      if (e.key.toLowerCase() === 'r') { handleReload(); return; }
      if (images.length === 0) return;
      const key = e.key.toLowerCase();
      const s = shortcuts;
      if (key === s.next.toLowerCase() || e.key === s.next) nextImage();
      else if (key === s.prev.toLowerCase() || e.key === s.prev) prevImage();
      else if (key === s.delete.toLowerCase() || e.key === s.delete) handleDelete();
      else if (key === s.keep.toLowerCase()) handleKeep();
      else if (key === s.batch.toLowerCase()) setBatchMode(!batchMode);
      else if (key === s.twitter.toLowerCase()) handleTwitterUpload();
      else if (key === s.random.toLowerCase()) handleRandom();
      else if (key === s.search.toLowerCase()) { e.preventDefault(); document.getElementById('search-input')?.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, currentIndex, batchMode, batchRange, shortcuts, showSettings, showWildcards, showBatchCrop, showViewerRefiner, showDebug, handleKeep, handleDelete, handleUndo, handleTwitterUpload, handleRandom, handleReload, nextImage, prevImage, setBatchMode]);

  // Pre-caching
  useEffect(() => {
    if (images.length === 0) return;
    const timer = setTimeout(() => {
      let start, end;
      if (batchMode && batchRange) {
        // In batch mode, pre-generate thumbnails for more images around the range
        start = Math.max(0, batchRange[0] - 60);
        end = Math.min(images.length - 1, batchRange[1] + 60);
      } else {
        start = Math.max(0, currentIndex - 40);
        end = Math.min(images.length - 1, currentIndex + 40);
      }
      for (let i = start; i <= end; i++) {
        if (i !== currentIndex) scheduleThumbnailGeneration(images[i].path, false).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [currentIndex, images, batchMode, batchRange]);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      <AppHeader 
        batchMode={batchMode} setBatchMode={setBatchMode} setShowWildcards={setShowWildcards}
        recursive={recursive} setRecursive={setRecursive} sortMethod={sortMethod}
        handleSortChange={handleSortChange} handleRandom={handleRandom} images={images}
        handleKeep={handleKeep} handleDelete={handleDelete} isTrashFolder={isTrashFolder}
        setShowSettings={setShowSettings} handleOpenFolder={handleOpenFolder} shortcuts={shortcuts}
        setWorkshopTargetPaths={setWorkshopTargetPaths}
      />

      <main className="flex-1 overflow-hidden flex">
        <Sidebar 
          searchQuery={searchQuery} setSearchQuery={setSearchQuery} handleSearch={handleSearch}
          handleAutoClassify={handleAutoClassify} showFilters={showFilters} setShowFilters={setShowFilters}
          activeFilters={activeFilters} folderPath={folderPath} handleFilterChange={(f: any) => { setActiveFilters(f); handleSearch(f); }}
          isSearching={isSearching} moveSearchResults={async () => {
             const folderName = searchQuery ? searchQuery.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "filtered_results";
             if (await confirm(`Move ${images.length} files to "${folderName}"?`)) {
               await invoke("move_files_to_folder", { paths: images.map(img => img.path), folderName });
               showToast(`Moved ${images.length} files`, 'success'); setSearchQuery(""); setIsSearching(false);
               const result = await invoke("scan_directory", { path: folderPath!, sortMethod, recursive }) as any;
               setImages(result.images);
             }
          }}
          images={images} currentIndex={currentIndex} batchRange={batchRange}
          setCurrentIndex={setCurrentIndex} reloadTimestamp={reloadTimestamp}
        />

        <section className="flex-1 flex flex-col bg-[#050505] overflow-hidden relative group">
          {images.length > 0 && images[currentIndex] ? (
            batchMode ? (
              <div 
                className="w-full h-full p-8 overflow-hidden grid gap-4 animate-in fade-in zoom-in-95 duration-500 content-center justify-items-center"
                style={{
                  gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(images.slice(batchRange?.[0] || currentIndex, (batchRange?.[1] || currentIndex) + 1).length))}, minmax(0, 1fr))`,
                }}
              >
                {images.slice(batchRange?.[0] || currentIndex, (batchRange?.[1] || currentIndex) + 1).map((img) => (
                  <Thumbnail 
                    key={`${img.path}-${reloadTimestamp}`} 
                    path={img.path} mtime={img.mtime} reloadTimestamp={reloadTimestamp} fit="contain" delay={0}
                    onClick={() => setCurrentIndex(images.indexOf(img))}
                    className={`w-full h-full min-h-0 cursor-pointer rounded-2xl border-4 transition-all duration-300 hover:scale-[1.02] shadow-2xl ${images.indexOf(img) === currentIndex ? 'border-blue-500 ring-[4px] ring-blue-500/30' : 'border-white/5 hover:border-white/10'}`}
                  />
                ))}
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center p-0 overflow-hidden group">
                {imageSrc && <ZoomPanViewer key={`${images[currentIndex].path}-${reloadTimestamp}`} src={imageSrc} onBatchCrop={() => setShowBatchCrop(true)} className="animate-image-change" />}
                
                <div className="absolute top-6 right-6 flex flex-col gap-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button onClick={() => {
                        if (!currentMetadata?.prompt) return;
                        const tags = currentMetadata.prompt.split(',').map((s: string) => s.trim()).filter(Boolean);
                        const counts: Record<string, number> = {};
                        tags.forEach((t: string) => counts[t] = 1);
                        setViewerTagCounts(counts); setShowViewerRefiner(true);
                    }} className="p-3 bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-blue-600/20 hover:border-blue-500/50 hover:text-blue-400 transition-all shadow-2xl"><Filter className="w-5 h-5" /></button>
                </div>

                <button onClick={prevImage} className="absolute left-6 z-10 p-4 rounded-2xl bg-neutral-900/80 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 shadow-2xl backdrop-blur-xl"><ChevronLeft className="w-8 h-8" /></button>
                <button onClick={nextImage} className="absolute right-6 z-10 p-4 rounded-2xl bg-neutral-900/80 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 shadow-2xl backdrop-blur-xl"><ChevronRight className="w-8 h-8" /></button>
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-neutral-900/90 px-6 py-2 rounded-full text-[11px] font-bold border border-white/10 backdrop-blur-2xl shadow-2xl flex items-center gap-4"><span className="opacity-50">{images[currentIndex].name}</span><div className="w-px h-3 bg-white/10" /><span className="text-blue-400">{(images[currentIndex].size / 1024 / 1024).toFixed(2)} MB</span></div>
              </div>
            )
          ) : <div className="flex-1 flex flex-col items-center justify-center opacity-10"><ImageIcon className="w-48 h-48 animate-pulse" /><p className="text-sm font-black uppercase tracking-[0.5em]">System Ready</p></div>}
        </section>

        <Inspector 
          currentMetadata={currentMetadata} handleTwitterUpload={handleTwitterUpload} 
          shortcuts={shortcuts} showToast={showToast}
        />
      </main>

      <SettingsModal 
        show={showSettings} onClose={() => setShowSettings(false)}
        shortcuts={shortcuts} setShortcuts={setShortcuts}
        twitterSettings={twitterSettings} setTwitterSettings={setTwitterSettings}
        folderPath={folderPath} sortMethod={sortMethod} recursive={recursive}
        setImages={setImages} showToast={showToast}
      />

      <AppFooter folderPath={folderPath} indexProgress={indexProgress} images={images} currentIndex={currentIndex} />

      {showWildcards && <WildcardTools onClose={() => setShowWildcards(false)} images={images} currentIndex={currentIndex} batchRange={batchRange} />}

      {showViewerRefiner && (
        <TagRefiner 
            tagCounts={viewerTagCounts} initialExcluded={workshopFilter.exact_match || []} 
            onClose={() => setShowViewerRefiner(false)}
            onApply={async (excluded) => {
                setWorkshopFilter({...workshopFilter, exact_match: excluded});
                setShowViewerRefiner(false);
                try {
                    await invoke("write_filter_file", { name: 'default_exact_exclusion.txt', content: excluded.join(', ') });
                    showToast(`Saved ${excluded.length} exclusions`, 'success');
                } catch (e: any) { showToast(`Save failed: ${e}`, 'error'); }
            }}
        />
      )}

      {showDebug && <DebugPanel folderPath={folderPath} onClose={() => setShowDebug(false)} />}

      {showBatchCrop && images[currentIndex] && (
        <BatchCropModule 
          src={convertFileSrc(images[currentIndex].path)} 
          onClose={() => setShowBatchCrop(false)} 
          onSave={async (rects, fillColor) => {
            try {
              showToast(`Processing ${rects.length} crops...`, 'info');
              const paths = await invoke("process_batch_crop", {
                imagePath: images[currentIndex].path,
                rects: rects.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
                fillColor
              }) as string[];
              setShowBatchCrop(false); showToast(`Saved ${paths.length} crops`, "success");
            } catch (e: any) { showToast(e.toString(), "error"); }
          }}
        />
      )}

      <ImageCache 
        images={images} 
        currentIndex={currentIndex} 
        batchMode={batchMode}
        batchRange={batchRange}
        reloadTimestamp={reloadTimestamp} 
        cacheSize={imageCacheSize} 
      />
    </div>
  );
}

export default App;
