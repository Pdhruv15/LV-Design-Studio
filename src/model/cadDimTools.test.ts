import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { ANNO_LAYER, dimDirFor, dimLayerOf, dimLayerSetting, dimPicksObject, pickedDimStyle, restyledDim, restyledDims, styleOfDim, USE_CURRENT, withDimLayer } from './cadDimTools';
import { dimLabel } from './cadSketch';
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
