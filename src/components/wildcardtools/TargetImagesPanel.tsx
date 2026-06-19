import { LayoutGrid, FilePlus, FolderPlus, Trash2 } from "lucide-react";
// @ts-ignore
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { basename } from "./utils";

interface TargetImagesPanelProps {
  paths: string[];
  onClear: () => void;
  onImportFromViewer: () => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onRemove: (path: string) => void;
}

/** Left sidebar (top): target image list with import controls and a virtualized list. */
export const TargetImagesPanel = ({ paths, onClear, onImportFromViewer, onAddFiles, onAddFolder, onRemove }: TargetImagesPanelProps) => (
  <div className="h-[250px] lg:h-1/2 flex flex-col border-b border-white/5 overflow-hidden shrink-0">
      <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-solid-panel">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300">Target Images ({paths.length})</span>
          <button onClick={onClear} className="text-[9px] font-black uppercase text-red-500 hover:text-red-400 transition-colors min-h-[44px] h-11 px-3 flex items-center justify-center">Clear</button>
      </div>

      <div className="p-3 grid grid-cols-1 gap-2 border-b border-white/5 bg-solid-nested shrink-0">
          <button onClick={onImportFromViewer} className="flex items-center justify-center gap-2 py-2.5 min-h-[44px] bg-[#1a2333] hover:bg-[#25354c] border border-blue-500/20 rounded-lg text-[9px] font-black uppercase transition-all text-blue-400">
              <LayoutGrid className="w-3.5 h-3.5" /> Import from Viewer
          </button>
          <div className="grid grid-cols-2 gap-2">
              <button onClick={onAddFiles} className="flex items-center justify-center gap-2 py-2.5 min-h-[44px] bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase transition-all">
                  <FilePlus className="w-3.5 h-3.5" /> Files
              </button>
              <button onClick={onAddFolder} className="flex items-center justify-center gap-2 py-2.5 min-h-[44px] bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase transition-all">
                  <FolderPlus className="w-3.5 h-3.5" /> Folder
              </button>
          </div>
      </div>

      <div className="flex-1 p-2">
          {paths.length > 0 ? (
              <AutoSizer>
                  {({ height, width }) => (
                      <List
                          className="scrollbar-thin"
                          height={height}
                          itemCount={paths.length}
                          itemSize={36}
                          width={width}
                      >
                          {({ index, style }: any) => {
                              const p = paths[index];
                              return (
                                  <div style={style} className="pr-2 pb-1">
                                      <div className="group flex items-center justify-between p-1.5 bg-neutral-800/50 hover:bg-neutral-800 rounded border border-transparent hover:border-white/5 transition-all h-full">
                                          <span className="text-[9px] text-neutral-400 truncate flex-1 pr-2">{basename(p)}</span>
                                          <button onClick={() => onRemove(p)} className="opacity-0 group-hover:opacity-100 w-11 h-11 flex items-center justify-center hover:bg-red-900/20 rounded text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                      </div>
                                  </div>
                              );
                          }}
                      </List>
                  )}
              </AutoSizer>
          ) : (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center bg-solid-nested rounded-2xl text-neutral-200">
                  <p className="text-[8px] font-bold uppercase tracking-wider leading-relaxed">No images</p>
              </div>
          )}
      </div>
  </div>
);
