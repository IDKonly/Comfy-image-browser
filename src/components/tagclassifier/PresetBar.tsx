import { Settings2, Save, Trash2 } from "lucide-react";

interface PresetBarProps {
  activePreset: string;
  presets: string[];
  onLoad: (name: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

/** Preset selector + save/delete sub-bar for the pipeline rules sidebar. */
export const PresetBar = ({ activePreset, presets, onLoad, onSave, onDelete }: PresetBarProps) => (
  <div className="p-3 border-b border-white/5 bg-solid-base flex items-center justify-between shrink-0">
    <div className="flex items-center gap-2 flex-1 min-w-0 bg-neutral-950 px-2 py-1 rounded-xl border border-white/5 focus-within:border-blue-500/50 transition-all h-11">
      <Settings2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
      <select
        className="bg-transparent text-[10px] font-black uppercase text-neutral-250 outline-none cursor-pointer hover:text-white transition-colors w-full"
        value={activePreset}
        onChange={(e) => onLoad(e.target.value)}
        aria-label="Preset Configuration Selection"
      >
        <option value="default" className="bg-[#0c0b17] text-neutral-200">Default Config</option>
        {presets.map(p => <option key={p} value={p} className="bg-[#0c0b17] text-neutral-200">{p.toUpperCase()}</option>)}
      </select>
    </div>
    <div className="flex items-center gap-0.5 ml-2 shrink-0">
      <button
        onClick={onSave}
        title="Save Preset"
        className="w-11 h-11 flex items-center justify-center hover:bg-blue-500/20 rounded-xl text-blue-400 transition-all"
        aria-label="Save preset"
      >
        <Save className="w-4 h-4" />
      </button>
      {activePreset !== 'default' && (
        <button
          onClick={onDelete}
          title="Delete Preset"
          className="w-11 h-11 flex items-center justify-center hover:bg-red-500/20 rounded-xl text-red-400 transition-all"
          aria-label="Delete preset"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  </div>
);
