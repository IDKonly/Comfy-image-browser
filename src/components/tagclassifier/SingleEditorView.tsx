import { useState, useRef, useCallback, useEffect } from "react";
import { RefreshCw, Sparkles, ChevronDown } from "lucide-react";
import { LABEL, TAG_TEXT } from "../ui/tokens";

interface SingleEditorViewProps {
  lines: string[];
  currentIndex: number;
  /** Pre-classified result for the current line (computed by the backend classifier). */
  previewData: any[];
  onActiveLineChange: (value: string) => void;
}

const MIN_FLOW = 72;
const MAX_FLOW = 560;
const DEFAULT_FLOW = 240;

/**
 * "Editor" view: the active-line textarea above a live Flow Result preview.
 *
 * The prompt navigator now lives in WorkstationToolbar. The split between the textarea and
 * the preview is drag-resizable rather than a fixed `flex-[3]` / `flex-[2]` ratio, so the
 * preview can be collapsed while writing and expanded while checking classification.
 */
export const SingleEditorView = ({ lines, currentIndex, previewData, onActiveLineChange }: SingleEditorViewProps) => {
  const [flowHeight, setFlowHeight] = useState(DEFAULT_FLOW);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef(null as { startY: number; startH: number } | null);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    // Dragging the handle upward grows the panel below it.
    const next = Math.min(MAX_FLOW, Math.max(MIN_FLOW, d.startH + (d.startY - e.clientY)));
    setFlowHeight(next);
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  useEffect(() => endDrag, [endDrag]);

  const startDrag = (e: React.PointerEvent) => {
    if (collapsed) return;
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: flowHeight };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <textarea
        id="prompt-textarea"
        className="flex-1 min-h-[5rem] w-full bg-neutral-950 border border-white/5 focus:border-blue-500/50 rounded-lg px-3 py-2.5 text-[13px] font-mono text-neutral-200 focus:outline-none resize-none leading-relaxed scrollbar-thin transition-colors"
        value={lines[currentIndex] || ""}
        onChange={e => onActiveLineChange(e.target.value)}
        placeholder="Input dataset tag lists separated by commas…"
        aria-label="Active prompt line"
      />

      <div
        onPointerDown={startDrag}
        className={`h-1.5 shrink-0 my-0.5 rounded-full transition-colors ${collapsed ? '' : 'cursor-row-resize hover:bg-blue-500/40'}`}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the flow result panel"
      />

      {/* max-h caps the dragged height so the preview can never squeeze the textarea out
          of view on short viewports, where the stored pixel height may exceed the pane. */}
      <div
        className="shrink-0 max-h-[60%] bg-solid-panel border border-white/5 rounded-lg flex flex-col min-h-0 overflow-hidden"
        style={{ height: collapsed ? undefined : flowHeight }}
      >
        <div className="h-6 shrink-0 flex items-center gap-1.5 px-2 border-b border-white/5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-1.5 text-neutral-300 hover:text-white transition-colors"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand flow result" : "Collapse flow result"}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            <RefreshCw className="w-3 h-3 text-neutral-500" />
            <span className="text-[9px] font-black uppercase tracking-wide">Flow Result</span>
          </button>
          <div className="flex-1" />
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-blue-400">
            <Sparkles className="w-3 h-3" /> Live
          </span>
        </div>

        {!collapsed && (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 py-1">
            {previewData.length === 0 ? (
              <p className={`${LABEL} py-1`}>Type a prompt to see it classified</p>
            ) : previewData.map((sub: any) => (
              <div key={sub.id} className="flex items-start gap-2 py-0.5 border-b border-white/[0.04] last:border-0">
                <span
                  className={`w-[5.5rem] shrink-0 text-right text-[9px] font-black uppercase tracking-wide leading-[18px] truncate ${sub.id === 0 ? 'text-neutral-500' : 'text-blue-400'}`}
                  title={sub.name}
                >
                  {sub.name}
                </span>
                <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                  {sub.matches.length > 0 ? sub.matches.map((m: string, i: number) => (
                    <span
                      key={i}
                      className={`min-h-[18px] py-px px-1.5 rounded border font-mono leading-[1.5] flex items-center ${TAG_TEXT} ${sub.id === 0 ? 'bg-neutral-900 border-white/5 text-neutral-400' : 'bg-[#162235] border-blue-500/25 text-blue-300'}`}
                    >
                      {m}
                    </span>
                  )) : (
                    <span className="text-[9px] text-neutral-600 font-black uppercase tracking-wide leading-[18px] select-none">No match</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
