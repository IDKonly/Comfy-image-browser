import { FilterState } from "../../store/types";

/**
 * Why a tag is (or is not) dropped by the Workshop filter.
 *
 * - `exact`      — listed verbatim in `exact_match`
 * - `partial`    — contains one of the `partial_match` substrings
 * - `max-words`  — more whitespace-separated words than `max_words` allows
 * - `simple`     — simple mode: equals or contains one of `simple_exclusions`
 * - `exception`  — matched a rule above but `exceptions` rescues it, so it is KEPT
 * - `null`       — no rule touched it
 */
export type TagExclusionReason = 'exact' | 'partial' | 'max-words' | 'simple' | 'exception' | null;

/**
 * Mirrors `apply_filters` / `apply_simple_filter` in `src-tauri/src/wildcard/filter.rs`.
 *
 * The Refine-Tags dialog used to model only `exact_match` and `partial_match`, so its
 * checkboxes disagreed with the backend on the other rules: a tag rescued by `exceptions`
 * still rendered as excluded, and one dropped for exceeding `max_words` rendered as kept.
 * Both surfaces now answer the question the same way.
 *
 * Order matters and follows the Rust: exact, then partial, then max_words — first hit wins —
 * and `exceptions` is applied last, overriding whatever matched.
 */
export const tagExclusionReason = (tag: string, filter: FilterState): TagExclusionReason => {
  if (filter.simple_mode) {
    const low = tag.toLowerCase();
    const hit = (filter.simple_exclusions ?? []).some(ex => ex && low.includes(ex.toLowerCase()));
    return hit ? 'simple' : null;
  }

  let reason: TagExclusionReason = null;

  if ((filter.exact_match ?? []).includes(tag)) reason = 'exact';

  if (reason === null) {
    for (const p of filter.partial_match ?? []) {
      if (p && tag.includes(p)) { reason = 'partial'; break; }
    }
  }

  if (reason === null && filter.max_words > 0 && tag.split(/\s+/).filter(Boolean).length > filter.max_words) {
    reason = 'max-words';
  }

  // Rescue is last and unconditional, exactly as the backend applies it.
  if (reason !== null && (filter.exceptions ?? []).includes(tag)) return 'exception';

  return reason;
};

/** True when the filter actually removes this tag from Workshop output. */
export const isTagExcluded = (tag: string, filter: FilterState): boolean => {
  const reason = tagExclusionReason(tag, filter);
  return reason !== null && reason !== 'exception';
};

/** Short badge label for a reason the user did not set by hand on this tag. */
export const REASON_LABEL: Record<Exclude<TagExclusionReason, null | 'exact'>, string> = {
  partial: 'partial',
  'max-words': 'length',
  simple: 'simple',
  exception: 'kept',
};
