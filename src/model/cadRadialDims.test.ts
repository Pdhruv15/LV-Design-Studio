import { describe, expect, it } from 'vitest';
import type { SketchItem } from '../types';
import { angularArc, dimAngle, dimLabel, dimMeasure, dimOf, rotated, segmentsOf, shapesOut, type DimLook } from './cadSketch';
import { mirrored } from './cadEdit';
import { geomKind, kindLabel, propValue, textRows, withProp } from './cadProps';

type Pt = [number, number];
const close = (a: Pt, b: Pt) => { expect(a[0]).toBeCloseTo(b[0], 6); expect(a[1]).toBeCloseTo(b[1], 6); };
const look: DimLook = { arrow: 'closed', size: 90, off: 20, ext: 50, unit: 'm', decimals: 2 };
const c: Pt = [1000, 1000];
const rad = (at: Pt, more: Partial<SketchItem> = {}): SketchItem => ({ id: 'r', kind: 'dim', dimKind: 'radius', layer: 'LV-ANNO', pts: [c, [1500, 1000], at], h: 90, look, ...more });
const dia = (at: Pt): SketchItem => ({ ...rad(at), dimKind: 'diameter' });
// A right angle at the vertex (2000, 2000): one line along +x, one along +y.
const ang = (at: Pt, more: Partial<SketchItem> = {}): SketchItem => ({ id: 'a', kind: 'dim', dimKind: 'angular', layer: 'LV-ANNO', pts: [[2000, 2000], [3000, 2000], [2000, 3000], at], h: 90, look, ...more });

describe('radius and diameter dimensions', () => {
  it('measures the radius or the diameter and writes R or Ø before the length in the style\'s unit', () => {
    expect(dimMeasure(rad([1200, 1000]))).toBeCloseTo(500, 6);
    expect(dimMeasure(dia([1200, 1000]))).toBeCloseTo(1000, 6);
    expect(dimLabel(rad([1200, 1000]), 0.001)).toBe('R0.50');
    expect(dimLabel(dia([1200, 1000]), 0.001)).toBe('Ø1.00');
    expect(dimLabel(rad([1200, 1000], { look: undefined }), 0.001)).toBe('R0.50'); // no style: metres to two places
    expect(dimLabel(rad([1200, 1000], { text: 'R500 TYP' }), 0.001)).toBe('R500 TYP'); // typed over
    expect(dimLabel({ ...rad([1200, 1000]), look: { ...look, unit: 'mm', decimals: 0 } }, 0.001)).toBe('R500');
  });
  it('runs its line along the radius through the text: inside from the centre to the circle, outside on to the text', () => {
    const inside = dimOf(rad([1200, 1000]), 0.001);
    close(inside.lines[0][0], c); close(inside.lines[0][1], [1500, 1000]);
    expect(inside.lines.length).toBeGreaterThan(1); // the arrowhead at the circle
    expect(inside.arcs).toEqual([]);
    const outside = dimOf(rad([1000, 1800]), 0.001); // straight up: the line from the top of the circle up to the text
    close(outside.lines[0][0], [1000, 1500]); close(outside.lines[0][1], [1000, 1800]);
    expect(outside.angle).toBeCloseTo(Math.PI / 2, 6); // reads up the page
    const d = dimOf(dia([1200, 1000]), 0.001);
    close(d.lines[0][0], [500, 1000]); close(d.lines[0][1], [1500, 1000]); // right across
    expect(d.length).toBeCloseTo(1000, 6);
  });
  it('is a radius or diameter dimension in the palette, measured in metres, and its text override clears to the measure', () => {
    expect(kindLabel(rad([1200, 1000]))).toBe('Radius dimension'); expect(kindLabel(dia([1200, 1000]))).toBe('Diameter dimension');
    expect(geomKind(rad([1200, 1000]))).toBe('dim');
    expect(propValue(rad([1200, 1000]), 'measured', 0.001)).toBeCloseTo(0.5, 9);
    const over = withProp(rad([1200, 1000]), 'override', 'R500 TYP', 0.001)!;
    expect(over.text).toBe('R500 TYP');
    expect(withProp({ ...over, look: undefined }, 'override', '', 0.001)!.text).toBeUndefined();
  });
  it('saves as lines and the text; moves, turns and mirrors with its points', () => {
    const out = shapesOut([rad([1200, 1000])], 0.001);
    expect(out.filter((s) => s.kind === 'line').length).toBeGreaterThan(1);
    expect(out.find((s) => s.kind === 'text')?.text).toBe('R0.50');
    const t = rotated(rad([1200, 1000]), c, Math.PI / 2);
    close(t.pts[1], [1000, 1500]); expect(dimMeasure(t)).toBeCloseTo(500, 6);
    const m = mirrored(rad([1200, 1000]), [0, 0], [0, 1]);
    close(m.pts[0], [-1000, 1000]); expect(dimMeasure(m)).toBeCloseTo(500, 6);
  });
});

describe('angular dimensions', () => {
  it('measures the angle on the side the arc is placed: 90° inside the corner, 270° outside it', () => {
    expect(dimMeasure(ang([2500, 2500]))).toBeCloseTo(90, 6);
    expect(dimMeasure(ang([1500, 1500]))).toBeCloseTo(270, 6);
    expect(dimMeasure(ang([2500, 1800]))).toBeCloseTo(270, 6); // below the first line: the long way round
    const a = angularArc(ang([2500, 2500]));
    expect(a.a0).toBeCloseTo(0, 9); expect(a.sweep).toBeCloseTo(Math.PI / 2, 9); expect(a.r).toBeCloseTo(Math.hypot(500, 500), 6);
  });
  it('writes degrees with the style\'s decimals', () => {
    expect(dimLabel(ang([2500, 2500]), 0.001)).toBe('90.00°');
    expect(dimLabel({ ...ang([2500, 2500]), look: { ...look, decimals: 0 } }, 0.001)).toBe('90°');
    expect(dimLabel({ ...ang([2500, 2500]), look: { ...look, decimals: 1, comma: true } }, 0.001)).toBe('90,0°');
    expect(dimAngle(45.5, { trimZeros: true, decimals: 3 })).toBe('45.5°');
    expect(dimAngle(30)).toBe('30.00°');
  });
  it('draws the arc through the arc point with extension lines out to it, and the text outside its middle', () => {
    const d = dimOf(ang([2300, 2300]), 0.001); // inside the corner, nearer the vertex than the points: no extension lines
    expect(d.arcs.length).toBe(1);
    expect(d.arcs[0].r).toBeCloseTo(Math.hypot(300, 300), 6);
    expect(d.lines.length).toBeGreaterThan(0); // the arrowheads
    const far = dimOf(ang([3200, 3200]), 0.001); // beyond the points: an extension line from each point out to the arc
    const ext = far.lines.filter(([a, b]) => (a[1] === 2000 && b[1] === 2000) || (a[0] === 2000 && b[0] === 2000));
    expect(ext.length).toBe(2);
    const mid = Math.atan2(d.text[1] - 2000, d.text[0] - 2000);
    expect(mid).toBeCloseTo(Math.PI / 4, 6); // the text at the middle of the arc
    expect(Math.hypot(d.text[0] - 2000, d.text[1] - 2000)).toBeGreaterThan(d.arcs[0].r);
    expect(d.label).toBe('90.00°');
    // The arc and the lines are among what is drawn and printed.
    expect(segmentsOf(ang([2300, 2300])).length).toBeGreaterThan(8);
    const out = shapesOut([ang([2300, 2300])], 0.001);
    expect(out.map((s) => s.kind)).toContain('arc');
    expect(out.find((s) => s.kind === 'text')?.text).toBe('90.00°');
  });
  it('is an angular dimension in the palette, measured in degrees', () => {
    const it0 = ang([2500, 2500]);
    expect(kindLabel(it0)).toBe('Angular dimension'); expect(geomKind(it0)).toBe('dimang');
    expect(textRows('dimang')[0]).toMatchObject({ key: 'measured', unit: 'deg', ro: true });
    expect(propValue(it0, 'measured', 0.001)).toBeCloseTo(90, 6);
    expect(dimMeasure(rotated(it0, [2000, 2000], 1))).toBeCloseTo(90, 6);
  });
});
