import { AppSliceCreator, SettingsSlice, DEFAULT_SHORTCUTS, DEFAULT_NSFW_TAGS } from '../types';

export const createSettingsSlice: AppSliceCreator<SettingsSlice> = (set) => ({
  shortcuts: DEFAULT_SHORTCUTS,
  recursive: false,
  sortMethod: 'NameAsc',
  imageCacheSize: 5,
  sidebarWidth: 288,
  peakingColumns: 4,
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
    nsfwTags: DEFAULT_NSFW_TAGS,
  },

  setShortcuts: (shortcuts) => set({ shortcuts }),
  setTwitterSettings: (twitterSettings) => set({ twitterSettings }),
  setMobileServerSettings: (mobileServerSettings) => set({
    mobileServerSettings: {
      ...mobileServerSettings,
      authorizedFolders: mobileServerSettings.authorizedFolders || [],
      nsfwTags: mobileServerSettings.nsfwTags || DEFAULT_NSFW_TAGS,
    }
  }),
  setRecursive: (recursive) => set({ recursive }),
  setSortMethod: (sortMethod) => set({ sortMethod }),
  setImageCacheSize: (imageCacheSize) => set({ imageCacheSize }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setPeakingColumns: (peakingColumns) => set({ peakingColumns }),
});
