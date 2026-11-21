import { describe, expect, it } from 'vitest';
import { newProject, type Feeder, type Project } from '../types';
import { DEFAULT_TYPES, newAssessment, type LoadAssessment } from './loadAssessment';
import { assessmentFeeders, createMdbFromAssessment } from './loadAssessmentMdb';
import { designedByLump, expectedLumps, lumpKeyOf, lumpOfLoad, reconcileLumps } from './loadAssessmentLumps';
import { addServices, generateBuildingDbs, type ServiceItem } from './buildingDesign';
import { newBuilding } from './building';

const res = (patch: Partial<LoadAssessment> = {}): LoadAssessment => ({
  ...newAssessment(DEFAULT_TYPES[0], { gfaM2: 24000, floors: 20, parkingM2: 8000 }, { types: [] }),
  custom: [{ id: 'c1', label: 'Rooftop BMU', qty: 2, kw: 15, diversity: 0.5, onGenerator: true }],
  ...patch
});
const base = () => createMdbFromAssessment({ ...newProject('Test'), boards: [], feeders: [] }, res(), undefined);
const svc = (id: string, kw: number, qty: number, loadType: ServiceItem['loadType'] = 'motor'): ServiceItem => ({ id, label: id, kw, qty, loadType });
const lumpKw = (p: Project, key: string) => p.feeders.filter((f) => f.fromRoom === `la:${key}`).reduce((s, f) => s + f.loadKw, 0);
const has = (p: Project, key: string) => p.feeders.some((f) => f.fromRoom === `la:${key}`);
const mdb = (p: Project) => p.boards[0].id;

describe('lump feeders reduced by designed loads', () => {
  it('lumpKeyOf and lumpOfLoad', () => {
    const f = { id: 'x', loadKw: 1 } as Feeder;
    expect(lumpKeyOf({ ...f, fromRoom: 'la:pump-e' })).toBe('pump');
    expect(lumpKeyOf({ ...f, fromRoom: 'la:stair2' })).toBe('stair');
    expect(lumpKeyOf({ ...f, fromRoom: 'room:1' })).toBeUndefined();
    expect(lumpOfLoad({ ...f, fromRoom: 'svc:booster' })).toBe('pump');
    expect(lumpOfLoad({ ...f, points: { wh: 1, ltg: 3 } })).toBe('dhw');
    expect(lumpOfLoad({ ...f, points: { fcu: 1, s13: 2 } })).toBe('hvac');
    expect(lumpOfLoad({ ...f, points: { cfan: 1 } })).toBe('ltg');
    expect(lumpOfLoad({ ...f, loadType: 'sockets' })).toBe('pwr');
    expect(lumpOfLoad({ ...f, loadType: 'motor' })).toBeUndefined();
    expect(lumpOfLoad({ ...f, fromRoom: 'svc:lift', existing: true })).toBeUndefined();
    expect(lumpOfLoad({ ...f, fromRoom: 'svc:lift', feedsBoardId: 'DB' })).toBeUndefined();
  });

  it('lifts remove the lump when they cover it and reduce it otherwise; idempotent', () => {
    const made = base().project, id = mdb(made), a = res();
    const full = lumpKw(made, 'lift') + lumpKw(made, 'lift-e');
    const part = addServices(made, id, [svc('lift', 4, 2)]).project;
    const r1 = reconcileLumps(part, a);
    expect(lumpKw(r1.project, 'lift')).toBeCloseTo(full - 8, 1);
    expect(r1.changes[0]).toMatchObject({ key: 'lift', fromKw: expect.closeTo(full, 1), toKw: expect.closeTo(full - 8, 1) });
    expect(reconcileLumps(r1.project, a)).toEqual({ project: r1.project, changes: [] });
    const all = addServices(made, id, [svc('lift', full, 1)]).project;
    expect(has(reconcileLumps(all, a).project, 'lift')).toBe(false);
    // Removing the services brings a reduced lump back, but a removed one stays gone.
    const gone = reconcileLumps({ ...r1.project, feeders: r1.project.feeders.filter((f) => !f.fromRoom?.startsWith('svc:')) }, a).project;
    expect(lumpKw(gone, 'lift')).toBeCloseTo(full, 1);
    const removed = reconcileLumps(all, a).project;
    expect(has(reconcileLumps({ ...removed, feeders: removed.feeders.filter((f) => !f.fromRoom?.startsWith('svc:')) }, a).project, 'lift')).toBe(false);
  });

  it('a split lump is reduced in proportion', () => {
    const made = base().project, a = res();
    const n = lumpKw(made, 'pump'), e = lumpKw(made, 'pump-e');
    expect(e).toBeGreaterThan(0);
    const r = reconcileLumps(addServices(made, mdb(made), [svc('booster', (n + e) / 4, 1)]).project, a).project;
    expect(lumpKw(r, 'pump')).toBeCloseTo(n * 0.75, 1);
    expect(lumpKw(r, 'pump-e')).toBeCloseTo(e * 0.75, 1);
  });

  it('a fire pump service removes la:fire; a hand-made motor changes nothing', () => {
    const made = base().project, a = res();
    const fire = reconcileLumps(addServices(made, mdb(made), [svc('fire', 55, 1, 'fire-pump')]).project, a).project;
    expect(has(fire, 'fire')).toBe(false);
    expect(has(fire, 'jockey')).toBe(true);
    const hand: Feeder = { ...made.feeders[0], id: 'H1', fromRoom: undefined, loadType: 'motor', loadKw: 50 };
    const r = reconcileLumps({ ...made, feeders: [...made.feeders, hand] }, a);
    expect(r.changes).toEqual([]);
    expect(r.project.feeders).toHaveLength(made.feeders.length + 1);
  });

  it('existing feeders and incomers are ignored', () => {
    const made = base().project, a = res();
    const proto = { ...made.feeders[0], fromRoom: 'svc:lift', loadKw: 500 };
    const p = { ...made, feeders: [...made.feeders, { ...proto, id: 'E1', existing: true }, { ...proto, id: 'I1', feedsBoardId: 'DB-X' }] };
    expect(designedByLump(p).lift).toBeUndefined();
    expect(reconcileLumps(p, a).changes).toEqual([]);
  });

  it('room circuits from generated DBs reduce ltg, pwr and hvac', () => {
    const b = { ...newBuilding('T1', 'Tower'), levels: [{ id: 'T', name: 'Typical', kind: 'typical' as const, heightM: 3.5, count: 2, units: [{ unitTypeId: '2br', count: 2 }] }] };
    const withBuilding: Project = { ...base().project, building: { buildings: [b], rooms: [], unitTypes: [{ id: '2br', name: '2BR', rooms: [{ name: 'Living', type: 'apartment', areaM2: 40 }, { name: 'Bedroom 1', type: 'apartment', areaM2: 16 }] }] } };
    const a = res();
    const g = generateBuildingDbs(withBuilding, 'T1', withBuilding.boards[0].id).project;
    const d = designedByLump(g);
    expect(d.ltg).toBeGreaterThan(0);
    expect(d.pwr).toBeGreaterThan(0);
    expect(d.hvac).toBeGreaterThan(0);
    const exp = expectedLumps(g, a), before = assessmentFeeders(a);
    for (const k of ['ltg', 'pwr', 'hvac']) expect(exp.find((x) => x.key === k)!.kw).toBeLessThan(before.find((x) => x.key === k)!.kw);
    const r = reconcileLumps(g, a);
    expect(r.changes.map((c) => c.key)).toEqual(expect.arrayContaining(['ltg', 'pwr', 'hvac']));
  });
});
