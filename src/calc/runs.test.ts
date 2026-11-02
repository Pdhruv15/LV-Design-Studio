import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from './electrical';
import { fingerprint, runCalculations, staleStudies, STUDY_KEYS } from './runs';
import { network } from '../../tests/fixtures/networks';
import type { Feeder, Project } from '../types';

const change = (id: string, patch: Partial<Feeder>): Project => ({
  ...sampleProject,
  feeders: sampleProject.feeders.map((f) => (f.id === id ? { ...f, ...patch } : f))
});

describe('calculations on demand', () => {
  const run = runCalculations(sampleProject);

  it('a run holds every study for the project it was computed from', () => {
    expect(run.project).toBe(sampleProject);
    expect(run.results).toEqual(evaluateProject(sampleProject));
    expect(run.earthing.length).toBeGreaterThan(0);
    expect(run.selectivity.length).toBeGreaterThan(0);
    expect(staleStudies(run, sampleProject)).toEqual([]);
  });

  it('before any run everything is out of date', () => {
    expect(staleStudies(undefined, sampleProject)).toEqual(STUDY_KEYS);
  });

  it('names and remarks make nothing out of date', () => {
    expect(staleStudies(run, change('MCC-WP', { name: 'Booster pump', remarks: 'by others' }))).toEqual([]);
    const renamed = { ...sampleProject, name: 'Renamed', boards: sampleProject.boards.map((b) => ({ ...b, location: 'Somewhere' })) };
    expect(staleStudies(run, renamed)).toEqual([]);
  });

  it('a load changes voltage drop, checks and sizing — not fault levels, earthing or protection', () => {
    expect(staleStudies(run, change('MCC-WP', { loadKw: 90 }))).toEqual(['vd', 'checks', 'sizing']);
  });

  it('a cable changes voltage drop, fault levels, checks, earthing and protection — not sizing', () => {
    expect(staleStudies(run, change('INC-GF', { lengthM: 80 }))).toEqual(['vd', 'fault', 'checks', 'earthing', 'protection']);
  });

  it('a breaker rating changes checks, earthing and protection — not voltage drop or fault levels', () => {
    expect(staleStudies(run, change('GF-HVAC', { breakerRatingA: 315 }))).toEqual(['checks', 'earthing', 'protection']);
  });

  it('a transformer changes the network studies; a generator only sizing', () => {
    const tx = { ...sampleProject, boards: sampleProject.boards.map((b) => (b.id === 'MDB-1' ? { ...b, sourceKva: 1500 } : b)) };
    expect(staleStudies(run, tx)).toEqual(STUDY_KEYS);
    const gen = { ...sampleProject, boards: sampleProject.boards.map((b) => (b.id === 'MCC-1' ? { ...b, standby: { kva: 200 } } : b)) };
    expect(staleStudies(run, gen)).toEqual(['sizing']);
  });

  it('undoing back to the run inputs is up to date again', () => {
    const edited = change('MCC-WP', { loadKw: 90 });
    const back = change('MCC-WP', { loadKw: 75 });
    expect(staleStudies(run, edited)).not.toEqual([]);
    expect(staleStudies(run, back)).toEqual([]);
  });
});

/** The out-of-date check compares only what was replaced: it must answer exactly as comparing whole fingerprints does. */
describe('the out-of-date check agrees with the fingerprints', () => {
  const base: Project = { ...network(30, 'shallow', 6), ties: [{ id: 'T', a: 'MDB', b: 'B1', ratingA: 1600 }] };
  const run = runCalculations(base);
  const byFingerprint = (p: Project) => STUDY_KEYS.filter((k) => fingerprint(p, k) !== fingerprint(base, k));
  const feeder = (p: Project, patch: object, n = 40): Project => ({ ...p, feeders: p.feeders.map((f, i) => (i === n ? { ...f, ...patch } : f)) });
  const board = (p: Project, patch: object, n = 3): Project => ({ ...p, boards: p.boards.map((b, i) => (i === n ? { ...b, ...patch } : b)) });
  const edits: [string, Project][] = [
    ['nothing', { ...base }],
    ['same values, new objects', { ...base, feeders: base.feeders.map((f) => ({ ...f })), boards: base.boards.map((b) => ({ ...b })), ties: base.ties!.map((t) => ({ ...t })) }],
    ['a remark', feeder(base, { remarks: 'x' })],
    ['a room', feeder(base, { room: 'x' })],
    ...['loadKw', 'demandFactor', 'powerFactor', 'lengthM', 'cableCsaMm2', 'parallel', 'cores', 'kvar', 'breakerRatingA', 'breakerIcuKa', 'breakerImMultiple', 'cpcMm2', 'rcdMa', 'way'].map((k): [string, Project] => [k, feeder(base, { [k]: 7 })]),
    ...['phase', 'breakerType', 'cableType', 'starter', 'loadType', 'trayRoute'].map((k): [string, Project] => [k, feeder(base, { [k]: 'x' })]),
    ['generation', feeder(base, { generation: true })],
    ['essential', feeder(base, { essential: true })],
    ['a field set to undefined', feeder(base, { parallel: undefined })],
    ['a field set to null', feeder(base, { parallel: null })],
    ['points', feeder(base, { points: { ltg: 3 } })],
    ...['upstreamId', 'supply', 'kind'].map((k): [string, Project] => [`board ${k}`, board(base, { [k]: 'x' })]),
    ...['sourceKva', 'sourceImpedancePct', 'sourceXr', 'ratedCurrentA', 'elcbGroupSize', 'elcbSensitivityMa'].map((k): [string, Project] => [`board ${k}`, board(base, { [k]: 7 })]),
    ['board name', board(base, { name: 'x' })],
    ['a circuit added', { ...base, feeders: [...base.feeders, { ...base.feeders[40], id: 'new' }] }],
    ['a circuit removed', { ...base, feeders: base.feeders.filter((_, i) => i !== 40) }],
    ['circuits reordered', { ...base, feeders: [...base.feeders].reverse() }],
    ['a board removed', { ...base, boards: base.boards.filter((_, i) => i !== 3) }],
    ...(['voltageV', 'vdLimitPct', 'vdTempC', 'ambientC'] as const).map((k): [string, Project] => [k, { ...base, [k]: 7 }]),
    ['a coupler closed', { ...base, ties: [{ ...base.ties![0], closed: true }] }],
    ['no couplers', { ...base, ties: undefined }],
    ['an empty coupler list', { ...base, ties: [] }],
    ['trays', { ...base, trays: { routes: [] } } as unknown as Project],
    ['study settings', { ...base, studySettings: { x: 1 } } as unknown as Project],
    ['generator plan', { ...base, txGen: { x: 1 } } as unknown as Project],
    ['project name', { ...base, name: 'x' }]
  ];
  for (const [name, p] of edits) it(name, () => expect(staleStudies(run, p)).toEqual(byFingerprint(p)));
});
