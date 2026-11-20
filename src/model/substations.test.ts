import { describe, expect, it } from 'vitest';
import { newProject, type Board, type Project } from '../types';
import { mvPlan } from '../diagram/mvArrangement';
import {
  addRmuTo, addSubstation, canMoveSubstation, moveSubstation, newSubstationName, renameSubstation, rmuChoices, rmuChoiceText, rmuConfig, rmuNormallyOpen,
  setSubstationOwner, substationNames, substationRows, txRmu, txSubstation, updateSubstation
} from './substations';

const tx = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, ...extra });
/** SS-1: RMU-1 (RRTT, fuse 100 A) → MDB-1, MDB-2. SS-2: RMU-2 (RRTT, breaker, N/O R2) → MDB-3, and MDB-4 teed off the ring.
 * SS-3: RMU-3 (RRT), feeding nothing yet. MDB-5 on RMU-4, in no substation. */
const p: Project = {
  ...newProject('SS'), voltageV: 400, feeders: [],
  boards: [tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-3', { rmu: 'RMU-2', substation: 'SS-2' }), tx('MDB-4', { substation: 'SS-2' }), tx('MDB-5', { rmu: 'RMU-4' })],
  rmus: [{ name: 'RMU-1', config: 'RRTT', tOff: 'fuse', fuseA: 100, owner: 'authority' }, { name: 'RMU-2', config: 'RRTT', tOff: 'vcb', normallyOpen: 'R2' }, { name: 'RMU-3', config: 'RRT', substation: 'SS-3' }]
};
const rec = (name: string, extra: object = {}) => ({ id: name, name, type: 'conventional' as const, transformers: 1, ...extra });
const shape = (q: Project) => substationRows(q).map((r) => [r.name, r.ring ?? null, r.rmus.map((m) => `${m.name}${m.feeds.length ? `>${m.feeds.join('+')}` : ''}${m.spares ? ` (${m.spares} spare)` : ''}`), r.transformers]);
const checks = (q: Project, name: string) => substationRows(q).find((r) => r.name === name)!.checks.map((k) => `${k.status}: ${k.text}`);
const board = (q: Project, id: string) => q.boards.find((b) => b.id === id)!;

describe('Substations card: rows in ring order', () => {
  it('lists the substations on the ring as drawn, then the ones nothing is drawn of yet', () => {
    expect(shape(p)).toEqual([
      ['SS-1', 0, ['RMU-1>MDB-1+MDB-2'], ['MDB-1', 'MDB-2']],
      ['SS-2', 0, ['RMU-2>MDB-3 (1 spare)'], ['MDB-3', 'MDB-4']],
      ['SS-3', null, ['RMU-3 (1 spare)'], []]
    ]);
    const ss2 = substationRows(p)[1].rmus[0];
    expect([ss2.config, ss2.tOff, ss2.normallyOpen]).toEqual(['RRTT', 'vcb', 'R2']);
    expect(substationNames(p)).toEqual(['SS-1', 'SS-2', 'SS-3']);
    // A record of the Substation area page is a row too. Off the ring, as on it, the recorded ones come first.
    expect(substationNames({ ...p, substations: [rec('SS-1'), rec('SS-9')] })).toEqual(['SS-1', 'SS-2', 'SS-9', 'SS-3']);
    // The records' order is the ring order.
    expect(substationNames({ ...p, substations: [rec('SS-2'), rec('SS-1')] })).toEqual(['SS-2', 'SS-1', 'SS-3']);
  });

  it('checks the tee-offs, the DM-D-013 type, an RMU feeding two substations and the normally open points', () => {
    expect(checks(p, 'SS-1')).toEqual(['ok: 2 of 2 tee-offs used']);
    expect(checks(p, 'SS-2')).toEqual(['ok: 1 tee-off spare']);
    // A POCKET type takes two transformers; its DM-D-013 form counts one.
    const pocket = { ...p, substations: [rec('SS-1'), rec('SS-2', { type: 'pocket' })] };
    expect(checks(pocket, 'SS-2')).toEqual(['ok: POCKET type: up to 2 transformers', 'warn: Substation area form: 1 transformer', 'ok: 1 tee-off spare']);
    expect(checks({ ...p, substations: [rec('SS-2', { type: 'conventional-open' })] }, 'SS-2')[0]).toBe('bad: 2 transformers: Open roof takes 1');
    // A third transformer on RMU-1, named in another substation.
    const over: Project = { ...p, boards: [...p.boards, tx('MDB-6', { rmu: 'RMU-1', substation: 'SS-9' })] };
    expect(checks(over, 'SS-1')).toEqual(['bad: RMU-1: 3 transformers on 2 tee-offs', 'warn: RMU-1 also feeds SS-9']);
    // Two normally open points on one ring leave the RMUs between them without supply.
    const two: Project = { ...p, rmus: p.rmus!.map((r) => (r.name === 'RMU-1' ? { ...r, normallyOpen: 'R1' as const } : r)) };
    expect(checks(two, 'SS-1')).toContain('warn: 2 normally open points on this ring');
    expect(checks(two, 'SS-2')).toContain('warn: 2 normally open points on this ring');
  });
});

describe('Substations card: edits', () => {
  it('+ Substation adds the next SS-n after the others, keeping every row as a record in the order shown', () => {
    expect(newSubstationName(p)).toBe('SS-4');
    const r = addSubstation(p);
    expect(r.name).toBe('SS-4');
    expect(r.project.substations!.map((s) => [s.name, s.type, s.transformers])).toEqual([['SS-1', 'conventional', 2], ['SS-2', 'conventional', 2], ['SS-3', 'conventional', 1], ['SS-4', 'conventional', 1]]);
    expect(substationNames(r.project)).toEqual(['SS-1', 'SS-2', 'SS-3', 'SS-4']);
  });

  it('a type or location is the record\'s; the first one keeps the order shown', () => {
    const q = updateSubstation({ ...p, substations: [rec('SS-2', { building: 'Old' })] }, 'ss-2', { type: 'pocket', building: ' Plot 12 ' });
    expect(q.substations!.map((s) => [s.name, s.type, s.building])).toEqual([['SS-2', 'pocket', 'Plot 12'], ['SS-1', 'conventional', undefined], ['SS-3', 'conventional', undefined]]);
    expect(updateSubstation(q, 'SS-2', { building: '' }).substations![0]).not.toHaveProperty('building');
    // Unrecorded rows keep their places when one of them gets a record.
    expect(substationNames(updateSubstation(p, 'SS-3', { type: 'pocket' }))).toEqual(['SS-1', 'SS-2', 'SS-3']);
  });

  it('▲ ▼ change the ring order the SLD draws, next to a substation on the same ring', () => {
    const rows = substationRows(p);
    expect([canMoveSubstation(rows, 0, -1), canMoveSubstation(rows, 1, -1), canMoveSubstation(rows, 1, 1), canMoveSubstation(rows, 2, -1)]).toEqual([false, true, false, false]);
    const q = moveSubstation(p, 'SS-2', -1);
    expect(substationNames(q)).toEqual(['SS-2', 'SS-1', 'SS-3']);
    expect(mvPlan(q).order).toEqual(['MDB-3', 'MDB-4', 'MDB-1', 'MDB-2', 'MDB-5']);
    expect(moveSubstation(p, 'SS-3', -1)).toBe(p);
  });

  it('a rename reaches the main boards, the RMU records and the record; a name in use is refused', () => {
    const q = renameSubstation({ ...p, substations: [rec('SS-3')] }, 'SS-3', 'SS-30').project;
    expect([q.rmus!.find((r) => r.name === 'RMU-3')?.substation, q.substations![0].name]).toEqual(['SS-30', 'SS-30']);
    const r = renameSubstation(p, 'SS-1', 'SS-10').project;
    expect(['MDB-1', 'MDB-2'].map((id) => board(r, id).substation)).toEqual(['SS-10', 'SS-10']);
    expect(renameSubstation(p, 'SS-1', 'ss-2')).toEqual({ project: p, problem: 'ss-2 is already a substation' });
    expect(renameSubstation(p, 'SS-1', ' ').project).toBe(p);
  });

  it('the owner is set on each of the substation\'s RMUs; + RMU adds one that starts as RRT', () => {
    const q = setSubstationOwner(p, 'SS-1', 'consumer');
    expect(q.rmus!.map((r) => [r.name, r.owner ?? null])).toEqual([['RMU-1', 'consumer'], ['RMU-2', null], ['RMU-3', null]]);
    const r = addRmuTo(p, 'SS-1');
    expect(r.name).toBe('RMU-5');
    expect(r.project.rmus!.find((x) => x.name === 'RMU-5')).toEqual({ name: 'RMU-5', config: 'RRT', substation: 'SS-1' });
    expect(shape(r.project)[0][2]).toEqual(['RMU-1>MDB-1+MDB-2', 'RMU-5 (1 spare)']);
  });
});

describe('a transformer\'s RMU and substation', () => {
  it('lists the RMUs with what they can take: free tee-offs, full, or a bigger unit', () => {
    expect(rmuChoices(p, 'MDB-5').map(rmuChoiceText)).toEqual(['RMU-1 · RRTT → RRTTT', 'RMU-2 · RRTT · 1 free', 'RMU-4', 'RMU-3 · RRT · 1 free']);
    expect(rmuChoices(p, 'MDB-1')[0]).toMatchObject({ name: 'RMU-1', current: true, count: 2, max: 2 });
  });

  it('puts it on an RMU: into the RMU\'s substation, a full RRTT unit made RRTTT, a new one RRT', () => {
    const a = txRmu(p, 'MDB-5', 'RMU-2');
    expect([board(a.project, 'MDB-5').rmu, board(a.project, 'MDB-5').substation, a.message]).toEqual(['RMU-2', 'SS-2', 'TX-5 now on RMU-2 · in SS-2']);
    const b = txRmu(p, 'MDB-4', 'RMU-1');
    expect([board(b.project, 'MDB-4').substation, b.project.rmus![0].config, b.message]).toEqual(['SS-1', 'RRTTT', 'TX-4 now on RMU-1 · RMU-1 is now RRTTT · in SS-1']);
    expect(txRmu(b.project, 'MDB-5', 'RMU-1')).toEqual({ project: b.project, message: 'RMU-1 is full: 3 of 3 tee-offs in use' });
    // An RMU that feeds no transformer yet is in the substation its record names.
    expect(txRmu(p, 'MDB-5', 'RMU-3').message).toBe('TX-5 now on RMU-3 · in SS-3');
    const c = txRmu(p, 'MDB-4', '+');
    expect([board(c.project, 'MDB-4').rmu, c.project.rmus!.find((r) => r.name === 'RMU-5'), c.message]).toEqual(['RMU-5', { name: 'RMU-5', config: 'RRT' }, 'TX-4 now on a new RMU, RMU-5 (RRT)']);
    expect(board(txRmu(p, 'MDB-5', '').project, 'MDB-5').rmu).toBeUndefined();
    expect(txRmu(p, 'MDB-1', 'RMU-1')).toEqual({ project: p, message: 'TX-1 is on RMU-1 already' });
  });

  it('moves it to a substation: off an RMU it shares, with an RMU of its own', () => {
    const a = txSubstation(p, 'MDB-2', 'SS-2');
    expect([board(a.project, 'MDB-2').substation, board(a.project, 'MDB-2').rmu, a.message]).toEqual(['SS-2', undefined, 'TX-2 is now in SS-2 · off RMU-1, which stays']);
    const b = txSubstation(p, 'MDB-3', 'SS-1');
    expect([board(b.project, 'MDB-3').rmu, b.message]).toEqual(['RMU-2', 'TX-3 is now in SS-1']);
    expect(substationRows(b.project)[0].rmus.map((m) => m.name)).toEqual(['RMU-1', 'RMU-2']);
    // An RMU record that names a substation follows its only transformer.
    const own = txRmu(p, 'MDB-5', 'RMU-3').project;
    expect(txSubstation(own, 'MDB-5', 'SS-1').project.rmus!.find((r) => r.name === 'RMU-3')?.substation).toBe('SS-1');
    expect(txSubstation(p, 'MDB-1', 'ss-1')).toEqual({ project: p, message: 'TX-1 is in ss-1 already' });
    expect(txSubstation(p, 'MDB-1', '').message).toBe('TX-1 is in no substation now · off RMU-1, which stays');
  });

  it('an RMU\'s configuration and its normally open switch; a single ring switch keeps none', () => {
    const a = rmuConfig(p, 'RMU-2', 'RT');
    expect([a.project.rmus![1], a.message]).toEqual([{ name: 'RMU-2', config: 'RT', tOff: 'vcb' }, 'RMU-2 is now RT']);
    expect(rmuConfig(p, 'RMU-2', 'RRTTT').project.rmus![1].normallyOpen).toBe('R2');
    expect(rmuNormallyOpen(p, 'RMU-1', 'R1').project.rmus![0].normallyOpen).toBe('R1');
    const off = rmuNormallyOpen(p, 'RMU-2', undefined);
    expect([off.project.rmus![1], off.message]).toEqual([{ name: 'RMU-2', config: 'RRTT', tOff: 'vcb' }, 'RMU-2: no normally open switch']);
  });
});
