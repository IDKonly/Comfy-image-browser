import { X, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { Register } from "./types";
import { TagInput } from "../ui/TagInput";
import { ICON_BTN, ICON_BTN_DANGER, HOVER_TOOLS, LIST_CARD } from "../ui/tokens";

interface RegisterEditorProps {
  registers: Register[];
  uniqueTags: string[];
  onAdd: () => void;
  onAddDefaults: () => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onIncludeChange: (id: number, tags: string[]) => void;
  onExcludeChange: (id: number, tags: string[]) => void;
  onToggleFallback: (id: number) => void;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
}

/**
 * "Scene Registers" list: a whole-line partition axis evaluated top-to-bottom as a
 * priority waterfall. Order matters (↑/↓); the fallback register catches everything
 * unmatched and should sit last.
 *
 * Renders list content only; RulesRail owns the tab header, scroll container and add button.
 */
export const RegisterEditor = ({
  registers, uniqueTags, onAdd, onAddDefaults, onRename, onDelete,
  onIncludeChange, onExcludeChange, onToggleFallback, onMoveUp, onMoveDown,
}: RegisterEditorProps) => {
  if (registers.length === 0) {
    return (
      <div className="px-1 py-2">
        <p className="text-[10px] text-neutral-500 leading-relaxed">
          No registers — output is split by SFW/NSFW mode instead. Registers partition prompts
          by scene (explicit / exposure / daily), saved as
          <span className="text-neutral-400 font-mono"> &lt;date&gt;_&lt;register&gt;_&lt;group&gt;.txt</span>.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <button onClick={onAddDefaults} className="flex items-center gap-1 text-purple-300 hover:text-purple-200 font-black uppercase tracking-wide text-[9px]">
            <Sparkles className="w-3 h-3" /> Add defaults
          </button>
          <button onClick={onAdd} className="text-neutral-400 hover:text-white font-black uppercase tracking-wide text-[9px]">
            + Blank
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {registers.map((reg, idx) => (
        <div key={reg.id} className={`group ${LIST_CARD} hover:border-white/10`}>
          <div className="flex items-center gap-1">
            <span
              className="w-4 h-4 max-lg:w-7 max-lg:h-7 shrink-0 rounded bg-purple-600/25 text-purple-300 text-[9px] font-black flex items-center justify-center"
              title="Priority — evaluated top to bottom"
            >
              {idx + 1}
            </span>
            <input
              className="flex-1 min-w-0 bg-transparent text-[10.5px] font-black text-purple-300 lowercase focus:outline-none border-b border-transparent focus:border-purple-500/50 transition-colors"
              value={reg.name}
              onChange={e => onRename(reg.id, e.target.value)}
              aria-label="Register name (used in output filenames)"
            />

            <label
              className="flex items-center gap-1 shrink-0 cursor-pointer px-1 max-lg:py-2"
              title="Fallback — catches every line no other register matched. Keywords are ignored."
            >
              <input
                type="checkbox"
                checked={!!reg.isFallback}
                onChange={() => onToggleFallback(reg.id)}
                className="accent-purple-500 w-3 h-3"
              />
              <span className={`text-[9px] font-black uppercase tracking-wide ${reg.isFallback ? 'text-purple-300' : 'text-neutral-500'}`}>
                Fallback
              </span>
            </label>

            <div className={HOVER_TOOLS}>
              <button onClick={() => onMoveUp(reg.id)} className={ICON_BTN} title="Higher priority" aria-label={`Raise priority of ${reg.name}`}><ArrowUp className="w-3 h-3" /></button>
              <button onClick={() => onMoveDown(reg.id)} className={ICON_BTN} title="Lower priority" aria-label={`Lower priority of ${reg.name}`}><ArrowDown className="w-3 h-3" /></button>
              <button onClick={() => onDelete(reg.id)} className={ICON_BTN_DANGER} title="Delete register" aria-label={`Delete register ${reg.name}`}><X className="w-3 h-3" /></button>
            </div>
          </div>

          {!reg.isFallback && (
            <div className="mt-1 space-y-1">
              <TagInput tags={reg.keywords} onChange={tags => onIncludeChange(reg.id, tags)} placeholder="include…" colorClass="indigo" suggestions={uniqueTags} />
              <TagInput tags={reg.excludeKeywords} onChange={tags => onExcludeChange(reg.id, tags)} placeholder="exclude…" colorClass="red" suggestions={uniqueTags} />
            </div>
          )}
        </div>
      ))}
    </>
  );
};
