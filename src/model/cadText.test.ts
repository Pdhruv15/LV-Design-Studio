import { describe, expect, it } from 'vitest';
import { alignEdge, alignedTo, anchorFor, cased, centredAt, ISO_TEXT_MM, justDxf, justFractions, oriented, parseJust, readableAngle, rejustified, spaced, textBaseAt, textBounds, textBox, textCentre, textCorners, untaggedRooms, withTextHeight } from './cadText';
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

describe('text tools on the texts picked', () => {
  const a: SketchItem = { id: 'a', kind: 'text', layer: 'LV-ANNO', pts: [[1000, 2000]], text: 'DB-01', h: 250 }; // box 1000–1750 × 2000–2250
  const b: SketchItem = { id: 'b', kind: 'text', layer: 'LV-ANNO', pts: [[1400, 1000]], text: 'L1', h: 250 }; // box 1400–1700 × 1000–1250
  const c: SketchItem = { id: 'c', kind: 'text', layer: 'LV-ANNO', pts: [[300, 1500]], text: 'SOCKETS', h: 250, just: 'MC' }; // 1050 wide: 300 ± 525 × 1375–1625

  it('bounds and centre follow the justification and rotation', () => {
    expect(textBounds(c)).toEqual({ x0: -225, y0: 1375, x1: 825, y1: 1625 });
    expect(textCentre(a)).toEqual([1375, 2125]);
    const up = textBounds({ ...a, rot: Math.PI / 2 });
    expect(up.x0).toBeCloseTo(750, 6); expect(up.x1).toBeCloseTo(1000, 6); expect(up.y0).toBeCloseTo(2000, 6); expect(up.y1).toBeCloseTo(2750, 6);
  });

  it('changes case: upper, lower, title (after spaces, brackets and dashes), sentence', () => {
    expect(cased('db room (gf)', 'upper')).toBe('DB ROOM (GF)');
    expect(cased('DB ROOM', 'lower')).toBe('db room');
    expect(cased('fire-alarm panel (gf) a/c', 'title')).toBe('Fire-Alarm Panel (Gf) A/C');
    expect(cased('SOCKETS AND LIGHTS', 'sentence')).toBe('Sockets and lights');
  });

  it('turns text readable from the bottom or the right, about its centre', () => {
    expect(readableAngle(Math.PI, 'both')).toBeCloseTo(0, 9);
    expect(readableAngle((5 * Math.PI) / 4, 'both')).toBeCloseTo(Math.PI / 4, 9);
    expect(readableAngle(-Math.PI / 2, 'both')).toBeCloseTo(Math.PI / 2, 9); // reads from the right, not the left
    expect(readableAngle(Math.PI / 3, 'both')).toBeCloseTo(Math.PI / 3, 9);
    expect(readableAngle(Math.PI / 3, 'bottom')).toBe(0);
    expect(readableAngle(0, 'right')).toBe(Math.PI / 2);
    const upside = { ...a, rot: Math.PI }; // its box runs 250–1000 × 1750–2000, centre (625, 1875)
    const o = oriented(upside, 'both');
    expect(o.rot).toBeUndefined();
    close(textCentre(o), textCentre(upside));
    close(o.pts[0], [250, 1750]);
    expect(oriented(a, 'both')).toBe(a);
    const right = oriented(c, 'right');
    expect(right.rot).toBeCloseTo(Math.PI / 2, 9); expect(right.just).toBe('MC'); close(right.pts[0], [300, 1500]);
  });

  it('centres a text on a point', () => {
    const m = centredAt(a, [5000, 5000]);
    close(textCentre(m), [5000, 5000]);
    close(m.pts[0], [5000 - 375, 5000 - 125]);
  });

  it('aligns texts on an edge and spaces them down the page', () => {
    expect(alignEdge(a, 'left')).toBe(1000); expect(alignEdge(a, 'right')).toBe(1750); expect(alignEdge(a, 'centre')).toBe(1375);
    expect(alignEdge(a, 'top')).toBe(2250); expect(alignEdge(a, 'bottom')).toBe(2000);
    expect(alignedTo(b, 'left', alignEdge(a, 'left')).pts[0]).toEqual([1000, 1000]);
    expect(alignedTo(b, 'right', 1750).pts[0]).toEqual([1450, 1000]);
    expect(alignedTo(c, 'centre', 1375).pts[0]).toEqual([1375, 1500]);
    expect(alignedTo(b, 'top', 2250).pts[0]).toEqual([1400, 2000]);
    expect(alignedTo(b, 'bottom', 2000).pts[0]).toEqual([1400, 2000]);
    // Spacing: a (centre y 2125) stays on top; c (1500) then b (1125) follow 400 apart.
    const s = spaced([b, a, c], 400);
    expect(s.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(textCentre(s[1])[1]).toBeCloseTo(1725, 9); expect(textCentre(s[2])[1]).toBeCloseTo(1325, 9);
    expect(s[1].pts[0][0]).toBe(300); // only y moves
  });

  it('finds the rooms with no tag yet', () => {
    const rooms = [{ name: 'Majlis', outline: [[0, 0], [5, 0], [5, 4], [0, 4]] as [number, number][] }, { name: 'Kitchen', outline: [[5, 0], [9, 0], [9, 4], [5, 4]] as [number, number][] }, { name: 'No outline' }];
    const tag: SketchItem = { id: 't', kind: 'text', layer: 'LV-ANNO', pts: [[2500, 2000]], text: 'MAJLIS', h: 250 }; // mm drawing: (2.5, 2) m, in Majlis
    const inside = (p: [number, number], poly: [number, number][]) => p[0] >= Math.min(...poly.map((q) => q[0])) && p[0] <= Math.max(...poly.map((q) => q[0])) && p[1] >= 0 && p[1] <= 4;
    expect(untaggedRooms(rooms, [tag], 0.001, inside).map((r) => r.name)).toEqual(['Kitchen']);
    expect(untaggedRooms(rooms, [], 0.001, inside).map((r) => r.name)).toEqual(['Majlis', 'Kitchen']);
  });
});
