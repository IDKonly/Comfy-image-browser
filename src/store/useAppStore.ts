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

export interface UndoAction {
  type: 'keep' | 'trash' | 'move';
  originalImages: { info: ImageInfo, index: number }[];
  targetFolder: string;
}

interface AppState {
  folderPath: string | null;
  images: ImageInfo[];
  currentIndex: number;
  currentMetadata: ImageMetadata | null;
  shortcuts: Shortcuts;
  batchMode: boolean;
  undoStack: UndoAction[];
  
  setFolderPath: (path: string | null) => void;
  setImages: (images: ImageInfo[]) => void;
  setCurrentIndex: (index: number) => void;
  setCurrentMetadata: (metadata: ImageMetadata | null) => void;
  removeImages: (indices: number[], undoType?: 'keep' | 'trash' | 'move') => void;
  insertImage: (info: ImageInfo, index: number) => void;
  setShortcuts: (shortcuts: Shortcuts) => void;
  setBatchMode: (mode: boolean) => void;
  pushUndo: (action: UndoAction) => void;
  popUndo: () => UndoAction | undefined;
}

export const useAppStore = create<AppState>((set, get) => ({
  folderPath: null,
  images: [],
  currentIndex: 0,
  currentMetadata: null,
  shortcuts: DEFAULT_SHORTCUTS,
  batchMode: false,
  undoStack: [],

  setFolderPath: (path) => set({ folderPath: path, undoStack: [] }),
  setImages: (images) => set({ images }),
  setCurrentIndex: (index) => set({ currentIndex: index, currentMetadata: null }),
  setCurrentMetadata: (metadata) => set({ currentMetadata: metadata }),
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
        nextIndex = Math.min(state.currentIndex, newImages.length - 1);
    } else {
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
