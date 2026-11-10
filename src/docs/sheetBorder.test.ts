import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { sampleProject } from '../data/sampleProject';
import { borderOf, detectArea, paperOf, revRowsIn, revRowValues, type TitleTemplate } from '../model/titleBlock';
import { autoSize, scaleOn } from '../model/drawingSet';
import type { Project } from '../types';
import { drawingAreaMm } from './planLayout';
import { buildSheetDxf } from './sheetDxf';
import { buildSldSheetHtml, sheetBody, type SheetInfo } from './sldSheet';

/** A whole-border template: a drawn template the size of a paper stands in for the sheet's frame, zone strip and title
 * band, and the sheet works inside its drawing area. */
const border: TitleTemplate = {
  id: 'tb-b', name: 'ACME A3 BORDER', kind: 'drawn', cols: [], rows: [], cells: [], size: { w: 420, h: 297 },
  shapes: [
    { kind: 'poly', pts: [[0, 0], [420, 0], [420, 297], [0, 297]], closed: true, w: 0.7 },
    { kind: 'line', x1: 20, y1: 10, x2: 410, y2: 10, w: 0.5 }, { kind: 'line', x1: 20, y1: 287, x2: 410, y2: 287, w: 0.5 },
    { kind: 'line', x1: 20, y1: 10, x2: 20, y2: 287, w: 0.5 }, { kind: 'line', x1: 410, y1: 10, x2: 410, y2: 287, w: 0.5 },
    { kind: 'line', x1: 355, y1: 10, x2: 355, y2: 287 }, { kind: 'line', x1: 355, y1: 60, x2: 410, y2: 60 }, { kind: 'line', x1: 355, y1: 120, x2: 410, y2: 120 }, { kind: 'line', x1: 355, y1: 250, x2: 410, y2: 250 }
  ],
  texts: [
    { id: 't1', x: 358, y: 40, h: 3.5, text: 'ACME CONSULTANTS' }, { id: 't2', x: 358, y: 280, h: 5, text: '{SheetNo}', tag: 'DWG_NO' },
    { id: 't3', x: 358, y: 130, h: 2.5, text: '{Rev1}', tag: 'REV_1' }, { id: 't4', x: 370, y: 130, h: 2.5, text: '{RevDate1}', tag: 'DATE_1' }, { id: 't5', x: 390, y: 130, h: 2.5, text: '{RevText1}', tag: 'DESC_1' },
    { id: 't6', x: 358, y: 136, h: 2.5, text: '{Rev2}' }
  ],
  border: { paper: 'A3', area: { x: 20, y: 10, w: 335, h: 277 } }
};
const noRows: TitleTemplate = { ...border, id: 'tb-n', texts: border.texts!.slice(0, 2) };
const withBorder = (t: TitleTemplate): Project => ({ ...sampleProject, titleTemplates: [t], drawing: { ...sampleProject.drawing, borderByPaper: { A3: t.id } } });
const svg = '<svg viewBox="0 0 100 50"></svg>';
const info: SheetInfo = { no: 'E-SLD-001', title: 'MAIN SLD', index: 1, count: 1, furniture: { zones: 'all', centring: true },
  history: [{ id: 'A', date: '2026-01-05', description: 'First issue' }, { id: 'B', date: '2026-02-09', description: 'Issued for approval' }] };

type Entity = { type: string; v: Map<number, string> };
function entities(data: string): Entity[] {
  const lines = data.trimEnd().split(/\r?\n/), out: Entity[] = [];
  let inside = false, cur: Entity | undefined;
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]), value = lines[i + 1];
    if (code === 2 && value === 'ENTITIES') { inside = true; continue; }
    if (!inside) continue;
    if (code === 0) { if (value === 'ENDSEC') break; cur = { type: value, v: new Map() }; out.push(cur); } else cur?.v.set(code, value);
  }
  return out;
}

describe('whole-border template: the model', () => {
  it('knows a paper by a template\'s size (within 2 mm) and the border a paper prints in', () => {
    expect(paperOf({ w: 420, h: 297 })).toBe('A3');
    expect(paperOf({ w: 419, h: 298.5 })).toBe('A3');
    expect(paperOf({ w: 297, h: 420 })).toBe('A3 portrait');
    expect(paperOf({ w: 841.5, h: 594 })).toBe('A1');
    expect(paperOf({ w: 180, h: 44 })).toBeUndefined();
    const p = withBorder(border);
    expect(borderOf(p, 'A3')?.id).toBe('tb-b');
    expect(borderOf(p, 'A2')).toBeUndefined(); // no border for A2: the app's frame
    expect(borderOf({ ...p, drawing: { ...p.drawing, borderByPaper: { A2: 'tb-b' } } }, 'A2')).toBeUndefined(); // an A3 border never serves A2
    expect(borderOf({ ...p, titleTemplates: [{ ...border, border: undefined }] }, 'A3')).toBeUndefined(); // unticked
  });

  it('finds the drawing area: the largest rectangle bounded by lines that holds no text and no line', () => {
    expect(detectArea(border, { w: 420, h: 297 })).toEqual({ x: 20, y: 10, w: 335, h: 277 });
    // Nothing bounded: the paper less the app's margins.
    expect(detectArea({ shapes: [{ kind: 'line', x1: 0, y1: 0, x2: 420, y2: 297 }], texts: [] }, { w: 420, h: 297 })).toEqual({ x: 20, y: 10, w: 390, h: 277 });
  });

  it('counts the revision rows a template prints itself and fills them from the issues, newest first', () => {
    expect(revRowsIn(border)).toBe(2);
    expect(revRowsIn(noRows)).toBe(0);
    const v = revRowValues([{ id: 'B', date: '09-02-2026', description: 'Issued for approval', by: 'PG' }, { id: 'A', date: '05-01-2026', description: 'First issue' }]);
    expect(v).toMatchObject({ Rev1: 'B', RevDate1: '09-02-2026', RevText1: 'Issued for approval', RevBy1: 'PG', Rev2: 'A', RevBy2: '', Rev3: '', RevText12: '' });
  });

  it('lays the sheet out in the border\'s drawing area at full size; other papers keep the frame and band', () => {
    const p = withBorder(border);
    expect(sheetBody(p, 'A3')).toMatchObject({ frame: { x: 20, y: 10, w: 335, h: 277 }, body: { w: 335, h: 277 }, k: 1 });
    expect(sheetBody(p, 'A3').border?.id).toBe('tb-b');
    expect(sheetBody(p, 'A2')).toMatchObject({ frame: { x: 20, y: 10, w: 564, h: 400 }, body: { w: 564, h: 356 }, k: 1 });
    expect(sheetBody(sampleProject, 'A3')).toMatchObject({ frame: { x: 20, y: 10, w: 390, h: 277 }, body: { w: 390, h: 233 } });
  });
});

describe('whole-border template: the printed sheet', () => {
  it('draws the border at the paper\'s origin in place of the frame, zones and band, and fills its revision rows', () => {
    const html = buildSldSheetHtml(withBorder(border), svg, 'A3', info);
    expect(html).toContain('<div class="brd"><svg');
    expect(html).toContain('viewBox="0 0 420 297"');
    expect(html).toContain('.frame { position: absolute; inset: 10mm 65mm 10mm 20mm; border: 0;');
    expect(html).not.toMatch(/class="(tb )?band/);
    expect(html).not.toContain('class="zn');
    expect(html).not.toContain('class="cm"');
    expect(html).not.toContain('class="rvb"');
    expect(html).toContain('>E-SLD-001</text>');
    expect(html).toContain('>B</text>'); // {Rev1}: the newest issue
    expect(html).toContain('>Issued for approval</text>');
    expect(html).toContain('>A</text>'); // {Rev2}
  });

  it('a border without revision rows of its own gets the app\'s revision table in the column', () => {
    const html = buildSldSheetHtml(withBorder(noRows), svg, 'A3', { ...info, notes: ['A NOTE'], legendSvg: '<svg viewBox="0 0 100 20" data-h="20"></svg>' });
    expect(html).toContain('<div class="side">');
    expect(html).toMatch(/<div class="rvb"><table>.*Issued for approval.*<\/table><\/div>\s*<\/div>/s);
    expect(html).toMatch(/<div class="notes"><b>NOTES<\/b>.*<div class="rvb">/s); // the notes join the column, above the table
    // No column: the table stands over the body's bottom right corner.
    const bare = buildSldSheetHtml(withBorder(noRows), svg, 'A3', { ...info, notes: ['A NOTE'], abbreviations: [] });
    expect(bare).toContain('class="rvb"');
    expect(bare).toMatch(/class="notes" style="width:180mm;bottom:[\d.]+mm"/);
  });

  it('an A2 sheet of the same set keeps the app\'s frame, zones and band', () => {
    const html = buildSldSheetHtml(withBorder(border), svg, 'A2', info);
    expect(html).toContain('inset: 10mm 10mm 10mm 20mm; border: 0.7mm solid #000');
    expect(html).not.toContain('class="brd"');
    expect(html).toContain('class="zn zt"');
    expect(html).toContain('class="tb band"');
  });
});

describe('whole-border template: DXF, fit and plan layouts', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());

  it('writes the border as one block with attributes at the paper\'s origin; only the paper outline on E-FRAME', () => {
    const data = buildSheetDxf(withBorder(border), svg, 'A3', info);
    const all = entities(data);
    const ins = all.filter((e) => e.type === 'INSERT');
    expect(ins).toHaveLength(1);
    expect(ins[0].v.get(2)).toBe('TB_ACME_A3_BORDER');
    expect(Number(ins[0].v.get(10))).toBe(0);
    expect(Number(ins[0].v.get(20))).toBe(0);
    expect(Number(ins[0].v.get(41) ?? 1)).toBe(1);
    const rev = all.find((e) => e.type === 'ATTRIB' && e.v.get(2) === 'REV_1');
    expect(rev?.v.get(1)).toBe('B');
    expect(all.filter((e) => e.type === 'POLYLINE' && e.v.get(8) === 'E-FRAME')).toHaveLength(1);
    expect(all.filter((e) => e.type === 'TEXT' && e.v.get(8) === 'E-FRAME')).toHaveLength(0); // no zone references of the app's
    // The border without revision rows: the issues as lines of the column.
    const texts = entities(buildSheetDxf(withBorder(noRows), svg, 'A3', info)).filter((e) => e.type === 'TEXT').map((e) => e.v.get(1));
    expect(texts).toContain('REVISIONS');
    expect(texts.some((s) => /^B\s+.*Issued for approval/.test(s ?? ''))).toBe(true);
  });

  it('the fit and the plan\'s drawing area use the border\'s area, not the frame\'s', () => {
    const area = (size: string) => (size === 'A3' ? { w: 335, h: 277 } : undefined);
    expect(scaleOn('A3', 100, 100)).toBeCloseTo(2.29, 2);
    expect(scaleOn('A3', 100, 100, 0, 0, area)).toBeCloseTo(2.73, 2);
    expect(scaleOn('A2', 100, 100, 0, 0, area)).toBeCloseTo(scaleOn('A2', 100, 100), 6);
    expect(autoSize(1600, 1300, 0, 0.2, 0, area)).toMatchObject({ size: 'A3', fits: true });
    expect(drawingAreaMm(withBorder(border), 'A3')).toEqual({ w: 237, h: 274 });
    expect(drawingAreaMm(sampleProject, 'A3')).toEqual({ w: 292, h: 230 });
  });
});
