interface BulkSourceViewProps {
  lines: string[];
  onLinesChange: (lines: string[]) => void;
}

/** "Source" view: a single global textarea bound to the newline-joined prompt lines. */
export const BulkSourceView = ({ lines, onLinesChange }: BulkSourceViewProps) => (
  <textarea
    id="bulk-textarea"
    className="flex-1 min-h-0 w-full bg-neutral-950 border border-white/5 focus:border-blue-500/50 rounded-lg px-3 py-2.5 text-[13px] font-mono text-neutral-200 focus:outline-none resize-none leading-relaxed scrollbar-thin transition-colors"
    value={lines.join('\n')}
    onChange={e => onLinesChange(e.target.value.split('\n'))}
    placeholder="Paste thousands of comma-separated prompt lines here…"
    aria-label="Global source editor"
  />
);
