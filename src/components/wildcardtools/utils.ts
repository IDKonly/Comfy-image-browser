// Tag/path tokenization helpers for the Wildcard Workshop. NOTE: the split variants are
// intentionally distinct (line-only vs comma-only vs both) and must not be merged — see
// the per-call-site usage.

/** Basename of a path (last segment after a forward or back slash). */
export const basename = (p: string): string | undefined => p.split(/[\\/]/).pop();

/** Split on commas OR newlines, trim, drop empties. */
export const splitCommaOrNewline = (input: string): string[] =>
  input.split(/[,\n]/).map(s => s.trim()).filter(s => s);

/** Split on newlines only, trim, drop empties. */
export const splitLines = (input: string): string[] =>
  input.split('\n').map(s => s.trim()).filter(s => s);

/** Split on commas, trim, drop empties. */
export const splitCommaTrimNonEmpty = (input: string): string[] =>
  input.split(',').map(s => s.trim()).filter(Boolean);

/**
 * Decompose a generation prompt into tags, isolating LoRA/embedding tokens like
 * `<lora:name:1.0>` as their own tags even when no comma separates them from a neighbouring
 * tag. Mirrors the backend `split_prompt_tags` (wildcard/utils.rs) so the Refine-Tags list
 * and Workshop output agree. Without this, a trailing `tag<lora:...>` glues the real tag to
 * the LoRA, and a contains-based exclusion matching "lora" would drop both.
 */
export const splitPromptTags = (prompt: string): string[] =>
  prompt
    .replace(/<[^>]*>/g, m => `,${m},`)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

/** Set-union of two string lists, preserving first-seen order. */
export const uniqueMerge = (existing: string[], incoming: string[]): string[] =>
  Array.from(new Set([...existing, ...incoming]));
