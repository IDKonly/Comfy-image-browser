import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Filter, ChevronDown } from "lucide-react";

interface FilterOptions {
  models: string[];
  samplers: string[];
}

interface FilterPanelProps {
  folderPath: string | null;
  onFilterChange: (filters: { model: string, sampler: string }) => void;
  onClose: () => void;
}

export const FilterPanel = ({ folderPath, onFilterChange, onClose }: FilterPanelProps) => {
  const [options, setOptions] = useState<FilterOptions>({ models: [], samplers: [] });
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedSampler, setSelectedSampler] = useState("");

  useEffect(() => {
    if (folderPath) {
      invoke("get_filter_options", { folder: folderPath })
        .then((res) => setOptions(res as FilterOptions))
        .catch(console.error);
    }
  }, [folderPath]);

  const handleApply = () => {
    onFilterChange({ model: selectedModel, sampler: selectedSampler });
  };

  const handleReset = () => {
    setSelectedModel("");
    setSelectedSampler("");
    onFilterChange({ model: "", sampler: "" });
  };

  return (
    <div className="w-64 bg-neutral-900 border-l border-white/5 flex flex-col h-full animate-in slide-in-from-right duration-300 shadow-2xl z-20">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-neutral-400">
          <Filter className="w-3.5 h-3.5" /> Filters
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-neutral-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* Model Filter */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Model</label>
          <div className="relative">
            <select 
              value={selectedModel} 
              onChange={(e) => { setSelectedModel(e.target.value); handleApply(); }}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-[11px] appearance-none focus:border-blue-500 focus:outline-none transition-colors text-neutral-300"
            >
              <option value="">All Models</option>
              {options.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
          </div>
        </div>

        {/* Sampler Filter */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Sampler</label>
          <div className="relative">
            <select 
              value={selectedSampler} 
              onChange={(e) => { setSelectedSampler(e.target.value); handleApply(); }}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-[11px] appearance-none focus:border-blue-500 focus:outline-none transition-colors text-neutral-300"
            >
              <option value="">All Samplers</option>
              {options.samplers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 pointer-events-none" />
          </div>
        </div>

        {/* Active Filters Summary (Optional visual aid) */}
        {(selectedModel || selectedSampler) && (
             <div className="p-3 bg-blue-900/20 border border-blue-500/20 rounded-xl">
                 <div className="text-[10px] font-bold text-blue-400 mb-2">Active Filters</div>
                 {selectedModel && <div className="text-[9px] text-blue-300/70 truncate">• {selectedModel}</div>}
                 {selectedSampler && <div className="text-[9px] text-blue-300/70 truncate">• {selectedSampler}</div>}
             </div>
        )}
      </div>

      <div className="p-4 border-t border-white/5 space-y-2">
         <button onClick={() => { handleApply(); }} className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-[10px] font-black uppercase text-white shadow-lg shadow-blue-900/20 transition-all active:scale-95 hidden">
            Apply Filters
        </button> 
        <button onClick={handleReset} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase text-neutral-400 hover:text-white transition-colors">
            Reset
        </button>
      </div>
    </div>
  );
};
