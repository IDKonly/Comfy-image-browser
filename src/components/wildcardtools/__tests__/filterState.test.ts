import { describe, it, expect } from "vitest";
import { tagExclusionReason, isTagExcluded } from "../filterState";
import { FilterState } from "../../../store/types";

/**
 * These pin the dialog's notion of "already filtered" to `apply_filters` in
 * `src-tauri/src/wildcard/filter.rs`. The Refine-Tags list previously modelled only
 * exact_match and partial_match, so it disagreed with the backend on exceptions and
 * max_words — the reason already-filtered tags rendered as available and vice versa.
 */
const base = (over: Partial<FilterState> = {}): FilterState => ({
  partial_match: [],
  exact_match: [],
  exceptions: [],
  max_words: 0,
  min_tags: 0,
  max_depth: 0,
  simple_mode: false,
  simple_exclusions: [],
  mix_mode: false,
  mix_depth: 0,
  mix_tandem_min_branches: 0,
  mix_tandem_ratio: 0,
  ...over,
} as FilterState);

describe("tagExclusionReason", () => {
  it("returns null when no rule touches the tag", () => {
    expect(tagExclusionReason("blue eyes", base())).toBe(null);
  });

  it("reports an exact match", () => {
    expect(tagExclusionReason("blue eyes", base({ exact_match: ["blue eyes"] }))).toBe("exact");
  });

  it("exact match is verbatim, not substring", () => {
    expect(tagExclusionReason("blue eyes", base({ exact_match: ["blue"] }))).toBe(null);
  });

  it("reports a partial match by substring", () => {
    expect(tagExclusionReason("blue eyes", base({ partial_match: ["eyes"] }))).toBe("partial");
  });

  it("ignores empty partial entries, which would otherwise match everything", () => {
    expect(tagExclusionReason("blue eyes", base({ partial_match: [""] }))).toBe(null);
  });

  it("reports max_words only when the limit is enabled", () => {
    expect(tagExclusionReason("a b c", base({ max_words: 2 }))).toBe("max-words");
    expect(tagExclusionReason("a b c", base({ max_words: 3 }))).toBe(null);
    // 0 disables the rule rather than excluding everything
    expect(tagExclusionReason("a b c", base({ max_words: 0 }))).toBe(null);
  });

  it("prefers the first matching rule, in the backend's order", () => {
    const f = base({ exact_match: ["a b c"], partial_match: ["b"], max_words: 1 });
    expect(tagExclusionReason("a b c", f)).toBe("exact");
    expect(tagExclusionReason("a b c", base({ partial_match: ["b"], max_words: 1 }))).toBe("partial");
  });

  it("lets exceptions rescue a tag any rule matched", () => {
    for (const f of [
      base({ exact_match: ["x"], exceptions: ["x"] }),
      base({ partial_match: ["x"], exceptions: ["x"] }),
      base({ max_words: 1, exceptions: ["x y"] }),
    ]) {
      const tag = f.max_words > 0 ? "x y" : "x";
      expect(tagExclusionReason(tag, f)).toBe("exception");
      expect(isTagExcluded(tag, f)).toBe(false);
    }
  });

  it("does not invent an exception for an untouched tag", () => {
    expect(tagExclusionReason("x", base({ exceptions: ["x"] }))).toBe(null);
  });

  it("uses simple_exclusions alone in simple mode", () => {
    const f = base({ simple_mode: true, simple_exclusions: ["hair"], exact_match: ["solo"] });
    expect(tagExclusionReason("long hair", f)).toBe("simple");
    // the non-simple lists are inert here, matching apply_simple_filter
    expect(tagExclusionReason("solo", f)).toBe(null);
  });

  it("matches simple exclusions case-insensitively", () => {
    const f = base({ simple_mode: true, simple_exclusions: ["HAIR"] });
    expect(tagExclusionReason("long hair", f)).toBe("simple");
  });

  it("tolerates missing list fields from older saved filters", () => {
    const partial = { max_words: 0, simple_mode: false } as unknown as FilterState;
    expect(() => tagExclusionReason("x", partial)).not.toThrow();
    expect(tagExclusionReason("x", partial)).toBe(null);
  });
});

describe("isTagExcluded", () => {
  it("is true for every reason except the rescue", () => {
    expect(isTagExcluded("x", base({ exact_match: ["x"] }))).toBe(true);
    expect(isTagExcluded("x", base({ partial_match: ["x"] }))).toBe(true);
    expect(isTagExcluded("a b", base({ max_words: 1 }))).toBe(true);
    expect(isTagExcluded("x", base({ exact_match: ["x"], exceptions: ["x"] }))).toBe(false);
    expect(isTagExcluded("x", base())).toBe(false);
  });
});
