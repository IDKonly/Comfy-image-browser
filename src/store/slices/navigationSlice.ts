import { AppSliceCreator, NavigationSlice, UndoAction, ImageInfo } from '../types';

export const createNavigationSlice: AppSliceCreator<NavigationSlice> = (set, get) => ({
  images: [],
  currentIndex: 0,
  currentMetadata: null,
  viewMode: 'Single',
  batchMode: false,
  undoStack: [],
  indexProgress: null,
  batchRange: null,
  batchMap: {},
  checkedIndices: [],

  setImages: (images) => {
    const { viewMode, checkedIndices, images: prevImages } = get();
    if (viewMode === 'Peaking' && checkedIndices.length > 0) {
      const checkedPaths = new Set(checkedIndices.map(i => prevImages[i]?.path).filter(Boolean));
      const newChecked = images.map((img, i) => checkedPaths.has(img.path) ? i : -1).filter(i => i >= 0);
      set({ images, checkedIndices: newChecked });
    } else {
      set({ images, checkedIndices: [] });
    }
  },
  setCurrentIndex: (index) => set({ currentIndex: index, currentMetadata: null }),
  setCurrentMetadata: (metadata) => set({ currentMetadata: metadata }),
  setIndexProgress: (progress) => set({ indexProgress: progress }),
  setViewMode: (mode) => set({ viewMode: mode, batchMode: mode === 'Batch' }),
  setBatchMode: (mode) => set({ batchMode: mode, viewMode: mode ? 'Batch' : 'Single' }),
  setBatchRange: (batchRange) => set({ batchRange }),
  setBatchMap: (batchMap) => set({ batchMap }),

  toggleCheck: (index) => set((state) => {
    const checked = state.checkedIndices.includes(index)
      ? state.checkedIndices.filter(i => i !== index)
      : [...state.checkedIndices, index];
    return { checkedIndices: checked };
  }),
  clearChecks: () => set({ checkedIndices: [] }),
  setCheckedIndices: (checkedIndices) => set({ checkedIndices }),

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

    let newUndoStack = state.undoStack;
    if (undoType) {
        const targetFolder = undoType === 'keep' ? '_Keep' : undoType === 'trash' ? '_Trash' : '';
        const undoAction: UndoAction = {
            type: undoType,
            originalImages: removedImages.reverse(), // Restore in original order
            targetFolder
        };
        // Push synchronously within the same state update to avoid the prior
        // setTimeout(0) ordering race against subsequent store updates.
        newUndoStack = [undoAction, ...state.undoStack].slice(0, 50);
    }

    let nextIndex = state.currentIndex;
    if (indices.includes(state.currentIndex)) {
        const firstDeletedIndex = Math.min(...indices);
        nextIndex = Math.min(firstDeletedIndex, newImages.length - 1);
    } else {
        const itemsBefore = indices.filter(i => i < state.currentIndex).length;
        nextIndex = Math.max(0, state.currentIndex - itemsBefore);
    }

    const newCheckedIndices = state.checkedIndices
        .filter(i => !indices.includes(i))
        .map(i => {
            const itemsBefore = indices.filter(idx => idx < i).length;
            return i - itemsBefore;
        });

    return {
      images: newImages,
      currentIndex: Math.max(0, nextIndex),
      currentMetadata: null,
      batchRange: null,
      batchMap: {}, // [Fix] Force re-calculation of batches after removal
      checkedIndices: newCheckedIndices,
      undoStack: newUndoStack,
    };
  }),
});
