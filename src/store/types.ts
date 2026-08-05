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
  preserve_order: boolean;
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

// How the pipeline splits cleaned prompts before classifying/saving:
//  - 'all'      : no split — one set of <subset>.txt files (legacy behaviour)
//  - 'sfwOnly'  : keep only SFW lines
//  - 'nsfwOnly' : keep only NSFW lines
//  - 'split'    : run both lanes, distinguished by a sfw_/nsfw_ filename token
// NSFW judgement reuses mobileServerSettings.nsfwTags via the classify_nsfw_lines
// command, so it matches the mobile SFW feed and the "Move NSFW" action.
export type PipelineSeparationMode = 'all' | 'sfwOnly' | 'nsfwOnly' | 'split';

export interface WildcardPipelineSettings {
  sourceFolder: string;
  outputFolder: string;
  recursive: boolean;
  presetName: string;
  workshopThreshold: number;
  autoRunOnScan: boolean;
  removeDuplicates: boolean;
  separationMode: PipelineSeparationMode;
  /** Prepend a "YYMMDD_" date token to output filenames (versions each run). */
  datePrefix: boolean;
  /** Also save the cleaned, pre-classification prompt list as "<prefix>raw.txt". */
  saveRaw: boolean;
}

export const DEFAULT_PIPELINE_SETTINGS: WildcardPipelineSettings = {
  sourceFolder: '',
  outputFolder: '',
  recursive: false,
  presetName: 'default',
  workshopThreshold: 0.5,
  autoRunOnScan: false,
  removeDuplicates: true,
  separationMode: 'all',
  datePrefix: true,
  saveRaw: false,
};

// Prompt Generator: sample N whole prompts from the classified fragment pools of
// the current preset + DB, weighting each pick by tag co-occurrence (PMI) so the
// combinations stay coherent. Bounded to `count` outputs (no combinatorial blowup).
export interface GeneratorSettings {
  sourceFolder: string;
  recursive: boolean;
  presetName: string;
  /** Register to draw fragments from ('' = all registers / no register axis). */
  register: string;
  /** Number of prompts to generate. */
  count: number;
  /** Tags forced into every generated prompt (the user's desired base). */
  mustInclude: string;
  /** Minimum compatibility (PMI) for a fragment to be eligible given the context. */
  minScore: number;
}

export const DEFAULT_GENERATOR_SETTINGS: GeneratorSettings = {
  sourceFolder: '',
  recursive: false,
  presetName: 'default',
  register: '',
  count: 20,
  mustInclude: '',
  minScore: 0,
};

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
  peakingColumns: number;
  setShortcuts: (shortcuts: Shortcuts) => void;
  setTwitterSettings: (settings: TwitterSettings) => void;
  setMobileServerSettings: (settings: MobileServerSettings) => void;
  setRecursive: (recursive: boolean) => void;
  setSortMethod: (method: SortMethod) => void;
  setImageCacheSize: (size: number) => void;
  setSidebarWidth: (width: number) => void;
  setPeakingColumns: (columns: number) => void;
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
