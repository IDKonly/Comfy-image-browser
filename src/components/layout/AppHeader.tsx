import { FolderOpen, Layers, Wand2, Dices, Settings, Database, LayoutGrid, Columns, Square } from "lucide-react";
import { ViewMode } from "../../store/useAppStore";

interface AppHeaderProps {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  setShowWildcards: (v: boolean) => void;
  setShowTagClassifier: (v: boolean) => void;
  recursive: boolean;
  setRecursive: (v: boolean) => void;
  handleRandom: () => void;
  images: any[];
  handleKeep: () => void;
  handleDelete: () => void;
  isTrashFolder: boolean;
  setShowSettings: (v: boolean) => void;
  handleOpenFolder: () => void;
  shortcuts: any;
  setWorkshopTargetPaths: (paths: string[]) => void;
}

export const AppHeader = ({
  viewMode,
  setViewMode,
  setShowWildcards,
  setShowTagClassifier,
  recursive,
  setRecursive,
  handleRandom,
  images,
  handleKeep,
  handleDelete,
  isTrashFolder,
  setShowSettings,
  handleOpenFolder,
  shortcuts,
  setWorkshopTargetPaths
}: AppHeaderProps) => {
  return (
    <header className="flex flex-col bg-neutral-900 border-b border-white/5 shrink-0 z-10 shadow-2xl">
      {/* Top Row: Identity & Global Data */}
      <div className="flex flex-wrap md:flex-nowrap items-center justify-between px-4 min-h-[3.5rem] h-auto py-2 md:py-0 border-b border-black/20 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-[10px] font-black italic shadow-[0_0_10px_rgba(37,99,235,0.4)]">CV</div>
            <h1 className="text-xs font-black tracking-widest uppercase italic text-neutral-200">ComfyView</h1>
          </div>
          
          <div className="w-px h-4 bg-white/10 mx-2" />
 
          <div className="flex items-center gap-2">
            <button 
              onClick={handleOpenFolder} 
              className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-[#1a2333] hover:bg-[#25354c] border border-blue-500/20 rounded-lg text-[9px] font-black uppercase transition-all text-blue-400 shrink-0"
            >
              <FolderOpen className="w-3 h-3" /> Open Folder
            </button>
            <button 
              onClick={() => setRecursive(!recursive)}
              title="Recursive Scan"
              className={`flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg border text-[9px] font-black uppercase transition-all shrink-0 ${recursive ? 'bg-[#1a2333] border-blue-500/50 text-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.1)]' : 'bg-[#161616] border-white/5 text-neutral-400 hover:text-neutral-200'}`}
            >
              <Layers className="w-3 h-3" /> Recursive
            </button>
          </div>
        </div>
 
        <button onClick={() => setShowSettings(true)} className="w-11 h-11 flex items-center justify-center hover:bg-white/5 rounded-lg transition-colors text-neutral-400 hover:text-white shrink-0" title="Settings">
          <Settings className="w-4 h-4" />
        </button>
      </div>
 
      {/* Bottom Row: App Navigation & Actions */}
      <div className="flex flex-col md:flex-row items-center justify-between px-4 min-h-[3.5rem] h-auto py-2 md:py-0 bg-neutral-950/30 gap-3 w-full overflow-hidden">
        {/* App Segmented Control */}
        <div className="flex p-1 bg-neutral-950 border border-white/5 rounded-xl shadow-inner min-h-[54px] items-center overflow-x-auto max-w-full no-scrollbar shrink-0">
          <button 
            onClick={() => setViewMode('Single')}
            className={`flex items-center gap-1.5 px-4 py-2 min-h-[44px] h-11 rounded-lg text-[9px] font-bold uppercase transition-all shrink-0 ${viewMode === 'Single' ? 'bg-solid-active text-white shadow-sm border border-white/5' : 'text-neutral-400 hover:text-neutral-200 border border-transparent'}`}
          >
            <Square className="w-3.5 h-3.5" /> Single
          </button>
          <button 
            onClick={() => setViewMode('Batch')}
            className={`flex items-center gap-1.5 px-4 py-2 min-h-[44px] h-11 rounded-lg text-[9px] font-bold uppercase transition-all shrink-0 ${viewMode === 'Batch' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 border border-blue-500/30' : 'text-neutral-400 hover:text-neutral-200 border border-transparent'}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Batch
          </button>
          <button 
            onClick={() => setViewMode('Peaking')}
            className={`flex items-center gap-1.5 px-4 py-2 min-h-[44px] h-11 rounded-lg text-[9px] font-bold uppercase transition-all shrink-0 ${viewMode === 'Peaking' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 border border-blue-500/30' : 'text-neutral-400 hover:text-neutral-200 border border-transparent'}`}
          >
            <Columns className="w-3.5 h-3.5" /> Peaking
          </button>
          
          <div className="w-px h-3 bg-white/10 mx-2 my-auto shrink-0" />
          <button 
            onClick={() => setShowWildcards(true)}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] h-11 rounded-lg border border-transparent text-[9px] font-bold uppercase transition-all shrink-0 text-neutral-400 hover:bg-neutral-800 hover:border-white/5 hover:text-white"
          >
            <Wand2 className="w-3.5 h-3.5 text-purple-400" /> Workshop
          </button>
          <button 
            onClick={() => setShowTagClassifier(true)}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] h-11 rounded-lg border border-transparent text-[9px] font-bold uppercase transition-all shrink-0 text-neutral-400 hover:bg-neutral-800 hover:border-white/5 hover:text-white"
          >
            <Database className="w-3.5 h-3.5 text-indigo-400" /> Classifier
          </button>
        </div>
 
        {/* Contextual Actions */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-center">
          <button 
            onClick={handleRandom}
            title={`Random Image (${shortcuts.random})`}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-[#1a1a1a] border border-white/5 hover:bg-neutral-800 rounded-lg text-[9px] font-bold uppercase transition-all text-neutral-300 hover:text-white shadow-sm shrink-0"
          >
            <Dices className="w-3 h-3" /> Random
          </button>
 
          {images.length > 0 && (
            <div className="flex items-center gap-1 bg-neutral-950 p-1.5 rounded-xl border border-white/5 shadow-inner min-h-[48px] shrink-0">
              <button 
                onClick={handleKeep} 
                className="flex items-center gap-1.5 px-4 py-2 min-h-[38px] bg-[#142319] border border-transparent hover:border-green-500/30 hover:bg-[#1a3322] rounded-lg text-[9px] font-bold uppercase text-green-400 transition-all shadow-sm shrink-0"
              >
                Keep
              </button>
              <button 
                onClick={handleDelete} 
                className={`flex items-center gap-1.5 px-4 py-2 min-h-[38px] rounded-lg text-[9px] border border-transparent font-bold uppercase transition-all shadow-sm shrink-0 ${isTrashFolder ? 'bg-red-900/40 text-red-400 border-red-500/30' : 'bg-[#2a0e0e] text-red-400 hover:bg-[#3d1414] hover:border-red-500/30'}`}
              >
                Trash
              </button>
              <div className="w-px h-3 bg-white/10 mx-1 my-auto shrink-0" />
              <button 
                onClick={() => {
                  setWorkshopTargetPaths(images.map(i => i.path));
                  setShowWildcards(true);
                }} 
                className="flex items-center gap-1.5 px-4 py-2 min-h-[38px] bg-[#24142a] border border-transparent hover:bg-[#331a3d] hover:border-purple-500/30 rounded-lg text-[9px] font-bold text-purple-400 uppercase transition-all shadow-sm shrink-0"
                title="Send all current images to Workshop"
              >
                <Wand2 className="w-3 h-3" /> All
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
