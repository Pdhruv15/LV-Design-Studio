import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { drawnFromDrawing, drawnFromPieces, fieldCount, guessField, mapText, mmPerUnit } from './titleBlockImport';
import { drawnTitleBlockHtml, templateSize, titleBlockHtml } from './titleBlock';

/** A company title block read from a DWG / DXF: its lines and texts in mm from its top left corner, its attribute
 * texts mapped to the project's fields by their tags. */
describe('title block import', () => {
  it('prints the project\'s logo inside the logo area, in proportion; nothing without a logo', () => {
    const t = { id: 'd', name: 'D', kind: 'drawn' as const, cols: [], rows: [], cells: [], size: { w: 180, h: 44 }, shapes: [], texts: [], logo: { x: 2, y: 2, w: 40, h: 12 } };
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    expect(drawnTitleBlockHtml(t, { ...sampleProject, drawing: { ...sampleProject.drawing, logo } })).toContain(`<image href="${logo}" x="2" y="2" width="40" height="12" preserveAspectRatio="xMidYMid meet"/>`);
    expect(drawnTitleBlockHtml(t, sampleProject)).not.toContain('<image');
  });

  it('guesses the field from a tag or placeholder name', () => {
    expect(guessField('DWG_NO')).toBe('{SheetNo}');
    expect(guessField('Drawing No.')).toBe('{SheetNo}');
    expect(guessField('REV')).toBe('{Rev}');
    expect(guessField('DRN')).toBe('{DrawnBy}');
    expect(guessField('CHECKED BY')).toBe('{CheckedBy}');
    expect(guessField('SCALE')).toBe('{Scale}');
    expect(guessField('SHEET')).toBe('{SheetIndex} of {SheetCount}');
    expect(guessField('CLIENT')).toBe('{Owner}');
    expect(guessField('NOTES')).toBeUndefined();
    // Numbered revision rows of a border: REV_1, DATE_1, DESC_1, BY_1 (row 1 = the newest issue).
    expect(guessField('REV_1')).toBe('{Rev1}');
    expect(guessField('DATE 2')).toBe('{RevDate2}');
    expect(guessField('DESCRIPTION_3')).toBe('{RevText3}');
    expect(guessField('BY_1')).toBe('{RevBy1}');
    expect(guessField('REV_13')).toBeUndefined();
    expect(guessField('TITLE1')).toBe('{SheetTitle}');
  });

  it('a drawing the size of a paper is that paper\'s whole border, with its drawing area found', () => {
    const segs = [0, 0, 420, 0, 420, 0, 420, 297, 420, 297, 0, 297, 0, 297, 0, 0, 20, 10, 410, 10, 20, 287, 410, 287, 20, 10, 20, 287, 410, 10, 410, 287, 355, 10, 355, 287];
    const t = drawnFromDrawing({ units: 4, segs, texts: [{ x: 360, y: 20, h: 3, rot: 0, s: 'DWG_NO', tag: 'DWG_NO' }] }, 'ACME-A3-BORDER');
    expect(t.size).toEqual({ w: 420, h: 297 });
    expect(t.border).toEqual({ paper: 'A3', area: { x: 20, y: 10, w: 335, h: 277 } });
    expect(drawnFromDrawing({ units: 4, segs: [0, 0, 180, 0, 180, 0, 180, 44], texts: [] }, 'block').border).toBeUndefined();
  });

  it('takes a whole drawing: lines flipped to y down from its top left, in mm, texts with their height and alignment', () => {
    // A 180 × 44 block drawn in metres at (10, 5): two lines and two texts, one a placeholder for the drawing number.
    const segs = [10, 5, 10.18, 5, 10.18, 5, 10.18, 5.044];
    const texts = [{ x: 10.01, y: 5.01, h: 0.0025, rot: 0, s: 'COMPANY', align: 0 }, { x: 10.17, y: 5.03, h: 0.0035, rot: Math.PI / 2, s: '<DWG_NO>', align: 2 }];
    const t = drawnFromDrawing({ units: 6, segs, texts }, 'ACME');
    expect(mmPerUnit(6)).toBe(1000);
    expect(mmPerUnit(undefined)).toBe(1);
    expect(t.kind).toBe('drawn');
    expect(templateSize(t)).toEqual({ w: 180, h: 44 });
    expect(t.shapes![0]).toEqual({ kind: 'line', x1: 0, y1: 44, x2: 180, y2: 44 }); // the bottom edge (y = 5 is the lowest)
    expect(t.shapes![1]).toEqual({ kind: 'line', x1: 180, y1: 44, x2: 180, y2: 0 });
    expect(t.texts![0]).toMatchObject({ x: 10, y: 34, h: 2.5, text: 'COMPANY' });
    expect(t.texts![1]).toMatchObject({ x: 170, y: 14, h: 3.5, rot: 90, align: 'right', text: '{SheetNo}', orig: '<DWG_NO>' });
    expect(fieldCount(t)).toBe(1);
  });

  it('takes an exploded block: arcs as polylines, attributes as fields by their tag, a solid as a filled shape', () => {
    const pieces = [
      { layer: '0', kind: 'line' as const, a: [0, 0] as [number, number], b: [100, 0] as [number, number] },
      { layer: '0', kind: 'arc' as const, c: [50, 0] as [number, number], r: 10, a0: 0, a1: Math.PI },
      { layer: '0', kind: 'solid' as const, pts: [[0, 20], [10, 20], [10, 30], [0, 30]] as [number, number][] },
      { layer: '0', kind: 'text' as const, at: [5, 5] as [number, number], h: 2.5, rot: 0, text: 'A', tag: 'REV', just: 'C' as const },
      { layer: '0', kind: 'text' as const, at: [5, 10] as [number, number], h: 2.5, rot: 0, text: 'TITLE', just: 'L' as const }
    ];
    const t = drawnFromPieces(pieces, 4, 'Block');
    expect(templateSize(t)).toEqual({ w: 100, h: 30 });
    expect(t.logo).toBeUndefined();
    // A closed rectangle on a layer named LOGO is the logo area (its lines stay).
    const withLogo = drawnFromPieces([...pieces, { layer: 'TB-LOGO', kind: 'pline' as const, closed: true, pts: [[60, 12, 0], [96, 12, 0], [96, 28, 0], [60, 28, 0]] as [number, number, number][] }], 4, 'Block');
    expect(withLogo.logo).toEqual({ x: 60, y: 2, w: 36, h: 16 });
    expect(withLogo.shapes!.length).toBe(t.shapes!.length + 1);
    expect(t.shapes!.map((s) => s.kind)).toEqual(['line', 'poly', 'poly']);
    expect((t.shapes![1] as { pts: [number, number][] }).pts.length).toBeGreaterThan(8);
    expect(t.shapes![2]).toMatchObject({ kind: 'poly', fill: true, closed: true });
    expect(t.texts![0]).toMatchObject({ text: '{Rev}', tag: 'REV', orig: 'A', align: 'center' });
    expect(t.texts![1]).toMatchObject({ text: 'TITLE' });
    expect(() => drawnFromPieces([], 4, 'Empty')).toThrow();
  });

  it('maps a text to a field and back to the drawing\'s own words, and prints the project\'s value in its place', () => {
    const t0 = drawnFromDrawing({ units: 4, segs: [0, 0, 100, 0, 0, 0, 0, 40], texts: [{ x: 5, y: 10, h: 2.5, rot: 0, s: 'PROJECT NAME HERE', align: 0 }] }, 'X');
    expect(fieldCount(t0)).toBe(0);
    const t1 = mapText(t0, 't1', '{Project}');
    expect(t1.texts![0]).toMatchObject({ text: '{Project}', orig: 'PROJECT NAME HERE' });
    const svg = drawnTitleBlockHtml(t1, sampleProject);
    expect(svg).toContain(`>${sampleProject.name}</text>`);
    expect(svg).toContain('width="100mm" height="40mm"');
    expect(svg).toContain('font-size="3.472"'); // 2.5 mm cap height
    expect(titleBlockHtml(t1, sampleProject)).toBe(svg); // the sheets' entry point draws the same
    expect(mapText(t1, 't1', '').texts![0]).toMatchObject({ text: 'PROJECT NAME HERE' });
    // A long value in a narrow field is squeezed to the field's width.
    const narrow = { ...t1, texts: [{ ...t1.texts![0], fit: 20 }] };
    expect(drawnTitleBlockHtml(narrow, sampleProject)).toContain('textLength="20"');
  });
});

describe('fields fit their cells', () => {
  it('a field runs up to the next vertical line of the block on the side it grows towards', () => {
    const t = drawnFromDrawing({ units: 4, segs: [0, 0, 180, 0, 0, 0, 0, 50, 180, 0, 180, 50, 0, 50, 180, 50, 60, 0, 60, 50, 120, 0, 120, 50], texts: [
      { x: 2, y: 20, h: 3, rot: 0, s: '<PROJECT>', align: 0 }, { x: 90, y: 20, h: 3, rot: 0, s: '<REV>', align: 1 }, { x: 178, y: 20, h: 3, rot: 0, s: '<SCALE>', align: 2 }, { x: 2, y: 40, h: 3, rot: 0, s: 'FIXED WORDS', align: 0 }
    ] }, 'cells');
    const by = Object.fromEntries(t.texts!.map((x) => [x.orig ?? x.text, x]));
    expect(by['<PROJECT>'].fit).toBe(57); // 60 − 2 − 1
    expect(by['<REV>'].fit).toBe(58); // centred between 60 and 120: 2 × 30 − 2
    expect(by['<SCALE>'].fit).toBe(57); // 178 − 120 − 1
    expect(by['FIXED WORDS'].fit).toBeUndefined();
  });
});
