import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, confirm, message } from "@tauri-apps/plugin-dialog";
import { useAppStore, ImageMetadata, Shortcuts, DEFAULT_SHORTCUTS } from "./store/useAppStore";
import { FolderOpen, Image as ImageIcon, Layers, ChevronLeft, ChevronRight, Search, X, Settings, Keyboard, Filter, Wand2, ArrowDownAZ, ArrowUpAZ, Clock, History, Zap, Twitter, Dices } from "lucide-react";
import { useToast } from "./components/Toast";
import { ZoomPanViewer } from "./components/ZoomPanViewer";
import { FilterPanel } from "./components/FilterPanel";
import { WildcardTools } from "./components/WildcardTools";
import { DebugPanel } from "./components/DebugPanel";
import { TagRefiner } from "./components/TagRefiner";
import { BatchCropModule } from "./components/BatchCropModule";
import { listen } from "@tauri-apps/api/event";

// Use direct imports which are more reliable in Vite 7
// @ts-ignore
import * as ReactWindow from "react-window";
const List = ReactWindow.FixedSizeList || (ReactWindow as any).default?.FixedSizeList || ReactWindow;
// @ts-ignore
import * as AutoSizerPkg from "react-virtualized-auto-sizer";
// @ts-ignore
const AutoSizer = AutoSizerPkg.default || AutoSizerPkg;

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
    folderPath, images, currentIndex, currentMetadata, shortcuts, batchMode, indexProgress, twitterSettings, recursive, sortMethod,
    setFolderPath, setImages, setCurrentIndex, setCurrentMetadata, removeImages, setShortcuts, setBatchMode, setIndexProgress, setTwitterSettings, setRecursive, setSortMethod: setAppSortMethod
  } = useAppStore();

  const handleSortChange = (method: SortMethod) => {
    setAppSortMethod(method);
  };

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
  }, [images, currentIndex, twitterSettings]);

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
    const unlistenProgress = listen('index-progress', (event: any) => {
      setIndexProgress(event.payload);
    });
    const unlistenUpdate = listen('folder-updated', (event: any) => {
      const payload = event.payload as any;
      // Update if it's the current folder or recursive is on
      if (payload.folder === folderPath || recursive) {
        setImages(payload.images);
      }
    });
    return () => { 
      unlistenProgress.then(f => f());
      unlistenUpdate.then(f => f());
    };
  }, [setIndexProgress, folderPath, recursive, setImages]);

  // Initial load and settings change re-scan
  const initialScanDone = useRef(false);
  useEffect(() => {
    if (folderPath && !initialScanDone.current) {
      const init = async () => {
        try {
          const result = await invoke("scan_directory", { 
            path: folderPath, 
            sortMethod: sortMethod,
            recursive: recursive
          }) as any;
          setImages(result.images);
          // Restore index if valid
          if (currentIndex !== undefined && result.images.length > currentIndex) {
            setCurrentIndex(currentIndex);
          }
          initialScanDone.current = true;
        } catch (e) {}
      };
      init();
    }
  }, [folderPath]);

  // Handle recursive/sort change automatically
  useEffect(() => {
    if (folderPath && initialScanDone.current) {
        const rescan = async () => {
            if (isSearching) {
                handleSearch(activeFilters, sortMethod);
            } else {
                const currentPath = images[currentIndex]?.path;
                const result = await invoke("scan_directory", { path: folderPath, sortMethod, recursive }) as any;
                setImages(result.images);
                if (currentPath) {
                    const newIndex = result.images.findIndex((img: any) => img.path === currentPath);
                    if (newIndex !== -1) setCurrentIndex(newIndex);
                }
            }
        };
        rescan();
    }
  }, [recursive, sortMethod]);

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

  const handleRandom = useCallback(() => {
    if (images.length === 0) return;
    const randomIndex = Math.floor(Math.random() * images.length);
    setCurrentIndex(randomIndex);
  }, [images, setCurrentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || showSettings) return;
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') { setShowDebug(prev => !prev); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); return; }
      if (e.key.toLowerCase() === 'r') { handleReload(); return; }
      if (images.length === 0) return;
      
      const key = e.key.toLowerCase();
      const s = {
        next: shortcuts.next.toLowerCase(),
        prev: shortcuts.prev.toLowerCase(),
        delete: shortcuts.delete.toLowerCase(),
        keep: shortcuts.keep.toLowerCase(),
        batch: shortcuts.batch.toLowerCase(),
        twitter: shortcuts.twitter.toLowerCase(),
        search: shortcuts.search.toLowerCase(),
        random: shortcuts.random.toLowerCase()
      };

      if (key === s.next || e.key === shortcuts.next) nextImage();
      else if (key === s.prev || e.key === shortcuts.prev) prevImage();
      else if (key === s.delete || e.key === shortcuts.delete) handleDelete();
      else if (key === s.keep) handleKeep();
      else if (key === s.batch) setBatchMode(!batchMode);
      else if (key === s.twitter) handleTwitterUpload();
      else if (key === s.random) handleRandom();
      else if (key === s.search) { e.preventDefault(); document.getElementById('search-input')?.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, currentIndex, batchMode, batchRange, shortcuts, showSettings, handleKeep, handleDelete, handleUndo, handleTwitterUpload, handleRandom]);

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
            <div className="w-px h-4 bg-white/5 mx-1" />
            <button 
                onClick={handleRandom}
                title={`Random Image (${shortcuts.random})`}
                className="p-1.5 rounded-lg transition-all text-neutral-500 hover:text-white hover:bg-white/5"
            >
                <Dices className="w-3.5 h-3.5" />
            </button>
        </div>
        </div>
        <div className="flex items-center gap-3">{images.length > 0 && <div className="flex items-center gap-2 bg-neutral-800/50 p-1.5 rounded-xl border border-white/5">
            <button onClick={handleKeep} className="px-4 py-1.5 bg-neutral-900 hover:bg-green-600 rounded-lg text-[10px] font-bold uppercase">Keep</button>
            <button onClick={handleDelete} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${isTrashFolder ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-neutral-900 hover:bg-red-600'}`}>Trash</button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button 
                onClick={() => {
                  useAppStore.getState().setWorkshopTargetPaths(images.map(i => i.path));
                  setShowWildcards(true);
                }} 
                className="px-3 py-1.5 bg-neutral-900 hover:bg-purple-600/40 border border-transparent hover:border-purple-500/20 rounded-lg text-[10px] font-bold text-purple-400 uppercase transition-all"
                title="Send all current images to Workshop"
            >
                <Wand2 className="w-3.5 h-3.5" />
            </button>
        </div>}
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
          <div className="flex gap-2 p-2">
            {isSearching && <button onClick={moveSearchResults} className="flex-1 py-2 bg-neutral-800 hover:bg-blue-600/20 border border-blue-500/10 rounded-xl text-[10px] font-bold text-neutral-400 uppercase transition-all">Classify results</button>}
          </div>
          </div>
          
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
              <div className="relative w-full h-full flex items-center justify-center p-0 overflow-hidden group">
                {imageSrc && (
                  <ZoomPanViewer 
                    key={`${images[currentIndex].path}-${reloadTimestamp}`} 
                    src={imageSrc} 
                    onBatchCrop={() => setShowBatchCrop(true)}
                    className="animate-image-change" 
                  />
                )}
                
                {/* Viewer Overlay Controls */}
                <div className="absolute top-6 right-6 flex flex-col gap-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button 
                        onClick={() => {
                            if (!currentMetadata?.prompt) return;
                            const tags = currentMetadata.prompt.split(',').map((s: string) => s.trim()).filter(Boolean);
                            const counts: Record<string, number> = {};
                            tags.forEach((t: string) => counts[t] = 1);
                            setViewerTagCounts(counts);
                            setShowViewerRefiner(true);
                        }}
                        className="p-3 bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-blue-600/20 hover:border-blue-500/50 hover:text-blue-400 transition-all shadow-2xl"
                        title="Refine Filter with this Image"
                    >
                        <Filter className="w-5 h-5" />
                    </button>
                </div>

                <button onClick={prevImage} className="absolute left-6 z-10 p-4 rounded-2xl bg-neutral-900/80 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 shadow-2xl backdrop-blur-xl"><ChevronLeft className="w-8 h-8" /></button>
                <button onClick={nextImage} className="absolute right-6 z-10 p-4 rounded-2xl bg-neutral-900/80 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 shadow-2xl backdrop-blur-xl"><ChevronRight className="w-8 h-8" /></button>
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-neutral-900/90 px-6 py-2 rounded-full text-[11px] font-bold border border-white/10 backdrop-blur-2xl shadow-2xl flex items-center gap-4"><span className="opacity-50">{images[currentIndex].name}</span><div className="w-px h-3 bg-white/10" /><span className="text-blue-400">{(images[currentIndex].size / 1024 / 1024).toFixed(2)} MB</span></div>
              </div>
            )
          ) : <div className="flex-1 flex flex-col items-center justify-center opacity-10"><ImageIcon className="w-48 h-48 animate-pulse" /><p className="text-sm font-black uppercase tracking-[0.5em]">System Ready</p></div>}
        </section>

        <aside className="w-80 border-l border-white/5 bg-neutral-900 flex flex-col shrink-0 overflow-hidden text-left">
          <div className="p-6 border-b border-white/5 flex items-center justify-between font-black uppercase tracking-widest text-[11px]">
            <span>Inspector</span>
            <div className="flex gap-3 items-center">
                {currentMetadata && <button onClick={handleTwitterUpload} className="p-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-all" title={`Share on X (${shortcuts.twitter})`}><Twitter className="w-3.5 h-3.5" /></button>}
                {currentMetadata && <button onClick={() => { navigator.clipboard.writeText(currentMetadata.raw); showToast('Raw Copied', 'success'); }} className="text-[9px] text-neutral-500 hover:text-white uppercase transition-colors">Raw</button>}
            </div>
          </div>
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
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-thin">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Keyboard Shortcuts</h4>
                {(Object.keys(shortcuts) as (keyof Shortcuts)[]).map(key => (<div key={key} className="flex items-center justify-between group"><span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 group-hover:text-neutral-300">{key}</span>
                <input value={shortcuts[key]} onKeyDown={e => { e.preventDefault(); const newShortcuts = {...shortcuts, [key]: e.key}; setShortcuts(newShortcuts); }} readOnly className="bg-neutral-950 border border-white/5 rounded-xl px-4 py-2 text-center text-[11px] font-mono text-blue-400 w-32 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-default" /></div>))}
              </div>

              <div className="space-y-4 pt-6 border-t border-white/5">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Twitter (X) Integration</h4>
                <p className="text-[9px] text-neutral-500 italic mb-4 leading-relaxed">
                    Leave API keys empty to use the **Clipboard + Browser** method. 
                    Fill them in for **Standard API Direct Upload**.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">API Key</label>
                    <input type="password" value={twitterSettings.apiKey} onChange={e => setTwitterSettings({...twitterSettings, apiKey: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">API Secret</label>
                    <input type="password" value={twitterSettings.apiSecret} onChange={e => setTwitterSettings({...twitterSettings, apiSecret: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">Access Token</label>
                    <input type="password" value={twitterSettings.accessToken} onChange={e => setTwitterSettings({...twitterSettings, accessToken: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">Access Secret</label>
                    <input type="password" value={twitterSettings.accessSecret} onChange={e => setTwitterSettings({...twitterSettings, accessSecret: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <label className="text-[9px] font-bold uppercase text-neutral-500">Post Template</label>
                  <textarea 
                    value={twitterSettings.template} 
                    onChange={e => setTwitterSettings({...twitterSettings, template: e.target.value})}
                    className="w-full h-24 bg-neutral-950 border border-white/5 rounded-xl p-3 text-[11px] focus:outline-none focus:border-blue-500/50 resize-none scrollbar-thin"
                    placeholder="{phrases} #AIart"
                  />
                  <p className="text-[8px] text-neutral-600 italic">Use {"{phrases}"} to insert picked tags.</p>
                </div>
                <div className="space-y-3">
                  <label className="text-[9px] font-bold uppercase text-neutral-500">Phrases to Pick (Comma separated)</label>
                  <input 
                    type="text"
                    value={twitterSettings.phrasesToPick.join(', ')} 
                    onChange={e => setTwitterSettings({...twitterSettings, phrasesToPick: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                    className="w-full bg-neutral-950 border border-white/5 rounded-xl px-4 py-2 text-[11px] focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <label className="flex items-center justify-between group cursor-pointer">
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 group-hover:text-neutral-300">Auto-copy Image</span>
                  <input 
                    type="checkbox" 
                    checked={twitterSettings.autoCopyImage} 
                    onChange={e => setTwitterSettings({...twitterSettings, autoCopyImage: e.target.checked})}
                    className="w-4 h-4 accent-blue-600"
                  />
                </label>
              </div>

              <div className="space-y-4 pt-6 border-t border-white/5">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Database Management</h4>
                <p className="text-[9px] text-neutral-500 italic leading-relaxed">
                    If search results are incorrect or performance is lagging, you can reset the indexing database. 
                    This will force a full re-scan of folders you visit.
                </p>
                <button 
                    onClick={async () => {
                        if (await confirm("Are you sure you want to CLEAR the entire image database? This will trigger full re-indexing of all folders.")) {
                            try {
                                await invoke("clear_database");
                                if (folderPath) {
                                    showToast("Database Initialized. Full re-indexing current folder...", "success");
                                    const result = await invoke("scan_directory", { 
                                        path: folderPath, 
                                        sortMethod, 
                                        recursive,
                                        forceReindex: true 
                                    }) as any;
                                    setImages(result.images);
                                } else {
                                    showToast("Database Initialized.", "success");
                                }
                            } catch (e: any) {
                                showToast(`Failed to clear DB: ${e}`, "error");
                            }
                        }
                    }}
                    className="w-full py-3 bg-red-950/10 hover:bg-red-600 border border-red-500/20 hover:border-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                    <History className="w-3.5 h-3.5" /> Initialize & Rebuild Database
                </button>
              </div>

              <button onClick={() => { setShortcuts(DEFAULT_SHORTCUTS); showToast('Shortcuts Reset', 'info'); }} className="w-full py-3 bg-white/5 hover:bg-neutral-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-300 transition-all">Reset Shortcuts to Default</button>
            </div>
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

      {showViewerRefiner && (
        <TagRefiner 
            tagCounts={viewerTagCounts} 
            initialExcluded={useAppStore.getState().workshopFilter.exact_match || []} 
            onClose={() => setShowViewerRefiner(false)}
            onApply={async (excluded) => {
                const currentFilter = useAppStore.getState().workshopFilter;
                const newFilter = {...currentFilter, exact_match: excluded};
                useAppStore.getState().setWorkshopFilter(newFilter);
                setShowViewerRefiner(false);
                
                // Auto-save exact match filter
                try {
                    const content = excluded.join(', ');
                    await invoke("write_filter_file", { name: 'default_exact_exclusion.txt', content });
                    showToast(`Applied & Saved ${excluded.length} exclusions`, 'success');
                } catch (e: any) {
                    showToast(`Applied but failed to save: ${e}`, 'error');
                }
            }}
        />
      )}

      {showDebug && (
        <DebugPanel folderPath={folderPath} onClose={() => setShowDebug(false)} />
      )}

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
                fillColor: fillColor
              }) as string[];
              
              setShowBatchCrop(false);
              showToast(`Successfully saved ${paths.length} crops to 'cropped' folder`, "success");
            } catch (e: any) {
              showToast(e.toString(), "error");
            }
          }}
        />
      )}

      <footer className="px-6 h-10 bg-neutral-950 border-t border-white/5 text-[10px] text-neutral-600 flex items-center justify-between shrink-0 z-10 font-medium">
        <div className="truncate font-mono italic opacity-50 w-1/4">{folderPath || 'No Folder Selected'}</div>
        
        <div className="flex-1 flex justify-center px-4">
          {indexProgress?.is_indexing && (
            <div className="flex items-center gap-3 w-full max-w-xs animate-in slide-in-from-bottom-2 duration-300">
              <span className="shrink-0 animate-pulse text-blue-500 font-black uppercase text-[8px] tracking-widest">Indexing</span>
              <div className="flex-1 h-1 bg-neutral-900 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300 shadow-[0_0_10px_rgba(37,99,235,0.4)]" 
                  style={{ width: `${(indexProgress.current / indexProgress.total) * 100}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-[9px] text-neutral-400 w-16 text-right">{indexProgress.current} / {indexProgress.total}</span>
            </div>
          )}
        </div>

        <div className="flex gap-8 items-center justify-end w-1/4">{images.length > 0 && <><div className="flex gap-2"><span className="text-white/60 font-black tracking-tighter">{currentIndex + 1}</span><span className="opacity-20 uppercase text-[8px] font-black">of</span><span className="text-neutral-400 font-black tracking-tighter">{images.length}</span></div></>}</div>
      </footer>
    </div>
  );
}

export default App;
