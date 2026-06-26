import { useState, useRef, useEffect, useMemo, memo } from "react";
import { ZoomIn, ZoomOut, Maximize, Scan, RotateCcw, Scissors } from "lucide-react";
import { assetSrc } from "../api";
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
  onImageContextMenu?: (e: React.MouseEvent, path: string) => void;
}

/**
 * Instant-paint base layer for the main viewer. Shows the (cheap, cached) 1024px
 * thumbnail immediately so navigation never flashes a blank frame while the heavy
 * full-resolution original decodes behind it. Fades out once the original is ready.
 */
const PreviewThumb = ({ path, reloadTimestamp, hidden, style }: {
  path: string; reloadTimestamp: number; hidden: boolean; style?: React.CSSProperties;
}) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSrc(null);
    // Priority request so it bypasses the main-image loading lock and paints ASAP.
    scheduleThumbnailGeneration(path, true, 1024)
      .then(res => {
        if (!active) return;
        setSrc(assetSrc(res, reloadTimestamp));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [path, reloadTimestamp]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      decoding="async"
      className={`absolute max-w-full max-h-full object-contain z-10 pointer-events-none select-none transition-opacity duration-200 ${hidden ? 'opacity-0' : 'opacity-100'}`}
      style={style}
    />
  );
};

export const ZoomPanViewer = memo(({
  images, currentIndex, reloadTimestamp, batchMode, batchRange, batchMap, className, onBatchCrop, setCurrentIndex, onImageContextMenu
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

    return () => {
        prefetchTimers.current.forEach(t => clearTimeout(t));
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
            src: assetSrc(img.path, reloadTimestamp)
        });
    }
    return range;
  }, [currentIndex, images, reloadTimestamp, batchMode]);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Progressive loading: track whether the current full-res original has decoded so we
  // can keep the thumbnail base layer visible until then (no blank flash / late pop-in).
  const currentPath = images[currentIndex]?.path as string | undefined;
  const [currentLoaded, setCurrentLoaded] = useState(false);
  const currentImgRef = useRef<HTMLImageElement>(null);

  useEffect(() => { setScale(1); setPosition({ x: 0, y: 0 }); }, [currentIndex, batchMode, images[currentIndex]?.path]);

  useEffect(() => {
    setCurrentLoaded(false);
    // If the <img> element was reused and is already decoded (e.g. it was a preloaded
    // neighbor), onLoad won't fire again — reveal it immediately.
    if (currentImgRef.current?.complete && currentImgRef.current.naturalWidth > 0) {
      setCurrentLoaded(true);
    }
  }, [currentPath, reloadTimestamp]);

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

  const [displayBatch, setDisplayBatch] = useState<{current: any[], range: [number, number] | null}>({current: [], range: null});
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (!batchMode) {
        if (displayBatch.current.length > 0 || displayBatch.range !== null) {
            setDisplayBatch({current: [], range: null});
        }
        return;
    }
    
    if (batchRange) {
        // 이미 표시 중인 범위와 이미지가 모두 같다면 업데이트 스킵
        const currentBatchPaths = displayBatch.current.map(img => img.path).join('|');
        const newBatchIdxs = [];
        for (let i = batchRange[0]; i <= batchRange[1]; i++) newBatchIdxs.push(i);
        const newBatchPaths = newBatchIdxs.map(idx => images[idx]?.path).filter(Boolean).join('|');

        if (displayBatch.range && 
            displayBatch.range[0] === batchRange[0] && 
            displayBatch.range[1] === batchRange[1] &&
            currentBatchPaths === newBatchPaths
        ) {
            return;
        }

        setIsTransitioning(true);
        // 짧은 지연 후 새로운 배치로 교체 (이미지 로딩 시간을 벌어줌)
        const timer = setTimeout(() => {
            const currentIdxs = [];
            for (let i = batchRange[0]; i <= batchRange[1]; i++) currentIdxs.push(i);
            setDisplayBatch({
                current: currentIdxs.map(idx => images[idx]).filter(Boolean),
                range: batchRange
            });
            setIsTransitioning(false);
        }, 50); 
        return () => clearTimeout(timer);
    }
  }, [batchMode, batchRange, images, displayBatch.range, displayBatch.current]);

  const batchSets = useMemo(() => {
    if (!batchMode || !batchRange || !batchMap) return { current: [], next: [] };
    
    let nextIdx = batchRange[1] + 1;
    const nextRange = nextIdx < images.length ? batchMap[nextIdx] : null;
    const nextIdxs = [];
    if (nextRange) for (let i = nextRange[0]; i <= nextRange[1]; i++) nextIdxs.push(i);
    
    return { 
        current: displayBatch.current, 
        next: nextIdxs.map(idx => images[idx]).filter(Boolean) 
    };
  }, [batchMode, batchRange, batchMap, images, displayBatch.current]);

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
                key={`batch-${displayBatch.range?.[0]}`}
                className={`absolute inset-0 p-8 grid gap-4 content-center justify-items-center transition-all duration-300 ${isTransitioning ? 'opacity-50 scale-98 blur-[2px]' : 'opacity-100 scale-100 blur-0'} animate-in fade-in`}
                style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(Math.max(1, batchSets.current.length)))}, minmax(0, 1fr))` }}
            >
                {batchSets.current.map((img) => (
                    <Thumbnail
                        key={img.path}
                        path={img.path} mtime={img.mtime} reloadTimestamp={reloadTimestamp} fit="contain" delay={0}
                        onClick={() => setCurrentIndex?.(images.indexOf(img))}
                        onContextMenu={(e) => onImageContextMenu?.(e, img.path)}
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
          onContextMenu={(e) => currentPath && onImageContextMenu?.(e, currentPath)}
        >
          {currentPath && (
            <PreviewThumb
              path={currentPath}
              reloadTimestamp={reloadTimestamp}
              hidden={currentLoaded}
              style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
            />
          )}
          {stageImages.map((img) => {
            const isCurrent = img.idx === currentIndex;
            return (
              <img
                key={img.path}
                ref={isCurrent ? currentImgRef : undefined}
                src={img.src}
                alt=""
                draggable={false}
                // @ts-ignore
                fetchpriority={isCurrent ? "high" : "low"}
                onLoad={isCurrent ? () => setCurrentLoaded(true) : undefined}
                className={`absolute max-w-full max-h-full object-contain transition-all duration-150 will-change-transform shadow-[0_0_50px_rgba(0,0,0,0.5)] select-none
                  ${isCurrent ? `${currentLoaded ? 'opacity-100' : 'opacity-0'} z-20 scale-100` : 'opacity-0 z-0 scale-95 pointer-events-none'}
                `}
                style={isCurrent ? { transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` } : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});
