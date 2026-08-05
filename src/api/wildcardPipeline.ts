import { api } from ".";
import type { FilterState, PipelineSeparationMode } from "../store/types";
import { loadClassifierPreset } from "../components/tagclassifier/presets";
import type { Subset, ClassificationResult } from "../components/tagclassifier/types";

export interface PipelineConfig {
  sourceFolder: string;
  outputFolder: string;
  recursive: boolean;
  presetName: string;
  workshopThreshold: number;
  workshopFilter: FilterState;
  removeDuplicates: boolean;
  separationMode: PipelineSeparationMode;
  /** NSFW base keywords, shared from mobileServerSettings.nsfwTags. */
  nsfwTags: string[];
  /** Also dump the pre-classification cleaned prompt list as `<prefix>raw.txt`. */
  saveRaw: boolean;
  /** Prepend a "YYMMDD_" date token to output filenames (versions each run). */
  datePrefix: boolean;
}

export interface PipelineResult {
  totalLines: number;
  cleanedLines: number;
  savedFiles: string[];
  /** Line counts per lane after the NSFW split (present unless mode is 'all'). */
  laneCounts?: { sfw: number; nsfw: number };
  /** Line counts per register (present only when the preset defines registers). */
  registerCounts?: Record<string, number>;
}

/**
 * A partition of cleaned lines. Files are flat (no subfolders); the category
 * token (all / sfw / nsfw / register name) is encoded into each filename so that
 * same-named subset files from different partitions don't collide.
 */
interface Partition {
  category: string;
  indices: number[];
}

/** Strip characters that are illegal in Windows file/folder names. */
function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'unnamed';
}

/** Local-date stamp as "YYMMDD" (e.g. 260704), used as the output filename prefix. */
export function formatDateStamp(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Save one flat file per subset from pre-computed classification results.
 * Filename = `<filePrefix><subset>.txt` under `outputFolder`, where filePrefix
 * already carries the date + category tokens (e.g. "260704_sfw_").
 */
async function saveFromResults(
  results: ClassificationResult[],
  subsets: Subset[],
  outputFolder: string,
  filePrefix: string,
  removeDuplicates: boolean
): Promise<string[]> {
  const savedFiles: string[] = [];
  const allIds = new Set<number>();
  results.forEach(r => r.data.forEach(d => allIds.add(d.id)));

  for (const id of allIds) {
    const subsetName = id === 0
      ? 'unclassified'
      : (subsets.find(s => s.id === id)?.name ?? `group_${id}`);

    let outLines: string[] = results
      .map(r => r.data.find(d => d.id === id)?.matches.join(', ') ?? '')
      .filter(l => l.trim() !== '');

    if (removeDuplicates) {
      outLines = Array.from(new Set(outLines));
    }
    if (outLines.length === 0) continue;

    const filePath = `${outputFolder}/${filePrefix}${sanitizeName(subsetName)}.txt`;
    await api.pipelineSaveFile(filePath, outLines.join('\n'));
    savedFiles.push(filePath);
  }

  return savedFiles;
}

export async function runWildcardPipeline(
  cfg: PipelineConfig,
  onProgress: (step: string) => void
): Promise<PipelineResult> {
  // Step 1: Extract raw prompts from DB
  onProgress('Step 1/4: Extracting prompts from DB...');
  const rawLines = await api.getAllPrompts(cfg.sourceFolder, cfg.recursive);
  if (rawLines.length === 0) {
    throw new Error('No prompts found. Run a scan on the source folder first.');
  }

  // Step 2: Workshop filter — clean/normalize prompts
  onProgress(`Step 2/4: Workshop filter (${rawLines.length} prompts)...`);
  const cleanedLines = await api.generateWildcards({
    paths: [],
    prompts: rawLines,
    threshold: cfg.workshopThreshold,
    filter: cfg.workshopFilter,
  });
  if (cleanedLines.length === 0) {
    throw new Error('Workshop filter removed all prompts. Adjust threshold or filter settings.');
  }

  // Step 3: Load TagClassifier preset (subsets, word groups, registers)
  onProgress(`Step 3/4: Loading preset '${cfg.presetName}'...`);
  const { subsets, wordGroups, registers } = await loadClassifierPreset(cfg.presetName);

  // Step 4: Classify every cleaned line through the subset waterfall. Kicked off
  // first so it runs concurrently with the independent partition pass below.
  onProgress(`Step 4/4: Classifying ${cleanedLines.length} prompts...`);
  const resultsPromise = api.classifyPromptsCommand(cleanedLines, subsets, wordGroups);
  resultsPromise.catch(() => {}); // partitioning may throw first; avoid an unhandled rejection

  // Step 4a: Partition cleaned lines. Registers (the general scene axis) take
  // precedence; otherwise fall back to the SFW/NSFW separationMode.
  const out = cfg.outputFolder;
  // Flat output: every file lives directly in `out` with a "<date>_<category>_"
  // filename prefix. The date token versions successive runs so they don't
  // overwrite; the category token keeps same-named subset files from colliding.
  const datePart = cfg.datePrefix ? `${formatDateStamp()}_` : '';
  const prefixFor = (category: string) => `${datePart}${sanitizeName(category)}_`;

  let partitions: Partition[];
  let laneCounts: { sfw: number; nsfw: number } | undefined;
  let registerCounts: Record<string, number> | undefined;

  if (registers.length > 0) {
    const ids = await api.classifyRegistersCommand(cleanedLines, registers);
    partitions = registers.map(reg => ({
      category: reg.name,
      indices: cleanedLines.map((_, i) => i).filter(i => ids[i] === reg.id),
    }));
    registerCounts = Object.fromEntries(partitions.map(p => [p.category, p.indices.length]));
  } else {
    const mode = cfg.separationMode;
    const all = cleanedLines.map((_, i) => i);
    if (mode === 'all') {
      partitions = [{ category: 'all', indices: all }];
    } else {
      const flags = await api.classifyNsfwLines(cleanedLines, cfg.nsfwTags);
      const sfw = all.filter(i => !flags[i]);
      const nsfw = all.filter(i => flags[i]);
      laneCounts = { sfw: sfw.length, nsfw: nsfw.length };
      if (mode === 'sfwOnly') {
        partitions = [{ category: 'sfw', indices: sfw }];
      } else if (mode === 'nsfwOnly') {
        partitions = [{ category: 'nsfw', indices: nsfw }];
      } else {
        // 'split' — both lanes, distinguished by filename category prefix.
        partitions = [
          { category: 'sfw', indices: sfw },
          { category: 'nsfw', indices: nsfw },
        ];
      }
    }
  }

  // Step 4b: Await the classification kicked off above; save each partition's subset files.
  const results = await resultsPromise;

  const savedFiles: string[] = [];

  // Optional raw dump: the cleaned, pre-classification prompt list.
  if (cfg.saveRaw) {
    let rawOut = cleanedLines;
    if (cfg.removeDuplicates) rawOut = Array.from(new Set(rawOut));
    const rawPath = `${out}/${datePart}raw.txt`;
    await api.pipelineSaveFile(rawPath, rawOut.join('\n'));
    savedFiles.push(rawPath);
  }

  for (const p of partitions) {
    if (p.indices.length === 0) continue;
    const partResults = p.indices.map(i => results[i]);
    const written = await saveFromResults(partResults, subsets, out, prefixFor(p.category), cfg.removeDuplicates);
    savedFiles.push(...written);
  }

  if (savedFiles.length === 0) {
    throw new Error('Nothing to save — no prompts landed in any partition. Check the mode, registers, or NSFW keywords.');
  }

  return {
    totalLines: rawLines.length,
    cleanedLines: cleanedLines.length,
    savedFiles,
    laneCounts,
    registerCounts,
  };
}
