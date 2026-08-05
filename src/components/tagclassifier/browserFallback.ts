import { invoke } from "@tauri-apps/api/core";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import { LazyStore } from "@tauri-apps/plugin-store";
import { mkdir, exists, readDir, remove, readTextFile, writeTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { settingsStore } from "../../api/settings";

// Browser/Tauri compatibility layer for the Tag Classifier. When running inside the
// native Tauri container these wrappers delegate to the real plugins; in a plain browser
// (audit/testing) they fall back to localStorage + DOM file input/download + mock data.
// NOTE: tauriInvokeMock intentionally calls raw `invoke` (rather than the typed api layer)
// because it is a generic command dispatcher with a browser mock branch.

// Check if we are running inside the native Tauri container.
// NOTE: must probe `__TAURI_INTERNALS__`, NOT `__TAURI__`. The latter is only injected
// when `app.withGlobalTauri` is enabled in tauri.conf.json (it is not), so probing it
// made every wrapper below silently take the browser-mock branch inside the real app —
// Direct/Filtered Import returned hardcoded sample prompts, Compile ran the JS port
// instead of the Rust classifier, and config was written to localStorage instead of
// `.settings.json`. `src/api/tauriMock.ts` already probes the correct global.
export const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

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

// Classifier config (last_preset / subsets / wordGroups) lives in the shared .settings.json.
export const classifierStore = isTauri
  ? settingsStore
  : new BrowserStore(".settings.json") as any;

// Legacy pre-consolidation store, read once for migration only.
const legacyClassifierStore = isTauri
  ? new LazyStore(".tag_classifier.json")
  : new BrowserStore(".tag_classifier.json") as any;

const PRESET_SUBDIR = "classifier_presets";
const RESCUE_DONE_KEY = "classifier_localstorage_rescued";

/**
 * Rescues config that the broken `isTauri` probe stranded in localStorage.
 *
 * While `isTauri` wrongly evaluated to false inside the desktop app, `classifierStore`
 * resolved to the BrowserStore fallback and `fsWriteTextFile` to the localStorage branch,
 * so real user config was written to:
 *   - `.settings.json:<key>`      (subsets / wordGroups / registers / last_preset)
 *   - `browser_preset:<name>`     (saved presets)
 * Now that the probe is fixed those reads go to the real store/AppData, which would look
 * empty. This copies the stranded values across once. Non-destructive: existing file-backed
 * values always win, and the localStorage entries are left in place.
 */
export async function rescueStrandedBrowserConfig(): Promise<void> {
  if (!isTauri || typeof localStorage === "undefined") return;
  try {
    if (await settingsStore.get(RESCUE_DONE_KEY)) return;

    // 1. Config keys -> shared .settings.json
    for (const key of ["subsets", "wordGroups", "registers", "last_preset"]) {
      const raw = localStorage.getItem(`.settings.json:${key}`);
      if (raw == null) continue;
      if ((await settingsStore.get(key)) != null) continue; // real store already wins
      try { await settingsStore.set(key, JSON.parse(raw)); } catch { /* skip corrupt entry */ }
    }

    // 2. Saved presets -> AppData/classifier_presets/<name>.json
    const presetKeys = Object.keys(localStorage).filter(k => k.startsWith("browser_preset:"));
    if (presetKeys.length > 0) {
      if (!(await exists(PRESET_SUBDIR, { baseDir: BaseDirectory.AppData }))) {
        await mkdir(PRESET_SUBDIR, { baseDir: BaseDirectory.AppData, recursive: true });
      }
      for (const k of presetKeys) {
        const name = k.slice("browser_preset:".length);
        const target = `${PRESET_SUBDIR}/${name}.json`;
        if (await exists(target, { baseDir: BaseDirectory.AppData })) continue;
        const content = localStorage.getItem(k);
        if (content) await writeTextFile(target, content, { baseDir: BaseDirectory.AppData });
      }
    }

    await settingsStore.set(RESCUE_DONE_KEY, true);
    await settingsStore.save();
  } catch (e) {
    console.error("[classifier] localStorage rescue failed", e);
  }
}

/**
 * One-time, non-destructive migration of classifier config from the legacy
 * `.tag_classifier.json` into the shared `.settings.json`. Runs only when the new
 * store has no classifier data yet; the legacy file is left intact for safety.
 */
export async function migrateClassifierSettings(): Promise<void> {
  try {
    if ((await classifierStore.get("subsets")) != null || (await classifierStore.get("wordGroups")) != null) return;
    const subsets = await legacyClassifierStore.get("subsets");
    const wordGroups = await legacyClassifierStore.get("wordGroups");
    const lastPreset = await legacyClassifierStore.get("last_preset");
    let migrated = false;
    if (subsets != null) { await classifierStore.set("subsets", subsets); migrated = true; }
    if (wordGroups != null) { await classifierStore.set("wordGroups", wordGroups); migrated = true; }
    if (lastPreset != null) { await classifierStore.set("last_preset", lastPreset); migrated = true; }
    if (migrated) await classifierStore.save();
  } catch (e) {
    console.error("[classifier] settings migration failed", e);
  }
}

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

  // Browser fallback mockup data — DEV-only. A production build that somehow reaches
  // this branch must fail loudly rather than hand the caller sample prompts that look real.
  if (!import.meta.env.DEV) {
    throw new Error(`Not running inside Tauri — '${cmd}' is unavailable`);
  }

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
