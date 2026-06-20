import { Info } from "lucide-react";
import { FilterState } from "../../store/useAppStore";
import { splitCommaTrimNonEmpty } from "./utils";

interface WorkshopSettingsProps {
  threshold: number;
  onThresholdChange: (n: number) => void;
  filter: FilterState;
  onFilterChange: (next: FilterState) => void;
}

/** Similarity/word/tag/depth controls + Simple/Mix toggles + advanced Mix sliders. */
export const WorkshopSettings = ({ threshold, onThresholdChange, filter, onFilterChange }: WorkshopSettingsProps) => (
  <div className="space-y-3">
      {/* Main Settings Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        {!filter.simple_mode && (
          <>
            <div className="col-span-1 bg-neutral-950 p-3 rounded-2xl border border-white/5 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Similarity</span>
                    <span className="text-[11px] font-mono text-blue-400 font-bold">
                        {filter.preserve_order ? '1.00' : threshold.toFixed(2)}
                        {filter.preserve_order && <span className="text-[9px] text-neutral-600 ml-1">(locked)</span>}
                    </span>
                </div>
                <input
                    type="range" min="0" max="1" step="0.05"
                    value={filter.preserve_order ? 1 : threshold}
                    onChange={e => { if (!filter.preserve_order) onThresholdChange(parseFloat(e.target.value)); }}
                    disabled={filter.preserve_order}
                    aria-label="Similarity Threshold"
                    className={`w-full accent-blue-600 ${filter.preserve_order ? 'opacity-40 cursor-not-allowed' : ''}`}
                />
            </div>
            <div className="bg-neutral-950 p-3 rounded-2xl border border-white/5 flex flex-col justify-center">
                <label className="text-[8px] font-black uppercase text-neutral-400 mb-1 block tracking-widest">Max Words/Tag</label>
                <input type="number" value={filter.max_words} onChange={e => onFilterChange({...filter, max_words: parseInt(e.target.value)})} aria-label="Max Words Per Tag" className="bg-transparent text-[11px] font-bold text-neutral-300 w-full focus:outline-none" />
            </div>
            <div className="bg-neutral-950 p-3 rounded-2xl border border-white/5 flex flex-col justify-center">
                <label className="text-[8px] font-black uppercase text-neutral-400 mb-1 block tracking-widest">Min Tags/Group</label>
                <input type="number" value={filter.min_tags} onChange={e => onFilterChange({...filter, min_tags: parseInt(e.target.value)})} aria-label="Min Tags Per Group" className="bg-transparent text-[11px] font-bold text-neutral-300 w-full focus:outline-none" />
            </div>
            <div className="bg-neutral-950 p-3 rounded-2xl border border-white/5 flex flex-col justify-center relative group">
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[8px] font-black uppercase text-neutral-400 block tracking-widest">Max Depth</label>
                    <Info className="w-2.5 h-2.5 text-neutral-700 cursor-help" />
                </div>
                <input type="number" value={filter.max_depth} onChange={e => onFilterChange({...filter, max_depth: parseInt(e.target.value)})} aria-label="Max Recursive Depth" className="bg-transparent text-[11px] font-bold text-neutral-300 w-full focus:outline-none" />
                <div className="absolute left-0 bottom-full mb-2 w-48 p-2 bg-neutral-900 border border-white/10 rounded-lg text-[8px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-2xl leading-tight">
                    Limits recursive pattern matching to prevent errors. Lower values result in flatter, simpler wildcards.
                </div>
            </div>
          </>
        )}
        {filter.simple_mode && (
          <div className="col-span-1 sm:col-span-2 md:col-span-4 bg-amber-600/5 border border-amber-500/20 rounded-2xl p-4 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase text-amber-500 tracking-wider">Simple Exclusions</span>
              <span className="text-[8px] text-amber-600 font-bold uppercase">Only basic string removal logic is applied</span>
            </div>
            <textarea
              value={filter.simple_exclusions.join(', ')}
              onChange={e => onFilterChange({...filter, simple_exclusions: splitCommaTrimNonEmpty(e.target.value)})}
              className="bg-neutral-950/50 border border-white/5 rounded-xl p-2 text-[10px] font-mono text-neutral-300 h-12 focus:outline-none focus:border-amber-500/30 resize-none scrollbar-thin"
              placeholder="e.g. masterpiece, best quality, solo, rating:safe..."
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
              onClick={() => onFilterChange({...filter, simple_mode: !filter.simple_mode})}
              className={`flex-1 py-1 rounded-xl border flex flex-col items-center justify-center transition-all min-h-[44px] ${filter.simple_mode ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-600/20' : 'bg-neutral-950 border-white/5 text-neutral-400 hover:text-neutral-200'}`}
          >
              <label className={`text-[8px] font-black uppercase mb-0.5 block tracking-widest cursor-pointer ${filter.simple_mode ? 'text-amber-100' : 'text-neutral-400'}`}>Simple Mode</label>
              <span className="text-[9px] font-black uppercase">{filter.simple_mode ? 'Enabled' : 'Disabled'}</span>
          </button>
          <button
              onClick={() => onFilterChange({...filter, mix_mode: !filter.mix_mode})}
              className={`flex-1 py-1 rounded-xl border flex flex-col items-center justify-center transition-all min-h-[44px] ${filter.mix_mode ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-neutral-950 border-white/5 text-neutral-400 hover:text-neutral-200'}`}
          >
              <label className={`text-[8px] font-black uppercase mb-0.5 block tracking-widest cursor-pointer ${filter.mix_mode ? 'text-indigo-100' : 'text-neutral-400'}`}>Mix Mode</label>
              <span className="text-[9px] font-black uppercase">{filter.mix_mode ? 'Enabled' : 'Disabled'}</span>
          </button>
          <button
              onClick={() => onFilterChange({...filter, preserve_order: !filter.preserve_order})}
              className={`flex-1 py-1 rounded-xl border flex flex-col items-center justify-center transition-all min-h-[44px] ${filter.preserve_order ? 'bg-emerald-700 border-emerald-500 text-white shadow-lg shadow-emerald-600/20' : 'bg-neutral-950 border-white/5 text-neutral-400 hover:text-neutral-200'}`}
          >
              <label className={`text-[8px] font-black uppercase mb-0.5 block tracking-widest cursor-pointer ${filter.preserve_order ? 'text-emerald-100' : 'text-neutral-400'}`}>Preserve Order</label>
              <span className="text-[9px] font-black uppercase">{filter.preserve_order ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Advanced Mix Mode Settings Row */}
      {!filter.simple_mode && filter.mix_mode && (
          <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-2xl grid grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-300">
              <div className="space-y-2">
                  <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Mix Depth (Start)</span>
                      <span className="text-[10px] font-mono text-indigo-400 font-bold">{filter.mix_depth}</span>
                  </div>
                  <input
                      type="range" min="0" max="10" step="1"
                      value={filter.mix_depth}
                      onChange={e => onFilterChange({...filter, mix_depth: parseInt(e.target.value)})}
                      className="w-full accent-indigo-600"
                  />
              </div>
              <div className="space-y-2">
                  <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Min Branches</span>
                      <span className="text-[10px] font-mono text-indigo-400 font-bold">{filter.mix_tandem_min_branches}</span>
                  </div>
                  <input
                      type="range" min="1" max="10" step="1"
                      value={filter.mix_tandem_min_branches}
                      onChange={e => onFilterChange({...filter, mix_tandem_min_branches: parseInt(e.target.value)})}
                      className="w-full accent-indigo-600"
                  />
              </div>
              <div className="space-y-2">
                  <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Tandem Ratio</span>
                      <span className="text-[10px] font-mono text-indigo-400 font-bold">{((filter.mix_tandem_ratio || 0.51) * 100).toFixed(0)}%</span>
                  </div>
                  <input
                      type="range" min="0.1" max="1.0" step="0.01"
                      value={filter.mix_tandem_ratio}
                      onChange={e => onFilterChange({...filter, mix_tandem_ratio: parseFloat(e.target.value)})}
                      className="w-full accent-indigo-600"
                  />
              </div>
          </div>
      )}
  </div>
);
