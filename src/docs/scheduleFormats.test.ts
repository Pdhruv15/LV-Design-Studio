import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { sampleProject } from '../data/sampleProject';
import { newBuilding } from '../calc/building';
import { generateBuildingDbs } from '../calc/buildingDesign';
import { emptyTrayPlan, sizeAll } from '../calc/cableTray';
import { evaluateFeeder } from '../calc/electrical';
import { scheduleCircuits } from '../calc/loadSchedule';
import { boardSummary } from '../calc/summary';
import { issueBoqRevision, numberBom } from '../model/boqRevisions';
import { newPriceList, priceBom } from '../model/priceList';
import { issueRevision, revisionStamp } from '../model/revisions';
import type { DrawingSet } from '../model/drawingSet';
import { saveVariation } from '../model/variations';
import type { Project, TrayPlan } from '../types';
import { fmtFixed } from '../util/format';
import { buildBom } from '../calc/bom';
import { printDocs } from '../../tests/fixtures/printDocs';
import { buildBoqHtml, buildBoqWorkbook } from './boqWorkbook';
import { buildingSummaryHtml, buildingSummaryWorkbook } from './buildingSummary';
import { buildDmFormHtml } from './dmForm';
import { registerHtml } from './drawingRegister';
import { buildFormWorkbook } from './formWorkbook';
import { buildLoadScheduleHtml, loadScheduleCsv, loadScheduleRows } from './loadScheduleDoc';
import { buildRegisterWorkbook, buildTransmittalWorkbook } from './registerWorkbook';
import { cableSchedule, csvRows, equipmentSchedule } from './schedules';
import { scheduleHtml, workbookHtml, worksheetHtml } from './sheetPdf';
import { buildSubmissionRegisterHtml, buildSubmissionWorkbook } from './submissionReport';
import { buildTrayReportHtml } from './trayReport';
import { buildTrayWorkbook } from './trayWorkbook';
import { buildVariationHtml, buildVariationWorkbook } from './variationReport';

/** The sample with its loads ×40, so thousands show. */
const project: Project = issueRevision({ ...sampleProject, feeders: sampleProject.feeders.map((f) => ({ ...f, loadKw: f.loadKw * 40 })) }, { description: 'First issue', date: '2026-10-15', by: 'QA' });
const incomer = project.feeders.find((f) => f.id === 'INC-GF')!;
const cellsOf = (ws: ExcelJS.Worksheet) => { const out: ExcelJS.Cell[] = []; ws.eachRow((row) => row.eachCell((c) => { out.push(c); })); return out; };

describe('cable and equipment schedules', () => {
  const cable = cableSchedule(project);
  const row = cable.rows.find((r) => r[0] === `C-${incomer.id}`)!;
  const r = evaluateFeeder(project, incomer);
  const col = (h: string) => cable.headers.indexOf(h);

  it('print the same current and voltage drop as the reports', () => {
    expect(String(row[col('Ib (A)')])).toBe(fmtFixed(r.ib, 1));
    expect(String(row[col('Ib (A)')])).toMatch(/,/);
    expect(String(row[col('Iz (A)')])).toBe(fmtFixed(r.ampacity, 1));
    expect(String(row[col('Vd cable (%)')])).toBe(fmtFixed(r.vdPct, 2));
    expect(String(row[col('Vd total (%)')])).toBe(fmtFixed(r.vdTotalPct, 2));
    expect(scheduleHtml(project, cable, 'Cable schedule')).toContain(`<td>${fmtFixed(r.ib, 1)}</td>`);
  });

  it('keep ratings and lengths as written', () => {
    expect(row[col('Breaker In (A)')]).toBe(incomer.breakerRatingA);
    expect(row[col('Length (m)')]).toBe(incomer.lengthM);
    const mdb = equipmentSchedule(project).rows.find((x) => x[0] === 'MDB-1')!;
    expect(mdb[3]).toBe('1600 A');
  });

  it('print the fault level to 2 decimals', () => {
    const eq = equipmentSchedule(project);
    const mdb = eq.rows.find((x) => x[0] === 'MDB-1')!;
    const fault = boardSummary(project, project.boards.find((b) => b.id === 'MDB-1')!).faultKA;
    expect(String(mdb[eq.headers.indexOf('Fault level (kA)')])).toBe(fmtFixed(fault, 2));
  });

  it('a CSV holds plain numbers, so a spreadsheet reads them', () => {
    const csv = csvRows(cable).find((x) => x[0] === `C-${incomer.id}`)!;
    expect(csv[col('Ib (A)')]).toBe(Number(r.ib.toFixed(1)));
    expect(csv[col('Vd cable (%)')]).toBe(Number(r.vdPct.toFixed(2)));
    expect(csv.every((c) => typeof c !== 'object')).toBe(true);
  });
});

describe('DEWA load forms', () => {
  const wb = buildFormWorkbook(project);
  const summary = wb.getWorksheet('MDB-1 LOAD SUMMARY')!;
  const titles = (row: number) => { const out: string[] = []; summary.getRow(row).eachCell((c) => { out.push(String(c.value)); }); return out; };

  it('keep loads as real numbers in Excel, shown with a comma and 2 decimals', () => {
    expect(titles(5)).toContain('R-PH kW');
    const loads = cellsOf(summary).filter((c) => c.numFmt === '#,##0.00');
    expect(loads.length).toBeGreaterThan(20);
    for (const c of loads) expect(typeof c.value).toBe('number');
    expect(Math.max(...loads.map((c) => c.value as number))).toBeGreaterThan(1000);
  });

  it('print in the PDF what Excel shows', () => {
    const html = worksheetHtml(summary);
    const biggest = Math.max(...cellsOf(summary).filter((c) => c.numFmt === '#,##0.00').map((c) => c.value as number));
    expect(html).toContain(`>${fmtFixed(biggest, 2)}<`);
    expect(html).toMatch(/TOTAL CONNECTED LOAD : {2}\d{1,3}(,\d{3})*\.\d\d {2}KW/);
    expect(workbookHtml(project, wb, 'Forms')).toContain(fmtFixed(biggest, 2));
  });

  it('write every total and the demand factor the same way on the TCL summary', () => {
    const tx = wb.getWorksheet('TCL SUMMARY')!;
    const shown = cellsOf(tx).filter((c) => c.numFmt === '#,##0.00');
    expect(shown.length).toBeGreaterThan(10);
    for (const c of shown) expect(typeof c.value).toBe('number');
    expect(worksheetHtml(tx)).toMatch(/>\d{1,3}(,\d{3})+\.\d\d</);
    expect(worksheetHtml(tx)).toMatch(/>0\.\d\d</);
  });

  it('leave a number with no format of ours as it was', () => {
    const ws = new ExcelJS.Workbook().addWorksheet('x');
    ws.getCell(1, 1).value = 1234.5;
    ws.getCell(2, 1).value = 1234.5;
    ws.getCell(2, 1).numFmt = '#,##0.##';
    ws.getCell(3, 1).value = 1234.5;
    ws.getCell(3, 1).numFmt = '#,##0.00';
    const html = worksheetHtml(ws);
    expect(html.match(/>1234\.5</g)).toHaveLength(2);
    expect(html).toContain('>1,234.50<');
  });
});

describe('DB load schedules', () => {
  const board = project.boards.find((b) => scheduleCircuits(project, b.id).length)!;
  const { connectedW } = loadScheduleRows(project, board.id);

  it('print watts with a comma in the PDF', () => {
    const html = buildLoadScheduleHtml(project, board.id);
    const total = connectedW.R + connectedW.Y + connectedW.B;
    expect(total).toBeGreaterThan(999);
    expect(html).toContain(`<td class="l">${fmtFixed(total, 0)} W</td>`);
    expect(html).toContain(`<td class="shade">${fmtFixed(connectedW.R, 0)}</td>`);
  });

  it('keep watts as real numbers in Excel', () => {
    const ws = buildFormWorkbook(project, { boardIds: [board.id], forms: ['db'] }).worksheets[0];
    const watts = cellsOf(ws).filter((c) => c.numFmt === '#,##0');
    expect(watts.length).toBeGreaterThan(0);
    for (const c of watts) expect(typeof c.value).toBe('number');
    expect(worksheetHtml(ws)).toMatch(/>\d{1,3},\d{3}</);
  });

  it('a CSV keeps plain numbers', () => {
    const rows = loadScheduleCsv(project, board.id).rows;
    expect(rows[rows.length - 2][rows[0].length - 4]).toBe(Math.round(connectedW.R));
  });
});

describe('cable tray schedule', () => {
  const plan = { ...emptyTrayPlan(), routes: [{ id: 'r', name: 'A', lengthM: 20, fittings: { bends: 2 }, cables: [{ id: 'c', cores: 4, csaMm2: 95, qty: 2 }, { id: 'e', cores: 1, csaMm2: 50, qty: 1 }] }] } as unknown as TrayPlan;
  const results = sizeAll(project, plan);

  it('prints the weight to 2 decimals', () => {
    const html = buildTrayReportHtml(project, plan, results);
    expect(html).toContain(`cable weight ${fmtFixed(results[0].kgPerM, 2)} kg/m`);
    expect(html).toContain(`<td>${fmtFixed(results[0].lines[0].kgPerM, 2)}</td>`);
  });

  it('keeps the weight a real number in Excel', () => {
    const wb = buildTrayWorkbook(project, plan, results);
    const line = cellsOf(wb.getWorksheet('Tray schedule')!).filter((c) => c.numFmt === '#,##0.00');
    expect(line.map((c) => c.value)).toContain(Number(results[0].lines[0].kgPerM.toFixed(2)));
    const sum = cellsOf(wb.getWorksheet('Summary')!).filter((c) => c.numFmt === '#,##0.00');
    expect(sum.map((c) => c.value)).toContain(Number(results[0].kgPerM.toFixed(2)));
  });
});

describe('DM-D-013', () => {
  it('prints every dimension to 2 decimals, and leaves the regulation wording alone', () => {
    const html = buildDmFormHtml(project, [{ id: 'a', name: 'SS-1', type: 'conventional', transformers: 2 }]);
    expect(html).toContain('<td>3.70</td>');
    expect(html).toContain('<td>4.60</td>');
    expect(html).not.toMatch(/<td>\d+(\.\d)?<\/td>/);
  });
});

describe('building summary', () => {
  const b = { ...newBuilding('T1', 'Tower'), gfaM2: 1234.5, buaM2: 2000, riser: { fromBoardId: 'MDB-1', horizontalM: 20, perDbM: 10 } };
  b.levels = [{ id: 'G', name: 'Ground', kind: 'ground', heightM: 4.5, grossM2: 1234.5 }];
  const p = generateBuildingDbs({ ...sampleProject, building: { buildings: [b], rooms: [{ id: 'R1', buildingId: 'T1', levelId: 'G', name: 'Lobby', type: 'lobby', areaM2: 200 }], unitTypes: [] } } as unknown as Project, 'T1', 'MDB-1').project;

  it('prints areas to 2 decimals', () => {
    const html = buildingSummaryHtml(p, ['T1']);
    expect(html).toContain('<td>1,234.50 m²</td>');
    expect(html).toContain('<td>2,000.00 m²</td>');
    expect(html).toContain('<td class="n">1,234.50</td>');
    expect(html).toMatch(/TCL incl\. services [\d,]+\.\d\d kW/);
  });

  it('keeps areas real numbers in Excel, without rounding them', () => {
    const ws = buildingSummaryWorkbook(p, ['T1']).worksheets[0];
    expect(ws.getRow(3).getCell(6).value).toBe(1234.5);
    expect(ws.getRow(3).getCell(6).numFmt).toBe('#,##0.00');
    expect(ws.getRow(6).getCell(3).value).toBe(1234.5);
    expect(ws.getRow(6).getCell(3).numFmt).toBe('#,##0.00');
  });
});

describe('dates in registers and the BOQ', () => {
  const list = { ...newPriceList(), date: '2026-09-02', rates: { a: { rate: 10 } } };
  const base: Project = { ...sampleProject, priceList: list, boq: { vatPct: 5 }, boqRevisions: undefined, submissions: undefined, drawingSet: undefined };
  const bomOf = (p: Project) => numberBom(priceBom(buildBom(p), p.priceList, p.boq), p.boqRevisions);
  const issued = issueBoqRevision(base, bomOf(base), { description: 'Contract', date: '2026-09-01' }, 'AED');
  const withVo = saveVariation(issued, { id: 'VO-001', title: 'Change', raised: '2026-10-01', submitted: '2026-10-02', decided: '2026-10-05', status: 'approved', lines: [] });

  it('the BOQ writes no leading zero and no ISO date', () => {
    const html = buildBoqHtml(issued, bomOf(issued), issued.priceList);
    expect(html).toContain('1 Sep 2026');
    expect(html).not.toMatch(/\b0\d (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}/);
    expect(html).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    const text = cellsOf(buildBoqWorkbook(issued, bomOf(issued), issued.priceList).worksheets[0]).map((c) => String(c.value)).join(' ');
    expect(text).toContain('2 Sep 2026');
    expect(text).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
  });

  it('the variation register shows real dates in Excel', () => {
    expect(buildVariationHtml(withVo, { date: '2026-11-01' })).toContain('5 Oct 2026');
    const ws = buildVariationWorkbook(withVo).getWorksheet('Variation register')!;
    expect(ws.getRow(5).getCell(6).value).toEqual(new Date(Date.UTC(2026, 9, 2)));
    expect(ws.getRow(5).getCell(6).numFmt).toBe('d mmm yyyy');
  });

  it('the submission register shows real dates in Excel, and a date not given stays empty', () => {
    const p = { ...base, submissions: [{ id: 'SUB-001', kind: 'BOQ', title: 'Bill', docs: [], to: 'Consultant', purpose: 'For information', date: '2026-10-01', status: 'info', comments: [{ id: 'c', text: 'Note', closed: '2026-10-09' }] }] } as unknown as Project;
    expect(buildSubmissionRegisterHtml(p, '2026-11-01')).toContain('1 Oct 2026');
    const wb = buildSubmissionWorkbook(p, '2026-11-01');
    const row = wb.getWorksheet('Submission register')!.getRow(2);
    expect(row.getCell(8).value).toEqual(new Date(Date.UTC(2026, 9, 1)));
    expect(row.getCell(8).numFmt).toBe('d mmm yyyy');
    expect(row.getCell(11).value).toBe('');
    expect(wb.getWorksheet('Comments')!.getRow(2).getCell(7).value).toEqual(new Date(Date.UTC(2026, 9, 9)));
  });

  it('the drawing register prints and keeps dates the same way, and a typed date stays as typed', () => {
    const set: DrawingSet = {
      prefix: 'E-SLD-', register: true,
      sheets: [{ id: 'a', number: 'E-SLD-001', title: 'SLD', kind: 'system', boards: [], size: 'A3', date: '2026-10-03' }, { id: 'b', number: 'E-SLD-002', title: 'SLD', kind: 'system', boards: [], size: 'A3', date: 'Mid October' }],
      issues: [{ id: 'T-001', date: '2026-10-05', purpose: 'FOR APPROVAL', description: 'First', sheets: [{ id: 'a', number: 'E-SLD-001', title: 'SLD', rev: 'A' }] }]
    };
    const html = registerHtml(sampleProject, [{ number: 'E-SLD-001', title: 'SLD', size: 'A3', date: '2026-10-03' }], 'A', '2026-10-15', set.issues);
    expect(html).toContain('<td class="nw">3 Oct 2026</td>');
    expect(html).toContain('<td class="nw">5 Oct 2026</td>');
    expect(html).toContain('Rev A · 15 Oct 2026');
    const wb = buildRegisterWorkbook(sampleProject, set);
    const dates = cellsOf(wb.getWorksheet('Drawing register')!).filter((c) => c.value instanceof Date);
    expect(dates.map((c) => c.value)).toEqual([new Date(Date.UTC(2026, 9, 3))]);
    expect(dates[0].numFmt).toBe('d mmm yyyy');
    expect(cellsOf(wb.getWorksheet('Drawing register')!).map((c) => c.value)).toContain('Mid October');
    expect(cellsOf(buildTransmittalWorkbook(sampleProject, set.issues![0]).worksheets[0]).map((c) => c.value)).toContain('5 Oct 2026');
  });

  it('no printed document uses an ISO date, a leading zero or 01/11/2026', () => {
    const docs = printDocs(project);
    for (const [name, html] of Object.entries(docs)) {
      const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
      expect(text.match(/\b20\d\d-\d\d-\d\d\b/), name).toBeNull();
      expect(text.match(/\b\d\d\/\d\d\/20\d\d\b/), name).toBeNull();
      expect(text.match(/\b0\d (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}/), name).toBeNull();
    }
    expect(revisionStamp(project)).toBe('REV A · 15 Oct 2026');
  });
});
