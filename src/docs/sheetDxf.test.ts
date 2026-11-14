import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { dxfExportProject } from '../../tests/fixtures/dxfExport';
import { FIRE_NOTE } from '../model/cableRefs';
import { standardTemplate } from '../model/titleBlock';
import type { Project } from '../types';
import { dxfText, toDxf, type DxfPrimitive } from './dxf';
import { svgToDxf } from '../diagram/exportSvg';
import { buildSheetDxf, buildSheetDxfPages } from './sheetDxf';
import { SHEET_MM } from './sldSheet';
import { dxfExportNotice, namedDxfFiles, uniqueDxfFiles } from './dxfFiles';
import { templateTitleBlockDxf } from './titleBlockDxf';

type Entity = { type: string; v: Map<number, string> };
function entities(data: string): Entity[] {
  const lines = data.trimEnd().split(/\r?\n/), result: Entity[] = [];
  let inside = false, current: Entity | undefined;
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]), value = lines[i + 1];
    if (code === 2 && value === 'ENTITIES') { inside = true; continue; }
    if (!inside) continue;
    if (code === 0 && value === 'ENDSEC') break;
    if (code === 0) { current = { type: value, v: new Map() }; result.push(current); }
    else current?.v.set(code, value);
  }
  return result;
}
const num = (e: Entity, code: number) => Number(e.v.get(code) ?? 0);
const textOf = (data: string, layer?: string) => entities(data).filter((e) => e.type === 'TEXT' && (!layer || e.v.get(8) === layer)).map((e) => e.v.get(1)).join(' ').replace(/\s+/g, ' ');
const svg = '<svg viewBox="0 0 400 160"><polyline class="ln" points="0,0 400,0 400,160 0,160 0,0"/><line class="bus" x1="10" y1="40" x2="390" y2="40"/><text x="20" y="70" style="font-size:10px" data-dxf-width="120">MDB ACB CT XLPE</text></svg>';
const OLD_NOTES_PAGES = 6; // the 400 notes of the test below took 6 sheets at the old size
const info = { no: 'E-SLD-01', title: 'Single line diagram', index: 1, count: 1 };

function expectPaperBounds(data: string, w: number, h: number) {
  expect(data).not.toMatch(/NaN|Infinity/);
  for (const e of entities(data)) {
    if (e.type === 'TEXT') {
      const height = num(e, 40);
      expect(height).toBeGreaterThan(0);
      expect(num(e, 10)).toBeGreaterThanOrEqual(-0.001);
      expect(num(e, 10)).toBeLessThanOrEqual(w + 0.001);
      expect(num(e, 20) - height * 0.25).toBeGreaterThanOrEqual(-0.001);
      expect(num(e, 20) + height).toBeLessThanOrEqual(h + 0.001);
      if (e.v.has(11)) expect(num(e, 11)).toBeLessThanOrEqual(w + 0.001);
    } else {
      for (let j = 0; j < 4; j++) if (e.v.has(10 + j)) {
        expect(num(e, 10 + j)).toBeGreaterThanOrEqual(-0.001);
        expect(num(e, 10 + j)).toBeLessThanOrEqual(w + 0.001);
        expect(num(e, 20 + j)).toBeGreaterThanOrEqual(-0.001);
        expect(num(e, 20 + j)).toBeLessThanOrEqual(h + 0.001);
      }
    }
  }
  const edge = entities(data).filter((e) => e.type === 'VERTEX' && e.v.get(8) === 'E-FRAME').slice(0, 4);
  expect(edge.map((e) => [num(e, 10), num(e, 20)])).toEqual([[0, 0], [w, 0], [w, h], [0, h]]);
}

describe('complete paper-sized DXF sheets', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());

  it.each(['A4', 'A3', 'A2', 'A1'] as const)('keeps every sheet within %s paper, including dense schedules', (size) => {
    const cables = Array.from({ length: 300 }, (_, i) => ({ ref: i + 1, text: `Cable${i + 1} 4C 300mm2 Cu XLPE/SWA/PVC plus ECC conductor`, fireRated: i === 0 }));
    const project = { ...dxfExportProject, drawing: { ...dxfExportProject.drawing, abbreviations: true, notes: ['Keep every note visible.'] } };
    const pages = buildSheetDxfPages(project, svg, size, { ...info, cables });
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((p, i) => {
      expectPaperBounds(p.data, SHEET_MM[size].w, SHEET_MM[size].h);
      expect(p.index).toBe(i + 1); expect(p.count).toBe(pages.length); expect(p.continuation).toBe(i > 0);
      if (i) expect(textOf(p.data, 'E-NOTES')).toContain(`CONTINUATION ${i} OF ${pages.length - 1}`);
    });
    const content = pages.map((p) => textOf(p.data, 'E-LEGEND')).join(' ');
    const refs = [...content.matchAll(/\((\d+)\)/g)].map((m) => Number(m[1]));
    expect(refs).toEqual(cables.map((c) => c.ref));
    cables.forEach((c) => expect(content.match(new RegExp(`\\bCable${c.ref}\\b`, 'g'))).toHaveLength(1));
    expect(content).toContain(dxfText(FIRE_NOTE).replace(/\s+/g, ' '));
    expect(content).toContain('Current transformer');
    expect(content).toContain('Not to scale');
    expect(pages.map((p) => textOf(p.data, 'E-NOTES')).join(' ')).toContain('Keep every note visible.');
  });

  it('draws the sheet markups on top, on their own layers, within the paper', () => {
    const markups = [{ id: 'c', kind: 'cloud' as const, x: 30, y: 40, w: 80, h: 50, rev: 'A' }, { id: 't', kind: 'text' as const, x: 40, y: 120, text: 'CHECK SMDB-1 RATING', color: 'blue' as const }];
    const pages = buildSheetDxfPages(dxfExportProject, svg, 'A3', { ...info, markups });
    expectPaperBounds(pages[0].data, 420, 297);
    expect(textOf(pages[0].data, 'E-MARKUP-BLUE')).toContain('CHECK SMDB-1 RATING');
    expect(textOf(pages[0].data, 'E-MARKUP')).toContain('A');
    expect(pages[0].data).toContain('E-MARKUP-BLUE');
    expect(textOf(buildSheetDxfPages(dxfExportProject, svg, 'A3', info)[0].data, 'E-MARKUP-BLUE')).toBe('');
  });

  it('wraps long titles and revision descriptions without drawing beyond their cells', () => {
    const title = 'Electrical distribution drawing for the complete office refurbishment and plant extension';
    const description = `Description start ${'Check coordination and feeder connections. '.repeat(25)}Description end`;
    const pages = buildSheetDxfPages({ ...dxfExportProject, name: title }, svg, 'A3', { ...info, title, history: [{ id: 'A', date: '2026-10-04', description }] });
    pages.forEach((p) => expectPaperBounds(p.data, 420, 297));
    const text = pages.map((p) => textOf(p.data)).join(' ');
    expect(text).toContain(title);
    expect(text).toContain(description.trim());
    const titleTexts = entities(pages[0].data).filter((e) => e.type === 'TEXT' && e.v.get(8) === 'E-TITLE');
    expect(titleTexts.every((e) => e.v.get(72) === '5')).toBe(true);
  });

  it('reserves the sidebar for notes and keeps all diagram geometry to its left', () => {
    const notes = Array.from({ length: 40 }, (_, i) => `Note${i + 1}: verify this detailed requirement before installing the equipment and preserve this ending.`);
    const pages = buildSheetDxfPages({ ...dxfExportProject, drawing: { ...dxfExportProject.drawing, notes } }, svg, 'A4', info);
    const main = entities(pages[0].data);
    const divider = main.find((e) => e.type === 'LINE' && e.v.get(8) === 'E-LEGEND')!;
    const edge = num(divider, 10);
    for (const e of main.filter((e) => ['E-CABLE', 'E-BUSBAR', 'E-TEXT'].includes(e.v.get(8) ?? ''))) {
      for (let j = 0; j < 4; j++) if (e.v.has(10 + j)) expect(num(e, 10 + j)).toBeLessThan(edge);
    }
    const content = pages.map((p) => textOf(p.data, 'E-NOTES')).join(' ');
    notes.forEach((note, i) => {
      expect(content).toContain(note);
      expect(content.match(new RegExp(`\\bNote${i + 1}:`, 'g'))).toHaveLength(1);
    });
  });

  it('honours custom merged grids, alignment and sheet-specific parameters', () => {
    const custom = { id: 'custom', name: 'Custom', cols: [30, 50, 80], rows: [12, 14], cells: [
      { id: 'a', r: 0, c: 0, cs: 2, kind: 'text' as const, text: '{SheetNo}', caption: 'NUMBER', size: 8 },
      { id: 'b', r: 0, c: 2, kind: 'text' as const, text: '{SheetSize}', align: 'right' as const },
      { id: 'c', r: 1, c: 0, cs: 3, kind: 'text' as const, text: '{SheetTitle}', align: 'center' as const }
    ] };
    const project: Project = { ...dxfExportProject, titleTemplates: [custom], drawing: { ...dxfExportProject.drawing, titleTemplateId: custom.id } };
    const pages = buildSheetDxfPages(project, svg, 'A3', { ...info, no: 'CUSTOM-2', title: 'Template title' });
    const text = textOf(pages[0].data, 'E-TITLE');
    expect(text).toContain('CUSTOM-2'); expect(text).toContain('Template title'); expect(text).toContain('A3');
    expect(text).not.toContain('COMPANY / CONSULTANT');
    expectPaperBounds(pages[0].data, 420, 297);
    const result = templateTitleBlockDxf(custom, project, { x: 10, y: 10, w: 160, h: 26 }, { SheetNo: 'CUSTOM-2', SheetSize: 'A3', SheetTitle: 'Template title' }, []);
    expect(result.items.filter((p) => p.type === 'polyline')).toHaveLength(3);
    const right = result.items.find((p) => p.type === 'text' && p.text === 'A3')!;
    expect(right).toMatchObject({ align: 'right', x: 168.8 });
  });

  it('reports raster-logo handling and rejects broken custom grids explicitly', () => {
    const template = standardTemplate();
    const project: Project = { ...dxfExportProject, titleTemplates: [template], drawing: { ...dxfExportProject.drawing, titleTemplateId: template.id, logo: 'data:image/png;base64,AA==' } };
    const pages = buildSheetDxfPages(project, svg, 'A3', info);
    expect(textOf(pages[0].data, 'E-TITLE')).toContain('LOGO');
    expect(pages[0].warnings.join(' ')).toContain('LOGO placeholder');
    const invalid = { ...template, cols: [0, 45] };
    expect(() => templateTitleBlockDxf(invalid, project, { x: 0, y: 0, w: 100, h: 100 }, {}, [])).toThrow('positive row heights');
    expect(() => templateTitleBlockDxf({ ...template, cells: [template.cells[0], template.cells[0]] }, project, { x: 0, y: 0, w: 180, h: 58 }, {}, [])).toThrow('overlap');
  });

  it('joins the band along the foot: legend column, revisions and title block meet, and no line is drawn twice', () => {
    const history = Array.from({ length: 4 }, (_, i) => ({ id: 'ABCD'[i], date: `2026-10-0${i + 1}`, description: `Issue ${i + 1}` }));
    const one = { ...info, legendSvg: '<svg viewBox="0 0 10 10"></svg>', history };
    const linesOf = (data: string) => entities(data).filter((e) => e.type === 'LINE').map((e) => ({ layer: e.v.get(8), x1: num(e, 10), y1: num(e, 20), x2: num(e, 11), y2: num(e, 21) }));
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const frame = { x: 20, y: 10, w: 390, h: 277 };
    const rowsAt = (lines: ReturnType<typeof linesOf>, x1: number, x2: number) => lines.filter((l) => l.layer === 'E-TITLE' && near(l.y1, l.y2) && near(l.x1, x1) && near(l.x2, x2)).map((l) => l.y1);
    const onFrame = (l: ReturnType<typeof linesOf>[number]) => (near(l.y1, l.y2) && [frame.y, frame.y + frame.h].some((y) => near(l.y1, y)))
      || (near(l.x1, l.x2) && [frame.x, frame.x + frame.w].some((x) => near(l.x1, x)));

    // The standard block: one line along the band's top, the revisions' lines running on into the block's rows.
    const [page] = buildSheetDxfPages(dxfExportProject, svg, 'A3', one);
    const lines = linesOf(page.data), tbx = frame.x + frame.w - 180;
    const top = rowsAt(lines, frame.x, frame.x + frame.w);
    expect(top).toHaveLength(1);
    const column = lines.find((l) => l.layer === 'E-LEGEND' && near(l.x1, l.x2))!;
    expect(column.y1).toBeCloseTo(top[0], 2);
    expect(column.y2).toBeCloseTo(frame.y + frame.h, 2);
    const titleRows = rowsAt(lines, tbx, tbx + 180), revRows = rowsAt(lines, frame.x, tbx);
    expect(titleRows).toHaveLength(5);
    expect(revRows).toHaveLength(5); // under the header and under each of the four revisions
    for (const y of revRows) expect(titleRows.some((t) => near(t, y)), String(y)).toBe(true);
    expect(lines.filter((l) => near(l.x1, tbx) && near(l.x2, tbx))).toHaveLength(1); // the block's left edge, once
    expect(lines.filter((l) => l.layer !== 'E-FRAME' && onFrame(l))).toEqual([]);
    expect(entities(page.data).filter((e) => e.type === 'POLYLINE' && e.v.get(8) === 'E-TITLE')).toHaveLength(0);

    // A template lower than the revision table: the table stands taller, closed above the template, and the legend
    // column comes down to the template's top.
    const low = { id: 'low', name: 'Low', cols: [180], rows: [8, 8], cells: [{ id: 'a', r: 0, c: 0, kind: 'text' as const, text: '{Project}', size: 8 }, { id: 'b', r: 1, c: 0, kind: 'text' as const, text: '{DrawingNo}', size: 8 }] };
    const withLow: Project = { ...dxfExportProject, titleTemplates: [low], drawing: { ...dxfExportProject.drawing, titleTemplateId: low.id } };
    const short = linesOf(buildSheetDxfPages(withLow, svg, 'A3', one)[0].data);
    const bandTop = rowsAt(short, frame.x, tbx)[0], templateTop = frame.y + 16;
    expect(bandTop).toBeGreaterThan(templateTop + 1);
    const side = short.find((l) => near(l.x1, tbx) && near(l.x2, tbx))!;
    expect([side.y1, side.y2].map((v) => +v.toFixed(2))).toEqual([templateTop, +bandTop.toFixed(2)]);
    expect(short.find((l) => l.layer === 'E-LEGEND' && near(l.x1, l.x2))!.y1).toBeCloseTo(templateTop, 2);
  });

  it('preserves values from tiny custom cells at a readable size in additional information', () => {
    const template = { id: 'tiny', name: 'Tiny', cols: [180], rows: [1], cells: [{ id: 'number', r: 0, c: 0, kind: 'text' as const, text: '{DrawingNo}', size: 8 }] };
    const project: Project = { ...dxfExportProject, titleTemplates: [template], drawing: { ...dxfExportProject.drawing, titleTemplateId: template.id } };
    const pages = buildSheetDxfPages(project, svg, 'A3', { ...info, no: 'CAD-TINY-01', history: Array.from({ length: 4 }, (_, i) => ({ id: String(i), date: '2026-10-04', description: `Issued revision ${i}` })) });
    expect(pages[0].warnings.join(' ')).toContain('title-block cells are too small');
    const value = entities(pages[0].data).find((e) => e.type === 'TEXT' && e.v.get(8) === 'E-NOTES' && e.v.get(1)?.includes('CAD-TINY-01'))!;
    expect(num(value, 40)).toBeGreaterThanOrEqual(1.5);
    for (let i = 0; i < 4; i++) expect(textOf(pages[0].data, 'E-TITLE')).toContain(`Issued revision ${i}`);
    pages.forEach((p) => expectPaperBounds(p.data, 420, 297));
  });

  it('uses short references in narrow custom cells and the sheet revision description', () => {
    const template = { id: 'narrow', name: 'Narrow', cols: [4, 156], rows: [12], cells: [
      { id: 'a', r: 0, c: 0, kind: 'text' as const, text: '{DrawingNo}', size: 8 },
      { id: 'b', r: 0, c: 1, kind: 'text' as const, text: '{RevDescription}', size: 8 }
    ] };
    const project: Project = { ...dxfExportProject, titleTemplates: [template], drawing: { ...dxfExportProject.drawing, titleTemplateId: template.id } };
    const pages = buildSheetDxfPages(project, svg, 'A3', { ...info, history: [{ id: 'B', date: '2026-10-04', description: 'Sheet revision description' }] });
    expect(textOf(pages[0].data, 'E-TITLE')).toContain('Sheet revision description');
    expect(textOf(pages[0].data, 'E-NOTES')).toContain(`[1] Title cell 1/1: ${info.no}`);
    const result = templateTitleBlockDxf(template, project, { x: 0, y: 0, w: 160, h: 12 }, { DrawingNo: info.no, RevDescription: 'Sheet revision description' }, []);
    const marker = result.items.find((p) => p.type === 'text' && p.text === '1')!;
    expect(marker).toBeDefined();
    expect(result.items.some((p) => p.type === 'text' && p.text.includes('additional information'))).toBe(false);
    pages.forEach((p) => expectPaperBounds(p.data, 420, 297));
  });

  it('splits a paragraph that nearly fills a column after its continued heading', () => {
    const notes = ['One short note.', 'requirement '.repeat(294)];
    const project = { ...dxfExportProject, drawing: { ...dxfExportProject.drawing, notes } };
    const source = '<svg viewBox="0 0 400 160"><line x1="10" y1="10" x2="100" y2="100"/></svg>';
    const pages = buildSheetDxfPages(project, source, 'A4', { ...info, no: 'CAD-01', title: 'Check' });
    const content = pages.map((p) => textOf(p.data, 'E-NOTES')).join(' ');
    expect(content.match(/\brequirement\b/g)).toHaveLength(294);
    expect(content).toContain('One short note.');
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((p) => expectPaperBounds(p.data, 297, 210));
  });

  it('retains overflow for legacy single-file callers and names every ZIP file uniquely', () => {
    const cables = Array.from({ length: 100 }, (_, i) => ({ ref: i + 1, text: `Entry${i + 1} cable construction and conductor description` }));
    const pages = buildSheetDxfPages(dxfExportProject, svg, 'A4', { ...info, cables });
    const combined = buildSheetDxf(dxfExportProject, svg, 'A4', { ...info, cables });
    expect(textOf(combined, 'E-LEGEND')).toContain('Entry100');
    expect(entities(combined).some((e) => num(e, 10) > 297)).toBe(true);
    const files = uniqueDxfFiles([...namedDxfFiles('SLD-1', pages), ...namedDxfFiles('SLD-1', pages)]);
    expect(new Set(files.map((f) => f.name)).size).toBe(files.length);
    expect(files[1].name).toBe('SLD-1_continuation_1.dxf');
    expect(dxfExportNotice(files)).toContain('continuation sheets included');
  });

  it('normalizes nonzero viewBox origins and rejects invalid sizes before export', () => {
    const source = '<svg viewBox="100 50 400 160"><polyline class="ln" points="100,50 500,50 500,210 100,210"/></svg>';
    expectPaperBounds(buildSheetDxfPages(dxfExportProject, source, 'A4', info)[0].data, 297, 210);
    expect(() => buildSheetDxfPages(dxfExportProject, '<svg viewBox="0 0 0 160"/>', 'A4', info)).toThrow('invalid SVG viewBox');
  });
});

describe('legend column text at 2.5 mm', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());
  it('writes the legend at the scale it was drawn for (10.5 px labels → 1.8 mm cap height, 2.5 mm text) and the schedule at 2.5 mm', () => {
    // A legend drawn for the 88 mm inner column: 4.2 px per mm, one label at 10.5 px.
    const legend = '<svg viewBox="0 0 369.6 66" data-w="369.6" data-h="66"><text x="64" y="53" style="font-size:10.5px">Busbar</text></svg>';
    const data = buildSheetDxf(dxfExportProject, svg, 'A3', { ...info, legendSvg: legend, cables: [{ ref: 1, text: '4C × 70 mm² XLPE/SWA/PVC Cu' }] });
    const texts = entities(data).filter((e) => e.type === 'TEXT');
    const busbar = texts.find((e) => e.v.get(1) === 'Busbar')!;
    expect(num(busbar, 40)).toBeCloseTo(10.5 * 0.72 / 4.2, 2); // 1.8 mm: the DXF height of 2.5 mm text
    const schedule = texts.find((e) => e.v.get(1)?.includes('4C'))!;
    expect(num(schedule, 40)).toBeCloseTo(2.5 * 0.716, 6); // the PDF's 2.5 mm font, as capitals: they match the legend's
  });
  it('sets the column in capitals of 0.716 of the PDF font at its 3.6 mm line pitch', () => {
    const cables = [1, 2, 3].map((ref) => ({ ref, text: `4C x 70 mm2 XLPE ${ref}` }));
    const rows = (textMm?: 2.5 | 3.5) => entities(buildSheetDxf(dxfExportProject, svg, 'A3', { ...info, cables, ...(textMm ? { furniture: { textMm } } : {}) }))
      .filter((e) => e.type === 'TEXT' && e.v.get(1)?.includes('4C')).map((e) => ({ h: num(e, 40), y: num(e, 20) }));
    const base = rows();
    expect(base).toHaveLength(3);
    base.forEach((r) => expect(r.h).toBeCloseTo(1.79, 2));
    expect(base[0].y - base[1].y).toBeCloseTo(3.6, 6);
    expect(base[1].y - base[2].y).toBeCloseTo(3.6, 6);
    const big = rows(3.5);
    big.forEach((r) => expect(r.h).toBeCloseTo(2.51, 2));
    expect(big[0].y - big[1].y).toBeCloseTo(3.6 * 3.5 / 2.5, 6);
  });
  it('a long notes list needs no more continuation sheets than at the old size', () => {
    const notes = Array.from({ length: 400 }, (_, i) => `Note ${i + 1}: the contractor shall coordinate all works on site with the other trades before installation.`);
    const project = { ...dxfExportProject, drawing: { ...dxfExportProject.drawing, notes } };
    const pages = buildSheetDxfPages(project, svg, 'A3', info);
    expect(pages.length).toBeLessThanOrEqual(OLD_NOTES_PAGES);
  });
});

describe('sheet furniture in DXF', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());
  it('zone references and centring marks on E-FRAME, only when asked', () => {
    const plain = buildSheetDxf(dxfExportProject, svg, 'A3', info);
    expect(textOf(plain, 'E-FRAME')).toBe('');
    const data = buildSheetDxf(dxfExportProject, svg, 'A3', { ...info, furniture: { zones: 'all', centring: true } });
    const texts = entities(data).filter((e) => e.type === 'TEXT' && e.v.get(8) === 'E-FRAME').map((e) => e.v.get(1));
    expect(texts.filter((t) => /^\d+$/.test(t!))).toHaveLength(16); // 1–8 top and bottom
    expect(texts.filter((t) => /^[A-Z]$/.test(t!))).toHaveLength(12); // A–F each side
    expect(texts).toContain('8');
    expect(texts).not.toContain('9');
    // The four centring marks are 0.7 mm wide: a line with a width is written as a filled SOLID strip.
    const solids = (d: string) => entities(d).filter((e) => e.v.get(8) === 'E-FRAME' && e.type === 'SOLID').length;
    expect(solids(data)).toBe(solids(plain) + 4);
    expectPaperBounds(data, SHEET_MM.A3.w, SHEET_MM.A3.h);
  });
  it('the column\'s text follows the set\'s 3.5 mm', () => {
    const data = buildSheetDxf(dxfExportProject, svg, 'A3', { ...info, cables: [{ ref: 1, text: '4C × 70 mm² XLPE' }], furniture: { textMm: 3.5 } });
    const row = entities(data).find((e) => e.type === 'TEXT' && e.v.get(1)?.includes('4C'))!;
    expect(num(row, 40)).toBeCloseTo(3.5 * 0.716, 6);
  });
});

describe('revision rows in DXF', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());
  it('8 fixed lines pad the issues with blank rows and keep every text on the paper', () => {
    const history = [{ id: 'A', date: '2026-10-01', description: 'Issue 1' }, { id: 'B', date: '2026-10-02', description: 'Issue 2' }];
    const data = buildSheetDxf(dxfExportProject, svg, 'A3', { ...info, history, furniture: { revRows: 8 } });
    const titles = entities(data).filter((e) => e.type === 'TEXT' && e.v.get(8) === 'E-TITLE').map((e) => e.v.get(1));
    expect(titles).toContain('Issue 2');
    // Eight lines of (44 - 5) / 8 mm under the 5 mm header: eight ruled lines across the revision area besides the header's.
    const rules = entities(data).filter((e) => e.type === 'LINE' && e.v.get(8) === 'E-TITLE' && num(e, 10) === 20 && Math.abs(num(e, 20) - num(e, 21)) < 1e-6);
    expect(rules.length).toBeGreaterThanOrEqual(8);
    expectPaperBounds(data, SHEET_MM.A3.w, SHEET_MM.A3.h);
  });
});

describe('legend strip in DXF', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());
  it('places the legend along the foot of the drawing area and the drawing above it', () => {
    const legend = '<svg viewBox="0 0 1234.8 150" data-w="1234.8" data-h="150"><text x="64" y="53" style="font-size:10.5px">Busbar</text></svg>';
    const data = buildSheetDxf(dxfExportProject, svg, 'A3', { ...info, legendSvg: legend, legendStrip: true });
    const texts = entities(data).filter((e) => e.type === 'TEXT');
    const busbar = texts.find((e) => e.v.get(1) === 'Busbar')!, diagram = texts.find((e) => e.v.get(1) === 'MDB ACB CT XLPE')!;
    expect(num(busbar, 40)).toBeCloseTo(10.5 * 0.72 / 4.2, 2); // still 2.5 mm text
    expect(num(busbar, 20)).toBeLessThan(num(diagram, 20)); // below the drawing
    expect(num(busbar, 20)).toBeGreaterThan(10 + 44); // above the band
    expectPaperBounds(data, SHEET_MM.A3.w, SHEET_MM.A3.h);
  });
});

describe('legend sheet and schedule table in DXF', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());
  it('the legend sheet: the legend across the top, abbreviations and notes in columns under it, nothing drawn', () => {
    const legend = '<svg viewBox="0 0 1600 120" data-w="1600" data-h="120"><text x="64" y="53" style="font-size:10.5px">Busbar</text></svg>';
    const data = buildSheetDxf({ ...dxfExportProject, drawing: { ...dxfExportProject.drawing, notes: ['GENERAL NOTE ONE.'] } }, '', 'A3', { ...info, legendSvg: legend, legendSheet: true, abbreviations: [['ACB', 'Air circuit breaker']] });
    const texts = entities(data).filter((e) => e.type === 'TEXT');
    const busbar = texts.find((e) => e.v.get(1) === 'Busbar')!, abbr = texts.find((e) => e.v.get(1)?.startsWith('ACB'))!, note = texts.find((e) => e.v.get(1)?.includes('GENERAL NOTE'))!;
    expect(num(busbar, 20)).toBeGreaterThan(num(abbr, 20)); // the legend above the abbreviations
    expect(note).toBeDefined();
    expect(texts.some((e) => e.v.get(1) === 'MDB ACB CT XLPE')).toBe(false); // no drawing
    expectPaperBounds(data, SHEET_MM.A3.w, SHEET_MM.A3.h);
  });
  it('a table under the drawing: its title, head and rows as text, the drawing above it', () => {
    const table = { title: 'LOAD DISTRIBUTION SCHEDULE — DB-1', lines: ['DB: DB-1 — Ground floor'], head: ['Sl.', 'Cct', 'Room / area', 'R (W)'], rows: [['1', 'R1', 'Kitchen', '600'], ['2', 'Y1', 'Lounge', '400']], foot: [['', '', 'TOTAL (W)', '1000']], widths: [3, 4, 14, 5], left: [2] };
    const data = buildSheetDxf(dxfExportProject, svg, 'A3', { ...info, table });
    const texts = entities(data).filter((e) => e.type === 'TEXT');
    const kitchen = texts.find((e) => e.v.get(1) === 'Kitchen')!, title = texts.find((e) => e.v.get(1)?.startsWith('LOAD DISTRIBUTION'))!, diagram = texts.find((e) => e.v.get(1) === 'MDB ACB CT XLPE')!;
    expect(kitchen).toBeDefined();
    expect(num(title, 20)).toBeGreaterThan(num(kitchen, 20));
    expect(num(diagram, 20)).toBeGreaterThan(num(title, 20));
    expect(num(kitchen, 20)).toBeGreaterThan(10 + 44);
    expect(num(kitchen, 40)).toBeCloseTo(2.5 * 0.716, 6); // the PDF's 2.5 mm font; the cells no longer shrink to 0.9
    expect(num(title, 40)).toBeCloseTo(2.5 * 0.716, 6);
    expectPaperBounds(data, SHEET_MM.A3.w, SHEET_MM.A3.h);
  });
});

describe('standard title block text in DXF', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());
  it('prints its captions, values, title and revision table at 0.716 of the PDF font sizes', () => {
    const px = 25.4 / 96;
    const data = buildSheetDxf(dxfExportProject, svg, 'A3', { ...info, cables: [{ ref: 1, text: '4C' }] });
    const heights = new Set(entities(data).filter((e) => e.type === 'TEXT' && e.v.get(8) === 'E-TITLE').map((e) => +num(e, 40).toFixed(2)));
    for (const font of [6.5 * px, 9.5 * px, 13 * px, 7 * px, 2.5]) expect(heights).toContain(+(font * 0.716).toFixed(2));
  });
});

describe('drawn title block on a DXF sheet', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());
  it('inserts the company block with the sheet\'s values as attributes, inside the paper', () => {
    const drawn = { id: 'tb-d', name: 'ACME', kind: 'drawn' as const, cols: [], rows: [], cells: [], size: { w: 180, h: 44 }, shapes: [{ kind: 'line' as const, x1: 0, y1: 0, x2: 180, y2: 0 }], texts: [{ id: 't1', x: 100, y: 40, h: 3.5, text: '{SheetNo}', tag: 'DWG_NO' }] };
    const p: Project = { ...dxfExportProject, titleTemplates: [drawn], drawing: { ...dxfExportProject.drawing, titleTemplateId: 'tb-d' } };
    const data = buildSheetDxf(p, svg, 'A3', info);
    const ins = entities(data).find((e) => e.type === 'INSERT')!;
    expect(ins).toBeDefined();
    expect(ins.v.get(2)).toBe('TB_ACME');
    expect(num(ins, 10)).toBeCloseTo(410 - 180, 6); // the frame's right edge less the block
    expect(num(ins, 20)).toBe(10);
    const attrib = entities(data).find((e) => e.type === 'ATTRIB')!;
    expect(attrib.v.get(2)).toBe('DWG_NO');
    expect(attrib.v.get(1)).toBe('E-SLD-01');
    expect(data).toContain('\r\n0\r\nBLOCK\r\n');
    expectPaperBounds(data, SHEET_MM.A3.w, SHEET_MM.A3.h);
  });
});

describe('dashed linetypes and rounded corners in sheet DXF', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());
  const body = (inner: string) => `<svg viewBox="0 0 400 160">${inner}</svg>`;
  const sheet = (inner: string) => buildSheetDxf(dxfExportProject, body(inner), 'A3', info);
  const drawn = (data: string) => entities(data).filter((e) => e.v.get(8) !== 'E-FRAME' && e.v.get(8) !== 'E-TITLE' && e.v.get(8) !== 'E-NOTES' && e.v.get(8) !== 'E-LEGEND');

  it('writes one entity per dashed line, rectangle and circle, named by its length on paper', () => {
    const data = sheet('<g stroke-dasharray="5 4"><line class="ln" x1="10" y1="20" x2="300" y2="20"/><line class="ln" x1="10" y1="30" x2="11" y2="30"/>'
      + '<rect x="10" y="50" width="200" height="80"/><circle cx="350" cy="30" r="2"/><circle cx="350" cy="90" r="30"/></g>');
    const e = drawn(data);
    expect(e.filter((x) => x.type === 'LINE').map((x) => x.v.get(6))).toEqual(['LV-DASHED', 'LV-DASHED2']);
    expect(e.filter((x) => x.type === 'CIRCLE').map((x) => x.v.get(6))).toEqual(['LV-DASHED2', 'LV-DASHED']);
    const poly = e.filter((x) => x.type === 'POLYLINE');
    expect(poly).toHaveLength(1);
    expect(poly[0].v.get(6)).toBe('LV-DASHED');
    expect(num(poly[0], 70)).toBe(129); // closed + pattern continuous round the vertices
    expect(e.filter((x) => x.type === 'VERTEX')).toHaveLength(4);
  });

  it('keeps dash pieces inside library symbols and for wide busbars', () => {
    const data = sheet('<g class="iec" stroke-dasharray="5 4"><line x1="10" y1="20" x2="300" y2="20"/></g>'
      + '<line class="bus" stroke-dasharray="20 10" style="stroke-width:4px" x1="10" y1="60" x2="300" y2="60"/>');
    const e = drawn(data);
    expect(data).not.toContain('LV-DASHED');
    expect(e.filter((x) => x.type === 'POLYLINE').length).toBeGreaterThan(10);
    expect(e.filter((x) => x.type === 'SOLID').length).toBeGreaterThan(5);
    expect(data).not.toContain('$LTSCALE');
  });

  it('defines exactly the linetypes in use, with their dash and gap lengths', () => {
    const lines = sheet('<line class="ln" stroke-dasharray="5 4" x1="10" y1="20" x2="300" y2="20"/><line class="ln" stroke-dasharray="5 4" x1="10" y1="30" x2="11" y2="30"/>').split('\r\n');
    const at = lines.indexOf('LV-DASHED');
    expect(lines.slice(at - 3, at + 15)).toEqual(['0', 'LTYPE', '2', 'LV-DASHED', '70', '0', '3', 'Dashed', '72', '65', '73', '2', '40', '4.5', '49', '3', '49', '-1.5']);
    expect(lines.slice(lines.indexOf('LV-DASHED2') + 7, lines.indexOf('LV-DASHED2') + 15)).toEqual(['73', '2', '40', '2.25', '49', '1.5', '49', '-0.75']);
    expect(lines.slice(lines.indexOf('LTYPE') + 1, lines.indexOf('LTYPE') + 3)).toEqual(['70', '3']);
    expect(lines).toContain('$LTSCALE');
  });

  it('writes rounded rectangles as bulged polylines whose corners bow outward', () => {
    const solid = svgToDxf('<svg><rect x="10" y="10" width="40" height="20" rx="4"/></svg>', 100);
    const p = solid[0] as Extract<DxfPrimitive, { type: 'polyline' }>;
    expect(p.points).toHaveLength(8);
    expect(p.bulges?.filter(Boolean)).toHaveLength(4);
    const cx = 30, cy = 80;
    p.bulges!.forEach((b, i) => {
      if (!b) return;
      const a = p.points[i], c = p.points[(i + 1) % 8];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      // a positive bulge bows to the right of the chord, a negative one to its left
      const sag = (b * len) / 2, side: [number, number] = [(c[1] - a[1]) / len, -(c[0] - a[0]) / len];
      const mid = [(a[0] + c[0]) / 2 + side[0] * sag, (a[1] + c[1]) / 2 + side[1] * sag];
      const chordMid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      expect(Math.hypot(mid[0] - cx, mid[1] - cy)).toBeGreaterThan(Math.hypot(chordMid[0] - cx, chordMid[1] - cy));
      expect(Math.abs(b)).toBeCloseTo(Math.tan(Math.PI / 8), 6);
    });
    const dxf = toDxf(solid);
    expect(dxf).toContain('\r\n42\r\n');
    expect(dxf).not.toContain('LV-DASHED');
    // a mirrored transform reverses the arcs
    const mirrored = svgToDxf('<svg><rect transform="scale(-1 1)" x="-50" y="10" width="40" height="20" rx="4"/></svg>', 100)[0] as typeof p;
    expect(Math.sign(mirrored.bulges![1])).toBe(-Math.sign(p.bulges![1]));
  });

  it('keeps the bulges when a rounded dashed rectangle is placed on the sheet', () => {
    const data = sheet('<rect x="10" y="10" width="200" height="80" rx="6" stroke-dasharray="6 4"/>');
    const e = drawn(data);
    expect(e.filter((x) => x.type === 'POLYLINE')).toHaveLength(1);
    expect(e.filter((x) => x.type === 'VERTEX')).toHaveLength(8);
    expect(e.filter((x) => x.type === 'VERTEX' && x.v.has(42))).toHaveLength(4);
  });
});
