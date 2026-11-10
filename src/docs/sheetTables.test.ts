import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { sampleProject } from '../data/sampleProject';
import { setOf, sheetHash, startStatus, type DrawingSet, type DrawingSheet } from '../model/drawingSet';
import { hasTable, patchTable, tableId, tableName, tablesOf, withTables, type PlacedTable } from '../model/sheetTables';
import { buildSheetDxf } from './sheetDxf';
import { buildSldSheetHtml, type SheetInfo } from './sldSheet';

/** Legend and notes tables placed on a plan sheet's layout: paper objects of the sheet, printed at their place. */
const svg = '<svg viewBox="0 0 100 50"></svg>';
const tsvg = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-h="${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="#fff" stroke="#000" stroke-width="0.35"/><text x="2" y="5" font-size="3.25" font-weight="700">LEGEND</text></svg>`;
const info: SheetInfo = { no: 'E-LTG-001', title: 'GF LIGHTING', index: 1, count: 1, kind: 'plan', notes: ['A PLAN NOTE'],
  tables: [{ id: 'tb1', kind: 'legend', x: 200, y: 10, w: 92, h: 40, svg: tsvg(92, 40) }, { id: 'tb2', kind: 'notes', x: 200, y: 60, w: 120, h: 30, svg: tsvg(120, 30).replace('LEGEND', 'NOTES') }], notesOff: true };

/** A set with one SLD sheet (the sample project has none of its own). */
function oneSheet(): { set: DrawingSet; s: DrawingSheet } {
  const base = setOf(sampleProject);
  const s: DrawingSheet = { id: 's1', number: 'E-SLD-001', title: 'SLD', kind: 'system', boards: sampleProject.boards.map((b) => b.id), size: 'auto', status: startStatus(base) };
  return { set: { ...base, sheets: [s] }, s };
}

describe('placed tables: the model', () => {
  const list: PlacedTable[] = [{ id: 'tb1', kind: 'legend', at: [10, 10], widthMm: 92 }, { id: 'tb3', kind: 'notes', at: [10, 80], widthMm: 92 }, { id: 'tb2', kind: 'legend', at: [120, 10], widthMm: 120 }];
  it('names and numbers the tables, finds a free id, patches one and keeps a sheet\'s list tidy', () => {
    expect(tableName(list, 'tb1')).toBe('Legend 1');
    expect(tableName(list, 'tb2')).toBe('Legend 2');
    expect(tableName(list, 'tb3')).toBe('Notes');
    expect(tableName(list, 'x')).toBe('Table');
    expect(tableId(list)).toBe('tb4');
    expect(tableId([])).toBe('tb1');
    expect(patchTable(list, 'tb1', { cols: 2, title: undefined })[0]).toEqual({ id: 'tb1', kind: 'legend', at: [10, 10], widthMm: 92, cols: 2 });
    const { set, s } = oneSheet();
    const withT = withTables(set, s.id, list);
    expect(tablesOf(withT.sheets[0])).toEqual(list);
    expect(hasTable(withT.sheets[0], 'notes')).toBe(true);
    expect(withTables(withT, s.id, []).sheets[0].tables).toBeUndefined();
    expect(hasTable(s, 'legend')).toBe(false);
  });
  it('the sheet\'s hash follows its tables (an issued sheet shows as changed)', () => {
    const { set, s } = oneSheet();
    const a = sheetHash(sampleProject, set, s), b = sheetHash(sampleProject, set, { ...s, tables: list }), c = sheetHash(sampleProject, set, { ...s, tables: patchTable(list, 'tb1', { at: [20, 20] }) });
    expect(b).not.toBe(a);
    expect(c).not.toBe(b);
  });
});

describe('placed tables: the printed sheet and the DXF', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());
  it('prints each table at its place over the drawing area, and no notes box when a notes table holds the notes', () => {
    const html = buildSldSheetHtml(sampleProject, svg, 'A3', info);
    expect(html).toContain('<div class="ptab" data-id="tb1" style="left:203mm;top:13mm;width:92mm">');
    expect(html).toContain('<div class="ptab" data-id="tb2" style="left:203mm;top:63mm;width:120mm">');
    expect(html).toContain('.ptab { position: absolute; }');
    expect(html).not.toContain('<div class="notes"');
    expect(html).not.toContain('A PLAN NOTE');
    // Without notesOff the notes box prints as before.
    expect(buildSldSheetHtml(sampleProject, svg, 'A3', { ...info, notesOff: undefined })).toContain('A PLAN NOTE');
  });
  it('writes the tables as lines and text on E-LEGEND and E-NOTES at their place (y up)', () => {
    const data = buildSheetDxf(sampleProject, svg, 'A3', info);
    const lines = data.split(/\r?\n/);
    const texts: { layer: string; x: number; y: number; s: string }[] = [];
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i] === '0' && lines[i + 1] === 'TEXT') {
        const v = new Map<number, string>();
        for (let j = i + 2; j < lines.length && lines[j] !== '0'; j += 2) v.set(Number(lines[j]), lines[j + 1]);
        texts.push({ layer: v.get(8) ?? '', x: Number(v.get(10)), y: Number(v.get(20)), s: v.get(1) ?? '' });
      }
    }
    const lg = texts.find((t) => t.s === 'LEGEND' && t.layer === 'E-LEGEND')!, nt = texts.find((t) => t.s === 'NOTES' && t.layer === 'E-NOTES')!;
    expect(lg).toBeDefined();
    expect(lg.x).toBeCloseTo(20 + 3 + 200 + 2, 1); // the frame's left + the drawing's margin + the table's corner + the text's x
    expect(lg.y).toBeLessThan(297 - 10 - 3 - 10); // below the table's top (y down on the paper)
    expect(lg.y).toBeGreaterThan(297 - 10 - 3 - 10 - 40);
    expect(nt).toBeDefined();
    expect(texts.some((t) => t.s.includes('A PLAN NOTE'))).toBe(false);
  });
});
