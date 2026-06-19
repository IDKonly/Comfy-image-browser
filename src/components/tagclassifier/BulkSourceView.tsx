interface BulkSourceViewProps {
  lines: string[];
  onLinesChange: (lines: string[]) => void;
}

/** "Source" view: a single global textarea bound to the newline-joined prompt lines. */
export const BulkSourceView = ({ lines, onLinesChange }: BulkSourceViewProps) => (
  <div className="flex-1 flex flex-col gap-3 min-h-0 animate-in zoom-in-95 duration-500">
    <label className="text-xs font-extrabold uppercase text-neutral-300 tracking-wider px-3" htmlFor="bulk-textarea">Global Source Editor</label>
    <textarea
      id="bulk-textarea"
      className="flex-1 w-full bg-neutral-955 border border-white/5 focus:border-blue-500/40 rounded-3xl p-6 sm:p-10 text-sm sm:text-base font-mono text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500/20 resize-none shadow-inner leading-relaxed scrollbar-thin"
      value={lines.join('\n')}
      onChange={e => onLinesChange(e.target.value.split('\n'))}
      placeholder="Paste thousands of comma-separated prompt lines here..."
    />
  </div>
);
