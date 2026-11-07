import { describe, expect, it } from 'vitest';
import { badName, cannotDelete, CAD_FONTS, currentDimStyle, currentTextStyle, dimLookOf, dimStylesOf, dimText, newStyleName, textStylesOf } from './cadStyles';
import { dimensionLines, shapesOut } from './cadSketch';
import { arrayPolar } from './cadEdit';
import { sampleProject } from '../data/sampleProject';
import type { Project, SketchItem } from '../types';

const p: Project = { ...sampleProject, cadAnno: { textMm: 2.5, scale: 100 } };
const len = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

describe('text and dimension styles', () => {
  it('gives an older project one Standard of each, drawing as before', () => {
    expect(textStylesOf(p)).toEqual({ styles: [{ name: 'Standard', font: 'Arial', heightMm: 0 }], current: 'Standard' });
    expect(currentTextStyle(p).heightMm).toBe(0); // asked each time, from the annotation text height
    expect(currentDimStyle(p)).toMatchObject({ name: 'Standard', arrow: 'tick', textMm: 2, decimals: 2, unit: 'm' });
    expect(dimLookOf(p, 0.001)).toBeUndefined(); // no styles yet: dimensions sized from their length
    expect(CAD_FONTS).toEqual(['Arial']);
  });

  it('draws a new dimension with the current style once the project has styles', () => {
    const styles = dimStylesOf(p);
    const q: Project = { ...p, cadDimStyles: { styles: [...styles.styles, { ...styles.styles[0], name: 'Plans', arrow: 'closed', arrowMm: 3, unit: 'mm', decimals: 0 }], current: 'Plans' } };
    const d = dimLookOf(q, 0.001)!; // mm drawing at 1:100: 100 units per paper mm
    expect(d.look).toEqual({ arrow: 'closed', size: 300, off: 60, ext: 125 });
    expect(d.textH).toBe(200);
    expect(dimText(3.2, d.style)).toBe('3200');
    expect(dimText(3.256, { unit: 'm', decimals: 2 })).toBe('3.26');
  });

  it('keeps names unique, Standard and the current style', () => {
    const s = { styles: [{ name: 'Standard' }, { name: 'Style 1' }, { name: 'Notes' }], current: 'Notes' };
    expect(newStyleName(s.styles.map((x) => x.name))).toBe('Style 2');
    expect(cannotDelete(s, 'Standard')).toBe('Standard cannot be deleted.');
    expect(cannotDelete(s, 'Notes')).toBe('Set another style current first.');
    expect(cannotDelete(s, 'Style 1')).toBeUndefined();
    expect(badName(s, 'Style 1', 'notes')).toBe('There is already a style named notes.');
    expect(badName(s, 'Style 1', ' ')).toBe('Give the style a name.');
    expect(badName(s, 'Standard', 'Main')).toBe('Standard keeps its name.');
    expect(badName(s, 'Style 1', 'Titles')).toBeUndefined();
  });
});

describe('dimension looks', () => {
  it('draws as before with no look', () => {
    const d = dimensionLines([0, 0], [4000, 0], [2000, 800]);
    expect(d.lines).toHaveLength(5);
    expect(d.lines[0]).toEqual([[0, 0], [0, 880]]);
    expect(len(...d.lines[3])).toBeCloseTo(2 * 60 * Math.SQRT2, 6);
  });

  it('draws ticks, closed arrows or dots at the size of the look, with the gap and extension', () => {
    const look = { size: 300, off: 60, ext: 125 };
    const tick = dimensionLines([0, 0], [4000, 0], [2000, 800], { arrow: 'tick', ...look });
    expect(tick.lines[0]).toEqual([[0, 60], [0, 925]]); // from the gap at the origin to past the dimension line
    expect(len(...tick.lines[3])).toBeCloseTo(300, 6);
    const closed = dimensionLines([0, 0], [4000, 0], [2000, 800], { arrow: 'closed', ...look });
    expect(closed.lines).toHaveLength(3 + 6);
    expect(closed.lines[3][0]).toEqual([0, 800]); // the tip at the end of the dimension line
    expect(closed.lines[3][1][0]).toBeCloseTo(300, 6); // pointing out, its base inside
    expect(dimensionLines([0, 0], [4000, 0], [2000, 800], { arrow: 'dot', ...look }).lines).toHaveLength(3 + 24);
    expect(tick.text[1]).toBe(950);
  });

  it('saves a styled dimension with its own text, as the sheets print it', () => {
    const dim: SketchItem = { id: 'd', kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [4000, 0], [2000, 800]], text: '4000', h: 200, look: { arrow: 'closed', size: 300, off: 60, ext: 125 } };
    const out = shapesOut([dim], 0.001);
    expect(out.filter((s) => s.kind === 'line')).toHaveLength(9);
    expect(out.find((s) => s.kind === 'text')).toMatchObject({ text: '4000', h: 200 });
    expect(shapesOut([{ ...dim, look: undefined }], 0.001).find((s) => s.kind === 'text')!.text).toBe('4.00');
  });
});

describe('polar array', () => {
  it('turns the copies, or with Rotate items off moves them keeping their direction', () => {
    const line: SketchItem = { id: 'a', kind: 'line', layer: 'L', pts: [[1000, 0], [2000, 0]] };
    const turned = arrayPolar(line, [0, 0], 4, 360);
    expect(turned[0].pts.map((q) => q.map((v) => Math.round(v)))).toEqual([[0, 1000], [0, 2000]]);
    const kept = arrayPolar(line, [0, 0], 4, 360, false);
    expect(kept[0].pts.map((q) => q.map((v) => Math.round(v)))).toEqual([[0, 1000], [1000, 1000]]);
  });
});
