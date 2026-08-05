/**
 * Shared density tokens for the big tool panels (Tag Classifier, Wildcard Workshop, Toolkit).
 *
 * These panels are information-dense on desktop but must stay touch-usable on phones, so
 * every interactive token pairs a compact desktop size with a `max-lg:` override that
 * restores a ~44px target below the `lg` breakpoint. Import these instead of re-typing
 * class strings so the two modes never drift apart.
 */

/** Square icon button — 24px on desktop, 44px on touch. */
export const ICON_BTN =
  "w-6 h-6 max-lg:w-11 max-lg:h-11 flex items-center justify-center rounded-md " +
  "text-neutral-400 hover:text-white hover:bg-white/10 transition-colors shrink-0";

/** Destructive variant of ICON_BTN. */
export const ICON_BTN_DANGER =
  "w-6 h-6 max-lg:w-11 max-lg:h-11 flex items-center justify-center rounded-md " +
  "text-neutral-400 hover:text-red-400 hover:bg-red-500/15 transition-colors shrink-0";

/** Row-hover affordance: hidden until the parent `.group` is hovered, always shown on touch. */
export const HOVER_TOOLS =
  "flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 " +
  "focus-within:opacity-100 max-lg:opacity-100 transition-opacity";

/** Small uppercase section/field label. */
export const LABEL = "text-[9px] font-black uppercase tracking-wide text-neutral-400";

/** Text button with an icon, used in bars. */
export const BAR_BTN =
  "h-6 max-lg:h-11 px-2 flex items-center gap-1.5 rounded-md border text-[9px] font-black " +
  "uppercase tracking-wide transition-colors shrink-0";

/** Primary (blue) fill for BAR_BTN. */
export const BAR_BTN_PRIMARY = "bg-blue-600 hover:bg-blue-500 text-white border-blue-500";

/** Neutral outline for BAR_BTN. */
export const BAR_BTN_GHOST =
  "bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border-white/10";

/** Card surface for a repeated list item. */
export const LIST_CARD =
  "bg-solid-card border border-white/5 rounded-lg px-1.5 py-1.5 transition-colors";

/** Single-line text/number/select input. */
export const FIELD =
  "h-6 max-lg:h-11 w-full bg-neutral-950 border border-white/10 focus:border-blue-500/50 " +
  "rounded-md px-1.5 text-[10px] font-mono text-neutral-100 placeholder-neutral-600 " +
  "outline-none transition-colors";

/** Segmented-control container. */
export const SEGMENT = "flex bg-neutral-950 border border-white/10 rounded-md p-0.5 shrink-0";

/** One button inside a SEGMENT; append the active/inactive colours. */
export const SEGMENT_BTN =
  "h-5 max-lg:h-10 px-2.5 rounded flex items-center justify-center text-[9px] font-black " +
  "uppercase tracking-wide transition-colors";

/** Icon size used inside ICON_BTN / BAR_BTN. */
export const ICON = "w-3.5 h-3.5";

/**
 * Text size for tag chips, driven by `--tag-font-size` on the panel root so the
 * workstation's font-size control retunes every chip at once — the Library grid, the
 * Flow Result preview, and the rule editors' TagInputs — without prop drilling.
 * The fallback keeps chips readable if the variable is ever absent.
 */
export const TAG_TEXT = "text-[length:var(--tag-font-size,10px)]";
