import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, Play, ChevronRight, ChevronLeft, Tag, FileText, 
  Layers, Database, Search, CheckCircle, XCircle, X, Settings2, 
  Download, Upload, ArrowUp, ArrowDown, Info, Copy, Check, ArrowRight,
  Terminal, Filter, Box, RefreshCw, Save, ExternalLink, Sparkles, MousePointer2,
  ListFilter
} from 'lucide-react';
import { invoke } from "@tauri-apps/api/core";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import { LazyStore } from "@tauri-apps/plugin-store";
import { 
  mkdir, exists, readDir, remove, 
  readTextFile, writeTextFile, BaseDirectory 
} from "@tauri-apps/plugin-fs";
import { useToast } from "./Toast";
import { useAppStore } from "../store/useAppStore";

const classifierStore = new LazyStore(".tag_classifier.json");

interface Subset {
  id: number;
  name: string;
  keywords: string[];
  excludeKeywords: string[];
}

interface WordGroup {
  id: number;
  name: string;
  words: string[];
}

interface TagClassifierProps {
  onClose: () => void;
  initialData?: string;
}

const TagInput = ({ tags, onChange, placeholder, colorClass = "indigo", suggestions = [] }: { 
    tags: string[], 
    onChange: (tags: string[]) => void, 
    placeholder: string,
    colorClass?: "indigo" | "red" | "emerald",
    suggestions?: string[]
}) => {
    const [inputValue, setInputValue] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    
    const filteredSuggestions = useMemo(() => {
        if (!inputValue.trim()) return [];
        return suggestions
            .filter(s => s.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(s))
            .slice(0, 10);
    }, [inputValue, suggestions, tags]);

    const addTags = (raw: string) => {
        const newTags = raw.split(/[\n,]+/).map(t => t.trim()).filter(t => t && !tags.includes(t));
        if (newTags.length > 0) onChange([...tags, ...newTags]);
        setInputValue("");
        setShowSuggestions(false);
    };

    const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

    const colorMap = {
        indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:border-indigo-500/40",
        red: "bg-red-500/10 text-red-400 border-red-500/20 hover:border-red-500/40",
        emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40"
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[1.5rem]">
                {tags.map(tag => (
                    <span key={tag} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-black uppercase transition-all ${colorMap[colorClass]}`}>
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                ))}
            </div>
            <div className="relative">
                <input 
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-2.5 text-xs font-mono text-neutral-300 focus:outline-none focus:border-white/20 shadow-inner"
                    value={inputValue}
                    onChange={e => { setInputValue(e.target.value); setShowSuggestions(true); }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            if (inputValue.trim()) addTags(inputValue);
                        }
                    }}
                    onPaste={e => {
                        const paste = e.clipboardData.getData('text');
                        if (paste.includes(',') || paste.includes('\n')) {
                            e.preventDefault();
                            addTags(paste);
                        }
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder={placeholder}
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-[110] left-0 right-0 mt-2 bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {filteredSuggestions.map(s => (
                            <button key={s} onMouseDown={(e) => { e.preventDefault(); addTags(s); }} className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase text-neutral-400 hover:text-white hover:bg-white/5 transition-all border-b border-white/5 last:border-0">{s}</button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export const TagClassifier = ({ onClose, initialData = "" }: TagClassifierProps) => {
  const [lines, setLines] = useState<string[]>(initialData.split('\n').filter(l => l.trim()));
  const [viewMode, setViewMode] = useState<'single' | 'bulk' | 'library'>('single');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [subsets, setSubsets] = useState<Subset[]>([]);
  const [wordGroups, setWordGroups] = useState<WordGroup[]>([]);
  const [fullResults, setFullResults] = useState<any[]>([]);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [dictActiveSubsetId, setDictActiveSubsetId] = useState<number | null>(null);
  const [dictActionMode, setDictActionMode] = useState<'include' | 'exclude'>('include');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [presets, setPresets] = useState<string[]>([]);
  const [activePreset, setActivePreset] = useState<string>("default");
  const workerRef = useRef<Worker | null>(null);

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
      if (!(await exists(subDir, { baseDir: BaseDirectory.AppData }))) {
        await mkdir(subDir, { baseDir: BaseDirectory.AppData, recursive: true });
      }
      const entries = await readDir(subDir, { baseDir: BaseDirectory.AppData });
      const list = entries
        .filter(e => e.name.endsWith(".json"))
        .map(e => e.name.replace(".json", ""));
      setPresets(list);
    } catch (e: any) { console.error("[PresetList] Error:", e); }
  };

  const savePreset = async (name: string) => {
    if (!name || name === 'default') return;
    const fileName = `${getPresetSubDir()}/${name}.json`;
    try {
      const data = { subsets, wordGroups };
      await writeTextFile(fileName, JSON.stringify(data, null, 2), { baseDir: BaseDirectory.AppData });
      showToast(`Preset '${name}' saved`, "success");
      await refreshPresets();
      setActivePreset(name);
      await classifierStore.set("last_preset", name);
      await classifierStore.save();
    } catch (e: any) { showToast(`Save failed: ${e.message || e}`, "error"); }
  };

  const loadPreset = async (name: string) => {
    const fileName = `${getPresetSubDir()}/${name}.json`;
    try {
      if (name !== 'default' && !(await exists(fileName, { baseDir: BaseDirectory.AppData }))) return;
      if (name !== 'default') {
        const content = await readTextFile(fileName, { baseDir: BaseDirectory.AppData });
        const config = JSON.parse(content);
        if (config.subsets) setSubsets(config.subsets);
        if (config.wordGroups) setWordGroups(config.wordGroups);
      }
      setActivePreset(name);
      await classifierStore.set("last_preset", name);
      await classifierStore.save();
      showToast(`Loaded preset: ${name}`, "info");
    } catch (e: any) { showToast(`Load failed: ${e.message || e}`, "error"); }
  };

  const deletePreset = async (name: string) => {
    if (name === 'default') return;
    if (!(await confirm(`Delete preset '${name}'?`))) return;
    try {
      await remove(`${getPresetSubDir()}/${name}.json`, { baseDir: BaseDirectory.AppData });
      showToast("Preset deleted", "info");
      await refreshPresets();
      if (activePreset === name) setActivePreset("default");
    } catch (e: any) { showToast("Delete failed", "error"); }
  };

  const handleImportConfig = async () => {
    try {
      const path = await open({ filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (path && typeof path === 'string') {
        const config = JSON.parse(await readTextFile(path));
        if (config.subsets) setSubsets(config.subsets);
        if (config.wordGroups) setWordGroups(config.wordGroups);
        showToast("Config imported", "success");
      }
    } catch (e: any) { showToast("Invalid JSON", "error"); }
  };

  const handleExportConfig = async () => {
    try {
      const path = await save({ filters: [{ name: 'JSON', extensions: ['json'] }], defaultPath: `${activePreset}_backup.json` });
      if (path) {
        await writeTextFile(path, JSON.stringify({ subsets, wordGroups }, null, 2));
        showToast("Config backed up", "success");
      }
    } catch (e: any) { showToast("Export failed", "error"); }
  };

  // --- Logic Helpers ---
  const getMergedTag = (tag: string, groups: WordGroup[]) => {
    let merged = tag;
    groups.forEach(wg => {
      if (!wg.name || !wg.words.length) return;
      const sortedWords = [...wg.words].sort((a, b) => b.length - a.length);
      sortedWords.forEach(word => {
        const regex = new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?=\\s|$)`, 'gi');
        merged = merged.replace(regex, `$1{${wg.name}}`);
      });
    });
    return merged;
  };

  const parseLine = (lineStr: string) => {
    if (!lineStr.trim()) return [];
    let remainingTags = lineStr.split(',').map(t => t.trim()).filter(t => t);
    const parsedSubsets = subsets.map(sub => {
      const matched: string[] = [];
      const nextRemaining: string[] = [];
      remainingTags.forEach(tag => {
        const lower = tag.toLowerCase();
        const merged = getMergedTag(lower, wordGroups).toLowerCase();
        const isInc = sub.keywords.some(k => lower.includes(k.toLowerCase()) || merged.includes(k.toLowerCase()));
        const isExactInc = sub.keywords.some(k => lower === k.toLowerCase() || merged === k.toLowerCase());
        const isExc = !isExactInc && sub.excludeKeywords.some(k => lower.includes(k.toLowerCase()) || merged.includes(k.toLowerCase()));
        if (isInc && !isExc) matched.push(tag); else nextRemaining.push(tag);
      });
      remainingTags = nextRemaining;
      return { id: sub.id, name: sub.name, matches: matched };
    });
    parsedSubsets.push({ id: 0, name: 'Unclassified', matches: remainingTags });
    return parsedSubsets;
  };

  // --- Web Worker ---
  const createWorker = () => {
    const workerCode = `
      self.onmessage = function(e) {
        const { lines, subsets, wordGroups } = e.data;
        function getMergedTag(tag, groups) {
          let merged = tag;
          groups.forEach(wg => {
            if (!wg.name || !wg.words.length) return;
            const sortedWords = [...wg.words].sort((a, b) => b.length - a.length);
            sortedWords.forEach(word => {
              const regex = new RegExp("(^|\\\\s)" + word.replace(/[.*+?^$\${}()|[\\]\\\\\\/]/g, '\\\\$&') + "(?=\\\\s|$)", 'gi');
              merged = merged.replace(regex, "$1{" + wg.name + "}");
            });
          });
          return merged;
        }
        const results = [];
        const total = lines.length;
        for (let i = 0; i < total; i++) {
          const lineStr = lines[i];
          let remainingTags = lineStr.split(',').map(t => t.trim()).filter(t => t);
          const parsedData = subsets.map(sub => {
            const matched = [];
            const nextRemaining = [];
            remainingTags.forEach(tag => {
              const lower = tag.toLowerCase();
              const merged = getMergedTag(lower, wordGroups).toLowerCase();
              const isInc = sub.keywords.some(k => lower.includes(k.toLowerCase()) || merged.includes(k.toLowerCase()));
              const isExactInc = sub.keywords.some(k => lower === k.toLowerCase() || merged === k.toLowerCase());
              const isExc = !isExactInc && sub.excludeKeywords.some(k => lower.includes(k.toLowerCase()) || merged.includes(k.toLowerCase()));
              if (isInc && !isExc) matched.push(tag); else nextRemaining.push(tag);
            });
            remainingTags = nextRemaining;
            return { id: sub.id, name: sub.name, matches: matched };
          });
          parsedData.push({ id: 0, name: 'Unclassified', matches: remainingTags });
          results.push({ lineIndex: i + 1, data: parsedData });
          if (i % 100 === 0 || i === total - 1) self.postMessage({ type: 'progress', value: Math.round((i / total) * 100) });
        }
        self.postMessage({ type: 'result', value: results });
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  };

  // --- Initialization ---
  useEffect(() => {
    const init = async () => {
      await refreshPresets();
      const lastPreset = await classifierStore.get<string>("last_preset");
      const s = await classifierStore.get<Subset[]>("subsets");
      const w = await classifierStore.get<WordGroup[]>("wordGroups");
      if (s) setSubsets(s); else setSubsets([{ id: 1, name: 'Characters', keywords: [], excludeKeywords: [] }]);
      if (w) setWordGroups(w); else setWordGroups([]);
      if (lastPreset && lastPreset !== 'default') { setActivePreset(lastPreset); await loadPreset(lastPreset); }
      setIsLoading(false);
    };
    init();
    return () => { if (workerRef.current) workerRef.current.terminate(); };
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
    const tags = new Set<string>();
    lines.forEach(line => line.split(',').forEach(t => {
      const c = getMergedTag(t.trim().toLowerCase(), wordGroups);
      if (c) tags.add(c);
    }));
    return Array.from(tags).sort();
  }, [lines, wordGroups]);

  // 파이프라인 1: 직접 임포트 (폴더 전체)
  const importDirect = async () => {
    if (!folderPath) { showToast("Select a folder first", "error"); return; }
    setIsRunning(true); setProgress(0);
    try {
        const results: string[] = await invoke("get_all_prompts", { folder: folderPath, recursive });
        if (!results || results.length === 0) { showToast("No prompts found in folder", "info"); }
        else {
            setLines(results); setCurrentIndex(0);
            showToast(`Direct Import: ${results.length} prompts`, "success");
        }
    } catch (e: any) { 
        showToast(`Import failed: ${e.message || e}`, "error"); 
    } finally { setIsRunning(false); setProgress(0); }
  };

  // 파이프라인 2: 필터링 임포트 (와일드카드 워크숍 엔진 활용)
  const importFiltered = async () => {
    if (!rawImages || rawImages.length === 0) { showToast("No images to filter", "error"); return; }
    setIsRunning(true); setProgress(0);
    try {
        const targetPaths = rawImages.map(img => img.path);
        
        showToast(`Processing ${targetPaths.length} images through Workshop engine...`, "info");
        
        // 와일드카드 워크숍의 설정을 그대로 적용하여 필터링된 프롬프트 묶음을 가져옴
        const results: string[] = await invoke("generate_wildcards", { 
            paths: targetPaths, 
            prompts: [], // 텍스트 입력은 제외하고 이미지만 처리
            threshold: 0.95, // 분류기에 넣을 때는 가급적 원본 유지를 위해 높은 유사도 권장 (또는 사용자 설정 유지)
            filter: workshopFilter 
        });
        
        if (!results || results.length === 0) { 
            showToast("No prompts passed the current workshop filters", "info"); 
        } else {
            setLines(results); 
            setCurrentIndex(0);
            showToast(`Imported ${results.length} filtered prompts`, "success");
        }
    } catch (e: any) { 
        console.error("Filtered Import Error:", e);
        showToast(`Import failed: ${e.message || e}`, "error"); 
    } finally { setIsRunning(false); setProgress(0); }
  };

  const runAnalysis = () => {
    if (lines.length === 0) return;
    setIsRunning(true); setProgress(0);
    if (workerRef.current) workerRef.current.terminate();
    workerRef.current = createWorker();
    workerRef.current.onmessage = (e) => {
      const { type, value } = e.data;
      if (type === 'progress') setProgress(value);
      else if (type === 'result') {
        setFullResults(value); setHasProcessed(true); setIsRunning(false); setProgress(100);
        showToast("Compilation complete", "success");
      }
    };
    workerRef.current.postMessage({ lines, subsets, wordGroups });
  };

  if (isLoading) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col animate-in fade-in duration-300 font-sans">
      <header className="h-20 border-b border-white/5 bg-neutral-900/50 flex items-center justify-between px-8 shrink-0 text-white overflow-hidden">
        <div className="flex items-center gap-5 shrink-0">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Database className="w-6 h-6" />
          </div>
          <div className="hidden lg:block">
            <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-3">
              Dataset Workstation
              <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[9px] rounded-full border border-indigo-500/20">PRO</span>
            </h2>
            <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-tight">Sequential Waterfall Analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar py-2">
          <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-2xl border border-white/5 shadow-inner min-w-max">
            <Settings2 className="w-4 h-4 text-neutral-500" />
            <select 
              className="bg-transparent text-xs font-black uppercase text-neutral-300 outline-none cursor-pointer hover:text-white transition-colors"
              value={activePreset}
              onChange={(e) => loadPreset(e.target.value)}
            >
              <option value="default" className="bg-neutral-900">Default Config</option>
              {presets.map(p => <option key={p} value={p} className="bg-neutral-900">{p.toUpperCase()}</option>)}
            </select>
            <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-2">
                <button onClick={() => { const name = prompt("Enter preset name:"); if (name) savePreset(name); }} title="Save current as preset" className="p-1.5 hover:bg-indigo-500/20 rounded-lg text-indigo-400"><Save className="w-4 h-4" /></button>
                {activePreset !== 'default' && (
                    <button onClick={() => deletePreset(activePreset)} title="Delete preset" className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-500"><Trash2 className="w-4 h-4" /></button>
                )}
            </div>
          </div>

          <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 shrink-0">
            <button onClick={() => setViewMode('single')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${viewMode === 'single' ? 'bg-white/10 text-white shadow-xl' : 'text-neutral-500 hover:text-neutral-300'}`}>Editor</button>
            <button onClick={() => setViewMode('bulk')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${viewMode === 'bulk' ? 'bg-white/10 text-white shadow-xl' : 'text-neutral-500 hover:text-neutral-300'}`}>Source</button>
            <button onClick={() => setViewMode('library')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${viewMode === 'library' ? 'bg-white/10 text-white shadow-xl' : 'text-neutral-500 hover:text-neutral-300'}`}>Library</button>
          </div>

          <div className="flex gap-2 shrink-0">
            <button onClick={importDirect} disabled={isRunning} title="Direct Import (Full Folder)" className="p-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-2xl border border-emerald-500/20 transition-all shadow-lg shadow-emerald-600/10 disabled:opacity-50"><Sparkles className="w-5 h-5" /></button>
            <button onClick={importFiltered} disabled={isRunning} title="Filtered Import (Current Workshop)" className="p-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-2xl border border-blue-500/20 transition-all shadow-lg shadow-blue-600/10 disabled:opacity-50"><ListFilter className="w-5 h-5" /></button>
            
            <button onClick={handleImportConfig} title="Import JSON" className="p-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-2xl text-neutral-400 hover:text-white transition-all border border-white/5"><Upload className="w-5 h-5" /></button>
            <button onClick={runAnalysis} disabled={isRunning} className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-8 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl active:scale-95">
              {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Compile
            </button>
          </div>
          
          <div className="w-px h-10 bg-white/10 mx-2 shrink-0" />
          <button onClick={onClose} className="p-2.5 hover:bg-white/5 rounded-full transition-all group shrink-0"><X className="w-8 h-8 text-neutral-500 group-hover:text-white" /></button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden flex-col md:flex-row">
        <aside className="w-full md:w-[22rem] lg:w-[28rem] border-r border-white/5 flex flex-col bg-neutral-900/20 shrink-0 min-h-0">
          <div className="p-6 border-b border-white/5 bg-black/20 flex items-center justify-between shrink-0">
            <span className="text-xs font-black uppercase text-neutral-500 tracking-widest flex items-center gap-3"><Filter className="w-4 h-4" /> Pipeline Rules</span>
            <button onClick={() => setSubsets([...subsets, { id: Date.now(), name: 'New Group', keywords: [], excludeKeywords: [] }])} className="p-2 hover:bg-white/5 rounded-xl text-indigo-400"><Plus className="w-5 h-5" /></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            {subsets.map((sub, idx) => (
              <div key={sub.id} className="relative group animate-in slide-in-from-left-2 duration-300">
                {idx < subsets.length && <div className="absolute left-5 -bottom-6 w-0.5 h-6 bg-indigo-500/20 z-0 hidden md:block" />}
                <div className={`bg-neutral-800/40 border rounded-3xl p-5 relative z-10 transition-all shadow-xl ${dictActiveSubsetId === sub.id && viewMode === 'library' ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/20' : 'border-white/5 hover:border-indigo-500/30'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={() => setDictActiveSubsetId(sub.id)} className="flex items-center gap-3 flex-1 text-left group/name">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${dictActiveSubsetId === sub.id ? 'bg-indigo-600 text-white' : 'bg-indigo-600/20 text-indigo-400'}`}>{idx + 1}</div>
                      <input className={`bg-transparent text-xs font-black uppercase focus:outline-none w-40 transition-all ${dictActiveSubsetId === sub.id ? 'text-indigo-400' : 'text-neutral-300 focus:text-white'}`} value={sub.name} onChange={e => setSubsets(subsets.map(s => s.id === sub.id ? {...s, name: e.target.value} : s))} />
                      {viewMode === 'library' && dictActiveSubsetId === sub.id && <MousePointer2 className="w-3 h-3 text-indigo-500 animate-pulse" />}
                    </button>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { const ns = [...subsets]; if (idx > 0) [ns[idx], ns[idx-1]] = [ns[idx-1], ns[idx]]; setSubsets(ns); }} className="p-1 text-neutral-500 hover:text-white"><ArrowUp className="w-4 h-4" /></button>
                      <button onClick={() => { const ns = [...subsets]; if (idx < subsets.length - 1) [ns[idx], ns[idx+1]] = [ns[idx+1], ns[idx]]; setSubsets(ns); }} className="p-1 text-neutral-500 hover:text-white"><ArrowDown className="w-4 h-4" /></button>
                      <button onClick={() => setSubsets(subsets.filter(s => s.id !== sub.id))} className="p-1 text-neutral-500 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black text-indigo-500/60 uppercase tracking-widest px-1">Includes (+)</span>
                      <TagInput tags={sub.keywords} onChange={tags => setSubsets(subsets.map(s => s.id === sub.id ? {...s, keywords: tags} : s))} placeholder="Add include tag..." colorClass="indigo" suggestions={uniqueTags} />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black text-red-500/60 uppercase tracking-widest px-1">Excludes (-)</span>
                      <TagInput tags={sub.excludeKeywords} onChange={tags => setSubsets(subsets.map(s => s.id === sub.id ? {...s, excludeKeywords: tags} : s))} placeholder="Add exclude tag..." colorClass="red" suggestions={uniqueTags} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-neutral-900/40 border border-dashed border-white/10 rounded-3xl p-6 text-center shrink-0"><span className="text-xs font-black text-neutral-600 uppercase tracking-widest opacity-50">Waterfall End</span></div>
          </div>

          <div className="p-6 border-t border-white/5 bg-black/20 shrink-0">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black uppercase text-emerald-500/70 tracking-widest flex items-center gap-3"><Box className="w-4 h-4" /> Tag Variables</span>
              <button onClick={() => setWordGroups([...wordGroups, { id: Date.now(), name: 'var', words: [] }])} className="p-1 hover:bg-emerald-500/10 rounded-lg text-emerald-500"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3 max-h-56 overflow-y-auto scrollbar-thin pr-2">
              {wordGroups.map(wg => (
                <div key={wg.id} className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl group">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-emerald-500/50 text-xs font-bold">{"{"}</span>
                    <input className="bg-transparent text-xs font-black text-emerald-400 focus:outline-none w-full uppercase" value={wg.name} onChange={e => setWordGroups(wordGroups.map(w => w.id === wg.id ? {...w, name: e.target.value.toLowerCase()} : w))} />
                    <span className="text-emerald-500/50 text-xs font-bold">{"}"}</span>
                    <button onClick={() => setWordGroups(wordGroups.filter(w => w.id !== wg.id))} className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-600 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </div>
                  <TagInput tags={wg.words} onChange={tags => setWordGroups(wordGroups.map(w => w.id === wg.id ? {...w, words: tags} : w))} placeholder="Add word..." colorClass="emerald" suggestions={uniqueTags} />
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col bg-black/40 relative overflow-hidden min-w-0">
          <div className="flex-1 p-6 lg:p-10 flex flex-col gap-8 overflow-hidden">
            {viewMode === 'single' && (
              <div className="flex-1 flex flex-col gap-8 overflow-hidden animate-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center justify-between bg-neutral-900 border border-white/10 p-4 sm:p-5 rounded-[2.5rem] shadow-2xl shrink-0 overflow-x-auto no-scrollbar">
                  <div className="flex items-center gap-6 min-w-max">
                    <div className="flex gap-2">
                      <button onClick={() => setCurrentIndex(p => Math.max(0, p - 1))} className="p-3 bg-black/40 hover:bg-white/5 border border-white/5 rounded-2xl transition-all shadow-inner"><ChevronLeft className="w-6 h-6 text-neutral-400" /></button>
                      <button onClick={() => setCurrentIndex(p => Math.min(lines.length - 1, p + 1))} className="p-3 bg-black/40 hover:bg-white/5 border border-white/5 rounded-2xl transition-all shadow-inner"><ChevronRight className="w-6 h-6 text-neutral-400" /></button>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest block mb-1">Focus Mode</span>
                      <span className="text-base font-mono font-black text-blue-400">#L-{String(currentIndex + 1).padStart(4, '0')} <span className="text-neutral-600 font-normal ml-2">/ {lines.length}</span></span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    <button onClick={() => { const nl = [...lines]; nl.splice(currentIndex+1, 0, ""); setLines(nl); setCurrentIndex(currentIndex+1); }} className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-black uppercase rounded-xl border border-white/5 transition-all">Insert</button>
                    <button onClick={() => { if (lines.length <= 1) return; setLines(lines.filter((_, i) => i !== currentIndex)); setCurrentIndex(Math.max(0, currentIndex-1)); }} className="px-5 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-500 text-xs font-black uppercase rounded-xl border border-red-500/20 transition-all">Delete</button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-4 min-h-0">
                  <label className="text-xs font-black uppercase text-neutral-600 tracking-widest px-3">Active Data Stream</label>
                  <div className="flex-1 relative group">
                    <textarea 
                      className="w-full h-full bg-neutral-900/80 border border-white/10 rounded-[3rem] p-10 text-xl font-mono text-neutral-200 focus:outline-none focus:border-indigo-500/50 resize-none shadow-[inner_0_4px_32px_rgba(0,0,0,0.6)] leading-relaxed scrollbar-thin transition-all"
                      value={lines[currentIndex] || ""}
                      onChange={e => { const nl = [...lines]; nl[currentIndex] = e.target.value; setLines(nl); }}
                      placeholder="Input tags..."
                    />
                    <div className="absolute right-8 bottom-8 opacity-0 group-hover:opacity-100 transition-opacity"><Terminal className="w-8 h-8 text-neutral-700" /></div>
                  </div>
                </div>

                <div className="h-72 bg-indigo-600/5 border border-indigo-500/20 rounded-[2.5rem] p-8 flex flex-col gap-6 shadow-2xl shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-indigo-400">
                      <RefreshCw className="w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-widest">Flow Result</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                      <span className="text-[10px] font-black text-neutral-500 uppercase">Live Engine</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-4 pr-4 scrollbar-thin text-white">
                    {parseLine(lines[currentIndex] || "").map((sub) => (
                      <div key={sub.id} className="flex items-start gap-6 group">
                        <div className="w-32 shrink-0 flex items-center gap-3">
                          <span className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-xl w-full text-center border transition-all ${sub.id === 0 ? 'text-neutral-500 border-white/5 bg-black/40' : 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10'}`}>{sub.name}</span>
                          <ArrowRight className="w-4 h-4 text-neutral-700" />
                        </div>
                        <div className="flex-1 flex flex-wrap gap-2 pt-1.5">
                          {sub.matches.length > 0 ? sub.matches.map((m, i) => <span key={i} className="px-2.5 py-0.5 bg-neutral-800 border border-white/5 rounded-lg text-xs font-mono text-neutral-300 shadow-inner">{m}</span>) : <span className="text-[10px] text-neutral-700 italic pt-1 uppercase font-bold tracking-widest opacity-50">Empty</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'bulk' && (
              <textarea className="flex-1 w-full bg-neutral-900 border border-white/10 rounded-[3rem] p-12 text-sm sm:text-base font-mono text-neutral-400 focus:outline-none focus:border-indigo-500/50 resize-none shadow-inner leading-relaxed scrollbar-thin animate-in zoom-in-95 duration-500" value={lines.join('\n')} onChange={e => setLines(e.target.value.split('\n'))} placeholder="Paste thousands of lines here..." />
            )}

            {viewMode === 'library' && (
              <div className="flex-1 flex flex-col gap-8 overflow-hidden animate-in slide-in-from-right-4 duration-500">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-neutral-900/80 p-8 rounded-[3rem] border border-white/10 shadow-2xl">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest block ml-2">Active Pipeline Layer</label>
                    <div className="flex flex-wrap gap-2">
                        {subsets.map(s => (
                            <button 
                                key={s.id} 
                                onClick={() => setDictActiveSubsetId(s.id)}
                                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase transition-all border ${dictActiveSubsetId === s.id ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-black/40 border-white/5 text-neutral-500 hover:text-neutral-300'}`}
                            >
                                {s.name}
                            </button>
                        ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest block ml-2">Action Mode</label>
                    <div className="flex bg-black/40 rounded-2xl border border-white/10 p-1.5 shadow-inner">
                        <button onClick={() => setDictActionMode('include')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${dictActionMode === 'include' ? 'bg-indigo-600 text-white shadow-xl' : 'text-neutral-500'}`}>Include (+)</button>
                        <button onClick={() => setDictActionMode('exclude')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${dictActionMode === 'exclude' ? 'bg-red-600 text-white shadow-xl' : 'text-neutral-500'}`}>Exclude (-)</button>
                    </div>
                  </div>
                  <div className="space-y-3 relative">
                    <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest block ml-2">Search Global Dataset</label>
                    <div className="relative">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-600" />
                        <input className="w-full bg-black/40 border border-white/10 rounded-2xl pl-14 p-4 text-sm font-bold text-white outline-none focus:border-indigo-500 placeholder-neutral-700 shadow-inner" value={tagSearchQuery} onChange={e => setTagSearchQuery(e.target.value)} placeholder="Filter tags..." />
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-neutral-900/40 rounded-[3rem] border border-white/5 p-12 shadow-inner scrollbar-thin">
                    <div className="flex flex-wrap gap-3 content-start">
                    {uniqueTags.filter(t => t.toLowerCase().includes(tagSearchQuery.toLowerCase())).map(tag => {
                        const activeSub = subsets.find(s => s.id === dictActiveSubsetId);
                        const isInc = activeSub?.keywords.includes(tag); 
                        const isExc = activeSub?.excludeKeywords.includes(tag);
                        const isIncVar = !isInc && activeSub?.keywords.some(k => tag.includes(k.replace(/\{.*?\}/, ''))); 
                        const isExcVar = !isExc && activeSub?.excludeKeywords.some(k => tag.includes(k.replace(/\{.*?\}/, '')));
                        
                        let style = "bg-neutral-800 text-neutral-500 border-white/5 hover:bg-neutral-700 hover:text-neutral-300";
                        let tooltip = "Click to toggle";
                        let indicator = null;

                        if (isIncVar) { style = "bg-indigo-600/10 text-indigo-400 border-indigo-500/30 border-dashed hover:bg-indigo-600/20"; indicator = <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50" />; }
                        if (!isInc && isExcVar) { style = "bg-red-600/10 text-red-400 border-red-500/30 border-dashed hover:bg-red-600/20"; indicator = <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />; }
                        if (isExc) { style = "bg-red-600 text-white border-red-400 shadow-xl shadow-red-600/40 font-black"; tooltip = "Explicitly excluded"; indicator = <XCircle className="w-3 h-3" />; }
                        if (isInc) { style = "bg-indigo-600 text-white border-indigo-400 shadow-xl shadow-indigo-600/40 font-black"; tooltip = "Explicitly included"; indicator = <CheckCircle className="w-3 h-3" />; }
                        
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
                            className={`px-5 py-2.5 rounded-2xl text-[11px] font-mono border transition-all active:scale-95 flex items-center gap-2 ${style}`}
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

        <aside className="w-full md:w-[24rem] lg:w-[32rem] border-l border-white/5 flex flex-col bg-neutral-900/40 shrink-0 min-h-0">
          {!hasProcessed ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-20"><Terminal className="w-16 h-16 mb-6" /><h3 className="text-sm font-black uppercase tracking-[0.3em] mb-3">System Idle</h3><p className="text-xs font-bold text-neutral-500 uppercase leading-relaxed">Compile dataset to<br/>stream results</p></div>
          ) : (
            <>
              <div className="p-8 border-b border-white/5 bg-black/20 flex flex-col gap-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black uppercase text-indigo-400 tracking-widest flex items-center gap-3"><CheckCircle className="w-5 h-5" /> Output Stream</span>
                    <p className="text-[10px] text-neutral-600 font-bold uppercase mt-2">{fullResults.length} Records Compiled</p>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={async () => {
                          let linesToExport: string[] = [];
                          fullResults.forEach(res => {
                              const allTags = res.data.flatMap((s: any) => s.matches);
                              linesToExport.push(allTags.join(', '));
                          });
                          if (removeDuplicates) linesToExport = Array.from(new Set(linesToExport.filter(l => l.trim())));
                          const path = await save({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: `tags_all_merged.txt` });
                          if (path) { await writeTextFile(path, linesToExport.join('\n')); showToast(`Saved All`, "success"); }
                      }} className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-white transition-all shadow-lg" title="Save All Merged"><Download className="w-6 h-6" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-black/40 rounded-xl border border-white/5 text-neutral-500 font-black uppercase text-[10px]">
                  <input type="checkbox" checked={removeDuplicates} onChange={e => setRemoveDuplicates(e.target.checked)} className="w-4 h-4 rounded bg-neutral-800 border-white/10 text-indigo-600" />
                  <label className="cursor-pointer">Unique Records Only</label>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
                <div className="grid grid-cols-2 gap-2 mb-4">
                    {subsets.map(sub => (
                        <button key={sub.id} onClick={async () => {
                            let linesToExport: string[] = [];
                            fullResults.forEach(res => {
                                const group = res.data.find((s: any) => s.id === sub.id);
                                linesToExport.push(group?.matches.join(', ') || "");
                            });
                            if (removeDuplicates) linesToExport = Array.from(new Set(linesToExport.filter(l => l.trim())));
                            const path = await save({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: `tags_${sub.name.toLowerCase()}.txt` });
                            if (path) { await writeTextFile(path, linesToExport.join('\n')); showToast(`Saved: ${sub.name}`, "success"); }
                        }} className="px-3 py-2.5 bg-neutral-800/50 hover:bg-indigo-600/30 border border-white/5 rounded-2xl text-[10px] font-black uppercase text-neutral-400 hover:text-white transition-all truncate">Save {sub.name}</button>
                    ))}
                    <button onClick={async () => {
                        let linesToExport: string[] = [];
                        fullResults.forEach(res => {
                            const group = res.data.find((s: any) => s.id === 0);
                            linesToExport.push(group?.matches.join(', ') || "");
                        });
                        if (removeDuplicates) linesToExport = Array.from(new Set(linesToExport.filter(l => l.trim())));
                        const path = await save({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: `tags_unclassified.txt` });
                        if (path) { await writeTextFile(path, linesToExport.join('\n')); showToast(`Saved: Unclassified`, "success"); }
                    }} className="px-3 py-2.5 bg-red-900/10 hover:bg-red-600/30 border border-red-500/10 rounded-2xl text-[10px] font-black uppercase text-red-400/70 hover:text-red-300 transition-all truncate">Unclassified</button>
                </div>

                {fullResults.map(res => (
                  <div key={res.lineIndex} className={`p-6 bg-neutral-800/30 border rounded-[2.5rem] cursor-pointer transition-all hover:border-indigo-500/40 hover:bg-neutral-800/50 ${expandedLines.has(res.lineIndex) ? 'border-indigo-500 bg-neutral-800/80 shadow-2xl' : 'border-white/5'}`} onClick={() => { const n = new Set(expandedLines); if (n.has(res.lineIndex)) n.delete(res.lineIndex); else n.add(res.lineIndex); setExpandedLines(n); }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black text-neutral-600 uppercase">#L-{String(res.lineIndex).padStart(4, '0')}</span>
                      <ChevronRight className={`w-4 h-4 text-neutral-700 transition-transform ${expandedLines.has(res.lineIndex) ? 'rotate-90' : ''}`} />
                    </div>
                    <div className="space-y-3">
                      {res.data.filter((s: any) => s.matches.length > 0).map((s: any) => (
                        <div key={s.id} className="space-y-1.5">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${s.id === 0 ? 'text-neutral-600 bg-neutral-900' : 'text-indigo-300 bg-indigo-900/40'}`}>{s.name}</span>
                          {expandedLines.has(res.lineIndex) && <p className="text-[11px] font-mono text-neutral-400 break-all pl-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-300">{s.matches.join(', ')}</p>}
                        </div>
                      ))}
                    </div>
                    {expandedLines.has(res.lineIndex) && (
                        <div className="mt-4 pt-4 border-t border-white/5 space-y-1">
                            <span className="text-[8px] font-black text-neutral-600 uppercase">Original Source</span>
                            <p className="text-[10px] font-mono text-neutral-500 italic break-all leading-tight">{lines[res.lineIndex-1]}</p>
                        </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </main>

      <footer className="h-12 border-t border-white/5 bg-neutral-900 px-8 flex items-center justify-between shrink-0 text-white">
        <div className="flex items-center gap-6">
          <span className="text-[10px] font-black text-neutral-600 uppercase tracking-widest">Active: {activePreset.toUpperCase()}</span>
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" /><span className="text-[10px] font-black text-neutral-500 uppercase">Sync Active</span></div>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={handleExportConfig} className="flex items-center gap-2 text-[10px] font-black text-neutral-500 hover:text-white uppercase transition-all"><Save className="w-4 h-4" /> Backup Config</button>
          <button className="flex items-center gap-2 text-[10px] font-black text-neutral-500 hover:text-white uppercase transition-all"><ExternalLink className="w-4 h-4" /> Help</button>
        </div>
      </footer>
    </div>
  );
};
