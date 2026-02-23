import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, confirm, message } from "@tauri-apps/plugin-dialog";
import { LazyStore } from "@tauri-apps/plugin-store";
import { useAppStore, ImageMetadata, Shortcuts, DEFAULT_SHORTCUTS } from "./store/useAppStore";
import { FolderOpen, Image as ImageIcon, Layers, ChevronLeft, ChevronRight, Search, X, Settings, Keyboard, Filter, Wand2, ArrowDownAZ, ArrowUpAZ, Clock, History, Zap } from "lucide-react";
import { useToast } from "./components/Toast";
import { ZoomPanViewer } from "./components/ZoomPanViewer";
import { FilterPanel } from "./components/FilterPanel";
import { WildcardTools } from "./components/WildcardTools";
import { DebugPanel } from "./components/DebugPanel";
import { listen } from "@tauri-apps/api/event";

// Use direct imports which are more reliable in Vite 7
// @ts-ignore
import * as ReactWindow from "react-window";
const List = ReactWindow.FixedSizeList || (ReactWindow as any).default?.FixedSizeList || ReactWindow;
// @ts-ignore
import * as AutoSizerPkg from "react-virtualized-auto-sizer";
// @ts-ignore
const AutoSizer = AutoSizerPkg.default || AutoSizerPkg;

const store = new LazyStore(".settings.json");

// Simple concurrency limiter for thumbnail generation with priority support
interface Task {
  path: string;
  priority: boolean;
  run: () => Promise<void>;
}

const taskQueue: Task[] = [];
const pendingTasks = new Map<string, Promise<string>>();
let activeTasks = 0;
const MAX_CONCURRENT = 12;

const processQueue = () => {
  if (activeTasks >= MAX_CONCURRENT || taskQueue.length === 0) return;
  
  const task = taskQueue.shift();
  if (task) {
    activeTasks++;
    task.run().finally(() => {
      activeTasks--;
      processQueue();
    });
    processQueue();
  }
};

const scheduleThumbnailGeneration = (path: string, priority = true): Promise<string> => {
  if (pendingTasks.has(path)) {
    if (priority) {
      const idx = taskQueue.findIndex(t => t.path === path);
      if (idx !== -1 && !taskQueue[idx].priority) {
        const [task] = taskQueue.splice(idx, 1);
        task.priority = true;
        taskQueue.unshift(task);
      }
    }
    return pendingTasks.get(path)!;
  }

  const promise = new Promise<string>((resolve, reject) => {
    const taskObj = {
      path,
      priority,
      run: async () => {
        try {
          const res = await invoke("get_thumbnail", { path });
          resolve(res as string);
        } catch (e) {
          reject(e);
        }
      }
    };
    
    if (priority) {
      taskQueue.unshift(taskObj);
    } else {
      taskQueue.push(taskObj);
    }
    processQueue();
  });

  pendingTasks.set(path, promise);
  promise.finally(() => pendingTasks.delete(path));
  return promise;
};

const Thumbnail = ({ path, mtime, reloadTimestamp, className, onClick, fit = "cover" }: { path: string, mtime?: number, reloadTimestamp?: number, className?: string, onClick?: () => void, fit?: "cover" | "contain" }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    
    const timer = setTimeout(() => {
      scheduleThumbnailGeneration(path)
        .then(res => {
          if (active) {
            const url = convertFileSrc(res as string);
            setSrc(reloadTimestamp ? `${url}?t=${reloadTimestamp}` : url);
          }
        })
        .catch((err) => {
          console.error("Thumbnail failed", path, err);
          if (active) {
             const url = convertFileSrc(path);
             setSrc(reloadTimestamp ? `${url}?t=${reloadTimestamp}` : url);
          }
        });
    }, 100);
    
    return () => { 
      active = false; 
      clearTimeout(timer);
    };
  }, [path, mtime, reloadTimestamp]);

  return (
    <div className={`overflow-hidden bg-neutral-900/50 flex items-center justify-center ${className}`} onClick={onClick}>
      {src ? (
        <img src={src} className={`w-full h-full ${fit === "cover" ? 'object-cover' : 'object-contain'} animate-in fade-in duration-300`} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-white/5 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

const Row = ({ index, style, data }: any) => {
  const { images, currentIndex, batchRange, setCurrentIndex, reloadTimestamp } = data;
  const i1 = index * 2, i2 = index * 2 + 1;
  return (
    <div style={style} className="flex gap-2 p-1">
      {[i1, i2].map(idx => images[idx] && (
        <Thumbnail 
            key={`${images[idx].path}-${reloadTimestamp}`} 
            path={images[idx].path} 
            mtime={images[idx].mtime}
            reloadTimestamp={reloadTimestamp} 
            onClick={() => setCurrentIndex(idx)}
            className={`flex-1 aspect-square cursor-pointer rounded-lg border-2 transition-all ${idx === currentIndex ? 'border-blue-500 scale-[0.98]' : (batchRange && idx >= batchRange[0] && idx <= batchRange[1]) ? 'border-blue-500/30' : 'border-transparent opacity-60 hover:opacity-100'}`} 
        />
      ))}
    </div>
  );
};

type SortMethod = 'Newest' | 'Oldest' | 'NameAsc' | 'NameDesc';

function App() {
  const { 
    folderPath, images, currentIndex, currentMetadata, shortcuts, batchMode,
    setFolderPath, setImages, setCurrentIndex, setCurrentMetadata, removeImages, setShortcuts, setBatchMode
  } = useAppStore();
  const [batchRange, setBatchRange] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showWildcards, setShowWildcards] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ model: "", sampler: "" });
  const [reloadTimestamp, setReloadTimestamp] = useState<number>(0);
  const [sortMethod, setSortMethod] = useState<SortMethod>('NameAsc');
  const [recursive, setRecursive] = useState(false);
  const { showToast } = useToast();
  const listRef = useRef<any>(null);
  const showWildcardsRef = useRef(showWildcards);

  const isTrashFolder = folderPath?.split(/[\\/]/).pop()?.toLowerCase() === '_trash';

  useEffect(() => {
    showWildcardsRef.current = showWildcards;
  }, [showWildcards]);

  useEffect(() => {
    const unlisten = listen('tauri://drag-drop', async (event: any) => {
      if (showWildcardsRef.current || document.querySelector('[data-wildcard-modal]')) return;

      const paths = (event.payload as any).paths as string[];
      if (paths && paths.length > 0) {
        const firstPath = paths[0];
        try {
          const result = await invoke("scan_directory", { path: firstPath, sortMethod, recursive }) as any;
          setFolderPath(result.folder); 
          setImages(result.images);
          setCurrentIndex(result.initial_index);
          showToast(`Loaded ${result.images.length} images`, 'success');
        } catch (e) {}
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [sortMethod, recursive]);

  useEffect(() => {
    const init = async () => {
      try {
        const savedFolder = await store.get<string>("lastFolder");
        const savedIndex = await store.get<number>("lastIndex");
        const savedShortcuts = await store.get<Shortcuts>("shortcuts");
        const savedSort = await store.get<SortMethod>("sortMethod");
        const savedRecursive = await store.get<boolean>("recursive");
        const savedBatchMode = await store.get<boolean>("batchMode");
        
        if (savedShortcuts) setShortcuts(savedShortcuts);
        if (savedSort) setSortMethod(savedSort);
        if (savedRecursive !== undefined) setRecursive(savedRecursive);
        if (savedBatchMode !== undefined) setBatchMode(savedBatchMode);
        
        if (savedFolder) {
          setFolderPath(savedFolder);
          const result = await invoke("scan_directory", { 
            path: savedFolder, 
            sortMethod: savedSort || sortMethod,
            recursive: savedRecursive !== undefined ? savedRecursive : recursive
          }) as any;
          setImages(result.images);
          if (savedIndex !== undefined && result.images.length > savedIndex) setCurrentIndex(savedIndex);
        }
      } catch (e) {}
    };
    init();
  }, []);

  useEffect(() => {
    if (folderPath) {
      store.set("lastFolder", folderPath);
      store.set("lastIndex", currentIndex);
      store.set("sortMethod", sortMethod);
      store.set("recursive", recursive);
      store.set("batchMode", batchMode);
      store.save();
    }
  }, [folderPath, currentIndex, sortMethod, recursive, batchMode]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(Math.floor(currentIndex / 2));
    }
  }, [currentIndex]);

  const handleOpenFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      const result = await invoke("scan_directory", { path: selected, sortMethod, recursive }) as any;
      setFolderPath(result.folder);
      setImages(result.images);
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

  const handleSortChange = async (method: SortMethod) => {
    setSortMethod(method);
    if (folderPath) {
        if (isSearching) {
            // Re-trigger search with new sort method
            handleSearch(activeFilters, method);
        } else {
            const currentPath = images[currentIndex]?.path;
            const result = await invoke("scan_directory", { path: folderPath, sortMethod: method, recursive }) as any;
            setImages(result.images);
            if (currentPath) {
                const newIndex = result.images.findIndex((img: any) => img.path === currentPath);
                if (newIndex !== -1) setCurrentIndex(newIndex);
            }
        }
    }
  };

  const handleSearch = async (overrideFilters?: { model: string, sampler: string }, overrideSort?: SortMethod) => {
    if (!folderPath) return;
    
    const filters = overrideFilters || activeFilters;
    const currentSort = overrideSort || sortMethod;
    const hasFilters = filters.model || filters.sampler;
    
    if (!searchQuery.trim() && !hasFilters) {
      setIsSearching(false);
      const result = await invoke("scan_directory", { path: folderPath, sortMethod: currentSort, recursive }) as any;
      setImages(result.images);
      return;
    }

    setIsSearching(true);
    const results = await invoke("search_advanced_images", { 
        folder: folderPath, 
        query: searchQuery, 
        model: filters.model, 
        sampler: filters.sampler,
        sortMethod: currentSort,
        recursive
    }) as any[];
    
    setImages(results);
    showToast(`Found ${results.length} matches`, 'info');
  };

  const handleFilterChange = (filters: { model: string, sampler: string }) => {
      setActiveFilters(filters);
      handleSearch(filters);
  };

  const clearSearch = async () => {
    setSearchQuery("");
    setActiveFilters({ model: "", sampler: "" });
    setIsSearching(false);
    if (folderPath) {
      const result = await invoke("scan_directory", { path: folderPath, sortMethod, recursive }) as any;
      setImages(result.images);
    }
  };

  const moveSearchResults = async () => {
    if (!isSearching || images.length === 0) return;
    const folderName = searchQuery 
        ? searchQuery.replace(/[^a-z0-9]/gi, '_').toLowerCase() 
        : "filtered_results";
        
    if (await confirm(`Move ${images.length} files to folder "${folderName}"?`)) {
      await invoke("move_files_to_folder", { paths: images.map(img => img.path), folderName });
      showToast(`Moved ${images.length} files`, 'success');
      clearSearch();
    }
  };

  const handleAutoClassify = async () => {
    if (!folderPath) return;
    if (await confirm("Automatically classify images into subfolders based on their names/tags? (Priority: Largest subfolders first)")) {
        try {
            const result = await invoke("auto_classify", { root: folderPath, recursive }) as any;
            if (result.total_moved > 0) {
                let summary = `Successfully moved ${result.total_moved} images:\n\n`;
                for (const [folder, count] of Object.entries(result.folder_summary)) {
                    summary += `• ${folder}: ${count} images\n`;
                }
                await message(summary, { title: "Auto-classification Complete", kind: "info" });
                handleReload();
            } else {
                showToast("No matching images found for auto-classification", "info");
            }
        } catch (e: any) {
            showToast(`Auto-classify failed: ${e}`, "error");
        }
    }
  };

  useEffect(() => {
    if (batchMode && images.length > 0 && images[currentIndex]) {
      const paths = images.map(img => img.path);
      invoke("get_batch_range", { paths, currentIndex }).then(r => setBatchRange(r as [number, number])).catch(() => setBatchRange(null));
    } else setBatchRange(null);
  }, [currentIndex, images, batchMode]);

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
  }, [images, currentIndex, batchMode, batchRange, isTrashFolder, removeImages]);

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
  }, [images, currentIndex, batchMode, batchRange, removeImages]);

  const handleUndo = useCallback(async () => {
    const action = useAppStore.getState().popUndo();
    if (!action) {
      showToast("Nothing to undo", "info");
      return;
    }

    try {
      for (const item of action.originalImages) {
        const fileName = item.info.path.split(/[\\/]/).pop();
        const currentPath = `${item.info.path.substring(0, item.info.path.lastIndexOf(fileName!) - 1)}/${action.targetFolder}/${fileName}`;
        
        await invoke("undo_move", { 
          originalPath: item.info.path, 
          currentPath: currentPath.replace(/\/\//g, '/')
        });
        
        useAppStore.getState().insertImage(item.info, item.index);
      }
      showToast(`Undid ${action.type} operation`, "success");
    } catch (e: any) {
      showToast(`Undo failed: ${e}`, "error");
    }
  }, [showToast]);

  const nextImage = () => {
    if (images.length === 0) return;
    setCurrentIndex(batchMode && batchRange ? (batchRange[1] + 1) % images.length : (currentIndex + 1) % images.length);
  };

  const prevImage = () => {
    if (images.length === 0) return;
    setCurrentIndex(batchMode && batchRange ? (batchRange[0] - 1 + images.length) % images.length : (currentIndex - 1 + images.length) % images.length);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || showSettings) return;
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') { setShowDebug(prev => !prev); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); return; }
      if (e.key.toLowerCase() === 'r') { handleReload(); return; }
      if (images.length === 0) return;
      if (e.key === shortcuts.next) nextImage();
      else if (e.key === shortcuts.prev) prevImage();
      else if (e.key === shortcuts.delete) handleDelete();
      else if (e.key === shortcuts.keep) handleKeep();
      else if (e.key === shortcuts.batch) setBatchMode(!batchMode);
      else if (e.key === shortcuts.search) { e.preventDefault(); document.getElementById('search-input')?.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, currentIndex, batchMode, batchRange, shortcuts, showSettings, handleKeep, handleDelete, handleUndo]);

  useEffect(() => {
    if (images.length > 0 && images[currentIndex]) {
      const current = images[currentIndex];
      invoke("get_metadata", { path: current.path }).then(m => setCurrentMetadata(m as ImageMetadata)).catch(() => {});
      setImageSrc(reloadTimestamp ? `${convertFileSrc(current.path)}?t=${reloadTimestamp}` : convertFileSrc(current.path));
    } else setImageSrc(null);
  }, [currentIndex, images, reloadTimestamp]);

  useEffect(() => {
    if (images.length === 0) return;
    
    const PRECACHE_COUNT = 40;
    const start = Math.max(0, currentIndex - PRECACHE_COUNT);
    const end = Math.min(images.length - 1, currentIndex + PRECACHE_COUNT);
    
    const timer = setTimeout(() => {
      for (let i = start; i <= end; i++) {
        if (i === currentIndex) continue;
        scheduleThumbnailGeneration(images[i].path, false).catch(() => {});
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [currentIndex, images]);

  const itemData = useMemo(() => ({
    images,
    currentIndex,
    batchRange,
    setCurrentIndex,
    reloadTimestamp
  }), [images, currentIndex, batchRange, setCurrentIndex, reloadTimestamp]);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      <header className="flex items-center justify-between px-4 h-14 bg-neutral-900 border-b border-white/5 shrink-0 z-10 shadow-2xl">
        <div className="flex items-center gap-6"><div className="flex items-center gap-2"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black italic">CV</div><h1 className="text-lg font-black tracking-tighter uppercase italic">ComfyView</h1></div>
        <button onClick={() => setBatchMode(!batchMode)} className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all border ${batchMode ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]' : 'bg-neutral-800 border-neutral-700 text-neutral-400'}`}><Layers className="w-3.5 h-3.5" />Batch Mode</button>
        <button onClick={() => setShowWildcards(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all border bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white hover:border-blue-500/50"><Wand2 className="w-3.5 h-3.5" />Wildcard</button>
        <div className="flex items-center gap-2 bg-neutral-800/50 p-1 rounded-xl border border-white/5 ml-2">
            <button 
                onClick={() => setRecursive(!recursive)}
                title="Recursive Scan"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${recursive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
                <Layers className="w-3.5 h-3.5" /> Recursive
            </button>
            <div className="w-px h-4 bg-white/5 mx-1" />
            {[
                { id: 'NameAsc', icon: ArrowDownAZ, label: 'A-Z' },
                { id: 'NameDesc', icon: ArrowUpAZ, label: 'Z-A' },
                { id: 'Newest', icon: History, label: 'Newest' },
                { id: 'Oldest', icon: Clock, label: 'Oldest' }
            ].map(m => (
                <button 
                    key={m.id} 
                    onClick={() => handleSortChange(m.id as SortMethod)}
                    title={m.label}
                    className={`p-1.5 rounded-lg transition-all ${sortMethod === m.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                    <m.icon className="w-3.5 h-3.5" />
                </button>
            ))}
        </div>
        </div>
        <div className="flex items-center gap-3">{images.length > 0 && <div className="flex items-center gap-2 bg-neutral-800/50 p-1.5 rounded-xl border border-white/5"><button onClick={handleKeep} className="px-4 py-1.5 bg-neutral-900 hover:bg-green-600 rounded-lg text-[10px] font-bold uppercase">Keep</button><button onClick={handleDelete} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${isTrashFolder ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-neutral-900 hover:bg-red-600'}`}>Trash</button></div>}
        <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-neutral-500 hover:text-white"><Settings className="w-5 h-5" /></button>
        <button onClick={handleOpenFolder} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg active:scale-95"><FolderOpen className="w-4 h-4" />Open Folder</button></div>
      </header>

      <main className="flex-1 overflow-hidden flex">
        <aside className="w-72 border-r border-white/5 bg-neutral-900 flex flex-col shrink-0 overflow-hidden relative">
          <div className="p-4 space-y-3 shrink-0"><div className="relative group flex items-center gap-2">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 group-focus-within:text-blue-500" />
                <input id="search-input" type="text" placeholder="Search... (/)" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="w-full bg-neutral-950 border border-white/5 rounded-xl py-2.5 pl-10 text-[11px] focus:outline-none focus:border-blue-500/50 transition-all" />
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
          {isSearching && <button onClick={moveSearchResults} className="w-full py-2 bg-neutral-800 hover:bg-blue-600/20 border border-blue-500/10 rounded-xl text-[10px] font-bold text-neutral-400">Classify results</button>}</div>
          
          <div className="flex-1 relative min-h-0">
             {showFilters && (
                 <div className="absolute inset-0 z-20 bg-neutral-900/95 backdrop-blur-sm animate-in fade-in duration-200">
                     <FilterPanel folderPath={folderPath} onFilterChange={handleFilterChange} onClose={() => setShowFilters(false)} />
                 </div>
             )}

            {images.length > 0 && List && AutoSizer ? (
              <AutoSizer>
                {({ height, width }: any) => (
                  <List
                    ref={listRef}
                    height={height}
                    itemCount={Math.ceil(images.length / 2)}
                    itemSize={width / 2}
                    width={width}
                    itemData={itemData}
                    className="scrollbar-thin absolute inset-0"
                  >
                    {Row}
                  </List>
                )}
              </AutoSizer>
            ) : <div className="flex items-center justify-center h-full opacity-20 italic text-[10px]">No Images</div>}
          </div>
        </aside>

        <section className="flex-1 flex flex-col bg-[#050505] overflow-hidden relative group">
          {images.length > 0 && images[currentIndex] ? (
            batchMode ? (
              (() => {
                const start = batchRange?.[0] || currentIndex;
                const end = batchRange?.[1] || currentIndex;
                const batchItems = images.slice(start, end + 1);
                const count = batchItems.length;
                const cols = Math.ceil(Math.sqrt(count));
                
                return (
                  <div 
                    className="w-full h-full p-8 overflow-hidden grid gap-4 animate-in fade-in zoom-in-95 duration-500 content-center justify-items-center"
                    style={{
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${Math.ceil(count / cols)}, minmax(0, 1fr))`
                    }}
                  >
                    {batchItems.map((img) => (
                      <Thumbnail 
                        key={`${img.path}-${reloadTimestamp}`} 
                        path={img.path} 
                        mtime={img.mtime} 
                        reloadTimestamp={reloadTimestamp}
                        fit="contain" 
                        onClick={() => setCurrentIndex(images.indexOf(img))}
                        className={`w-full h-full min-h-0 cursor-pointer rounded-2xl border-4 transition-all duration-300 hover:scale-[1.02] shadow-2xl ${images.indexOf(img) === currentIndex ? 'border-blue-500 ring-[4px] ring-blue-500/30' : 'border-white/5 hover:border-white/10'}`}
                      />
                    ))}
                  </div>
                );
              })()
            ) : (
              <div className="relative w-full h-full flex items-center justify-center p-0 overflow-hidden">
                {imageSrc && <ZoomPanViewer key={`${images[currentIndex].path}-${reloadTimestamp}`} src={imageSrc} className="animate-image-change" />}
                <button onClick={prevImage} className="absolute left-6 z-10 p-4 rounded-2xl bg-neutral-900/80 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 shadow-2xl backdrop-blur-xl"><ChevronLeft className="w-8 h-8" /></button>
                <button onClick={nextImage} className="absolute right-6 z-10 p-4 rounded-2xl bg-neutral-900/80 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 shadow-2xl backdrop-blur-xl"><ChevronRight className="w-8 h-8" /></button>
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-neutral-900/90 px-6 py-2 rounded-full text-[11px] font-bold border border-white/10 backdrop-blur-2xl shadow-2xl flex items-center gap-4"><span className="opacity-50">{images[currentIndex].name}</span><div className="w-px h-3 bg-white/10" /><span className="text-blue-400">{(images[currentIndex].size / 1024 / 1024).toFixed(2)} MB</span></div>
              </div>
            )
          ) : <div className="flex-1 flex flex-col items-center justify-center opacity-10"><ImageIcon className="w-48 h-48 animate-pulse" /><p className="text-sm font-black uppercase tracking-[0.5em]">System Ready</p></div>}
        </section>

        <aside className="w-80 border-l border-white/5 bg-neutral-900 flex flex-col shrink-0 overflow-hidden text-left">
          <div className="p-6 border-b border-white/5 flex items-center justify-between font-black uppercase tracking-widest text-[11px]"><span>Inspector</span>{currentMetadata && <button onClick={() => { navigator.clipboard.writeText(currentMetadata.raw); showToast('Raw Copied', 'success'); }} className="text-[9px] text-neutral-500 hover:text-white uppercase">Raw</button>}</div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin">
            {currentMetadata ? (
              <>
                {currentMetadata.prompt && <div className="space-y-3"><div className="text-blue-500 text-[9px] font-black uppercase tracking-widest text-left">Prompt</div><div className="bg-neutral-950 p-4 rounded-2xl leading-relaxed text-[11px] border border-white/5 select-text shadow-inner text-left">{currentMetadata.prompt}</div></div>}
                {currentMetadata.negative_prompt && <div className="space-y-3"><div className="text-red-500 text-[9px] font-black uppercase tracking-widest text-left">Negative</div><div className="bg-neutral-950 p-4 rounded-2xl leading-relaxed text-[11px] border border-white/5 select-text shadow-inner text-left">{currentMetadata.negative_prompt}</div></div>}
                <div className="grid grid-cols-2 gap-3 text-left">
                  {[ { label: 'Steps', value: currentMetadata.steps }, { label: 'CFG', value: currentMetadata.cfg }, { label: 'Sampler', value: currentMetadata.sampler, full: true }, { label: 'Model', value: currentMetadata.model, full: true } ].map((item, i) => item.value && (
                    <div key={i} className={`bg-neutral-950 p-4 rounded-2xl border border-white/5 ${item.full ? 'col-span-2' : ''}`}><div className="text-neutral-600 text-[9px] font-black uppercase mb-1 text-left">{item.label}</div><div className="font-bold text-[11px] truncate select-text text-neutral-200 text-left">{item.value}</div></div>
                  ))}
                </div>
              </>
            ) : <div className="flex-1 flex items-center justify-center opacity-20 italic text-[10px]">No Data</div>}
          </div>
        </aside>
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-10 animate-in fade-in duration-300">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between"><div className="flex items-center gap-3 font-black uppercase tracking-widest text-sm text-white text-left"><Keyboard className="w-5 h-5 text-blue-500" /> Shortcuts</div>
            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-5 h-5" /></button></div>
            <div className="p-8 space-y-6">{(Object.keys(shortcuts) as (keyof Shortcuts)[]).map(key => (<div key={key} className="flex items-center justify-between group"><span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 group-hover:text-neutral-300">{key}</span>
            <input value={shortcuts[key]} onKeyDown={e => { e.preventDefault(); const newShortcuts = {...shortcuts, [key]: e.key}; setShortcuts(newShortcuts); store.set("shortcuts", newShortcuts); store.save(); }} readOnly className="bg-neutral-950 border border-white/5 rounded-xl px-4 py-2 text-center text-[11px] font-mono text-blue-400 w-32 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-default" /></div>))}
            <button onClick={() => { setShortcuts(DEFAULT_SHORTCUTS); store.set("shortcuts", DEFAULT_SHORTCUTS); store.save(); showToast('Shortcuts Reset', 'info'); }} className="w-full py-3 bg-white/5 hover:bg-red-900/20 rounded-2xl text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-red-400 transition-all">Reset to Default</button></div>
          </div>
        </div>
      )}

      {showWildcards && (
        <WildcardTools 
            onClose={() => setShowWildcards(false)} 
            images={images} 
            currentIndex={currentIndex} 
            batchRange={batchRange} 
        />
      )}

      {showDebug && (
        <DebugPanel folderPath={folderPath} onClose={() => setShowDebug(false)} />
      )}

      <footer className="px-6 h-10 bg-neutral-950 border-t border-white/5 text-[10px] text-neutral-600 flex items-center justify-between shrink-0 z-10 font-medium">
        <div className="truncate font-mono italic opacity-50">{folderPath || 'No Folder Selected'}</div>
        <div className="flex gap-8 items-center">{images.length > 0 && <><div className="flex gap-2"><span className="text-white/60 font-black tracking-tighter">{currentIndex + 1}</span><span className="opacity-20 uppercase text-[8px] font-black">of</span><span className="text-neutral-400 font-black tracking-tighter">{images.length}</span></div></>}</div>
      </footer>
    </div>
  );
}

export default App;
