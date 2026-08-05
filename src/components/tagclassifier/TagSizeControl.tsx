import { Minus, Plus, Type } from "lucide-react";
import { ICON_BTN } from "../ui/tokens";

export const TAG_SIZE_MIN = 8;
export const TAG_SIZE_MAX = 18;
export const TAG_SIZE_DEFAULT = 10;

interface TagSizeControlProps {
  size: number;
  onChange: (size: number) => void;
}

/** Clamp to the supported range; exported so persisted values can be sanitised on load. */
export const clampTagSize = (n: number) =>
  Number.isFinite(n) ? Math.min(TAG_SIZE_MAX, Math.max(TAG_SIZE_MIN, Math.round(n))) : TAG_SIZE_DEFAULT;

/**
 * Stepper for the tag chip font size, sitting in the middle of the workstation toolbar.
 *
 * Writes `--tag-font-size` on the panel root (see TagClassifier), so it retunes every chip
 * in the panel at once. Double-clicking the readout restores the default.
 */
export const TagSizeControl = ({ size, onChange }: TagSizeControlProps) => (
  <div
    className="flex items-center gap-0.5 shrink-0 bg-neutral-950 border border-white/10 rounded-md px-1"
    role="group"
    aria-label="Tag text size"
  >
    <Type className="w-3 h-3 text-neutral-500 shrink-0" aria-hidden="true" />
    <button
      onClick={() => onChange(clampTagSize(size - 1))}
      disabled={size <= TAG_SIZE_MIN}
      className={`${ICON_BTN} disabled:opacity-30 disabled:hover:bg-transparent`}
      title="Smaller tag text"
      aria-label="Decrease tag text size"
    >
      <Minus className="w-3 h-3" />
    </button>
    <button
      onDoubleClick={() => onChange(TAG_SIZE_DEFAULT)}
      className="w-[2.25rem] text-center text-[9px] font-black tabular-nums text-neutral-300 cursor-default"
      title="Double-click to reset"
      aria-live="polite"
    >
      {size}px
    </button>
    <button
      onClick={() => onChange(clampTagSize(size + 1))}
      disabled={size >= TAG_SIZE_MAX}
      className={`${ICON_BTN} disabled:opacity-30 disabled:hover:bg-transparent`}
      title="Larger tag text"
      aria-label="Increase tag text size"
    >
      <Plus className="w-3 h-3" />
    </button>
  </div>
);
