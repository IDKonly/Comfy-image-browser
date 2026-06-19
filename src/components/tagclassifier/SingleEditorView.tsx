import { ChevronLeft, ChevronRight, Plus, Trash2, Terminal, RefreshCw, Sparkles, ArrowRight } from "lucide-react";

interface SingleEditorViewProps {
  lines: string[];
  currentIndex: number;
  /** Pre-classified result for the current line (computed by the backend classifier). */
  previewData: any[];
  onPrev: () => void;
  onNext: () => void;
  onInsertLine: () => void;
  onDeleteLine: () => void;
  onActiveLineChange: (value: string) => void;
}

/** "Editor" view: prompt navigator, active-line textarea, and live Flow Result preview. */
export const SingleEditorView = ({
  lines, currentIndex, previewData, onPrev, onNext, onInsertLine, onDeleteLine, onActiveLineChange,
}: SingleEditorViewProps) => (
  <div className="flex-1 flex flex-col gap-6 overflow-hidden animate-in slide-in-from-bottom-2 duration-500">
    {/* Editor Card Navigator */}
    <div className="flex items-center justify-between bg-solid-panel border border-white/5 p-4 rounded-3xl shadow-md shrink-0 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-6 min-w-max">
        <div className="flex gap-2">
          <button
            onClick={onPrev}
            className="w-11 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 border border-white/5 rounded-2xl transition-all shadow-inner"
            aria-label="Previous prompt"
          >
            <ChevronLeft className="w-6 h-6 text-neutral-200" />
          </button>
          <button
            onClick={onNext}
            className="w-11 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 border border-white/5 rounded-2xl transition-all shadow-inner"
            aria-label="Next prompt"
          >
            <ChevronRight className="w-6 h-6 text-neutral-200" />
          </button>
        </div>
        <div>
          <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-0.5">Focus Mode</span>
          <span className="text-base font-mono font-black text-blue-400">#L-{String(currentIndex + 1).padStart(4, '0')} <span className="text-neutral-400 font-normal ml-2">/ {lines.length}</span></span>
        </div>
      </div>
      <div className="flex gap-2 ml-4 shrink-0">
        <button
          onClick={onInsertLine}
          className="w-11 h-11 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 hover:text-white rounded-2xl border border-white/5 text-neutral-300 transition-all"
          title="Insert new prompt line"
          aria-label="Insert line"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onDeleteLine}
          className="w-11 h-11 flex items-center justify-center bg-[#2d1217] hover:bg-[#3d1820] text-red-400 rounded-2xl border border-red-500/20 transition-all"
          title="Delete current prompt line"
          aria-label="Delete line"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>

    {/* Edit Textarea */}
    <div className="flex-[3] flex flex-col gap-3 min-h-0">
      <label className="text-xs font-extrabold uppercase text-neutral-300 tracking-wider px-3" htmlFor="prompt-textarea">Active Data Stream</label>
      <div className="flex-1 relative group min-h-0">
        <textarea
          id="prompt-textarea"
          className="w-full h-full bg-neutral-950 border border-white/5 focus:border-blue-500/50 rounded-3xl p-6 sm:p-8 text-sm sm:text-base font-mono text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500/20 resize-none shadow-inner leading-relaxed scrollbar-thin transition-all"
          value={lines[currentIndex] || ""}
          onChange={e => onActiveLineChange(e.target.value)}
          placeholder="Input dataset tag lists separated by commas..."
        />
        <div className="absolute right-6 bottom-6 opacity-45 group-hover:opacity-85 transition-opacity pointer-events-none">
          <Terminal className="w-8 h-8 text-blue-500" />
        </div>
      </div>
    </div>

    {/* Live Analysis Engine */}
    <div className="flex-[2] min-h-[180px] bg-solid-panel border border-white/5 rounded-3xl p-5 flex flex-col gap-4 shadow-inner shrink-0 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 text-neutral-350">
          <RefreshCw className="w-4 h-4 text-neutral-500 animate-spin-slow" />
          <span className="text-xs font-black uppercase tracking-wider">Flow Result</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
          <span className="text-[10px] font-black text-blue-450 uppercase tracking-widest flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-blue-400 animate-pulse" /> Live Analysis Engine</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-4 pr-3 scrollbar-thin text-white">
        {previewData.map((sub: any) => (
          <div key={sub.id} className="flex items-start gap-4 group">
            <div className="w-32 shrink-0 flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase px-3 py-2 rounded-xl w-full text-center border transition-all truncate ${sub.id === 0 ? 'text-neutral-300 border-white/5 bg-solid-nested' : 'text-blue-400 border-blue-500/20 bg-blue-955/20'}`}>{sub.name}</span>
              <ArrowRight className="w-4 h-4 text-neutral-500" />
            </div>
            <div className="flex-1 flex flex-wrap gap-2 pt-1.5">
              {sub.matches.length > 0 ? sub.matches.map((m: string, i: number) => (
                <span key={i} className="px-2.5 py-1.5 bg-neutral-955 border border-white/5 rounded-lg text-xs font-mono text-neutral-200 shadow-inner hover:border-blue-500/40 transition-all flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  {m}
                </span>
              )) : (
                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider py-1.5 select-none">No Match</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
