import { useState, useEffect, useRef, useCallback } from "react";
import { Rect } from "./batchcrop/types";
import { hexToRgb, roundRect, snapValue, loadRecentPairs, pushRecentPair } from "./batchcrop/utils";
import { CropBox } from "./batchcrop/CropBox";
import { CropToolbar } from "./batchcrop/CropToolbar";
import { SelectionActionBar } from "./batchcrop/SelectionActionBar";
import { CropHints } from "./batchcrop/CropHints";

interface BatchCropModuleProps {
  src: string;
  onClose: () => void;
  onSave: (rects: Rect[], fillColor: [number, number, number]) => void;
}

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
  const [recentGrids, setRecentGrids] = useState<[number, number][]>(() => loadRecentPairs('recent_crop_grids', [[2,2],[3,3],[4,4]]));
  const [recentRatios, setRecentRatios] = useState<[number, number][]>(() => loadRecentPairs('recent_crop_ratios', [[1,1],[3,2],[16,9]]));

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
    setRecentRatios(pushRecentPair(recentRatios, w, h, 'recent_crop_ratios'));
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
          const targetsX = [0, nW, nW - r.width]; const targetsY = [0, nH, nH - r.height];
          prev.filter(tr => !selectedIds.includes(tr.id)).forEach(tr => {
            targetsX.push(tr.x, tr.x + tr.width, tr.x - r.width); targetsY.push(tr.y, tr.y + tr.height, tr.y - r.height);
          });
          nX = snapValue(nX, targetsX, sensitivity); nY = snapValue(nY, targetsY, sensitivity);
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
    onSave(rects.map(roundRect), hexToRgb(fillColor));
  };

  const addGrid = (r: number, c: number) => {
    if (!imgRef.current) return;
    const w = imgRef.current.naturalWidth / c; const h = imgRef.current.naturalHeight / r;
    const news: Rect[] = [];
    for(let i=0; i<r; i++) for(let j=0; j<c; j++) news.push({ id: crypto.randomUUID(), x: j*w, y: i*h, width: w, height: h });
    setRects(p => [...p, ...news]);
    setRecentGrids(pushRecentPair(recentGrids, r, c, 'recent_crop_grids'));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col select-none" onMouseDown={() => setSelectedIds([])}>
      <CropToolbar
        gridRows={gridRows} setGridRows={setGridRows} gridCols={gridCols} setGridCols={setGridCols}
        addGrid={addGrid} recentGrids={recentGrids}
        lockedRatio={lockedRatio} setLockedRatio={setLockedRatio}
        customRatioW={customRatioW} setCustomRatioW={setCustomRatioW}
        customRatioH={customRatioH} setCustomRatioH={setCustomRatioH}
        applyRatio={applyRatio} recentRatios={recentRatios}
        snapEnabled={snapEnabled} setSnapEnabled={setSnapEnabled}
        fillColor={fillColor} setFillColor={setFillColor}
        onSave={handleFinalSave} onClose={onClose} rectCount={rects.length}
      />

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
            <SelectionActionBar
                count={selectedIds.length}
                onCopySize={(e) => { e.stopPropagation(); const s = rects.find(r => r.id === selectedIds[0]); if (s) setClipboard({ width: s.width, height: s.height }); }}
                onDelete={(e) => { e.stopPropagation(); setRects(p => p.filter(r => !selectedIds.includes(r.id))); setSelectedIds([]); }}
            />
        )}
      </main>

      <CropHints fileName={src.split(/[\\/]/).pop() || ''} />
    </div>
  );
};
