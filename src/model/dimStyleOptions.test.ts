import { describe, expect, it } from 'vitest';
import { DIM_ARROWS, DIM_DEFAULTS, dimLookOf, dimStylesOf, dimStylesToStore, dimText, lookOf, type CadDimStyle } from './cadStyles';
import { dimensionLines, dimLength, dimOf, scaleLook, segmentsOf, shapesOut, type DimLook } from './cadSketch';
import { scaled } from './cadEdit';
import { sampleProject } from '../data/sampleProject';
import type { Project, SketchItem } from '../types';

const p: Project = { ...sampleProject, cadAnno: { textMm: 2.5, scale: 100 } };
const base: DimLook = { arrow: 'tick', size: 250, off: 60, ext: 125, unit: 'mm', decimals: 0 };
const dim = (look: DimLook, h = 200): SketchItem => ({ id: 'd', kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [4000, 0], [2000, 800]], look, h });
const style = (over: Partial<CadDimStyle>): CadDimStyle => ({ ...dimStylesOf(p).styles[0], name: 'S', ...over });

describe('dimension length format', () => {
  it('writes the length in m, cm or mm with scale, rounding, trailing zeros, decimal comma and prefix / suffix', () => {
    expect(dimLength(3.256, { unit: 'cm', decimals: 1 })).toBe('325.6');
    expect(dimLength(3.256, { unit: 'mm', decimals: 0, round: 50 })).toBe('3250');
    expect(dimLength(3.2, { unit: 'm', decimals: 3, trimZeros: true })).toBe('3.2');
    expect(dimLength(3, { unit: 'm', decimals: 2, trimZeros: true })).toBe('3');
    expect(dimLength(3.25, { unit: 'm', decimals: 2, comma: true })).toBe('3,25');
    expect(dimLength(1.5, { unit: 'mm', decimals: 0, scale: 0.5, prefix: '≈', suffix: ' mm' })).toBe('≈750 mm');
    expect(dimLength(-0.0001, { unit: 'm', decimals: 2 })).toBe('0.00');
    expect(dimText(3.2, style({ unit: 'mm', decimals: 0, suffix: ' mm' }))).toBe('3200 mm');
  });
});

describe('dimension arrows and text placement', () => {
  it('draws each arrowhead (and a different second one), none drawing nothing', () => {
    const ends = (l: DimLook) => dimensionLines([0, 0], [4000, 0], [2000, 800], l).lines.length - 3;
    expect(ends({ ...base, arrow: 'none' })).toBe(0);
    expect(ends({ ...base, arrow: 'tick' })).toBe(2);
    expect(ends({ ...base, arrow: 'closed' })).toBe(6);
    expect(ends({ ...base, arrow: 'filled' })).toBeGreaterThan(ends({ ...base, arrow: 'closed' }));
    expect(ends({ ...base, arrow: 'open' })).toBe(4);
    expect(ends({ ...base, arrow: 'tick', arrow2: 'none' })).toBe(1);
    for (const a of DIM_ARROWS) expect(ends({ ...base, arrow: a.id })).toBeGreaterThanOrEqual(0);
    // An open arrow points out to its end.
    const open = dimensionLines([0, 0], [4000, 0], [2000, 800], { ...base, arrow: 'open' }).lines.slice(3, 5);
    expect(open[0]).toEqual([[0, 800], [250, 800 + 250 / 6]]);
  });

  it('puts the text above, centred in a break, or below the line, along it or at an extension line', () => {
    const at = (l: Partial<DimLook>) => dimOf(dim({ ...base, gap: 60, ...l }), 0.001);
    // Above: the baseline the gap over the line; below: its height under it.
    expect(at({ textPos: 'above' }).text[1]).toBeCloseTo(860, 6);
    expect(at({ textPos: 'below' }).text[1]).toBeCloseTo(800 - 60 - 200 * 0.7, 6);
    // Centred: the middle of the text on the line, the line broken round the text ("4000", 4 × 0.6 × 200 wide).
    const c = at({ textPos: 'centered' });
    expect(c.text[1]).toBeCloseTo(800 - 70, 6);
    const lines = c.lines.filter(([a, b]) => a[1] === 800 && b[1] === 800);
    expect(lines).toEqual([[[0, 800], [2000 - 240 - 60, 800]], [[2000 + 240 + 60, 800], [4000, 800]]]);
    // At extension line 1: past the arrow, its half width in.
    expect(at({ textPos: 'above', textAlong: 'first' }).text[0]).toBeCloseTo(250 * 1.5 + 240, 6);
    expect(at({ textPos: 'above', textAlong: 'second' }).text[0]).toBeCloseTo(4000 - 250 * 1.5 - 240, 6);
    // Fields left out: as before (over the line, away from the points, half the arrow size up).
    expect(dimOf(dim(base), 0.001).text).toEqual([2000, 925]);
  });

  it('keeps horizontal text horizontal on a vertical dimension and clear of the line', () => {
    const v: SketchItem = { id: 'v', kind: 'dim', layer: 'L', pts: [[0, 0], [0, 4000], [-800, 2000]], look: { ...base, textPos: 'above', textFlat: true, gap: 60 }, h: 200 };
    const g = dimOf(v, 0.001);
    expect(g.angle).toBe(0);
    // The line is at x = -800; the text's middle half its width (240) and the gap off it.
    expect(Math.abs(g.text[0] + 800)).toBeCloseTo(300, 6);
  });

  it('hides extension lines, runs the line past them, and scales the gap and the run with the dimension', () => {
    const l: DimLook = { ...base, hideExt1: true, dle: 100, gap: 60, textPos: 'above' };
    const g = dimensionLines([0, 0], [4000, 0], [2000, 800], l);
    expect(g.lines[0]).toEqual([[4000, 60], [4000, 925]]); // only the second extension line
    expect(g.lines[1]).toEqual([[-100, 800], [4100, 800]]);
    expect(scaleLook(l, 2)).toMatchObject({ size: 500, gap: 120, dle: 200 });
    expect(scaled(dim(l), [0, 0], 0.5).look).toMatchObject({ gap: 30, dle: 50 });
    // Written to the DXF and drawn as they show.
    expect(shapesOut([dim(l)], 0.001).filter((s) => s.kind === 'line')).toHaveLength(g.lines.length);
    expect(segmentsOf(dim(l), 0.001)).toEqual(g.lines);
  });
});

describe('dimension style settings', () => {
  it('gives styles saved before the new settings what they drew with, and keeps only what differs in a look', () => {
    const old = { name: 'Old', arrow: 'closed', arrowMm: 3, textMm: 2, offsetMm: 0.6, extendMm: 1.25, decimals: 0, unit: 'mm' } as CadDimStyle;
    const q: Project = { ...p, cadDimStyles: { styles: [old], current: 'Old' } };
    expect(dimStylesOf(q).styles.find((x) => x.name === 'Old')).toEqual({ ...old, ...DIM_DEFAULTS });
    expect(dimLookOf(q, 0.001)!.look).toEqual({ arrow: 'closed', size: 300, off: 60, ext: 125, unit: 'mm', decimals: 0 });
    const s = style({ arrow2: 'dot', textPos: 'centered', textAlong: 'first', textFlat: true, dleMm: 1, hideExt2: true, gapMm: 1, trimZeros: true, suffix: ' m', scale: 2 });
    expect(lookOf(s, 100)).toMatchObject({ arrow2: 'dot', textPos: 'centered', gap: 100, textAlong: 'first', textFlat: true, dle: 100, hideExt2: true, trimZeros: true, suffix: ' m', scale: 2 });
    expect(lookOf(style({ arrow2: 'tick', arrow: 'tick' }), 1).arrow2).toBeUndefined();
    // An unchanged Standard is still not stored.
    expect(dimStylesToStore(p, dimStylesOf(p))).toBeUndefined();
  });
});
