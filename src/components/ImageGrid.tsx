import React, { useRef, useEffect } from "react";
// @ts-ignore
import { FixedSizeList as List } from "react-window";
// @ts-ignore
import * as AutoSizerPkg from "react-virtualized-auto-sizer";
// @ts-ignore
const AutoSizer = AutoSizerPkg.default || AutoSizerPkg;
import { Check } from "lucide-react";
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
        const isCurrent = idx === currentIndex;
        const inBatch = batchRange && idx >= batchRange[0] && idx <= batchRange[1];

        if (isPeaking) {
          return (
            <div
              key={`${images[idx].path}-${reloadTimestamp}`}
              className="flex-1 relative cursor-pointer"
              onClick={() => { setCurrentIndex(idx); toggleCheck(idx); }}
            >
              <Thumbnail
                path={images[idx].path}
                mtime={images[idx].mtime}
                reloadTimestamp={reloadTimestamp}
                fit="contain"
                className={`w-full h-full rounded-lg border-2 transition-all duration-150 ${isChecked ? 'border-blue-500 scale-[0.96]' : 'border-transparent hover:border-white/20'}`}
              />
              {/* 선택 오버레이 */}
              {isChecked && (
                <div className="absolute inset-0 rounded-lg bg-blue-500/20 pointer-events-none" />
              )}
              {/* 체크 배지 */}
              <div className={`absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center shadow-lg pointer-events-none transition-all duration-150 ${isChecked ? 'bg-blue-600 scale-100 opacity-100' : 'bg-black/40 scale-75 opacity-0'}`}>
                <Check className="w-3 h-3 text-white" />
              </div>
              {/* 현재 포커스 링 */}
              {isCurrent && (
                <div className="absolute inset-0 rounded-lg ring-2 ring-white/50 pointer-events-none" />
              )}
            </div>
          );
        }

        return (
          <div key={`${images[idx].path}-${reloadTimestamp}`} className="flex-1 relative">
            <Thumbnail
              path={images[idx].path}
              mtime={images[idx].mtime}
              reloadTimestamp={reloadTimestamp}
              onClick={() => setCurrentIndex(idx)}
              fit="cover"
              className={`w-full h-full cursor-pointer rounded-lg border-2 transition-all ${isCurrent ? 'border-blue-500 scale-[0.98]' : inBatch ? 'border-blue-500/30' : 'border-transparent'}`}
            />
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
  const { checkedIndices, toggleCheck, viewMode, peakingColumns } = useAppStore();

  // Re-lock (auto-scroll to the focused item) whenever navigation changes currentIndex.
  // Peaking 모드에서는 사용자가 스크롤 위치를 직접 제어하므로 비활성화.
  useEffect(() => {
    if (viewMode !== 'Peaking') setIsLocked(true);
  }, [currentIndex, viewMode]);

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
          const columns = isPeaking
            ? Math.max(1, peakingColumns)
            : Math.max(1, Math.floor(width / 120));
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



