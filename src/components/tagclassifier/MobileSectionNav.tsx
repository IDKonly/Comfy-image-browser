import { Filter, Database, CheckCircle } from "lucide-react";

type MobileSection = 'rules' | 'editor' | 'output';

interface MobileSectionNavProps {
  activeMobileSection: MobileSection;
  onChange: (section: MobileSection) => void;
}

/** lg:hidden bottom navigation switching between the rules/editor/output panes. */
export const MobileSectionNav = ({ activeMobileSection, onChange }: MobileSectionNavProps) => (
  <div className="lg:hidden h-16 border-t border-white/5 bg-solid-panel flex items-center justify-around px-4 shrink-0 text-white z-20 shadow-2xl">
    <button
      onClick={() => onChange('rules')}
      className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 min-h-[44px] text-[10px] font-extrabold uppercase transition-all ${activeMobileSection === 'rules' ? 'text-blue-405 font-black' : 'text-neutral-400 hover:text-neutral-250'}`}
      aria-label="Mobile Navigation Rules"
    >
      <Filter className="w-4 h-4" />
      <span>Rules</span>
    </button>
    <button
      onClick={() => onChange('editor')}
      className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 min-h-[44px] text-[10px] font-extrabold uppercase transition-all ${activeMobileSection === 'editor' ? 'text-blue-405 font-black' : 'text-neutral-400 hover:text-neutral-250'}`}
      aria-label="Mobile Navigation Workstation"
    >
      <Database className="w-4 h-4" />
      <span>Workstation</span>
    </button>
    <button
      onClick={() => onChange('output')}
      className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 min-h-[44px] text-[10px] font-extrabold uppercase transition-all ${activeMobileSection === 'output' ? 'text-blue-405 font-black' : 'text-neutral-400 hover:text-neutral-250'}`}
      aria-label="Mobile Navigation Output"
    >
      <CheckCircle className="w-4 h-4" />
      <span>Output</span>
    </button>
  </div>
);
