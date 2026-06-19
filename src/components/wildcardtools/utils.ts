// Tag/path tokenization helpers for the Wildcard Workshop. NOTE: the three comma/line
// split variants are intentionally distinct (some filter empties, some don't) and must
// not be merged — see the per-call-site usage.

/** Basename of a path (last segment after a forward or back slash). */
export const basename = (p: string): string | undefined => p.split(/[\\/]/).pop();

/** Split on commas OR newlines, trim, drop empties. */
export const splitCommaOrNewline = (input: string): string[] =>
  input.split(/[,\n]/).map(s => s.trim()).filter(s => s);

/** Split on newlines only, trim, drop empties. */
export const splitLines = (input: string): string[] =>
  input.split('\n').map(s => s.trim()).filter(s => s);

/** Split on commas, trim — keeps empty entries (used by the live filter textareas). */
export const splitCommaTrim = (input: string): string[] =>
  input.split(',').map(s => s.trim());

/** Split on commas, trim, drop empties. */
export const splitCommaTrimNonEmpty = (input: string): string[] =>
  input.split(',').map(s => s.trim()).filter(Boolean);

/** Set-union of two string lists, preserving first-seen order. */
export const uniqueMerge = (existing: string[], incoming: string[]): string[] =>
  Array.from(new Set([...existing, ...incoming]));
