import React from "react";
import { FolderOpen, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { LABEL, FIELD, ICON_BTN, SEGMENT, SEGMENT_BTN } from "../ui/tokens";

/**
 * Compact form primitives for the Toolkit panels.
 *
 * These tools have few inputs each, so their old layouts spent most of their height on
 * chrome — `space-y-5` between blocks, `py-2.5 px-3 rounded-xl` on every control, and a
 * full label row above each one. Here the label sits inline at a fixed width so a control
 * costs one 24px row, and hints only appear when they carry information the label can't.
 */

/** Label + control on one row. `hint` renders under the control, indented past the label. */
export const Row = ({ label, hint, children, title }: {
  label: string; hint?: React.ReactNode; title?: string; children: React.ReactNode;
}) => (
  <div className="space-y-0.5">
    <div className="flex items-center gap-2" title={title}>
      <span className={`${LABEL} w-[6.5rem] shrink-0 text-right`}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center gap-1">{children}</div>
    </div>
    {hint && <p className="text-[9px] text-neutral-600 leading-snug pl-[7.5rem]">{hint}</p>}
  </div>
);

/** Read-only folder path with a picker button. */
export const FolderField = ({ label, value, onPick, hint }: {
  label: string; value: string; onPick: () => void; hint?: React.ReactNode;
}) => (
  <Row label={label} hint={hint} title={value || undefined}>
    <span className={`${FIELD} flex items-center truncate ${value ? 'text-neutral-200' : 'text-neutral-600'}`}>
      {value || "Not set"}
    </span>
    <button onClick={onPick} className={ICON_BTN} aria-label={`Choose ${label.toLowerCase()}`} title={`Choose ${label.toLowerCase()}`}>
      <FolderOpen className="w-3.5 h-3.5" />
    </button>
  </Row>
);

/** Range slider with its live value pinned to the right of the label. */
export const SliderField = ({ label, value, min, max, step, onChange, format, hint, disabled }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (n: number) => void; format?: (n: number) => string;
  hint?: React.ReactNode; disabled?: boolean;
}) => (
  <Row label={label} hint={hint}>
    <input
      type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={e => onChange(parseFloat(e.target.value))}
      aria-label={label}
      className="flex-1 min-w-0 accent-blue-600 h-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    />
    <span className="w-9 shrink-0 text-right text-[10px] font-mono font-black text-blue-400 tabular-nums">
      {format ? format(value) : value}
    </span>
  </Row>
);

export const SelectField = ({ label, value, options, onChange, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; hint?: React.ReactNode;
}) => (
  <Row label={label} hint={hint}>
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} className={`${FIELD} cursor-pointer`}>
      {options.map(o => <option key={o.value} value={o.value} className="bg-[#0c0b17]">{o.label}</option>)}
    </select>
  </Row>
);

/** Inline on/off pill. Reads as a single row rather than the old 44px bordered card. */
export const ToggleField = ({ label, value, onToggle, hint, danger }: {
  label: string; value: boolean; onToggle: () => void; hint?: React.ReactNode; danger?: boolean;
}) => (
  <Row label={label} hint={hint}>
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={`h-6 max-lg:h-11 px-2 rounded-md border text-[9px] font-black uppercase tracking-wide transition-colors ${
        value
          ? (danger ? 'bg-red-600/20 border-red-500/40 text-red-300' : 'bg-blue-600/20 border-blue-500/40 text-blue-400')
          : 'bg-neutral-950 border-white/10 text-neutral-500 hover:text-neutral-300'
      }`}
    >
      {value ? 'On' : 'Off'}
    </button>
  </Row>
);

/** Exclusive choice rendered as a segmented control. */
export const SegmentField = <T extends string>({ label, value, options, onChange, hint }: {
  label: string; value: T; onChange: (v: T) => void;
  options: { value: T; label: string }[]; hint?: React.ReactNode;
}) => (
  <Row label={label} hint={hint}>
    <div className={SEGMENT}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`${SEGMENT_BTN} ${value === o.value ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </Row>
);

/** Full-width primary action for a panel. */
export const RunButton = ({ onClick, disabled, running, runningLabel, label, icon }: {
  onClick: () => void; disabled?: boolean; running?: boolean;
  runningLabel: string; label: string; icon: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full h-8 max-lg:h-12 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-md text-[10px] font-black uppercase tracking-wide text-white transition-colors active:scale-[0.99]"
  >
    {running ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {runningLabel}</> : <>{icon} {label}</>}
  </button>
);

/** Status callout used for progress / success / failure messages. */
export const StatusBox = ({ tone, children }: { tone: 'info' | 'ok' | 'error'; children: React.ReactNode }) => {
  const style = {
    info: 'bg-blue-600/10 border-blue-500/25 text-blue-300',
    ok: 'bg-green-600/10 border-green-500/25 text-green-300',
    error: 'bg-red-600/10 border-red-500/25 text-red-300',
  }[tone];
  const Icon = tone === 'ok' ? CheckCircle : tone === 'error' ? AlertCircle : Loader2;
  return (
    <div className={`flex items-start gap-1.5 px-2 py-1.5 rounded-md border text-[10px] leading-snug ${style}`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-px ${tone === 'info' ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

/** Section divider inside a config column. */
export const GroupLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 pt-1">
    <span className="text-[9px] font-black uppercase tracking-wide text-neutral-500">{children}</span>
    <span className="flex-1 h-px bg-white/5" />
  </div>
);
