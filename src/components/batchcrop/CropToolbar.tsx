import { X, Save, Scissors, Target, Grid3X3 } from "lucide-react";

interface CropToolbarProps {
  gridRows: number;
  setGridRows: (v: number) => void;
  gridCols: number;
  setGridCols: (v: number) => void;
  addGrid: (r: number, c: number) => void;
  recentGrids: [number, number][];
  lockedRatio: number | null;
  setLockedRatio: (v: number | null) => void;
  customRatioW: number;
  setCustomRatioW: (v: number) => void;
  customRatioH: number;
  setCustomRatioH: (v: number) => void;
  applyRatio: (w: number, h: number) => void;
  recentRatios: [number, number][];
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  fillColor: string;
  setFillColor: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
  rectCount: number;
}

/** Top control bar for the batch crop workspace (grid, ratio, snap, fill color, save). */
export const CropToolbar = (p: CropToolbarProps) => (
  <header className="h-16 border-b border-white/5 bg-neutral-900/50 flex items-center justify-between px-6 shrink-0 z-10">
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Scissors className="w-4 h-4" /></div><h2 className="text-sm font-black uppercase tracking-widest text-white">Batch Crop</h2></div>
      <div className="w-px h-6 bg-white/10" />
      <div className="flex items-center gap-3">
         <div className="flex items-center gap-2 bg-neutral-800 px-3 py-1.5 rounded-xl border border-white/5">
            <Grid3X3 className="w-3.5 h-3.5 text-neutral-500" />
            <input type="number" value={p.gridRows} onChange={e=>p.setGridRows(Number(e.target.value))} className="w-8 bg-transparent text-[11px] text-center outline-none" />
            <span className="text-neutral-600">x</span>
            <input type="number" value={p.gridCols} onChange={e=>p.setGridCols(Number(e.target.value))} className="w-8 bg-transparent text-[11px] text-center outline-none" />
            <button onClick={e=>{e.stopPropagation(); p.addGrid(p.gridRows, p.gridCols);}} className="px-2 py-1 bg-blue-600 rounded text-[9px] uppercase font-bold">Add Grid</button>
         </div>
         <div className="flex items-center gap-1">{p.recentGrids.map(([r, c], i) => (<button key={i} onClick={e=>{e.stopPropagation(); p.addGrid(r, c);}} className="px-2 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-white/5 rounded text-[9px] font-mono text-neutral-400">{r}x{c}</button>))}</div>
      </div>
      <div className="w-px h-6 bg-white/10" />
      <div className="flex items-center gap-3">
         <div className="flex items-center gap-2 bg-neutral-800 px-3 py-1.5 rounded-xl border border-white/5">
            <Target className={`w-3.5 h-3.5 ${p.lockedRatio ? 'text-blue-500' : 'text-neutral-500'}`} />
            <button onClick={e=>{e.stopPropagation(); p.setLockedRatio(null);}} className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${p.lockedRatio===null?'bg-blue-600 text-white':'bg-neutral-800 text-neutral-500'}`}>Free</button>
            <div className="w-px h-3 bg-white/10 mx-1" />
            <input type="number" value={p.customRatioW} onChange={e=>p.setCustomRatioW(Number(e.target.value))} className="w-6 bg-transparent text-[11px] text-center outline-none" />
            <span className="text-neutral-600">:</span>
            <input type="number" value={p.customRatioH} onChange={e=>p.setCustomRatioH(Number(e.target.value))} className="w-6 bg-transparent text-[11px] text-center outline-none" />
            <button onClick={e=>{e.stopPropagation(); p.applyRatio(p.customRatioW, p.customRatioH);}} className="ml-1 px-2 py-1 bg-neutral-700 hover:bg-blue-600 rounded text-[9px] font-bold uppercase">Set</button>
         </div>
         <div className="flex gap-1">{p.recentRatios.map(([w,h],i)=>(<button key={i} onClick={e=>{e.stopPropagation(); p.applyRatio(w,h);}} className={`px-2 py-1.5 rounded text-[9px] font-mono border border-white/5 ${p.lockedRatio===(w/h)?'bg-blue-600 text-white':'bg-neutral-800 text-neutral-400'}`}>{w}:{h}</button>))}</div>
      </div>
      <div className="w-px h-6 bg-white/10" />
      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={p.snapEnabled} onChange={e=>p.setSnapEnabled(e.target.checked)} className="accent-blue-600 w-4 h-4" /><span className="text-[10px] text-neutral-400 uppercase font-bold">Snap</span></label>
    </div>
    <div className="flex items-center gap-4">
      <input type="color" value={p.fillColor} onChange={e=>p.setFillColor(e.target.value)} className="w-8 h-8 bg-transparent border-none cursor-pointer p-0" />
      <button onClick={p.onSave} disabled={p.rectCount===0} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg active:scale-95"><Save className="w-4 h-4 inline mr-2" />Process Batch ({p.rectCount})</button>
      <button onClick={p.onClose} className="p-2 text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>
    </div>
  </header>
);
