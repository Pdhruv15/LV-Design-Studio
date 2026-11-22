import { describe, expect, it } from 'vitest';
import { newProject, type Project } from '../types';
import { supplyMode } from '../diagram/supplyPoint';
import { mvPlan, type RmuItem } from '../diagram/mvArrangement';
import { parallelGroup } from '../calc/electrical';
import { runCalculations } from '../calc/runs';
import { projectInputIssues } from './projectValidate';
import { applyReference, BUILT_IN_REFERENCES, fedFromOf } from './designReference';
import { applyStartLevel, DEFAULT_START, startLevelText, startOpensMv, START_LEVELS, type StartChoice } from './startLevel';

const make = (c: StartChoice, p: Project = newProject('X')) => applyStartLevel(p, c);
const modes = (p: Project) => p.boards.map((b) => supplyMode(b));
const CHOICES: StartChoice[] = [{ level: 'db' }, { level: 'submain' }, { level: 'source' }, { level: 'transformer' }, { level: 'rmu' }, { level: 'rmu', transformers: 2 }, { level: 'ring' }];

describe('start level of a new project', () => {
  it('lists the six starts in order', () => {
    expect(START_LEVELS.map((l) => l.id)).toEqual(['db', 'submain', 'source', 'transformer', 'rmu', 'ring']);
    expect(DEFAULT_START).toEqual({ level: 'transformer' });
  });
  it('transformer returns the same project; a project with two boards is left alone', () => {
    const p = newProject('X');
    expect(make({ level: 'transformer' }, p)).toBe(p);
    const two = { ...p, boards: [...p.boards, { ...p.boards[0], id: 'MDB-2' }] };
    expect(make({ level: 'db' }, two)).toBe(two);
    const fed = { ...p, feeders: [{ id: 'F' }] } as unknown as Project;
    expect(make({ level: 'ring' }, fed)).toBe(fed);
  });
  it('final DB and sub-main board are what a canvas drop makes, fed from a board', () => {
    const db = make({ level: 'db' });
    expect(db.boards.map((b) => [b.id, b.kind, b.ratedCurrentA, b.supply])).toEqual([['DB-1', 'DB', 63, { fedBy: 'board' }]]);
    const sm = make({ level: 'submain' });
    expect(sm.boards.map((b) => [b.id, b.name, b.kind, b.ratedCurrentA, b.supply])).toEqual([['SMDB-1', 'SMDB 1', 'SMDB', 250, { fedBy: 'board' }]]);
    expect(modes(db)).toEqual(['board']); expect(modes(sm)).toEqual(['board']);
    expect(sm.feeders).toEqual([]);
  });
  it('main board, LV source: no transformer, rating kept', () => {
    const p = make({ level: 'source' });
    expect(p.boards).toHaveLength(1);
    expect(p.boards[0]).toMatchObject({ id: 'MDB-1', ratedCurrentA: 1600 });
    expect(p.boards[0].sourceKva).toBeUndefined();
    expect(p.boards[0].sourceImpedancePct).toBeUndefined();
    expect(modes(p)).toEqual(['source']);
  });
  it('the source board takes the design reference name, and has none without one', () => {
    expect(make({ level: 'source' }).boards[0].supply?.fedFrom).toBeUndefined();
    const ref = BUILT_IN_REFERENCES.map((r) => applyReference(newProject('X'), r)).find((p) => fedFromOf(p).fedFrom)!;
    expect(make({ level: 'source' }, ref).boards[0].supply?.fedFrom).toBe(fedFromOf(ref).fedFrom);
  });
  it('RMU with one transformer: RRT, no substation, no grid source', () => {
    const p = make({ level: 'rmu' });
    expect(p.boards.map((b) => [b.id, b.rmu])).toEqual([['MDB-1', 'RMU-1']]);
    expect(p.rmus).toEqual([{ name: 'RMU-1', config: 'RRT' }]);
    expect(p.ties ?? []).toEqual([]); expect(p.gridSources ?? []).toEqual([]); expect(p.substations ?? []).toEqual([]);
    expect(modes(p)).toEqual(['transformer']);
  });
  it('RMU with two transformers: RRTT, open bus coupler', () => {
    const p = make({ level: 'rmu', transformers: 2 });
    expect(p.boards.map((b) => [b.id, b.name, b.rmu])).toEqual([['MDB-1', 'Main Distribution Board 1', 'RMU-1'], ['MDB-2', 'Main Distribution Board 2', 'RMU-1']]);
    expect(p.rmus).toEqual([{ name: 'RMU-1', config: 'RRTT' }]);
    expect(p.ties).toEqual([{ id: 'BC-MDB-1-MDB-2', a: 'MDB-1', b: 'MDB-2', ratingA: 1600 }]);
    expect(modes(p)).toEqual(['transformer', 'transformer']);
    expect(parallelGroup(p, 'MDB-1').map((b) => b.id)).toEqual(['MDB-1']);
    const rings = mvPlan(p).rings;
    expect(rings).toHaveLength(1);
    const rmu = rings[0].items[0] as RmuItem;
    expect(rmu.tees.filter(Boolean)).toEqual(['MDB-1', 'MDB-2']);
  });
  it('11 kV ring: grid source, two substations, two RMUs, two transformers, no coupler', () => {
    const p = make({ level: 'ring' });
    expect(p.gridSources).toHaveLength(1);
    expect(p.gridSources![0].operator).toBeUndefined();
    expect(p.substations?.map((s) => s.name)).toEqual(['SS-1', 'SS-2']);
    expect(p.rmus?.map((r) => [r.name, r.config, r.substation])).toEqual([['RMU-1', 'RRT', 'SS-1'], ['RMU-2', 'RRT', 'SS-2']]);
    expect(p.boards.map((b) => [b.id, b.rmu, b.substation])).toEqual([['MDB-1', 'RMU-1', 'SS-1'], ['MDB-2', 'RMU-2', 'SS-2']]);
    expect(p.ties ?? []).toEqual([]);
    expect(modes(p)).toEqual(['transformer', 'transformer']);
    const rings = mvPlan(p).rings;
    expect(rings).toHaveLength(1);
    expect(rings[0].items.filter((i) => i.kind === 'rmu')).toHaveLength(2);
  });
  it('every board has its own uid', () => {
    for (const c of CHOICES) {
      const uids = make(c).boards.map((b) => b.uid);
      expect(uids.every(Boolean)).toBe(true);
      expect(new Set(uids).size).toBe(uids.length);
    }
  });
  it('every start calculates and has no input errors', () => {
    for (const c of CHOICES) {
      const p = make(c);
      expect(() => runCalculations(p)).not.toThrow();
      expect(projectInputIssues(p).filter((i) => i.status === 'bad')).toEqual([]);
    }
  });
  it('texts and the MV opening', () => {
    expect(startLevelText({ level: 'db' })).toBe('Final DB');
    expect(startLevelText({ level: 'rmu' })).toBe('RMU and one transformer');
    expect(startLevelText({ level: 'rmu', transformers: 2 })).toBe('RMU and two transformers, bus coupler normally open');
    expect(CHOICES.filter(startOpensMv).map((c) => c.level)).toEqual(['rmu', 'rmu', 'ring']);
  });
});
