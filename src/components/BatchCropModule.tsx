import { useState, useEffect, useRef, memo, useCallback } from "react";
import { X, Save, Scissors, Copy, Target, MousePointer2, Grid3X3 } from "lucide-react";

// --- Types ---
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
}

interface BatchCropModuleProps {
  src: string;
  onClose: () => void;
  onSave: (rects: Rect[], fillColor: [number, number, number]) => void;
}

// --- Sub-Component: Individual Crop Box ---
const CropBox = memo(({ 
  rect, isSelected, scale, onMouseDown 
}: { 
  rect: Rect, isSelected: boolean, scale: number, onMouseDown: (e: React.MouseEvent, id: string, handle?: string) => void 
}) => {
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

// --- Main Module ---
export const BatchCropModule = ({ src, onClose, onSave }: BatchCropModuleProps) => {
  const [rects, setRects] = useState<Rect[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Settings
  const [lockedRatio, setLockedRatio] = useState<number | null>(null);
  const [fillColor, setFillColor] = useState("#FFFFFF");
  const [snapEnabled, setSnapEnabled] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [clipboard, setClipboard] = useState<{width: number, height: number} | null>(null);

  // Interaction State
  const mode = useRef<'none' | 'drawing' | 'dragging' | 'resizing'>('none');
  const activeHandle = useRef<string | null>(null);
  const startNaturalPos = useRef({ x: 0, y: 0 });
  const initialRectsState = useRef<Record<string, Rect>>({});
  const dragOffsets = useRef<Record<string, {x: number, y: number}>>({});

  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);
  const [customRatioW, setCustomRatioW] = useState(1);
  const [customRatioH, setCustomRatioH] = useState(1);
  const [recentGrids, setRecentGrids] = useState<[number, number][]>(() => JSON.parse(localStorage.getItem('recent_crop_grids') || '[[2,2],[3,3],[4,4]]'));
  const [recentRatios, setRecentRatios] = useState<[number, number][]>(() => JSON.parse(localStorage.getItem('recent_crop_ratios') || '[[1,1],[3,2],[16,9]]'));

  const getScale = useCallback(() => {
    if (!imgRef.current) return 1;
    return imgRef.current.naturalWidth / imgRef.current.clientWidth;
  }, []);

  const getNaturalPos = (e: MouseEvent | React.MouseEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    const sc = getScale();
    return { x: (e.clientX - rect.left) * sc, y: (e.clientY - rect.top) * sc };
  };

  const applyRatio = (w: number, h: number) => {
    setLockedRatio(w / h);
    setCustomRatioW(w); setCustomRatioH(h);
    const next = [[w, h], ...recentRatios.filter(g => g[0] !== w || g[1] !== h)].slice(0, 3) as [number, number][];
    setRecentRatios(next);
    localStorage.setItem('recent_crop_ratios', JSON.stringify(next));
  };

  const handleMouseDown = (e: React.MouseEvent, rectId?: string, handle?: string) => {
    e.stopPropagation();
    const pos = getNaturalPos(e);
    startNaturalPos.current = pos;

    if (rectId) {
      const isShift = e.shiftKey;
      let newSelected = isShift ? (selectedIds.includes(rectId) ? selectedIds.filter(id => id !== rectId) : [...selectedIds, rectId]) : (selectedIds.includes(rectId) ? selectedIds : [rectId]);
      setSelectedIds(newSelected);

      // Snapshot initial state for all rects
      const origins: Record<string, Rect> = {};
      rects.forEach(r => origins[r.id] = { ...r });
      initialRectsState.current = origins;

      if (handle) {
        mode.current = 'resizing';
        activeHandle.current = handle;
      } else {
        mode.current = 'dragging';
        const offsets: Record<string, {x: number, y: number}> = {};
        rects.forEach(r => { if (newSelected.includes(r.id)) offsets[r.id] = { x: pos.x - r.x, y: pos.y - r.y }; });
        dragOffsets.current = offsets;
      }
    } else {
      mode.current = 'drawing';
      const newId = crypto.randomUUID();
      setRects(prev => [...prev, { id: newId, x: pos.x, y: pos.y, width: 0, height: 0 }]);
      setSelectedIds([newId]);
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (mode.current === 'none' || !imgRef.current) return;
    const pos = getNaturalPos(e);
    const nW = imgRef.current.naturalWidth;
    const nH = imgRef.current.naturalHeight;
    const sc = getScale();
    const sensitivity = 15 * sc;

    setRects(prev => prev.map(r => {
      if (!selectedIds.includes(r.id)) return r;

      if (mode.current === 'drawing') {
        const id = selectedIds[0];
        if (r.id !== id) return r;
        let w = Math.abs(pos.x - startNaturalPos.current.x);
        let h = Math.abs(pos.y - startNaturalPos.current.y);
        const ratio = lockedRatio || (e.shiftKey ? 1 : null);
        if (ratio) h = w / ratio;
        return {
          ...r,
          x: pos.x < startNaturalPos.current.x ? startNaturalPos.current.x - w : startNaturalPos.current.x,
          y: pos.y < startNaturalPos.current.y ? startNaturalPos.current.y - h : startNaturalPos.current.y,
          width: w, height: h
        };
      }

      if (mode.current === 'dragging') {
        const off = dragOffsets.current[r.id];
        if (!off) return r;
        let nX = pos.x - off.x;
        let nY = pos.y - off.y;

        // Shift key axis lock
        if (e.shiftKey) {
          const dx = Math.abs(pos.x - startNaturalPos.current.x);
          const dy = Math.abs(pos.y - startNaturalPos.current.y);
          if (dx > dy) nY = initialRectsState.current[r.id].y;
          else nX = initialRectsState.current[r.id].x;
        }

        if (snapEnabled && !e.altKey) {
          const snap = (v: number, t: number[]) => { for (const target of t) if (Math.abs(v - target) <= sensitivity) return target; return v; };
          const targetsX = [0, nW, nW - r.width]; const targetsY = [0, nH, nH - r.height];
          prev.filter(tr => !selectedIds.includes(tr.id)).forEach(tr => {
            targetsX.push(tr.x, tr.x + tr.width, tr.x - r.width); targetsY.push(tr.y, tr.y + tr.height, tr.y - r.height);
          });
          nX = snap(nX, targetsX); nY = snap(nY, targetsY);
        }
        return { ...r, x: nX, y: nY };
      }

      if (mode.current === 'resizing' && activeHandle.current) {
        const origin = initialRectsState.current[r.id];
        const mainId = selectedIds[selectedIds.length - 1];
        const mainOrigin = initialRectsState.current[mainId];
        if (!origin || !mainOrigin) return r;
        
        const hdl = activeHandle.current;
        let newMainW = mainOrigin.width;
        let newMainH = mainOrigin.height;

        if (hdl.includes('r')) newMainW = Math.max(2, pos.x - mainOrigin.x);
        if (hdl.includes('l')) newMainW = Math.max(2, mainOrigin.x + mainOrigin.width - pos.x);
        if (hdl.includes('b')) newMainH = Math.max(2, pos.y - mainOrigin.y);
        if (hdl.includes('t')) newMainH = Math.max(2, mainOrigin.y + mainOrigin.height - pos.y);

        const ratioW = newMainW / mainOrigin.width;
        // Shift or global lock ratio
        const currentLockRatio = lockedRatio || (e.shiftKey ? origin.width / origin.height : null);
        const ratioH = currentLockRatio ? ratioW : newMainH / mainOrigin.height;

        let w = origin.width * ratioW;
        let h = origin.height * ratioH;
        let x = origin.x; let y = origin.y;
        if (hdl.includes('l')) x = (origin.x + origin.width) - w;
        if (hdl.includes('t')) y = (origin.y + origin.height) - h;
        return { ...r, x, y, width: w, height: h };
      }
      return r;
    }));
  }, [selectedIds, lockedRatio, snapEnabled, getScale]);

  const handleMouseUp = useCallback(() => {
    mode.current = 'none'; activeHandle.current = null;
    setRects(p => p.filter(r => r.width > 2 && r.height > 2));
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const hk = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.ctrlKey && e.key === 'c' && selectedIds.length > 0) {
        const s = rects.find(r => r.id === selectedIds[0]);
        if (s) setClipboard({ width: s.width, height: s.height });
      }
      if (e.ctrlKey && e.key === 'v' && clipboard) {
        setRects(p => [...p, { id: crypto.randomUUID(), x: 50 * getScale(), y: 50 * getScale(), width: clipboard.width, height: clipboard.height }]);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        setRects(p => p.filter(r => !selectedIds.includes(r.id)));
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', hk); return () => window.removeEventListener('keydown', hk);
  }, [selectedIds, rects, clipboard, getScale, onClose]);

  const handleFinalSave = () => {
    const rounded = rects.map(r => ({ ...r, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }));
    onSave(rounded, [parseInt(fillColor.slice(1,3),16), parseInt(fillColor.slice(3,5),16), parseInt(fillColor.slice(5,7),16)]);
  };

  const addGrid = (r: number, c: number) => {
    if (!imgRef.current) return;
    const w = imgRef.current.naturalWidth / c; const h = imgRef.current.naturalHeight / r;
    const news: Rect[] = [];
    for(let i=0; i<r; i++) for(let j=0; j<c; j++) news.push({ id: crypto.randomUUID(), x: j*w, y: i*h, width: w, height: h });
    setRects(p => [...p, ...news]);
    const next = [[r, c], ...recentGrids.filter(g => g[0] !== r || g[1] !== c)].slice(0, 3) as [number, number][];
    setRecentGrids(next);
    localStorage.setItem('recent_crop_grids', JSON.stringify(next));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col select-none" onMouseDown={() => setSelectedIds([])}>
      <header className="h-16 border-b border-white/5 bg-neutral-900/50 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Scissors className="w-4 h-4" /></div><h2 className="text-sm font-black uppercase tracking-widest text-white">Batch Crop</h2></div>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 bg-neutral-800 px-3 py-1.5 rounded-xl border border-white/5">
                <Grid3X3 className="w-3.5 h-3.5 text-neutral-500" />
                <input type="number" value={gridRows} onChange={e=>setGridRows(Number(e.target.value))} className="w-8 bg-transparent text-[11px] text-center outline-none" />
                <span className="text-neutral-600">x</span>
                <input type="number" value={gridCols} onChange={e=>setGridCols(Number(e.target.value))} className="w-8 bg-transparent text-[11px] text-center outline-none" />
                <button onClick={e=>{e.stopPropagation(); addGrid(gridRows, gridCols);}} className="px-2 py-1 bg-blue-600 rounded text-[9px] uppercase font-bold">Add Grid</button>
             </div>
             <div className="flex items-center gap-1">{recentGrids.map(([r, c], i) => (<button key={i} onClick={e=>{e.stopPropagation(); addGrid(r, c);}} className="px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-white/5 rounded text-[9px] font-mono text-neutral-400">{r}x{c}</button>))}</div>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 bg-neutral-800 px-3 py-1.5 rounded-xl border border-white/5">
                <Target className={`w-3.5 h-3.5 ${lockedRatio ? 'text-blue-500' : 'text-neutral-500'}`} />
                <button onClick={e=>{e.stopPropagation(); setLockedRatio(null);}} className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${lockedRatio===null?'bg-blue-600 text-white':'bg-neutral-800 text-neutral-500'}`}>Free</button>
                <div className="w-px h-3 bg-white/10 mx-1" />
                <input type="number" value={customRatioW} onChange={e=>setCustomRatioW(Number(e.target.value))} className="w-6 bg-transparent text-[11px] text-center outline-none" />
                <span className="text-neutral-600">:</span>
                <input type="number" value={customRatioH} onChange={e=>setCustomRatioH(Number(e.target.value))} className="w-6 bg-transparent text-[11px] text-center outline-none" />
                <button onClick={e=>{e.stopPropagation(); applyRatio(customRatioW, customRatioH);}} className="ml-1 px-2 py-1 bg-neutral-700 hover:bg-blue-600 rounded text-[9px] font-bold uppercase">Set</button>
             </div>
             <div className="flex gap-1">{recentRatios.map(([w,h],i)=>(<button key={i} onClick={e=>{e.stopPropagation(); applyRatio(w,h);}} className={`px-2 py-1.5 rounded text-[9px] font-mono border border-white/5 ${lockedRatio===(w/h)?'bg-blue-600 text-white':'bg-neutral-800 text-neutral-400'}`}>{w}:{h}</button>))}</div>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={snapEnabled} onChange={e=>setSnapEnabled(e.target.checked)} className="accent-blue-600 w-4 h-4" /><span className="text-[10px] text-neutral-400 uppercase font-bold">Snap</span></label>
        </div>
        <div className="flex items-center gap-4">
          <input type="color" value={fillColor} onChange={e=>setFillColor(e.target.value)} className="w-8 h-8 bg-transparent border-none cursor-pointer p-0" />
          <button onClick={handleFinalSave} disabled={rects.length===0} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg active:scale-95"><Save className="w-4 h-4 inline mr-2" />Process Batch ({rects.length})</button>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden flex items-center justify-center p-12 bg-[radial-gradient(#111_1px,transparent_1px)] [background-size:20px_20px]">
        <div ref={containerRef} className="relative max-w-full max-h-full shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/5 cursor-crosshair" onMouseDown={(e) => handleMouseDown(e)}>
          <img ref={imgRef} src={src} alt="Crop" draggable={false} className="max-w-full max-h-[calc(100vh-12rem)] object-contain select-none pointer-events-none" onMouseDown={e => e.preventDefault()} />
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
             {rects.map((rect) => (
                <CropBox key={rect.id} rect={rect} isSelected={selectedIds.includes(rect.id)} scale={getScale()} onMouseDown={handleMouseDown} />
             ))}
          </div>
        </div>
        {selectedIds.length > 0 && mode.current === 'none' && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-neutral-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4">
                <div className="px-3 py-1 border-r border-white/5 flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" /><span className="text-[10px] font-black uppercase text-blue-500 tracking-tighter">{selectedIds.length} Selected</span></div>
                <button onClick={(e) => { e.stopPropagation(); const s = rects.find(r => r.id === selectedIds[0]); if (s) setClipboard({ width: s.width, height: s.height }); }} className="p-2 hover:bg-white/5 rounded-lg text-neutral-400" title="Copy Size"><Copy className="w-4 h-4" /></button>
                <button onClick={(e) => { e.stopPropagation(); setRects(p => p.filter(r => !selectedIds.includes(r.id))); setSelectedIds([]); }} className="p-2 hover:bg-red-500/20 rounded-lg text-neutral-400 hover:text-red-500" title="Delete Selected"><X className="w-4 h-4" /></button>
            </div>
        )}
      </main>

      <footer className="h-10 bg-neutral-950 border-t border-white/5 flex items-center justify-between px-6 shrink-0 text-[9px] text-neutral-500 uppercase font-bold">
          <div className="flex gap-6">
            <div className="flex items-center gap-1.5"><MousePointer2 className="w-3 h-3" /> Drag to Draw</div>
            <div className="flex items-center gap-1.5 text-blue-500"><div className="w-1 h-1 bg-blue-500 rounded-full" /> Shift+Click: Multi-select</div>
            <div className="flex items-center gap-1.5 text-amber-500"><div className="w-1 h-1 bg-amber-500 rounded-full" /> Shift+Drag: Axis/Ratio Lock</div>
            <div className="flex items-center gap-1.5 text-neutral-400"><div className="w-1 h-1 bg-neutral-400 rounded-full" /> Alt: Ignore Snap</div>
          </div>
          <div className="font-mono text-[10px]">{src.split(/[\\/]/).pop()}</div>
      </footer>
    </div>
  );
};
