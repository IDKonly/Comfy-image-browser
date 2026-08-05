import { X } from "lucide-react";
// @ts-ignore
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { basename } from "./utils";
import { LABEL, ICON_BTN_DANGER, HOVER_TOOLS } from "../ui/tokens";

interface TargetImagesPanelProps {
  paths: string[];
  onRemove: (path: string) => void;
}

/**
 * Virtualized target-image list. Import controls live in the InputRail tab bar; this
 * renders only the rows so the list gets the rail's full height.
 */
export const TargetImagesPanel = ({ paths, onRemove }: TargetImagesPanelProps) => {
  if (paths.length === 0) {
    return (
      <p className={`${LABEL} p-2 leading-relaxed`}>
        No images. Add files or a folder, drop images onto this panel, or pull the current
        viewer selection in.
      </p>
    );
  }

  return (
    <div className="flex-1 min-h-0 p-1">
      <AutoSizer>
        {({ height, width }: { height: number; width: number }) => (
          <List className="scrollbar-thin" height={height} itemCount={paths.length} itemSize={20} width={width}>
            {({ index, style }: any) => {
              const p = paths[index];
              return (
                <div style={style}>
                  <div className="group flex items-center gap-1.5 px-1.5 h-[20px] rounded hover:bg-white/5">
                    <span className="flex-1 min-w-0 text-[10px] font-mono text-neutral-400 truncate" title={p}>
                      {basename(p)}
                    </span>
                    <div className={HOVER_TOOLS}>
                      <button onClick={() => onRemove(p)} className={`${ICON_BTN_DANGER} max-lg:w-6 max-lg:h-6`} aria-label={`Remove ${basename(p)}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }}
          </List>
        )}
      </AutoSizer>
    </div>
  );
};
