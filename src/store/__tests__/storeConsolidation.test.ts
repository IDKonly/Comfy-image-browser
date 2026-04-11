import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../useAppStore';

describe('useAppStore Global State Consolidation', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it('should handle batchRange state globally', () => {
    const range: [number, number] = [0, 5];
    useAppStore.getState().setBatchRange(range);
    
    expect(useAppStore.getState().batchRange).toEqual(range);
  });
});
