import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AppState, DEFAULT_SHORTCUTS, DEFAULT_NSFW_TAGS } from './types';
import { createSessionSlice } from './slices/sessionSlice';
import { createNavigationSlice } from './slices/navigationSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createWorkshopSlice } from './slices/workshopSlice';

// Re-export domain/slice types so existing `import { ... } from "../store/useAppStore"`
// call sites keep working after the slice split.
export * from './types';

export const useAppStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createSessionSlice(...a),
      ...createNavigationSlice(...a),
      ...createSettingsSlice(...a),
      ...createWorkshopSlice(...a),
    }),
    {
      name: 'comfy-image-browser-storage',
      version: 6,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any, version: number) => {
        if (version < 1) {
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

        if (version < 2) {
          if (persistedState) {
            persistedState.viewMode = persistedState.batchMode ? 'Batch' : 'Single';
          }
        }

        if (version < 3 || version < 5) {
          if (persistedState && persistedState.shortcuts) {
            persistedState.shortcuts = {
              ...DEFAULT_SHORTCUTS,
              ...persistedState.shortcuts
            };
          }
        }

        if (version < 4) {
          if (persistedState) {
            persistedState.checkedIndices = [];
            persistedState.sidebarWidth = 288;
          }
        }

        // v6: seed NSFW keyword list for the new classify/SFW feature.
        if (version < 6) {
          if (persistedState && persistedState.mobileServerSettings && !persistedState.mobileServerSettings.nsfwTags) {
            persistedState.mobileServerSettings.nsfwTags = DEFAULT_NSFW_TAGS;
          }
        }

        return persistedState;
      },
      partialize: (state) => ({
        folderPath: state.folderPath,
        recentFolders: state.recentFolders,
        currentIndex: state.currentIndex,
        shortcuts: state.shortcuts,
        viewMode: state.viewMode,
        batchMode: state.batchMode,
        // Secrets (API keys/tokens) live in the OS keychain, never in localStorage.
        twitterSettings: {
          ...state.twitterSettings,
          apiKey: '',
          apiSecret: '',
          accessToken: '',
          accessSecret: '',
        },
        mobileServerSettings: state.mobileServerSettings,
        recursive: state.recursive,
        sortMethod: state.sortMethod,
        workshopFilter: state.workshopFilter,
        imageCacheSize: state.imageCacheSize,
        sidebarWidth: state.sidebarWidth,
        similaritySearchNumTags: state.similaritySearchNumTags,
        searchAuthFolders: state.searchAuthFolders,
      }),
    }
  )
);
