import { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize, Scan, RotateCcw, Scissors } from "lucide-react";

interface ZoomPanViewerProps {
  src: string;
  alt?: string;
  className?: string;
  onBatchCrop?: () => void;
}

export const ZoomPanViewer = ({ src, alt, className, onBatchCrop }: ZoomPanViewerProps) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset when image changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [src]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = -Math.sign(e.deltaY) * 0.1;
    setScale(s => Math.min(Math.max(0.1, s + delta), 5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleFit = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleOriginal = () => {
    if (imageRef.current) {
        // Calculate scale needed to match natural size
        // This is tricky because we use object-contain. 
        // A simple "2.0" or "3.0" is often good enough for inspection, 
        // but let's try to be smarter later. For now, toggle 1.0 -> 2.0
        setScale(scale === 1 ? 2 : 1);
        setPosition({ x: 0, y: 0 });
    }
  };

  return (
    <div 
      className={`relative w-full h-full overflow-hidden flex items-center justify-center bg-transparent group ${className}`}
      onWheel={handleWheel}
      ref={containerRef}
    >
      {/* Floating Toolbar */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1.5 bg-neutral-900/80 backdrop-blur-md rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 z-50 shadow-2xl translate-y-2 group-hover:translate-y-0">
        <button onClick={() => setScale(s => Math.max(0.1, s - 0.2))} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ZoomOut className="w-4 h-4 text-white" /></button>
        <span className="text-[10px] font-mono text-neutral-400 w-10 text-center select-none">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(5, s + 0.2))} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ZoomIn className="w-4 h-4 text-white" /></button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button onClick={handleFit} className="p-2 hover:bg-white/10 rounded-full transition-colors group/btn relative" title="Fit to Screen"><Maximize className="w-4 h-4 text-white" /></button>
        <button onClick={handleOriginal} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Toggle Zoom"><Scan className="w-4 h-4 text-white" /></button>
        <button onClick={() => { setScale(1); setPosition({x:0,y:0}); }} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Reset"><RotateCcw className="w-4 h-4 text-white" /></button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button onClick={onBatchCrop} className="p-2 hover:bg-blue-600/50 hover:text-white rounded-full transition-all text-blue-400" title="Batch Crop"><Scissors className="w-4 h-4" /></button>
      </div>

      <div 
        className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-full max-h-full object-contain transition-transform duration-75 will-change-transform shadow-[0_0_50px_rgba(0,0,0,0.5)] select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
};
