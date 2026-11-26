import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { ANNO_LAYER, autoDimGap, dimBreaksAt, dimTextAlong, dimTextAngle, dimTextAt, dimTextHome, styleTextAlong, withBreaks, dimDirFor, dimLayerOf, dimLayerSetting, dimPicksObject, pickedDimStyle, qdimPointsOf, qdimPointsOfDrawing, qdimPointsOfRun, quickDims, restyledDim, restyledDims, spacedDims, styleOfDim, USE_CURRENT, withDimLayer } from './cadDimTools';
import { dimLabel, dimMeasure, dimOf, rotated, segmentsOf } from './cadSketch';
import { mirrored, scaled } from './cadEdit';
import { dimStylesOf, fullDimStyle } from './cadStyles';
import type { Project, SketchItem } from '../types';

const F = 'GF.dwg';
const p: Project = { ...sampleProject, cadAnno: { textMm: 2.5, scale: 100 }, cadLayerFile: undefined,
  cadDimStyles: { styles: [{ name: 'Standard' }, { name: 'LV 1:100', arrow: 'filled', arrowMm: 3, textMm: 2.5, offsetMm: 1, extendMm: 2, decimals: 0, unit: 'mm' }], current: 'Standard' } as Project['cadDimStyles'] };
const dim = (id: string, extra: Partial<SketchItem> = {}): SketchItem => ({ id, kind: 'dim', layer: ANNO_LAYER, pts: [[0, 0], [4000, 0], [2000, 500]], ...extra });

describe('the layer new dimensions go on (DIMLAYER)', () => {
  it('is the annotation layer until another is set, as before', () => {
    expect(dimLayerSetting(p, F)).toBeUndefined();
    expect(dimLayerOf(p, F, 'E-POWER')).toBe('LV-ANNO');
  });
  it('can be a named layer or the current one, and goes back to none for the annotation layer', () => {
    const named = withDimLayer(p, F, 'E-DIMS');
    expect(dimLayerOf(named, F, 'E-POWER')).toBe('E-DIMS');
    expect(dimLayerOf(named, 'other.dwg', 'E-POWER')).toBe('LV-ANNO'); // per drawing
    const cur = withDimLayer(p, F, USE_CURRENT);
    expect(dimLayerOf(cur, F, 'E-POWER')).toBe('E-POWER');
    expect(withDimLayer(named, F, 'lv-anno').cadLayerFile).toBeUndefined();
    expect(withDimLayer(named, F, '  ').cadLayerFile).toBeUndefined();
  });
});

describe('the style of a dimension', () => {
  it('is Standard unless it records another', () => {
    expect(styleOfDim(dim('D1'))).toBe('Standard');
    expect(styleOfDim(dim('D1', { dimStyle: 'LV 1:100' }))).toBe('LV 1:100');
  });
  it('of the objects picked: one name, varies, or none without dimensions', () => {
    const line: SketchItem = { id: 'L1', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [1, 0]] };
    expect(pickedDimStyle([line])).toBeUndefined();
    expect(pickedDimStyle([line, dim('D1'), dim('D2')])).toBe('Standard');
    expect(pickedDimStyle([dim('D1'), dim('D2', { dimStyle: 'LV 1:100' })])).toBe('varies');
  });
  it('restyles a dimension: look, text height and name; a length drawn before styles goes, typed words stay', () => {
    const st = fullDimStyle(dimStylesOf(p).styles[1], p), k = 100;
    const old = dim('D1', { text: '4.00', h: 160 }); // drawn before styles: 4000 mm as metres
    const r = restyledDim(old, st, k, 0.001);
    expect(r).toMatchObject({ dimStyle: 'LV 1:100', h: 250, look: { arrow: 'filled', size: 300, unit: 'mm', decimals: 0 } });
    expect(r.text).toBeUndefined();
    expect(dimLabel(r, 0.001)).toBe('4000');
    expect(restyledDim(dim('D2', { text: 'BOARD' }), st, k, 0.001).text).toBe('BOARD');
    // back to Standard: no name recorded
    expect(restyledDim(r, fullDimStyle(dimStylesOf(p).styles[0], p), k, 0.001).dimStyle).toBeUndefined();
  });
  it('restyles only the dimensions among the objects picked, and refuses a style that is not there', () => {
    const line: SketchItem = { id: 'L1', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [1, 0]] };
    const out = restyledDims(p, [line, dim('D1')], 'lv 1:100', 100, 0.001);
    expect(out?.map((x) => [x.id, x.dimStyle])).toEqual([['D1', 'LV 1:100']]);
    expect(restyledDims(p, [dim('D1')], 'Nope', 100, 0.001)).toBeUndefined();
  });
});

describe('DIM: what a click picks and how the dimension lies', () => {
  it('takes a snapped point as a point; no snap or Nearest picks the object', () => {
    expect(dimPicksObject(undefined)).toBe(true);
    expect(dimPicksObject('Nearest')).toBe(true);
    for (const s of ['Endpoint', 'Midpoint', 'Centre', 'Intersection', 'Quadrant']) expect(dimPicksObject(s), s).toBe(false);
  });
  it('is horizontal or vertical for a square pair, as Linear places it', () => {
    expect(dimDirFor([0, 0], [10, 0], [5, 3])).toBe(0);
    expect(dimDirFor([0, 0], [0, 10], [3, 5])).toBe(Math.PI / 2);
  });
  it('is aligned beside an oblique pair, and horizontal or vertical past its ends', () => {
    expect(dimDirFor([0, 0], [10, 10], [2, 8])).toBeUndefined(); // across the middle: aligned
    expect(dimDirFor([0, 0], [10, 10], [8, 16])).toBe(0); // past the far end, above it: horizontal
    expect(dimDirFor([0, 0], [10, 10], [16, 8])).toBe(Math.PI / 2); // past the far end, beside it: vertical
  });
});

describe('Quick dimension (QDIM): what it measures', () => {
  const it0 = (kind: SketchItem['kind'], extra: Partial<SketchItem>): SketchItem => ({ id: 'X', kind, layer: 'LV-SKETCH', pts: [], ...extra });
  it('takes a line\'s or polyline\'s points, a circle\'s centre, an arc\'s centre and ends, and nothing of a text', () => {
    expect(qdimPointsOf(it0('line', { pts: [[0, 0], [100, 0]] }))).toEqual([[0, 0], [100, 0]]);
    expect(qdimPointsOf(it0('pline', { pts: [[0, 0], [100, 0], [100, 50]] }))).toHaveLength(3);
    expect(qdimPointsOf(it0('circle', { pts: [[5, 5]], r: 2 }))).toEqual([[5, 5]]);
    const arc = qdimPointsOf(it0('arc', { pts: [[0, 0]], r: 10, a0: 0, a1: Math.PI / 2 }));
    expect(arc[0]).toEqual([0, 0]);
    expect(arc[1][0]).toBeCloseTo(10); expect(arc[2][1]).toBeCloseTo(10);
    expect(qdimPointsOf(it0('text', { pts: [[0, 0]], text: 'A' }))).toEqual([]);
    expect(qdimPointsOf(it0('line', { pts: [[0, 0], [1, 0]], infinite: 'xline' }))).toEqual([]);
  });
  it('of the drawing\'s segments: the ends and the corners, not the steps of an arc', () => {
    const square: [[number, number], [number, number]][] = [[[0, 0], [10, 0]], [[10, 0], [10, 10]], [[10, 10], [0, 10]]];
    expect(qdimPointsOfRun(square)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    const steps = Array.from({ length: 18 }, (_, i): [[number, number], [number, number]] => {
      const a = (i * Math.PI) / 36, b = ((i + 1) * Math.PI) / 36;
      return [[10 * Math.cos(a), 10 * Math.sin(a)], [10 * Math.cos(b), 10 * Math.sin(b)]];
    });
    expect(qdimPointsOfRun(steps)).toHaveLength(2);
    expect(qdimPointsOfRun([[[0, 0], [5, 0]], [[7, 0], [9, 0]]])).toEqual([[0, 0], [5, 0], [7, 0], [9, 0]]); // broken off
    expect(qdimPointsOfRun([], { c: [3, 4], ends: [[1, 1], [2, 2]] })).toEqual([[3, 4], [1, 1], [2, 2]]);
  });
  it('of the drawing\'s objects by kind: a polyline\'s corners, a circle\'s centre, nothing of a block', () => {
    // Segments: a polyline (two), a circle as four quarter chords round (50, 50) r 10, a block's line.
    const S = [0, 0, 100, 0, 100, 0, 100, 80, 60, 50, 50, 60, 50, 60, 40, 50, 40, 50, 50, 40, 50, 40, 60, 50, 0, 0, 5, 5];
    const pts = qdimPointsOfDrawing([{ kind: 'Polyline', seg_start: 0, seg_end: 2 }, { kind: 'Circle', seg_start: 2, seg_end: 6 }, { kind: 'Block', seg_start: 6, seg_end: 7 }], S);
    expect(pts.slice(0, 3)).toEqual([[0, 0], [100, 0], [100, 80]]);
    expect(pts).toHaveLength(4);
    expect(pts[3][0]).toBeCloseTo(50); expect(pts[3][1]).toBeCloseTo(50);
  });
});

describe('Quick dimension (QDIM): the row it draws', () => {
  // A wall 6 000 long with openings, and a column centre, seen from above.
  const pts: [number, number][] = [[0, 0], [6000, 0], [1000, 0], [2000, 0], [1000, 200], [4000, 300]];
  it('continuous above the points: horizontal, one after another in one line, each place once', () => {
    const { dir, dims } = quickDims(pts, [3000, 1500], 'continuous', 0.5, 700);
    expect(dir).toBe(0);
    expect(dims.map(([a, b]) => b[0] - a[0])).toEqual([1000, 1000, 2000, 2000]);
    expect(dims.every((d) => d[2][1] === 1500)).toBe(true);
    // Of two points at one place along the line, the one nearer the line is measured.
    expect(dims[0][1]).toEqual([1000, 200]);
  });
  it('baseline beside them: vertical, each from the first, stepping out from the points', () => {
    const { dir, dims } = quickDims([[0, 0], [0, 3000], [0, 1000], [50, 3000.2]], [-1000, 1500], 'baseline', 0.5, 700);
    expect(dir).toBe(Math.PI / 2);
    expect(dims.map((d) => [d[0][1], d[1][1]])).toEqual([[0, 1000], [0, 3000]]);
    expect(dims.map((d) => d[2][0])).toEqual([-1000, -1700]);
  });
  it('gives nothing for one place, and the dimensions measure what they span', () => {
    expect(quickDims([[0, 0], [0, 500]], [0, 2000], 'continuous', 0.5, 700).dims).toEqual([]);
    const d = quickDims(pts, [3000, -900], 'continuous', 0.5, 700);
    expect(d.dims.map(([a, b, at]) => dimMeasure({ pts: [a, b, at], dir: d.dir }))).toEqual([1000, 1000, 2000, 2000]);
    expect(d.dims.every((x) => x[2][1] === -900)).toBe(true);
  });
});

describe('Adjust space (DIMSPACE)', () => {
  const lin = (id: string, y: number, x1 = 0, x2 = 1000, extra: Partial<SketchItem> = {}): SketchItem => ({ id, kind: 'dim', layer: ANNO_LAYER, pts: [[x1, 0], [x2, 0], [x1, y]], dir: 0, h: 250, ...extra });
  it('spaces rows out from the base by the gap, keeping a chain in one row, on each side', () => {
    const base = lin('B', 1000);
    const r = spacedDims(base, [lin('A', 1200), lin('A2', 1200, 1000, 2000), lin('C', 3000), lin('D', 400)], 700);
    const y = Object.fromEntries(r.moved.map((it) => [it.id, it.pts[2][1]]));
    expect(y).toEqual({ A: 1700, A2: 1700, C: 2400, D: 300 });
    expect(r).toMatchObject({ spaced: 4, skipped: 0 });
    expect(r.moved[0].pts.slice(0, 2)).toEqual([[0, 0], [1000, 0]]); // the points measured stay
  });
  it('lines them up on the base with 0, and leaves those at another angle and radial ones', () => {
    const base = lin('B', 1000);
    const vertical: SketchItem = { ...lin('V', 0), dir: Math.PI / 2 };
    const radius: SketchItem = { id: 'R', kind: 'dim', dimKind: 'radius', layer: ANNO_LAYER, pts: [[0, 0], [10, 0], [20, 0]] };
    const r = spacedDims(base, [base, lin('A', 1500), lin('C', 2600), vertical, radius], 0);
    expect(r.moved.map((it) => [it.id, it.pts[2][1]])).toEqual([['A', 1000], ['C', 1000]]);
    expect(r).toMatchObject({ spaced: 2, skipped: 2 });
  });
  it('works for aligned dimensions along a slope, and Auto is twice the base\'s text', () => {
    const s = Math.SQRT1_2;
    const al = (id: string, o: number): SketchItem => ({ id, kind: 'dim', layer: ANNO_LAYER, pts: [[0, 0], [1000 * s, 1000 * s], [-o * s, o * s]] });
    const r = spacedDims(al('B', 500), [al('A', 600)], 300);
    const at = r.moved[0].pts[2];
    expect(Math.hypot(at[0], at[1])).toBeCloseTo(800);
    expect(autoDimGap({ h: 250 }, 100)).toBe(500);
    expect(autoDimGap({}, 100)).toBe(200);
  });
});

describe('Break (DIMBREAK)', () => {
  // A 4 000 long dimension above a wall, its line at y 1 000; a wall at x 1 000 crosses its line and nothing else, a
  // pipe along y 500 crosses both extension lines.
  const look = { arrow: 'filled' as const, size: 250, off: 100, ext: 200, unit: 'mm' as const, decimals: 0 };
  const d = dim('D1', { pts: [[0, 0], [4000, 0], [2000, 1000]], dir: 0, look, h: 250 });
  const wall: [[number, number], [number, number]] = [[1000, -500], [1000, 3000]];
  const pipe: [[number, number], [number, number]] = [[-500, 500], [4500, 500]];
  it('finds a gap where each line is crossed, how far along that line', () => {
    const b = dimBreaksAt(d, [wall, pipe], 0.001);
    expect(b.map(([e]) => e).sort()).toEqual([0, 1, 2]);
    const onDim = b.find(([e]) => e === 0)!;
    expect(onDim[1]).toBeCloseTo(1000); // from the dimension line's start, at x 0
    expect(b.find(([e]) => e === 1)![1]).toBeCloseTo(400); // the extension line starts 100 off the point
  });
  it('cuts the gaps out of the lines drawn, the arrows and text staying', () => {
    const broken = withBreaks(d, dimBreaksAt(d, [wall, pipe], 0.001)), whole = dimOf(d, 0.001), cut = dimOf(broken, 0.001);
    expect(cut.lines.length).toBe(whole.lines.length + 3);
    expect(cut.text).toEqual(whole.text);
    // No piece of the dimension line covers x 1 000; the gap is 1.5 arrows long.
    const pieces = cut.lines.filter(([a, b]) => a[1] === 1000 && b[1] === 1000 && Math.abs(b[0] - a[0]) > 300); // not the arrows
    expect(pieces.some(([a, b]) => Math.min(a[0], b[0]) < 1000 && Math.max(a[0], b[0]) > 1000)).toBe(false);
    expect(pieces.map(([a, b]) => Math.abs(b[0] - a[0])).reduce((x, y) => x + y, 0)).toBeCloseTo(4000 - 375);
    expect(segmentsOf(broken, 0.001)).toHaveLength(cut.lines.length); // what is snapped to, picked and saved
  });
  it('leaves out crossings at a line\'s ends, and none or no dimension gives none; withBreaks [] takes them off', () => {
    expect(dimBreaksAt(d, [[[0, -100], [0, 50]]], 0.001)).toEqual([]); // at the measured point
    expect(dimBreaksAt({ ...d, dimKind: 'radius' }, [wall], 0.001)).toEqual([]);
    expect(withBreaks({ ...d, brk: [[0, 10]] }, []).brk).toBeUndefined();
  });
  it('keep their places through move, rotate and mirror, and grow with scale', () => {
    const b = withBreaks(d, [[0, 1000]]);
    const turned = rotated(b, [0, 0], Math.PI / 2), big = scaled(b, [0, 0], 2), flipped = mirrored(b, [0, 0], [0, 10]) as typeof b;
    expect(turned.brk).toEqual([[0, 1000]]);
    expect(big.brk).toEqual([[0, 2000]]);
    expect(flipped.brk).toEqual([[0, 1000]]);
  });
});

describe('Text position (DIMTEDIT)', () => {
  const look = { arrow: 'filled' as const, size: 250, off: 100, ext: 200, unit: 'mm' as const, decimals: 0 };
  const d = dim('D1', { pts: [[0, 0], [4000, 0], [2000, 1000]], dir: 0, look, h: 250 });
  it('moves the text to a point, its middle there, and Home brings it back', () => {
    const moved = dimTextAt(d, [3000, 1800]);
    expect(moved.pts).toHaveLength(4);
    const t = dimOf(moved, 0.001);
    expect(t.text[0]).toBeCloseTo(3000); expect(t.text[1]).toBeCloseTo(1800 - 125);
    expect(dimOf(moved, 0.001).lines).toEqual(dimOf(d, 0.001).lines); // the lines stay
    expect(dimTextHome(moved, undefined).pts).toHaveLength(3);
  });
  it('puts it next to an extension line or centred, as its look says; none for one drawn before styles', () => {
    const left = dimTextAlong(dimTextAt(d, [0, 0]), 'first')!;
    expect(left.look?.textAlong).toBe('first');
    expect(left.pts).toHaveLength(3);
    expect(dimOf(left, 0.001).text[0]).toBeLessThan(dimOf(d, 0.001).text[0]);
    expect(dimTextAlong(left, undefined)!.look?.textAlong).toBeUndefined();
    expect(dimTextAlong({ ...d, look: undefined }, 'first')).toBeUndefined();
  });
  it('turns the text to an angle, back as drawn with none, and Home puts the style\'s place back', () => {
    const turned = dimTextAngle(d, 30);
    expect(dimOf(turned, 0.001).angle).toBeCloseTo(Math.PI / 6);
    expect(dimTextAngle(turned, undefined).rot).toBeUndefined();
    expect(rotated(turned, [0, 0], Math.PI / 2).rot).toBeCloseTo(Math.PI / 6 + Math.PI / 2);
    const home = dimTextHome({ ...turned, look: { ...look, textAlong: 'second' } }, 'first');
    expect(home.rot).toBeUndefined(); expect(home.look?.textAlong).toBe('first');
    const radial: SketchItem = { id: 'R', kind: 'dim', dimKind: 'radius', layer: ANNO_LAYER, pts: [[0, 0], [100, 0], [200, 0]], rot: 1 };
    expect(dimOf(radial, 0.001).angle).toBe(1);
    expect(dimTextHome(radial, undefined).pts).toHaveLength(3);
  });
  it('reads the style\'s place along the line for Home', () => {
    expect(styleTextAlong(p, dim('D1'))).toBeUndefined();
  });
});
