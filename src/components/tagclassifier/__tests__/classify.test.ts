import { describe, it, expect } from 'vitest';
import { getMergedTag, parseLine } from '../classify';
import { Subset, WordGroup } from '../types';

const wg = (name: string, words: string[]): WordGroup => ({ id: 1, name, words });

describe('getMergedTag (parity with Rust classifier)', () => {
  it('replaces a member word with its {group} variable, leaving the rest intact', () => {
    expect(getMergedTag('blue dress', [wg('color', ['blue'])])).toBe('{color} dress');
    expect(getMergedTag('a blue cat', [wg('color', ['blue'])])).toBe('a {color} cat');
  });

  it('restores the trailing boundary (word at end of tag)', () => {
    expect(getMergedTag('blue', [wg('color', ['blue'])])).toBe('{color}');
  });

  it('does not replace a substring that is not on a word boundary', () => {
    expect(getMergedTag('bluebird', [wg('color', ['blue'])])).toBe('bluebird');
  });

  it('processes longer member words first (length-sorted)', () => {
    expect(getMergedTag('blue dress', [wg('g', ['blue', 'dress'])])).toBe('{g} {g}');
  });
});

describe('parseLine (waterfall classification)', () => {
  const subsets: Subset[] = [
    { id: 1, name: 'Solo', keywords: ['1girl', 'solo'], excludeKeywords: ['multiple'] },
    { id: 2, name: 'Hair', keywords: ['hair'], excludeKeywords: [] },
  ];

  it('claims tags per subset in order, with the remainder going to Unclassified', () => {
    const data = parseLine('1girl, solo, long hair, blue dress', subsets, []);
    expect(data[0]).toMatchObject({ id: 1, matches: ['1girl', 'solo'] });
    expect(data[1]).toMatchObject({ id: 2, matches: ['long hair'] });
    expect(data[data.length - 1]).toMatchObject({ id: 0, name: 'Unclassified', matches: ['blue dress'] });
  });

  it('honors exclude keywords', () => {
    const data = parseLine('multiple girls, short hair', subsets, []);
    expect(data[0].matches).toEqual([]); // "multiple" excludes from Solo
  });

  it('returns [] for an empty line', () => {
    expect(parseLine('   ', subsets, [])).toEqual([]);
  });
});
