import { describe, it, expect } from "vitest";
import { parseTagList } from "../TagInput";
import { computeReach, filterAndSortTags } from "../tagReach";

describe("parseTagList", () => {
  it("splits on commas", () => {
    expect(parseTagList("1girl, solo, long hair")).toEqual(["1girl", "solo", "long hair"]);
  });

  // The reason this exists: hand-maintained exclusion lists and anything copied out of a
  // .txt file are newline-separated, and comma-only splitting turned them into one entry.
  it("splits on newlines", () => {
    expect(parseTagList("masterpiece\nbest quality\nabsurdres"))
      .toEqual(["masterpiece", "best quality", "absurdres"]);
  });

  it("splits on a mix of both, in any run length", () => {
    expect(parseTagList("a,\nb\n\nc, ,d,,e"))
      .toEqual(["a", "b", "c", "d", "e"]);
  });

  it("tolerates CRLF line endings", () => {
    expect(parseTagList("alpha\r\nbeta\r\n")).toEqual(["alpha", "beta"]);
  });

  it("trims surrounding whitespace and drops blank entries", () => {
    expect(parseTagList("  spaced out  ,\t tabbed \n\n , ")).toEqual(["spaced out", "tabbed"]);
  });

  it("keeps internal spaces and punctuation that belong to a tag", () => {
    expect(parseTagList("<lora:foo:1.0>\nrating:safe")).toEqual(["<lora:foo:1.0>", "rating:safe"]);
  });

  it("returns nothing for input with no tags", () => {
    expect(parseTagList("")).toEqual([]);
    expect(parseTagList("  \n , \n ")).toEqual([]);
  });
});

describe("filterAndSortTags", () => {
  const tags = ["blue hair", "hair", "long hair", "smile"].sort();
  const reach = computeReach(tags);

  it("orders by reach descending — the widest rule leads", () => {
    expect(filterAndSortTags(tags, "", "reach", reach)[0]).toBe("hair");
  });

  it("breaks reach ties with the shorter, more general tag first", () => {
    const t = ["aa", "bbb"].sort();
    const sorted = filterAndSortTags(t, "", "reach", computeReach(t));
    expect(sorted).toEqual(["aa", "bbb"]);
  });

  it("leaves alphabetical order untouched in alpha mode", () => {
    expect(filterAndSortTags(tags, "", "alpha", reach)).toEqual(tags);
  });

  it("filters by substring, case-insensitively", () => {
    expect(filterAndSortTags(tags, "HAIR", "alpha", reach)).toEqual(["blue hair", "hair", "long hair"]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterAndSortTags(tags, "  smile  ", "alpha", reach)).toEqual(["smile"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterAndSortTags(tags, "", "alpha", reach)).toEqual(tags);
  });

  it("falls back to a reach of 1 for tags missing from the map", () => {
    // A stale memoised map must not throw or produce NaN ordering.
    expect(() => filterAndSortTags([...tags, "unmapped"], "", "reach", reach)).not.toThrow();
    expect(filterAndSortTags([...tags, "unmapped"], "", "reach", reach)).toHaveLength(5);
  });
});
