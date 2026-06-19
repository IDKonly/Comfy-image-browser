import { AppSliceCreator, SessionSlice } from '../types';

export const createSessionSlice: AppSliceCreator<SessionSlice> = (set) => ({
  folderPath: null,
  recentFolders: [],

  setFolderPath: (path) => set((state) => {
    if (!path) return { folderPath: null, undoStack: [] };
    const recent = [path, ...state.recentFolders.filter(f => f !== path)].slice(0, 5);
    return {
      folderPath: path,
      recentFolders: recent,
      undoStack: [],
      checkedIndices: [],
      similaritySearchActive: false,
      similaritySearchTags: [],
    };
  }),
  setRecentFolders: (recentFolders) => set({ recentFolders }),
});
