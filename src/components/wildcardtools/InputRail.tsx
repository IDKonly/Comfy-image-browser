import { ReactNode } from "react";

export type InputTab = 'images' | 'text';

interface InputRailProps {
  activeTab: InputTab;
  counts: Record<InputTab, number>;
  onTabChange: (tab: InputTab) => void;
  /** Per-tab actions rendered at the right of the tab bar. */
  actions?: ReactNode;
  children: ReactNode;
}

const TABS: { key: InputTab; label: string; title: string }[] = [
  { key: 'images', label: 'Images', title: 'Target images — tags are read from their embedded prompts' },
  { key: 'text',   label: 'Text',   title: 'Free-text prompts, one per line' },
];

/**
 * Left rail hosting the two Workshop input sources as tabs.
 *
 * They used to be stacked as fixed `lg:h-1/2` halves, so the image list and the prompt
 * textarea each got half the column whether or not that run used both. Tabs give whichever
 * source is in use the full height.
 */
export const InputRail = ({ activeTab, counts, onTabChange, actions, children }: InputRailProps) => (
  <>
    <div className="h-7 max-lg:h-14 shrink-0 flex items-center gap-1 px-1.5 bg-solid-panel border-b border-white/5">
      <div role="tablist" aria-label="Input sources" className="flex items-center gap-0.5">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            title={t.title}
            onClick={() => onTabChange(t.key)}
            className={`h-5 max-lg:h-10 px-2 rounded-md flex items-center gap-1 text-[9px] font-black uppercase tracking-wide transition-colors ${
              activeTab === t.key ? 'bg-solid-element text-white' : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {t.label}
            <span className={`text-[8.5px] font-mono tabular-nums px-1 rounded ${activeTab === t.key ? 'bg-black/40 text-neutral-300' : 'text-neutral-600'}`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex-1" />
      {actions}
    </div>

    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
  </>
);
