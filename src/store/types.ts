import type { StateCreator } from 'zustand';

// --- Domain types ---------------------------------------------------------

export interface ImageInfo {
  path: string;
  name: string;
  mtime: number;
  size: number;
}

export interface ImageMetadata {
  prompt: string | null;
  negative_prompt: string | null;
  steps: number | null;
  sampler: string | null;
  cfg: number | null;
  seed: number | null;
  model: string | null;
  raw: string;
}

export interface IndexProgress {
  total: number;
  current: number;
  is_indexing: boolean;
}

export interface UndoAction {
  type: 'keep' | 'trash' | 'move';
  originalImages: { info: ImageInfo, index: number }[];
  targetFolder: string;
}

export interface Shortcuts {
  next: string;
  prev: string;
  delete: string;
  keep: string;
  batch: string;
  peaking: string;
  check: string;
  search: string;
  twitter: string;
  random: string;
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
  next: 'ArrowRight',
  prev: 'ArrowLeft',
  delete: 'Delete',
  keep: 'k',
  batch: 'b',
  peaking: 'p',
  check: ' ',
  search: '/',
  twitter: 't',
  random: 'q',
};

export interface TwitterSettings {
  template: string;
  phrasesToPick: string[];
  autoCopyImage: boolean;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export type SortMethod = 'Newest' | 'Oldest' | 'NameAsc' | 'NameDesc';
export type ViewMode = 'Single' | 'Batch' | 'Peaking';

export interface FilterState {
  partial_match: string[];
  exact_match: string[];
  exceptions: string[];
  max_words: number;
  min_tags: number;
  max_depth: number;
  simple_mode: boolean;
  simple_exclusions: string[];
  mix_mode: boolean;
  mix_depth: number;
  mix_tandem_min_branches: number;
  mix_tandem_ratio: number;
}

export interface MobileServerSettings {
  enabled: boolean;
  port: number;
  localOnly: boolean;
  authorizedFolders: string[];
  // NSFW keywords: drive both the viewer's "Move NSFW" action and the mobile feed's SFW mode.
  // Kept here so the existing persist + backend-sync plumbing carries them automatically.
  nsfwTags: string[];
}

// Base-form NSFW keywords. The Rust matcher handles plural/`-es` variants, so "nipple"
// already covers "nipples". Keep in sync with `nsfw::default_nsfw_tags()` in the backend.
export const DEFAULT_NSFW_TAGS: string[] = [
  "sex", "nsfw", "nude", "nudity", "naked", "topless", "bottomless",
  "nipple", "areola", "penis", "pussy", "vagina", "vaginal", "anus",
  "clitoris", "testicle", "cum", "ejaculation", "penetration",
  "fellatio", "cunnilingus", "masturbation", "pubic", "ahegao", "cameltoe",
];

// --- Store slices ---------------------------------------------------------
// The store is composed from these slices via a single create()/persist call,
// so a slice's actions may freely read/write fields owned by other slices
// (set/get operate over the full AppState).

export interface SessionSlice {
  folderPath: string | null;
  recentFolders: string[];
  setFolderPath: (path: string | null) => void;
  setRecentFolders: (folders: string[]) => void;
}

export interface NavigationSlice {
  images: ImageInfo[];
  currentIndex: number;
  currentMetadata: ImageMetadata | null;
  viewMode: ViewMode;
  batchMode: boolean; // Kept for backward compatibility / quick checks
  undoStack: UndoAction[];
  indexProgress: IndexProgress | null;
  batchRange: [number, number] | null;
  batchMap: Record<number, [number, number]>;
  checkedIndices: number[];
  setImages: (images: ImageInfo[]) => void;
  setCurrentIndex: (index: number) => void;
  setCurrentMetadata: (metadata: ImageMetadata | null) => void;
  setIndexProgress: (progress: IndexProgress | null) => void;
  removeImages: (indices: number[], undoType?: 'keep' | 'trash' | 'move') => void;
  insertImage: (info: ImageInfo, index: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setBatchMode: (mode: boolean) => void;
  pushUndo: (action: UndoAction) => void;
  popUndo: () => UndoAction | undefined;
  setBatchRange: (range: [number, number] | null) => void;
  setBatchMap: (map: Record<number, [number, number]>) => void;
  toggleCheck: (index: number) => void;
  clearChecks: () => void;
  setCheckedIndices: (indices: number[]) => void;
}

export interface SettingsSlice {
  shortcuts: Shortcuts;
  twitterSettings: TwitterSettings;
  mobileServerSettings: MobileServerSettings;
  recursive: boolean;
  sortMethod: SortMethod;
  imageCacheSize: number;
  sidebarWidth: number;
  setShortcuts: (shortcuts: Shortcuts) => void;
  setTwitterSettings: (settings: TwitterSettings) => void;
  setMobileServerSettings: (settings: MobileServerSettings) => void;
  setRecursive: (recursive: boolean) => void;
  setSortMethod: (method: SortMethod) => void;
  setImageCacheSize: (size: number) => void;
  setSidebarWidth: (width: number) => void;
}

export interface WorkshopSlice {
  workshopFilter: FilterState;
  workshopTargetPaths: string[];
  similaritySearchActive: boolean;
  similaritySearchNumTags: number;
  similaritySearchTags: string[];
  searchAuthFolders: boolean;
  setWorkshopFilter: (filter: FilterState) => void;
  setWorkshopTargetPaths: (paths: string[]) => void;
  setSimilaritySearchActive: (active: boolean) => void;
  setSimilaritySearchNumTags: (num: number) => void;
  setSimilaritySearchTags: (tags: string[]) => void;
  setSearchAuthFolders: (v: boolean) => void;
}

export type AppState = SessionSlice & NavigationSlice & SettingsSlice & WorkshopSlice;

/** StateCreator for a slice of AppState under the persist middleware. */
export type AppSliceCreator<T> = StateCreator<AppState, [['zustand/persist', unknown]], [], T>;
