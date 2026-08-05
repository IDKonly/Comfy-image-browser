import { api } from ".";
import type { FilterState, GeneratorSettings } from "../store/types";
import { loadClassifierPreset } from "../components/tagclassifier/presets";
import { splitCommaOrNewline } from "../components/wildcardtools/utils";

export interface GeneratorConfig extends GeneratorSettings {
  /** Workshop filter used to clean raw prompts before classifying. */
  workshopFilter: FilterState;
  /** Sampling seed (pass Date.now() for a fresh batch). */
  seed: number;
}

export interface GeneratedPrompt {
  text: string;
  score: number;
}

export interface GeneratorRunResult {
  prompts: GeneratedPrompt[];
  /** Number of source prompts used as the co-occurrence corpus. */
  corpusSize: number;
}

/**
 * Generate N whole prompts from the current preset + DB. Classifies the source
 * folder's prompts into fragment pools, then samples `count` coherent prompts
 * weighted by tag co-occurrence — bounded output, no combinatorial blowup.
 */
export async function runPromptGenerator(
  cfg: GeneratorConfig,
  onProgress: (step: string) => void
): Promise<GeneratorRunResult> {
  onProgress('Extracting prompts from DB...');
  const rawLines = await api.getAllPrompts(cfg.sourceFolder, cfg.recursive);
  if (rawLines.length === 0) {
    throw new Error('No prompts found. Run a scan on the source folder first.');
  }

  // Clean into one line per image (preserve_order keeps them un-merged so the
  // co-occurrence corpus reflects real per-image tag sets).
  onProgress(`Cleaning ${rawLines.length} prompts...`);
  const corpus = await api.generateWildcards({
    paths: [],
    prompts: rawLines,
    threshold: 0.5,
    filter: { ...cfg.workshopFilter, preserve_order: true },
  });
  if (corpus.length === 0) {
    throw new Error('Cleaning removed all prompts. Adjust the Workshop filter.');
  }

  onProgress(`Loading preset '${cfg.presetName}'...`);
  const { subsets, wordGroups, registers } = await loadClassifierPreset(cfg.presetName);

  // Classify each line into subset fragments, and into a register when defined —
  // two independent passes over the same corpus, run concurrently.
  onProgress('Classifying fragments...');
  const [results, registerIds] = await Promise.all([
    api.classifyPromptsCommand(corpus, subsets, wordGroups),
    registers.length > 0
      ? api.classifyRegistersCommand(corpus, registers)
      : Promise.resolve([] as number[]),
  ]);
  const registerNameById = new Map(registers.map(r => [r.id, r.name]));

  const fragmentSets = corpus.map((_, i) => ({
    register: registerNameById.get(registerIds[i]) ?? 'all',
    fragments: (results[i]?.data ?? [])
      .map(d => ({ subsetId: d.id, tags: d.matches }))
      .filter(f => f.tags.length > 0),
  }));

  const subsetOrder = [...subsets.map(s => s.id), 0];

  onProgress(`Generating ${cfg.count} prompts...`);
  const prompts = await api.generatePrompts({
    corpusLines: corpus,
    fragmentSets,
    subsetOrder,
    options: {
      count: cfg.count,
      mustInclude: splitCommaOrNewline(cfg.mustInclude),
      minScore: cfg.minScore,
      register: cfg.register,
      seed: cfg.seed,
    },
  });

  return { prompts, corpusSize: corpus.length };
}
