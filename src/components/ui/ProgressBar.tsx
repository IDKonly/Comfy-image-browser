interface ProgressBarProps {
  current: number;
  total: number;
  className?: string;
  barClassName?: string;
}

/** Thin determinate progress bar. Guards against a zero/invalid total. */
export const ProgressBar = ({ current, total, className = "", barClassName = "" }: ProgressBarProps) => {
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  return (
    <div
      className={`h-1 bg-neutral-900 rounded-full overflow-hidden border border-white/5 ${className}`}
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div
        className={`h-full bg-blue-600 transition-all duration-300 shadow-[0_0_10px_rgba(37,99,235,0.4)] ${barClassName}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};
