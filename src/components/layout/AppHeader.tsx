import { FolderOpen, Layers, Wand2, Dices, Settings, Database, LayoutGrid } from "lucide-react";

interface AppHeaderProps {
  batchMode: boolean;
  setBatchMode: (v: boolean) => void;
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
  batchMode,
  setBatchMode,
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
      <div className="flex items-center justify-between px-4 h-12 border-b border-black/20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-[10px] font-black italic shadow-[0_0_10px_rgba(37,99,235,0.4)]">CV</div>
            <h1 className="text-xs font-black tracking-widest uppercase italic text-neutral-200">ComfyView</h1>
          </div>
          
          <div className="w-px h-4 bg-white/10 mx-2" />

          <div className="flex items-center gap-2">
            <button 
              onClick={handleOpenFolder} 
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 rounded-lg text-[9px] font-black uppercase transition-all text-blue-400"
            >
              <FolderOpen className="w-3 h-3" /> Open Folder
            </button>
            <button 
              onClick={() => setRecursive(!recursive)}
              title="Recursive Scan"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase transition-all ${recursive ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.1)]' : 'bg-neutral-950/50 border-white/5 text-neutral-500 hover:text-neutral-300'}`}
            >
              <Layers className="w-3 h-3" /> Recursive
            </button>
          </div>
        </div>

        <button onClick={() => setShowSettings(true)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-neutral-500 hover:text-white" title="Settings">
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Row: App Navigation & Actions */}
      <div className="flex items-center justify-between px-4 h-12 bg-neutral-950/30">
        {/* App Segmented Control */}
        <div className="flex p-1 bg-neutral-950 border border-white/5 rounded-xl shadow-inner">
          <button 
            onClick={() => setBatchMode(false)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${!batchMode ? 'bg-neutral-800 text-white shadow-sm border border-white/5' : 'text-neutral-500 hover:text-neutral-300 border border-transparent'}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Single
          </button>
          <button 
            onClick={() => setBatchMode(true)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${batchMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 border border-blue-500/30' : 'text-neutral-500 hover:text-neutral-300 border border-transparent'}`}
          >
            <Layers className="w-3.5 h-3.5" /> Batch
          </button>
          <div className="w-px h-3 bg-white/10 mx-2 my-auto" />
          <button 
            onClick={() => setShowWildcards(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-transparent text-[9px] font-bold uppercase transition-all text-neutral-500 hover:bg-neutral-800 hover:border-white/5 hover:text-white"
          >
            <Wand2 className="w-3.5 h-3.5 text-purple-500/70" /> Workshop
          </button>
          <button 
            onClick={() => setShowTagClassifier(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-transparent text-[9px] font-bold uppercase transition-all text-neutral-500 hover:bg-neutral-800 hover:border-white/5 hover:text-white"
          >
            <Database className="w-3.5 h-3.5 text-indigo-500/70" /> Classifier
          </button>
        </div>

        {/* Contextual Actions */}
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRandom}
            title={`Random Image (${shortcuts.random})`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border border-white/5 hover:bg-neutral-800 rounded-lg text-[9px] font-bold uppercase transition-all text-neutral-400 hover:text-white shadow-sm"
          >
            <Dices className="w-3 h-3" /> Random
          </button>

          {images.length > 0 && (
            <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-white/5 shadow-inner">
              <button 
                onClick={handleKeep} 
                className="flex items-center gap-1.5 px-4 py-1 bg-neutral-900 border border-transparent hover:border-green-500/30 hover:bg-green-500/10 rounded-lg text-[9px] font-bold uppercase text-green-500 transition-all shadow-sm"
              >
                Keep
              </button>
              <button 
                onClick={handleDelete} 
                className={`flex items-center gap-1.5 px-4 py-1 rounded-lg text-[9px] border border-transparent font-bold uppercase transition-all shadow-sm ${isTrashFolder ? 'bg-red-600/20 text-red-500 border-red-500/30' : 'bg-neutral-900 text-red-500/70 hover:bg-red-500/10 hover:border-red-500/30'}`}
              >
                Trash
              </button>
              <div className="w-px h-3 bg-white/10 mx-1 my-auto" />
              <button 
                onClick={() => {
                  setWorkshopTargetPaths(images.map(i => i.path));
                  setShowWildcards(true);
                }} 
                className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900 border border-transparent hover:bg-purple-600/20 hover:border-purple-500/30 rounded-lg text-[9px] font-bold text-purple-400 uppercase transition-all shadow-sm"
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
