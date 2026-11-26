import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Project, SketchItem } from '../types';
import { arcLengthDimLines, dimLabel, dimMeasure, dimOf, joggedDimLines, ordinateDimLines, rotated, segmentsOf, shapesOut, type DimLook } from './cadSketch';
import { mirrored } from './cadEdit';
import { kindLabel, geomKind } from './cadProps';
import { ordDatumOf, ordinateDir, withOrdDatum } from './cadDimTools';

type Pt = [number, number];
const close = (a: Pt, b: Pt) => { expect(a[0]).toBeCloseTo(b[0], 6); expect(a[1]).toBeCloseTo(b[1], 6); };
const look: DimLook = { arrow: 'closed', size: 90, off: 20, ext: 50, unit: 'm', decimals: 2 };
const c: Pt = [0, 0];
// A quarter arc of radius 1000 about the origin, anticlockwise from +x to +y, the dimension arc at 1300.
const arc = (more: Partial<SketchItem> = {}): SketchItem => ({ id: 'a', kind: 'dim', dimKind: 'arclen', layer: 'LV-ANNO', pts: [c, [1000, 0], [0, 1000], [919.2388, 919.2388]], h: 90, look, ...more });
const jog = (more: Partial<SketchItem> = {}): SketchItem => ({ id: 'j', kind: 'dim', dimKind: 'jogged', layer: 'LV-ANNO', pts: [c, [500, 0], [900, 0], [200, 150]], h: 90, look, ...more });
const ord = (f: Pt, e: Pt, dir: number, d: Pt = [0, 0], more: Partial<SketchItem> = {}): SketchItem => ({ id: 'o', kind: 'dim', dimKind: 'ordinate', layer: 'LV-ANNO', pts: [f, e, d], dir, h: 90, look, ...more });

describe('arc length dimensions', () => {
  it('measures along the arc, anticlockwise from its start to its end, and writes it without a prefix', () => {
    expect(dimMeasure(arc())).toBeCloseTo(1570.796, 2);
    expect(dimLabel(arc(), 0.001)).toBe('1.57');
    // The other way round it is the long way: three quarters of the circle.
    expect(dimMeasure(arc({ pts: [c, [0, 1000], [1000, 0], [919, 919]] }))).toBeCloseTo(4712.389, 2);
  });
  it('draws the dimension arc, its arrowheads, two extension lines when it lies off the arc, and the arc sign over the text', () => {
    const d = dimOf(arc(), 0.001);
    expect(d.arcs.length).toBe(2); // the dimension arc and the sign
    expect(d.arcs[0].r).toBeCloseTo(1300, 3);
    expect(d.arcs[0].a1 - d.arcs[0].a0).toBeCloseTo(Math.PI / 2, 6);
    expect(d.lines.length).toBeGreaterThan(2);
    expect(d.arcs[1].r).toBeCloseTo(45, 6); // half the text height
    const tight = dimOf(arc({ pts: [c, [1000, 0], [0, 1000], [700.7, 700.7]] }), 0.001); // on the arc itself: none
    expect(tight.lines.length).toBeGreaterThan(0);
    expect(arcLengthDimLines(arc({ h: 0 }), look, 0).arcs.length).toBe(1); // no height, no sign
    expect(segmentsOf(arc(), 0.001).length).toBeGreaterThan(10);
  });
  it('writes the sign into the exported shapes with the label, and is an arc length dimension in the palette', () => {
    expect(kindLabel(arc())).toBe('Arc length dimension'); expect(geomKind(arc())).toBe('dim');
    const out = shapesOut([arc()], 0.001, []);
    expect(out.some((s) => s.kind === 'text' && s.text === '1.57')).toBe(true);
    expect(out.filter((s) => s.kind === 'arc').length).toBe(2); // the dimension arc and the sign
  });
  it('swaps its ends when mirrored, so it still runs anticlockwise', () => {
    const m = mirrored(arc(), [0, 0], [1, 0]) as SketchItem; // about the x axis
    close(m.pts[1], [0, -1000]); close(m.pts[2], [1000, 0]);
    expect(dimMeasure(m)).toBeCloseTo(1570.796, 2);
  });
});

describe('jogged radius dimensions', () => {
  it('measures the radius and writes R', () => {
    expect(dimMeasure(jog())).toBeCloseTo(500, 6);
    expect(dimLabel(jog(), 0.001)).toBe('R0.50');
  });
  it('runs from the override to the arc through a 45° jog, with the arrow at the arc and the line on to the text', () => {
    const d = dimOf(jog({ pts: [c, [500, 0], [900, 0], [100, 200]] }), 0.001), g = joggedDimLines(jog({ pts: [c, [500, 0], [900, 0], [100, 200]] }), look);
    expect(d.lines.length).toBe(g.lines.length);
    expect(g.lines.some(([a, b]) => Math.abs(a[0] - 100) < 1e-6 && Math.abs(a[1] - 200) < 1e-6 && b[0] > 100)).toBe(true); // starts at the override
    expect(g.lines.some(([a, b]) => Math.abs(a[0] - 500) < 1e-6 && Math.abs(b[0] - 900) < 1e-6 && a[1] === 0 && b[1] === 0)).toBe(true); // arc to text
    const diag = g.lines.find(([a, b]) => Math.abs(Math.abs(b[0] - a[0]) - Math.abs(b[1] - a[1])) < 1e-6 && Math.abs(b[0] - a[0]) > 1);
    expect(diag).toBeTruthy();
    expect(d.angle).toBeCloseTo(0, 6);
  });
  it('is a plain line to the arc when the override is on it', () => {
    const g = joggedDimLines(jog({ pts: [c, [500, 0], [900, 0], [100, 0]] }), look);
    close(g.lines[1][0], [100, 0]); close(g.lines[1][1], [500, 0]);
    expect(kindLabel(jog())).toBe('Jogged radius dimension');
  });
});

describe('ordinate dimensions', () => {
  it('writes the signed x or y of the feature from the datum', () => {
    const x = ord([3000, 2000], [3000, 3000], Math.PI / 2);
    expect(dimLabel(x, 1)).toBe('3000.00');
    expect(dimLabel({ ...x, pts: [[3000, 2000], [3000, 3000], [1000, 500]] }, 0.001)).toBe('2.00');
    expect(dimLabel({ ...x, pts: [[-500, 2000], [-500, 3000], [0, 0]] }, 0.001)).toBe('-0.50'); // the sign stays
    const y = ord([3000, 2000], [4000, 2000], 0, [1000, 500]);
    expect(dimLabel(y, 0.001)).toBe('1.50');
    expect(dimMeasure(y)).toBeCloseTo(1500, 6);
    expect(dimLabel(ord([3000, 2000], [3000, 3000], Math.PI / 2, [0, 0], { look: undefined }), 0.001)).toBe('3.00');
    expect(kindLabel(x)).toBe('Ordinate dimension');
  });
  it('draws a straight leader when its end lies in line with the feature, and a jogged one when it does not', () => {
    const straight = ordinateDimLines(ord([3000, 2000], [3000, 3000], Math.PI / 2), look);
    expect(straight.lines.length).toBe(1);
    close(straight.lines[0][0], [3000, 2020]); close(straight.lines[0][1], [3000, 3000]);
    const jogged = ordinateDimLines(ord([3000, 2000], [3200, 3000], Math.PI / 2), look);
    expect(jogged.lines.length).toBe(3);
    close(jogged.lines[0][1], [3000, 2000 + 1000 / 3]); close(jogged.lines[1][1], [3200, 2000 + 2000 / 3]); close(jogged.lines[2][1], [3200, 3000]);
    const across = ordinateDimLines(ord([3000, 2000], [4000, 2100], 0), look);
    expect(across.lines.length).toBe(3);
    close(across.lines[2][1], [4000, 2100]);
  });
  it('writes its text along the leader, readable, past the end', () => {
    const up = dimOf(ord([3000, 2000], [3000, 3000], Math.PI / 2), 0.001);
    expect(up.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(up.text[1]).toBeGreaterThan(3000);
    const left = dimOf(ord([3000, 2000], [1000, 2000], 0), 0.001);
    expect(Math.cos(left.angle)).toBeGreaterThan(0.99); // reads left to right
    expect(left.text[0]).toBeLessThan(1000);
  });
  it('keeps its axis when rotated half a turn, and gives it up for a quarter turn', () => {
    const r = rotated(ord([3000, 2000], [3000, 3000], Math.PI / 2), [0, 0], Math.PI);
    expect(ordinateDimLines(r, look).lines.length).toBe(1);
    expect(Math.abs(dimMeasure(r))).toBeCloseTo(3000, 6);
    const q = rotated(ord([3000, 2000], [3000, 3000], Math.PI / 2), [0, 0], Math.PI / 2);
    expect(dimMeasure(q)).toBeCloseTo(3000, 6); // its leader now runs across: it measures y of the turned point (= 3000)
  });
});

describe('ordinate datum and direction', () => {
  const p: Project = { ...sampleProject, cadLayerFile: undefined };
  it('is 0,0 until set, and per drawing', () => {
    expect(ordDatumOf(p, 'GF.dwg')).toEqual([0, 0]);
    const q = withOrdDatum(p, 'GF.dwg', [1000, 500]);
    expect(ordDatumOf(q, 'GF.dwg')).toEqual([1000, 500]);
    expect(ordDatumOf(q, 'FF.dwg')).toEqual([0, 0]);
    expect(withOrdDatum(q, 'GF.dwg', [0, 0]).cadLayerFile).toBeUndefined();
    expect(withOrdDatum(q, 'GF.dwg', undefined).cadLayerFile).toBeUndefined();
  });
  it('measures x for a leader that goes up or down, y for one across, or as forced', () => {
    expect(ordinateDir([0, 0], [100, 500])).toBeCloseTo(Math.PI / 2, 9);
    expect(ordinateDir([0, 0], [500, 100])).toBe(0);
    expect(ordinateDir([0, 0], [500, 100], 'x')).toBeCloseTo(Math.PI / 2, 9);
    expect(ordinateDir([0, 0], [100, 500], 'y')).toBe(0);
  });
});
