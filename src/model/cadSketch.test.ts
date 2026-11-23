import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { addSketch, arcStartCentreEnd, arcThrough, bulgeArc, circle2P, cloudLobes, constructionDistance, constructionSegment, dimensionLines, dimOf, ellipseOf, ellipsePoints, itemAt, moved, polygonPts, rectangle, removeSketch, rotated, segmentsOf, shapesOut, sketchOf, snapPoints, textWidth, trayLabel, trayLength, trayLine, typedPoint, updateSketch } from './cadSketch';
import { CHAR_W } from './cadText';
import type { SketchItem } from '../types';

const p0 = { ...sampleProject, cadSketch: undefined };
/** Point lists equal to 6 decimals. */
const near = (a: [number, number][][], b: [number, number][][]) => {
  expect(a.map((q) => q.length)).toEqual(b.map((q) => q.length));
  a.forEach((q, i) => q.forEach(([x, y], j) => { expect(x).toBeCloseTo(b[i][j][0], 6); expect(y).toBeCloseTo(b[i][j][1], 6); }));
};
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

  it('clips, picks, snaps and writes construction lines and rays as infinite CAD entities', () => {
    const xline: SketchItem = { id: 'XL', kind: 'line', infinite: 'xline', layer: 'LV-SKETCH', pts: [[5, 5], [6, 6]] };
    const ray: SketchItem = { id: 'R', kind: 'line', infinite: 'ray', layer: 'LV-SKETCH', pts: [[5, 5], [6, 5]] };
    expect(constructionSegment(xline, [0, 0, 10, 10])).toEqual([[0, 0], [10, 10]]);
    expect(constructionSegment(ray, [0, 0, 10, 10])).toEqual([[5, 5], [10, 5]]);
    expect(constructionDistance(xline, [1, 2])).toBeCloseTo(Math.SQRT1_2, 9);
    expect(itemAt([xline], [9, 9.02], 0.05)?.id).toBe('XL');
    expect(itemAt([ray], [0, 5], 0.1)).toBeUndefined(); // behind the ray's base
    expect(snapPoints([xline, ray])).toEqual([{ x: 5, y: 5, kind: 32 }, { x: 5, y: 5, kind: 1 }]);
    expect(shapesOut([xline, ray], 0.001).map((s) => s.kind)).toEqual(['xline', 'ray']);
  });

  it('writes every kind of dimension\'s text centred on the middle of its baseline, where it is drawn', () => {
    const look = { arrow: 'closed' as const, size: 90, off: 20, ext: 50, unit: 'mm' as const, decimals: 0 };
    const dims: SketchItem[] = [
      { id: 'old', kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [4000, 0], [2000, 800]], text: '4.00' }, // drawn before styles
      { id: 'up', kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [0, 3000], [-600, 1500]], h: 100, look: { ...look, textPos: 'above' }, dir: Math.PI / 2 },
      { id: 'radius', kind: 'dim', dimKind: 'radius', layer: 'LV-ANNO', pts: [[1000, 1000], [1500, 1000], [1200, 1300]], h: 90, look },
      { id: 'diameter', kind: 'dim', dimKind: 'diameter', layer: 'LV-ANNO', pts: [[1000, 1000], [1500, 1000], [1800, 1000]], h: 90, look },
      { id: 'angular', kind: 'dim', dimKind: 'angular', layer: 'LV-ANNO', pts: [[3000, 3000], [4000, 3000], [3000, 4000], [3300, 3300]], h: 90, look }
    ];
    for (const it of dims) {
      const d = dimOf(it, 0.001), text = shapesOut([it], 0.001).filter((s) => s.kind === 'text');
      expect(text, it.id).toHaveLength(1);
      expect(text[0], it.id).toMatchObject({ pts: [d.text], h: d.h, rot: d.angle, just: 'C' });
    }
  });

  it('keeps Outside text clear of its line on the side away from the points, whichever way that side faces', () => {
    // The text's point is the middle of its baseline. Its line below the points used to put the baseline just past the
    // line and the capitals back across it; so did a vertical line right of its points (text reading bottom to top).
    const look = { arrow: 'tick' as const, size: 100, off: 20, ext: 50 };
    /** How far each corner of the text lies past the line (at x or y = `at`), out on the side away from the points. */
    const past = (it: SketchItem, axis: 0 | 1, at: number, away: 1 | -1) => {
      const d = dimOf(it, 0.001), w = textWidth(d.label, d.h), c = Math.cos(d.angle), s = Math.sin(d.angle);
      return [-w / 2, w / 2].flatMap((a) => [0, d.h].map((b) => (d.text[axis] + (axis ? a * s + b * c : a * c - b * s) - at) * away));
    };
    const dim = (pts: [number, number][], more: Partial<SketchItem> = {}): SketchItem => ({ id: 'D', kind: 'dim', layer: 'LV-ANNO', pts, h: 100, ...more });
    const cases: { name: string; it: SketchItem; axis: 0 | 1; at: number; away: 1 | -1; clear: number }[] = [];
    for (const [k, more, clear] of [['style', { look }, 50], ['as before', { text: '4.00' }, 30]] as const) {
      cases.push(
        { name: `${k}: line above`, it: dim([[0, 0], [4000, 0], [2000, 800]], more), axis: 1, at: 800, away: 1, clear },
        { name: `${k}: line below`, it: dim([[0, 0], [4000, 0], [2000, -800]], more), axis: 1, at: -800, away: -1, clear },
        { name: `${k}: line right, reading up`, it: dim([[0, 0], [0, 4000], [600, 2000]], more), axis: 0, at: 600, away: 1, clear },
        { name: `${k}: line left, reading up`, it: dim([[0, 0], [0, 4000], [-600, 2000]], more), axis: 0, at: -600, away: -1, clear }
      );
    }
    // Horizontal text beside a vertical line clears it by its half width too.
    cases.push({ name: 'flat text, line right', it: dim([[0, 0], [0, 4000], [600, 2000]], { look: { ...look, textFlat: true } }), axis: 0, at: 600, away: 1, clear: 50 });
    for (const c of cases) expect(Math.min(...past(c.it, c.axis, c.at, c.away)), c.name).toBeCloseTo(c.clear, 6);
    // Where the text was clear, it stays where it was.
    expect(dimOf(dim([[0, 0], [4000, 0], [2000, 800]], { text: '4.00' }), 0.001).text).toEqual([2000, 830]);
    expect(dimOf(dim([[0, 0], [4000, 0], [2000, 800]], { look }), 0.001).text).toEqual([2000, 850]);
  });

  it('picks a justified text by its box, and writes its justification for the DXF', () => {
    // "TAG" 250 high (its capitals), about 628 wide (0.84 × 250 a letter), anchored at its middle centre: its box runs
    // about 686–1314 × 375–625.
    const mc: SketchItem = { id: 'T1', kind: 'text', layer: 'LV-ANNO', pts: [[1000, 500]], text: 'TAG', h: 250, just: 'MC' };
    expect(itemAt([mc], [800, 400], 10)?.id).toBe('T1');
    expect(itemAt([mc], [1200, 600], 10)?.id).toBe('T1');
    expect(itemAt([mc], [1300, 500], 10)?.id).toBe('T1'); // its last letter (past the 0.6 × 250 a letter of before)
    expect(itemAt([mc], [1000, 700], 10)).toBeUndefined();
    expect(itemAt([mc], [650, 500], 10)).toBeUndefined();
    expect(snapPoints([mc])).toContainEqual({ x: 1000, y: 500, kind: 16 });
    const [out] = shapesOut([mc], 0.001);
    expect(out).toMatchObject({ kind: 'text', pts: [[1000, 500]], text: 'TAG', h: 250, just: 'MC' });
    expect('just' in shapesOut([{ ...mc, just: undefined }], 0.001)[0]).toBe(false);
  });

  it('draws a framed text\'s frame with the lines, and writes its mask under it and its frame after it', () => {
    const fr: SketchItem = { id: 'T2', kind: 'text', layer: 'LV-ANNO', pts: [[1000, 500]], text: 'L1', h: 250, just: 'MC', frame: 'box', mask: true };
    expect(segmentsOf({ ...fr, frame: undefined })).toEqual([]);
    expect(segmentsOf(fr)).toHaveLength(4);
    expect(segmentsOf({ ...fr, frame: 'hexagon' })).toHaveLength(6);
    expect(segmentsOf({ ...fr, frame: 'circle' }).length).toBeGreaterThan(8);
    const out = shapesOut([fr], 0.001);
    expect(out.map((s) => `${s.kind}@${s.layer}`)).toEqual(['hatch@LV-MASK', 'text@LV-ANNO', 'pline@LV-ANNO']);
    expect(out[0]).toMatchObject({ solid: true }); expect(out[0].loops![0]).toHaveLength(4);
    expect(out[2]).toMatchObject({ closed: true });
    expect(shapesOut([{ ...fr, frame: 'circle', mask: undefined }], 0.001).map((s) => s.kind)).toEqual(['text', 'circle']);
  });
});

describe('cable tray runs', () => {
  const run: SketchItem = { id: 'S1', kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [1000, 0], [1000, 1000]], tray: { widthMm: 300 } };

  it('is a single line, broken at the middle of its middle piece for the label', () => {
    // "CT 300" at 150 mm (its capitals): about 754 mm of text (0.84 × 150 a letter), a 904 mm gap centred on the first
    // piece's middle.
    const { pieces, textAt } = trayLine(run, 150), w = 6 * CHAR_W * 150, g = w + 150;
    expect(w).toBeCloseTo(753.9, 1);
    near(pieces, [[[0, 0], [500 - g / 2, 0]], [[500 + g / 2, 0], [1000, 0], [1000, 1000]]]);
    near([[textAt]], [[[500 - w / 2, -75]]]); // centred in the gap: the baseline half the height below the line
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
    expect(out[2]).toMatchObject({ text: 'CT 300', h: 150 });
    near([out[2].pts], [[[500 - (6 * CHAR_W * 150) / 2, -75]]]);
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
    expect(shapesOut([e], 0.001)).toEqual([{ layer: 'L', kind: 'ellipse', pts: [[100, 50]], axis: [30, 40], ratio: 0.5, id: 'E' }]);
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

type Pt = [number, number];
describe('hatches: islands, origin and what they save', () => {
  const hatch: SketchItem = { id: 'H', kind: 'pline', layer: 'LV-HATCH', closed: true, pts: [[0, 0], [100, 0], [100, 100], [0, 100]], hatch: { pattern: 'brick', scale: 3, angle: 30, origin: [10, 20] },
    holes: [[[40, 40], [60, 40], [60, 60], [40, 60]]], assoc: ['S1', 'S2'] };

  it('move takes the islands and the pattern\'s origin along; rotate turns them and the pattern\'s angle', () => {
    const m = moved(hatch, 5, -5);
    expect(m.holes![0][0]).toEqual([45, 35]);
    expect(m.hatch!.origin).toEqual([15, 15]);
    expect(moved({ ...hatch, hatch: { ...hatch.hatch!, origin: undefined } }, 5, -5).hatch!.origin).toEqual([5, -5]);
    const r = rotated(hatch, [0, 0], Math.PI / 2);
    expect(r.holes![0][1].map((v) => +v.toFixed(6))).toEqual([-40, 60]);
    expect(r.hatch!.origin!.map((v) => +v.toFixed(6))).toEqual([-20, 10]);
    expect(r.hatch!.angle).toBeCloseTo(120);
    expect(rotated(hatch, [0, 0], -Math.PI).hatch!.angle).toBeCloseTo(210);
    expect(rotated(hatch, [0, 0], 2 * Math.PI).hatch!.angle).toBeCloseTo(30);
    // Anything else is moved as before.
    expect(moved(line as SketchItem, 1, 1)).not.toHaveProperty('hatch');
  });

  it('is drawn and snapped at its islands too', () => {
    expect(segmentsOf(hatch)).toHaveLength(8);
    expect(snapPoints([hatch]).filter((q) => q.kind === 1)).toHaveLength(8);
    expect(itemAt([hatch], [50, 40], 1)?.id).toBe('H');
  });

  it('is saved with its loops, the name of its pattern, its angle and scale, and the objects it follows', () => {
    const [h] = shapesOut([hatch], 0.001);
    expect(h).toMatchObject({ kind: 'hatch', layer: 'LV-HATCH', name: 'BRICK', solid: false, id: 'H', srcs: ['S1', 'S2'] });
    expect(h.loops).toEqual([hatch.pts, hatch.holes![0]]);
    expect(h.hangle).toBeCloseTo(Math.PI / 6);
    expect(h.hscale).toBeCloseTo(3 * 100 * 1); // 3 mm paper at 1:100 in mm units
    // Its pattern lines start at the origin; without one at (0, 0).
    const at = (x: SketchItem) => shapesOut([x], 0.001)[0].lines![0].base;
    const none = at({ ...hatch, hatch: { ...hatch.hatch!, origin: undefined } });
    expect(at(hatch)).toEqual([none[0] + 10, none[1] + 20]);
    // A circle is 128 sides; a custom pattern is named for itself; Solid is solid; a plain object has no srcs.
    const circle: SketchItem = { id: 'C', kind: 'circle', layer: 'LV-HATCH', pts: [[0, 0]], r: 50, hatch: { pattern: 'solid', scale: 3, angle: 0 } };
    const [c] = shapesOut([circle], 0.001);
    expect(c.loops![0]).toHaveLength(128);
    expect(c).toMatchObject({ name: 'SOLID', solid: true });
    expect(c).not.toHaveProperty('srcs');
    const custom = { name: 'MYGRID', lines: [{ angle: 0, base: [0, 0] as Pt, offset: [0, 1] as Pt, dashes: [] }] };
    expect(shapesOut([{ ...hatch, hatch: { pattern: 'MYGRID', scale: 3, angle: 0, custom } }], 0.001)[0].name).toBe('MYGRID');
    // Every shape carries its object's id.
    expect(shapesOut([{ id: 'L1', kind: 'line', layer: 'L', pts: [[0, 0], [1, 1]] }], 0.001)[0].id).toBe('L1');
  });

  it('withSketchItems lets an associative hatch follow its boundary (see cadHatchAssoc)', () => {
    const sq = (id: string, x: number): Omit<SketchItem, 'id'> => ({ kind: 'pline', layer: 'L', closed: true, pts: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]], ...(id ? {} : {}) });
    let p = addSketch(p0, 'GF.dwg', sq('', 0)).project;
    p = addSketch(p, 'GF.dwg', { ...sq('', 0), layer: 'LV-HATCH', hatch: { pattern: 'ansi31', scale: 3, angle: 0 }, assoc: ['S1'] }).project;
    p = updateSketch(p, 'GF.dwg', moved(sketchOf(p, 'GF.dwg')[0], 20, 0));
    expect(sketchOf(p, 'GF.dwg')[1].pts[0]).toEqual([20, 0]);
  });

  it('shapesOut writes an object\'s own colour, linetype (with its pattern) and lineweight; none leaves it by layer', () => {
    const [a] = shapesOut([{ id: 'a', ...line, color: 'idx:5', lt: 'dashed', lw: 0.35 }], 0.001);
    expect(a).toMatchObject({ color: 'idx:5', lt: 'DASHED', lw: 35, ltdash: [600, -300] });
    const [b] = shapesOut([{ id: 'b', ...line, color: '#FF0000', ltName: 'ACAD_ISO02W100', lt: 'dashed' }], 0.01);
    expect(b).toMatchObject({ color: '#ff0000', lt: 'ACAD_ISO02W100' }); expect(b.ltdash).toBeUndefined(); expect(b.lw).toBeUndefined();
    const [c] = shapesOut([{ id: 'c', ...line }], 0.001);
    expect(c).toEqual({ layer: 'LV-SKETCH', kind: 'line', pts: [[0, 0], [4000, 0]], closed: undefined, r: undefined, a0: undefined, a1: undefined, id: 'c' });
  });
});

describe('a leader\'s arrowhead in Save DXF / DWG', () => {
  it('is written as a solid triangle of the size and shape the canvas draws, after the leader\'s line', () => {
    const lead: SketchItem = { id: 'L1', kind: 'line', layer: 'LV-ANNO', pts: [[0, 0], [1000, 0]], leader: true };
    const out = shapesOut([lead], 0.001); // mm: 3 mm on paper at 1:100 is 300
    expect(out.map((s) => s.kind)).toEqual(['line', 'hatch']);
    const h = out[1];
    expect(h).toMatchObject({ layer: 'LV-ANNO', solid: true, id: 'L1' });
    const [tip, a, b] = h.loops![0];
    expect(tip).toEqual([0, 0]);
    expect(a[0]).toBeCloseTo(300 * Math.cos(0.3), 6); expect(a[1]).toBeCloseTo(300 * Math.sin(-0.3), 6);
    expect(b[0]).toBeCloseTo(300 * Math.cos(0.3), 6); expect(b[1]).toBeCloseTo(300 * Math.sin(0.3), 6);
    // A leader of several points writes its polyline and the arrow at the first.
    const bent = shapesOut([{ ...lead, kind: 'pline', pts: [[0, 0], [1000, 500], [2000, 500]] }], 0.001);
    expect(bent.map((s) => s.kind)).toEqual(['pline', 'hatch']);
    // Not a leader: no arrow.
    expect(shapesOut([{ ...lead, leader: undefined }], 0.001).map((s) => s.kind)).toEqual(['line']);
  });
});
