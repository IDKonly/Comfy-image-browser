import { useState, useMemo, useEffect } from 'react';
import { 
  Plus, Trash2, Play, ChevronRight, ChevronLeft, 
  Database, Search, CheckCircle, XCircle, X, Settings2, 
  Download, Upload, ArrowUp, ArrowDown, RefreshCw, Save, Sparkles, MousePointer2,
  ListFilter, Terminal, ArrowRight, Box, Filter
} from 'lucide-react';
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { useToast } from "./Toast";
import { useAppStore } from "../store/useAppStore";
import { api } from "../api";
import { Subset, WordGroup, TagClassifierProps } from "./tagclassifier/types";
import { TagInput } from "./tagclassifier/TagInput";
import { getMergedTag, parseLine } from "./tagclassifier/classify";
import {
  isTauri, classifierStore, dialogOpen, dialogSave, dialogConfirm,
  fsExists, fsMkdir, fsReadDir, fsReadTextFile, fsWriteTextFile, fsRemove, tauriInvokeMock,
} from "./tagclassifier/browserFallback";

export const TagClassifier = ({ onClose, initialData = "" }: TagClassifierProps) => {
  const [activeMobileSection, setActiveMobileSection] = useState('editor' as 'rules' | 'editor' | 'output');
  const [lines, setLines] = useState(initialData.split('\n').filter(l => l.trim()) as string[]);
  const [viewMode, setViewMode] = useState('single' as 'single' | 'bulk' | 'library');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [subsets, setSubsets] = useState([] as Subset[]);
  const [wordGroups, setWordGroups] = useState([] as WordGroup[]);
  const [fullResults, setFullResults] = useState([] as any[]);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [expandedLines, setExpandedLines] = useState(new Set() as any);
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [dictActiveSubsetId, setDictActiveSubsetId] = useState(null as number | null);
  const [dictActionMode, setDictActionMode] = useState('include' as 'include' | 'exclude');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [presets, setPresets] = useState([] as string[]);
  const [activePreset, setActivePreset] = useState("default" as string);
  
  // UI States
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [collapsedSubsets, setCollapsedSubsets] = useState(new Set() as any);

  const { showToast } = useToast();
  const folderPath = useAppStore(state => state.folderPath);
  const recursive = useAppStore(state => state.recursive);
  const rawImages = useAppStore(state => state.images);
  const workshopFilter = useAppStore(state => state.workshopFilter);

  // --- Preset & File I/O Logic ---
  const getPresetSubDir = () => "classifier_presets";

  const refreshPresets = async () => {
    try {
      const subDir = getPresetSubDir();
      if (!(await fsExists(subDir, { baseDir: BaseDirectory.AppData }))) {
        await fsMkdir(subDir, { baseDir: BaseDirectory.AppData, recursive: true });
      }
      const entries = await fsReadDir(subDir, { baseDir: BaseDirectory.AppData });
      const list = entries
        .filter(e => e.name.endsWith(".json"))
        .map(e => e.name.replace(".json", ""));
      setPresets(list);
    } catch (e: any) { 
      console.error("[PresetList] Error:", e); 
    }
  };

  const savePreset = async (name: string) => {
    if (!name || name === 'default') return;
    const fileName = `${getPresetSubDir()}/${name}.json`;
    try {
      const data = { subsets, wordGroups };
      await fsWriteTextFile(fileName, JSON.stringify(data, null, 2), { baseDir: BaseDirectory.AppData });
      showToast(`Preset '${name}' saved`, "success");
      await refreshPresets();
      setActivePreset(name);
      await classifierStore.set("last_preset", name);
      await classifierStore.save();
    } catch (e: any) { 
      showToast(`Save failed: ${e.message || e}`, "error"); 
    }
  };

  const loadPreset = async (name: string) => {
    const fileName = `${getPresetSubDir()}/${name}.json`;
    try {
      if (name !== 'default' && !(await fsExists(fileName, { baseDir: BaseDirectory.AppData }))) return;
      if (name !== 'default') {
        const content = await fsReadTextFile(fileName, { baseDir: BaseDirectory.AppData });
        const config = JSON.parse(content);
        if (config.subsets) setSubsets(config.subsets);
        if (config.wordGroups) setWordGroups(config.wordGroups);
      } else {
        // Load clean default layout
        setSubsets([{ id: 1, name: 'Characters', keywords: [], excludeKeywords: [] }]);
        setWordGroups([]);
      }
      setActivePreset(name);
      await classifierStore.set("last_preset", name);
      await classifierStore.save();
      showToast(`Loaded preset: ${name}`, "info");
    } catch (e: any) { 
      showToast(`Load failed: ${e.message || e}`, "error"); 
    }
  };

  const deletePreset = async (name: string) => {
    if (!name || name === 'default') return;
    if (!(await dialogConfirm(`Are you sure you want to delete preset '${name}'?`))) return;
    const fileName = `${getPresetSubDir()}/${name}.json`;
    try {
      await fsRemove(fileName, { baseDir: BaseDirectory.AppData });
      showToast(`Preset '${name}' deleted`, "info");
      await refreshPresets();
      loadPreset("default");
    } catch (e: any) { 
      showToast(`Delete failed: ${e.message || e}`, "error"); 
    }
  };

  const handleImportConfig = async () => {
    try {
      const selected = await dialogOpen({ filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (!selected) return;
      const path = Array.isArray(selected) ? selected[0] : selected;
      const content = await fsReadTextFile(path);
      const config = JSON.parse(content);
      if (config.subsets) setSubsets(config.subsets);
      if (config.wordGroups) setWordGroups(config.wordGroups);
      showToast("Config imported successfully", "success");
    } catch (e: any) {
      showToast(`Import failed: ${e.message || e}`, "error");
    }
  };

  const handleExportConfig = async () => {
    try {
      const path = await dialogSave({ filters: [{ name: 'JSON', extensions: ['json'] }], defaultPath: "tag_classifier_settings.json" });
      if (!path) return;
      const data = { subsets, wordGroups };
      await fsWriteTextFile(path, JSON.stringify(data, null, 2));
      showToast("Config exported successfully", "success");
    } catch (e: any) {
      showToast(`Export failed: ${e.message || e}`, "error");
    }
  };

  // --- Initialization ---
  useEffect(() => {
    const init = async () => {
      await refreshPresets();
      const lastPreset = (await classifierStore.get("last_preset")) as string | null;
      const s = (await classifierStore.get("subsets")) as Subset[] | null;
      const w = (await classifierStore.get("wordGroups")) as WordGroup[] | null;
      if (s) setSubsets(s); else setSubsets([{ id: 1, name: 'Characters', keywords: [], excludeKeywords: [] }]);
      if (w) setWordGroups(w); else setWordGroups([]);
      if (lastPreset && lastPreset !== 'default') { 
        setActivePreset(lastPreset); 
        await loadPreset(lastPreset); 
      }
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      classifierStore.set("subsets", subsets);
      classifierStore.set("wordGroups", wordGroups);
      classifierStore.save();
    }
    if (subsets.length > 0 && dictActiveSubsetId === null) setDictActiveSubsetId(subsets[0].id);
  }, [subsets, wordGroups, isLoading]);

  const uniqueTags = useMemo(() => {
    const tags = new Set() as any;
    lines.forEach(line => line.split(',').forEach(t => {
      const c = getMergedTag(t.trim().toLowerCase(), wordGroups);
      if (c) tags.add(c);
    }));
    return Array.from(tags).sort() as string[];
  }, [lines, wordGroups]);

  // Import folder prompts
  const importDirect = async () => {
    if (isTauri && !folderPath) { 
      showToast("Select a folder in ComfyView first", "error"); 
      return; 
    }
    setIsRunning(true);
    try {
        const results: string[] = await tauriInvokeMock("get_all_prompts", { folder: folderPath, recursive });
        if (!results || results.length === 0) { 
          showToast("No prompts found in selected directory", "info"); 
        } else {
            setLines(results); 
            setCurrentIndex(0);
            showToast(`Direct Import: Loaded ${results.length} prompts`, "success");
        }
    } catch (e: any) { 
        showToast(`Import failed: ${e.message || e}`, "error"); 
    } finally { 
      setIsRunning(false); 
    }
  };

  // Import filtered prompts (from active images workshop)
  const importFiltered = async () => {
    if (isTauri && (!rawImages || rawImages.length === 0)) { 
      showToast("No active images loaded in workshop", "error"); 
      return; 
    }
    setIsRunning(true);
    try {
        const targetPaths = rawImages.map(img => img.path);
        showToast(`Processing images through workshop engine...`, "info");
        
        const results: string[] = await tauriInvokeMock("generate_wildcards", { 
            paths: targetPaths, 
            prompts: [],
            threshold: 0.95,
            filter: workshopFilter 
        });
        
        if (!results || results.length === 0) { 
            showToast("No prompts match current workshop filters", "info"); 
        } else {
            setLines(results); 
            setCurrentIndex(0);
            showToast(`Imported ${results.length} filtered prompts`, "success");
        }
    } catch (e: any) { 
        console.error("Filtered Import Error:", e);
        showToast(`Import failed: ${e.message || e}`, "error"); 
    } finally { 
      setIsRunning(false); 
    }
  };

  // Compile datasets
  const runAnalysis = async () => {
    if (lines.length === 0) return;
    setIsRunning(true);
    
    try {
      let results: any[];
      if (isTauri) {
        results = await api.classifyPromptsCommand(lines, subsets, wordGroups);
      } else {
        // Browser mockup local javascript logic
        results = lines.map((line, idx) => {
          return {
            lineIndex: idx + 1,
            data: parseLine(line, subsets, wordGroups)
          };
        });
        await new Promise(r => setTimeout(r, 650));
      }
      
      setFullResults(results);
      setHasProcessed(true);
      showToast("Compilation complete", "success");
    } catch (e: any) {
      showToast(`Analysis failed: ${e.message || e}`, "error");
    } finally {
      setIsRunning(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 font-sans text-neutral-100 select-none overflow-hidden">
      <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-6xl h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-solid-panel">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
              <Database className="w-5 h-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-widest truncate">Tag Classifier</h2>
              <p className="text-[10px] text-neutral-350 font-bold uppercase truncate">Sequential Waterfall Analysis</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-11 h-11 flex items-center justify-center hover:bg-white/5 rounded-full transition-colors shrink-0"
            aria-label="Close Workstation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Column Containers */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden scrollbar-thin">
          
          {/* Left Sidebar: Pipeline Rules */}
          <aside className={`w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col bg-solid-nested shrink-0 min-h-0 ${activeMobileSection === 'rules' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="p-4 border-b border-white/5 bg-solid-panel flex items-center justify-between shrink-0">
              <span className="text-[10px] font-black uppercase text-neutral-300 tracking-widest flex items-center gap-2"><Filter className="w-3.5 h-3.5 text-blue-400" /> Pipeline Rules</span>
              <button 
                onClick={() => setSubsets([...subsets, { id: Date.now(), name: 'New Group', keywords: [], excludeKeywords: [] }])} 
                className="w-11 h-11 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                aria-label="Add new subset group"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Presets Control Sub-bar */}
            <div className="p-3 border-b border-white/5 bg-solid-base flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-0 bg-neutral-950 px-2 py-1 rounded-xl border border-white/5 focus-within:border-blue-500/50 transition-all h-11">
                <Settings2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <select 
                  className="bg-transparent text-[10px] font-black uppercase text-neutral-250 outline-none cursor-pointer hover:text-white transition-colors w-full"
                  value={activePreset}
                  onChange={(e) => loadPreset(e.target.value)}
                  aria-label="Preset Configuration Selection"
                >
                  <option value="default" className="bg-[#0c0b17] text-neutral-200">Default Config</option>
                  {presets.map(p => <option key={p} value={p} className="bg-[#0c0b17] text-neutral-200">{p.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-0.5 ml-2 shrink-0">
                <button 
                  onClick={() => { const name = prompt("Enter preset name:"); if (name) savePreset(name); }} 
                  title="Save Preset" 
                  className="w-11 h-11 flex items-center justify-center hover:bg-blue-500/20 rounded-xl text-blue-400 transition-all"
                  aria-label="Save preset"
                >
                  <Save className="w-4 h-4" />
                </button>
                {activePreset !== 'default' && (
                  <button 
                    onClick={() => deletePreset(activePreset)} 
                    title="Delete Preset" 
                    className="w-11 h-11 flex items-center justify-center hover:bg-red-500/20 rounded-xl text-red-400 transition-all"
                    aria-label="Delete preset"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {subsets.map((sub, idx) => {
                const isCollapsed = collapsedSubsets.has(sub.id);
                const isActiveInLibrary = dictActiveSubsetId === sub.id && viewMode === 'library';
                return (
                  <div key={sub.id} className="relative group animate-in slide-in-from-left-2 duration-300">
                    <div className={`border rounded-3xl p-4 relative z-10 transition-all shadow-md ${isActiveInLibrary ? 'border-blue-500/40 bg-solid-element ring-1 ring-blue-500/25' : 'border-white/5 bg-solid-card hover:border-white/10 hover:bg-solid-active'}`}>
                      <div className="flex items-center justify-between mb-4 relative">
                        <div 
                          onClick={() => setDictActiveSubsetId(sub.id)}
                          className="flex items-center gap-3 flex-1 cursor-pointer py-1 min-h-[44px] pr-20"
                          title="Click to activate group"
                        >
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = new Set(collapsedSubsets);
                              if (next.has(sub.id)) next.delete(sub.id);
                              else next.add(sub.id);
                              setCollapsedSubsets(next);
                            }}
                            className="w-11 h-11 flex items-center justify-center hover:bg-white/5 rounded-xl text-neutral-400 transition-transform"
                            aria-label={isCollapsed ? `Collapse group ${sub.name}` : `Expand group ${sub.name}`}
                          >
                            <ChevronRight className={`w-4 h-4 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`} />
                          </button>
                          <div className="flex items-center gap-3 flex-1">
                            <div 
                              className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${dictActiveSubsetId === sub.id ? 'bg-blue-600 text-white shadow-md' : 'bg-neutral-850 text-neutral-350'}`}
                            >
                              {idx + 1}
                            </div>
                            <input 
                              className={`bg-transparent text-xs font-black uppercase focus:outline-none w-full transition-all border-b border-transparent focus:border-blue-500/40 ${dictActiveSubsetId === sub.id ? 'text-blue-400' : 'text-neutral-350 focus:text-white'}`} 
                              value={sub.name} 
                              onChange={e => setSubsets(subsets.map(s => s.id === sub.id ? {...s, name: e.target.value} : s))} 
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Group ${idx + 1} Name`} 
                            />
                            {viewMode === 'library' && dictActiveSubsetId === sub.id && <MousePointer2 className="w-3.5 h-3.5 text-blue-400 animate-pulse" />}
                          </div>
                        </div>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900/90 backdrop-blur-sm p-1 rounded-xl border border-white/5 z-20">
                          <span role="button" onClick={() => { const ns = [...subsets]; if (idx > 0) [ns[idx], ns[idx-1]] = [ns[idx-1], ns[idx]]; setSubsets(ns); }} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg cursor-pointer" title="Move Up"><ArrowUp className="w-3.5 h-3.5" /></span>
                          <span role="button" onClick={() => { const ns = [...subsets]; if (idx < subsets.length - 1) [ns[idx], ns[idx+1]] = [ns[idx+1], ns[idx]]; setSubsets(ns); }} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg cursor-pointer" title="Move Down"><ArrowDown className="w-3.5 h-3.5" /></span>
                          <span role="button" onClick={() => setSubsets(subsets.filter(s => s.id !== sub.id))} className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></span>
                        </div>
                      </div>
                      
                      {!isCollapsed && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="space-y-1.5">
                            <TagInput tags={sub.keywords} onChange={tags => setSubsets(subsets.map(s => s.id === sub.id ? {...s, keywords: tags} : s))} placeholder="Add include tag..." colorClass="indigo" suggestions={uniqueTags} />
                          </div>
                          <div className="space-y-1.5">
                            <TagInput tags={sub.excludeKeywords} onChange={tags => setSubsets(subsets.map(s => s.id === sub.id ? {...s, excludeKeywords: tags} : s))} placeholder="Add exclude tag..." colorClass="red" suggestions={uniqueTags} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="bg-solid-nested border border-dashed border-white/5 rounded-3xl p-6 text-center shrink-0">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Waterfall Stream End</span>
              </div>
            </div>

            {/* Bottom Left: Tag Variables Panel */}
            <div className="p-4 border-t border-white/5 bg-solid-nested shrink-0">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase text-neutral-305 tracking-widest flex items-center gap-2"><Box className="w-3.5 h-3.5 text-amber-500" /> Tag Variables</span>
                <button 
                  onClick={() => setWordGroups([...wordGroups, { id: Date.now(), name: 'var', words: [] }])} 
                  className="w-11 h-11 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                  aria-label="Add tag variable group"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3 max-h-56 overflow-y-auto scrollbar-thin pr-2">
                {wordGroups.map(wg => (
                  <div key={wg.id} className="p-4 bg-solid-card border border-white/5 rounded-3xl group">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-amber-500 text-xs font-black">{"{"}</span>
                      <input 
                        className="bg-transparent text-xs font-black text-amber-400 focus:outline-none w-full uppercase border-b border-transparent focus:border-blue-500/35" 
                        value={wg.name} 
                        onChange={e => setWordGroups(wordGroups.map(w => w.id === wg.id ? {...w, name: e.target.value.toLowerCase()} : w))} 
                        aria-label="Variable identifier name"
                      />
                      <span className="text-amber-500 text-xs font-black">{"}"}</span>
                      <span 
                        role="button"
                        onClick={() => setWordGroups(wordGroups.filter(w => w.id !== wg.id))} 
                        className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer md:opacity-0 md:group-hover:opacity-100"
                        title="Delete variable group"
                      >
                        <X className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <TagInput tags={wg.words} onChange={tags => setWordGroups(wordGroups.map(w => w.id === wg.id ? {...w, words: tags} : w))} placeholder="Add alias tag..." colorClass="emerald" suggestions={uniqueTags} />
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Center Canvas: Active Workstation Area */}
          <section className="flex-1 flex flex-col bg-solid-surface-elevated relative overflow-hidden min-w-0 transition-all duration-300">
            {/* Toggle Sidebar handle */}
            <button 
              onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-30 w-11 h-11 flex items-center justify-center bg-solid-panel border-l border-y border-white/5 rounded-l-xl text-neutral-400 hover:text-white transition-all shadow-2xl"
              aria-label={isRightSidebarOpen ? "Hide right sidebar" : "Show right sidebar"}
            >
              {isRightSidebarOpen ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>

            {/* Center Canvas Header / Toolbar */}
            <div className="p-3 border-b border-white/5 bg-solid-panel flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-md">
              {/* View Modes Segments */}
              <div className="flex bg-solid-nested p-1 rounded-2xl border border-white/5 shrink-0 min-h-[50px] items-center shadow-inner">
                <button onClick={() => setViewMode('single')} className={`px-3 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'single' ? 'bg-solid-element text-white shadow-md' : 'text-neutral-400 hover:text-white'}`}>Editor</button>
                <button onClick={() => setViewMode('bulk')} className={`px-3 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'bulk' ? 'bg-solid-element text-white shadow-md' : 'text-neutral-400 hover:text-white'}`}>Source</button>
                <button onClick={() => setViewMode('library')} className={`px-3 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'library' ? 'bg-solid-element text-white shadow-md' : 'text-neutral-400 hover:text-white'}`}>Library</button>
              </div>

              {/* Workflow Actions */}
              <div className="flex gap-2 shrink-0 items-center">
                <button onClick={importDirect} disabled={isRunning} title="Direct Import (Full Folder)" className="w-11 h-11 flex items-center justify-center bg-blue-600/10 hover:bg-blue-600/25 text-blue-400 rounded-2xl border border-blue-500/20 transition-all disabled:opacity-50" aria-label="Direct Folder Import"><Sparkles className="w-5 h-5" /></button>
                <button onClick={importFiltered} disabled={isRunning} title="Filtered Import (Current Workshop)" className="w-11 h-11 flex items-center justify-center bg-indigo-600/10 hover:bg-indigo-600/25 text-indigo-400 rounded-2xl border border-indigo-500/20 transition-all disabled:opacity-50" aria-label="Filtered Workshop Import"><ListFilter className="w-5 h-5" /></button>
                <button onClick={handleImportConfig} title="Import JSON config" className="w-11 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 rounded-2xl text-neutral-300 hover:text-white transition-all border border-white/5" aria-label="Import Configuration"><Upload className="w-5 h-5" /></button>
                <button 
                  onClick={runAnalysis} 
                  disabled={isRunning} 
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 min-h-[44px] flex items-center justify-center rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95 shadow-lg gap-1.5 shrink-0"
                  title="Compile dataset"
                >
                  {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                  Compile
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-hidden">
              {viewMode === 'single' && (
                <div className="flex-1 flex flex-col gap-6 overflow-hidden animate-in slide-in-from-bottom-2 duration-500">
                  {/* Editor Card Navigator */}
                  <div className="flex items-center justify-between bg-solid-panel border border-white/5 p-4 rounded-3xl shadow-md shrink-0 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-6 min-w-max">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setCurrentIndex(p => Math.max(0, p - 1))} 
                          className="w-11 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 border border-white/5 rounded-2xl transition-all shadow-inner"
                          aria-label="Previous prompt"
                        >
                          <ChevronLeft className="w-6 h-6 text-neutral-200" />
                        </button>
                        <button 
                          onClick={() => setCurrentIndex(p => Math.min(lines.length - 1, p + 1))} 
                          className="w-11 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 border border-white/5 rounded-2xl transition-all shadow-inner"
                          aria-label="Next prompt"
                        >
                          <ChevronRight className="w-6 h-6 text-neutral-200" />
                        </button>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-0.5">Focus Mode</span>
                        <span className="text-base font-mono font-black text-blue-400">#L-{String(currentIndex + 1).padStart(4, '0')} <span className="text-neutral-400 font-normal ml-2">/ {lines.length}</span></span>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4 shrink-0">
                      <button 
                        onClick={() => { const nl = [...lines]; nl.splice(currentIndex+1, 0, ""); setLines(nl); setCurrentIndex(currentIndex+1); }} 
                        className="w-11 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 hover:text-white rounded-2xl border border-white/5 text-neutral-300 transition-all"
                        title="Insert new prompt line"
                        aria-label="Insert line"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => { if (lines.length <= 1) return; setLines(lines.filter((_, i) => i !== currentIndex)); setCurrentIndex(Math.max(0, currentIndex-1)); }} 
                        className="w-11 h-11 flex items-center justify-center bg-[#2d1217] hover:bg-[#3d1820] text-red-400 rounded-2xl border border-red-500/20 transition-all"
                        title="Delete current prompt line"
                        aria-label="Delete line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Edit Textarea */}
                  <div className="flex-[3] flex flex-col gap-3 min-h-0">
                    <label className="text-xs font-extrabold uppercase text-neutral-300 tracking-wider px-3" htmlFor="prompt-textarea">Active Data Stream</label>
                    <div className="flex-1 relative group min-h-0">
                      <textarea 
                        id="prompt-textarea"
                        className="w-full h-full bg-neutral-950 border border-white/5 focus:border-blue-500/50 rounded-3xl p-6 sm:p-8 text-sm sm:text-base font-mono text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500/20 resize-none shadow-inner leading-relaxed scrollbar-thin transition-all"
                        value={lines[currentIndex] || ""}
                        onChange={e => { const nl = [...lines]; nl[currentIndex] = e.target.value; setLines(nl); }}
                        placeholder="Input dataset tag lists separated by commas..."
                      />
                      <div className="absolute right-6 bottom-6 opacity-45 group-hover:opacity-85 transition-opacity pointer-events-none">
                        <Terminal className="w-8 h-8 text-blue-500" />
                      </div>
                    </div>
                  </div>

                  {/* Live Analysis Engine */}
                  <div className="flex-[2] min-h-[180px] bg-solid-panel border border-white/5 rounded-3xl p-5 flex flex-col gap-4 shadow-inner shrink-0 overflow-hidden">
                    <div className="flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-3 text-neutral-350">
                        <RefreshCw className="w-4 h-4 text-neutral-500 animate-spin-slow" />
                        <span className="text-xs font-black uppercase tracking-wider">Flow Result</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                        <span className="text-[10px] font-black text-blue-450 uppercase tracking-widest flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-blue-400 animate-pulse" /> Live Analysis Engine</span>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-3 scrollbar-thin text-white">
                      {parseLine(lines[currentIndex] || "", subsets, wordGroups).map((sub: any) => (
                        <div key={sub.id} className="flex items-start gap-4 group">
                          <div className="w-32 shrink-0 flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase px-3 py-2 rounded-xl w-full text-center border transition-all truncate ${sub.id === 0 ? 'text-neutral-300 border-white/5 bg-solid-nested' : 'text-blue-400 border-blue-500/20 bg-blue-955/20'}`}>{sub.name}</span>
                            <ArrowRight className="w-4 h-4 text-neutral-500" />
                          </div>
                          <div className="flex-1 flex flex-wrap gap-2 pt-1.5">
                            {sub.matches.length > 0 ? sub.matches.map((m: string, i: number) => (
                              <span key={i} className="px-2.5 py-1.5 bg-neutral-955 border border-white/5 rounded-lg text-xs font-mono text-neutral-200 shadow-inner hover:border-blue-500/40 transition-all flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                {m}
                              </span>
                            )) : (
                              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider py-1.5 select-none">No Match</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Bulk Textarea Editor */}
              {viewMode === 'bulk' && (
                <div className="flex-1 flex flex-col gap-3 min-h-0 animate-in zoom-in-95 duration-500">
                  <label className="text-xs font-extrabold uppercase text-neutral-300 tracking-wider px-3" htmlFor="bulk-textarea">Global Source Editor</label>
                  <textarea 
                    id="bulk-textarea"
                    className="flex-1 w-full bg-neutral-955 border border-white/5 focus:border-blue-500/40 rounded-3xl p-6 sm:p-10 text-sm sm:text-base font-mono text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500/20 resize-none shadow-inner leading-relaxed scrollbar-thin" 
                    value={lines.join('\n')} 
                    onChange={e => setLines(e.target.value.split('\n'))} 
                    placeholder="Paste thousands of comma-separated prompt lines here..." 
                  />
                </div>
              )}

              {/* Library tag grid explorer */}
              {viewMode === 'library' && (
                <div className="flex-1 flex flex-col gap-6 overflow-hidden animate-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 bg-solid-panel p-5 rounded-3xl border border-white/5 shadow-2xl">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-300 tracking-widest block ml-2">Active Pipeline Layer</label>
                      <div className="flex flex-wrap gap-2">
                          {subsets.map(s => (
                              <button 
                                  key={s.id} 
                                  onClick={() => setDictActiveSubsetId(s.id)}
                                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border min-h-[44px] ${dictActiveSubsetId === s.id ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-black/30 border-white/10 text-neutral-200 hover:text-white'}`}
                                  aria-label={`Activate layer ${s.name}`}
                              >
                                  {s.name}
                              </button>
                          ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-350 tracking-widest block ml-2">Action Mode</label>
                      <div className="flex bg-neutral-950 rounded-xl border border-white/5 p-1 shadow-inner min-h-[44px] items-center">
                          <button onClick={() => setDictActionMode('include')} className={`flex-1 py-2.5 min-h-[38px] flex items-center justify-center rounded-lg text-[10px] font-black uppercase transition-all ${dictActionMode === 'include' ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-300 hover:text-white'}`}>Include (+)</button>
                          <button onClick={() => setDictActionMode('exclude')} className={`flex-1 py-2.5 min-h-[38px] flex items-center justify-center rounded-lg text-[10px] font-black uppercase transition-all ${dictActionMode === 'exclude' ? 'bg-red-600 text-white shadow-md' : 'text-neutral-300 hover:text-white'}`}>Exclude (-)</button>
                      </div>
                    </div>
                    <div className="space-y-2 relative">
                      <label className="text-[10px] font-black uppercase text-neutral-350 tracking-widest block ml-2" htmlFor="search-global-tags">Search Global Dataset</label>
                      <div className="relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <input 
                            id="search-global-tags"
                            className="w-full bg-neutral-950 border border-white/5 focus:border-blue-500/50 rounded-xl pl-12 pr-4 py-2.5 text-xs font-bold text-white outline-none placeholder-neutral-600 shadow-inner min-h-[44px]" 
                            value={tagSearchQuery} 
                            onChange={e => setTagSearchQuery(e.target.value)} 
                            placeholder="Filter unique tags..." 
                          />
                      </div>
                    </div>
                  </div>

                  {/* Library tag items layout */}
                  <div className="flex-1 overflow-y-auto bg-neutral-950 rounded-3xl border border-white/5 p-6 shadow-inner scrollbar-thin">
                      <div className="flex flex-wrap gap-2.5 content-start">
                      {uniqueTags.filter(t => t.toLowerCase().includes(tagSearchQuery.toLowerCase())).map(tag => {
                          const activeSub = subsets.find(s => s.id === dictActiveSubsetId);
                          const isInc = activeSub?.keywords.includes(tag); 
                          const isExc = activeSub?.excludeKeywords.includes(tag);
                          const isIncVar = !isInc && activeSub?.keywords.some(k => tag.includes(k.replace(/\{.*?\}/, ''))); 
                          const isExcVar = !isExc && activeSub?.excludeKeywords.some(k => tag.includes(k.replace(/\{.*?\}/, '')));
                          
                          let style = "bg-solid-card text-neutral-300 border-white/5 hover:bg-solid-active hover:text-white hover:border-blue-500/20";
                          let tooltip = "Toggle Tag Selection";
                          let indicator = null;

                          if (isIncVar) { 
                            style = "bg-[#162235] text-blue-405 border-blue-500/20 border-dashed hover:bg-[#1f2e45]"; 
                            indicator = <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />; 
                          }
                          if (!isInc && isExcVar) { 
                            style = "bg-[#2d1217] text-red-405 border-red-500/20 border-dashed hover:bg-[#3d1820]"; 
                            indicator = <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />; 
                          }
                          if (isExc) { 
                            style = "bg-red-600 border-red-500 text-white shadow-md font-black"; 
                            tooltip = "Explicitly Excluded"; 
                            indicator = <XCircle className="w-3.5 h-3.5 text-white" />; 
                          }
                          if (isInc) { 
                            style = "bg-blue-600 border-blue-500 text-white shadow-md font-black"; 
                            tooltip = "Explicitly Included"; 
                            indicator = <CheckCircle className="w-3.5 h-3.5 text-white" />; 
                          }
                          
                          const hasVar = /\{.*?\}/.test(tag);

                          return (
                            <button 
                              key={tag} 
                              title={hasVar ? "Click 1: Base | Click 2: Full | Click 3: Clear" : tooltip}
                              onClick={() => { 
                                if (!dictActiveSubsetId) return; 
                                const sub = subsets.find(s => s.id === dictActiveSubsetId)!; 
                                const field = dictActionMode === 'include' ? 'keywords' : 'excludeKeywords'; 
                                let current = [...sub[field]];
                                if (hasVar) {
                                  const baseTag = tag.replace(/\{.*?\}/g, '').replace(/\s+/g, ' ').trim();
                                  if (current.includes(tag)) current = current.filter(t => t !== tag);
                                  else if (current.includes(baseTag)) { current = current.filter(t => t !== baseTag); current.push(tag); }
                                    else current.push(baseTag);
                                } else {
                                  if (current.includes(tag)) current = current.filter(t => t !== tag);
                                  else current.push(tag);
                                }
                                setSubsets(subsets.map(s => s.id === sub.id ? {...s, [field]: current} : s));
                              }} 
                              className={`px-4 py-2.5 rounded-2xl text-[11px] font-mono border transition-all active:scale-95 flex items-center gap-2 min-h-[44px] ${style}`}
                              aria-label={`Toggle tag ${tag}`}
                            >
                              {indicator}
                              {tag}
                            </button>
                          );
                      })}
                  </div></div>
                </div>
              )}
            </div>
          </section>

          {/* Right Sidebar: Output Streams */}
          <aside className={`border-l border-white/5 flex flex-col bg-solid-nested shrink-0 min-h-0 transition-all duration-300 overflow-hidden ${isRightSidebarOpen ? (activeMobileSection === 'output' ? 'w-full flex' : 'w-0 border-none md:w-80 lg:w-80 md:flex hidden') : 'w-0 border-none'}`}>
            {!hasProcessed ? (
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-solid-nested">
                <Terminal className="w-12 h-12 mb-4 text-blue-505 animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-neutral-200">System Idle</h3>
                <p className="text-[10px] font-bold text-neutral-400 uppercase leading-relaxed tracking-wider">Compile dataset to<br/>explore results</p>
              </div>
            ) : (
              <>
                {/* Output Controls Box */}
                <div className="p-6 border-b border-white/5 bg-solid-panel flex flex-col gap-4 shrink-0 shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black uppercase text-blue-400 tracking-wider flex items-center gap-3"><CheckCircle className="w-4 h-4 text-blue-500" /> Output Stream</span>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase mt-1">{fullResults.length} Records Compiled</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            let linesToExport: string[] = [];
                            fullResults.forEach(res => {
                                const allTags = res.data.flatMap((s: any) => s.matches);
                                linesToExport.push(allTags.join(', '));
                            });
                            if (removeDuplicates) linesToExport = Array.from(new Set(linesToExport.filter(l => l.trim())));
                            const path = await dialogSave({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: `tags_all_merged.txt` });
                            if (path) { await fsWriteTextFile(path, linesToExport.join('\n')); showToast(`Saved All`, "success"); }
                          }} 
                          className="w-11 h-11 flex items-center justify-center bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-all shadow-md border border-blue-500/20" 
                          title="Save All Merged"
                          aria-label="Export all merged results"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                    </div>
                  </div>
                  
                  {/* Unique Records Checkbox */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-solid-card rounded-xl border border-white/5 text-neutral-300 font-extrabold uppercase text-[10px] shadow-inner select-none cursor-pointer min-h-[44px]">
                    <input 
                      type="checkbox" 
                      id="checkbox-unique-records"
                      checked={removeDuplicates} 
                      onChange={e => setRemoveDuplicates(e.target.checked)} 
                      className="w-4 h-4 rounded bg-black/40 border-white/10 text-blue-600 focus:ring-0 focus:ring-offset-0" 
                    />
                    <label className="cursor-pointer" htmlFor="checkbox-unique-records">Unique Records Only</label>
                  </div>
                </div>

                {/* Outputs Accordion list */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin bg-solid-nested">
                  <div className="grid grid-cols-2 gap-2 mb-4">
                      {subsets.map(sub => (
                          <button 
                            key={sub.id} 
                            onClick={async () => {
                              let linesToExport: string[] = [];
                              fullResults.forEach(res => {
                                  const group = res.data.find((s: any) => s.id === sub.id);
                                  linesToExport.push(group?.matches.join(', ') || "");
                              });
                              if (removeDuplicates) linesToExport = Array.from(new Set(linesToExport.filter(l => l.trim())));
                              const path = await dialogSave({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: `tags_${sub.name.toLowerCase()}.txt` });
                              if (path) { await fsWriteTextFile(path, linesToExport.join('\n')); showToast(`Saved: ${sub.name}`, "success"); }
                            }} 
                            className="px-3 py-2.5 min-h-[44px] bg-solid-card hover:bg-solid-active border border-white/5 rounded-xl text-[10px] font-black uppercase text-neutral-200 hover:text-white hover:border-blue-500/30 transition-all truncate"
                            aria-label={`Export group ${sub.name}`}
                          >
                            Save {sub.name}
                          </button>
                      ))}
                      <button 
                        onClick={async () => {
                            let linesToExport: string[] = [];
                            fullResults.forEach(res => {
                                const group = res.data.find((s: any) => s.id === 0);
                                linesToExport.push(group?.matches.join(', ') || "");
                            });
                            if (removeDuplicates) linesToExport = Array.from(new Set(linesToExport.filter(l => l.trim())));
                            const path = await dialogSave({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: `tags_unclassified.txt` });
                            if (path) { await fsWriteTextFile(path, linesToExport.join('\n')); showToast(`Saved: Unclassified`, "success"); }
                        }} 
                        className="px-3 py-2.5 min-h-[44px] bg-[#2d1217] hover:bg-[#3d1820] border border-red-500/10 rounded-xl text-[10px] font-black uppercase text-red-400 hover:text-white transition-all truncate"
                        aria-label="Export unclassified items"
                      >
                        Unclassified
                      </button>
                  </div>

                  {fullResults.map(res => (
                    <div 
                      key={res.lineIndex} 
                      className={`p-5 border rounded-2xl cursor-pointer transition-all hover:border-blue-500/30 hover:bg-solid-active ${expandedLines.has(res.lineIndex) ? 'border-blue-500/40 bg-solid-element ring-1 ring-blue-500/25' : 'border-white/5 bg-solid-card'}`} 
                      onClick={() => { const n = new Set(expandedLines); if (n.has(res.lineIndex)) n.delete(res.lineIndex); else n.add(res.lineIndex); setExpandedLines(n); }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-neutral-355 uppercase">#L-{String(res.lineIndex).padStart(4, '0')}</span>
                        <ChevronRight className={`w-4 h-4 text-neutral-400 transition-transform ${expandedLines.has(res.lineIndex) ? 'rotate-90 text-blue-500' : ''}`} />
                      </div>
                      <div className="space-y-3">
                        {res.data.filter((s: any) => s.matches.length > 0).map((s: any) => (
                          <div key={s.id} className="space-y-1.5">
                            <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg ${s.id === 0 ? 'text-neutral-200 bg-solid-nested border border-white/5' : 'text-blue-400 bg-blue-955/20 border border-blue-500/20'}`}>{s.name}</span>
                            {expandedLines.has(res.lineIndex) && (
                              <p className="text-[11px] font-mono text-neutral-200 break-all pl-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-300">
                                {s.matches.join(', ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      {expandedLines.has(res.lineIndex) && (
                          <div className="mt-4 pt-4 border-t border-white/5 space-y-1">
                              <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">Original Source</span>
                              <p className="text-[10.5px] font-mono text-neutral-300 break-all leading-relaxed pl-2 bg-neutral-950 p-2 rounded-lg border border-white/5">{lines[res.lineIndex-1]}</p>
                          </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>

        {/* Responsive Mobile Bottom Navigation Bar */}
        <div className="lg:hidden h-16 border-t border-white/5 bg-solid-panel flex items-center justify-around px-4 shrink-0 text-white z-20 shadow-2xl">
          <button 
            onClick={() => setActiveMobileSection('rules')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 min-h-[44px] text-[10px] font-extrabold uppercase transition-all ${activeMobileSection === 'rules' ? 'text-blue-405 font-black' : 'text-neutral-400 hover:text-neutral-250'}`}
            aria-label="Mobile Navigation Rules"
          >
            <Filter className="w-4 h-4" />
            <span>Rules</span>
          </button>
          <button 
            onClick={() => setActiveMobileSection('editor')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 min-h-[44px] text-[10px] font-extrabold uppercase transition-all ${activeMobileSection === 'editor' ? 'text-blue-405 font-black' : 'text-neutral-400 hover:text-neutral-250'}`}
            aria-label="Mobile Navigation Workstation"
          >
            <Database className="w-4 h-4" />
            <span>Workstation</span>
          </button>
          <button 
            onClick={() => setActiveMobileSection('output')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 min-h-[44px] text-[10px] font-extrabold uppercase transition-all ${activeMobileSection === 'output' ? 'text-blue-405 font-black' : 'text-neutral-400 hover:text-neutral-250'}`}
            aria-label="Mobile Navigation Output"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Output</span>
          </button>
        </div>

        {/* Cyberdeck System Footer */}
        <footer className="h-auto md:h-14 py-3 md:py-0 border-t border-white/5 bg-solid-panel px-4 md:px-8 flex flex-col md:flex-row items-center justify-between shrink-0 text-white gap-3 md:gap-0 z-25 relative">
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-black text-neutral-450 tracking-widest uppercase">Preset Active: <span className="text-blue-400">{activePreset}</span></span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-pulse" />
              <span className="text-[10px] font-black text-neutral-450 uppercase tracking-widest">Live Sync Active</span>
            </div>
          </div>
          <div className="flex items-center">
            <button 
              onClick={handleExportConfig} 
              className="flex items-center gap-2 px-4 py-3 min-h-[44px] bg-neutral-800 hover:bg-neutral-700 rounded-xl text-[10px] font-extrabold text-neutral-300 hover:text-white uppercase transition-all shrink-0 border border-white/5"
            >
              <Save className="w-3.5 h-3.5" /> Backup Config
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
