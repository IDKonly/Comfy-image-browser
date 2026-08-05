import { describe, it, expect } from "vitest";
import { computeReach } from "../../ui/tagReach";
import { parseLine, subsetClaims } from "../classify";
import { Subset } from "../types";

/** The Library grid's sort comparator, mirrored here so the ordering itself is testable. */
const byReach = (tags: string[]) => {
  const reach = computeReach(tags);
  return [...tags].sort((a, b) =>
    (reach.get(b)! - reach.get(a)!) || (a.length - b.length) || a.localeCompare(b)
  );
};

describe("computeReach", () => {
  it("counts every tag a keyword would claim, including itself", () => {
    const reach = computeReach(["hair", "long hair", "blue hair", "smile"]);
    expect(reach.get("hair")).toBe(3);
    expect(reach.get("long hair")).toBe(1);
    expect(reach.get("smile")).toBe(1);
  });

  it("agrees with what the classifier actually claims", () => {
    const tags = ["hair", "long hair", "blue hair", "smile"];
    const reach = computeReach(tags);
    const sub: Subset = { id: 1, name: "G", keywords: ["hair"], excludeKeywords: [] };
    const claimed = parseLine(tags.join(", "), [sub], [])[0].matches;
    expect(claimed).toHaveLength(reach.get("hair")!);
  });

  it("handles mid-string containment, not just suffixes", () => {
    const reach = computeReach(["eyes", "blue eyes", "closed eyes", "eyeshadow"]);
    // "eyes" is a substring of "eyeshadow" too — substring matching, not word matching.
    expect(reach.get("eyes")).toBe(4);
  });

  it("gives every tag a reach of at least 1", () => {
    const tags = ["a", "bb", "ccc"];
    const reach = computeReach(tags);
    expect([...reach.values()].every(v => v >= 1)).toBe(true);
  });

  it("is empty for an empty dataset", () => {
    expect(computeReach([]).size).toBe(0);
  });
});

describe("Library sort order", () => {
  it("puts the widest-reaching tags first", () => {
    const sorted = byReach(["long hair", "hair", "blue hair", "smile", "hair ornament"]);
    expect(sorted[0]).toBe("hair");
  });

  it("breaks reach ties by length, then alphabetically", () => {
    // All four are self-only (reach 1); "abc"/"abd" are shortest and tie on length.
    expect(byReach(["zzzz", "abd", "abc", "yyy"])).toEqual(["abc", "abd", "yyy", "zzzz"]);
  });

  it("orders a realistic dataset broad-to-narrow", () => {
    const sorted = byReach([
      "1girl", "solo", "long hair", "hair", "blue hair", "hair between eyes",
      "eyes", "blue eyes", "closed eyes",
    ]);
    // "hair" claims 4, "eyes" claims 4 — both lead; "eyes" is shorter so it wins the tie.
    expect(sorted.slice(0, 2).sort()).toEqual(["eyes", "hair"]);
    // Self-only tags sink to the back.
    expect(sorted.slice(-1)[0]).toBe("hair between eyes");
  });

  it("is stable — sorting an already sorted list changes nothing", () => {
    const tags = ["hair", "long hair", "blue hair", "smile"];
    expect(byReach(byReach(tags))).toEqual(byReach(tags));
  });
});

describe("subsetClaims — drives the upstream-claimed dimming", () => {
  const g = (over: Partial<Subset>): Subset =>
    ({ id: 1, name: "G", keywords: [], excludeKeywords: [], ...over });

  it("claims on substring include", () => {
    expect(subsetClaims("long hair", g({ keywords: ["hair"] }))).toBe(true);
    expect(subsetClaims("smile", g({ keywords: ["hair"] }))).toBe(false);
  });

  it("releases a tag caught by an exclude", () => {
    expect(subsetClaims("blue hair", g({ keywords: ["hair"], excludeKeywords: ["blue"] }))).toBe(false);
  });

  it("lets an exact include punch back through an exclude", () => {
    const sub = g({ keywords: ["hair", "blue hair"], excludeKeywords: ["blue"] });
    expect(subsetClaims("blue hair", sub)).toBe(true);
    // …but only for that exact tag, not its neighbours.
    expect(subsetClaims("blue hair ornament", sub)).toBe(false);
  });

  it("claims nothing when the group has no includes", () => {
    expect(subsetClaims("anything", g({ excludeKeywords: ["any"] }))).toBe(false);
  });

  it("agrees with parseLine on which group wins a tag", () => {
    const a = g({ id: 1, name: "A", keywords: ["hair"] });
    const b = g({ id: 2, name: "B", keywords: ["long"] });
    // "long hair" matches both; the waterfall gives it to whichever comes first.
    expect(subsetClaims("long hair", a)).toBe(true);
    const result = parseLine("long hair", [a, b], []);
    expect(result.find(r => r.matches.includes("long hair"))!.name).toBe("A");
  });
});
