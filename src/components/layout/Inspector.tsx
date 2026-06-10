import React from "react";
import { Twitter, ExternalLink, Sparkles } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ImageMetadata, useAppStore } from "../../store/useAppStore";
import { api } from "../../api";

interface InspectorProps {
  currentMetadata: ImageMetadata | null;
  handleTwitterUpload: () => void;
  shortcuts: any;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
  onSimilaritySearch: (numTags: number) => void;
  onClearSimilaritySearch: () => void;
}

export const Inspector = React.memo(({
  currentMetadata,
  handleTwitterUpload,
  shortcuts,
  showToast,
  onSimilaritySearch,
  onClearSimilaritySearch
}: InspectorProps) => {
  // Subscribe only to the slices this component actually renders, so unrelated store
  // updates (navigation, image list, batch map, …) don't re-render the Inspector.
  const similaritySearchActive = useAppStore(s => s.similaritySearchActive);
  const similaritySearchNumTags = useAppStore(s => s.similaritySearchNumTags);
  const setSimilaritySearchNumTags = useAppStore(s => s.setSimilaritySearchNumTags);
  const similaritySearchTags = useAppStore(s => s.similaritySearchTags);
  const mobileServerSettings = useAppStore(s => s.mobileServerSettings);

  const handleDanbooruSearch = async () => {
    // Values only needed at click-time are read on demand (not subscribed to).
    const { images, currentIndex, folderPath, workshopFilter } = useAppStore.getState();
    const currentImg = images[currentIndex];
    if (!currentImg) return;

    if (similaritySearchActive && similaritySearchTags.length > 0) {
      const targetTags = similaritySearchTags.slice(0, 2);
      const formatted = targetTags.map(tag => tag.replace(/\\/g, '').trim().replace(/\s+/g, '_')).join('+');
      const url = `https://danbooru.donmai.us/posts?tags=${formatted}`;
      try {
        await openUrl(url);
      } catch (e: any) {
        showToast(`Failed to open URL: ${e}`, 'error');
      }
      return;
    }

    try {
      showToast("Fetching tags for Danbooru search...", "info");
      const authFolders = mobileServerSettings.authorizedFolders || [];
      if (authFolders.length === 0) {
        showToast("Please configure Authorized Folders in Settings.", "error");
        return;
      }

      const result = await api.searchSimilarImages({
        authFolders,
        currentImagePath: currentImg.path,
        numTags: 2,
        filter: workshopFilter,
        activeFolder: folderPath
      });

      const targetTags = result.matched_tags;
      if (!targetTags || targetTags.length === 0) {
        showToast("No tags found for this image.", "error");
        return;
      }

      const formatted = targetTags.map(tag => tag.replace(/\\/g, '').trim().replace(/\s+/g, '_')).join('+');
      const url = `https://danbooru.donmai.us/posts?tags=${formatted}`;
      await openUrl(url);
    } catch (e: any) {
      showToast(`Failed to search Danbooru: ${e}`, "error");
    }
  };

  return (
    <aside className="w-80 border-l border-white/5 bg-neutral-900 flex flex-col shrink-0 overflow-hidden text-left">
      <div className="p-6 border-b border-white/5 flex items-center justify-between font-black uppercase tracking-widest text-[11px]">
        <span>Inspector</span>
        <div className="flex gap-3 items-center">
          {currentMetadata && (
            <>
              <button 
                onClick={handleTwitterUpload} 
                className="p-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-all" 
                title={`Share on X (${shortcuts.twitter})`}
              >
                <Twitter className="w-3.5 h-3.5" />
              </button>

              <button 
                onClick={handleDanbooruSearch} 
                className="p-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-all" 
                title="Search in Danbooru"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <button 
                onClick={() => {
                  if (similaritySearchActive) {
                    onClearSimilaritySearch();
                  } else {
                    onSimilaritySearch(similaritySearchNumTags);
                  }
                }} 
                className={`p-1.5 rounded-lg transition-all ${similaritySearchActive ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' : 'bg-blue-600/10 hover:bg-blue-600/20 text-blue-400'}`}
                title={similaritySearchActive ? "Clear Similarity Search" : "Find Similar Images"}
              >
                <Sparkles className={`w-3.5 h-3.5 ${similaritySearchActive ? 'animate-pulse' : ''}`} />
              </button>
            </>
          )}
          {currentMetadata && (
            <button 
              onClick={() => { 
                navigator.clipboard.writeText(currentMetadata.raw); 
                showToast('Raw Copied', 'success'); 
              }} 
              className="text-[9px] text-neutral-500 hover:text-white uppercase transition-colors"
            >
              Raw
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin">
        {currentMetadata ? (
          <>
            {currentMetadata.prompt && (
              <div className="space-y-3">
                <div className="text-blue-500 text-[9px] font-black uppercase tracking-widest text-left">Prompt</div>
                <div className="bg-neutral-950 p-4 rounded-2xl leading-relaxed text-[11px] border border-white/5 select-text shadow-inner text-left">
                  {currentMetadata.prompt}
                </div>
              </div>
            )}
            {currentMetadata.negative_prompt && (
              <div className="space-y-3">
                <div className="text-red-500 text-[9px] font-black uppercase tracking-widest text-left">Negative</div>
                <div className="bg-neutral-950 p-4 rounded-2xl leading-relaxed text-[11px] border border-white/5 select-text shadow-inner text-left">
                  {currentMetadata.negative_prompt}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-left">
              {[
                { label: 'Steps', value: currentMetadata.steps },
                { label: 'CFG', value: currentMetadata.cfg },
                { label: 'Sampler', value: currentMetadata.sampler, full: true },
                { label: 'Model', value: currentMetadata.model, full: true }
              ].map((item, i) => item.value && (
                <div key={i} className={`bg-neutral-950 p-4 rounded-2xl border border-white/5 ${item.full ? 'col-span-2' : ''}`}>
                  <div className="text-neutral-600 text-[9px] font-black uppercase mb-1 text-left">{item.label}</div>
                  <div className="font-bold text-[11px] truncate select-text text-neutral-200 text-left">{item.value}</div>
                </div>
              ))}
            </div>

            {/* Similarity Search Section */}
            <div className="space-y-4 pt-6 border-t border-white/5 text-left">
              <div className="text-blue-500 text-[9px] font-black uppercase tracking-widest text-left">Similarity Search</div>
              <div className="bg-neutral-950 p-4 rounded-2xl border border-white/5 space-y-4 shadow-inner text-left">
                {similaritySearchActive ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider text-green-400">Search Active</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        <span>Match Rarest Tags</span>
                        <span className="text-blue-400 font-mono">{similaritySearchNumTags} Tags</span>
                      </div>
                      <div className="flex justify-between gap-1.5">
                        {[2, 3, 5, 7, 10].map(val => (
                          <button
                            key={val}
                            onClick={() => {
                              setSimilaritySearchNumTags(val);
                              onSimilaritySearch(val);
                            }}
                            className={`flex-1 py-1.5 text-[10px] font-mono rounded-lg transition-all border ${similaritySearchNumTags === val ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/15' : 'bg-solid-element border-white/5 text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-[9px] text-neutral-500 italic leading-relaxed uppercase">Matching rarest {similaritySearchTags.length} tags:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {similaritySearchTags.map(tag => (
                        <span key={tag} className="text-[9px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/10">{tag}</span>
                      ))}
                    </div>
                    <button 
                      onClick={handleDanbooruSearch}
                      className="w-full py-2.5 bg-blue-950/10 hover:bg-blue-600/20 border border-blue-500/20 hover:border-blue-500/30 rounded-xl text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-all active:scale-95 shadow-md flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Search in Danbooru
                    </button>
                    <button 
                      onClick={onClearSimilaritySearch} 
                      className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-white/5 hover:border-white/10 rounded-xl text-[10px] font-black uppercase text-neutral-400 hover:text-white transition-all active:scale-95 shadow-md flex items-center justify-center gap-2"
                    >
                      Clear Search
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        <span>Match Rarest Tags</span>
                        <span className="text-blue-400 font-mono">{similaritySearchNumTags} Tags</span>
                      </div>
                      <div className="flex justify-between gap-1.5">
                        {[2, 3, 5, 7, 10].map(val => (
                          <button
                            key={val}
                            onClick={() => setSimilaritySearchNumTags(val)}
                            className={`flex-1 py-1.5 text-[10px] font-mono rounded-lg transition-all border ${similaritySearchNumTags === val ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/15' : 'bg-solid-element border-white/5 text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    {!mobileServerSettings.authorizedFolders || mobileServerSettings.authorizedFolders.length === 0 ? (
                      <div className="text-[9px] text-amber-500/80 italic leading-relaxed uppercase p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl text-center">
                        Please add folders to "Authorized Folders" in Settings to search.
                      </div>
                    ) : (
                      <button 
                        onClick={() => onSimilaritySearch(similaritySearchNumTags)} 
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.45)] transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        Find Similar Images
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center opacity-20 italic text-[10px]">No Data</div>
        )}
      </div>
    </aside>
  );
});
