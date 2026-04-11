import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/**
 * Unified API Client for ComfyView.
 * Handles path normalization, consistent error mapping, and centralized IPC management.
 */
class ApiClient {
  /**
   * Invokes a Tauri command with standardized path normalization for Windows/Unix consistency.
   * @param command The Tauri command to call.
   * @param args The arguments to pass to the command.
   */
  async invoke<T>(command: string, args?: Record<string, any>): Promise<T> {
    const normalizedArgs = this.normalizeArgs(args);
    
    try {
      return await tauriInvoke<T>(command, normalizedArgs);
    } catch (error) {
      // For now, re-throw as is, but we can add structured error mapping here later.
      if (typeof error === 'string') {
        throw new Error(error);
      }
      throw error;
    }
  }

  /**
   * Deeply normalizes all string values that look like paths or contain backslashes.
   * Converts backslashes to forward slashes for DB consistency.
   * Only applies to strings that look like Windows paths to avoid corrupting prompt tags.
   */
  private normalizeArgs(args?: Record<string, any>): Record<string, any> | undefined {
    if (!args) return args;

    const normalize = (val: any, key?: string): any => {
      if (typeof val === 'string') {
        // Only normalize if the key suggests it's a path, or if it looks like a Windows path
        // and doesn't look like a typical comma-separated prompt.
        const isPathKey = key && (key.toLowerCase().includes('path') || key.toLowerCase().includes('folder'));
        const looksLikePath = /^[a-zA-Z]:\\/.test(val) || (val.includes('\\') && !val.includes(','));
        
        if (isPathKey || looksLikePath) {
            return val.replace(/\\/g, '/');
        }
        return val;
      }
      if (Array.isArray(val)) {
        return val.map(v => normalize(v));
      }
      if (val !== null && typeof val === 'object') {
        const obj: Record<string, any> = {};
        for (const k in val) {
          obj[k] = normalize(val[k], k);
        }
        return obj;
      }
      return val;
    };

    return normalize(args);
  }
}

export const apiClient = new ApiClient();
