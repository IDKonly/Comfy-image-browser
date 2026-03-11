interface AppFooterProps {
  folderPath: string | null;
  indexProgress: { is_indexing: boolean, current: number, total: number } | null;
  images: any[];
  currentIndex: number;
}

export const AppFooter = ({
  folderPath,
  indexProgress,
  images,
  currentIndex
}: AppFooterProps) => {
  return (
    <footer className="px-6 h-10 bg-neutral-950 border-t border-white/5 text-[10px] text-neutral-600 flex items-center justify-between shrink-0 z-10 font-medium">
      <div className="truncate font-mono italic opacity-50 w-1/4">
        {folderPath || 'No Folder Selected'}
      </div>
      
      <div className="flex-1 flex justify-center px-4">
        {indexProgress?.is_indexing && (
          <div className="flex items-center gap-3 w-full max-w-xs animate-in slide-in-from-bottom-2 duration-300">
            <span className="shrink-0 animate-pulse text-blue-500 font-black uppercase text-[8px] tracking-widest">Indexing</span>
            <div className="flex-1 h-1 bg-neutral-900 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-blue-600 transition-all duration-300 shadow-[0_0_10px_rgba(37,99,235,0.4)]" 
                style={{ width: `${(indexProgress.current / indexProgress.total) * 100}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[9px] text-neutral-400 w-16 text-right">
              {indexProgress.current} / {indexProgress.total}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-8 items-center justify-end w-1/4">
        {images.length > 0 && (
          <div className="flex gap-2">
            <span className="text-white/60 font-black tracking-tighter">{currentIndex + 1}</span>
            <span className="opacity-20 uppercase text-[8px] font-black">of</span>
            <span className="text-neutral-400 font-black tracking-tighter">{images.length}</span>
          </div>
        )}
      </div>
    </footer>
  );
};
