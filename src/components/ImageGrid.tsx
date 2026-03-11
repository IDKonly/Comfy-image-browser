import React, { useRef, useEffect } from "react";
// @ts-ignore
import * as ReactWindow from "react-window";
const List = ReactWindow.FixedSizeList || (ReactWindow as any).default?.FixedSizeList || ReactWindow;
// @ts-ignore
import * as AutoSizerPkg from "react-virtualized-auto-sizer";
// @ts-ignore
const AutoSizer = AutoSizerPkg.default || AutoSizerPkg;
import { Thumbnail } from "./Thumbnail";

interface ImageGridProps {
  images: any[];
  currentIndex: number;
  batchRange: [number, number] | null;
  setCurrentIndex: (index: number) => void;
  reloadTimestamp: number;
}

const Row = ({ index, style, data }: any) => {
  const { images, currentIndex, batchRange, setCurrentIndex, reloadTimestamp } = data;
  const i1 = index * 2, i2 = index * 2 + 1;
  return (
    <div style={style} className="flex gap-2 p-1">
      {[i1, i2].map(idx => images[idx] && (
        <Thumbnail 
            key={`${images[idx].path}-${reloadTimestamp}`} 
            path={images[idx].path} 
            mtime={images[idx].mtime}
            reloadTimestamp={reloadTimestamp} 
            onClick={() => setCurrentIndex(idx)}
            className={`flex-1 aspect-square cursor-pointer rounded-lg border-2 transition-all ${idx === currentIndex ? 'border-blue-500 scale-[0.98]' : (batchRange && idx >= batchRange[0] && idx <= batchRange[1]) ? 'border-blue-500/30' : 'border-transparent opacity-60 hover:opacity-100'}`} 
        />
      ))}
    </div>
  );
};

export const ImageGrid = ({ images, currentIndex, batchRange, setCurrentIndex, reloadTimestamp }: ImageGridProps) => {
  const listRef = useRef<any>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(Math.floor(currentIndex / 2));
    }
  }, [currentIndex]);

  const itemData = React.useMemo(() => ({
    images,
    currentIndex,
    batchRange,
    setCurrentIndex,
    reloadTimestamp
  }), [images, currentIndex, batchRange, setCurrentIndex, reloadTimestamp]);

  if (images.length === 0) {
    return <div className="flex items-center justify-center h-full opacity-20 italic text-[10px]">No Images</div>;
  }

  return (
    <div className="absolute inset-0 min-h-0">
      <AutoSizer>
        {({ height, width }: any) => (
          <List
            ref={listRef}
            height={height}
            itemCount={Math.ceil(images.length / 2)}
            itemSize={width / 2}
            width={width}
            itemData={itemData}
            className="scrollbar-thin absolute inset-0"
          >
            {Row}
          </List>
        )}
      </AutoSizer>
    </div>
  );
};
