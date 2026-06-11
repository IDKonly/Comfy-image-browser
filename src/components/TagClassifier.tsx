import { useState, useMemo, useEffect } from 'react';
import { Plus, ChevronRight, ChevronLeft, Database, X, Save, Filter } from 'lucide-react';
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { useToast } from "./Toast";
import { useAppStore } from "../store/useAppStore";
import { api } from "../api";
import { Subset, WordGroup, TagClassifierProps } from "./tagclassifier/types";
import { getMergedTag, parseLine } from "./tagclassifier/classify";
import {
  isTauri, classifierStore, dialogOpen, dialogSave, dialogConfirm,
  fsExists, fsMkdir, fsReadDir, fsReadTextFile, fsWriteTextFile, fsRemove, tauriInvokeMock,
} from "./tagclassifier/browserFallback";
import { PresetBar } from "./tagclassifier/PresetBar";
import { SubsetCard } from "./tagclassifier/SubsetCard";
import { WordGroupEditor } from "./tagclassifier/WordGroupEditor";
import { WorkstationToolbar } from "./tagclassifier/WorkstationToolbar";
import { SingleEditorView } from "./tagclassifier/SingleEditorView";
import { BulkSourceView } from "./tagclassifier/BulkSourceView";
import { LibraryView } from "./tagclassifier/LibraryView";
import { OutputPanel } from "./tagclassifier/OutputPanel";
import { MobileSectionNav } from "./tagclassifier/MobileSectionNav";

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
            <PresetBar
              activePreset={activePreset}
              presets={presets}
              onLoad={loadPreset}
              onSave={() => { const name = prompt("Enter preset name:"); if (name) savePreset(name); }}
              onDelete={() => deletePreset(activePreset)}
            />

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {subsets.map((sub, idx) => (
                <SubsetCard
                  key={sub.id}
                  sub={sub}
                  idx={idx}
                  isActive={dictActiveSubsetId === sub.id}
                  isActiveInLibrary={dictActiveSubsetId === sub.id && viewMode === 'library'}
                  isCollapsed={collapsedSubsets.has(sub.id)}
                  uniqueTags={uniqueTags}
                  onActivate={() => setDictActiveSubsetId(sub.id)}
                  onToggleCollapse={() => {
                    const next = new Set(collapsedSubsets);
                    if (next.has(sub.id)) next.delete(sub.id);
                    else next.add(sub.id);
                    setCollapsedSubsets(next);
                  }}
                  onRename={(name) => setSubsets(subsets.map(s => s.id === sub.id ? {...s, name} : s))}
                  onMoveUp={() => { const ns = [...subsets]; if (idx > 0) [ns[idx], ns[idx-1]] = [ns[idx-1], ns[idx]]; setSubsets(ns); }}
                  onMoveDown={() => { const ns = [...subsets]; if (idx < subsets.length - 1) [ns[idx], ns[idx+1]] = [ns[idx+1], ns[idx]]; setSubsets(ns); }}
                  onDelete={() => setSubsets(subsets.filter(s => s.id !== sub.id))}
                  onIncludeChange={(tags) => setSubsets(subsets.map(s => s.id === sub.id ? {...s, keywords: tags} : s))}
                  onExcludeChange={(tags) => setSubsets(subsets.map(s => s.id === sub.id ? {...s, excludeKeywords: tags} : s))}
                />
              ))}
              <div className="bg-solid-nested border border-dashed border-white/5 rounded-3xl p-6 text-center shrink-0">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Waterfall Stream End</span>
              </div>
            </div>

            {/* Bottom Left: Tag Variables Panel */}
            <WordGroupEditor
              wordGroups={wordGroups}
              uniqueTags={uniqueTags}
              onAdd={() => setWordGroups([...wordGroups, { id: Date.now(), name: 'var', words: [] }])}
              onRename={(id, name) => setWordGroups(wordGroups.map(w => w.id === id ? {...w, name} : w))}
              onDelete={(id) => setWordGroups(wordGroups.filter(w => w.id !== id))}
              onWordsChange={(id, words) => setWordGroups(wordGroups.map(w => w.id === id ? {...w, words} : w))}
            />
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
            <WorkstationToolbar
              viewMode={viewMode}
              isRunning={isRunning}
              onViewModeChange={setViewMode}
              onImportDirect={importDirect}
              onImportFiltered={importFiltered}
              onImportConfig={handleImportConfig}
              onRunAnalysis={runAnalysis}
            />

            <div className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 overflow-hidden">
              {viewMode === 'single' && (
                <SingleEditorView
                  lines={lines}
                  currentIndex={currentIndex}
                  subsets={subsets}
                  wordGroups={wordGroups}
                  onPrev={() => setCurrentIndex(p => Math.max(0, p - 1))}
                  onNext={() => setCurrentIndex(p => Math.min(lines.length - 1, p + 1))}
                  onInsertLine={() => { const nl = [...lines]; nl.splice(currentIndex+1, 0, ""); setLines(nl); setCurrentIndex(currentIndex+1); }}
                  onDeleteLine={() => { if (lines.length <= 1) return; setLines(lines.filter((_, i) => i !== currentIndex)); setCurrentIndex(Math.max(0, currentIndex-1)); }}
                  onActiveLineChange={(value) => { const nl = [...lines]; nl[currentIndex] = value; setLines(nl); }}
                />
              )}

              {/* Bulk Textarea Editor */}
              {viewMode === 'bulk' && (
                <BulkSourceView lines={lines} onLinesChange={setLines} />
              )}

              {/* Library tag grid explorer */}
              {viewMode === 'library' && (
                <LibraryView
                  subsets={subsets}
                  uniqueTags={uniqueTags}
                  dictActiveSubsetId={dictActiveSubsetId}
                  dictActionMode={dictActionMode}
                  tagSearchQuery={tagSearchQuery}
                  onSelectSubset={setDictActiveSubsetId}
                  onActionModeChange={setDictActionMode}
                  onSearchChange={setTagSearchQuery}
                  onToggleTag={(tag) => {
                    if (!dictActiveSubsetId) return;
                    const sub = subsets.find(s => s.id === dictActiveSubsetId)!;
                    const field = dictActionMode === 'include' ? 'keywords' : 'excludeKeywords';
                    let current = [...sub[field]];
                    const hasVar = /\{.*?\}/.test(tag);
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
                />
              )}
            </div>
          </section>

          {/* Right Sidebar: Output Streams */}
          <aside className={`border-l border-white/5 flex flex-col bg-solid-nested shrink-0 min-h-0 transition-all duration-300 overflow-hidden ${isRightSidebarOpen ? (activeMobileSection === 'output' ? 'w-full flex' : 'w-0 border-none md:w-80 lg:w-80 md:flex hidden') : 'w-0 border-none'}`}>
            <OutputPanel
              hasProcessed={hasProcessed}
              fullResults={fullResults}
              subsets={subsets}
              lines={lines}
              expandedLines={expandedLines}
              removeDuplicates={removeDuplicates}
              onToggleExpanded={(lineIndex) => { const n = new Set(expandedLines); if (n.has(lineIndex)) n.delete(lineIndex); else n.add(lineIndex); setExpandedLines(n); }}
              onRemoveDuplicatesChange={setRemoveDuplicates}
              onExportAll={async () => {
                let linesToExport: string[] = [];
                fullResults.forEach(res => {
                    const allTags = res.data.flatMap((s: any) => s.matches);
                    linesToExport.push(allTags.join(', '));
                });
                if (removeDuplicates) linesToExport = Array.from(new Set(linesToExport.filter(l => l.trim())));
                const path = await dialogSave({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: `tags_all_merged.txt` });
                if (path) { await fsWriteTextFile(path, linesToExport.join('\n')); showToast(`Saved All`, "success"); }
              }}
              onExportSubset={async (sub) => {
                let linesToExport: string[] = [];
                fullResults.forEach(res => {
                    const group = res.data.find((s: any) => s.id === sub.id);
                    linesToExport.push(group?.matches.join(', ') || "");
                });
                if (removeDuplicates) linesToExport = Array.from(new Set(linesToExport.filter(l => l.trim())));
                const path = await dialogSave({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: `tags_${sub.name.toLowerCase()}.txt` });
                if (path) { await fsWriteTextFile(path, linesToExport.join('\n')); showToast(`Saved: ${sub.name}`, "success"); }
              }}
              onExportUnclassified={async () => {
                let linesToExport: string[] = [];
                fullResults.forEach(res => {
                    const group = res.data.find((s: any) => s.id === 0);
                    linesToExport.push(group?.matches.join(', ') || "");
                });
                if (removeDuplicates) linesToExport = Array.from(new Set(linesToExport.filter(l => l.trim())));
                const path = await dialogSave({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: `tags_unclassified.txt` });
                if (path) { await fsWriteTextFile(path, linesToExport.join('\n')); showToast(`Saved: Unclassified`, "success"); }
              }}
            />
          </aside>
        </div>

        {/* Responsive Mobile Bottom Navigation Bar */}
        <MobileSectionNav activeMobileSection={activeMobileSection} onChange={setActiveMobileSection} />

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
