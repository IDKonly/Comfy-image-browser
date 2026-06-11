interface TextPromptsPanelProps {
  value: string;
  onChange: (v: string) => void;
  onImport: () => void;
  onClear: () => void;
}

/** Left sidebar (bottom): free-text prompt editor with import/clear. */
export const TextPromptsPanel = ({ value, onChange, onImport, onClear }: TextPromptsPanelProps) => (
  <div className="h-[200px] lg:h-1/2 flex flex-col overflow-hidden bg-solid-base shrink-0">
      <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-solid-panel">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300">Text Prompts</span>
          <div className="flex gap-2">
              <button onClick={onImport} className="text-[9px] font-black uppercase text-blue-500 hover:text-blue-400 transition-colors min-h-[44px] h-11 px-3 flex items-center justify-center">Import</button>
              <button onClick={onClear} className="text-[9px] font-black uppercase text-red-500 hover:text-red-400 transition-colors min-h-[44px] h-11 px-3 flex items-center justify-center">Clear</button>
          </div>
      </div>
      <div className="flex-1 p-3">
          <textarea
              value={value}
              onChange={e => onChange(e.target.value)}
              className="w-full h-full bg-solid-base border border-white/5 rounded-xl p-3 text-[10px] font-mono focus:outline-none focus:border-blue-500/50 resize-none scrollbar-thin"
              placeholder="1girl, solo, baelz...&#10;1girl, solo, marine..."
          />
      </div>
  </div>
);
