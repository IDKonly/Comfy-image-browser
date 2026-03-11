import { Twitter } from "lucide-react";
import { ImageMetadata } from "../../store/useAppStore";

interface InspectorProps {
  currentMetadata: ImageMetadata | null;
  handleTwitterUpload: () => void;
  shortcuts: any;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export const Inspector = ({
  currentMetadata,
  handleTwitterUpload,
  shortcuts,
  showToast
}: InspectorProps) => {
  return (
    <aside className="w-80 border-l border-white/5 bg-neutral-900 flex flex-col shrink-0 overflow-hidden text-left">
      <div className="p-6 border-b border-white/5 flex items-center justify-between font-black uppercase tracking-widest text-[11px]">
        <span>Inspector</span>
        <div className="flex gap-3 items-center">
          {currentMetadata && (
            <button 
              onClick={handleTwitterUpload} 
              className="p-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-all" 
              title={`Share on X (${shortcuts.twitter})`}
            >
              <Twitter className="w-3.5 h-3.5" />
            </button>
          )}
          {currentMetadata && (
            <button 
              onClick={() => { 
                navigator.clipboard.writeText(currentMetadata.raw); 
                showToast('Raw Copied', 'success'); 
              }} 
              className="text-[9px] text-neutral-500 hover:text-white uppercase transition-colors"
            >
              Raw
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin">
        {currentMetadata ? (
          <>
            {currentMetadata.prompt && (
              <div className="space-y-3">
                <div className="text-blue-500 text-[9px] font-black uppercase tracking-widest text-left">Prompt</div>
                <div className="bg-neutral-950 p-4 rounded-2xl leading-relaxed text-[11px] border border-white/5 select-text shadow-inner text-left">
                  {currentMetadata.prompt}
                </div>
              </div>
            )}
            {currentMetadata.negative_prompt && (
              <div className="space-y-3">
                <div className="text-red-500 text-[9px] font-black uppercase tracking-widest text-left">Negative</div>
                <div className="bg-neutral-950 p-4 rounded-2xl leading-relaxed text-[11px] border border-white/5 select-text shadow-inner text-left">
                  {currentMetadata.negative_prompt}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-left">
              {[
                { label: 'Steps', value: currentMetadata.steps },
                { label: 'CFG', value: currentMetadata.cfg },
                { label: 'Sampler', value: currentMetadata.sampler, full: true },
                { label: 'Model', value: currentMetadata.model, full: true }
              ].map((item, i) => item.value && (
                <div key={i} className={`bg-neutral-950 p-4 rounded-2xl border border-white/5 ${item.full ? 'col-span-2' : ''}`}>
                  <div className="text-neutral-600 text-[9px] font-black uppercase mb-1 text-left">{item.label}</div>
                  <div className="font-bold text-[11px] truncate select-text text-neutral-200 text-left">{item.value}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center opacity-20 italic text-[10px]">No Data</div>
        )}
      </div>
    </aside>
  );
};
