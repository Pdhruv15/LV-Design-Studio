import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { runCalculations } from './runs';
import { buildDashboard, sizesText } from './dashboard';
import { buildDashboardHtml } from '../docs/dashboardPdf';
import { newRiser } from './busbar';
import type { Project } from '../types';

describe('project dashboard', () => {
  const run = runCalculations(sampleProject);
  const d = buildDashboard(sampleProject, run);

  it('headline numbers from the design', () => {
    expect(d.connectedKw).toBeGreaterThan(d.demandKw);
    expect(d.transformers).toHaveLength(1);
    expect(d.transformers[0]).toMatchObject({ boardId: 'MDB-1', kva: 1000 });
    expect(d.panels.total).toBe(sampleProject.boards.length);
    expect(d.panels.byKind.reduce((a, k) => a + k.n, 0)).toBe(sampleProject.boards.length);
    expect(d.cableRuns).toBeGreaterThan(0);
    expect(d.studies.map((s) => s.key)).toEqual(['checks', 'earthing', 'protection']);
    expect(d.byType[0].kw).toBeGreaterThanOrEqual(d.byType[d.byType.length - 1].kw);
    expect(Math.round(d.byType.reduce((a, b) => a + b.pct, 0))).toBe(100);
    expect(sizesText([1500, 1000, 1500])).toBe('2 × 1500 kVA + 1 × 1000 kVA');
  });

  it('area and power density from Building information, else the forms', () => {
    expect(buildDashboard({ ...sampleProject, info: { ...sampleProject.info, builtUpAreaM2: 2000 } }).density!.connected).toBeCloseTo((d.connectedKw * 1000) / 2000);
    const p: Project = { ...sampleProject, building: { buildings: [{ id: 'T', name: 'Tower', levels: [{ id: 'G', name: 'G', kind: 'ground', heightM: 4, grossM2: 1000 }, { id: 'L', name: 'Typ', kind: 'typical', heightM: 3.5, grossM2: 800, count: 10 }] }], rooms: [{ id: 'r', buildingId: 'T', levelId: 'L', name: 'Flat', type: 'apartment', areaM2: 100, count: 6 }] } };
    const b = buildDashboard(p);
    expect(b.area).toMatchObject({ gfaM2: 9000, floors: 11, source: 'building' });
    expect(b.perArea.title).toMatch(/level/);
    expect(b.perArea.bars[0].label).toBe('Typ (×10)');
  });

  it('to do: problems first, each says where to go', () => {
    const bad: Project = { ...sampleProject, info: {}, feeders: sampleProject.feeders.map((f) => (f.loadType === 'fire-pump' ? { ...f, cableType: 'XLPE/PVC/SWA' } : f)) };
    const t = buildDashboard(bad, runCalculations(bad)).todo;
    expect(t[0].status).toBe('bad');
    expect(t.some((x) => /fire-rated/.test(x.text) && x.go?.feederId)).toBe(true);
    expect(t.some((x) => /Submission forms/.test(x.text))).toBe(true);
  });

  it('one-page PDF summary', () => {
    const html = buildDashboardHtml(sampleProject, d);
    expect(html).toContain('A4 landscape');
    expect(html).toContain('Connected load (TCL)');
    expect(html).toContain('MDB-1');
  });
});

describe('dashboard: calculation-input findings', () => {
  const texts = (p: Project) => buildDashboard(p).todo;
  it('the sample project raises none of them', () => {
    expect(texts(sampleProject).filter((t) => /Design ambient|Cable data|placeholder source/.test(t.text))).toEqual([]);
  });
  it('ambient above the derating table fails; below it warns', () => {
    expect(texts({ ...sampleProject, ambientC: 75 }).find((t) => /Design ambient 75/.test(t.text))?.status).toBe('bad');
    expect(texts({ ...sampleProject, ambientC: 20 }).find((t) => /Design ambient 20/.test(t.text))?.status).toBe('warn');
  });
  it('strict cable data fails sizes still on reference values', () => {
    expect(texts({ ...sampleProject, strictCableData: true }).find((t) => /without manufacturer data/.test(t.text))?.status).toBe('bad');
  });
  it('a main board without transformer data warns that its fault level is a placeholder', () => {
    const boards = sampleProject.boards.map((b) => (b.upstreamId ? b : { ...b, sourceKva: undefined }));
    expect(texts({ ...sampleProject, boards }).some((t) => /placeholder source impedance/.test(t.text))).toBe(true);
  });
});

describe('dashboard: an assumed source fault level', () => {
  const bare = (p: Project): Project => ({ ...p, boards: p.boards.map((b) => (b.upstreamId ? b : { ...b, sourceKva: undefined, sourceImpedancePct: undefined })) });
  const todo = (p: Project) => buildDashboard(p, runCalculations(p)).todo.map((t) => t.text);
  const close = /circuits? to check — close to/;
  it('does not count circuits as close to a limit only because their Icu is not verified', () => {
    const t = todo(bare(sampleProject));
    expect(t.some((x) => close.test(x))).toBe(false);
    expect(t.some((x) => /placeholder source impedance/.test(x))).toBe(true);
    expect(todo(sampleProject).some((x) => close.test(x))).toBe(false);
  });
  it('still counts a circuit that is close to a voltage-drop limit for its own reason', () => {
    const worst = Math.max(...runCalculations(bare(sampleProject)).results.map((r) => r.vdTotalPct));
    const p = { ...bare(sampleProject), vdLimitPct: worst / 0.9 };
    expect(todo(p).some((x) => close.test(x))).toBe(true);
  });
  it('a busway riser Icw is a not-verified row, not a pass or a fail', () => {
    const riser = { ...newRiser('BR-1', 'MDB-1'), floors: [{ id: 'T', name: 'Typical', kw: 45, pf: 0.9, count: 20 }] };
    expect(todo({ ...bare(sampleProject), busRisers: [riser] })).toContain('Busbar riser BR-1: Icw not verified: source fault level assumed');
    expect(todo({ ...sampleProject, busRisers: [riser] }).some((x) => /Icw not verified/.test(x))).toBe(false);
  });
});

describe('project dashboard: values given from upstream', () => {
  const load = { id: 'F', boardId: 'MDB', name: 'F', loadKw: 24, demandFactor: 1, powerFactor: 0.9, lengthM: 20, cableCsaMm2: 10, cores: 4 as const, breakerRatingA: 40, breakerIcuKa: 36 };
  const lv = (supply: NonNullable<Project['boards'][number]['supply']>): Project =>
    ({ name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '', boards: [{ id: 'MDB', name: 'M', supply }], feeders: [load] });
  const todo = (p: Project) => buildDashboard(p, runCalculations(p)).todo.map((t) => `${t.status}: ${t.text}`);
  // 24 kW at PF 0.9 is 37.1 A. Incoming cable 2.5 mm² (Iz 31.3 A) is too small; the supply gives 30 A (37.1 A is 124 %).
  const given = { faultKa: 12, ratingA: 63, device: 'MCCB' as const, allowedA: 30, incomer: { cableCsaMm2: 2.5, lengthM: 25 } };
  it('lists a failing incoming cable, demand above the allowed load and the unverified upstream discrimination', () => {
    const t = todo(lv(given));
    expect(t).toContain('bad: MDB: incoming cable — Iz 31.3 A is below Ib 37.1 A; the supply device 63 A is above Iz 31.3 A: the cable is not protected');
    expect(t).toContain('bad: MDB: demand 37.1 A is above the 30.0 A the supply can give (123.7 %)');
    expect(t).toContain('warn: MDB: discrimination with the supply device (63 A) not verified for 1 way');
  });
  it('lists an incoming cable behind an isolator as not verified', () => {
    const t = todo(lv({ faultKa: 12, ratingA: 63, device: 'ISOL', incomer: { cableCsaMm2: 16, lengthM: 25 } }));
    expect(t).toContain('warn: MDB: incoming cable — the supply device is an isolator: protection of the incoming cable not verified (Ib ≤ In ≤ Iz not checked)');
  });
  it('a sound incoming cable, an allowed load that is enough and no upstream values add no rows', () => {
    const ok = todo(lv({ ...given, allowedA: 50, incomer: { cableCsaMm2: 16, lengthM: 25 } }));
    expect(ok.filter((x) => /incoming cable|supply can give/.test(x))).toEqual([]);
    expect(todo(lv({ faultKa: 12, ratingA: 63 })).filter((x) => /supply device|incoming cable|supply can give/.test(x))).toEqual([]);
  });
});
