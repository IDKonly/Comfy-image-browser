import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { api, toBackendPath, assetSrc } from '../index';

describe('api service layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined as any);
  });

  it('toBackendPath converts backslashes to forward slashes', () => {
    expect(toBackendPath('C:\\images\\a.png')).toBe('C:/images/a.png');
    expect(toBackendPath('already/forward')).toBe('already/forward');
  });

  it('assetSrc normalizes to backslashes and appends a cache-busting timestamp', () => {
    // convertFileSrc is mocked as `asset://<path>` in test setup.
    expect(assetSrc('C:/images/a.png')).toBe('asset://C:\\images\\a.png');
    expect(assetSrc('C:/images/a.png', 1234)).toBe('asset://C:\\images\\a.png?t=1234');
  });

  it('scanDirectory sends camelCase forceReindex (regression: snake_case was silently ignored)', async () => {
    await api.scanDirectory('C:\\imgs', 'NameAsc', true, true);
    expect(invoke).toHaveBeenCalledWith('scan_directory', {
      path: 'C:/imgs',
      sortMethod: 'NameAsc',
      recursive: true,
      forceReindex: true,
    });
  });

  it('normalizes path arguments but leaves tag-like strings untouched', async () => {
    // A booru tag with escaped parens must NOT be mangled by path normalization.
    await api.getTagSuggestions('C:\\imgs', 'seia \\(blue archive\\)', false);
    expect(invoke).toHaveBeenCalledWith('get_tag_suggestions', {
      folder: 'C:/imgs',
      currentInput: 'seia \\(blue archive\\)',
      recursive: false,
    });
  });

  it('saveTwitterSecrets wraps the payload under the `secrets` key', async () => {
    const secrets = { apiKey: 'k', apiSecret: 's', accessToken: 't', accessSecret: 'x' };
    await api.saveTwitterSecrets(secrets);
    expect(invoke).toHaveBeenCalledWith('save_twitter_secrets', { secrets });
  });
});
