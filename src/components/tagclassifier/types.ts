export interface Subset {
  id: number;
  name: string;
  keywords: string[];
  excludeKeywords: string[];
}

export interface WordGroup {
  id: number;
  name: string;
  words: string[];
}

/** One subset's matched tags for one line — mirrors `SubsetMatch` in wildcard/classifier.rs. */
export interface SubsetMatch {
  id: number;
  name: string;
  matches: string[];
}

/** Per-line classifier output — mirrors `ClassificationResult` in wildcard/classifier.rs. */
export interface ClassificationResult {
  lineIndex: number;
  data: SubsetMatch[];
}

/**
 * A "scene register" — a whole-line partition axis, orthogonal to Subsets.
 * Where a Subset classifies individual tags by theme, a Register classifies the
 * ENTIRE cleaned prompt line into one bucket (e.g. explicit / exposure / daily)
 * so that recombination only ever mixes fragments from the same scene context.
 *
 * Evaluated as a priority waterfall in array order: the first register whose
 * keywords match (and whose excludeKeywords don't) wins. A register with
 * isFallback=true ignores its keywords and catches everything unmatched; it
 * should be last. Register `name` doubles as the category token in output filenames.
 */
export interface Register {
  id: number;
  name: string;
  keywords: string[];
  excludeKeywords: string[];
  isFallback?: boolean;
}

/** Seed registers offered by the "Add defaults" action, split from DEFAULT_NSFW_TAGS. */
export const DEFAULT_REGISTERS: Register[] = [
  {
    id: 1,
    name: 'explicit',
    keywords: [
      'sex', 'penetration', 'cum', 'ejaculation', 'fellatio', 'cunnilingus',
      'masturbation', 'vaginal', 'anal', 'hetero', 'dildo', 'object insertion',
      'paizuri', 'handjob', 'gangbang',
    ],
    excludeKeywords: [],
  },
  {
    id: 2,
    name: 'exposure',
    keywords: [
      'nude', 'nudity', 'naked', 'topless', 'bottomless', 'nipple', 'areola',
      'penis', 'pussy', 'vagina', 'anus', 'clitoris', 'testicle', 'pubic',
      'ahegao', 'cameltoe', 'no panties', 'no bra', 'nsfw',
    ],
    excludeKeywords: [],
  },
  {
    id: 3,
    name: 'daily',
    keywords: [],
    excludeKeywords: [],
    isFallback: true,
  },
];

export interface TagClassifierProps {
  onClose: () => void;
  initialData?: string;
}
