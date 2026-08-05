import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { TAG_TEXT } from "./tokens";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  colorClass?: "indigo" | "red" | "emerald";
  suggestions?: string[];
}

/** Chips shown before the "+N" overflow chip takes over. */
const COLLAPSE_AFTER = 14;

/**
 * Split pasted or typed text into tags on commas AND newlines.
 *
 * Both separators matter: prompt text is comma-separated, while hand-maintained tag lists
 * (and anything copied out of a .txt file) are one per line. Splitting on only one of them
 * silently produces a single multi-line entry that can never match a real tag.
 */
export const parseTagList = (raw: string): string[] =>
  raw.split(/[\n,]+/).map(t => t.trim()).filter(Boolean);

const VARIANT = {
  indigo: {
    glyph: "+",
    glyphColor: "text-blue-400",
    chip: "bg-[#162235] text-blue-300 border-blue-500/25 hover:border-blue-400/60",
  },
  red: {
    glyph: "−",
    glyphColor: "text-red-400",
    chip: "bg-[#2d1217] text-red-300 border-red-500/25 hover:border-red-400/60",
  },
  emerald: {
    glyph: "{}",
    glyphColor: "text-amber-400",
    chip: "bg-[#291e13] text-amber-300 border-amber-500/25 hover:border-amber-400/60",
  },
} as const;

/**
 * Chip-based tag input with suggestions.
 *
 * Laid out as a single wrapping row — a leading `+ / − / {}` glyph replaces what used to be
 * a dedicated 44px label+toggle header, and the text field sits inline at the end of the
 * chip flow rather than on its own line. Long lists collapse behind an inline "+N" chip
 * instead of a separate Hide/Show row.
 */
export const TagInput = ({ tags, onChange, placeholder, colorClass = "indigo", suggestions = [] }: TagInputProps) => {
    const [inputValue, setInputValue] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const variant = VARIANT[colorClass];

    const filteredSuggestions = useMemo(() => {
        if (!inputValue.trim()) return [];
        return suggestions
            .filter(s => s.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(s))
            .slice(0, 10);
    }, [inputValue, suggestions, tags]);

    const addTags = (raw: string) => {
        const newTags = parseTagList(raw).filter(t => !tags.includes(t));
        if (newTags.length > 0) onChange([...tags, ...newTags]);
        setInputValue("");
        setShowSuggestions(false);
    };

    const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

    const overflow = tags.length - COLLAPSE_AFTER;
    const visibleTags = isExpanded || overflow <= 0 ? tags : tags.slice(0, COLLAPSE_AFTER);

    return (
        <div className="flex items-start gap-1.5">
            <span
              className={`w-3 shrink-0 text-center font-mono text-[10px] font-black leading-[18px] max-lg:leading-8 ${variant.glyphColor}`}
              aria-hidden="true"
            >
              {variant.glyph}
            </span>

            <div className="flex flex-1 flex-wrap items-center gap-1 min-w-0">
                {visibleTags.map(tag => (
                    <span
                      key={tag}
                      className={`flex items-center gap-1 min-h-[18px] max-lg:min-h-8 py-px pl-1.5 pr-0.5 rounded border font-mono leading-[1.5] transition-colors ${TAG_TEXT} ${variant.chip}`}
                    >
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="opacity-50 hover:opacity-100 hover:text-white transition-opacity px-0.5 max-lg:px-1.5"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X className="w-2.5 h-2.5 max-lg:w-3.5 max-lg:h-3.5" />
                        </button>
                    </span>
                ))}

                {overflow > 0 && (
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="h-[18px] max-lg:h-8 px-1.5 rounded border border-white/10 bg-solid-nested text-[10px] font-black text-neutral-300 hover:text-white hover:border-white/25 transition-colors"
                      aria-label={isExpanded ? "Collapse tag list" : `Show ${overflow} more tags`}
                    >
                      {isExpanded ? "− less" : `+${overflow}`}
                    </button>
                )}

                <div className="relative flex-1 min-w-[7rem]">
                    <input
                        className="w-full h-[18px] max-lg:h-8 bg-transparent border-b border-dashed border-white/15 focus:border-blue-500/60 px-1 text-[10px] max-lg:text-[11px] font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none transition-colors"
                        value={inputValue}
                        onChange={e => { setInputValue(e.target.value); setShowSuggestions(true); }}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ',') {
                                e.preventDefault();
                                if (inputValue.trim()) addTags(inputValue);
                            } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
                                // Empty field + Backspace pops the last chip, as in most tag fields.
                                onChange(tags.slice(0, -1));
                            }
                        }}
                        onPaste={e => {
                            const paste = e.clipboardData.getData('text');
                            if (paste.includes(',') || paste.includes('\n')) {
                                e.preventDefault();
                                addTags(paste);
                            }
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder={placeholder}
                        aria-label={placeholder}
                    />
                    {showSuggestions && filteredSuggestions.length > 0 && (
                        <div className="absolute z-[110] left-0 min-w-full w-max max-w-[16rem] mt-1 bg-neutral-900 border border-white/10 rounded-lg shadow-[0_12px_30px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-56 overflow-y-auto scrollbar-thin">
                            {filteredSuggestions.map(s => (
                                <button
                                  key={s}
                                  onMouseDown={(e) => { e.preventDefault(); addTags(s); }}
                                  className="w-full text-left px-2 py-1 max-lg:py-2.5 text-[10px] max-lg:text-[11px] font-mono text-neutral-200 hover:text-white hover:bg-blue-600/25 transition-colors"
                                  aria-label={`Add suggestion tag ${s}`}
                                >
                                  {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
