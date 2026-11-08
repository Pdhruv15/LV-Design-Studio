import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { addSketch, arcStartCentreEnd, arcThrough, bulgeArc, circle2P, cloudLobes, dimensionLines, ellipseOf, ellipsePoints, itemAt, moved, polygonPts, rectangle, removeSketch, rotated, segmentsOf, shapesOut, sketchOf, snapPoints, trayLabel, trayLength, trayLine, typedPoint, updateSketch } from './cadSketch';
import type { SketchItem } from '../types';

const p0 = { ...sampleProject, cadSketch: undefined };
const line: Omit<SketchItem, 'id'> = { kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [4000, 0]] };

describe('drawing in the CAD view', () => {
  it('keeps what was drawn per drawing file, with permanent IDs', () => {
    const a = addSketch(p0, 'GF.dwg', line);
    const b = addSketch(a.project, 'gf.DWG', { kind: 'circle', layer: 'LV-SKETCH', pts: [[0, 0]], r: 500 });
    expect(sketchOf(b.project, 'GF.dwg').map((x) => x.id)).toEqual(['S1', 'S2']);
    expect(sketchOf(b.project, 'L1.dwg')).toEqual([]);
    const c = updateSketch(b.project, 'GF.dwg', moved(sketchOf(b.project, 'GF.dwg')[0], 100, 50));
    expect(sketchOf(c, 'GF.dwg')[0].pts).toEqual([[100, 50], [4100, 50]]);
    const d = removeSketch(removeSketch(c, 'GF.dwg', 'S1'), 'GF.dwg', 'S2');
    expect(d.cadSketch).toBeUndefined();
  });

  it('rotates lines, arcs and texts about a point', () => {
    const r = rotated({ ...line, id: 'S1' }, [0, 0], Math.PI / 2);
    expect(r.pts[1][0]).toBeCloseTo(0, 9);
    expect(r.pts[1][1]).toBeCloseTo(4000, 9);
    const t = rotated({ id: 'S2', kind: 'text', layer: 'x', pts: [[0, 0]], text: 'A', rot: 0 }, [0, 0], 1);
    expect(t.rot).toBe(1);
  });

  it('builds rectangles, arcs through three points and aligned dimensions', () => {
    expect(rectangle([0, 0], [3000, 2000])).toEqual([[0, 0], [3000, 0], [3000, 2000], [0, 2000]]);
    const a = arcThrough([1000, 0], [0, 1000], [-1000, 0])!;
    expect(a.r).toBeCloseTo(1000, 6);
    expect(a.a0).toBeCloseTo(0, 6);
    expect(a.a1).toBeCloseTo(Math.PI, 6);
    expect(arcThrough([0, 0], [1, 1], [2, 2])).toBeUndefined();
    const d = dimensionLines([0, 0], [4000, 0], [2000, 800]);
    expect(d.length).toBe(4000);
    expect(d.lines[2]).toEqual([[0, 800], [4000, 800]]); // the dimension line through the point picked
  });

  it('reads typed points: absolute, relative, polar and a plain distance along the cursor', () => {
    expect(typedPoint('1000,2000', undefined, null)).toEqual([1000, 2000]);
    expect(typedPoint('@500,0', [1000, 1000], null)).toEqual([1500, 1000]);
    const polar = typedPoint('@1000<90', [0, 0], null)!;
    expect(polar[0]).toBeCloseTo(0, 9);
    expect(polar[1]).toBeCloseTo(1000, 9);
    expect(typedPoint('2500', [0, 0], [10, 0])).toEqual([2500, 0]);
    expect(typedPoint('abc', [0, 0], [1, 0])).toBeUndefined();
  });

  it('finds what was drawn under a click, snaps to it, and writes it for the DXF', () => {
    const items: SketchItem[] = [{ ...line, id: 'S1' }, { id: 'S2', kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [4000, 0], [2000, 800]], text: '4.00' }];
    expect(itemAt(items, [2000, 30], 50)?.id).toBe('S1');
    expect(itemAt(items, [2000, 780], 50)?.id).toBe('S2');
    expect(itemAt(items, [2000, 400], 50)).toBeUndefined();
    expect(snapPoints(items)).toContainEqual({ x: 2000, y: 0, kind: 2 });
    const out = shapesOut(items, 0.001);
    expect(out.filter((s) => s.layer === 'LV-ANNO' && s.kind === 'text')[0].text).toBe('4.00');
    expect(out.filter((s) => s.layer === 'LV-ANNO' && s.kind === 'line').length).toBe(5);
  });
});

describe('cable tray runs', () => {
  const run: SketchItem = { id: 'S1', kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [1000, 0], [1000, 1000]], tray: { widthMm: 300 } };

  it('is a single line, broken at the middle of its middle piece for the label', () => {
    // "CT 300" at 150 mm: about 540 mm of text, a 690 mm gap centred on the first piece's middle.
    const { pieces, textAt } = trayLine(run, 150);
    expect(pieces).toEqual([[[0, 0], [155, 0]], [[845, 0], [1000, 0], [1000, 1000]]]);
    expect(textAt).toEqual([230, -75]); // centred in the gap, on the line
    expect(trayLine({ ...run, pts: [[0, 0], [500, 0]] }, 150).pieces).toEqual([[[0, 0], [500, 0]]]); // too short to break
    expect(trayLength(run)).toBe(2000);
  });

  it('labels a run "CT 300 POWER" with its route once assigned, never upside down', () => {
    expect(trayLabel(run)).toEqual({ at: [500, 0], text: 'CT 300', rot: 0 }); // drawn before the service was kept
    expect(trayLabel({ ...run, tray: { widthMm: 300, service: 'Power' } }).text).toBe('CT 300 POWER');
    const back = trayLabel({ ...run, pts: [[1000, 0], [0, 0]], tray: { widthMm: 450, service: 'ELV', route: 'A' } });
    expect(back.text).toBe('CT 450 ELV · A');
    expect(back.rot).toBeCloseTo(0);
  });

  it('writes the line in two pieces and the label in the gap into the DXF', () => {
    const out = shapesOut([run], 0.001);
    expect(out.map((o) => o.kind)).toEqual(['pline', 'pline', 'text', 'text']);
    expect(out.every((o) => o.layer === 'E-TRAY')).toBe(true);
    expect(out[2]).toMatchObject({ text: 'CT 300', h: 150, pts: [[230, -75]] });
    expect(out[3]).toMatchObject({ text: 'Bend 90° 300', h: 100 }); // its fitting
  });

  it('keeps the tray when moved, copied or rotated', () => {
    expect(moved(run, 10, 0).tray).toEqual({ widthMm: 300 });
    expect(rotated(run, [0, 0], Math.PI / 2).tray).toEqual({ widthMm: 300 });
  });

  it('draws a revision cloud as arcs bulging out of its outline, whichever way the outline runs', () => {
    const ccw: SketchItem = { id: 'C', kind: 'pline', layer: 'LV-ANNO', pts: rectangle([0, 0], [10, 4]), closed: true, cloud: 2 };
    const l = cloudLobes(ccw);
    expect(l.pts).toHaveLength(14); // sides of 10, 4, 10, 4: 5 + 2 + 5 + 2 arcs
    expect(l.bulge).toBe(0.5);
    const cw = cloudLobes({ ...ccw, pts: [...ccw.pts].reverse() });
    expect(cw.bulge).toBe(-0.5);
    // Every arc's middle is outside the outline (y below 0 on the bottom side).
    const bottom = bulgeArc([0, 0], [2, 0], 0.5), mid = (bottom.a0 + bottom.a1 + (bottom.a1 < bottom.a0 ? 2 * Math.PI : 0)) / 2;
    expect(bottom.c[1] + bottom.r * Math.sin(mid)).toBeLessThan(0);
    expect(Math.min(...segmentsOf(ccw).flat().map((q) => q[1]))).toBeLessThan(-0.2);
    expect(Math.min(...segmentsOf({ ...ccw, pts: [...ccw.pts].reverse() }).flat().map((q) => q[1]))).toBeLessThan(-0.2);
    // Saved as one closed polyline of arcs.
    const [out] = shapesOut([ccw], 0.001);
    expect(out).toMatchObject({ kind: 'pline', closed: true, layer: 'LV-ANNO' });
    expect(out.bulges).toEqual(Array(14).fill(0.5));
    expect(snapPoints([ccw]).filter((q) => q.kind === 2)).toEqual([]); // no middles of its outline
  });

  it('a semicircle bulge (1) has its centre on the chord', () => {
    const q = bulgeArc([0, 0], [2, 0], 1);
    expect(q.c.map((v) => +v.toFixed(9))).toEqual([1, 0]);
    expect(+q.r.toFixed(9)).toBe(1);
  });

  it('saves a hatch as a hatch with its outline and pattern lines at 1:100, Solid as solid, a circle as its outline', () => {
    const sq: [number, number][] = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
    const [h] = shapesOut([{ id: 'H', kind: 'pline', layer: 'LV-HATCH', closed: true, pts: sq, hatch: { pattern: 'ansi31', scale: 3, angle: 0 } }], 0.001);
    expect(h).toMatchObject({ layer: 'LV-HATCH', kind: 'hatch', loops: [sq], solid: false });
    expect(h.lines).toHaveLength(1);
    expect(h.lines![0].angle).toBeCloseTo(Math.PI / 4, 9);
    expect(Math.hypot(...h.lines![0].offset)).toBeCloseTo(300, 9); // 3 mm at 1:100 in a mm drawing
    const [s] = shapesOut([{ id: 'S', kind: 'circle', layer: 'LV-HATCH', pts: [[0, 0]], r: 500, hatch: { pattern: 'solid', scale: 3, angle: 0 } }], 0.001);
    expect(s).toMatchObject({ kind: 'hatch', solid: true });
    expect(s.lines).toBeUndefined();
    expect(s.loops![0]).toHaveLength(128);
    expect(s.loops![0].every(([x, y]) => Math.abs(Math.hypot(x, y) - 500) < 1e-9)).toBe(true);
  });

  it('makes an ellipse from its centre and the ends of its axes, the longer the major one', () => {
    expect(ellipseOf([0, 0], [10, 0], [3, 4])).toEqual({ kind: 'ellipse', pts: [[0, 0]], ax: [10, 0], ratio: 0.4 });
    const tall = ellipseOf([0, 0], [4, 0], [0, 10])!;
    expect(tall.ax!.map((v) => +v.toFixed(9))).toEqual([0, 10]);
    expect(tall.ratio).toBeCloseTo(0.4);
    expect(ellipseOf([0, 0], [10, 0], [5, 0])).toBeUndefined(); // no other axis
    const e: SketchItem = { id: 'E', kind: 'ellipse', layer: 'L', pts: [[100, 50]], ax: [30, 40], ratio: 0.5 };
    expect(ellipsePoints(e, 4).map((q) => q.map((v) => +v.toFixed(6)))).toEqual([[130, 90], [80, 65], [70, 10], [120, 35]]);
    expect(snapPoints([e]).map((q) => q.kind)).toEqual([4, 64, 64, 64, 64]);
    expect(shapesOut([e], 0.001)).toEqual([{ layer: 'L', kind: 'ellipse', pts: [[100, 50]], axis: [30, 40], ratio: 0.5 }]);
    expect(rotated(e, [100, 50], Math.PI / 2).ax!.map((v) => +v.toFixed(9))).toEqual([-40, 30]);
    expect(itemAt([e], [130, 90], 0.5)?.id).toBe('E');
  });

  it('draws polygons inscribed and circumscribed, and circles and arcs from other points', () => {
    const sq = polygonPts([0, 0], [1, 0], 4).map((q) => q.map((v) => +v.toFixed(9) + 0));
    expect(sq).toEqual([[1, 0], [0, 1], [-1, 0], [0, -1]]);
    const out = polygonPts([0, 0], [1, 0], 4, false).map((q) => q.map((v) => +v.toFixed(9) + 0));
    expect(out).toEqual([[1, 1], [-1, 1], [-1, -1], [1, -1]]); // its sides touch the circle of radius 1
    expect(circle2P([0, 0], [4, 0])).toEqual({ c: [2, 0], r: 2 });
    const a = arcStartCentreEnd([1, 0], [0, 0], [0, 5])!;
    expect([a.r, a.a0, +(a.a1 ?? 0).toFixed(9)]).toEqual([1, 0, +(Math.PI / 2).toFixed(9)]);
    expect(arcStartCentreEnd([0, 0], [0, 0], [1, 1])).toBeUndefined();
  });
});

