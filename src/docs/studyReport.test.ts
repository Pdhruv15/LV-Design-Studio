import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { runCalculations } from '../calc/runs';
import { boardSummary } from '../calc/summary';
import { buildSection, buildStudyReportHtml, drawingProject, scopeOf, scopeText, STUDIES, type CalcData } from './studyReport';
import { buildStudyWorkbook } from './studyWorkbook';
import { calcReportSections } from './calcReport';
import { fig } from '../util/format';

const run = runCalculations(sampleProject);
const data: CalcData = { project: run.project, results: run.results, earthing: run.earthing, selectivity: run.selectivity };
const sub = sampleProject.boards.find((b) => b.upstreamId && sampleProject.boards.some((c) => c.upstreamId === b.id))!; // a board with sub-boards

describe('study reports for part of the network', () => {
  it('scope: nothing ticked = whole installation; a board with or without what is below it', () => {
    expect(scopeOf(sampleProject, { boards: [], downstream: true }).all).toBe(true);
    const down = scopeOf(sampleProject, { boards: [sub.id], downstream: true });
    const below = sampleProject.boards.filter((b) => b.upstreamId === sub.id).map((b) => b.id);
    expect([...down.ids].sort()).toEqual([sub.id, ...below].sort());
    expect(down.roots.map((b) => b.id)).toEqual([sub.id]);
    expect(down.incomers.map((f) => f.feedsBoardId)).toEqual([sub.id]);
    const only = scopeOf(sampleProject, { boards: [sub.id], downstream: false });
    expect([...only.ids]).toEqual([sub.id]);
    expect(scopeText(sampleProject, down)).toContain(`${sub.id} and downstream`);
    expect(only.feeders.every((f) => f.boardId === sub.id && !f.phase)).toBe(true);
  });

  it('results come from the whole network: a sub-board keeps its real fault level and voltage', () => {
    const scope = scopeOf(sampleProject, { boards: [sub.id], downstream: false });
    const sc = buildSection('sc', data, scope);
    const busbars = sc.tables[0];
    expect(busbars.rows.map((r) => r[0])).toEqual([sub.id]);
    expect(busbars.rows[0][4]).toEqual(fig.fault(boardSummary(sampleProject, sub).faultKA));
    // Breakers: the incomer and the board's own circuits.
    const breakers = sc.tables[1].rows.map((r) => String(r[0]));
    expect(breakers[0]).toContain('(incomer)');
    expect(breakers.length).toBe(1 + scope.feeders.length);
    const lf = buildSection('lf', data, scope);
    expect(lf.tables[0].rows[0][9]).toEqual(fig.pct(boardSummary(sampleProject, sub).voltagePct));
  });

  it('every study builds for any scope', () => {
    for (const boards of [[], [sub.id]]) {
      const scope = scopeOf(sampleProject, { boards, downstream: true });
      for (const s of STUDIES) {
        const sec = buildSection(s.key, data, scope);
        expect(sec.title).toBe(s.title);
        expect(sec.tables.length).toBeGreaterThan(0);
      }
    }
    const whole = buildSection('earth', data, scopeOf(sampleProject, { boards: [], downstream: true }));
    expect(whole.tables[0].rows.length).toBe(run.earthing.length); // final circuits included
  });

  it('reports the calculated CPC factors for mixed cable families and honours the report scope', () => {
    const pvc = sampleProject.feeders.find((f) => f.boardId === sub.id && f.feedsBoardId)!;
    const project = { ...sampleProject, cableDataByType: true, feeders: sampleProject.feeders.map((f) => ({
      ...f, cableType: f.boardId === sub.id || f.feedsBoardId === sub.id ? 'PVC/SWA/PVC' : 'XLPE/SWA/PVC'
    })) };
    const r = runCalculations(project);
    const d: CalcData = { project: r.project, results: r.results, earthing: r.earthing, selectivity: r.selectivity };
    const scoped = buildSection('earth', d, scopeOf(project, { boards: [sub.id], downstream: false }));
    expect(scoped.criteria).toContainEqual(['Protective conductor', 'Adiabatic, k = 115']);
    expect(scoped.method.join(' ')).toContain('S ≥ I·√t ÷ 115');
    expect(scoped.method.join(' ')).not.toContain('143');

    const whole = calcReportSections(project).find((s) => s.key === 'earth')!;
    expect(whole.criteria).toContainEqual(['Protective conductor', 'Adiabatic, k by cable family']);
    expect(whole.method[1]).toContain('S ≥ I·√t ÷ k');
    const table = whole.tables[0], cpc = table.headers.indexOf('CPC min, each (mm²)');
    expect(table.rows.find((row) => row[0] === pvc.id)?.[cpc]).toMatchObject({ v: expect.stringContaining('k = 115') });
    expect(table.rows.map((row) => row[cpc])).toContainEqual(expect.objectContaining({ v: expect.stringContaining('k = 143') }));
  });

  it('reports the legacy factor when cable data by type is off', () => {
    const project = { ...sampleProject, cableDataByType: false, feeders: sampleProject.feeders.map((f) => ({ ...f, cableType: 'PVC/SWA/PVC' })) };
    const earth = calcReportSections(project).find((s) => s.key === 'earth')!;
    expect(earth.criteria).toContainEqual(['Protective conductor', 'Adiabatic, k = 143']);
    expect(earth.method[1]).toContain('S ≥ I·√t ÷ 143');
  });

  it('the drawing holds only the scope; its top board still names its supply', () => {
    const scope = scopeOf(sampleProject, { boards: [sub.id], downstream: true });
    const d = drawingProject(sampleProject, scope);
    expect(d.boards.map((b) => b.id).sort()).toEqual([...scope.ids].sort());
    expect(d.feeders.every((f) => scope.ids.has(f.boardId))).toBe(true);
    expect(d.boards.find((b) => b.id === sub.id)!.upstreamId).toBe(sub.upstreamId);
  });

  it('PDF: cover, a section per study, an A3 SLD page when drawn; Excel: a sheet per study', () => {
    const scope = scopeOf(sampleProject, { boards: [sub.id], downstream: true });
    const sections = [buildSection('sc', data, scope), buildSection('lf', data, scope)];
    const html = buildStudyReportHtml(sampleProject, scope, sections, { title: 'Short circuit and load flow', docNo: 'E-CALC-003' }, { sc: '<svg id="x"></svg>' });
    expect(html).toContain('Short circuit and load flow');
    expect(html).toContain('E-CALC-003');
    expect(html).toContain('1. Short circuit study');
    expect(html).toContain('2. Load flow and voltage drop study');
    expect(html.match(/class="sld"/g)).toHaveLength(1);
    expect(html).toContain('@page sld { size: A3 landscape');
    const wb = buildStudyWorkbook(sampleProject, scope, sections, { title: 'x' });
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Cover', 'Short circuit', 'Load flow & voltage drop']);
  });
});

describe('report scope is explicit', () => {
  it('selected boards with none ticked is empty, not the whole installation', () => {
    expect(scopeOf(sampleProject, { boards: [], downstream: true, mode: 'selected' }).boards).toHaveLength(0);
    expect(scopeOf(sampleProject, { boards: [], downstream: true }).all).toBe(true); // older reports
    expect(scopeOf(sampleProject, { boards: ['GONE'], downstream: true, mode: 'selected' }).boards).toHaveLength(0);
  });
  it('lists boards a saved set refers to that no longer exist', async () => {
    const { missingBoards } = await import('./studyReport');
    expect(missingBoards(sampleProject, ['MDB-1', 'GONE'])).toEqual(['GONE']);
  });
});

describe('short circuit report in per unit', () => {
  const sc = buildSection('sc', data, scopeOf(sampleProject, { boards: [], downstream: true }));
  it('names the base power as a plain number in the table title and the method line', () => {
    expect(sc.tables.map((t) => t.title)).toContain('Impedance data in per unit — base 100 MVA');
    expect(sc.tables.map((t) => t.title)).toContain('Fault at the busbars in per unit');
    expect(sc.method.some((m) => m.startsWith(`Per-unit tables: base 100 MVA; at ${sampleProject.voltageV} V the base current is `))).toBe(true);
  });
  it('gives every board the Ik″ of the busbar table', () => {
    const pu = sc.tables.find((t) => t.title === 'Fault at the busbars in per unit')!, ohm = sc.tables.find((t) => t.title === 'Fault levels at the busbars')!;
    expect(pu.rows.map((r) => [r[0], r[6]])).toEqual(ohm.rows.map((r) => [r[0], r[4]]));
  });
  it('has no Fault points table when no mark is placed', () => {
    expect(sc.tables.map((t) => t.title)).not.toContain('Fault points');
  });
});

describe('short circuit report: fault points', () => {
  it('lists the marks on boards and circuits in scope, with the busbar mark equal to the busbar table', () => {
    const f = sampleProject.feeders.find((x) => x.feedsBoardId === sub.id)!;
    const marked = { ...sampleProject, faultPoints: [{ id: 'F1', boardId: sub.id }, { id: 'F2', feederId: f.id, name: 'Riser' }, { id: 'F3', boardId: 'GONE' }] };
    const r = runCalculations(marked);
    const d: CalcData = { project: r.project, results: r.results, earthing: r.earthing, selectivity: r.selectivity };
    const sc = buildSection('sc', d, scopeOf(marked, { boards: [], downstream: true }));
    const points = sc.tables.find((t) => t.title === 'Fault points')!;
    expect(points.headers).toEqual(['Point', 'Place', 'kV', 'R (p.u.)', 'X (p.u.)', 'Z (p.u.)', 'X/R', 'Ik″ (kA)', 'Peak ip (kA)', 'Line-earth, minimum (kA)', 'Breaker Icu (kA)']);
    expect(points.rows.map((row) => row[0])).toEqual(['F1', 'F2']); // F3's board is gone: left off
    expect(points.rows[0][1]).toBe(`${sub.id} busbar`);
    expect(String(points.rows[1][1])).toMatch(/^Riser: /);
    const busbars = sc.tables.find((t) => t.title === 'Fault at the busbars in per unit')!;
    const row = busbars.rows.find((x) => x[0] === sub.id)!;
    expect(points.rows[0][7]).toEqual(row[6]); // Ik″
    expect(points.rows[0][8]).toEqual(row[8]); // ip
  });
});
