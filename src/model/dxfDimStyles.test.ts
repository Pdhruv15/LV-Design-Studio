import { describe, expect, it } from 'vitest';
import { mergeImported, readDxfDimStyles } from './dxfDimStyles';

/** A DXF as another CAD program writes it: group code and value on alternate lines. */
const dxf = (...pairs: [number, string | number][]) => pairs.map(([c, v]) => `${String(c).padStart(3)}\r\n${v}`).join('\r\n') + '\r\n';
const header = (units: number, measurement: number, current = 'ISO-25'): [number, string | number][] =>
  [[0, 'SECTION'], [2, 'HEADER'], [9, '$INSUNITS'], [70, units], [9, '$MEASUREMENT'], [70, measurement], [9, '$DIMSTYLE'], [2, current], [0, 'ENDSEC']];
const blockRecords: [number, string | number][] = [
  [0, 'TABLE'], [2, 'BLOCK_RECORD'], [5, '1'], [70, 2],
  [0, 'BLOCK_RECORD'], [5, '1F'], [100, 'AcDbSymbolTableRecord'], [2, '_ArchTick'],
  [0, 'BLOCK_RECORD'], [5, '20'], [2, '_Dot'],
  [0, 'BLOCK_RECORD'], [5, '21'], [2, 'MY_ARROW'],
  [0, 'ENDTAB']
];

describe('dimension styles from a DXF', () => {
  it('reads an ISO-25 style and an architectural one from a mm drawing (R2000+: arrows by block handle)', () => {
    const text = dxf(...header(4, 1),
      [0, 'SECTION'], [2, 'TABLES'], ...blockRecords,
      [0, 'TABLE'], [2, 'DIMSTYLE'], [5, 'A'], [70, 2],
      [0, 'DIMSTYLE'], [105, '27'], [100, 'AcDbDimStyleTableRecord'], [2, 'ISO-25'], [70, 0],
      [41, 2.5], [42, 0.625], [44, 1.25], [140, 2.5], [147, 0.625], [77, 1], [73, 0], [271, 2], [78, 8], [278, 44],
      [0, 'DIMSTYLE'], [105, '28'], [2, 'ARCH 1-50'], [70, 0], [3, '<> mm'],
      [41, 3], [46, 1.5], [140, 3.5], [147, 1], [77, 0], [280, 1], [271, 0], [75, 1], [342, '1F'], [278, 46], [78, 0],
      [1001, 'ACAD'], [1000, 'DSTYLE'], [1070, 41],
      [0, 'ENDTAB'], [0, 'ENDSEC'], [0, 'EOF']);
    const r = readDxfDimStyles(text);
    expect(r.current).toBe('ISO-25');
    expect(r.styles.map((x) => x.style.name)).toEqual(['ISO-25', 'ARCH 1-50']);
    expect(r.styles[0].style).toMatchObject({
      arrow: 'filled', arrow2: 'same', arrowMm: 2.5, textMm: 2.5, offsetMm: 0.625, extendMm: 1.25, gapMm: 0.625,
      textPos: 'above', textAlong: 'centre', textFlat: false, unit: 'mm', scale: 1, decimals: 2, trimZeros: true, comma: true, prefix: '', suffix: ''
    });
    expect(r.styles[1].style).toMatchObject({
      arrow: 'archTick', arrowMm: 3, dleMm: 1.5, textMm: 3.5, gapMm: 1, textPos: 'centered', textAlong: 'first', decimals: 0, hideExt1: true, comma: false, trimZeros: false, suffix: ' mm'
    });
    expect(r.styles.every((x) => !x.notes.length)).toBe(true);
  });

  it('reads separate arrows, ticks by size, R12 arrow names, a metre drawing in mm by DIMLFAC and inches as mm', () => {
    const text = dxf(...header(6, 1, 'TWO'),
      [0, 'SECTION'], [2, 'TABLES'], ...blockRecords,
      [0, 'TABLE'], [2, 'DIMSTYLE'],
      [0, 'DIMSTYLE'], [2, 'TWO'], [173, 1], [343, '20'], [344, '21'], [144, 1000], [271, 0],
      [0, 'DIMSTYLE'], [2, 'TICKS'], [142, 1], [40, 100],
      [0, 'DIMSTYLE'], [2, 'R12'], [5, '_OPEN30'],
      [0, 'ENDTAB'], [0, 'ENDSEC'], [0, 'EOF']);
    const [two, ticks, r12] = readDxfDimStyles(text).styles;
    expect(two.style).toMatchObject({ arrow: 'dotFilled', arrow2: 'filled', unit: 'mm', scale: 1, decimals: 0 });
    expect(two.notes).toEqual(['arrow block "my_arrow" drawn as closed filled']);
    expect(ticks.style.arrow).toBe('tick');
    expect(ticks.style.arrowMm).toBeCloseTo(2 * Math.SQRT2, 3);
    expect(ticks.notes).toEqual(['DIMSCALE 100 left to the annotation scale']);
    expect(r12.style).toMatchObject({ arrow: 'open30', unit: 'm' });
    // An imperial drawing (inches): sizes from inches, the length as written there (inches) through a scale on mm.
    const inch = readDxfDimStyles(dxf(...header(1, 0, 'Standard'), [0, 'SECTION'], [2, 'TABLES'], [0, 'TABLE'], [2, 'DIMSTYLE'], [0, 'DIMSTYLE'], [2, 'Standard'], [0, 'ENDTAB'], [0, 'ENDSEC'], [0, 'EOF'])).styles[0].style;
    expect(inch).toMatchObject({ arrowMm: 4.572, textMm: 4.572, textPos: 'centered', textFlat: true, decimals: 4, unit: 'mm', comma: false });
    expect(inch.scale).toBeCloseTo(1 / 25.4, 9);
  });

  it('says what to do with a DWG, a binary DXF or a file that is not a drawing', () => {
    expect(() => readDxfDimStyles('AC1032\0\0')).toThrow(/DWG drawing\. Save it as DXF/);
    expect(() => readDxfDimStyles('AutoCAD Binary DXF\r\n\x1a\0')).toThrow(/ASCII DXF/);
    expect(() => readDxfDimStyles('hello\nworld\n')).toThrow(/not a group code/);
    expect(() => readDxfDimStyles(dxf([999, 'comment'], [0, 'EOF']))).toThrow('This is not a DXF drawing.');
    expect(readDxfDimStyles(dxf([0, 'SECTION'], [2, 'ENTITIES'], [0, 'ENDSEC'], [0, 'EOF'])).styles).toEqual([]);
  });

  it('imports under its own name, or with the file name when that is taken', () => {
    const s = readDxfDimStyles(dxf(...header(4, 1), [0, 'SECTION'], [2, 'TABLES'], [0, 'TABLE'], [2, 'DIMSTYLE'],
      [0, 'DIMSTYLE'], [2, 'Standard'], [0, 'DIMSTYLE'], [2, 'ISO-25'], [0, 'DIMSTYLE'], [2, 'Plans'], [0, 'ENDTAB'], [0, 'ENDSEC'], [0, 'EOF'])).styles.map((x) => x.style);
    expect(mergeImported(['Standard', 'plans', 'Plans (GF plan)'], s, 'C:\\jobs\\GF plan.dxf').map((x) => x.name)).toEqual(['Standard (GF plan)', 'ISO-25', 'Plans (GF plan) 1']);
  });
});
