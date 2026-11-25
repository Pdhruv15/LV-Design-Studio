import { describe, expect, it } from 'vitest';
import { changeAreas, compareLine, compareRefLines } from './cadRefCompare';

const segs = (...l: number[][]) => Float64Array.from(l.flat());

describe('compare a reference with a new revision (XCOMPARE)', () => {
  it('lines within the tolerance at both ends are the same, either way round; the rest added or removed', () => {
    const before = segs([0, 0, 1000, 0], [1000, 0, 1000, 1000], [5000, 5000, 6000, 5000]);
    const after = segs([1000.3, 0.2, 0, 0], [1000, 0, 1000, 1000], [0, 3000, 500, 3000]); // the first reversed and nudged
    const d = compareRefLines(before, after, 1, 2000);
    expect(d.same).toBe(2);
    expect([...d.added]).toEqual([0, 3000, 500, 3000]);
    expect([...d.removed]).toEqual([5000, 5000, 6000, 5000]);
    expect(d.areas).toHaveLength(2);
  });

  it('a line twice in the old and once in the new: one removed (each line matches once)', () => {
    const d = compareRefLines(segs([0, 0, 10, 0], [0, 0, 10, 0]), segs([0, 0, 10, 0]), 0.5, 100);
    expect([d.same, d.added.length / 4, d.removed.length / 4]).toEqual([1, 0, 1]);
  });

  it('areas: changes within the gap form one area, grown by half a gap; largest first', () => {
    const a = changeAreas([segs([0, 0, 100, 0], [300, 0, 400, 0]), segs([10000, 10000, 10010, 10000])], 500);
    expect(a).toEqual([[-250, -250, 650, 250], [9750, 9750, 10260, 10250]]);
    expect(changeAreas([], 500)).toEqual([]);
  });

  it('the command line says what changed, or that nothing did', () => {
    const none = compareRefLines(segs([0, 0, 1, 0]), segs([0, 0, 1, 0]), 0.1, 10);
    expect(compareLine('ARCH', none)).toBe('XCOMPARE  ARCH: no change — every line of the new revision is where it was (1 line).');
    const some = compareRefLines(segs([0, 0, 1, 0]), segs([0, 5, 1, 5], [0, 6, 1, 6]), 0.1, 10);
    expect(compareLine('ARCH', some)).toBe('XCOMPARE  ARCH: 2 lines added (green), 1 removed (red), in 1 area · 0 the same');
  });
});
