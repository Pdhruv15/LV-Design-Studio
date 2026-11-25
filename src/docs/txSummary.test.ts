import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { sampleProject } from '../data/sampleProject';
import { acbText, breakerSetting, buildTxSummary, ctFor, rowCtText } from './txSummary';
import { connectedPhaseKw } from './mdSheet';
import { buildFormWorkbook, workbookBytes } from './formWorkbook';
import type { Project } from '../types';
import { applyReference, BUILT_IN_REFERENCES } from '../model/designReference';

describe('TCL summary at transformer level', () => {
  it("names the project's authority on the cable of a supply with no Fed from of its own", () => {
    const addc = applyReference(sampleProject, BUILT_IN_REFERENCES.find((r) => r.id === 'builtin-addc')!);
    const bare = { ...addc, boards: addc.boards.map((b) => (b.id === 'MDB-1' ? { ...b, supply: { ...b.supply, fedFrom: undefined, cable: undefined } } : b)) };
    expect(buildTxSummary(bare).groups[0].rows[0].cable).toBe('BY ADDC');
    const none = { ...bare, designReference: undefined };
    expect(buildTxSummary(none).groups[0].rows[0].cable).toBe('BY DEWA');
  });

  it('one row per transformer with setting, fault duty, loads, D.F and MDL', () => {
    const s = buildTxSummary(sampleProject);
    expect(s.groups.map((g) => g.name)).toEqual(['SUBSTATION-01']);
    const r = s.groups[0].rows[0];
    expect(r.board.id).toBe('MDB-1');
    expect(r.device).toBe('ACB');
    // 1000 kVA → 1391 A on a 1600 A ACB → 0.87 → 0.90
    expect(r.setting).toBe(0.9);
    expect(acbText(r)).toBe('1600 @ 0.90');
    expect(r.faultKa).toBe(36); // 27.8 kA → next standard
    const p = connectedPhaseKw(sampleProject, 'MDB-1');
    expect(r.tclKw).toBeCloseTo(p.R + p.Y + p.B);
    expect(r.mdlKw).toBeCloseTo(r.tclKw * r.df);
    expect(r.meters.CT).toBeGreaterThanOrEqual(1);
    expect(rowCtText(r)).toContain('1500/5A CT');
    expect(s.diversity).toBeCloseTo(r.df);
  });

  it('typed values win; substations group; standby units leave the TCL (duty)', () => {
    const p: Project = {
      ...sampleProject,
      boards: [
        ...sampleProject.boards.map((b) => (b.id === 'MDB-1' ? { ...b, substation: 'Substation-01', mdDemandFactor: 0.72, supply: { ratingA: 2500, irSetting: 0.85, faultKa: 65, ecc: '2X150' } } : b)),
        { id: 'MDB-2', name: 'MDB 2', kind: 'MDB' as const, sourceKva: 1500, sourceImpedancePct: 6, ratedCurrentA: 2500, substation: 'Substation-02' }
      ],
      feeders: sampleProject.feeders.map((f) => (f.id === 'MCC-WP' ? { ...f, standbyUnit: true } : f))
    };
    const s = buildTxSummary(p);
    expect(s.groups.map((g) => g.name)).toEqual(['SUBSTATION-01', 'SUBSTATION-02']);
    const r = s.groups[0].rows[0];
    expect([acbText(r), r.faultKa, r.ecc, r.df]).toEqual(['2500 @ 0.85', 65, '2X150', 0.72]);
    expect(rowCtText(r)).toContain('2400/5A CT'); // 2500 × 0.85 = 2125 A
    const wp = p.feeders.find((f) => f.id === 'MCC-WP')!;
    expect(s.tclKw - s.tclDutyKw).toBeCloseTo(wp.loadKw);
    expect(breakerSetting(p, p.boards.find((b) => b.id === 'MDB-2')!, 2500)).toBe(0.85); // 1500 kVA → 2087 A
    expect([ctFor(2125), ctFor(400), ctFor(290)]).toEqual(['2400/5A', '400/5A', '300/5A']);
  });

  it('the submission pack starts with the TCL summary sheet', async () => {
    const wb = buildFormWorkbook(sampleProject);
    expect(wb.worksheets[0].name).toBe('TCL SUMMARY');
    const back = new ExcelJS.Workbook();
    await back.xlsx.load((await workbookBytes(wb)).buffer as ArrayBuffer);
    const ws = back.getWorksheet('TCL SUMMARY')!;
    const texts: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => texts.push(String(c.value ?? ''))));
    expect(texts).toContain('SUBSTATION-01');
    expect(texts).toContain('MDB-1');
    expect(texts.some((t) => t.startsWith('SUMMARY OF THE TCL'))).toBe(true);
  });
});

describe('adding rows on the TCL summary', () => {
  it('a new transformer takes typed loads and meters until boards are drawn below it', async () => {
    const { addTransformerRow } = await import('./txSummary');
    const { project: p, id } = addTransformerRow(sampleProject, 'SUBSTATION-02');
    const typed: Project = { ...p, boards: p.boards.map((b) => (b.id === id ? { ...b, summaryLoad: { R: 540.43, Y: 533.09, B: 541.94 }, mdDemandFactor: 0.72, summaryMeters: { '1-PH': 121, '3-PH': 22, CT: 1 }, txRef: 'SS1-LV-MDB-01' } : b)) };
    const s = buildTxSummary(typed);
    const r = s.groups.find((g) => g.name === 'SUBSTATION-02')!.rows[0];
    expect(r.manual).toBe(true);
    expect(r.tclKw).toBeCloseTo(1615.46, 2);
    expect(r.mdlKw).toBeCloseTo(1615.46 * 0.72, 2);
    expect([r.meters['1-PH'], r.meters['3-PH'], r.meters.CT]).toEqual([121, 22, 1]);
    expect(rowCtText(r)).toBe('2400/5A CT'); // 2500 A @ 0.85 on 1500 kVA
    expect(s.groups[0].rows[0].manual).toBe(false); // MDB-1 has its boards
  });
});

describe('a first board fed from a source with a typed rating (no transformer)', () => {
  const withSource = (supply: NonNullable<Project['boards'][number]['supply']>, transformer = false): Project => ({
    ...sampleProject, boards: sampleProject.boards.map((b) => (b.id === 'MDB-1' ? { ...b, ...(transformer ? {} : { sourceKva: undefined, sourceImpedancePct: undefined }), supply: { ...supply } } : b))
  });
  const fault = async (p: Project) => {
    const row = buildTxSummary(p).groups[0].rows[0];
    const ws = (await (async () => { const b = new ExcelJS.Workbook(); await b.xlsx.load((await workbookBytes(buildFormWorkbook(p, { forms: ['tx'] }))).buffer as ArrayBuffer); return b; })()).worksheets[0];
    const cells: string[] = [];
    ws.eachRow((r) => r.eachCell((c) => { if (c.value !== null && c.value !== undefined) cells.push(String(c.value)); }));
    return { row, cells };
  };

  it('prints the calculated fault level, marked, for a generator and for an inverter source', async () => {
    const gen = await fault(withSource({ kind: 'generator', ratedKva: 250, ratingA: 400, device: 'MCCB' }));
    expect(gen.row.faultKa).toBeUndefined();
    expect(gen.row.faultCalc).toBe('2.4 (calc.)');
    expect(gen.cells).toContain('2.4 (calc.)');
    const pv = await fault(withSource({ kind: 'pv', ratedKva: 100, ratingA: 200, device: 'MCCB' }));
    expect(pv.row.faultCalc).toBe('0.17 (calc.)');
  });

  it('keeps a typed fault level, an assumed one and a transformer board as they were', () => {
    const typed = buildTxSummary(withSource({ kind: 'generator', ratedKva: 250, faultKa: 20 })).groups[0].rows[0];
    expect([typed.faultKa, typed.faultCalc]).toEqual([20, undefined]);
    const assumed = buildTxSummary(withSource({ kind: 'generator', ratingA: 400 })).groups[0].rows[0];
    expect([assumed.faultKa, assumed.faultCalc]).toEqual([undefined, undefined]);
    const board = buildTxSummary(withSource({ kind: 'generator', ratedKva: 250, fedBy: 'board' })).groups[0].rows[0];
    expect([board.faultKa, board.faultCalc]).toEqual([undefined, undefined]);
    const tx = buildTxSummary(withSource({ kind: 'generator', ratedKva: 250 }, true)).groups[0].rows[0];
    expect([tx.faultKa, tx.faultCalc]).toEqual([36, undefined]);
    expect(buildTxSummary(sampleProject).groups[0].rows.every((r) => r.faultCalc === undefined)).toBe(true);
  });
});
