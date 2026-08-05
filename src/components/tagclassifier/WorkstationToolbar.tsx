import { Sparkles, ListFilter, RefreshCw, Play, ChevronLeft, ChevronRight, Plus, Trash2, Layers } from "lucide-react";
import { ICON_BTN, ICON_BTN_DANGER, BAR_BTN } from "../ui/tokens";
import { TagSizeControl } from "./TagSizeControl";

type ViewMode = 'single' | 'bulk' | 'library';

interface WorkstationToolbarProps {
  viewMode: ViewMode;
  isRunning: boolean;
  /** Line navigator state — rendered inline only in 'single' (Editor) mode. */
  currentIndex: number;
  lineCount: number;
  /** Scene register the current line falls into (null when no registers are defined). */
  registerName?: string | null;
  /** Tag chip font size in px, applied panel-wide via `--tag-font-size`. */
  tagSize: number;
  onTagSizeChange: (size: number) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onInsertLine: () => void;
  onDeleteLine: () => void;
  onImportDirect: () => void;
  onImportFiltered: () => void;
  onRunAnalysis: () => void;
}

const MODES: { key: ViewMode; label: string }[] = [
  { key: 'single', label: 'Editor' },
  { key: 'bulk', label: 'Source' },
  { key: 'library', label: 'Library' },
];

/**
 * Center-canvas toolbar: view-mode segmented control, the inline line navigator, and the
 * import/compile actions. The navigator used to be a separate 76px card inside the Editor
 * view; folding it in here removes that row without losing any control.
 */
export const WorkstationToolbar = ({
  viewMode, isRunning, currentIndex, lineCount, registerName, tagSize, onTagSizeChange,
  onViewModeChange, onPrev, onNext, onInsertLine, onDeleteLine,
  onImportDirect, onImportFiltered, onRunAnalysis,
}: WorkstationToolbarProps) => (
  <div className="min-h-[1.875rem] max-lg:min-h-[3.5rem] shrink-0 px-1.5 py-1 bg-solid-panel border-b border-white/5 flex flex-wrap items-center gap-x-2 gap-y-1">
    <div className="flex bg-neutral-950 border border-white/5 rounded-md p-0.5 shrink-0">
      {MODES.map(m => (
        <button
          key={m.key}
          onClick={() => onViewModeChange(m.key)}
          className={`h-5 max-lg:h-10 px-2.5 rounded flex items-center text-[9px] font-black uppercase tracking-wide transition-colors ${
            viewMode === m.key ? 'bg-solid-element text-white' : 'text-neutral-500 hover:text-neutral-200'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>

    {viewMode === 'single' && (
      <>
        <span className="w-px h-4 bg-white/10 shrink-0" aria-hidden="true" />
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onPrev} className={ICON_BTN} aria-label="Previous prompt"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <button onClick={onNext} className={ICON_BTN} aria-label="Next prompt"><ChevronRight className="w-3.5 h-3.5" /></button>
          <span className="px-1.5 font-mono text-[11px] font-black text-blue-400 tabular-nums whitespace-nowrap">
            #L-{String(currentIndex + 1).padStart(4, '0')}
            <span className="text-neutral-500 font-normal ml-1">/ {lineCount}</span>
          </span>
          <button onClick={onInsertLine} className={ICON_BTN} title="Insert prompt line" aria-label="Insert line"><Plus className="w-3.5 h-3.5" /></button>
          <button onClick={onDeleteLine} className={ICON_BTN_DANGER} title="Delete current prompt line" aria-label="Delete line"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
        {registerName && (
          <span
            className="flex items-center gap-1 h-5 px-1.5 rounded border border-purple-500/30 bg-purple-600/15 text-[9px] font-black uppercase tracking-wide text-purple-300 shrink-0"
            title="Scene register this prompt is assigned to — decides which output file it lands in"
          >
            <Layers className="w-3 h-3" /> {registerName}
          </span>
        )}
      </>
    )}

    <div className="flex-1" />
    <TagSizeControl size={tagSize} onChange={onTagSizeChange} />
    <div className="flex-1" />

    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={onImportDirect}
        disabled={isRunning}
        title="Direct Import — every indexed prompt in the active folder"
        className={`${BAR_BTN} bg-blue-600/10 hover:bg-blue-600/25 text-blue-400 border-blue-500/25 disabled:opacity-50`}
      >
        <Sparkles className="w-3.5 h-3.5" /> Folder
      </button>
      <button
        onClick={onImportFiltered}
        disabled={isRunning}
        title="Filtered Import — the images currently loaded in the workshop, through its filters"
        className={`${BAR_BTN} bg-indigo-600/10 hover:bg-indigo-600/25 text-indigo-400 border-indigo-500/25 disabled:opacity-50`}
      >
        <ListFilter className="w-3.5 h-3.5" /> Workshop
      </button>
      <button
        onClick={onRunAnalysis}
        disabled={isRunning}
        title="Compile every line through the pipeline"
        className={`${BAR_BTN} bg-blue-600 hover:bg-blue-500 text-white border-blue-500 disabled:opacity-50 active:scale-95`}
      >
        {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        Compile
      </button>
    </div>
  </div>
);
