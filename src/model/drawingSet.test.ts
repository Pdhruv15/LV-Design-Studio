import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { addEarthingSheet, addRiserSheet, addSheet, autoSheets, autoSize, issueSheets, renumber, sheetProject, sheetsByCount, furnitureOf, minMmPerPx, MIN_MM_PER_PX, scaleOn, addLegendSheet, addBoardSheets, drawable, sheetType, sheetHash } from './drawingSet';
import type { Project } from '../types';

const two: Project = { ...sampleProject, boards: [...sampleProject.boards, { id: 'MDB-2', name: 'MDB 2', kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 5 }] };

describe('drawing set', () => {
  it('one sheet per MDB (overview when several), DBs as boxes, DB diagrams only on request', () => {
    const one = autoSheets(sampleProject, 'perMdb');
    expect(one.sheets.map((s) => s.number)).toEqual(['E-SLD-001', 'E-ERT-001']); // the earthing schematic goes with the SLDs
    expect(one.sheets[0].boards).toContain('DB-GF1');
    const t = autoSheets(two, 'perMdb');
    expect(t.sheets.map((s) => s.title)).toEqual(['SLD — overall (main boards and sub-mains)', 'SLD — MDB-1', 'SLD — MDB-2', 'Earthing schematic diagram']);
    expect(t.sheets[0].boards).not.toContain('DB-GF1');
    const withDb = autoSheets(sampleProject, 'perMdb', true);
    expect(withDb.sheets.find((x) => x.kind === 'board')).toMatchObject({ kind: 'board', boards: ['DB-GF1'], number: 'E-SLD-002' });
  });
  it('per SMDB: overview then a sheet for each SMDB with DBs', () => {
    const s = autoSheets(sampleProject, 'perSmdb');
    expect(s.sheets[0].boards).toEqual(['MDB-1', 'SMDB-GF', 'SMDB-FF', 'MCC-1']);
    expect(s.sheets.map((x) => x.title)).toContain('SLD — SMDB-GF');
  });
  it('feeders to a panel on another sheet end in "to X — sheet N"', () => {
    const s = autoSheets(sampleProject, 'perSmdb');
    const p = sheetProject(sampleProject, s, s.sheets[0]);
    const inc = p.feeders.find((f) => f.name.startsWith('To DB-GF1'))!;
    const gf = s.sheets.find((x) => x.title === 'SLD — SMDB-GF')!;
    expect(inc.name).toBe(`To DB-GF1 — sheet ${gf.number}`);
    expect(inc.feedsBoardId).toBeUndefined();
    expect(p.boards.map((b) => b.id)).not.toContain('DB-GF1');
  });
  it('size from what is drawn; renumbering', () => {
    expect(autoSize(800, 500).size).toBe('A3'); // a small drawing stays on A3
    expect(autoSize(1800, 700).size).toBe('A3');
    expect(autoSize(3800, 1500).size).toBe('A1');
    expect(autoSize(9000, 3000).fits).toBe(false);
    expect(renumber({ prefix: 'X-', sheets: autoSheets(two, 'perMdb').sheets }).sheets.map((s) => s.number)).toEqual(['X-001', 'X-002', 'X-003', 'E-ERT-001']);
  });
});

describe('sheets by panel count', () => {
  it('puts at most n panels on a sheet, every panel once, in supply order', async () => {

    const set = sheetsByCount(sampleProject, 2);
    const all = set.sheets.flatMap((s) => s.boards);
    expect(set.sheets.every((s) => s.boards.length <= 2)).toBe(true);
    expect(new Set(all).size).toBe(sampleProject.boards.length);
    expect(all.length).toBe(sampleProject.boards.length);
    expect(set.sheets[0].boards[0]).toBe('MDB-1');
    expect(sheetsByCount(sampleProject, 10).sheets.length).toBe(1);
  });
  it('keeps the connected load of a panel drawn on another sheet', () => {
    const set = sheetsByCount(sampleProject, 1);
    const first = sheetProject(sampleProject, set, set.sheets[0]);
    const cut = first.feeders.find((f) => f.name.startsWith('To SMDB-GF'))!;
    expect(cut.loadKw).toBeGreaterThan(0);
    expect(cut.demandFactor).toBeLessThanOrEqual(1);
  });
});

describe('drawing register', () => {
  it('numbers with prefix, start, digits and suffix; manual numbers are kept', () => {
    const set = sheetsByCount(sampleProject, 2, 'EL-');
    const r = renumber({ ...set, start: 101, digits: 4, suffix: '-SLD' }, true);
    expect(r.sheets[0].number).toBe('EL-0101-SLD');
    expect(r.sheets[1].number).toBe('EL-0102-SLD');
    const manual = { ...r, manualNumbers: true, sheets: r.sheets.map((s, i) => (i === 0 ? { ...s, number: 'E-100' } : s)) };
    expect(renumber(manual).sheets[0].number).toBe('E-100');
    expect(renumber(manual, true).sheets[0].number).toBe('EL-0101-SLD');
  });
});

describe('sheet exports use the whole network', async () => {
  const { sampleProject } = await import('../data/sampleProject');
  const { evaluateProject } = await import('../calc/electrical');
  const { sheetProject, sheetsByCount, autoSize, scaleOn, LEGEND_RESERVE_MM } = await import('./drawingSet');
  it('a sheet without its upstream panels would lose the upstream voltage drop on its own', () => {
    const set = sheetsByCount(sampleProject, 2);
    const down = set.sheets.find((s) => !s.boards.includes(sampleProject.boards.find((b) => !b.upstreamId)!.id))!;
    const part = evaluateProject(sheetProject(sampleProject, set, down));
    const full = new Map(evaluateProject(sampleProject).map((r) => [r.feeder.id, r]));
    const f = part.find((r) => full.get(r.feeder.id)!.vdUpstreamPct > 0)!;
    expect(f.vdUpstreamPct).toBeLessThan(full.get(f.feeder.id)!.vdUpstreamPct); // why sheets now take the full calculation
  });
  it('sizes for the legend column and checks a chosen paper', () => {
    expect(scaleOn('A3', 1800, 700, LEGEND_RESERVE_MM)).toBeLessThan(scaleOn('A3', 1800, 700));
    expect(autoSize(1800, 700, LEGEND_RESERVE_MM).size).not.toBe('A4');
  });
});

describe('new sheet status', () => {
  it('starts PRELIMINARY, or follows the set when the set has a status', () => {
    const empty = { prefix: 'E-SLD-', sheets: [] };
    const a = addSheet(empty, [], 'A');
    expect(a.set.sheets[0].status).toBe('PRELIMINARY');
    expect(addRiserSheet(empty, 'b1', 'Block 1').set.sheets[0].status).toBe('PRELIMINARY');
    expect(addEarthingSheet(empty).set.sheets[0].status).toBe('PRELIMINARY');
    expect(addSheet({ ...empty, status: 'FOR TENDER' }, [], 'B').set.sheets[0].status).toBeUndefined();
  });
  it('a first issue of a new sheet is revision A', () => {
    const { set, id } = addSheet({ prefix: 'E-SLD-', sheets: [] }, [], 'A');
    const out = issueSheets(set, [id], { date: '2026-10-12', purpose: 'FOR APPROVAL', description: '', bump: true });
    expect(out.set.sheets[0].rev).toBe('A');
  });
});

describe('sheet furniture', () => {
  it('a sheet takes the set\'s values and overrides any of them; blank is today\'s output', () => {
    const set = { prefix: 'E-SLD-', sheets: [], furniture: { zones: 'large' as const, textMm: 3.5 as const } };
    expect(furnitureOf(set)).toEqual({ zones: 'large', textMm: 3.5 });
    expect(furnitureOf(set, { furniture: { zones: 'off', centring: true } })).toEqual({ zones: 'off', textMm: 3.5, centring: true });
    expect(furnitureOf({ prefix: 'E-SLD-', sheets: [] })).toEqual({});
  });
  it('the smallest drawing text sets the scale a paper must reach: 1.8 mm over 9 px text is today\'s 0.2 mm per px', () => {
    expect(minMmPerPx({})).toBe(MIN_MM_PER_PX);
    expect(minMmPerPx({ minTextMm: 2.5 })).toBeCloseTo(0.2778, 4);
    // A drawing that just fits A3 at 1.8 mm needs A2 at 2.5 mm.
    expect(autoSize(1800, 700).size).toBe('A3');
    expect(autoSize(1800, 700, 0, minMmPerPx({ minTextMm: 2.5 })).size).toBe('A2');
    expect(autoSize(9000, 3000, 0, minMmPerPx({ minTextMm: 3.5 })).fits).toBe(false);
  });
});

describe('room for a legend strip', () => {
  it('a strip at the foot takes height from the drawing area, so a drawing that just fits A3 moves to A2', () => {
    expect(autoSize(1200, 1100).size).toBe('A3');
    expect(autoSize(1200, 1100, 0, MIN_MM_PER_PX, 40).size).toBe('A2');
    expect(scaleOn('A3', 1200, 1100, 0, 40)).toBeLessThan(scaleOn('A3', 1200, 1100));
  });
});

describe('legend sheet and board sheets with schedule', () => {
  it('the legend sheet is one per set, first in the list and numbered before the SLDs', () => {
    const base = { prefix: 'E-SLD-', sheets: autoSheets(two, 'perMdb').sheets };
    const a = addLegendSheet(base), b = addLegendSheet(a.set);
    expect(b.id).toBe(a.id);
    expect(a.set.sheets[0].kind).toBe('legend');
    expect(a.set.sheets[0].number).toBe('E-SLD-000');
    expect(a.set.sheets[1].number).toBe('E-SLD-001'); // the SLDs keep their numbers
    expect(drawable(a.set.sheets[0])).toBe(true);
    expect(sheetType(a.set.sheets[0])).toBe('sld');
    const h1 = sheetHash(two, a.set, a.set.sheets[0]);
    expect(sheetHash({ ...two, drawing: { ...two.drawing, notes: ['A new general note'] } }, a.set, a.set.sheets[0])).not.toBe(h1);
  });
  it('board sheets with the schedule: one per DB in order, an existing one turned on', () => {
    const dbs = sampleProject.boards.filter((b) => b.kind === 'DB').map((b) => b.id);
    expect(dbs.length).toBeGreaterThan(0);
    const r = addBoardSheets({ prefix: 'E-SLD-', sheets: [] }, dbs, true);
    expect(r.ids).toHaveLength(dbs.length);
    expect(r.set.sheets.every((s) => s.kind === 'board' && s.schedule)).toBe(true);
    expect(r.set.sheets[0].number).toBe('E-SLD-001'); // board sheets of the set count in the SLD sequence, as before
    expect(r.set.sheets[0].title).toBe(`${dbs[0]} — circuit diagram and load schedule`);
    const plain = addBoardSheets({ prefix: 'E-SLD-', sheets: [] }, [dbs[0]]);
    expect(plain.set.sheets[0].schedule).toBeUndefined();
    const on = addBoardSheets(plain.set, [dbs[0]], true);
    expect(on.set.sheets).toHaveLength(1);
    expect(on.set.sheets[0].schedule).toBe(true);
    // The schedule is part of the fingerprint.
    expect(sheetHash(sampleProject, on.set, on.set.sheets[0])).not.toBe(sheetHash(sampleProject, plain.set, plain.set.sheets[0]));
  });
});
