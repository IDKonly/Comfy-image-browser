import { ReactNode } from "react";
import { Plus } from "lucide-react";
import { ICON_BTN } from "../ui/tokens";

export type RulesTab = 'groups' | 'vars' | 'regs';

interface RulesRailProps {
  activeTab: RulesTab;
  counts: Record<RulesTab, number>;
  onTabChange: (tab: RulesTab) => void;
  /** Adds an item to the currently active tab's list. */
  onAdd: () => void;
  children: ReactNode;
}

const TABS: { key: RulesTab; label: string; title: string }[] = [
  { key: 'groups', label: 'Groups', title: 'Pipeline rules — classify individual tags by theme' },
  { key: 'vars',   label: 'Vars',   title: 'Tag variables — collapse interchangeable tags into one {placeholder}' },
  { key: 'regs',   label: 'Regs',   title: 'Scene registers — partition whole lines into output buckets' },
];

/**
 * Left rail hosting the three rule editors as tabs.
 *
 * Previously these were stacked vertically inside one 320px column, each with its own
 * capped scroll area (`flex-1` / `max-h-56` / `max-h-72`), so every section showed roughly
 * a third of the available height. Tabbing gives whichever section is being edited the
 * full column instead.
 */
export const RulesRail = ({ activeTab, counts, onTabChange, onAdd, children }: RulesRailProps) => (
  <>
    <div className="h-7 max-lg:h-14 shrink-0 flex items-center gap-1 px-1.5 bg-solid-panel border-b border-white/5">
      <div role="tablist" aria-label="Rule editors" className="flex items-center gap-0.5 flex-1 min-w-0">
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
      <button onClick={onAdd} className={ICON_BTN} aria-label={`Add to ${activeTab}`} title={`Add to ${activeTab}`}>
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-1.5 space-y-1.5">
      {children}
    </div>
  </>
);
