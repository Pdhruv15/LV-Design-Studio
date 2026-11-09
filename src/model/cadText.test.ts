import { describe, expect, it } from 'vitest';
import { anchorFor, ISO_TEXT_MM, justDxf, justFractions, parseJust, rejustified, textBaseAt, textBox, textCorners, withTextHeight } from './cadText';
import type { SketchItem } from '../types';

// "DB-01" at 250 high: 5 × 0.6 × 250 = 750 wide, anchored at the left end of its baseline.
const t: SketchItem = { id: 't1', kind: 'text', layer: 'LV-ANNO', pts: [[1000, 2000]], text: 'DB-01', h: 250 };
const close = (a: [number, number], b: [number, number]) => { expect(a[0]).toBeCloseTo(b[0], 6); expect(a[1]).toBeCloseTo(b[1], 6); };

describe('text justification', () => {
  it('reads the anchor\'s place on the box: L / C / R on the baseline, T / M / B rows', () => {
    expect(justFractions(undefined)).toEqual({ fx: 0, fy: 0 });
    expect(justFractions('C')).toEqual({ fx: 0.5, fy: 0 });
    expect(justFractions('TR')).toEqual({ fx: 1, fy: 1 });
    expect(justFractions('MC')).toEqual({ fx: 0.5, fy: 0.5 });
    expect(justFractions('BL')).toEqual({ fx: 0, fy: 0 });
  });

  it('keeps the text where it is when justified another way: the box does not move, the anchor does', () => {
    const box = textBox(t);
    expect(box).toEqual({ origin: [1000, 2000], w: 750, h: 250 });
    const mc = rejustified(t, 'MC');
    expect(mc.just).toBe('MC');
    close(mc.pts[0], [1375, 2125]);
    close(textBox(mc).origin, [1000, 2000]);
    const tr = rejustified(mc, 'TR');
    close(tr.pts[0], [1750, 2250]);
    close(textBox(tr).origin, [1000, 2000]);
    // Back to Left: not stored.
    const l = rejustified(tr, 'L');
    expect(l.just).toBeUndefined();
    close(l.pts[0], [1000, 2000]);
    expect(anchorFor(t, 'BC')).toEqual([1375, 2000]);
  });

  it('follows the rotation: a text up the page, anchored top right', () => {
    const up: SketchItem = { ...t, rot: Math.PI / 2, just: 'TR' };
    // Up the page: the baseline runs +y from the origin, the box extends to -x (its "up" is -x).
    close(textBox(up).origin, [1000 + 250, 2000 - 750]);
    const c = textCorners(up);
    close(c[0], [1250, 1250]); close(c[1], [1250, 2000]); close(c[2], [1000, 2000]); close(c[3], [1000, 1250]);
    const b = textBaseAt(up);
    close(b.at, [1250, 2000]); expect(b.align).toBe('right');
  });

  it('gives the renderer the baseline point under the anchor and the alignment', () => {
    expect(textBaseAt(t)).toEqual({ at: [1000, 2000], align: 'left' });
    const mc = textBaseAt({ ...t, just: 'MC' });
    close(mc.at, [1000, 1875]); expect(mc.align).toBe('center');
    expect(textBaseAt({ ...t, just: 'BR' }).align).toBe('right');
  });

  it('parses what is typed, and maps to the DXF alignment codes', () => {
    expect(parseJust('mc')).toBe('MC');
    expect(parseJust('Centre')).toBe('C');
    expect(parseJust('center')).toBe('C');
    expect(parseJust('Left')).toBe('L');
    expect(parseJust('middle')).toBe('MC');
    expect(parseJust('XX')).toBeUndefined();
    expect(justDxf(undefined)).toEqual({ h: 0, v: 0 });
    expect(justDxf('R')).toEqual({ h: 2, v: 0 });
    expect(justDxf('TC')).toEqual({ h: 1, v: 3 });
    expect(justDxf('ML')).toEqual({ h: 0, v: 2 });
    expect(justDxf('BR')).toEqual({ h: 2, v: 1 });
  });

  it('changes the height about the anchor, and offers the ISO series', () => {
    const big = withTextHeight({ ...t, just: 'MC' }, 500);
    expect(big.h).toBe(500);
    expect(big.pts[0]).toEqual([1000, 2000]);
    expect(ISO_TEXT_MM).toEqual([1.8, 2.5, 3.5, 5, 7, 10, 14, 20]);
  });
});
