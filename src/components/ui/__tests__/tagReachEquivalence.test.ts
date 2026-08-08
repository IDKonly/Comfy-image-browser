import { describe, it, expect } from "vitest";
import { computeReach } from "../tagReach";

/**
 * The definition of reach, written the obvious way: count every tag containing the
 * candidate. `computeReach` narrows candidates through a bigram index before verifying,
 * so it must agree with this on every input. These tests exist to catch the index going
 * subtly wrong — dropping a bucket, mishandling repeated bigrams, off-by-one on the
 * length ordering — in ways a handful of hand-written cases would miss.
 */
const referenceReach = (tags: string[]) => {
  const m = new Map<string, number>();
  for (const c of tags) m.set(c, tags.filter(t => t.includes(c)).length);
  return m;
};

const expectAgreement = (tags: string[]) => {
  const actual = computeReach(tags);
  const expected = referenceReach(tags);
  expect(actual.size).toBe(expected.size);
  for (const [tag, n] of expected) expect(`${tag}=${actual.get(tag)}`).toBe(`${tag}=${n}`);
};

// Deterministic PRNG — a seeded generator keeps failures reproducible, and Math.random
// would make this test flaky rather than thorough.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

describe("computeReach matches the pairwise definition", () => {
  it("on an empty list", () => expectAgreement([]));

  it("on a single tag", () => expectAgreement(["hair"]));

  it("on one-character tags, which have no bigram to index", () => {
    expectAgreement(["a", "b", "ab", "aab", "ba", "aaa"]);
  });

  it("on tags whose bigrams repeat within the same tag", () => {
    // "aa" occurs three times in "aaaa"; the bucket must list that tag once.
    expectAgreement(["aa", "aaaa", "aaaaaa", "a"]);
    expect(computeReach(["aa", "aaaa"]).get("aa")).toBe(2);
  });

  it("on tags that are prefixes, suffixes and infixes of each other", () => {
    expectAgreement(["eye", "eyes", "blue eyes", "eyeshadow", "closed eyes", "shadow"]);
  });

  it("on duplicate-free realistic tags", () => {
    expectAgreement([
      "1girl", "solo", "hair", "long hair", "blue hair", "hair ornament",
      "hair between eyes", "eyes", "blue eyes", "closed eyes", "smile", "open mouth",
    ]);
  });

  it("on tags containing regex-significant characters", () => {
    expectAgreement(["a.b", "a.b.c", "(x)", "(x) y", "c++", "c++ code", "[]", "a[]b"]);
  });

  it("on unicode tags", () => {
    expectAgreement(["푸른 눈", "눈", "긴 머리", "머리", "머리 장식"]);
  });

  it.each([1, 2, 3, 4, 5])("on random corpus #%i", seed => {
    const rand = rng(seed);
    const parts = ["a", "ab", "abc", "b", "bc", "c", "x", "xy", " ", "hair", "eye"];
    const tags = new Set<string>();
    while (tags.size < 300) {
      const len = 1 + Math.floor(rand() * 4);
      let s = "";
      for (let i = 0; i < len; i++) s += parts[Math.floor(rand() * parts.length)];
      if (s.trim()) tags.add(s);
    }
    expectAgreement([...tags]);
  });
});
