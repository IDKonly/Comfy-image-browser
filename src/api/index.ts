import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import type {
  ImageInfo,
  ImageMetadata,
  SortMethod,
  FilterState,
  TwitterSettings,
  MobileServerSettings,
} from "../store/useAppStore";

/**
 * Central API service layer for ComfyView.
 *
 * Every Tauri command is wrapped here exactly once, so that:
 *  - command names and argument shapes live in a single typed place;
 *  - invoke arguments are always camelCase (Tauri maps them to snake_case Rust params —
 *    passing snake_case keys silently fails, which previously broke force-reindex);
 *  - path arguments are normalized to forward slashes (the backend's storage convention)
 *    explicitly per-argument, instead of a fragile heuristic that could corrupt booru
 *    tags containing escaped parentheses (e.g. "seia \\(blue archive\\)").
 *
 * Migrate call sites to `api.*` incrementally; do not call `invoke` directly in new code.
 */

// --- path helpers ---------------------------------------------------------

/** Normalize a path to the backend convention (forward slashes). */
export const toBackendPath = (p: string): string => p.replace(/\\/g, "/");

const toBackendPaths = (paths: string[]): string[] => paths.map(toBackendPath);

/**
 * Build a webview-loadable asset URL for a local image path. On Windows the asset
 * protocol expects backslashes; an optional cache-busting timestamp can be appended.
 */
export const assetSrc = (path: string, reloadTimestamp?: number): string => {
  const url = convertFileSrc(path.replace(/\//g, "\\"));
  return reloadTimestamp ? `${url}?t=${reloadTimestamp}` : url;
};

// --- result types not declared in the store -------------------------------

export interface ScanResult {
  images: ImageInfo[];
  initial_index: number;
  folder: string;
}

export interface SimilarityResult {
  images: ImageInfo[];
  matched_tags: string[];
}

export interface AutoClassifyResult {
  total_moved: number;
  folder_summary: Record<string, number>;
}

export interface TwitterSecrets {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FilterOptions {
  models: string[];
  samplers: string[];
}

export interface DbStatus {
  total_images: number;
  folder_images: number;
  samples: string[];
  db_path?: string;
}

// --- commands -------------------------------------------------------------

export const api = {
  // Scanning / search
  scanDirectory: (path: string, sortMethod?: SortMethod, recursive?: boolean, forceReindex?: boolean) =>
    invoke<ScanResult>("scan_directory", { path: toBackendPath(path), sortMethod, recursive, forceReindex }),

  updateScanFocus: (index: number) =>
    invoke<void>("update_scan_focus", { index }),

  searchAdvancedImages: (args: {
    folder: string; query: string; model: string; sampler: string;
    sortMethod: SortMethod; recursive: boolean; authFolders?: string[] | null;
  }) =>
    invoke<ImageInfo[]>("search_advanced_images", {
      folder: toBackendPath(args.folder),
      query: args.query,
      model: args.model,
      sampler: args.sampler,
      sortMethod: args.sortMethod,
      recursive: args.recursive,
      authFolders: args.authFolders ?? null,
    }),

  searchSimilarImages: (args: {
    authFolders: string[]; currentImagePath: string; numTags: number;
    filter: FilterState; activeFolder?: string | null;
  }) =>
    invoke<SimilarityResult>("search_similar_images", {
      authFolders: toBackendPaths(args.authFolders),
      currentImagePath: toBackendPath(args.currentImagePath),
      numTags: args.numTags,
      filter: args.filter,
      activeFolder: args.activeFolder ? toBackendPath(args.activeFolder) : null,
    }),

  getTagSuggestions: (folder: string, currentInput: string, recursive: boolean) =>
    invoke<[string, number][]>("get_tag_suggestions", { folder: toBackendPath(folder), currentInput, recursive }),

  // Metadata
  getMetadata: (path: string) =>
    invoke<ImageMetadata>("get_metadata", { path: toBackendPath(path) }),

  getPromptsMapByPaths: (paths: string[]) =>
    invoke<Record<string, string | null>>("get_prompts_map_by_paths", { paths: toBackendPaths(paths) }),

  // File operations
  deleteToTrash: (paths: string[]) =>
    invoke<void>("delete_to_trash", { paths: toBackendPaths(paths) }),

  moveToKeep: (paths: string[]) =>
    invoke<void>("move_to_keep", { paths: toBackendPaths(paths) }),

  moveFilesToFolder: (paths: string[], folderName: string) =>
    invoke<void>("move_files_to_folder", { paths: toBackendPaths(paths), folderName }),

  undoMove: (originalPath: string, currentPath: string) =>
    invoke<void>("undo_move", { originalPath: toBackendPath(originalPath), currentPath: toBackendPath(currentPath) }),

  autoClassify: (root: string, recursive: boolean) =>
    invoke<AutoClassifyResult>("auto_classify", { root: toBackendPath(root), recursive }),

  // Thumbnails
  getThumbnail: (path: string, size?: number) =>
    invoke<string>("get_thumbnail", { path: toBackendPath(path), size }),

  getFilterOptions: (folder: string) =>
    invoke<FilterOptions>("get_filter_options", { folder: toBackendPath(folder) }),

  // Database / diagnostics
  clearDatabase: () =>
    invoke<void>("clear_database"),

  getDbStatus: (folder: string) =>
    invoke<DbStatus>("get_db_status", { folder: toBackendPath(folder) }),

  getLogs: () =>
    invoke<string>("get_logs"),

  // Crop
  processBatchCrop: (imagePath: string, rects: CropRect[], fillColor: [number, number, number] | null) =>
    invoke<string[]>("process_batch_crop", { imagePath: toBackendPath(imagePath), rects, fillColor }),

  // Wildcard / tag tools
  writeFilterFile: (name: string, content: string) =>
    invoke<void>("write_filter_file", { name, content }),

  readFilterFile: (name: string) =>
    invoke<string>("read_filter_file", { name }),

  saveToFile: (path: string, content: string) =>
    invoke<void>("save_to_file", { path: toBackendPath(path), content }),

  scanPaths: (paths: string[], recursive: boolean) =>
    invoke<ImageInfo[]>("scan_paths", { paths: toBackendPaths(paths), recursive }),

  getTagCounts: (paths: string[]) =>
    invoke<Record<string, number>>("get_tag_counts", { paths: toBackendPaths(paths) }),

  generateWildcards: (args: { paths: string[]; prompts: string[]; threshold: number; filter: FilterState }) =>
    invoke<string[]>("generate_wildcards", {
      paths: toBackendPaths(args.paths),
      prompts: args.prompts,
      threshold: args.threshold,
      filter: args.filter,
    }),

  compareTags: (args: {
    targetPaths: string[]; targetPrompts: string[];
    comparisonPaths: string[]; comparisonPrompts: string[];
    threshold: number; filter: FilterState;
  }) =>
    invoke<string[]>("compare_tags", {
      targetPaths: toBackendPaths(args.targetPaths),
      targetPrompts: args.targetPrompts,
      comparisonPaths: toBackendPaths(args.comparisonPaths),
      comparisonPrompts: args.comparisonPrompts,
      threshold: args.threshold,
      filter: args.filter,
    }),

  classifyPromptsCommand: (lines: string[], subsets: any[], wordGroups: any[]) =>
    invoke<any[]>("classify_prompts_command", { lines, subsets, wordGroups }),

  // Twitter / X
  twitterUpload: (path: string, settings: TwitterSettings) =>
    invoke<string>("twitter_upload", { path: toBackendPath(path), settings }),

  saveTwitterSecrets: (secrets: TwitterSecrets) =>
    invoke<void>("save_twitter_secrets", { secrets }),

  loadTwitterSecrets: () =>
    invoke<TwitterSecrets>("load_twitter_secrets"),

  hasTwitterSecrets: () =>
    invoke<boolean>("has_twitter_secrets"),

  deleteTwitterSecrets: () =>
    invoke<void>("delete_twitter_secrets"),

  // Mobile server
  updateMobileServer: (settings: MobileServerSettings, recentFolders: string[]) =>
    invoke<void>("update_mobile_server", { settings, recentFolders }),

  getLocalIp: () =>
    invoke<string>("get_local_ip"),
};

export type Api = typeof api;
