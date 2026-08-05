import { Settings2, Save, Trash2, Upload, Download } from "lucide-react";
import { ICON_BTN, ICON_BTN_DANGER } from "../ui/tokens";

interface ConfigBarProps {
  activePreset: string;
  presets: string[];
  onLoad: (name: string) => void;
  onSavePreset: () => void;
  onDeletePreset: () => void;
  onImportConfig: () => void;
  onExportConfig: () => void;
}

/**
 * Config controls for the modal header: preset selector + save/delete, and JSON
 * import/export. Replaces the old dedicated PresetBar row in the rules sidebar and the
 * footer's "Backup Config" button, both of which cost a full row for a handful of controls.
 */
export const ConfigBar = ({
  activePreset, presets, onLoad, onSavePreset, onDeletePreset, onImportConfig, onExportConfig,
}: ConfigBarProps) => (
  <div className="flex items-center gap-1 min-w-0">
    <div className="flex items-center gap-1 h-6 max-lg:h-11 px-1.5 bg-neutral-950 border border-white/10 rounded-md focus-within:border-blue-500/50 transition-colors min-w-0">
      <Settings2 className="w-3 h-3 text-blue-400 shrink-0" />
      <select
        className="bg-transparent text-[9.5px] font-black uppercase tracking-wide text-neutral-200 outline-none cursor-pointer hover:text-white transition-colors max-w-[8rem] truncate"
        value={activePreset}
        onChange={(e) => onLoad(e.target.value)}
        aria-label="Preset configuration"
      >
        <option value="default" className="bg-[#0c0b17] text-neutral-200">Default</option>
        {presets.map(p => <option key={p} value={p} className="bg-[#0c0b17] text-neutral-200">{p.toUpperCase()}</option>)}
      </select>
    </div>

    <button onClick={onSavePreset} className={ICON_BTN} title="Save current rules as a preset" aria-label="Save preset">
      <Save className="w-3.5 h-3.5" />
    </button>
    {activePreset !== 'default' && (
      <button onClick={onDeletePreset} className={ICON_BTN_DANGER} title={`Delete preset '${activePreset}'`} aria-label="Delete preset">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    )}

    <span className="w-px h-4 bg-white/10 mx-0.5 shrink-0" aria-hidden="true" />

    <button onClick={onImportConfig} className={ICON_BTN} title="Import rules from a JSON file" aria-label="Import configuration JSON">
      <Upload className="w-3.5 h-3.5" />
    </button>
    <button onClick={onExportConfig} className={ICON_BTN} title="Export rules to a JSON file" aria-label="Export configuration JSON">
      <Download className="w-3.5 h-3.5" />
    </button>
  </div>
);
