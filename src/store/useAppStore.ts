import { create } from 'zustand';

export interface Shortcuts {
  next: string;
  prev: string;
  delete: string;
  keep: string;
  batch: string;
  search: string;
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
  next: 'ArrowRight',
  prev: 'ArrowLeft',
  delete: 'Delete',
  keep: 'k',
  batch: 'b',
  search: '/',
};

export interface ImageMetadata {
  prompt?: string;
  negative_prompt?: string;
  steps?: number;
  sampler?: string;
  cfg?: number;
  seed?: number;
  model?: string;
  raw: string;
}

interface ImageInfo {
  path: string;
  name: string;
  mtime: number;
  size: number;
}

interface AppState {
  folderPath: string | null;
  images: ImageInfo[];
  currentIndex: number;
  currentMetadata: ImageMetadata | null;
  shortcuts: Shortcuts;
  
  setFolderPath: (path: string | null) => void;
  setImages: (images: ImageInfo[]) => void;
  setCurrentIndex: (index: number) => void;
  setCurrentMetadata: (metadata: ImageMetadata | null) => void;
  removeImages: (indices: number[]) => void;
  setShortcuts: (shortcuts: Shortcuts) => void;
}

export const useAppStore = create<AppState>((set) => ({
  folderPath: null,
  images: [],
  currentIndex: 0,
  currentMetadata: null,
  shortcuts: DEFAULT_SHORTCUTS,

  setFolderPath: (path) => set({ folderPath: path }),
  setImages: (images) => set({ images }),
  setCurrentIndex: (index) => set({ currentIndex: index, currentMetadata: null }),
  setCurrentMetadata: (metadata) => set({ currentMetadata: metadata }),
  
  removeImages: (indices) => set((state) => {
    const sortedIndices = [...indices].sort((a, b) => b - a);
    let newImages = [...state.images];
    for (const index of sortedIndices) {
      newImages.splice(index, 1);
    }
    
    let nextIndex = state.currentIndex;
    if (indices.includes(state.currentIndex)) {
        nextIndex = Math.min(state.currentIndex, newImages.length - 1);
    } else {
        // Adjust index if items before it were removed
        const itemsBefore = indices.filter(i => i < state.currentIndex).length;
        nextIndex = Math.max(0, state.currentIndex - itemsBefore);
    }

    return {
      images: newImages,
      currentIndex: Math.max(0, nextIndex),
      currentMetadata: null,
    };
  }),

  setShortcuts: (shortcuts) => set({ shortcuts }),
}));
