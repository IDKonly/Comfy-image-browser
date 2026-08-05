import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { classifierStore, fsExists, fsReadDir, fsReadTextFile } from "./browserFallback";
import type { Subset, WordGroup, Register } from "./types";

// Single home for the classifier-preset storage conventions ('default' = live
// classifierStore keys, anything else = classifier_presets/<name>.json in
// AppData). The pipeline, the prompt generator, and both tool panels all load
// presets through here so a schema or location change is a one-file edit.

export interface ClassifierPreset {
  subsets: Subset[];
  wordGroups: WordGroup[];
  registers: Register[];
}

/**
 * Load a TagClassifier preset by name. Fields added after a preset was saved
 * (e.g. `registers`) fall back to empty. Throws if a named preset is missing.
 */
export async function loadClassifierPreset(presetName: string): Promise<ClassifierPreset> {
  if (presetName === 'default') {
    return {
      subsets: ((await classifierStore.get('subsets')) as Subset[] | null) ?? [
        { id: 1, name: 'Tags', keywords: [], excludeKeywords: [] },
      ],
      wordGroups: ((await classifierStore.get('wordGroups')) as WordGroup[] | null) ?? [],
      registers: ((await classifierStore.get('registers')) as Register[] | null) ?? [],
    };
  }
  const filePath = `classifier_presets/${presetName}.json`;
  if (!(await fsExists(filePath, { baseDir: BaseDirectory.AppData }))) {
    throw new Error(`Preset '${presetName}' not found in AppData.`);
  }
  const parsed = JSON.parse(await fsReadTextFile(filePath, { baseDir: BaseDirectory.AppData }));
  return {
    subsets: parsed.subsets ?? [],
    wordGroups: parsed.wordGroups ?? [],
    registers: parsed.registers ?? [],
  };
}

/** Names of the saved presets in `classifier_presets/` (without `.json`). */
export async function listClassifierPresets(): Promise<string[]> {
  const subDir = 'classifier_presets';
  if (!(await fsExists(subDir, { baseDir: BaseDirectory.AppData }))) return [];
  const entries = await fsReadDir(subDir, { baseDir: BaseDirectory.AppData });
  return entries
    .filter((e: any) => e.name?.endsWith('.json'))
    .map((e: any) => e.name.replace('.json', '') as string);
}
