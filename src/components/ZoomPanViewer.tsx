import { useState, useRef, useEffect, useMemo } from "react";
import { ZoomIn, ZoomOut, Maximize, Scan, RotateCcw, Scissors } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Thumbnail, scheduleThumbnailGeneration, notifyMainImageChange } from "./Thumbnail";

interface ZoomPanViewerProps {
  images: any[];
  currentIndex: number;
  reloadTimestamp: number;
  batchMode?: boolean;
  batchRange?: [number, number] | null;
  batchMap?: Record<number, [number, number]>;
  className?: string;
  onBatchCrop?: () => void;
  setCurrentIndex?: (index: number) => void;
}

export const ZoomPanViewer = ({ 
  images, currentIndex, reloadTimestamp, batchMode, batchRange, batchMap, className, onBatchCrop, setCurrentIndex 
}: ZoomPanViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastChangeTime = useRef(Date.now());
  const lastIndex = useRef(currentIndex);
  const prefetchTimers = useRef<number[]>([]);
  
  // --- 벤치마크 상태 ---
  const [_loadTime, setLoadTime] = useState<number | null>(null);
  const startTime = useRef<number>(0);

  // --- [LCP 개선 핵심] 지능형 순차 프리페치 시스템 ---
  useEffect(() => {
    const now = Date.now();
    const diff = now - lastChangeTime.current;
    const direction = currentIndex >= lastIndex.current ? 1 : -1;
    
    // 1. 다른 모든 '비우선순위' 로딩 즉시 중단
    notifyMainImageChange();
    
    // 배치 모드라면 고해상도 로딩이 없으므로 락을 즉시 해제 (50ms)
    if (batchMode) {
        setTimeout(() => notifyMainImageChange(), 50); // 짧은 락 후 해제
    }
    
    // 2. 예약된 모든 프리페치 타이머 취소
    prefetchTimers.current.forEach(t => clearTimeout(t));
    prefetchTimers.current = [];

    // 벤치마크 시작
    startTime.current = performance.now();
    setLoadTime(null);

    const batchSize = batchMode && batchRange ? (batchRange[1] - batchRange[0] + 1) : 1;
    let multiplier = 1;
    if (diff < 100) multiplier = 15;
    else if (diff < 250) multiplier = 8;
    else if (diff < 500) multiplier = 3;
    
    const totalBufferSize = Math.min(40, batchSize * multiplier);

    // 3. 메인 이미지가 로드될 시간을 충분히 벌어줌 (500ms로 상향)
    const mainTimer = window.setTimeout(() => {
        const prefetchCount = totalBufferSize;
        const start = Math.max(0, currentIndex - (direction < 0 ? prefetchCount : 2));
        const end = Math.min(images.length - 1, currentIndex + (direction > 0 ? prefetchCount : 2));
        // 순차적으로 요청을 보내어 브라우저 동시 요청 한도(6개)를 넘지 않도록 조절
        let delayOffset = 0;
        for (let i = start; i <= end; i++) {
            if (i === currentIndex) continue;

            const timer = window.setTimeout(() => {
                // 싱글 모드 프리페치는 원본급(1024px)으로 요청하되 저우선순위(false)로 등록
                scheduleThumbnailGeneration(images[i].path, false, 1024).catch(() => {});
            }, delayOffset);

            prefetchTimers.current.push(timer);
            delayOffset += 100; 
        }

    }, 500);

    prefetchTimers.current.push(mainTimer);

    lastChangeTime.current = now;
    lastIndex.current = currentIndex;

    const cooldown = setTimeout(() => {
        // 평상시에는 버퍼를 최소화하여 메모리 확보
    }, 1500);

    return () => {
        prefetchTimers.current.forEach(t => clearTimeout(t));
        clearTimeout(cooldown);
    };
  }, [currentIndex, batchMode, batchRange, images, reloadTimestamp]);

  // DOM 스테이지 제한 (총 5장)
  const stageImages = useMemo(() => {
    if (batchMode || !images || images.length === 0) return [];
    const range = [];
    const start = Math.max(0, currentIndex - 2);
    const end = Math.min(images.length - 1, currentIndex + 2);

    for (let i = start; i <= end; i++) {
        const img = images[i];
        if (!img) continue;
        range.push({ 
            idx: i, 
            path: img.path, 
            src: `${convertFileSrc(img.path.replace(/\//g, '\\'))}${reloadTimestamp ? `?t=${reloadTimestamp}` : ''}`
        });
    }
    return range;
  }, [currentIndex, images, reloadTimestamp, batchMode]);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => { setScale(1); setPosition({ x: 0, y: 0 }); }, [currentIndex, batchMode]);

  const handleWheel = (e: React.WheelEvent) => {
    if (batchMode) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.15;
    setScale(s => Math.min(Math.max(0.1, s + delta), 10));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (batchMode) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || batchMode) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const batchSets = useMemo(() => {
    if (!batchMode || !batchRange || !batchMap) return { current: [], next: [] };
    const currentIdxs = [];
    for (let i = batchRange[0]; i <= batchRange[1]; i++) currentIdxs.push(i);
    let nextIdx = batchRange[1] + 1;
    const nextRange = nextIdx < images.length ? batchMap[nextIdx] : null;
    const nextIdxs = [];
    if (nextRange) for (let i = nextRange[0]; i <= nextRange[1]; i++) nextIdxs.push(i);
    return { 
        current: currentIdxs.map(idx => images[idx]).filter(Boolean), 
        next: nextIdxs.map(idx => images[idx]).filter(Boolean) 
    };
  }, [batchMode, batchRange, batchMap, images]);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden flex items-center justify-center bg-transparent group ${className}`}
      onWheel={handleWheel}
    >
      {!batchMode && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1.5 bg-neutral-900/80 backdrop-blur-md rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 z-50 shadow-2xl translate-y-2 group-hover:translate-y-0">
            <button onClick={() => setScale(s => Math.max(0.1, s - 0.5))} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ZoomOut className="w-4 h-4 text-white" /></button>
            <span className="text-[10px] font-mono text-neutral-400 w-10 text-center select-none">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(10, s + 0.2))} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ZoomIn className="w-4 h-4 text-white" /></button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button onClick={() => { setScale(1); setPosition({x:0,y:0}); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Maximize className="w-4 h-4 text-white" /></button>
            <button onClick={() => setScale(scale === 1 ? 2 : 1)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Scan className="w-4 h-4 text-white" /></button>
            <button onClick={() => { setScale(1); setPosition({x:0,y:0}); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><RotateCcw className="w-4 h-4 text-white" /></button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button onClick={onBatchCrop} className="p-2 hover:bg-blue-600/50 hover:text-white rounded-full transition-all text-blue-400"><Scissors className="w-4 h-4" /></button>
        </div>
      )}

      {batchMode ? (
        <div className="w-full h-full relative">
            <div 
                key={`batch-${batchRange?.[0]}`}
                className="absolute inset-0 p-8 grid gap-4 content-center justify-items-center animate-in fade-in duration-200"
                style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(batchSets.current.length))}, minmax(0, 1fr))` }}
            >
                {batchSets.current.map((img) => (
                    <Thumbnail 
                        key={img.path} 
                        path={img.path} mtime={img.mtime} reloadTimestamp={reloadTimestamp} fit="contain" delay={0}
                        onClick={() => setCurrentIndex?.(images.indexOf(img))}
                        className={`w-full h-full min-h-0 cursor-pointer rounded-2xl border-4 transition-all duration-200 hover:scale-[1.02] shadow-2xl ${images.indexOf(img) === currentIndex ? 'border-blue-500 ring-[4px] ring-blue-500/30' : 'border-white/5 hover:border-white/10'}`}
                    />
                ))}
            </div>
            <div className="hidden" aria-hidden="true">
                {/* 배치 모드 프리페치 지연 (400ms) */}
                {batchSets.next.map(img => (
                    <Thumbnail key={`next-${img.path}`} path={img.path} mtime={img.mtime} reloadTimestamp={reloadTimestamp} delay={400} />
                ))}
            </div>
        </div>
      ) : (
        <div 
          className="relative w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}
        >
          {stageImages.map((img) => {
            const isCurrent = img.idx === currentIndex;
            return (
              <img
                key={img.path}
                src={img.src}
                alt=""
                draggable={false}
                // @ts-ignore
                fetchpriority={isCurrent ? "high" : "low"}
                className={`absolute max-w-full max-h-full object-contain transition-all duration-150 will-change-transform shadow-[0_0_50px_rgba(0,0,0,0.5)] select-none
                  ${isCurrent ? 'opacity-100 z-20 scale-100' : 'opacity-0 z-0 scale-95 pointer-events-none'}
                `}
                style={isCurrent ? { transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` } : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
