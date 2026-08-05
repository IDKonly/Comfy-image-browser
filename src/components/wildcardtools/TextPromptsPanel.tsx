interface TextPromptsPanelProps {
  value: string;
  onChange: (v: string) => void;
}

/** Free-text prompt editor, one prompt per line. Import/clear live in the InputRail tab bar. */
export const TextPromptsPanel = ({ value, onChange }: TextPromptsPanelProps) => (
  <div className="flex-1 min-h-0 p-1">
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label="Text prompts, one per line"
      className="w-full h-full bg-neutral-950 border border-white/5 focus:border-blue-500/50 rounded-md px-2 py-1.5 text-[10.5px] font-mono text-neutral-200 outline-none resize-none scrollbar-thin leading-relaxed transition-colors"
      placeholder={"1girl, solo, baelz…\n1girl, solo, marine…"}
    />
  </div>
);
