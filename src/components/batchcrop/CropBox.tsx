import { memo } from "react";
import { Rect } from "./types";

interface CropBoxProps {
  rect: Rect;
  isSelected: boolean;
  scale: number;
  onMouseDown: (e: React.MouseEvent, id: string, handle?: string) => void;
}

/** A single draggable/resizable crop rectangle with handles and a rule-of-thirds grid. */
export const CropBox = memo(({ rect, isSelected, scale, onMouseDown }: CropBoxProps) => {
  const dX = rect.x / scale;
  const dY = rect.y / scale;
  const dW = rect.width / scale;
  const dH = rect.height / scale;

  const handles = [
    { id: 'tl', cursor: 'nwse-resize', style: { top: -6, left: -6 } },
    { id: 'tr', cursor: 'nesw-resize', style: { top: -6, right: -6 } },
    { id: 'bl', cursor: 'nesw-resize', style: { bottom: -6, left: -6 } },
    { id: 'br', cursor: 'nwse-resize', style: { bottom: -6, right: -6 } },
    { id: 't', cursor: 'ns-resize', style: { top: -6, left: 'calc(50% - 6px)' } },
    { id: 'b', cursor: 'ns-resize', style: { bottom: -6, left: 'calc(50% - 6px)' } },
    { id: 'l', cursor: 'ew-resize', style: { top: 'calc(50% - 6px)', left: -6 } },
    { id: 'r', cursor: 'ew-resize', style: { top: 'calc(50% - 6px)', right: -6 } },
  ];

  return (
    <div
      className={`absolute pointer-events-auto cursor-move ${isSelected ? 'z-20' : 'z-10'}`}
      style={{ left: dX, top: dY, width: dW, height: dH }}
      onMouseDown={(e) => onMouseDown(e, rect.id)}
    >
      <div className={`absolute inset-0 border-[1px] border-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)] ${isSelected ? 'ring-2 ring-blue-500 bg-blue-500/10' : 'bg-white/5'}`} />
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
        {[1, 2].map(i => (
          <div key={`v-${i}`} className="absolute top-0 bottom-0 w-px bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.5)]" style={{ left: `${i * 33.33}%` }} />
        ))}
        {[1, 2].map(i => (
          <div key={`h-${i}`} className="absolute left-0 right-0 h-px bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.5)]" style={{ top: `${i * 33.33}%` }} />
        ))}
      </div>
      {isSelected && (
        <>
          {handles.map(h => (
            <div key={h.id} className="absolute w-3 h-3 bg-white border border-black shadow-sm z-30 pointer-events-auto" style={{ ...h.style, cursor: h.cursor }} onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, rect.id, h.id); }} />
          ))}
          <div className="absolute top-0 left-0 -translate-y-full pb-1 flex items-center drop-shadow-lg">
            <span className="px-1.5 py-0.5 bg-black/80 text-white text-[9px] font-mono rounded border border-white/10 uppercase">{Math.round(rect.width)}x{Math.round(rect.height)}</span>
          </div>
        </>
      )}
    </div>
  );
});
