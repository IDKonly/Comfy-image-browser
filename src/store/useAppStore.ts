import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ImageInfo {
  path: string;
  name: string;
  mtime: number;
  size: number;
}

export interface ImageMetadata {
  prompt: string | null;
  negative_prompt: string | null;
  steps: number | null;
  sampler: string | null;
  cfg: number | null;
  seed: number | null;
  model: string | null;
  raw: string;
}

export interface IndexProgress {
  total: number;
  current: number;
  is_indexing: boolean;
}

export interface UndoAction {
  type: 'keep' | 'trash' | 'move';
  originalImages: { info: ImageInfo, index: number }[];
  targetFolder: string;
}

export interface Shortcuts {
  next: string;
  prev: string;
  delete: string;
  keep: string;
  batch: string;
  search: string;
  twitter: string;
  random: string;
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
  next: 'ArrowRight',
  prev: 'ArrowLeft',
  delete: 'Delete',
  keep: 'k',
  batch: 'b',
  search: '/',
  twitter: 't',
  random: 'q',
};

export interface TwitterSettings {
  template: string;
  phrasesToPick: string[];
  autoCopyImage: boolean;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export type SortMethod = 'Newest' | 'Oldest' | 'NameAsc' | 'NameDesc';

export interface FilterState {
  partial_match: string[];
  exact_match: string[];
  exceptions: string[];
  max_words: number;
  min_tags: number;
  max_depth: number;
  simple_mode: boolean;
  simple_exclusions: string[];
  mix_mode: boolean;
  mix_depth: number;
  mix_tandem_min_branches: number;
  mix_tandem_ratio: number;
}

export interface MobileServerSettings {
  enabled: boolean;
  port: number;
  localOnly: boolean;
  authorizedFolders: string[];
}

interface AppState {
  folderPath: string | null;
  recentFolders: string[];
  images: ImageInfo[];
  currentIndex: number;
  currentMetadata: ImageMetadata | null;
  shortcuts: Shortcuts;
  batchMode: boolean;
  undoStack: UndoAction[];
  indexProgress: IndexProgress | null;
  twitterSettings: TwitterSettings;
  mobileServerSettings: MobileServerSettings;
  recursive: boolean;
  sortMethod: SortMethod;
  workshopFilter: FilterState;
  classifierSettings?: any;
  imageCacheSize: number;
  batchRange: [number, number] | null;
  batchMap: Record<number, [number, number]>;
  workshopTargetPaths: string[];
  
  setFolderPath: (path: string | null) => void;
  setRecentFolders: (folders: string[]) => void;
  setImages: (images: ImageInfo[]) => void;
  setCurrentIndex: (index: number) => void;
  setCurrentMetadata: (metadata: ImageMetadata | null) => void;
  setIndexProgress: (progress: IndexProgress | null) => void;
  removeImages: (indices: number[], undoType?: 'keep' | 'trash' | 'move') => void;
  insertImage: (info: ImageInfo, index: number) => void;
  setShortcuts: (shortcuts: Shortcuts) => void;
  setBatchMode: (mode: boolean) => void;
  pushUndo: (action: UndoAction) => void;
  popUndo: () => UndoAction | undefined;
  setTwitterSettings: (settings: TwitterSettings) => void;
  setMobileServerSettings: (settings: MobileServerSettings) => void;
  setRecursive: (recursive: boolean) => void;
  setSortMethod: (method: SortMethod) => void;
  setWorkshopFilter: (filter: FilterState) => void;
  setImageCacheSize: (size: number) => void;
  setBatchRange: (range: [number, number] | null) => void;
  setBatchMap: (map: Record<number, [number, number]>) => void;
  setWorkshopTargetPaths: (paths: string[]) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      folderPath: null,
      recentFolders: [],
      images: [],
      currentIndex: 0,
      currentMetadata: null,
      shortcuts: DEFAULT_SHORTCUTS,
      batchMode: false,
      undoStack: [],
      indexProgress: null,
      recursive: false,
      sortMethod: 'NameAsc',
      imageCacheSize: 5,
      batchRange: null,
      batchMap: {},
      workshopTargetPaths: [],
      twitterSettings: {
        template: "{hashtags}\n\n{phrases}\n\n#AIArt #StableDiffusion #ComfyUI",
        phrasesToPick: ["1girl", "masterpiece", "solo", "ultra detailed"],
        autoCopyImage: true,
        apiKey: "",
        apiSecret: "",
        accessToken: "",
        accessSecret: "",
      },
      mobileServerSettings: {
        enabled: false,
        port: 4882,
        localOnly: true,
        authorizedFolders: [],
      },
      workshopFilter: {
        partial_match: [],
        exact_match: [],
        exceptions: [],
        max_words: 5,
        min_tags: 1,
        max_depth: 5,
        simple_mode: false,
        simple_exclusions: [],
        mix_mode: false,
        mix_depth: 2,
        mix_tandem_min_branches: 2,
        mix_tandem_ratio: 0.51
      },
      classifierSettings: {},

      setTwitterSettings: (twitterSettings) => set({ twitterSettings }),
      setMobileServerSettings: (mobileServerSettings) => set({ 
        mobileServerSettings: {
            ...mobileServerSettings,
            authorizedFolders: mobileServerSettings.authorizedFolders || []
        } 
      }),
      setRecursive: (recursive) => set({ recursive }),
      setSortMethod: (sortMethod) => set({ sortMethod }),
      setWorkshopFilter: (workshopFilter) => set({ workshopFilter }),
      setClassifierSettings: (classifierSettings: any) => set({ classifierSettings }),
      setImageCacheSize: (imageCacheSize) => set({ imageCacheSize }),
      setBatchRange: (batchRange) => set({ batchRange }),
      setBatchMap: (batchMap) => set({ batchMap }),
      setWorkshopTargetPaths: (workshopTargetPaths) => set({ workshopTargetPaths }),

      setFolderPath: (path) => set((state) => {
        if (!path) return { folderPath: null, undoStack: [] };
        const recent = [path, ...state.recentFolders.filter(f => f !== path)].slice(0, 5);
        return { folderPath: path, recentFolders: recent, undoStack: [] };
      }),
      setRecentFolders: (recentFolders) => set({ recentFolders }),
      setImages: (images) => set({ images }),
      setCurrentIndex: (index) => set({ currentIndex: index, currentMetadata: null }),
      setCurrentMetadata: (metadata) => set({ currentMetadata: metadata }),
      setIndexProgress: (progress) => set({ indexProgress: progress }),
      setBatchMode: (mode) => set({ batchMode: mode }),
      
      pushUndo: (action) => set((state) => ({ 
        undoStack: [action, ...state.undoStack].slice(0, 50) 
      })),

      popUndo: () => {
        const { undoStack } = get();
        if (undoStack.length === 0) return undefined;
        const action = undoStack[0];
        set({ undoStack: undoStack.slice(1) });
        return action;
      },

      insertImage: (info, index) => set((state) => {
        const newImages = [...state.images];
        newImages.splice(index, 0, info);
        return { images: newImages };
      }),

      removeImages: (indices, undoType) => set((state) => {
        const sortedIndices = [...indices].sort((a, b) => b - a);
        const removedImages: { info: ImageInfo, index: number }[] = [];
        
        let newImages = [...state.images];
        for (const index of sortedIndices) {
          removedImages.push({ info: newImages[index], index });
          newImages.splice(index, 1);
        }
        
        if (undoType) {
            const targetFolder = undoType === 'keep' ? '_Keep' : undoType === 'trash' ? '_Trash' : '';
            const undoAction: UndoAction = {
                type: undoType,
                originalImages: removedImages.reverse(), // Restore in original order
                targetFolder
            };
            setTimeout(() => get().pushUndo(undoAction), 0);
        }

        let nextIndex = state.currentIndex;
        if (indices.includes(state.currentIndex)) {
            const firstDeletedIndex = Math.min(...indices);
            nextIndex = Math.min(firstDeletedIndex, newImages.length - 1);
        } else {
            const itemsBefore = indices.filter(i => i < state.currentIndex).length;
            nextIndex = Math.max(0, state.currentIndex - itemsBefore);
        }

        return {
          images: newImages,
          currentIndex: Math.max(0, nextIndex),
          currentMetadata: null,
          batchRange: null,
          batchMap: {}, // [Fix] Force re-calculation of batches after removal
        };
      }),

      setShortcuts: (shortcuts) => set({ shortcuts }),
    }),
    {
      name: 'comfy-image-browser-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          if (persistedState && persistedState.shortcuts) {
            persistedState.shortcuts = {
              ...DEFAULT_SHORTCUTS,
              ...persistedState.shortcuts
            };
          }
        }
        // Ensure mobileServerSettings has authorizedFolders
        if (persistedState && persistedState.mobileServerSettings) {
            if (!persistedState.mobileServerSettings.authorizedFolders) {
                persistedState.mobileServerSettings.authorizedFolders = [];
            }
        } else if (persistedState) {
            persistedState.mobileServerSettings = {
                enabled: false,
                port: 4882,
                localOnly: true,
                authorizedFolders: [],
            };
        }
        return persistedState;
      },
      partialize: (state) => ({
        folderPath: state.folderPath,
        recentFolders: state.recentFolders,
        currentIndex: state.currentIndex,
        shortcuts: state.shortcuts,
        batchMode: state.batchMode,
        twitterSettings: state.twitterSettings,
        mobileServerSettings: state.mobileServerSettings,
        recursive: state.recursive,
        sortMethod: state.sortMethod,
        workshopFilter: state.workshopFilter,
        classifierSettings: state.classifierSettings,
        imageCacheSize: state.imageCacheSize,
      }),
    }
  )
);
