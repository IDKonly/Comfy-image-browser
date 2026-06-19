import React, { useRef, useEffect } from "react";
// @ts-ignore
import { FixedSizeList as List } from "react-window";
// @ts-ignore
import * as AutoSizerPkg from "react-virtualized-auto-sizer";
// @ts-ignore
const AutoSizer = AutoSizerPkg.default || AutoSizerPkg;
import { CheckSquare, Square } from "lucide-react";
import { Thumbnail } from "./Thumbnail";
import { useAppStore } from "../store/useAppStore";

interface ImageGridProps {
  images: any[];
  currentIndex: number;
  batchRange: [number, number] | null;
  setCurrentIndex: (index: number) => void;
  reloadTimestamp: number;
}

const Row = ({ index, style, data }: any) => {
  const { images, currentIndex, batchRange, setCurrentIndex, reloadTimestamp, columns, checkedIndices, toggleCheck, viewMode } = data;
  const startIndex = index * columns;
  
  const indices = [];
  for (let i = 0; i < columns; i++) {
    indices.push(startIndex + i);
  }

  const isPeaking = viewMode === 'Peaking';

  return (
    <div style={style} className="flex gap-2 p-1">
      {indices.map(idx => {
        if (!images[idx]) return null;
        const isChecked = checkedIndices.includes(idx);
        return (
          <div key={`${images[idx].path}-${reloadTimestamp}`} className="flex-1 relative group/item">
            <Thumbnail 
                path={images[idx].path} 
                mtime={images[idx].mtime}
                reloadTimestamp={reloadTimestamp} 
                onClick={() => setCurrentIndex(idx)}
                fit={isPeaking ? "contain" : "cover"}
                className={`w-full h-full cursor-pointer rounded-lg border-2 transition-all ${idx === currentIndex ? 'border-blue-500 scale-[0.98]' : (batchRange && idx >= batchRange[0] && idx <= batchRange[1]) ? 'border-blue-500/30' : 'border-transparent'}`} 
            />
            
            {/* Checkbox Overlay - Peaking Mode Only */}
            {isPeaking && (
                <button 
                onClick={(e) => { e.stopPropagation(); toggleCheck(idx); }}
                className={`absolute top-2 left-2 p-1.5 rounded-md backdrop-blur-md transition-all z-10 ${isChecked ? 'bg-blue-600 text-white scale-110 opacity-100' : 'bg-black/40 text-white/40 opacity-0 group-hover/item:opacity-100 hover:text-white hover:bg-black/60'}`}
                >
                {isChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                </button>
            )}
          </div>
        );
      })}
      {/* Spacer for incomplete rows */}
      {indices.map(idx => !images[idx] && <div key={`empty-${idx}`} className="flex-1" />)}
    </div>
  );
};

export const ImageGrid = ({ images, currentIndex, batchRange, setCurrentIndex, reloadTimestamp }: ImageGridProps) => {
  const listRef = useRef<any>(null);
  const [isLocked, setIsLocked] = React.useState(true);
  const { checkedIndices, toggleCheck, viewMode } = useAppStore();

  // Re-lock (auto-scroll to the focused item) whenever navigation changes currentIndex.
  useEffect(() => {
    setIsLocked(true);
  }, [currentIndex]);

  const handleScroll = ({ scrollUpdateWasRequested }: any) => {
    if (!scrollUpdateWasRequested && isLocked) {
      setIsLocked(false);
    }
  };

  if (images.length === 0) {
    return <div className="flex items-center justify-center h-full opacity-20 italic text-[10px]">No Images</div>;
  }

  return (
    <div className="absolute inset-0 min-h-0">
      <AutoSizer>
        {({ height, width }: any) => {
          const isPeaking = viewMode === 'Peaking';
          const colWidth = isPeaking ? 220 : 120;
          const columns = Math.max(1, Math.floor(width / colWidth));
          const rowCount = Math.ceil(images.length / columns);
          const itemHeight = (width / columns) * (isPeaking ? 1.2 : 1.0);
          
          if (listRef.current && isLocked) {
            listRef.current.scrollToItem(Math.floor(currentIndex / columns), "center");
          }

          return (
            <List
              ref={listRef}
              height={height}
              itemCount={rowCount}
              itemSize={itemHeight}
              width={width}
              itemData={{
                images,
                currentIndex,
                batchRange,
                setCurrentIndex,
                reloadTimestamp,
                columns,
                checkedIndices,
                toggleCheck,
                viewMode
              }}
              onScroll={handleScroll}
              className="scrollbar-thin absolute inset-0"
            >
              {Row}
            </List>
          );
        }}
      </AutoSizer>
    </div>
  );
};



