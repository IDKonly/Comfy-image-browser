import { FolderOpen, Layers, Wand2, ArrowDownAZ, ArrowUpAZ, History, Clock, Dices, Settings } from "lucide-react";
import { SortMethod } from "../../App";

interface AppHeaderProps {
  batchMode: boolean;
  setBatchMode: (v: boolean) => void;
  setShowWildcards: (v: boolean) => void;
  recursive: boolean;
  setRecursive: (v: boolean) => void;
  sortMethod: SortMethod;
  handleSortChange: (m: SortMethod) => void;
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
  recursive,
  setRecursive,
  sortMethod,
  handleSortChange,
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
    <header className="flex items-center justify-between px-4 h-14 bg-neutral-900 border-b border-white/5 shrink-0 z-10 shadow-2xl">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black italic">CV</div>
          <h1 className="text-lg font-black tracking-tighter uppercase italic">ComfyView</h1>
        </div>
        
        <button 
          onClick={() => setBatchMode(!batchMode)} 
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all border ${batchMode ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]' : 'bg-neutral-800 border-neutral-700 text-neutral-400'}`}
        >
          <Layers className="w-3.5 h-3.5" />Batch Mode
        </button>
        
        <button 
          onClick={() => setShowWildcards(true)} 
          className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all border bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white hover:border-blue-500/50"
        >
          <Wand2 className="w-3.5 h-3.5" />Wildcard
        </button>

        <div className="flex items-center gap-2 bg-neutral-800/50 p-1 rounded-xl border border-white/5 ml-2">
          <button 
            onClick={() => setRecursive(!recursive)}
            title="Recursive Scan"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${recursive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            <Layers className="w-3.5 h-3.5" /> Recursive
          </button>
          <div className="w-px h-4 bg-white/5 mx-1" />
          {[
            { id: 'NameAsc', icon: ArrowDownAZ, label: 'A-Z' },
            { id: 'NameDesc', icon: ArrowUpAZ, label: 'Z-A' },
            { id: 'Newest', icon: History, label: 'Newest' },
            { id: 'Oldest', icon: Clock, label: 'Oldest' }
          ].map(m => (
            <button 
              key={m.id} 
              onClick={() => handleSortChange(m.id as SortMethod)}
              title={m.label}
              className={`p-1.5 rounded-lg transition-all ${sortMethod === m.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              <m.icon className="w-3.5 h-3.5" />
            </button>
          ))}
          <div className="w-px h-4 bg-white/5 mx-1" />
          <button 
            onClick={handleRandom}
            title={`Random Image (${shortcuts.random})`}
            className="p-1.5 rounded-lg transition-all text-neutral-500 hover:text-white hover:bg-white/5"
          >
            <Dices className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {images.length > 0 && (
          <div className="flex items-center gap-2 bg-neutral-800/50 p-1.5 rounded-xl border border-white/5">
            <button onClick={handleKeep} className="px-4 py-1.5 bg-neutral-900 hover:bg-green-600 rounded-lg text-[10px] font-bold uppercase">Keep</button>
            <button onClick={handleDelete} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors ${isTrashFolder ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-neutral-900 hover:bg-red-600'}`}>Trash</button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button 
              onClick={() => {
                setWorkshopTargetPaths(images.map(i => i.path));
                setShowWildcards(true);
              }} 
              className="px-3 py-1.5 bg-neutral-900 hover:bg-purple-600/40 border border-transparent hover:border-purple-500/20 rounded-lg text-[10px] font-bold text-purple-400 uppercase transition-all"
              title="Send all current images to Workshop"
            >
              <Wand2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-neutral-500 hover:text-white">
          <Settings className="w-5 h-5" />
        </button>
        <button 
          onClick={handleOpenFolder} 
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg active:scale-95"
        >
          <FolderOpen className="w-4 h-4" />Open Folder
        </button>
      </div>
    </header>
  );
};
