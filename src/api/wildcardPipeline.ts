import { api } from ".";
import type { FilterState } from "../store/types";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import {
  classifierStore,
  fsExists,
  fsReadTextFile,
} from "../components/tagclassifier/browserFallback";
import type { Subset, WordGroup } from "../components/tagclassifier/types";

export interface PipelineConfig {
  sourceFolder: string;
  outputFolder: string;
  recursive: boolean;
  presetName: string;
  workshopThreshold: number;
  workshopFilter: FilterState;
  removeDuplicates: boolean;
}

export interface PipelineResult {
  totalLines: number;
  cleanedLines: number;
  savedFiles: string[];
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

  // Step 3: Load TagClassifier preset
  onProgress(`Step 3/4: Loading preset '${cfg.presetName}'...`);
  let subsets: Subset[];
  let wordGroups: WordGroup[];

  if (cfg.presetName === 'default') {
    subsets = ((await classifierStore.get('subsets')) as Subset[] | null) ?? [
      { id: 1, name: 'Tags', keywords: [], excludeKeywords: [] },
    ];
    wordGroups = ((await classifierStore.get('wordGroups')) as WordGroup[] | null) ?? [];
  } else {
    const filePath = `classifier_presets/${cfg.presetName}.json`;
    if (!(await fsExists(filePath, { baseDir: BaseDirectory.AppData }))) {
      throw new Error(`Preset '${cfg.presetName}' not found in AppData.`);
    }
    const raw = await fsReadTextFile(filePath, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(raw);
    subsets = parsed.subsets ?? [];
    wordGroups = parsed.wordGroups ?? [];
  }

  // Step 4: Classify each cleaned line through the waterfall
  onProgress(`Step 4/4: Classifying ${cleanedLines.length} prompts...`);
  const results: any[] = await api.classifyPromptsCommand(cleanedLines, subsets, wordGroups);

  // Step 5: Save one file per Subset (output group)
  const savedFiles: string[] = [];
  const allIds = new Set<number>();
  results.forEach(r => r.data?.forEach((d: any) => allIds.add(d.id)));

  for (const id of allIds) {
    const subsetName = id === 0
      ? 'unclassified'
      : (subsets.find(s => s.id === id)?.name ?? `group_${id}`);

    let lines: string[] = results
      .map(r => {
        const group = r.data?.find((d: any) => d.id === id);
        return (group?.matches as string[] | undefined)?.join(', ') ?? '';
      })
      .filter(l => l.trim() !== '');

    if (cfg.removeDuplicates) {
      lines = Array.from(new Set(lines));
    }
    if (lines.length === 0) continue;

    const filePath = `${cfg.outputFolder}/${subsetName}.txt`;
    await api.saveToFile(filePath, lines.join('\n'));
    savedFiles.push(filePath);
  }

  return { totalLines: rawLines.length, cleanedLines: cleanedLines.length, savedFiles };
}
