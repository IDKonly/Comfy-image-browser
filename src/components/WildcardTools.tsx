import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { settingsStore } from "../api/settings";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { X, Wand2, ListFilter, GitMerge } from "lucide-react";
import { useToast } from "./Toast";
import { TagRefiner } from "./TagRefiner";
import { useAppStore, FilterState } from "../store/useAppStore";
import { splitLines, splitCommaOrNewline, splitCommaTrimNonEmpty, splitPromptTags, uniqueMerge } from "./wildcardtools/utils";
import { MergeFilterModal } from "./wildcardtools/MergeFilterModal";
import { TargetImagesPanel } from "./wildcardtools/TargetImagesPanel";
import { TextPromptsPanel } from "./wildcardtools/TextPromptsPanel";
import { CleaningBaseCard } from "./wildcardtools/CleaningBaseCard";
import { WorkshopSettings } from "./wildcardtools/WorkshopSettings";
import { ExclusionFiltersSection } from "./wildcardtools/ExclusionFiltersSection";
import { WorkshopResults } from "./wildcardtools/WorkshopResults";
import { PipelinePanel } from "./wildcardtools/PipelinePanel";

interface WildcardToolsProps {
  onClose: () => void;
  images: any[];
  currentIndex: number;
  batchRange: [number, number] | null;
}

export const WildcardTools = ({ onClose, images, currentIndex, batchRange }: WildcardToolsProps) => {
  const [activeTab, setActiveTab] = useState<'workshop' | 'pipeline'>('workshop');
  const [threshold, setThreshold] = useState(0.5);
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [comparisonText, setComparisonText] = useState("");

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
        mix_tandem_min_branches: currentFilter.mix_tandem_min_branches ?? 2,
        mix_tandem_ratio: currentFilter.mix_tandem_ratio ?? 0.51,
        simple_exclusions: currentFilter.simple_exclusions || [],
        preserve_order: currentFilter.preserve_order ?? false,
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
              const content = await api.readFilterFile(file.name);
              if (content) {
                (loadedFilter as any)[file.key] = splitCommaTrimNonEmpty(content);
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
      // Check if the wildcard modal is currently in the DOM
      const modal = document.querySelector('[data-wildcard-modal]');
      if (!modal) return;

      const payload = event.payload as any;
      const paths = payload.paths as string[];
      if (paths && paths.length > 0) {
        const addedCount = await addPathsRecursive(paths);
        if (addedCount > 0) {
          showToast(`Added ${addedCount} files to Workshop`, 'success');
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
    const combined = uniqueMerge(currentList, newTags);
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
        const uniqueNew = uniqueMerge(targetPaths, pathsToAdd);
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
        const result = await api.scanPaths(paths, recursiveRef.current);
        if (result && Array.isArray(result)) {
            const imgPaths = result.map((img: any) => img.path);
            newPaths.push(...imgPaths);
        }
    } catch (e) {
        console.error("Batch scan error:", e);
    }

    if (newPaths.length > 0) {
        const uniqueNew = uniqueMerge(targetPathsRef.current, newPaths);
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
      const prompts = splitLines(textInput);
      const comparisonPrompts = splitCommaOrNewline(comparisonText);

      if (targetPaths.length === 0 && prompts.length === 0) {
        showToast("No input (images or text) provided", "error");
        return;
      }

      let res: string[] = [];
      if (comparisonPath || comparisonPrompts.length > 0) {
          res = await api.compareTags({
              targetPaths,
              targetPrompts: prompts,
              comparisonPaths: comparisonPath ? [comparisonPath] : [],
              comparisonPrompts,
              threshold,
              filter
          });
      } else {
          res = await api.generateWildcards({
            paths: targetPaths,
            prompts,
            threshold,
            filter
          });
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

  const handleLoadTextFile = async () => {
    try {
        const selected = await open({
            multiple: false,
            filters: [{ name: 'Text', extensions: ['txt'] }]
        });
        if (selected && typeof selected === 'string') {
            const { readTextFile } = await import("@tauri-apps/plugin-fs");
            const text = await readTextFile(selected);
            setTextInput(prev => prev ? prev + "\n" + text : text);
            showToast("Loaded prompts from file", "success");
        }
    } catch (e: any) {
        showToast("Check file permissions or try manual copy-paste", "info");
    }
  };

  const openRefiner = async () => {
    setLoading(true);
    try {
      // Fetch counts from images
      let counts: Record<string, number> = {};
      if (targetPaths.length > 0) {
        counts = await api.getTagCounts(targetPaths);
      }

      // Merge counts from text prompts
      const prompts = splitLines(textInput);
      prompts.forEach(p => {
          splitPromptTags(p).forEach(tag => {
              counts[tag] = (counts[tag] || 0) + 1;
          });
      });

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
        await api.writeFilterFile(filename, content);
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
        await api.saveToFile(path, results.join('\n'));
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
              {activeTab === 'workshop' ? <Wand2 className="w-5 h-5 text-blue-500" /> : <GitMerge className="w-5 h-5 text-blue-500" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-widest truncate">
                {activeTab === 'workshop' ? 'Wildcard Workshop' : 'Auto Pipeline'}
              </h2>
              <p className="text-[10px] text-neutral-300 font-bold uppercase truncate">
                {activeTab === 'workshop' ? 'Mixed Input Analysis (Images + Text)' : 'Extract → Clean → Classify → Save'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Tab switcher */}
            <div className="flex bg-neutral-800 rounded-xl p-1 border border-white/5">
              <button
                onClick={() => setActiveTab('workshop')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === 'workshop' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                <Wand2 className="w-3 h-3" /> Workshop
              </button>
              <button
                onClick={() => setActiveTab('pipeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === 'pipeline' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                <GitMerge className="w-3 h-3" /> Pipeline
              </button>
            </div>
            <button onClick={onClose} className="w-11 h-11 flex items-center justify-center hover:bg-white/5 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {activeTab === 'pipeline' && (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <PipelinePanel />
          </div>
        )}

        <div className={`flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden scrollbar-thin ${activeTab !== 'workshop' ? 'hidden' : ''}`}>
          {/* Combined Sidebar */}
          <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col bg-solid-nested shrink-0">
            <TargetImagesPanel
              paths={targetPaths}
              onClear={clearPaths}
              onImportFromViewer={handleImportFromViewer}
              onAddFiles={handleAddFiles}
              onAddFolder={handleAddFolder}
              onRemove={removePath}
            />
            <TextPromptsPanel
              value={textInput}
              onChange={setTextInput}
              onImport={handleLoadTextFile}
              onClear={() => setTextInput("")}
            />
          </div>

          {/* Main Content Area */}
          <div className="w-full lg:flex-1 flex flex-col lg:overflow-hidden bg-solid-surface-elevated">
            <div className="p-6 flex-1 lg:overflow-y-auto space-y-6 scrollbar-thin">

              {/* Progress Bar Area */}
              {loading && (
                <div className="space-y-2 animate-in fade-in duration-300">
                    <div className="flex justify-between text-[10px] font-black uppercase text-blue-400">
                        <span>Unified Processing...</span>
                        <span>{progress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-white/5">
                        <div className="h-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                    </div>
                </div>
              )}

              <CleaningBaseCard
                comparisonPath={comparisonPath}
                onClearComparisonPath={() => setComparisonPath(null)}
                comparisonText={comparisonText}
                onComparisonTextChange={setComparisonText}
              />

              <WorkshopSettings
                threshold={threshold}
                onThresholdChange={setThreshold}
                filter={filter}
                onFilterChange={setFilter}
              />

              {/* Action Button & Refiner */}
              <div className="flex gap-3">
                <button
                    onClick={runWorkshop} disabled={loading || (targetPaths.length === 0 && textInput.trim() === "")}
                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 text-white"
                >
                    {loading ? "Processing..." : `Generate Wildcards (${targetPaths.length} Images + ${splitLines(textInput).length} Text)`}
                </button>
                <button onClick={openRefiner} disabled={targetPaths.length === 0 && textInput.trim() === ""} className="px-6 py-4 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all text-neutral-300" title="Manage Exclusions">
                    <ListFilter className="w-4 h-4" />
                </button>
              </div>

              <ExclusionFiltersSection
                open={showFilters}
                onToggle={() => setShowFilters(!showFilters)}
                filter={filter}
                onFilterChange={setFilter}
                onMergeTarget={setMergeTarget}
                onSaveFilterList={saveFilterList}
              />

              <WorkshopResults results={results} onCopy={copyToClipboard} onExport={handleExport} />
            </div>
          </div>
        </div>
      </div>

      {showRefiner && (
        <TagRefiner
            tagCounts={tagCounts}
            initialExcluded={filter.exact_match}
            partialMatch={filter.partial_match}
            onClose={() => setShowRefiner(false)}
            onApply={async (excluded) => {
                const newFilter = {...filter, exact_match: excluded};
                setFilter(newFilter);
                setShowRefiner(false);

                // Auto-save exact match filter
                try {
                    const content = excluded.join(', ');
                    await api.writeFilterFile('default_exact_exclusion.txt', content);
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
