import { AppSliceCreator, WorkshopSlice } from '../types';

export const createWorkshopSlice: AppSliceCreator<WorkshopSlice> = (set) => ({
  workshopTargetPaths: [],
  similaritySearchActive: false,
  similaritySearchNumTags: 2,
  similaritySearchTags: [],
  searchAuthFolders: false,
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

  setWorkshopFilter: (workshopFilter) => set({ workshopFilter }),
  setWorkshopTargetPaths: (workshopTargetPaths) => set({ workshopTargetPaths }),
  setSimilaritySearchActive: (similaritySearchActive) => set({ similaritySearchActive }),
  setSimilaritySearchNumTags: (similaritySearchNumTags) => set({ similaritySearchNumTags }),
  setSimilaritySearchTags: (similaritySearchTags) => set({ similaritySearchTags }),
  setSearchAuthFolders: (searchAuthFolders) => set({ searchAuthFolders }),
});
