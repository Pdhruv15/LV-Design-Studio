import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { dxfExportProject } from '../../tests/fixtures/dxfExport';
import { FIRE_NOTE } from '../model/cableRefs';
import { standardTemplate } from '../model/titleBlock';
import type { Project } from '../types';
import { dxfText } from './dxf';
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
    expect(num(schedule, 40)).toBeCloseTo(2.5, 6);
  });
});
