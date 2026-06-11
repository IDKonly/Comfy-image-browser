import { Sparkles, ListFilter, Upload, RefreshCw, Play } from "lucide-react";

type ViewMode = 'single' | 'bulk' | 'library';

interface WorkstationToolbarProps {
  viewMode: ViewMode;
  isRunning: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onImportDirect: () => void;
  onImportFiltered: () => void;
  onImportConfig: () => void;
  onRunAnalysis: () => void;
}

/** Center-canvas toolbar: view-mode segmented control + import/compile actions. */
export const WorkstationToolbar = ({ viewMode, isRunning, onViewModeChange, onImportDirect, onImportFiltered, onImportConfig, onRunAnalysis }: WorkstationToolbarProps) => (
  <div className="p-3 border-b border-white/5 bg-solid-panel flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-md">
    {/* View Modes Segments */}
    <div className="flex bg-solid-nested p-1 rounded-2xl border border-white/5 shrink-0 min-h-[50px] items-center shadow-inner">
      <button onClick={() => onViewModeChange('single')} className={`px-3 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'single' ? 'bg-solid-element text-white shadow-md' : 'text-neutral-400 hover:text-white'}`}>Editor</button>
      <button onClick={() => onViewModeChange('bulk')} className={`px-3 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'bulk' ? 'bg-solid-element text-white shadow-md' : 'text-neutral-400 hover:text-white'}`}>Source</button>
      <button onClick={() => onViewModeChange('library')} className={`px-3 py-2 min-h-[44px] flex items-center justify-center rounded-xl text-[10px] font-black uppercase transition-all ${viewMode === 'library' ? 'bg-solid-element text-white shadow-md' : 'text-neutral-400 hover:text-white'}`}>Library</button>
    </div>

    {/* Workflow Actions */}
    <div className="flex gap-2 shrink-0 items-center">
      <button onClick={onImportDirect} disabled={isRunning} title="Direct Import (Full Folder)" className="w-11 h-11 flex items-center justify-center bg-blue-600/10 hover:bg-blue-600/25 text-blue-400 rounded-2xl border border-blue-500/20 transition-all disabled:opacity-50" aria-label="Direct Folder Import"><Sparkles className="w-5 h-5" /></button>
      <button onClick={onImportFiltered} disabled={isRunning} title="Filtered Import (Current Workshop)" className="w-11 h-11 flex items-center justify-center bg-indigo-600/10 hover:bg-indigo-600/25 text-indigo-400 rounded-2xl border border-indigo-500/20 transition-all disabled:opacity-50" aria-label="Filtered Workshop Import"><ListFilter className="w-5 h-5" /></button>
      <button onClick={onImportConfig} title="Import JSON config" className="w-11 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 rounded-2xl text-neutral-300 hover:text-white transition-all border border-white/5" aria-label="Import Configuration"><Upload className="w-5 h-5" /></button>
      <button
        onClick={onRunAnalysis}
        disabled={isRunning}
        className="bg-blue-600 hover:bg-blue-500 text-white px-4 min-h-[44px] flex items-center justify-center rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95 shadow-lg gap-1.5 shrink-0"
        title="Compile dataset"
      >
        {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
        Compile
      </button>
    </div>
  </div>
);
