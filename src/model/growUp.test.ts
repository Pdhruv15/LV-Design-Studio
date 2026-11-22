import { describe, expect, it } from 'vitest';
import { evaluateEarthing } from '../calc/earthing';
import { evaluateFeeder } from '../calc/electrical';
import { runCalculations } from '../calc/runs';
import type { Board, Feeder, Project } from '../types';
import { addUpstreamBoard, connectBlocked, connectPlan, connectTo, FEEDING_KINDS, growBlocked, upstreamKind, upstreamPlan } from './growUp';
import { checkReferences } from './integrity';
import { moveBoard } from './moveBoard';
import { projectInputIssues } from './projectValidate';
import { setFedFrom } from './supplyEdit';

// The compact project of supplyIncomer.test: a first board with the given values, the incoming cable and one 24 kW load.
const load: Feeder = { id: 'F', boardId: 'DB-1', name: 'F', loadKw: 24, demandFactor: 1, powerFactor: 0.9, lengthM: 20, cableCsaMm2: 10, cores: 4, breakerRatingA: 40, breakerIcuKa: 36 };
const given = { faultKa: 12, xr: 3, ratingA: 63, device: 'MCCB' as const, vdUsedPct: 1.6, incomer: { cableCsaMm2: 16, lengthM: 25 } };
const proj = (supply?: Board['supply'], over: Partial<Board> = {}, extra: Partial<Project> = {}): Project =>
  ({ name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '', boards: [{ id: 'DB-1', name: 'DB 1', kind: 'DB', ratedCurrentA: 63, ...(supply ? { supply } : {}), ...over }], feeders: [load], ...extra });
const outside = (s: Board['supply'] = given) => proj({ fedBy: 'board', ...s });
const figures = (p: Project) => { const r = evaluateFeeder(p, p.feeders.find((f) => f.id === 'F')!); return { ik: r.breakerFaultKA, vd: r.vdTotalPct, zs: evaluateEarthing(p, p.feeders.find((f) => f.id === 'F')!).zsOhm }; };
const board = (p: Project, id: string) => p.boards.find((b) => b.id === id)!;
const firsts = (p: Project) => p.boards.filter((b) => !b.upstreamId).map((b) => b.id);

describe('Add upstream board: the results at the old board do not change', () => {
  const cases: [string, Board['supply']][] = [
    ['typed cable', given],
    ['cpc, parallel runs and Ze', { ...given, zeOhm: 0.35, incomer: { cableCsaMm2: 95, lengthM: 40, parallel: 2, cpcMm2: 25, cores: 4 } }]
  ];
  it.each(cases)('%s: Ik″, drop and Zs are equal before and after', (_n, s) => {
    const p = outside(s), before = figures(p);
    const r = addUpstreamBoard(p, 'DB-1');
    expect(r.project).not.toBe(p);
    const after = figures(r.project);
    expect(after.ik).toBeCloseTo(before.ik, 6);
    expect(after.vd).toBeCloseTo(before.vd, 6);
    expect(after.zs).toBeCloseTo(before.zs, 6);
  });
  it('no cable typed: the default way is new, so the fault level falls and the drop grows by it', () => {
    const p = outside({ fedBy: 'board', faultKa: 12 }), r = addUpstreamBoard(p, 'DB-1');
    expect(figures(r.project).ik).toBeLessThan(figures(p).ik);
    expect(figures(r.project).vd).toBeGreaterThan(figures(p).vd);
    const inc = r.project.feeders.find((f) => f.feedsBoardId === 'DB-1')!;
    expect(inc.lengthToCheck).toBe(true);
    expect(inc.lengthM).toBe(30);
  });
});

describe('Add upstream board: the model after it', () => {
  it('N is the only first board with the given values; X has the board above; one feeder N → X', () => {
    const p = outside(), copy = structuredClone(p), r = addUpstreamBoard(p, 'DB-1');
    expect(p).toEqual(copy);
    const q = r.project, n = board(q, 'SMDB-1'), x = board(q, 'DB-1');
    expect(firsts(q)).toEqual(['SMDB-1']);
    expect(n.kind).toBe('SMDB');
    expect(n.supply).toEqual({ fedBy: 'board', faultKa: 12, xr: 3, vdUsedPct: 1.6 });
    expect(x.upstreamId).toBe('SMDB-1');
    expect(x.supply).toBeUndefined();
    expect(q.boards.map((b) => b.id)).toEqual(['SMDB-1', 'DB-1']);
    const inc = q.feeders.filter((f) => f.feedsBoardId === 'DB-1');
    expect(inc).toHaveLength(1);
    expect(inc[0]).toMatchObject({ id: 'INC-DB-1', boardId: 'SMDB-1', cableCsaMm2: 16, lengthM: 25, cores: 4, breakerRatingA: 63, breakerType: 'MCCB', device: 'MCCB', breakerIcuKa: 36 });
    expect(inc[0].lengthToCheck).toBeUndefined();
    expect(r.select).toEqual({ type: 'board', id: 'SMDB-1' });
    expect(r.message).toBe('Added SMDB-1 above DB-1: the incoming cable 4C × 16 mm², 25 m with its 63 A MCCB is now the way to DB-1; the given values moved to SMDB-1');
    expect(n.supply).not.toHaveProperty('device');
    expect(n.supply).not.toHaveProperty('incomer');
  });
  it('no typed cable: the default way, to check', () => {
    const r = addUpstreamBoard(outside({ fedBy: 'board', faultKa: 12 }), 'DB-1');
    expect(r.message).toMatch(/a 63 A way with 4C × \d+ mm² cable, 30 m, was added.*check the cable length/);
  });
  it('the reference: typed name when free, a used name, opts', () => {
    const named = (fedFrom: string | undefined, over: Partial<Project> = {}) => addUpstreamBoard({ ...outside({ fedBy: 'board', fedFrom, faultKa: 12 }), ...over }, 'DB-1');
    let r = named('SMDB-3F');
    expect(board(r.project, 'SMDB-3F')).toMatchObject({ name: 'SMDB-3F', kind: 'SMDB' });
    expect(board(r.project, 'SMDB-3F').supply).toEqual({ fedBy: 'board', faultKa: 12 });
    expect(board(named('MDB-A').project, 'MDB-A').kind).toBe('MDB');
    expect(board(named('Block A').project, 'Block A')).toMatchObject({ name: 'Block A', kind: 'SMDB' });
    expect(board(named('DB-1').project, 'SMDB-1')).toBeDefined();
    expect(board(named('  ').project, 'SMDB-1')).toBeDefined();
    r = addUpstreamBoard(outside(), 'DB-1', { kind: 'MCC', id: 'MCC-X' });
    expect(board(r.project, 'MCC-X')).toMatchObject({ kind: 'MCC', name: 'MCC-X', ratedCurrentA: 400 });
    expect(board(addUpstreamBoard(outside(), 'DB-1', { kind: 'MDB' }).project, 'MDB-1').kind).toBe('MDB');
    expect(addUpstreamBoard(outside(), 'DB-1', { id: 'SMDB-9' }).project.boards[0].name).toBe('SMDB-9');
    expect(addUpstreamBoard(outside(), 'DB-1', { id: 'SMDB-1' }).project.boards[0].name).toBe('SMDB 1');
    const used = addUpstreamBoard(outside(), 'DB-1', { id: 'F' });
    expect(used.message).toBe('F already exists in the project');
    expect(addUpstreamBoard(outside(), 'DB-1', { id: ' ' }).message).toBe('The reference is empty');
    expect(addUpstreamBoard(outside(), 'DB-1', { id: 'DB-1' }).project.boards).toHaveLength(1);
  });
  it('the rating is the largest of the type, the board and the way', () => {
    const big = addUpstreamBoard(proj({ fedBy: 'board', ratingA: 630, device: 'ACB', incomer: { cableCsaMm2: 240, lengthM: 20, parallel: 2 } }, { ratedCurrentA: 400 }), 'DB-1');
    expect(board(big.project, 'SMDB-1').ratedCurrentA).toBe(630);
    expect(big.project.feeders.find((f) => f.feedsBoardId === 'DB-1')).toMatchObject({ breakerType: 'ACB', parallel: 2, breakerRatingA: 630 });
    expect(board(addUpstreamBoard(outside(), 'DB-1').project, 'SMDB-1').ratedCurrentA).toBe(250);
    expect(board(addUpstreamBoard(proj({ fedBy: 'board' }, { ratedCurrentA: 400 }), 'DB-1').project, 'SMDB-1').ratedCurrentA).toBe(400);
  });
  it('every row of the type table', () => {
    const rows: [Board['kind'], string][] = [['DB', 'SMDB'], ['EDB', 'ESMDB'], ['SMDB', 'MDB'], ['MCC', 'MDB'], ['FP', 'MDB'], ['UPS', 'MDB'], ['EMDB', 'MDB'], ['LV-EMDB', 'MDB'], ['ESMDB', 'EMDB'], ['EMCC', 'EMDB'], ['MDB', 'transformer'], ['LV-MDB', 'transformer'], ['LV-ACB', 'transformer'], [undefined, 'transformer']];
    for (const [kind, above] of rows) expect(upstreamKind({ id: 'X', name: 'X', kind })).toBe(above);
    expect(FEEDING_KINDS).toContain('MDB');
  });
  it('a main board gets the transformer, the same as the Supply tab', () => {
    const p = proj({ fedBy: 'board', faultKa: 12 }, { kind: 'MDB' });
    const r = addUpstreamBoard(p, 'DB-1');
    expect(board(r.project, 'DB-1')).toEqual(setFedFrom(p, board(p, 'DB-1'), 'transformer'));
    expect(r.project.boards).toHaveLength(1);
    expect(r.message).toMatch(/^Added a 1000 kVA transformer to DB-1/);
    expect(r.select).toEqual({ type: 'board', id: 'DB-1' });
    // With a kind chosen, a board is made above the main board instead.
    expect(board(addUpstreamBoard(p, 'DB-1', { kind: 'LV-ACB' }).project, 'LV-ACB-1')).toBeDefined();
  });
  it('unset and source modes', () => {
    const u = addUpstreamBoard(proj(), 'DB-1');
    expect(board(u.project, 'SMDB-1').supply).toBeUndefined();
    expect(u.message).not.toMatch(/given values/);
    const s = addUpstreamBoard(proj({ fedFrom: 'Utility A', kind: 'pv', ref: 'R1', meter: 'CT', ctRatio: '400/5A', cable: 'BY SUPPLIER', ecc: '1X35', faultKa: 20, device: 'ACB', ratingA: 400, irSetting: 0.9, incomer: { cableCsaMm2: 120, lengthM: 15 } }), 'DB-1');
    expect(board(s.project, 'SMDB-1').supply).toEqual({ fedFrom: 'Utility A', kind: 'pv', ref: 'R1', meter: 'CT', ctRatio: '400/5A', cable: 'BY SUPPLIER', ecc: '1X35', faultKa: 20 });
    expect(board(s.project, 'DB-1').protection?.irSetting).toBe(0.9);
    expect(s.project.feeders.find((f) => f.feedsBoardId === 'DB-1')).toMatchObject({ device: 'ACB', breakerType: 'ACB', breakerRatingA: 400 });
  });
  it('the Ir setting stays at the board, the earth pits go to the new board', () => {
    const p = outside({ ...given, irSetting: 0.85 });
    const withPits = { ...p, boards: p.boards.map((b) => ({ ...b, earthing: { pits: 3 }, protection: { irSetting: 0.7 } })) };
    const r = addUpstreamBoard(withPits, 'DB-1');
    expect(board(r.project, 'DB-1').protection?.irSetting).toBe(0.7);
    expect(board(r.project, 'DB-1').earthing).toBeUndefined();
    expect(board(r.project, 'SMDB-1').earthing).toEqual({ pits: 3 });
    expect(board(addUpstreamBoard(p, 'DB-1').project, 'DB-1').protection?.irSetting).toBe(0.85);
  });
  it('twice in a row: a chain of three, then the transformer; consistent and unchanged results', () => {
    const p = outside(), before = figures(p);
    const a = addUpstreamBoard(p, 'DB-1').project, b = addUpstreamBoard(a, 'SMDB-1').project, c = addUpstreamBoard(b, 'MDB-1').project;
    expect(b.boards.map((x) => [x.id, x.upstreamId])).toEqual([['MDB-1', undefined], ['SMDB-1', 'MDB-1'], ['DB-1', 'SMDB-1']]);
    expect(board(b, 'MDB-1').supply).toEqual({ fedBy: 'board', faultKa: 12, xr: 3, vdUsedPct: 1.6 });
    expect(board(c, 'MDB-1').sourceKva).toBe(1000);
    for (const q of [a, b, c]) {
      expect(checkReferences(q)).toEqual([]);
      expect(projectInputIssues(q)).toEqual([]);
      expect(() => runCalculations(q)).not.toThrow();
    }
    // Two steps with a default way in the middle add a cable of their own; compare the one step.
    expect(figures(a).ik).toBeCloseTo(before.ik, 6);
    expect(figures(a).vd).toBeCloseTo(before.vd, 6);
  });
  it('refuses a board with an upstream, a transformer, a meter cabinet, a bus coupler and a missing board', () => {
    const q = addUpstreamBoard(outside(), 'DB-1').project;
    expect(growBlocked(q, 'DB-1')).toMatch(/fed from SMDB-1/);
    expect(growBlocked(proj(undefined, { sourceKva: 500, sourceImpedancePct: 5 }), 'DB-1')).toMatch(/own transformer/);
    expect(growBlocked(proj(undefined, { kind: 'MC' }), 'DB-1')).toMatch(/supply point/);
    expect(growBlocked(proj(undefined, {}, { ties: [{ id: 'BC-1', a: 'DB-1', b: 'X', ratingA: 400 }] }), 'DB-1')).toBe('Remove bus coupler BC-1 first');
    expect(growBlocked(q, 'ZZ')).toBe('Board not found');
    expect(growBlocked(outside(), 'DB-1')).toBeUndefined();
    for (const [pr, id] of [[q, 'DB-1'], [q, 'ZZ']] as const) { const r = addUpstreamBoard(pr, id); expect(r.project).toBe(pr); expect(r.message).toBeTruthy(); }
  });
});

describe('Connect to…', () => {
  const two = (supply: Board['supply'] | null = { fedBy: 'board', ...given }): Project => {
    const p = proj(supply ?? undefined);
    return { ...p, boards: [{ id: 'MDB-1', name: 'MDB 1', kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6 }, ...p.boards] };
  };
  it('the typed cable becomes the way; the given values are gone; the input is unchanged', () => {
    const p = two(), copy = structuredClone(p), r = connectTo(p, 'DB-1', 'MDB-1');
    expect(p).toEqual(copy);
    const x = board(r.project, 'DB-1');
    expect(x.upstreamId).toBe('MDB-1');
    expect(x.supply).toBeUndefined();
    expect(r.project.feeders.find((f) => f.feedsBoardId === 'DB-1')).toMatchObject({ id: 'INC-DB-1', boardId: 'MDB-1', cableCsaMm2: 16, lengthM: 25, breakerRatingA: 63, device: 'MCCB' });
    expect(r.message).toBe('Connected DB-1 to MDB-1 with a 63 A MCCB and 4C × 16 mm², 25 m; the values given for its supply are now calculated');
    expect(r.select).toEqual({ type: 'board', id: 'DB-1' });
    expect(checkReferences(r.project)).toEqual([]);
    expect(() => runCalculations(r.project)).not.toThrow();
  });
  it('without a cable: the default way, length to check; nothing lost from an empty board', () => {
    const p = two(null), r = connectTo(p, 'DB-1', 'MDB-1');
    const f = r.project.feeders.find((x) => x.feedsBoardId === 'DB-1')!;
    expect(f).toMatchObject({ boardId: 'MDB-1', lengthM: 30, lengthToCheck: true, breakerRatingA: 63 });
    expect(r.message).toMatch(/ — check the cable length$/);
    expect(r.message).not.toMatch(/given for its supply/);
    expect(connectPlan(p, 'DB-1', 'MDB-1').loses).toBe(false);
  });
  it('keeps the Ir setting and the earth pits where they are', () => {
    const p = two({ fedBy: 'board', irSetting: 0.8, faultKa: 10 }), q = { ...p, boards: p.boards.map((b) => (b.id === 'DB-1' ? { ...b, earthing: { pits: 2 } } : b)) };
    const x = board(connectTo(q, 'DB-1', 'MDB-1').project, 'DB-1');
    expect(x.protection?.irSetting).toBe(0.8);
    expect(x.earthing).toEqual({ pits: 2 });
  });
  it('refusals: itself, below, missing, a transformer board', () => {
    const p = two(), q = connectTo(p, 'DB-1', 'MDB-1').project;
    expect(connectBlocked(p, 'DB-1', 'DB-1')).toMatch(/can't supply itself/);
    expect(connectBlocked(p, 'DB-1', 'ZZ')).toBe('Board not found');
    expect(connectBlocked(p, 'ZZ', 'DB-1')).toBe('Board not found');
    expect(connectBlocked(p, 'MDB-1', 'DB-1')).toMatch(/own transformer/);
    expect(connectBlocked(q, 'DB-1', 'MDB-1')).toMatch(/fed from MDB-1/);
    const three = addUpstreamBoard(outside(), 'DB-1').project;
    expect(connectBlocked({ ...three, boards: three.boards.map((b) => (b.id === 'DB-1' ? { ...b, upstreamId: undefined } : b)) }, 'SMDB-1', 'DB-1')).toBeUndefined();
    expect(connectBlocked(three, 'SMDB-1', 'DB-1')).toMatch(/DB-1 is fed from SMDB-1/);
    expect(connectBlocked(p, 'DB-1', 'MDB-1')).toBeUndefined();
    for (const to of ['DB-1', 'ZZ']) { const r = connectTo(p, 'DB-1', to); expect(r.project).toBe(p); }
    expect(connectTo(p, 'MDB-1', 'DB-1').project).toBe(p);
  });
  it('moveBoard on a first board uses it; a fed board moves as before', () => {
    const p = two(), r = moveBoard(p, 'DB-1', 'MDB-1');
    expect(r).toEqual(connectTo(p, 'DB-1', 'MDB-1').project);
    expect(moveBoard(p, 'DB-1', 'DB-1')).toBe(p);
    // A board that growBlocked refuses (it has a transformer) moves as it always did: no way is added.
    expect(moveBoard(p, 'MDB-1', 'DB-1').feeders).toBe(p.feeders);
  });
});

describe('the questions', () => {
  it('upstreamPlan: a full supply block, an empty one, a main board', () => {
    const full = upstreamPlan(outside({ ...given, fedFrom: 'SMDB-3F', zeOhm: 0.35, allowedA: 100 }), 'DB-1');
    expect(full).toMatchObject({ transformer: false, kind: 'SMDB', id: 'SMDB-3F', title: 'Add a board above DB-1' });
    expect(full.lines).toEqual([
      'The incoming cable 4C × 16 mm², 25 m and its 63 A MCCB become the way from the new board to DB-1.',
      'The given values (Ik″ 12 kA, X/R 3, drop used 1.6 %, Ze 0.35 Ω, allowed load 100 A) move to the new board.',
      'From then on the values at DB-1 are calculated.'
    ]);
    expect(upstreamPlan(outside({ ...given, fedFrom: 'SMDB-3F' }), 'DB-1', 'MDB').kind).toBe('MDB');
    const src = upstreamPlan(proj({ fedFrom: 'Utility A', meter: 'CT' }), 'DB-1');
    expect(src.lines).toContain('The source Utility A and its meter move to the new board.');
    const empty = upstreamPlan(proj(), 'DB-1');
    expect(empty.lines).toEqual(['A 63 A way with a cable sized for it is added from the new board to DB-1 (30 m, to check).']);
    expect(empty.id).toBe('SMDB-1');
    const main = upstreamPlan(proj({ fedBy: 'board', faultKa: 12 }, { kind: 'MDB' }), 'DB-1');
    expect(main).toEqual({ transformer: true, title: 'Add a transformer to DB-1?', lines: ['DB-1 gets a 1000 kVA transformer with a typical impedance.', 'The values given for its supply are kept but no longer used.'] });
    expect(upstreamPlan(proj(undefined, { kind: 'MDB' }), 'DB-1').lines).toHaveLength(1);
  });
  it('connectPlan', () => {
    const p = { ...outside(), boards: [{ id: 'MDB-1', name: 'M', kind: 'MDB' as const, sourceKva: 1000, sourceImpedancePct: 6 }, ...outside().boards] };
    expect(connectPlan(p, 'DB-1', 'MDB-1')).toEqual({
      title: 'Connect DB-1 to MDB-1?', loses: true,
      lines: ['The incoming cable 4C × 16 mm², 25 m and its 63 A MCCB become the way from MDB-1 to DB-1.', 'The given values (Ik″ 12 kA, X/R 3, drop used 1.6 %) are removed: from then on they are calculated from MDB-1.']
    });
  });
});
