import { useState, useEffect, useCallback, useRef } from "react";
import { api, assetSrc } from "./api";
import { open, confirm, message } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Image as ImageIcon, ChevronLeft, ChevronRight, Filter } from "lucide-react";

import { useAppStore, SortMethod } from "./store/useAppStore";
import { useToast } from "./components/Toast";
import { ZoomPanViewer } from "./components/ZoomPanViewer";
import { WildcardTools } from "./components/WildcardTools";
import { DebugPanel } from "./components/DebugPanel";
import { TagRefiner } from "./components/TagRefiner";
import { BatchCropModule } from "./components/BatchCropModule";
import { TagClassifier } from "./components/TagClassifier";

// New Modular Components
import { Thumbnail, scheduleThumbnailGeneration } from "./components/Thumbnail";
import { SettingsModal } from "./components/SettingsModal";
import { AppHeader } from "./components/layout/AppHeader";
import { Sidebar } from "./components/layout/Sidebar";
import { Inspector } from "./components/layout/Inspector";
import { AppFooter } from "./components/layout/AppFooter";

// Hidden preloader that warms the browser cache for full-resolution originals around
// the current image (controlled by the "Image Cache Range" setting), so the viewer can
// swap from the thumbnail base layer to the full-res original instantly while browsing.
const ImageCache = ({ images, currentIndex, batchMode, batchRange, reloadTimestamp, cacheSize }: {
  images: any[], currentIndex: number, batchMode: boolean, batchRange: [number, number] | null, reloadTimestamp: number, cacheSize: number
}) => {
  const [shouldLoad, setShouldLoad] = useState(false);
  const fullImageIndices = new Set<number>();
  const thumbIndices = new Set<number>();

  useEffect(() => {
    setShouldLoad(false);
    const timer = setTimeout(() => setShouldLoad(true), 150);
    return () => clearTimeout(timer);
  }, [currentIndex, batchMode, batchRange]);

  if (!shouldLoad || images.length === 0) return null;

  if (batchMode && batchRange) {
    for (let i = 1; i <= cacheSize; i++) {
      const prev = batchRange[0] - i;
      const next = batchRange[1] + i;
      if (prev >= 0) thumbIndices.add(prev);
      if (next < images.length) thumbIndices.add(next);
    }
    for (let i = batchRange[0]; i <= Math.min(batchRange[1], batchRange[0] + 3); i++) {
      fullImageIndices.add(i);
    }
  } else {
    for (let i = 1; i <= cacheSize; i++) {
      if (currentIndex + i < images.length) fullImageIndices.add(currentIndex + i);
      if (currentIndex - i >= 0) fullImageIndices.add(currentIndex - i);
    }
  }

  return (
    <div className="hidden" aria-hidden="true">
      {Array.from(fullImageIndices).map(idx => {
        const img = images[idx];
        if (!img || !img.path) return null;
        return (
          <img
            key={`full-${img.path}-${reloadTimestamp}`}
            src={assetSrc(img.path, reloadTimestamp)}
            decoding="async"
            alt=""
          />
        );
      })}
      {Array.from(thumbIndices).map(idx => {
        const img = images[idx];
        if (!img || !img.path) return null;
        return (
          <Thumbnail 
            key={`thumb-${img.path}-${reloadTimestamp}`}
            path={img.path}
            mtime={img.mtime}
            reloadTimestamp={reloadTimestamp}
            delay={0}
            className="hidden"
          />
        );
      })}
    </div>
  );
};

function App() {
  const { 
    folderPath, recentFolders, images, currentIndex, currentMetadata, shortcuts, viewMode, batchMode, indexProgress, twitterSettings, mobileServerSettings, recursive, sortMethod, imageCacheSize,
    setFolderPath, setImages, setCurrentIndex, setCurrentMetadata, removeImages, setShortcuts, setViewMode, setBatchMode, setIndexProgress, setTwitterSettings, setRecursive,
    setWorkshopTargetPaths, workshopFilter, setWorkshopFilter, batchRange, setBatchRange, batchMap, setBatchMap,
    checkedIndices, clearChecks, sidebarWidth, setSidebarWidth, toggleCheck,
    similaritySearchActive, setSimilaritySearchActive, setSimilaritySearchTags, searchAuthFolders
  } = useAppStore();

  const { showToast } = useToast();

  // Sidebar Resizing
  const isResizing = useRef(false);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(100, Math.min(window.innerWidth * 0.8, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setSidebarWidth]);

  // Mobile Server Sync — push settings + recent folders to the backend whenever
  // either changes. Only surface a success toast when the user actually changed the
  // server settings (object identity changes), not on every recentFolders update
  // (e.g. opening a folder), which would otherwise spam the toast on each folder open.
  const prevServerSettings = useRef(mobileServerSettings);
  useEffect(() => {
    const settingsChanged = prevServerSettings.current !== mobileServerSettings;
    prevServerSettings.current = mobileServerSettings;
    api.updateMobileServer(
      { ...mobileServerSettings, authorizedFolders: mobileServerSettings.authorizedFolders || [] },
      recentFolders
    )
    .then(() => {
      if (mobileServerSettings.enabled && settingsChanged) {
        showToast("Mobile server sync success", "info");
      }
    })
    .catch(e => {
      console.error("Failed to update mobile server:", e);
      showToast(`Server Sync Error: ${e}`, "error");
    });
  }, [mobileServerSettings, recentFolders]);

  // One-time migration: move any legacy plaintext Twitter/X keys that were persisted in
  // localStorage into the OS keychain, then clear them from the store.
  useEffect(() => {
    const s = useAppStore.getState().twitterSettings;
    if (s.apiKey || s.apiSecret || s.accessToken || s.accessSecret) {
      api.saveTwitterSecrets({
        apiKey: s.apiKey,
        apiSecret: s.apiSecret,
        accessToken: s.accessToken,
        accessSecret: s.accessSecret,
      })
        .then(() => {
          setTwitterSettings({ ...s, apiKey: '', apiSecret: '', accessToken: '', accessSecret: '' });
          console.info("Migrated Twitter/X keys to secure OS keychain storage.");
        })
        .catch(e => console.error("Twitter key migration failed:", e));
    }
  }, []);
  
  // 배치 지도 업데이트 (프롬프트 기반 그룹화)
  const updateBatchMap = useCallback(async (currentImages: any[]) => {
    if (currentImages.length === 0) {
        setBatchMap({});
        return;
    }
    try {
        // 경로 기반 프롬프트 맵 가져오기 (O(1) 조회를 위해)
        const paths = currentImages.map((img: any) => img.path);
        const rawPromptMap = await api.getPromptsMapByPaths(paths);
        
        // Normalize keys to lowercase for robust matching
        const promptMap: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(rawPromptMap)) {
            promptMap[k.replace(/\\/g, '/').toLowerCase()] = v;
        }
        
        const newMap: Record<number, [number, number]> = {};
        let i = 0;
        while (i < currentImages.length) {
            let start = i;
            let end = i;
            
            // 현재 이미지의 프롬프트 (정규화: null/empty 체크 및 슬래시 변환)
            const currentPath = currentImages[i].path.replace(/\\/g, '/').toLowerCase();
            const currentPrompt = (promptMap[currentPath] || "").trim() || null;
            
            // 동일 프롬프트를 가진 '연속된' 이미지를 찾음
            // (정렬 순서가 바뀌면 배치도 그에 맞춰 재계산되어야 함)
            while (end + 1 < currentImages.length) {
                const nextPath = currentImages[end + 1].path.replace(/\\/g, '/').toLowerCase();
                const nextPrompt = (promptMap[nextPath] || "").trim() || null;
                
                // 프롬프트가 같고 둘 다 존재할 때만 묶음 (null끼리는 묶지 않음 - 개별로 취급)
                if (currentPrompt !== null && nextPrompt !== null && currentPrompt === nextPrompt) {
                    end++;
                } else {
                    break;
                }
            }
            
            for (let k = start; k <= end; k++) {
                newMap[k] = [start, end];
            }
            i = end + 1;
        }
        setBatchMap(newMap);
    } catch (e) { console.error("Batch map failed", e); }
  }, [setBatchMap]);

  // 이미지 목록 변경 시 자동 배치 지도 갱신
  const lastMapUpdate = useRef(0);
  const mapUpdateTimer = useRef<number | null>(null);

  const triggerBatchMapUpdate = useCallback((currentImages: any[], immediate = false) => {
    if (immediate) {
        if (mapUpdateTimer.current) clearTimeout(mapUpdateTimer.current);
        updateBatchMap(currentImages);
        lastMapUpdate.current = Date.now();
        return;
    }

    const now = Date.now();
    if (now - lastMapUpdate.current > 1000) {
        if (mapUpdateTimer.current) clearTimeout(mapUpdateTimer.current);
        updateBatchMap(currentImages);
        lastMapUpdate.current = now;
    } else {
        if (mapUpdateTimer.current) clearTimeout(mapUpdateTimer.current);
        mapUpdateTimer.current = window.setTimeout(() => {
            updateBatchMap(currentImages);
            lastMapUpdate.current = Date.now();
        }, 500);
    }
  }, [updateBatchMap]);

  useEffect(() => {
    triggerBatchMapUpdate(images, true);
  }, [images, batchMode, triggerBatchMapUpdate]);

  // Local UI States
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [_imageSrc, setImageSrc] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showWildcards, setShowWildcards] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showBatchCrop, setShowBatchCrop] = useState(false);
  const [showTagClassifier, setShowTagClassifier] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ model: "", sampler: "" });
  const [reloadTimestamp, setReloadTimestamp] = useState<number>(0);
  const [showViewerRefiner, setShowViewerRefiner] = useState(false);
  const [viewerTagCounts, setViewerTagCounts] = useState<Record<string, number>>({});

  const showWildcardsRef = useRef(showWildcards);
  const isTrashFolder = folderPath?.split(/[\\/]/).pop()?.toLowerCase() === '_trash';

  useEffect(() => { showWildcardsRef.current = showWildcards; }, [showWildcards]);

  const isOperating = useRef(false);

  // Handlers
  const handleTwitterUpload = useCallback(async () => {
    if (images.length === 0 || !images[currentIndex]) return;
    try {
      showToast("Preparing X upload...", "info");
      const method = await api.twitterUpload(images[currentIndex].path, twitterSettings);
      if (method === "api") {
        showToast("Directly Uploaded to X", "success");
      } else {
        showToast("Copied Image! Press Ctrl+V in browser", "success");
      }
    } catch (e: any) {
      showToast(e.toString(), "error");
    }
  }, [images, currentIndex, twitterSettings, showToast]);

  const handleOpenFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      const result = await api.scanDirectory(selected, sortMethod, recursive);
      setFolderPath(result.folder);
      setImages(result.images);
      setCurrentIndex(result.initial_index);
      showToast(`Loaded ${ result.images.length } images`, 'success');
    }
  };

  const handleReload = useCallback(async () => {
    if (!folderPath) return;
    const ts = Date.now();
    setReloadTimestamp(ts);
    const result = await api.scanDirectory(folderPath, sortMethod, recursive, true);
    setFolderPath(result.folder);
    setImages(result.images);
    if (result.images[currentIndex]) {
        const current = result.images[currentIndex];
        api.getMetadata(current.path).then(m => setCurrentMetadata(m)).catch(() => {});
        setImageSrc(assetSrc(current.path, ts));
    }
    showToast("Reloaded and Re-indexed", 'info');
  }, [folderPath, sortMethod, recursive, currentIndex, setFolderPath, setImages, setCurrentMetadata, showToast]);

  const handleOpenBatchCrop = useCallback(() => setShowBatchCrop(true), []);

  const handleSearch = async (overrideFilters?: { model: string, sampler: string }, overrideSort?: SortMethod) => {
    if (!folderPath && !searchAuthFolders) return;
    
    // Clear similarity search when a regular search is performed
    if (similaritySearchActive) {
      setSimilaritySearchActive(false);
      setSimilaritySearchTags([]);
    }
    
    const progress = useAppStore.getState().indexProgress;
    if (progress?.is_indexing) {
        showToast(`Indexing in progress (${progress.current}/${progress.total}). Search results may be incomplete.`, "info");
    }
    const filters = overrideFilters || activeFilters;
    const currentSort = overrideSort || sortMethod;
    if (!searchQuery.trim() && !filters.model && !filters.sampler && !searchAuthFolders) {
      setIsSearching(false);
      const result = await api.scanDirectory(folderPath!, currentSort, recursive);
      setImages(result.images);
      return;
    }
    setIsSearching(true);
    
    const authFoldersList = searchAuthFolders ? mobileServerSettings.authorizedFolders : null;
    const results = await api.searchAdvancedImages({
        folder: folderPath || "", query: searchQuery, model: filters.model, sampler: filters.sampler, sortMethod: currentSort, recursive,
        authFolders: authFoldersList
    });
    setImages(results);
    showToast(`Found ${results.length} matches`, 'info');
  };

  const handleSimilaritySearch = useCallback(async (numTags: number) => {
    if (images.length === 0 || !images[currentIndex]) return;
    try {
      const currentImg = images[currentIndex];
      const authFolders = mobileServerSettings.authorizedFolders || [];
      if (authFolders.length === 0) {
        showToast("Please configure Authorized Folders in Settings.", "error");
        return;
      }

      showToast("Searching similar images...", "info");
      const result = await api.searchSimilarImages({
        authFolders,
        currentImagePath: currentImg.path,
        numTags,
        filter: workshopFilter,
        activeFolder: folderPath
      });

      setImages(result.images);
      setSimilaritySearchTags(result.matched_tags);
      setSimilaritySearchActive(true);
      setCurrentIndex(0);
      showToast(`Found ${result.images.length} similar images`, "success");
    } catch (e: any) {
      showToast(`Similarity search failed: ${e}`, "error");
    }
  }, [images, currentIndex, mobileServerSettings, workshopFilter, folderPath, showToast, setImages, setSimilaritySearchTags, setSimilaritySearchActive, setCurrentIndex]);

  const handleClearSimilaritySearch = useCallback(async () => {
    setSimilaritySearchActive(false);
    setSimilaritySearchTags([]);
    handleReload();
  }, [setSimilaritySearchActive, setSimilaritySearchTags, handleReload]);

  const handleAutoClassify = async () => {
    if (!folderPath) return;
    if (await confirm("Automatically classify images into subfolders based on their names/tags?")) {
        try {
            const result = await api.autoClassify(folderPath, recursive);
            if (result.total_moved > 0) {
                let summary = `Successfully moved ${result.total_moved} images:\n\n`;
                for (const [folder, count] of Object.entries(result.folder_summary)) {
                    summary += `• ${folder}: ${count} images\n`;
                }
                await message(summary, { title: "Auto-classification Complete", kind: "info" });
                handleReload();
            } else { showToast("No matching images found", "info"); }
        } catch (e: any) { showToast(`Failed: ${e}`, "error"); }
    }
  };

  const handleDelete = useCallback(async () => {
    if (images.length === 0) return;
    let targets = checkedIndices.length > 0 ? [...checkedIndices] : [currentIndex];
    if (checkedIndices.length === 0 && batchMode && batchRange) {
        targets = [];
        for (let i = batchRange[0]; i <= batchRange[1]; i++) targets.push(i);
    }
    const pathsToDelete = targets.map(i => images[i].path);
    
    isOperating.current = true;
    try {
        if (isTrashFolder) {
            if (await confirm(`Permanently delete ${targets.length} image(s)?`)) {
                removeImages(targets);
                api.deleteToTrash(pathsToDelete).catch(e => showToast(`Failed: ${e}`, 'error'));
                showToast("Permanently Deleted", 'error');
                if (checkedIndices.length > 0) clearChecks();
            }
        } else {
            removeImages(targets, 'trash');
            api.deleteToTrash(pathsToDelete).catch(e => showToast(`Failed: ${e}`, 'error'));
            showToast("Moved to _Trash", 'info');
            if (checkedIndices.length > 0) clearChecks();
        }
    } finally {
        setTimeout(() => { isOperating.current = false; }, 500);
    }
  }, [images, currentIndex, batchMode, batchRange, isTrashFolder, removeImages, showToast, checkedIndices, clearChecks]);

  const handleKeep = useCallback(async () => {
    if (images.length === 0) return;
    let targets = checkedIndices.length > 0 ? [...checkedIndices] : [currentIndex];
    if (checkedIndices.length === 0 && batchMode && batchRange) {
        targets = [];
        for (let i = batchRange[0]; i <= batchRange[1]; i++) targets.push(i);
    }
    const pathsToKeep = targets.map(i => images[i].path);
    
    isOperating.current = true;
    try {
        removeImages(targets, 'keep');
        api.moveToKeep(pathsToKeep).catch(e => showToast(`Failed: ${e}`, 'error'));
        showToast("Moved to _Keep", 'success');
        if (checkedIndices.length > 0) clearChecks();
    } finally {
        setTimeout(() => { isOperating.current = false; }, 500);
    }
  }, [images, currentIndex, batchMode, batchRange, removeImages, showToast, checkedIndices, clearChecks]);

  const handleUndo = useCallback(async () => {
    const action = useAppStore.getState().popUndo();
    if (!action) { showToast("Nothing to undo", "info"); return; }
    try {
      for (const item of action.originalImages) {
        const fileName = item.info.path.split(/[\\/]/).pop();
        const currentPath = `${item.info.path.substring(0, item.info.path.lastIndexOf(fileName!) - 1)}/${action.targetFolder}/${fileName}`;
        await api.undoMove(item.info.path, currentPath.replace(/\/\//g, '/'));
        useAppStore.getState().insertImage(item.info, item.index);
      }
      showToast(`Undid ${action.type} operation`, "success");
    } catch (e: any) { showToast(`Undo failed: ${e}`, "error"); }
  }, [showToast]);

  const nextImage = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex(batchMode && batchRange ? (batchRange[1] + 1) % images.length : (currentIndex + 1) % images.length);
  }, [images, batchMode, batchRange, currentIndex, setCurrentIndex]);

  const prevImage = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex(batchMode && batchRange ? (batchRange[0] - 1 + images.length) % images.length : (currentIndex - 1 + images.length) % images.length);
  }, [images, batchMode, batchRange, currentIndex, setCurrentIndex]);

  const handleRandom = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex(Math.floor(Math.random() * images.length));
  }, [images, setCurrentIndex]);

  // Events & Listeners
  useEffect(() => {
    const unlisten = listen('tauri://drag-drop', async (event: any) => {
      if (showWildcardsRef.current || document.querySelector('[data-wildcard-modal]')) return;
      const paths = (event.payload as any).paths as string[];
      if (paths && paths.length > 0) {
        try {
          const result = await api.scanDirectory(paths[0], sortMethod, recursive);
          setFolderPath(result.folder); setImages(result.images); setCurrentIndex(result.initial_index);
          showToast(`Loaded ${result.images.length} images`, 'success');
        } catch (e) {}
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [sortMethod, recursive, setFolderPath, setImages, setCurrentIndex, showToast]);

  useEffect(() => {
    const unlistenProgress = listen('index-progress', (event: any) => setIndexProgress(event.payload));
    const unlistenUpdate = listen('folder-updated', async (event: any) => {
      if (isOperating.current) return;
      
      const payload = event.payload as any;
      const state = useAppStore.getState();
      if (state.similaritySearchActive) return; // Do not overwrite similarity search results
      
      if (payload.folder === state.folderPath || state.recursive) {
        // [Differential Update] 이미지 목록이 실제로 변경되었는지 확인
        const isSameCount = payload.images.length === state.images.length;
        const isSameContent = isSameCount && payload.images.every((img: any, idx: number) => 
            img.path === state.images[idx].path && img.mtime === state.images[idx].mtime
        );
        
        if (isSameContent) return;

        if (isSearching) {
            await handleSearch();
        } else {
            const currentImages = state.images;
            const currentIdx = state.currentIndex;
            
            let targetIndex = payload.initial_index !== undefined ? payload.initial_index : 0;
            if (currentImages.length > 0 && currentIdx !== undefined && currentImages[currentIdx]) {
                const currentPath = currentImages[currentIdx].path;
                const newIndex = payload.images.findIndex((img: any) => img.path === currentPath);
                if (newIndex !== -1) {
                    targetIndex = newIndex;
                    
                    // 현재 이미지가 유지된다면 metadata를 초기화하지 않고 목록만 업데이트
                    setImages(payload.images);
                    // store의 setCurrentIndex 호출 시 currentMetadata가 null로 초기화되는 것을 방지하기 위해 
                    // 직접 currentIndex 상태만 업데이트하거나, 혹은 path가 같으면 인덱스만 조용히 갱신
                    if (targetIndex !== currentIdx) {
                        setCurrentIndex(targetIndex);
                    }
                    return;
                }
            }
            
            // 이미지가 바뀌었거나 찾을 수 없는 경우에만 전체 갱신
            setImages(payload.images);
            setCurrentIndex(targetIndex);
        }
      }
    });

    const unlistenChunk = listen('metadata-chunk-updated', () => {
        // When a chunk of metadata is saved to DB, re-fetch metadata for the CURRENT image
        // just in case it was part of that chunk and is currently missing details.
        const state = useAppStore.getState();
        if (state.images.length > 0 && state.currentIndex !== undefined) {
            const currentImg = state.images[state.currentIndex];
            if (currentImg && !state.currentMetadata?.prompt) {
                api.getMetadata(currentImg.path)
                    .then(m => setCurrentMetadata(m))
                    .catch(() => {});
            }
        }
        
        // [Batch Mode Fix] Re-calculate batch map as more prompts become available in DB
        if (state.batchMode) {
            triggerBatchMapUpdate(state.images);
        }
    });

    return () => { 
        unlistenProgress.then(f => f()); 
        unlistenUpdate.then(f => f()); 
        unlistenChunk.then(f => f());
    };
  }, [setIndexProgress, setImages, setCurrentMetadata, triggerBatchMapUpdate]);

  // Scans & Updates
  const initialScanDone = useRef(false);
  useEffect(() => {
    if (folderPath && !initialScanDone.current) {
      api.scanDirectory(folderPath, sortMethod, recursive)
        .then((result) => {
          setImages(result.images);
          updateBatchMap(result.images); // 배치 지도 생성
          if (currentIndex !== undefined && result.images.length > currentIndex) setCurrentIndex(currentIndex);
          initialScanDone.current = true;
        }).catch(() => {});
    }
  }, [folderPath, updateBatchMap]);

  useEffect(() => {
    if (folderPath && initialScanDone.current) {
        const state = useAppStore.getState();
        if (state.similaritySearchActive) {
            setSimilaritySearchActive(false);
            setSimilaritySearchTags([]);
        }
        if (isSearching) handleSearch(activeFilters, sortMethod);
        else {
            const currentPath = images[currentIndex]?.path;
            api.scanDirectory(folderPath, sortMethod, recursive).then((result) => {
                setImages(result.images);
                updateBatchMap(result.images); // 이미지 목록 변경 시 지도 갱신
                if (currentPath) {
                    const newIndex = result.images.findIndex((img) => img.path === currentPath);
                    if (newIndex !== -1) setCurrentIndex(newIndex);
                }
            });
        }
    }
  }, [recursive, sortMethod, setSimilaritySearchActive, setSimilaritySearchTags]);

  // [핵심] 배치 범위 즉시 업데이트 (0ms 지연)
  useEffect(() => {
    if ((viewMode === 'Batch' || viewMode === 'Peaking') && images.length > 0) {
      const range = batchMap[currentIndex];
      if (range) {
        setBatchRange(range);
      } else {
        // 지도가 아직 없다면 (인덱싱 중 등) 싱글 이미지 범위로 폴백
        setBatchRange([currentIndex, currentIndex]);
      }
    } else if (viewMode === 'Single') setBatchRange(null);
  }, [currentIndex, images, viewMode, batchMap, setBatchRange]);

  useEffect(() => {
    if (images.length > 0 && images[currentIndex]) {
      const current = images[currentIndex];
      // 1. 최우선 순위: 인덱싱 포커스 업데이트 및 메타데이터 조회
      api.updateScanFocus(currentIndex).catch(() => {});
      api.getMetadata(current.path).then(m => setCurrentMetadata(m)).catch(() => {});

      // 2. 메인 이미지 경로 설정 (ImageCache보다 먼저 실행됨)
      setImageSrc(assetSrc(current.path, reloadTimestamp));
    } else setImageSrc(null);
  }, [currentIndex, images, reloadTimestamp, setCurrentMetadata]);

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || showSettings || showWildcards || showBatchCrop || showViewerRefiner || showDebug || showTagClassifier) return;
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') { setShowDebug(prev => !prev); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); return; }
      if (e.key.toLowerCase() === 'r') { handleReload(); return; }
      if (images.length === 0) return;
      const key = e.key.toLowerCase();
      const s = shortcuts;
      if (key === s.next.toLowerCase() || e.key === s.next) nextImage();
      else if (key === s.prev.toLowerCase() || e.key === s.prev) prevImage();
      else if (key === s.delete.toLowerCase() || e.key === s.delete) handleDelete();
      else if (key === s.keep.toLowerCase()) handleKeep();
      else if (key === s.batch.toLowerCase()) setViewMode(viewMode === 'Batch' ? 'Single' : 'Batch');
      else if (key === s.peaking.toLowerCase()) setViewMode(viewMode === 'Peaking' ? 'Single' : 'Peaking');
      else if (key === s.check.toLowerCase()) { e.preventDefault(); toggleCheck(currentIndex); }
      else if (key === s.twitter.toLowerCase()) handleTwitterUpload();
      else if (key === s.random.toLowerCase()) handleRandom();
      else if (key === s.search.toLowerCase()) { e.preventDefault(); document.getElementById('search-input')?.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, currentIndex, viewMode, batchMode, batchRange, shortcuts, showSettings, showWildcards, showBatchCrop, showViewerRefiner, showDebug, showTagClassifier, handleKeep, handleDelete, handleUndo, handleTwitterUpload, handleRandom, handleReload, nextImage, prevImage, setViewMode, setBatchMode]);

  // Pre-caching
  useEffect(() => {
    if (images.length === 0) return;
    const timer = setTimeout(() => {
      let start, end;
      if (batchMode && batchRange) {
        // In batch mode, pre-generate thumbnails for more images around the range
        start = Math.max(0, batchRange[0] - 60);
        end = Math.min(images.length - 1, batchRange[1] + 60);
      } else {
        start = Math.max(0, currentIndex - 40);
        end = Math.min(images.length - 1, currentIndex + 40);
      }
      for (let i = start; i <= end; i++) {
        if (i !== currentIndex) scheduleThumbnailGeneration(images[i].path, false).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [currentIndex, images, batchMode, batchRange]);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      <AppHeader
        viewMode={viewMode} setViewMode={setViewMode} setShowWildcards={setShowWildcards}
        recursive={recursive} setRecursive={setRecursive} 
        handleRandom={handleRandom} images={images}
        handleKeep={handleKeep} handleDelete={handleDelete} isTrashFolder={isTrashFolder}
        setShowSettings={setShowSettings} handleOpenFolder={handleOpenFolder} shortcuts={shortcuts}
        setWorkshopTargetPaths={setWorkshopTargetPaths} setShowTagClassifier={setShowTagClassifier}
      />

      <main className="flex-1 overflow-hidden flex relative">
        <Sidebar 
          searchQuery={searchQuery} setSearchQuery={setSearchQuery} handleSearch={handleSearch}
          handleAutoClassify={handleAutoClassify} showFilters={showFilters} setShowFilters={setShowFilters}
          activeFilters={activeFilters} folderPath={folderPath} handleFilterChange={(f: any) => { setActiveFilters(f); handleSearch(f); }}
          isSearching={isSearching} moveSearchResults={async () => {
             const folderName = searchQuery ? searchQuery.replace(/[^a-z0-9]/gi, '_').toLowerCase() : "filtered_results";
             if (await confirm(`Move ${images.length} files to "${folderName}"?`)) {
               await api.moveFilesToFolder(images.map(img => img.path), folderName);
               showToast(`Moved ${images.length} files`, 'success'); setSearchQuery(""); setIsSearching(false);
               const result = await api.scanDirectory(folderPath!, sortMethod, recursive);
               setImages(result.images);
             }
          }}
          images={images} currentIndex={currentIndex} batchRange={batchRange}
          setCurrentIndex={setCurrentIndex} reloadTimestamp={reloadTimestamp}
          className="h-full"
          style={{ width: viewMode === 'Peaking' ? `${sidebarWidth}px` : '288px' }}
        />

        {/* Resizable Divider - Peaking Mode Only */}
        {viewMode === 'Peaking' && (
            <div 
            onMouseDown={handleMouseDown}
            className={`w-1.5 h-full cursor-col-resize hover:bg-blue-600/50 active:bg-blue-600 transition-colors z-50 shrink-0 border-x border-black/20 ${isResizing.current ? 'bg-blue-600' : 'bg-transparent'}`}
            />
        )}

        <section className="flex-1 flex flex-col bg-[#050505] overflow-hidden relative group">
          {images.length > 0 && images[currentIndex] ? (
            <div className="relative w-full h-full flex items-center justify-center p-0 overflow-hidden group">
              <ZoomPanViewer 
                images={images} 
                currentIndex={currentIndex} 
                reloadTimestamp={reloadTimestamp}
                batchMode={batchMode}
                batchRange={batchRange}
                batchMap={batchMap}
                setCurrentIndex={setCurrentIndex}
                onBatchCrop={handleOpenBatchCrop}
                className="animate-image-change"
              />
              
              {viewMode !== 'Batch' && (
                <>
                    <div className="absolute top-6 right-6 flex flex-col gap-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button onClick={() => {
                            if (!currentMetadata?.prompt) return;
                            const tags = currentMetadata.prompt.split(',').map((s: string) => s.trim()).filter(Boolean);
                            const counts: Record<string, number> = {};
                            tags.forEach((t: string) => counts[t] = 1);
                            setViewerTagCounts(counts); setShowViewerRefiner(true);
                        }} className="p-3 bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-blue-600/20 hover:border-blue-500/50 hover:text-blue-400 transition-all shadow-2xl"><Filter className="w-5 h-5" /></button>
                    </div>

                    <button onClick={prevImage} className="absolute left-6 z-30 p-4 rounded-2xl bg-neutral-900/80 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 shadow-2xl backdrop-blur-xl"><ChevronLeft className="w-8 h-8" /></button>
                    <button onClick={nextImage} className="absolute right-6 z-30 p-4 rounded-2xl bg-neutral-900/80 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 shadow-2xl backdrop-blur-xl"><ChevronRight className="w-8 h-8" /></button>
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 bg-neutral-900/90 px-6 py-2 rounded-full text-[11px] font-bold border border-white/10 backdrop-blur-2xl shadow-2xl flex items-center gap-4"><span className="opacity-50">{images[currentIndex].name}</span><div className="w-px h-3 bg-white/10" /><span className="text-blue-400">{(images[currentIndex].size / 1024 / 1024).toFixed(2)} MB</span></div>
                  </>
                )}
              </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-10">
              <ImageIcon className="w-48 h-48 animate-pulse" />
              <p className="text-sm font-black uppercase tracking-[0.5em]">System Ready</p>
            </div>
          )}
        </section>

        {viewMode !== 'Peaking' && (
          <Inspector 
            currentMetadata={currentMetadata} handleTwitterUpload={handleTwitterUpload} 
            shortcuts={shortcuts} showToast={showToast}
            onSimilaritySearch={handleSimilaritySearch}
            onClearSimilaritySearch={handleClearSimilaritySearch}
          />
        )}
      </main>

      <SettingsModal 
        show={showSettings} onClose={() => setShowSettings(false)}
        shortcuts={shortcuts} setShortcuts={setShortcuts}
        twitterSettings={twitterSettings} setTwitterSettings={setTwitterSettings}
        folderPath={folderPath} sortMethod={sortMethod} recursive={recursive}
        setImages={setImages} showToast={showToast}
      />

      <AppFooter folderPath={folderPath} indexProgress={indexProgress} images={images} currentIndex={currentIndex} />

      <ImageCache
        images={images}
        currentIndex={currentIndex}
        batchMode={batchMode}
        batchRange={batchRange}
        reloadTimestamp={reloadTimestamp}
        cacheSize={imageCacheSize}
      />

      {showWildcards && <WildcardTools onClose={() => setShowWildcards(false)} images={images} currentIndex={currentIndex} batchRange={batchRange} />}
      
      {showTagClassifier && <TagClassifier onClose={() => setShowTagClassifier(false)} initialData="" />}

      {showViewerRefiner && (
        <TagRefiner 
            tagCounts={viewerTagCounts} initialExcluded={workshopFilter.exact_match || []} 
            onClose={() => setShowViewerRefiner(false)}
            onApply={async (excluded) => {
                setWorkshopFilter({...workshopFilter, exact_match: excluded});
                setShowViewerRefiner(false);
                try {
                    await api.writeFilterFile('default_exact_exclusion.txt', excluded.join(', '));
                    showToast(`Saved ${excluded.length} exclusions`, 'success');
                } catch (e: any) { showToast(`Save failed: ${e}`, 'error'); }
            }}
        />
      )}

      {showDebug && <DebugPanel folderPath={folderPath} onClose={() => setShowDebug(false)} />}

      {showBatchCrop && images[currentIndex] && (
        <BatchCropModule
          src={assetSrc(images[currentIndex].path)}
          onClose={() => setShowBatchCrop(false)}
          onSave={async (rects, fillColor) => {
            try {
              showToast(`Processing ${rects.length} crops...`, 'info');
              const paths = await api.processBatchCrop(
                images[currentIndex].path,
                rects.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
                fillColor as [number, number, number] | null
              );
              setShowBatchCrop(false); showToast(`Saved ${paths.length} crops`, "success");
            } catch (e: any) { showToast(e.toString(), "error"); }
          }}
        />
      )}
    </div>
  );
}

export default App;
