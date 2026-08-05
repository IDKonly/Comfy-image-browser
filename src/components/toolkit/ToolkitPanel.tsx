import { useState } from 'react';
import { Wrench, GitMerge, Sparkles, ArrowLeftRight } from 'lucide-react';
import { ToolShell } from '../ui';
import { PipelinePanel } from './PipelinePanel';
import { GeneratorPanel } from './GeneratorPanel';
import { ConverterPanel } from './ConverterPanel';

export type ToolkitTab = 'pipeline' | 'generator' | 'converter';

interface ToolkitPanelProps {
  onClose: () => void;
  /** Tab to open on mount. */
  initialTab?: ToolkitTab;
}

const TABS = [
  { key: 'pipeline' as const, label: 'Pipeline', icon: GitMerge, blurb: 'Extract → clean → classify → save' },
  { key: 'generator' as const, label: 'Generator', icon: Sparkles, blurb: 'Sample coherent prompts from your library' },
  { key: 'converter' as const, label: 'Converter', icon: ArrowLeftRight, blurb: 'PNG ↔ WebP, ComfyUI metadata preserved' },
];

/**
 * Home for the batch tools that each need only a handful of inputs.
 *
 * Pipeline and Generator used to be tabs inside Wildcard Workshop — which meant a modal
 * sized for the Workshop's image/text/results layout, and two thirds of its chrome unused.
 * Converter was its own `max-w-xl` modal. Grouping them here lets each keep a two-column
 * config/output layout at a size that matches how much they actually have to show.
 */
export const ToolkitPanel = ({ onClose, initialTab = 'pipeline' }: ToolkitPanelProps) => {
  const [tab, setTab] = useState(initialTab as ToolkitTab);
  const active = TABS.find(t => t.key === tab)!;

  return (
    <ToolShell
      onClose={onClose}
      title="Toolkit"
      size="compact"
      icon={<Wrench className="w-3.5 h-3.5 text-blue-500" />}
      headerContent={
        <div role="tablist" aria-label="Toolkit tools" className="flex items-center gap-0.5 min-w-0">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                title={t.blurb}
                onClick={() => setTab(t.key)}
                className={`h-6 max-lg:h-11 px-2 rounded-md flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide transition-colors ${
                  tab === t.key ? 'bg-solid-element text-white' : 'text-neutral-500 hover:text-neutral-200'
                }`}
              >
                <Icon className="w-3 h-3" /> {t.label}
              </button>
            );
          })}
        </div>
      }
      status={<span className="truncate">{active.blurb}</span>}
    >
      {tab === 'pipeline' && <PipelinePanel />}
      {tab === 'generator' && <GeneratorPanel />}
      {tab === 'converter' && <ConverterPanel />}
    </ToolShell>
  );
};
