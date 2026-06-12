import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../useAppStore';

describe('useAppStore Settings Persistence', () => {
  beforeEach(() => {
    // Reset store state if possible or clear localStorage
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it('should initialize with default workshop filters', () => {
    const state = useAppStore.getState();
    expect(state.workshopFilter).toBeDefined();
    expect(state.workshopFilter.max_words).toBe(5);
  });

  it('should update and persist workshop filters', () => {
    useAppStore.getState().setWorkshopFilter({
      ...useAppStore.getState().workshopFilter,
      max_words: 10
    });

    const state = useAppStore.getState();
    expect(state.workshopFilter.max_words).toBe(10);
    
    // In a real browser, this would be in localStorage. 
    // Zustand's persist middleware handles this.
  });

  it('no longer carries classifier settings in the global store (moved to .settings.json)', () => {
    // Classifier config (subsets/wordGroups/last_preset) now lives in the shared
    // tauri-plugin-store file (.settings.json), not the zustand store.
    // @ts-ignore - field intentionally removed
    expect(useAppStore.getState().classifierSettings).toBeUndefined();
  });
});
