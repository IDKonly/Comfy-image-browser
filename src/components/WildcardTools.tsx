import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { LazyStore } from "@tauri-apps/plugin-store";
import { X, Wand2, Copy, Info, Trash2, FolderPlus, ListFilter, FilePlus, Save, LayoutGrid, ChevronDown, ChevronUp, Download, Layers, FileUp } from "lucide-react";
import { useToast } from "./Toast";
import { TagRefiner } from "./TagRefiner";

const settingsStore = new LazyStore(".settings.json");

interface MergeFilterModalProps {
  onMerge: (tags: string[]) => void;
  onClose: () => void;
}

const MergeFilterModal = ({ onMerge, onClose }: MergeFilterModalProps) => {
  const [input, setInput] = useState("");
  
  const processMerge = () => {
    const tags = input.split(/[,\n]/).map(s => s.trim()).filter(s => s);
    onMerge(tags);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-white">Merge Tags</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
            <p className="text-[10px] text-neutral-500 font-bold uppercase">Paste tags (comma or newline separated)</p>
            <textarea 
                value={input} 
                onChange={e => setInput(e.target.value)}
                className="w-full h-40 bg-neutral-950 border border-white/5 rounded-2xl p-4 text-[11px] font-mono focus:outline-none focus:border-blue-500/50 resize-none scrollbar-thin"
                placeholder="tag1, tag2, tag3..."
            />
            <button 
                onClick={processMerge}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-xl"
            >
                Merge Into List
            </button>
        </div>
      </div>
    </div>
  );
};

import { useAppStore, FilterState } from "../store/useAppStore";

interface WildcardToolsProps {
  onClose: () => void;
  images: any[];
  currentIndex: number;
  batchRange: [number, number] | null;
}

export const WildcardTools = ({ onClose, images, currentIndex, batchRange }: WildcardToolsProps) => {
  const [threshold, setThreshold] = useState(0.5);
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const targetPaths = useAppStore(state => state.workshopTargetPaths);
  const setTargetPaths = useAppStore(state => state.setWorkshopTargetPaths);
  const filter = useAppStore(state => state.workshopFilter);
  const setFilter = useAppStore(state => state.setWorkshopFilter);

  const [comparisonPath, setComparisonPath] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [recursive, setRecursive] = useState(false);
  
  const [showRefiner, setShowRefiner] = useState(false);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [mergeTarget, setMergeTarget] = useState<keyof FilterState | null>(null);
  const isLoaded = useRef(false);

  const { showToast } = useToast();
  const targetPathsRef = useRef(targetPaths);
  const comparisonPathRef = useRef(comparisonPath);
  const recursiveRef = useRef(recursive);

  useEffect(() => { targetPathsRef.current = targetPaths; }, [targetPaths]);
  useEffect(() => { comparisonPathRef.current = comparisonPath; }, [comparisonPath]);
  useEffect(() => { recursiveRef.current = recursive; }, [recursive]);

  const loadSettings = async () => {
    try {
      const savedThreshold = await settingsStore.get<number>("workshop_threshold");
      const savedMaxWords = await settingsStore.get<number>("workshop_max_words");
      const savedMinTags = await settingsStore.get<number>("workshop_min_tags");
      const savedMaxDepth = await settingsStore.get<number>("workshop_max_depth");
      const savedRecursive = await settingsStore.get<boolean>("workshop_recursive");
      const savedSimpleMode = await settingsStore.get<boolean>("workshop_simple_mode");
      const savedFilter = await settingsStore.get<FilterState>("workshop_filter");

      if (savedThreshold != null) setThreshold(savedThreshold);
      if (savedRecursive != null) setRecursive(savedRecursive);
      
      const currentFilter = { ...filter };
      if (savedFilter) {
          Object.assign(currentFilter, savedFilter);
      }

      setFilter({
        ...currentFilter,
        max_words: savedMaxWords != null ? savedMaxWords : currentFilter.max_words,
        min_tags: savedMinTags != null ? savedMinTags : currentFilter.min_tags,
        max_depth: savedMaxDepth != null ? savedMaxDepth : currentFilter.max_depth,
        simple_mode: savedSimpleMode != null ? savedSimpleMode : (currentFilter.simple_mode ?? false),
        mix_mode: currentFilter.mix_mode ?? false,
        mix_depth: currentFilter.mix_depth ?? 2,
        simple_exclusions: currentFilter.simple_exclusions || [],
      });

      // Load filter text lists ONLY if we don't have a saved filter state in settingsStore
      if (!savedFilter) {
          const files = [
            { key: 'exact_match', name: 'default_exact_exclusion.txt' },
            { key: 'partial_match', name: 'default_partial_exclusion.txt' },
            { key: 'exceptions', name: 'default_exception_exclusion.txt' }
          ];

          const loadedFilter = { ...currentFilter };
          for (const file of files) {
            try {
              const content = await invoke("read_filter_file", { name: file.name }) as string;
              if (content) {
                (loadedFilter as any)[file.key] = content.split(',').map((s: string) => s.trim()).filter((s: string) => s);
              }
            } catch (e) {}
          }
          setFilter(loadedFilter);
      }
      isLoaded.current = true;
    } catch (e) {
      console.error("Failed to load settings", e);
      isLoaded.current = true;
    }
  };

  const saveSettings = async () => {
    if (!isLoaded.current) return;
    settingsStore.set("workshop_threshold", threshold);
    settingsStore.set("workshop_max_words", filter.max_words);
    settingsStore.set("workshop_min_tags", filter.min_tags);
    settingsStore.set("workshop_max_depth", filter.max_depth);
    settingsStore.set("workshop_recursive", recursive);
    settingsStore.set("workshop_simple_mode", filter.simple_mode);
    settingsStore.set("workshop_mix_mode", filter.mix_mode);
    settingsStore.set("workshop_mix_depth", filter.mix_depth);
    settingsStore.set("workshop_filter", filter);
    await settingsStore.save();
  };

  useEffect(() => {
    loadSettings();

    const unlistenProgress = listen('workshop-progress', (event: any) => {
        const val = event.payload;
        if (typeof val === 'number') {
            setProgress(val);
        }
    });

    const unlistenDrop = listen('tauri://drag-drop', async (event: any) => {
      if (!document.querySelector('[data-wildcard-modal]')) return;
      const paths = (event.payload as any).paths as string[];
      if (paths) {
        const addedCount = await addPathsRecursive(paths);
        if (addedCount > 0) {
          showToast(`Added ${addedCount} files`, 'success');
        }
      }
    });

    return () => { 
        unlistenProgress.then(f => f());
        unlistenDrop.then(f => f()); 
    };
  }, []);

  // Save settings whenever relevant values change
  useEffect(() => {
    saveSettings();
  }, [threshold, filter, recursive]);

  const handleMerge = (newTags: string[]) => {
    if (!mergeTarget) return;
    const currentList = filter[mergeTarget] as string[];
    const combined = Array.from(new Set([...currentList, ...newTags]));
    setFilter({ ...filter, [mergeTarget]: (combined as any) });
    showToast(`Merged ${newTags.length} tags`, 'success');
  };

  const handleImportFromViewer = () => {
    let pathsToAdd: string[] = [];
    if (batchRange) {
      pathsToAdd = images.slice(batchRange[0], batchRange[1] + 1).map(img => img.path);
    } else if (images[currentIndex]) {
      pathsToAdd = [images[currentIndex].path];
    }

    if (pathsToAdd.length > 0) {
        const uniqueNew = Array.from(new Set([...targetPaths, ...pathsToAdd]));
        setTargetPaths(uniqueNew);
        showToast(`Imported ${pathsToAdd.length} images from viewer`, 'success');
    } else {
        showToast("No images to import", 'info');
    }
  };

  const addPathsRecursive = async (paths: string[]) => {
    let totalAdded = 0;
    const newPaths: string[] = [];

    try {
        const result = await invoke("scan_paths", { 
            paths, 
            recursive: recursiveRef.current 
        }) as any[];
        if (result && Array.isArray(result)) {
            const imgPaths = result.map((img: any) => img.path);
            newPaths.push(...imgPaths);
        }
    } catch (e) {
        console.error("Batch scan error:", e);
    }

    if (newPaths.length > 0) {
        const uniqueNew = Array.from(new Set([...targetPathsRef.current, ...newPaths]));
        totalAdded = uniqueNew.length - targetPathsRef.current.length;
        setTargetPaths(uniqueNew);
    }
    return totalAdded;
  };

  const handleAddFiles = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (selected && Array.isArray(selected)) {
      const addedCount = await addPathsRecursive(selected);
      if (addedCount > 0) showToast(`Added ${addedCount} files`, 'success');
    }
  };

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      const addedCount = await addPathsRecursive([selected]);
      if (addedCount > 0) showToast(`Added ${addedCount} files from folder`, 'success');
    }
  };

  const runWorkshop = async () => {
    setLoading(true);
    setProgress(0);
    try {
      if (targetPaths.length === 0) {
        showToast("No images selected", "error");
        return;
      }

      let res: string[] = [];
      if (comparisonPath) {
          res = await invoke("compare_tags", { 
              targetPaths, 
              comparisonPaths: [comparisonPath],
              threshold,
              filter
          }) as string[];
      } else {
          res = await invoke("generate_wildcards", { paths: targetPaths, threshold, filter }) as string[];
      }
      
      setResults(res);
      showToast(`Workshop complete: ${res.length} items`, "success");
    } catch (e: any) {
      showToast(e.toString(), "error");
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const openRefiner = async () => {
    setLoading(true);
    try {
      const counts = await invoke("get_tag_counts", { paths: targetPaths }) as Record<string, number>;
      setTagCounts(counts);
      setShowRefiner(true);
    } catch (e: any) {
      showToast(e.toString(), "error");
    } finally {
      setLoading(false);
    }
  };

  const saveFilterList = async (key: keyof FilterState, filename: string) => {
    try {
        const content = (filter[key] as string[]).join(', ');
        await invoke("write_filter_file", { name: filename, content });
        showToast(`Saved ${filename}`, 'success');
    } catch (e: any) {
        showToast(e.toString(), 'error');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(results.join('\n'));
    showToast("Copied to clipboard", "success");
  };

  const handleExport = async () => {
    if (results.length === 0) return;
    try {
      const path = await save({
        filters: [{ name: 'Text', extensions: ['txt'] }],
        defaultPath: 'wildcards.txt'
      });
      if (path) {
        await invoke("save_to_file", { path, content: results.join('\n') });
        showToast("Exported successfully", "success");
      }
    } catch (e: any) {
      showToast(e.toString(), "error");
    }
  };

  const removePath = (path: string) => {
    setTargetPaths(targetPaths.filter(p => p !== path));
  };

  const clearPaths = () => setTargetPaths([]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div data-wildcard-modal className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-6xl h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest">Wildcard Workshop</h2>
              <p className="text-[10px] text-neutral-500 font-bold uppercase">Consolidated Tools & Analysis</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Path List Sidebar (Target Images) */}
          <div className="w-72 border-r border-white/5 flex flex-col overflow-hidden bg-neutral-950/20">
            <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Target Images ({targetPaths.length})</span>
                <button onClick={clearPaths} className="text-[9px] font-black uppercase text-red-500 hover:text-red-400 transition-colors">Clear</button>
            </div>
            
            <div className="p-3 grid grid-cols-1 gap-2 border-b border-white/5 bg-neutral-950/20">
                <button onClick={handleImportFromViewer} className="flex items-center justify-center gap-2 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 rounded-xl text-[9px] font-black uppercase transition-all text-blue-400">
                    <LayoutGrid className="w-3.5 h-3.5" /> Import from Viewer
                </button>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleAddFiles} className="flex items-center justify-center gap-2 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-[9px] font-black uppercase transition-all">
                        <FilePlus className="w-3.5 h-3.5" /> Files
                    </button>
                    <button onClick={handleAddFolder} className="flex items-center justify-center gap-2 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-[9px] font-black uppercase transition-all">
                        <FolderPlus className="w-3.5 h-3.5" /> Folder
                    </button>
                </div>
                <button 
                    onClick={() => setRecursive(!recursive)}
                    className={`flex items-center justify-center gap-2 py-2 rounded-xl text-[9px] font-black uppercase transition-all border ${recursive ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-neutral-800 border-white/5 text-neutral-500 hover:text-neutral-300'}`}
                >
                    <Layers className="w-3.5 h-3.5" /> Recursive Scan
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                {targetPaths.length > 0 ? targetPaths.map(p => (
                    <div key={p} className="group flex items-center justify-between p-2 bg-neutral-800/50 hover:bg-neutral-800 rounded-lg border border-transparent hover:border-white/5 transition-all">
                        <span className="text-[9px] text-neutral-400 truncate flex-1 pr-2">{p.split(/[\\/]/).pop()}</span>
                        <button onClick={() => removePath(p)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/20 rounded text-red-500"><Trash2 className="w-3 h-3" /></button>
                    </div>
                )) : (
                    <div className="flex flex-col items-center justify-center h-full opacity-20 p-4 text-center">
                        <FolderPlus className="w-8 h-8 mb-2" />
                        <p className="text-[9px] font-bold uppercase tracking-wider leading-relaxed">Drag & Drop Images Here<br/>or use buttons above</p>
                    </div>
                )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-900/50">
            <div className="p-6 flex-1 overflow-y-auto space-y-6 scrollbar-thin">
              
              {/* Progress Bar Area */}
              {loading && (
                <div className="space-y-2 animate-in fade-in duration-300">
                    <div className="flex justify-between text-[10px] font-black uppercase text-blue-400">
                        <span>Processing Images...</span>
                        <span>{progress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-white/5">
                        <div className="h-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                    </div>
                </div>
              )}

              {/* Header Info */}
              <div className="bg-blue-600/5 border border-blue-500/10 p-4 rounded-2xl flex gap-4">
                <Info className="w-5 h-5 text-blue-500 shrink-0" />
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Extracts and compresses tags from multiple images into compact 
                  <span className="text-blue-400 font-mono"> {"{base|diff}"} </span> wildcard patterns. 
                  Similar prompts are merged automatically based on the similarity threshold.
                </p>
              </div>

              {/* Cleaning Base Section */}
              <div className="space-y-3 p-4 bg-amber-600/5 border border-amber-500/10 rounded-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-amber-500/70">Cleaning Base (Optional)</span>
                        <div className="group relative">
                            <Info className="w-3.5 h-3.5 text-amber-600 cursor-help" />
                            <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-neutral-900 border border-white/10 rounded-xl text-[9px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-2xl leading-relaxed">
                                Tags in this image (e.g., character base, quality tags) will be **subtracted** from target images to make the final wildcards cleaner.
                            </div>
                        </div>
                    </div>
                </div>
                <div className={`p-3 rounded-xl border flex items-center justify-between transition-all ${comparisonPath ? 'bg-neutral-950 border-amber-500/30 shadow-[inner_0_2px_4px_rgba(0,0,0,0.3)]' : 'bg-neutral-950 border-white/5'}`}>
                    <span className="text-[10px] text-neutral-400 truncate">{comparisonPath ? comparisonPath.split(/[\\/]/).pop() : "Drag a base image here to clean common tags"}</span>
                    {comparisonPath && <button onClick={() => setComparisonPath(null)} className="p-1 hover:bg-red-900/20 rounded text-red-500"><X className="w-3.5 h-3.5" /></button>}
                </div>
              </div>

              {/* Settings Bar */}
              <div className="grid grid-cols-5 gap-4">
                {!filter.simple_mode && (
                  <>
                    <div className="col-span-1 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-neutral-500 tracking-wider">Similarity</span>
                            <span className="text-[11px] font-mono text-blue-400 font-bold">{threshold.toFixed(2)}</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.05" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} className="w-full accent-blue-600" />
                        
                        {filter.mix_mode && (
                          <div className="pt-2 space-y-2 animate-in slide-in-from-top-2 duration-300">
                              <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Mix Depth (Start)</span>
                                  <span className="text-[10px] font-mono text-indigo-400 font-bold">{filter.mix_depth}</span>
                              </div>
                              <input 
                                  type="range" min="0" max="10" step="1" 
                                  value={filter.mix_depth} 
                                  onChange={e => setFilter({...filter, mix_depth: parseInt(e.target.value)})} 
                                  className="w-full accent-indigo-600" 
                              />
                          </div>
                        )}
                    </div>
                    <div className="bg-neutral-950 p-3 rounded-2xl border border-white/5 flex flex-col justify-center">
                        <label className="text-[8px] font-black uppercase text-neutral-600 mb-1 block tracking-widest">Max Words/Tag</label>
                        <input type="number" value={filter.max_words} onChange={e => setFilter({...filter, max_words: parseInt(e.target.value)})} className="bg-transparent text-[11px] font-bold text-neutral-300 w-full focus:outline-none" />
                    </div>
                    <div className="bg-neutral-950 p-3 rounded-2xl border border-white/5 flex flex-col justify-center">
                        <label className="text-[8px] font-black uppercase text-neutral-600 mb-1 block tracking-widest">Min Tags/Group</label>
                        <input type="number" value={filter.min_tags} onChange={e => setFilter({...filter, min_tags: parseInt(e.target.value)})} className="bg-transparent text-[11px] font-bold text-neutral-300 w-full focus:outline-none" />
                    </div>
                    <div className="bg-neutral-950 p-3 rounded-2xl border border-white/5 flex flex-col justify-center relative group">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">Max Depth</label>
                            <Info className="w-2.5 h-2.5 text-neutral-700 cursor-help" />
                        </div>
                        <input type="number" value={filter.max_depth} onChange={e => setFilter({...filter, max_depth: parseInt(e.target.value)})} className="bg-transparent text-[11px] font-bold text-neutral-300 w-full focus:outline-none" />
                        <div className="absolute left-0 bottom-full mb-2 w-48 p-2 bg-neutral-900 border border-white/10 rounded-lg text-[8px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-2xl leading-tight">
                            Limits recursive pattern matching to prevent errors. Lower values result in flatter, simpler wildcards.
                        </div>
                    </div>
                  </>
                )}
                {filter.simple_mode && (
                  <div className="col-span-4 bg-amber-600/5 border border-amber-500/20 rounded-2xl p-4 flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase text-amber-500 tracking-wider">Simple Exclusions</span>
                      <span className="text-[8px] text-amber-600 font-bold uppercase">Only basic string removal logic is applied</span>
                    </div>
                    <textarea 
                      value={filter.simple_exclusions.join(', ')} 
                      onChange={e => setFilter({...filter, simple_exclusions: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                      className="bg-neutral-950/50 border border-white/5 rounded-xl p-2 text-[10px] font-mono text-neutral-300 h-12 focus:outline-none focus:border-amber-500/30 resize-none scrollbar-thin"
                      placeholder="e.g. masterpiece, best quality, solo, rating:safe..."
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <button 
                      onClick={() => setFilter({...filter, simple_mode: !filter.simple_mode})}
                      className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${filter.simple_mode ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-600/20' : 'bg-neutral-950 border-white/5 text-neutral-500 hover:text-neutral-300'}`}
                  >
                      <label className={`text-[8px] font-black uppercase mb-1 block tracking-widest cursor-pointer ${filter.simple_mode ? 'text-amber-100' : 'text-neutral-600'}`}>Simple Mode</label>
                      <span className="text-[10px] font-black uppercase">{filter.simple_mode ? 'Enabled' : 'Disabled'}</span>
                  </button>
                  <button 
                      onClick={() => setFilter({...filter, mix_mode: !filter.mix_mode})}
                      className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${filter.mix_mode ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-neutral-950 border-white/5 text-neutral-500 hover:text-neutral-300'}`}
                  >
                      <label className={`text-[8px] font-black uppercase mb-1 block tracking-widest cursor-pointer ${filter.mix_mode ? 'text-indigo-100' : 'text-neutral-600'}`}>Mix Mode</label>
                      <span className="text-[10px] font-black uppercase">{filter.mix_mode ? 'Enabled' : 'Disabled'}</span>
                  </button>
                </div>
              </div>

              {/* Action Button & Refiner */}
              <div className="flex gap-3">
                <button 
                    onClick={runWorkshop} disabled={loading || targetPaths.length === 0}
                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 text-white"
                >
                    {loading ? "Processing..." : `Generate Compressed Wildcards (${targetPaths.length} Images)`}
                </button>
                <button onClick={openRefiner} disabled={targetPaths.length === 0} className="px-6 py-4 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all text-neutral-300" title="Manage Exclusions">
                    <ListFilter className="w-4 h-4" />
                </button>
              </div>

              {/* Filters Section */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                    {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Exclusion Filters
                </button>
                
                {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in zoom-in-95 duration-300">
                        {[
                            { id: 'partial_match', label: 'Partial Match', filename: 'default_partial_exclusion.txt', color: 'blue' },
                            { id: 'exact_match', label: 'Exact Match', filename: 'default_exact_exclusion.txt', color: 'red' },
                            { id: 'exceptions', label: 'Exceptions', filename: 'default_exception_exclusion.txt', color: 'green' },
                        ].map(f => (
                            <div key={f.id} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold uppercase text-neutral-500">{f.label}</span>
                                    <div className="flex gap-1">
                                        <button onClick={() => setMergeTarget(f.id as any)} className="p-1 hover:bg-white/5 rounded transition-colors" title="Merge from text/file">
                                            <FileUp className="w-3 h-3 text-neutral-600 hover:text-blue-400" />
                                        </button>
                                        <button onClick={() => saveFilterList(f.id as any, f.filename)} className="p-1 hover:bg-white/5 rounded transition-colors" title="Save as Default">
                                            <Save className="w-3 h-3 text-neutral-600 hover:text-blue-400" />
                                        </button>
                                    </div>
                                </div>
                                <textarea 
                                    value={filter[f.id as keyof FilterState] as string[]}
                                    onChange={e => setFilter({...filter, [f.id]: e.target.value.split(',').map(s => s.trim())})}
                                    className="w-full h-24 bg-neutral-950 border border-white/5 rounded-xl p-3 text-[10px] font-mono focus:outline-none focus:border-blue-500/50 resize-none scrollbar-thin"
                                    placeholder="tag1, tag2..."
                                />
                            </div>
                        ))}
                    </div>
                )}
              </div>

              {/* Results Display */}
              {results.length > 0 && (
                <div className="pt-6 border-t border-white/5 space-y-4 animate-in slide-in-from-bottom-4 duration-300 pb-10">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-neutral-500">Workshop Results ({results.length})</span>
                    <div className="flex gap-2">
                        <button onClick={copyToClipboard} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase text-neutral-400 hover:text-white transition-all">
                            <Copy className="w-3.5 h-3.5" /> Copy
                        </button>
                        <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/20 rounded-lg text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 transition-all">
                            <Download className="w-3.5 h-3.5" /> Export .txt
                        </button>
                    </div>
                  </div>
                  <div className="bg-neutral-950 border border-white/5 rounded-2xl p-4 max-h-[400px] overflow-y-auto space-y-2 scrollbar-thin shadow-inner">
                    {results.map((res, i) => (
                      <div key={i} className="group flex gap-3 p-3 bg-neutral-900/50 rounded-xl border border-white/5 hover:border-blue-500/30 transition-all shadow-sm">
                        <div className="w-5 h-5 rounded-md bg-neutral-800 flex items-center justify-center text-[9px] font-black text-neutral-600 shrink-0">{i+1}</div>
                        <code className="text-[11px] text-neutral-300 break-all select-all leading-relaxed">{res}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showRefiner && (
        <TagRefiner 
            tagCounts={tagCounts} 
            initialExcluded={filter.exact_match} 
            onClose={() => setShowRefiner(false)}
            onApply={async (excluded) => {
                const newFilter = {...filter, exact_match: excluded};
                setFilter(newFilter);
                setShowRefiner(false);
                
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

      {mergeTarget && (
        <MergeFilterModal 
            onMerge={handleMerge}
            onClose={() => setMergeTarget(null)}
        />
      )}
    </div>
  );
};
