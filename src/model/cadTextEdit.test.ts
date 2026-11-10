import { describe, expect, it } from 'vitest';
import type { SketchItem } from '../types';
import { dimLabel, dimOf, MEASURED, shapesOut, withText } from './cadSketch';

// TEXTEDIT (S5 of the Design CAD 2D gap plan): what typing over a text or dimension makes of it.
const text: SketchItem = { id: 't', kind: 'text', layer: 'LV-ANNO', pts: [[0, 0]], text: 'DB ROOM', h: 250 };
// Two points 3 m apart (drawing units mm), of a style in mm with no decimals, and one drawn before styles.
const styled: SketchItem = { id: 'd', kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [3000, 0], [1500, 500]], dir: 0, h: 200, look: { arrow: 'tick', size: 100, off: 50, ext: 80, unit: 'mm', decimals: 0 } };
const old: SketchItem = { id: 'o', kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [3000, 0], [1500, 500]], text: '3.00' };

describe('withText', () => {
  it('a text takes what is typed, and keeps its own when nothing is', () => {
    expect(withText(text, 'MAIN DB').text).toBe('MAIN DB');
    expect(withText(text, '   ')).toBe(text);
    expect(withText(text, 'DB ROOM')).toBe(text);
    const line: SketchItem = { id: 'l', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [1, 1]] };
    expect(withText(line, 'x')).toBe(line);
  });

  it('a dimension takes an override; blank or <> alone gives the measured value back', () => {
    expect(dimLabel(styled, 0.001)).toBe('3000');
    const over = withText(styled, 'TYP.');
    expect(over.text).toBe('TYP.');
    expect(dimLabel(over, 0.001)).toBe('TYP.');
    expect(withText(over, '')).toEqual(styled);
    expect(withText(over, MEASURED)).toEqual(styled);
    expect(withText(styled, '')).toBe(styled);
    // One drawn before styles keeps a text: blank measures it again in metres.
    expect(withText(old, '', 0.001).text).toBe('3.00');
    expect(withText({ ...old, text: 'TYP.' }, '', 0.001).text).toBe('3.00');
  });

  it('<> in the text stands for the measured value, which follows the points', () => {
    const live = withText(styled, '<> mm');
    expect(dimLabel(live, 0.001)).toBe('3000 mm');
    expect(dimLabel({ ...live, pts: [[0, 0], [4500, 0], [2250, 500]] }, 0.001)).toBe('4500 mm');
    expect(dimLabel({ ...live, text: '2 × <>' }, 0.001)).toBe('2 × 3000');
    // A radius and an angle the same way.
    expect(dimLabel({ ...styled, dimKind: 'radius', text: '<> (TYP.)', look: undefined, h: 200, pts: [[0, 0], [500, 0], [600, 0]] }, 1)).toBe('R500.00 (TYP.)');
    expect(dimLabel({ ...styled, dimKind: 'angular', text: '<> ±1°', look: undefined, pts: [[0, 0], [1000, 0], [0, 1000], [500, 500]] }, 1)).toBe('90.00° ±1°');
    // Drawn and saved with the measure in: the canvas, the sheets and the DXF writer all read the laid-out label.
    expect(dimOf(live, 0.001).label).toBe('3000 mm');
    expect(dimOf({ ...old, text: '<> m' }, 0.001).label).toBe('3.00 m');
    expect(shapesOut([live], 0.001).find((s) => s.kind === 'text')).toMatchObject({ text: '3000 mm' });
  });
});
