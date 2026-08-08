import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "../api";
import { settingsStore } from "../api/settings";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Wand2, ListFilter, LayoutGrid, FilePlus, FolderPlus, Play, RefreshCw, PanelRight, Trash2, FileUp } from "lucide-react";
import { useToast } from "./Toast";
import { TagRefiner } from "./TagRefiner";
import { useAppStore, FilterState } from "../store/useAppStore";
import { splitLines, splitCommaOrNewline, splitPromptTags, uniqueMerge } from "./wildcardtools/utils";
import { MergeFilterModal } from "./wildcardtools/MergeFilterModal";
import { InputRail, InputTab } from "./wildcardtools/InputRail";
import { TargetImagesPanel } from "./wildcardtools/TargetImagesPanel";
import { TextPromptsPanel } from "./wildcardtools/TextPromptsPanel";
import { CleaningBaseCard } from "./wildcardtools/CleaningBaseCard";
import { WorkshopSettings } from "./wildcardtools/WorkshopSettings";
import { ExclusionFiltersSection } from "./wildcardtools/ExclusionFiltersSection";
import { WorkshopResults } from "./wildcardtools/WorkshopResults";
import { ToolShell, ICON_BTN, BAR_BTN, BAR_BTN_GHOST } from "./ui";

interface WildcardToolsProps {
  onClose: () => void;
  images: any[];
  currentIndex: number;
  batchRange: [number, number] | null;
}

export const WildcardTools = ({ onClose, images, currentIndex, batchRange }: WildcardToolsProps) => {
  const [inputTab, setInputTab] = useState<InputTab>('images');
  const [isResultsOpen, setIsResultsOpen] = useState(true);
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
  const [scanningTags, setScanningTags] = useState(false);
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
                // Newline-separated too — hand-maintained default_*.txt files are commonly
                // written one tag per line, and comma-only splitting glued those into a
                // single unmatchable entry.
                (loadedFilter as any)[file.key] = splitCommaOrNewline(content);
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

  /**
   * Every tag the current input contains, with occurrence counts.
   *
   * Backed by a command over the image paths, so it is pulled on demand rather than kept
   * live: the Refine dialog fetches it when opened, and the exclusion picker when its
   * section is expanded or explicitly rescanned.
   */
  const scanInputTags = async (): Promise<Record<string, number>> => {
    let counts: Record<string, number> = {};
    if (targetPaths.length > 0) {
      counts = await api.getTagCounts(targetPaths);
    }
    // Merge counts from text prompts
    splitLines(textInput).forEach(p => {
      splitPromptTags(p).forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return counts;
  };

  const rescanInputTags = async () => {
    setScanningTags(true);
    try {
      setTagCounts(await scanInputTags());
    } catch (e: any) {
      showToast(e.toString(), "error");
    } finally {
      setScanningTags(false);
    }
  };

  const openRefiner = async () => {
    setLoading(true);
    try {
      setTagCounts(await scanInputTags());
      setShowRefiner(true);
    } catch (e: any) {
      showToast(e.toString(), "error");
    } finally {
      setLoading(false);
    }
  };

  /** Pull the tag universe the first time the exclusion picker is revealed. */
  const toggleFilters = () => {
    const next = !showFilters;
    setShowFilters(next);
    if (next && Object.keys(tagCounts).length === 0 && !scanningTags) rescanInputTags();
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

  const textLineCount = splitLines(textInput).length;
  const hasInput = targetPaths.length > 0 || textInput.trim() !== "";

  // Sorted, lowercased tag universe for the exclusion picker. The filter lists are matched
  // case-sensitively by the backend against tags that arrive lowercased, so folding here
  // keeps the grid's membership checks aligned with what the run will actually do.
  const inputTags = useMemo(
    () => Array.from(new Set(Object.keys(tagCounts).map(t => t.toLowerCase()))).sort(),
    [tagCounts]
  );

  return (
    <>
    <ToolShell
      onClose={onClose}
      title="Wildcard Workshop"
      icon={<Wand2 className="w-3.5 h-3.5 text-blue-500" />}
      panelProps={{ "data-wildcard-modal": "" } as any}
      headerActions={
        <button
          onClick={() => setIsResultsOpen(!isResultsOpen)}
          className={`${ICON_BTN} hidden lg:flex ${isResultsOpen ? 'text-blue-400' : ''}`}
          title={isResultsOpen ? "Hide results" : "Show results"}
          aria-label={isResultsOpen ? "Hide results" : "Show results"}
          aria-pressed={isResultsOpen}
        >
          <PanelRight className="w-3.5 h-3.5" />
        </button>
      }
      status={
        <>
          <span className="tabular-nums whitespace-nowrap">
            {targetPaths.length} images · {textLineCount} text lines · {results.length} results
          </span>
          <div className="flex-1" />
          {loading && <span className="text-blue-400 tabular-nums shrink-0">Processing {progress.toFixed(0)}%</span>}
        </>
      }
    >
      {/* Desktop: three side-by-side rails. Below `lg` the same three regions stack into one
          scrolling column — the rails are never duplicated, only re-flowed. */}
      <div className="flex flex-1 min-h-0 overflow-hidden max-lg:flex-col max-lg:overflow-y-auto max-lg:scrollbar-thin">
        {/* Left Rail: input sources (tabbed) */}
        <aside className="w-full lg:w-[272px] shrink-0 flex flex-col min-h-0 max-lg:h-72 bg-solid-nested lg:border-r max-lg:border-b border-white/5">
          <InputRail
            activeTab={inputTab}
            counts={{ images: targetPaths.length, text: textLineCount }}
            onTabChange={setInputTab}
            actions={
              inputTab === 'images' ? (
                <>
                  <button onClick={handleImportFromViewer} className={`${BAR_BTN} bg-blue-600/10 hover:bg-blue-600/25 text-blue-400 border-blue-500/25`} title="Import the current viewer selection">
                    <LayoutGrid className="w-3 h-3" /> Viewer
                  </button>
                  <button onClick={handleAddFiles} className={ICON_BTN} title="Add image files" aria-label="Add image files"><FilePlus className="w-3.5 h-3.5" /></button>
                  <button onClick={handleAddFolder} className={ICON_BTN} title="Add a folder" aria-label="Add a folder"><FolderPlus className="w-3.5 h-3.5" /></button>
                  {targetPaths.length > 0 && (
                    <button onClick={clearPaths} className={ICON_BTN} title="Clear image list" aria-label="Clear image list"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </>
              ) : (
                <>
                  <button onClick={handleLoadTextFile} className={ICON_BTN} title="Load prompts from a .txt file" aria-label="Load prompts from file"><FileUp className="w-3.5 h-3.5" /></button>
                  {textInput !== "" && (
                    <button onClick={() => setTextInput("")} className={ICON_BTN} title="Clear text prompts" aria-label="Clear text prompts"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </>
              )
            }
          >
            {inputTab === 'images'
              ? <TargetImagesPanel paths={targetPaths} onRemove={removePath} />
              : <TextPromptsPanel value={textInput} onChange={setTextInput} />}
          </InputRail>
        </aside>

        {/* Center: run configuration */}
        <section className="flex-1 min-w-0 flex flex-col bg-solid-surface-elevated max-lg:shrink-0">
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-1.5 space-y-1.5 max-lg:overflow-visible">
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

            <ExclusionFiltersSection
              open={showFilters}
              onToggle={toggleFilters}
              filter={filter}
              onFilterChange={setFilter}
              onMergeTarget={setMergeTarget}
              onSaveFilterList={saveFilterList}
              uniqueTags={inputTags}
              onRescan={rescanInputTags}
              scanning={scanningTags}
            />
          </div>

          {/* Action bar */}
          <div className="shrink-0 border-t border-white/5 bg-solid-panel p-1.5">
            {loading && (
              <div className="h-0.5 mb-1.5 bg-neutral-950 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button
                onClick={runWorkshop}
                disabled={loading || !hasInput}
                className="flex-1 h-8 max-lg:h-12 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-md text-[10px] font-black uppercase tracking-wide text-white transition-colors active:scale-[0.99]"
              >
                {loading
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing…</>
                  : <><Play className="w-3.5 h-3.5" /> Generate wildcards ({targetPaths.length} img + {textLineCount} text)</>}
              </button>
              <button
                onClick={openRefiner}
                disabled={!hasInput}
                className={`${BAR_BTN} ${BAR_BTN_GHOST} h-8 max-lg:h-12 disabled:opacity-40`}
                title="Refine exclusions from the tags present in the current input"
              >
                <ListFilter className="w-3.5 h-3.5" /> Refine
              </button>
            </div>
          </div>
        </section>

        {/* Right Rail: results */}
        <aside className={`shrink-0 min-h-0 flex-col bg-solid-nested overflow-hidden flex w-full max-lg:h-96 max-lg:border-t border-white/5 ${isResultsOpen ? 'lg:flex lg:w-[320px] lg:border-l' : 'lg:hidden'}`}>
          <WorkshopResults results={results} onCopy={copyToClipboard} onExport={handleExport} />
        </aside>
      </div>
    </ToolShell>

      {showRefiner && (
        <TagRefiner
            tagCounts={tagCounts}
            filter={filter}
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
    </>
  );
};
