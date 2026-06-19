import { useState, useMemo } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  colorClass?: "indigo" | "red" | "emerald";
  suggestions?: string[];
}

/** Chip-based tag input with a suggestion dropdown, expand/collapse, and 3 color variants. */
export const TagInput = ({ tags, onChange, placeholder, colorClass = "indigo", suggestions = [] }: TagInputProps) => {
    const [inputValue, setInputValue] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);

    const filteredSuggestions = useMemo(() => {
        if (!inputValue.trim()) return [];
        return suggestions
            .filter(s => s.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(s))
            .slice(0, 10);
    }, [inputValue, suggestions, tags]);

    const addTags = (raw: string) => {
        const newTags = raw.split(/[\n,]+/).map(t => t.trim()).filter(t => t && !tags.includes(t));
        if (newTags.length > 0) onChange([...tags, ...newTags]);
        setInputValue("");
        setShowSuggestions(false);
        setIsExpanded(true);
    };

    const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

    // Custom design tokens matching the Wildcard tools look-and-feel (blue, red, amber)
    const colorMap = {
        indigo: "bg-[#162235] text-blue-400 border-blue-500/20 hover:border-blue-400/50 hover:bg-[#1a2b42] shadow-sm",
        red: "bg-[#2d1217] text-red-400 border-red-500/20 hover:border-red-400/50 hover:bg-[#3d1820] shadow-sm",
        emerald: "bg-[#291e13] text-amber-400 border-amber-500/20 hover:border-amber-400/50 hover:bg-[#38281a] shadow-sm"
    };

    const headerColor = {
        indigo: "text-blue-400 font-bold",
        red: "text-red-400 font-bold",
        emerald: "text-amber-400 font-bold"
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${headerColor[colorClass]}`}>
                    {colorClass === 'red' ? 'Excludes (-)' : colorClass === 'emerald' ? 'Variables ({})' : 'Includes (+)'}
                </span>
                {tags.length > 0 && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-[9.5px] font-black text-neutral-300 hover:text-white uppercase tracking-wide transition-colors py-2 px-3 min-h-[44px] flex items-center"
                        aria-label={isExpanded ? "Hide tags" : "Show tags"}
                    >
                        {isExpanded ? 'Hide' : `Show (${tags.length})`}
                    </button>
                )}
            </div>

            {isExpanded && tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    {tags.map(tag => (
                        <span key={tag} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-semibold transition-all min-h-[36px] ${colorMap[colorClass]}`}>
                            {tag}
                            <button
                              onClick={() => removeTag(tag)}
                              className="hover:text-white transition-colors p-2 -mr-1"
                              aria-label={`Remove tag ${tag}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="relative">
                <input
                    className="w-full bg-neutral-955 border border-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/10 rounded-2xl px-4 py-3.5 text-xs font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none shadow-inner min-h-[44px]"
                    value={inputValue}
                    onChange={e => { setInputValue(e.target.value); setShowSuggestions(true); }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            if (inputValue.trim()) addTags(inputValue);
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
                    <div className="absolute z-[110] left-0 right-0 mt-2 bg-neutral-900 border border-white/10 rounded-2xl shadow-[0_15px_35px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-56 overflow-y-auto scrollbar-thin">
                        {filteredSuggestions.map(s => (
                            <button
                              key={s}
                              onMouseDown={(e) => { e.preventDefault(); addTags(s); }}
                              className="w-full text-left px-4 py-3.5 min-h-[44px] text-[10px] font-extrabold uppercase text-neutral-200 hover:text-white hover:bg-neutral-800/40 transition-all border-b border-white/[0.05] last:border-0"
                              aria-label={`Add suggestion tag ${s}`}
                            >
                              {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
