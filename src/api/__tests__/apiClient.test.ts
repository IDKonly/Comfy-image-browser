import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { apiClient } from '../apiClient';

describe('apiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call invoke with correct command and params', async () => {
    vi.mocked(invoke).mockResolvedValue({ success: true });
    
    const params = { path: 'test/path' };
    await apiClient.invoke('scan_directory', params);

    expect(invoke).toHaveBeenCalledWith('scan_directory', params);
  });

  it('should normalize paths in params for windows/unix consistency', async () => {
    vi.mocked(invoke).mockResolvedValue({});
    
    const params = { path: 'folder\\subfolder/image.png' };
    await apiClient.invoke('test_cmd', params);

    // Should convert backslashes to forward slashes as per our DB convention
    expect(invoke).toHaveBeenCalledWith('test_cmd', {
      path: 'folder/subfolder/image.png'
    });
  });

  it('should handle errors uniformly', async () => {
    const errorMsg = 'Backend Error';
    vi.mocked(invoke).mockRejectedValue(errorMsg);

    await expect(apiClient.invoke('error_cmd')).rejects.toThrow(errorMsg);
  });
});
