import React, { useEffect } from "react";
import { X } from "lucide-react";
import { ICON_BTN } from "./tokens";

interface ToolShellProps {
  onClose: () => void;
  /** Short uppercase name, hidden below `sm` so header controls never collide. */
  title: string;
  icon: React.ReactNode;
  /** Controls placed directly after the title (tabs, preset selector, …). */
  headerContent?: React.ReactNode;
  /** Controls pinned to the right of the header, before the close button. */
  headerActions?: React.ReactNode;
  /** 22px read-only strip pinned to the bottom. */
  status?: React.ReactNode;
  /** Extra attributes for the panel element (e.g. `data-wildcard-modal`). */
  panelProps?: React.HTMLAttributes<HTMLDivElement>;
  /**
   * `wide` (default) fills the viewport — for the data-heavy panels. `compact` suits tools
   * with few inputs, where a full-width box would just stretch controls across dead space.
   */
  size?: "wide" | "compact";
  children: React.ReactNode;
}

const SIZE = {
  wide: "w-[97vw] max-w-[1760px] h-[95vh]",
  compact: "w-[94vw] max-w-[1240px] h-[88vh]",
};

/**
 * Dense modal shell shared by the large tool panels.
 *
 * Replaces the previous per-tool chrome (88px header + 56px footer inside a 1152px
 * `max-w-6xl` box) with a 38px header, a 22px status strip, and a near-viewport panel —
 * the layout work happens in `children`, which gets a bare flex column to fill.
 */
export const ToolShell = ({
  onClose, title, icon, headerContent, headerActions, status, panelProps, size = "wide", children,
}: ToolShellProps) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // These panels host long-lived text editing. Esc while a field has focus should
      // belong to the field (deselect, dismiss autocomplete), not discard unsaved input.
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 font-sans text-neutral-100 overflow-hidden">
      <div
        {...panelProps}
        className={`bg-neutral-900 border border-white/10 rounded-xl ${SIZE[size]} shadow-2xl overflow-hidden flex flex-col`}
      >
        <div className="h-[38px] max-lg:h-14 shrink-0 px-1.5 border-b border-white/5 flex items-center gap-2 bg-solid-panel">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-[22px] h-[22px] bg-blue-600/20 rounded-md flex items-center justify-center shrink-0">
              {icon}
            </div>
            {/* Decorative once the panel is open — drop it before controls start colliding. */}
            <h2 className="text-[11px] font-black uppercase tracking-wide whitespace-nowrap hidden sm:block">{title}</h2>
          </div>

          {headerContent && (
            <>
              <span className="w-px h-4 bg-white/10 shrink-0 hidden sm:block" aria-hidden="true" />
              {headerContent}
            </>
          )}

          <div className="flex-1" />

          {headerActions}
          <button onClick={onClose} className={ICON_BTN} aria-label={`Close ${title}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>

        {status && (
          <footer className="h-[22px] shrink-0 border-t border-white/5 bg-solid-panel px-2 flex items-center gap-3 text-[9px] font-black uppercase tracking-wide text-neutral-500">
            {status}
          </footer>
        )}
      </div>
    </div>
  );
};
