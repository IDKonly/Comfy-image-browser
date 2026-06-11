import { invoke } from "@tauri-apps/api/core";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import { LazyStore } from "@tauri-apps/plugin-store";
import { mkdir, exists, readDir, remove, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

// Browser/Tauri compatibility layer for the Tag Classifier. When running inside the
// native Tauri container these wrappers delegate to the real plugins; in a plain browser
// (audit/testing) they fall back to localStorage + DOM file input/download + mock data.
// NOTE: tauriInvokeMock intentionally calls raw `invoke` (rather than the typed api layer)
// because it is a generic command dispatcher with a browser mock branch.

// Check if we are running inside the native Tauri container
export const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;

// Mock Store for standard web browser environment (auditing/testing fallback)
class BrowserStore {
  private name: string;
  constructor(name: string) {
    this.name = name;
  }
  async get(key: string): Promise<any> {
    try {
      const data = localStorage.getItem(`${this.name}:${key}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
  async set(key: string, value: any): Promise<void> {
    try {
      localStorage.setItem(`${this.name}:${key}`, JSON.stringify(value));
    } catch (e) {
      console.error("[BrowserStore] Error setting key:", e);
    }
  }
  async save(): Promise<void> {}
}

export const classifierStore = isTauri
  ? new LazyStore(".tag_classifier.json")
  : new BrowserStore(".tag_classifier.json") as any;

// Safe wrapper around Tauri dialogs
export const dialogOpen = async (options?: any): Promise<string | string[] | null> => {
  if (isTauri) return await open(options);

  // Web fallback: trigger standard file upload
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        (window as any).__temp_imported_json__ = text;
        resolve("browser_imported.json");
      };
      reader.readAsText(file);
    };
    input.click();
  }) as Promise<string | string[] | null>;
};

export const dialogSave = async (options?: any) => {
  if (isTauri) return await save(options);
  // Web fallback: return virtual path
  return options?.defaultPath || "export.json";
};

export const dialogConfirm = async (message: string) => {
  if (isTauri) return await confirm(message);
  return window.confirm(message);
};

// Safe wrapper around Tauri filesystem operations
export const fsExists = async (path: string, options?: any) => {
  if (isTauri) return await exists(path, options);
  return path.includes("classifier_presets");
};

export const fsMkdir = async (path: string, options?: any) => {
  if (isTauri) return await mkdir(path, options);
  return;
};

export const fsReadDir = async (path: string, options?: any) => {
  if (isTauri) return await readDir(path, options);

  const keys = Object.keys(localStorage);
  return keys
    .filter(k => k.startsWith("browser_preset:"))
    .map(k => ({ name: k.replace("browser_preset:", "") + ".json" }));
};

export const fsReadTextFile = async (path: string, options?: any) => {
  if (isTauri) return await readTextFile(path, options);

  if (path === "browser_imported.json") {
    return (window as any).__temp_imported_json__ || "{}";
  }
  if (path.includes("classifier_presets")) {
    const presetName = path.split("/").pop()?.replace(".json", "");
    const content = localStorage.getItem(`browser_preset:${presetName}`);
    if (content) return content;
  }
  throw new Error("File not found in browser storage");
};

export const fsWriteTextFile = async (path: string, content: string, options?: any) => {
  if (isTauri) return await writeTextFile(path, content, options);

  if (path.includes("classifier_presets")) {
    const presetName = path.split("/").pop()?.replace(".json", "");
    localStorage.setItem(`browser_preset:${presetName}`, content);
    return;
  }

  // Standard file download fallback for browser export
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || "backup.json";
  a.click();
  URL.revokeObjectURL(url);
};

export const fsRemove = async (path: string, options?: any) => {
  if (isTauri) return await remove(path, options);

  if (path.includes("classifier_presets")) {
    const presetName = path.split("/").pop()?.replace(".json", "");
    localStorage.removeItem(`browser_preset:${presetName}`);
    return;
  }
};

// Safe wrapper around Tauri commands
export const tauriInvokeMock = async (cmd: string, args?: Record<string, any>): Promise<any> => {
  if (isTauri) {
    return await invoke(cmd, args);
  }

  // Browser fallback mockup data
  if (cmd === "get_all_prompts") {
    return [
      "1girl, masterpiece, cinematic lighting, purple eyes, long hair, beautiful face, standing, outdoors, sunset, glowing light, high detail",
      "masterpiece, best quality, scenery, mountain, snow, forest, river, morning sun, hyperrealistic, detailed background, 8k resolution",
      "1boy, solo, short black hair, blue jacket, neon city lights, night scene, rain, puddles, reflection, cinematic shot, hyper detailed",
      "1girl, solo, holding umbrella, pink dress, cherry blossoms, falling leaves, spring breeze, watercolor style, soft colors, dreamlike",
      "masterpiece, cosmic nebula, stars, galaxies, floating rocks, astronauts, space station, neon blue light, deep space exploration, cinematic"
    ] as any;
  }
  if (cmd === "generate_wildcards") {
    return [
      "1girl, purple eyes, standing, outdoors, sunset, glowing light",
      "scenery, mountain, snow, forest, river, morning sun",
      "1boy, short black hair, blue jacket, neon city lights, night scene, rain",
      "1girl, pink dress, cherry blossoms, falling leaves, spring breeze, watercolor style",
      "cosmic nebula, stars, galaxies, floating rocks, astronauts"
    ] as any;
  }
  throw new Error(`Command ${cmd} not mocked in browser`);
};
