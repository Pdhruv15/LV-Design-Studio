import { describe, expect, it } from 'vitest';
import { shownPart, withRecentDevice } from './cadState';

describe('Design CAD: a drawing past the engine limit', () => {
  it('says how much of it is shown, rounded down, never 100 %', () => {
    expect(shownPart({ segments: 8_000_000, dropped: 7_054_340 })).toBe('53 %');
    expect(shownPart({ segments: 8_000_000, dropped: 1 })).toBe('99 %');
    expect(shownPart({ segments: 3_000_000 })).toBe('part of it'); // an older engine counts nothing left out
  });
});

describe('Design CAD: the devices placed last', () => {
  it('puts the newest first, once, at most six', () => {
    expect(withRecentDevice(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    expect(withRecentDevice(['a', 'b'], 'x')).toEqual(['x', 'a', 'b']);
    expect(withRecentDevice(['a', 'b', 'c', 'd', 'e', 'f'], 'g')).toEqual(['g', 'a', 'b', 'c', 'd', 'e']);
  });
});
