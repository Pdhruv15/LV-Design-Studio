import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { sampleProject } from '../data/sampleProject';
import { newRiser } from '../calc/busbar';
import { DEFAULT_TYPES, newAssessment } from '../calc/loadAssessment';
import { runCalculations } from '../calc/runs';
import { boardSummary } from '../calc/summary';
import { buildDashboard } from '../calc/dashboard';
import { vdCandidates, vdRows } from '../calc/voltageDrop';
import { issueRevision, revisionStamp } from '../model/revisions';
import type { Feeder, Project } from '../types';
import { fig, Figure, fmtFixed } from '../util/format';
import { printDocs } from '../../tests/fixtures/printDocs';
import { buildResults } from './compliance';
import { buildReportHtml } from './calcReport';
import { conceptReport, conceptReportHtml } from './conceptReport';
import { buildDashboardHtml } from './dashboardPdf';
import { unresolvedChecks } from './issuePackage';
import { documentControlHtml, reportDoc } from './reportFrame';
import { buildSection, buildStudyReportHtml, cellHtml, scopeOf, STUDIES, type CalcData, type Cell, type Table } from './studyReport';
import { buildStudyDocx, docxBytes } from './studyWord';
import { buildStudyWorkbook } from './studyWorkbook';
import { buildVdReportHtml, VD_HEADERS, vdCells, vdCsvCells } from './voltageDropReport';

/** The sample with its loads ×40, so thousands show, and the optional tables switched on. */
const project: Project = issueRevision({
  ...sampleProject,
  feeders: [...sampleProject.feeders.map((f) => ({ ...f, loadKw: f.loadKw * 40 })),
    { id: 'M1', boardId: 'MDB-1', name: 'Pump', loadKw: 30, demandFactor: 1, powerFactor: 0.85, lengthM: 120, cableCsaMm2: 25, cores: 3, breakerRatingA: 80, breakerIcuKa: 36, loadType: 'motor', starter: 'DOL', essential: true } as Feeder],
  busRisers: [{ ...newRiser('BR-1', 'MDB-1'), floors: [{ id: 'T', name: 'Typical', kw: 45, pf: 0.9, count: 20 }] }],
  txGen: { genBoards: { 'MDB-1': 60 } }
}, { description: 'First issue', date: '2026-10-15', by: 'QA' });

const run = runCalculations(project);
const p = run.project;
const data: CalcData = { project: p, results: run.results, earthing: run.earthing, selectivity: run.selectivity };
const scope = scopeOf(p, { boards: [], downstream: true });
const sections = STUDIES.map((s) => buildSection(s.key, data, scope));
const root = p.boards.find((b) => !b.upstreamId)!;
const rootSum = boardSummary(p, root);

// Headings of the columns that hold ratings or typed limits: they print as written.
const AS_WRITTEN = /rating|breaker|icu|installed|tap-off|bank|existing|allowable|limit \(%\)/i;
// Decimals by heading, for the calculated columns.
const DECIMALS: [RegExp, number][] = [
  [/\((kW|kVA|kvar)\)$/, 2], [/\(A\)$/, 1], [/\(kA\)$/, 2], [/Neutral shift \(V\)$/, 2], [/\(V\)$/, 1], [/\(%\)$|% of nominal/, 2], [/\(Ω\)$/, 4],
  [/^PF$|^PF (now|before)$|Demand ÷ connected|In ratio/, 2], [/^PF after$/, 3]
];

describe('every report column follows its rule', () => {
  // The cable schedule section moves with the schedules, in their own change.
  const tables: Table[] = [
    ...sections.filter((s) => s.key !== 'schedules').flatMap((s) => [...s.tables, ...(s.verification ? [s.verification] : [])]),
    ...(() => { const r = buildResults(data, scope); return [...r.equipment, r.load, r.cables]; })()
  ];

  it('calculated columns are figures with the decimals of their kind', () => {
    let checked = 0;
    for (const t of tables) t.rows.forEach((row) => row.forEach((c, i) => {
      const h = t.headers[i];
      if (AS_WRITTEN.test(h) || typeof c === 'string' || (typeof c === 'object' && 's' in c)) return;
      const rule = DECIMALS.find(([re]) => re.test(h));
      if (!rule) return;
      expect(c instanceof Figure ? c.decimals : c, `${t.title} — ${h}`).toBe(rule[1]);
      checked += 1;
    }));
    expect(checked).toBeGreaterThan(500);
  });

  it('ratings stay whole with no comma, and real numbers', () => {
    let checked = 0;
    for (const t of tables) t.rows.forEach((row) => row.forEach((c, i) => {
      if (!/(rating|Icu|Installed) \((A|kA|kVA)\)/.test(t.headers[i]) || typeof c === 'string') return;
      expect(typeof c, `${t.title} — ${t.headers[i]}`).toBe('number');
      expect(String(c)).toMatch(/^\d+(\.\d+)?$/);
      checked += 1;
    }));
    expect(checked).toBeGreaterThan(10);
  });

  it('the figures are the calculated values, rounded to what is printed', () => {
    const cable = sections.find((s) => s.key === 'cable')!.tables[0];
    const col = (h: string) => cable.headers.indexOf(h);
    for (const row of cable.rows) {
      const id = String(row[0]).replace(' (incomer)', '');
      const r = run.results.find((x) => x.feeder.id === id)!;
      expect((row[col('Ib (A)')] as Figure).value).toBe(Number(r.ib.toFixed(1)));
      expect((row[col('Iz (A)')] as Figure).value).toBe(Number(r.ampacity.toFixed(1)));
      expect((row[col('ΔV total (%)')] as Figure).value).toBe(Number(r.vdTotalPct.toFixed(2)));
    }
    const load = sections.find((s) => s.key === 'load')!.tables[0].rows.find((r) => r[0] === root.id)!;
    expect((load[1] as Figure).value).toBe(Number(rootSum.connectedKw.toFixed(2)));
    expect((load[6] as Figure).value).toBe(Number(rootSum.currentA.toFixed(1)));
  });

  it('a power factor checked against its target keeps three decimals', () => {
    const banks = sections.find((s) => s.key === 'pfc')!.tables[0];
    const after = banks.headers.indexOf('PF after');
    for (const row of banks.rows) expect((row[after] as Figure).decimals).toBe(3);
    expect(String(fig.pf3(0.947))).toBe('0.947');
  });
});

describe('the same value reads the same in every report', () => {
  const kw = fmtFixed(rootSum.connectedKw, 2);
  const ib = fmtFixed(run.results.find((r) => r.feeder.id === 'INC-GF')!.ib, 1);
  const textOf = (xml: string) => xml.replace(/<[^>]+>/g, ' ');

  it('in the PDFs', () => {
    expect(kw).toMatch(/,/);
    expect(buildReportHtml(p)).toContain(`<td>${kw}</td>`);
    expect(buildReportHtml(p)).toContain(`<td>${ib}</td>`);
    expect(buildStudyReportHtml(p, scope, sections, { title: 'T' }, {}, { designBasis: true, results: true, data })).toContain(`<b>${kw} kW</b>`);
    expect(buildVdReportHtml(p, vdRows(p, vdCandidates(p).map((f) => f.id)), 'Entire system')).toContain(ib);
    expect(conceptReportHtml(conceptReport(p))).toContain(`${kw} kW`);
  });

  it('in the Word report', async () => {
    const bytes = await docxBytes(buildStudyDocx(p, scope, sections, { title: 'T' }, { designBasis: true, results: true, data }));
    const text = textOf(await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string'));
    expect(text).toContain(`${kw} kW`);
    expect(text).toContain(ib);
    expect(text).not.toContain(`${Math.round(rootSum.connectedKw).toLocaleString('en-US')} kW`);
  });

  it('the project summary keeps its headline figures whole, as approved, and loading to one decimal', () => {
    const d = buildDashboard(p, run);
    const html = buildDashboardHtml(p, d);
    expect(html).toContain(`>${fmtFixed(d.connectedKw, 0)} kW<`);
    expect(html).not.toContain(fmtFixed(d.connectedKw, 2));
    expect(html).toContain(`${fmtFixed(d.transformers[0].loadingPct, 1)} %`);
  });

  it('ratings read as an engineer writes them in the concept report and the design basis', () => {
    const big = { ...p, loadAssessment: { ...newAssessment(DEFAULT_TYPES[0], { gfaM2: 24000, floors: 20, parkingM2: 8000 }, { types: [] }), inReport: true } };
    expect(conceptReportHtml(conceptReport(big))).toMatch(/× 1250 kVA/);
    expect(conceptReportHtml(conceptReport(big))).not.toMatch(/× 1,\d{3} kVA/);
    expect(buildStudyReportHtml(big, scope, [], { title: 'T' }, {}, { designBasis: true })).not.toMatch(/× 1,\d{3} kVA/);
  });
});

describe('Excel keeps real numbers', () => {
  const wb = buildStudyWorkbook(p, scope, sections, { title: 'T' });
  const sheet = wb.getWorksheet('Load flow & voltage drop')!;
  const headers = (first: string) => { let found = -1; sheet.eachRow((row, n) => { if (found < 0 && row.getCell(1).value === first) found = n; }); return found; };

  it('a calculated figure is a number with a display format', () => {
    const at = headers('Board');
    const row = sheet.getRow(at + 1);
    expect(row.getCell(1).value).toBe(root.id);
    expect(row.getCell(2).value).toBe(Number(rootSum.connectedKw.toFixed(2)));
    expect(row.getCell(2).numFmt).toBe('#,##0.00');
    expect(row.getCell(5).value).toBe(Number(rootSum.powerFactor.toFixed(2)));
    expect(row.getCell(6).numFmt).toBe('#,##0.0');
    expect(row.getCell(9).numFmt).toBe('#,##0.0');
  });

  it('a rating stays a plain number and text stays text', () => {
    const row = sheet.getRow(headers('Board') + 1);
    expect(row.getCell(7).value).toBe(root.ratedCurrentA);
    expect(row.getCell(7).numFmt).toBeFalsy();
    expect(typeof row.getCell(1).value).toBe('string');
  });

  it('every figure reaches the sheet as a number', () => {
    let figures = 0, numbers = 0;
    for (const s of sections) for (const t of s.tables) for (const r of t.rows) figures += r.filter((c) => c instanceof Figure).length;
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === 'number' && c.numFmt) numbers += 1; })));
    expect(numbers).toBe(figures);
  });
});

describe('cells print with their format everywhere', () => {
  it('PDF cells', () => {
    expect(cellHtml(fig.power(1234.5))).toBe('<td>1,234.50</td>');
    expect(cellHtml(1000)).toBe('<td>1000</td>');
    expect(cellHtml('—')).toBe('<td>—</td>');
    expect(cellHtml({ v: 'FAIL', s: 'bad' })).toContain('class="bad"');
  });

  it('a figure is never mistaken for a status', () => {
    const cells: Cell[][] = [['A', fig.power(1234.5), { v: 'FAIL', s: 'bad' }]];
    const open = unresolvedChecks([{ key: 'lf', title: 'T', method: [], summary: [], statuses: [], tables: [{ headers: ['Item', 'kW', 'Result'], rows: cells }] }]);
    expect(open).toEqual([{ study: 'T', item: 'A', check: 'kW: 1,234.50', value: 'FAIL', status: 'bad' }]);
  });

  it('the voltage drop CSV keeps plain numbers, so a spreadsheet reads them', () => {
    const r = vdRows(p, vdCandidates(p).map((f) => f.id)).find((x) => x.feeder.id === 'INC-GF')!;
    const i = VD_HEADERS.indexOf('Ib (A)');
    expect(vdCells(r)[i]).toMatch(/,/);
    expect(vdCsvCells(r)[i]).toBe(vdCells(r)[i].replace(/,/g, ''));
    expect(vdCsvCells(r)[VD_HEADERS.indexOf('To')]).toBe(vdCells(r)[VD_HEADERS.indexOf('To')]);
  });
});

describe('dates in reports', () => {
  it('a revision date prints short, a cover date in full', () => {
    const d = reportDoc(project, { title: 'T', date: '2026-10-15' });
    expect(d.revisionDate).toBe('15 Oct 2026');
    expect(d.date).toBe('15 October 2026');
    expect(d.revisions[0].date).toBe('15 Oct 2026');
    expect(documentControlHtml(d)).toContain('<td>15 Oct 2026</td>');
    expect(revisionStamp(project)).toBe('REV A · 15 Oct 2026');
    expect(reportDoc(project, { title: 'T', date: 'Mid October' }).date).toBe('Mid October');
  });

  it('the concept report prints the short date', () => {
    expect(conceptReportHtml(conceptReport(p, { date: '2026-11-01' }))).toContain('Printed 1 Nov 2026');
  });

  it('no report prints an ISO date', () => {
    const docs = printDocs(project);
    for (const name of ['calculation-report', 'study-report', 'technical-review', 'clarification', 'project-summary', 'pfc-calculation', 'containment', 'ups', 'solar-pv', 'issue-package-cover']) {
      const text = docs[name].replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
      expect(text.match(/\b20\d\d-\d\d-\d\d\b/), name).toBeNull();
    }
  });
});
