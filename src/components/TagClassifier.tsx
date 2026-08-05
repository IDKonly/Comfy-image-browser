import React, { useState, useMemo, useEffect } from 'react';
import { Database, PanelRight } from 'lucide-react';
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { useToast } from "./Toast";
import { useAppStore } from "../store/useAppStore";
import { api } from "../api";
import { Subset, WordGroup, Register, DEFAULT_REGISTERS, TagClassifierProps } from "./tagclassifier/types";
import { getMergedTag, parseLine } from "./tagclassifier/classify";
import {
  isTauri, classifierStore, dialogOpen, dialogSave, dialogConfirm,
  fsExists, fsMkdir, fsReadDir, fsReadTextFile, fsWriteTextFile, fsRemove, tauriInvokeMock,
  migrateClassifierSettings, rescueStrandedBrowserConfig,
} from "./tagclassifier/browserFallback";
import { ConfigBar } from "./tagclassifier/ConfigBar";
import { RulesRail, RulesTab } from "./tagclassifier/RulesRail";
import { SubsetCard } from "./tagclassifier/SubsetCard";
import { WordGroupEditor } from "./tagclassifier/WordGroupEditor";
import { RegisterEditor } from "./tagclassifier/RegisterEditor";
import { WorkstationToolbar } from "./tagclassifier/WorkstationToolbar";
import { SingleEditorView } from "./tagclassifier/SingleEditorView";
import { BulkSourceView } from "./tagclassifier/BulkSourceView";
import { LibraryView } from "./tagclassifier/LibraryView";
import { OutputPanel } from "./tagclassifier/OutputPanel";
import { MobileSectionNav } from "./tagclassifier/MobileSectionNav";
import { TAG_SIZE_DEFAULT, clampTagSize } from "./tagclassifier/TagSizeControl";
import { ToolShell, ICON_BTN } from "./ui";

export const TagClassifier = ({ onClose, initialData = "" }: TagClassifierProps) => {
  const [activeMobileSection, setActiveMobileSection] = useState('editor' as 'rules' | 'editor' | 'output');
  const [lines, setLines] = useState(initialData.split('\n').filter(l => l.trim()) as string[]);
  const [viewMode, setViewMode] = useState('single' as 'single' | 'bulk' | 'library');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [subsets, setSubsets] = useState([] as Subset[]);
  const [wordGroups, setWordGroups] = useState([] as WordGroup[]);
  const [registers, setRegisters] = useState([] as Register[]);
  const [previewRegisterId, setPreviewRegisterId] = useState(0 as number);
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
  const [rulesTab, setRulesTab] = useState('groups' as RulesTab);
  const [tagSize, setTagSize] = useState(TAG_SIZE_DEFAULT);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [collapsedSubsets, setCollapsedSubsets] = useState(new Set() as any);
  const [previewData, setPreviewData] = useState([] as any[]);

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
      const data = { subsets, wordGroups, registers };
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
        // Older presets have no registers key — treat as "none defined".
        setRegisters(config.registers ?? []);
      } else {
        // Load clean default layout
        setSubsets([{ id: 1, name: 'Characters', keywords: [], excludeKeywords: [] }]);
        setWordGroups([]);
        setRegisters([]);
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
      setRegisters(config.registers ?? []);
      showToast("Config imported successfully", "success");
    } catch (e: any) {
      showToast(`Import failed: ${e.message || e}`, "error");
    }
  };

  const handleExportConfig = async () => {
    try {
      const path = await dialogSave({ filters: [{ name: 'JSON', extensions: ['json'] }], defaultPath: "tag_classifier_settings.json" });
      if (!path) return;
      const data = { subsets, wordGroups, registers };
      await fsWriteTextFile(path, JSON.stringify(data, null, 2));
      showToast("Config exported successfully", "success");
    } catch (e: any) {
      showToast(`Export failed: ${e.message || e}`, "error");
    }
  };

  // --- Initialization ---
  useEffect(() => {
    const init = async () => {
      // Recover config stranded in localStorage by the old broken isTauri probe, then
      // fold in the legacy `.tag_classifier.json`. Order matters: the rescue must land
      // before anything reads the store.
      await rescueStrandedBrowserConfig();
      await migrateClassifierSettings();
      await refreshPresets();
      const lastPreset = (await classifierStore.get("last_preset")) as string | null;
      const s = (await classifierStore.get("subsets")) as Subset[] | null;
      const w = (await classifierStore.get("wordGroups")) as WordGroup[] | null;
      const r = (await classifierStore.get("registers")) as Register[] | null;
      const ts = (await classifierStore.get("tag_font_size")) as number | null;
      if (s) setSubsets(s); else setSubsets([{ id: 1, name: 'Characters', keywords: [], excludeKeywords: [] }]);
      if (w) setWordGroups(w); else setWordGroups([]);
      if (r) setRegisters(r);
      if (ts != null) setTagSize(clampTagSize(ts));
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
      classifierStore.set("registers", registers);
      classifierStore.set("tag_font_size", tagSize);
      classifierStore.save();
    }
    if (subsets.length > 0 && dictActiveSubsetId === null) setDictActiveSubsetId(subsets[0].id);
  }, [subsets, wordGroups, registers, tagSize, isLoading]);

  const uniqueTags = useMemo(() => {
    const tags = new Set() as any;
    lines.forEach(line => line.split(',').forEach(t => {
      const c = getMergedTag(t.trim().toLowerCase(), wordGroups);
      if (c) tags.add(c);
    }));
    return Array.from(tags).sort() as string[];
  }, [lines, wordGroups]);

  // Live "Flow Result" preview of the current line. Uses the SAME backend classifier as
  // Compile (debounced) so the preview always matches the compiled output; the browser
  // audit fallback uses the JS port (kept in sync with the Rust logic).
  useEffect(() => {
    const line = lines[currentIndex] || "";
    if (!line.trim()) { setPreviewData([]); setPreviewRegisterId(0); return; }
    if (!isTauri) { setPreviewData(parseLine(line, subsets, wordGroups)); return; }
    let active = true;
    const timer = setTimeout(() => {
      api.classifyPromptsCommand([line], subsets, wordGroups)
        .then(res => { if (active) setPreviewData(res?.[0]?.data ?? []); })
        .catch(() => {});
      if (registers.length > 0) {
        api.classifyRegistersCommand([line], registers)
          .then(ids => { if (active) setPreviewRegisterId(ids?.[0] ?? 0); })
          .catch(() => {});
      } else if (active) {
        setPreviewRegisterId(0);
      }
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [lines, currentIndex, subsets, wordGroups, registers]);

  const previewRegisterName = useMemo(
    () => registers.find(r => r.id === previewRegisterId)?.name ?? null,
    [registers, previewRegisterId]
  );

  const moveRegister = (id: number, delta: -1 | 1) => {
    const i = registers.findIndex(r => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= registers.length) return;
    const ns = [...registers];
    [ns[i], ns[j]] = [ns[j], ns[i]];
    setRegisters(ns);
  };

  // Import folder prompts
  const importDirect = async () => {
    if (isTauri && !folderPath) { 
      showToast("Select a folder in ComfyView first", "error"); 
      return; 
    }
    setIsRunning(true);
    try {
        const raw: string[] = isTauri
          ? await api.getAllPrompts(folderPath ?? "", recursive)
          : await tauriInvokeMock("get_all_prompts", { folder: folderPath, recursive });
        // The DB filters `prompt IS NOT NULL` but not empty strings — drop those here so
        // blank lines don't pad the editor.
        const results = (raw ?? []).filter(l => l.trim());
        if (results.length === 0) {
          showToast(
            `No indexed prompts in this folder${recursive ? " (recursive)" : " — try enabling recursive"}`,
            "info"
          );
        } else {
            setLines(results);
            setCurrentIndex(0);
            showToast(`Direct Import: Loaded ${results.length} prompts`, "success");
        }
    } catch (e: any) {
        console.error("Direct Import Error:", e);
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
        
        const raw: string[] = isTauri
          ? await api.generateWildcards({ paths: targetPaths, prompts: [], threshold: 0.95, filter: workshopFilter })
          : await tauriInvokeMock("generate_wildcards", { paths: targetPaths, prompts: [], threshold: 0.95, filter: workshopFilter });

        const results = (raw ?? []).filter(l => l.trim());
        if (results.length === 0) {
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
    <ToolShell
      onClose={onClose}
      title="Tag Classifier"
      icon={<Database className="w-3.5 h-3.5 text-blue-500" />}
      // Every tag chip in the panel sizes off this variable (see TAG_TEXT in ui/tokens).
      panelProps={{ style: { "--tag-font-size": `${tagSize}px` } as React.CSSProperties }}
      headerContent={
        <ConfigBar
          activePreset={activePreset}
          presets={presets}
          onLoad={loadPreset}
          onSavePreset={() => { const name = prompt("Enter preset name:"); if (name) savePreset(name); }}
          onDeletePreset={() => deletePreset(activePreset)}
          onImportConfig={handleImportConfig}
          onExportConfig={handleExportConfig}
        />
      }
      headerActions={
        <button
          onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
          className={`${ICON_BTN} hidden lg:flex ${isRightSidebarOpen ? 'text-blue-400' : ''}`}
          title={isRightSidebarOpen ? "Hide output panel" : "Show output panel"}
          aria-label={isRightSidebarOpen ? "Hide output panel" : "Show output panel"}
          aria-pressed={isRightSidebarOpen}
        >
          <PanelRight className="w-3.5 h-3.5" />
        </button>
      }
      status={
        <>
          <span className="truncate">Preset <span className="text-blue-400">{activePreset}</span></span>
          <span className="tabular-nums whitespace-nowrap">{lines.length} lines · {uniqueTags.length} unique tags</span>
          <div className="flex-1" />
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Live sync
          </span>
        </>
      }
    >
        {/* Main Column Containers */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left Rail: Pipeline Rules / Tag Variables / Scene Registers (tabbed) */}
          <aside className={`flex-col bg-solid-nested shrink-0 min-h-0 ${activeMobileSection === 'rules' ? 'flex w-full' : 'hidden'} lg:flex lg:w-[272px] lg:border-r lg:border-white/5`}>
            <RulesRail
              activeTab={rulesTab}
              counts={{ groups: subsets.length, vars: wordGroups.length, regs: registers.length }}
              onTabChange={setRulesTab}
              onAdd={() => {
                if (rulesTab === 'groups') setSubsets([...subsets, { id: Date.now(), name: 'New Group', keywords: [], excludeKeywords: [] }]);
                else if (rulesTab === 'vars') setWordGroups([...wordGroups, { id: Date.now(), name: 'var', words: [] }]);
                else setRegisters([...registers, { id: Date.now(), name: 'register', keywords: [], excludeKeywords: [] }]);
              }}
            >
              {rulesTab === 'groups' && subsets.map((sub, idx) => (
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

              {rulesTab === 'vars' && (
                <WordGroupEditor
                  wordGroups={wordGroups}
                  uniqueTags={uniqueTags}
                  onAdd={() => setWordGroups([...wordGroups, { id: Date.now(), name: 'var', words: [] }])}
                  onRename={(id, name) => setWordGroups(wordGroups.map(w => w.id === id ? {...w, name} : w))}
                  onDelete={(id) => setWordGroups(wordGroups.filter(w => w.id !== id))}
                  onWordsChange={(id, words) => setWordGroups(wordGroups.map(w => w.id === id ? {...w, words} : w))}
                />
              )}

              {rulesTab === 'regs' && (
                <RegisterEditor
                  registers={registers}
                  uniqueTags={uniqueTags}
                  onAdd={() => setRegisters([...registers, { id: Date.now(), name: 'register', keywords: [], excludeKeywords: [] }])}
                  onAddDefaults={() => setRegisters(DEFAULT_REGISTERS.map(r => ({ ...r, id: Date.now() + r.id })))}
                  onRename={(id, name) => setRegisters(registers.map(r => r.id === id ? {...r, name} : r))}
                  onDelete={(id) => setRegisters(registers.filter(r => r.id !== id))}
                  onIncludeChange={(id, tags) => setRegisters(registers.map(r => r.id === id ? {...r, keywords: tags} : r))}
                  onExcludeChange={(id, tags) => setRegisters(registers.map(r => r.id === id ? {...r, excludeKeywords: tags} : r))}
                  onToggleFallback={(id) => setRegisters(registers.map(r => r.id === id ? {...r, isFallback: !r.isFallback} : r))}
                  onMoveUp={(id) => moveRegister(id, -1)}
                  onMoveDown={(id) => moveRegister(id, 1)}
                />
              )}
            </RulesRail>
          </aside>

          {/* Center Canvas: Active Workstation Area */}
          <section className={`flex-1 flex-col bg-solid-surface-elevated overflow-hidden min-w-0 ${activeMobileSection === 'editor' ? 'flex' : 'hidden'} lg:flex`}>
            {/* Center Canvas Header / Toolbar */}
            <WorkstationToolbar
              viewMode={viewMode}
              isRunning={isRunning}
              currentIndex={currentIndex}
              lineCount={lines.length}
              registerName={previewRegisterName}
              tagSize={tagSize}
              onTagSizeChange={setTagSize}
              onViewModeChange={setViewMode}
              onPrev={() => setCurrentIndex(p => Math.max(0, p - 1))}
              onNext={() => setCurrentIndex(p => Math.min(lines.length - 1, p + 1))}
              onInsertLine={() => { const nl = [...lines]; nl.splice(currentIndex+1, 0, ""); setLines(nl); setCurrentIndex(currentIndex+1); }}
              onDeleteLine={() => { if (lines.length <= 1) return; setLines(lines.filter((_, i) => i !== currentIndex)); setCurrentIndex(Math.max(0, currentIndex-1)); }}
              onImportDirect={importDirect}
              onImportFiltered={importFiltered}
              onRunAnalysis={runAnalysis}
            />

            <div className="flex-1 min-h-0 p-1.5 flex flex-col overflow-hidden">
              {viewMode === 'single' && (
                <SingleEditorView
                  lines={lines}
                  currentIndex={currentIndex}
                  previewData={previewData}
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

          {/* Right Rail: Output Streams. Collapsible on desktop via the header toggle. */}
          <aside className={`flex-col bg-solid-nested shrink-0 min-h-0 overflow-hidden ${activeMobileSection === 'output' ? 'flex w-full' : 'hidden'} ${isRightSidebarOpen ? 'lg:flex lg:w-[290px] lg:border-l lg:border-white/5' : 'lg:hidden'}`}>
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
    </ToolShell>
  );
};
