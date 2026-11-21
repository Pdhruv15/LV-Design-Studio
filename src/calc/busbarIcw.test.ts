import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { boardSummary } from './summary';
import { busbarIcwCheck, busbarIcwChecks } from './busbarIcw';
import { buildDashboard } from './dashboard';
import type { Project } from '../types';

const withIcw = (id: string, icwKa: number | undefined): Project =>
  ({ ...sampleProject, boards: sampleProject.boards.map((b) => (b.id === id ? { ...b, busbarIcwKa: icwKa } : b)) });

describe('board busbar Icw', () => {
  const fault = boardSummary(sampleProject, sampleProject.boards.find((b) => b.id === 'SMDB-GF')!).faultKA;

  it('checks nothing when no Icw is entered (no assumed figure)', () => {
    expect(busbarIcwChecks(sampleProject)).toEqual([]);
    expect(busbarIcwCheck(withIcw('SMDB-GF', 0), withIcw('SMDB-GF', 0).boards.find((b) => b.id === 'SMDB-GF')!)).toBeUndefined();
  });
  it('passes when Icw is at least the fault level at the board', () => {
    const p = withIcw('SMDB-GF', Math.ceil(fault));
    const [c] = busbarIcwChecks(p);
    expect(c.board.id).toBe('SMDB-GF');
    expect(c.faultKa).toBeCloseTo(fault, 6);
    expect(c.ok).toBe(true);
    expect(buildDashboard(p).todo.some((t) => t.text.includes('busbar Icw'))).toBe(false);
  });
  it('fails below the fault level and puts it on the to-do list', () => {
    const p = withIcw('SMDB-GF', Math.floor(fault) - 1);
    expect(busbarIcwChecks(p)[0].ok).toBe(false);
    const item = buildDashboard(p).todo.find((t) => t.text.includes('busbar Icw'));
    expect(item?.status).toBe('bad');
    expect(item?.text).toMatch(/^SMDB-GF: busbar Icw [\d.]+ kA \(1 s\) is below the [\d.]+ kA fault level$/);
  });
});

describe('busbar Icw on an assumed fault level', () => {
  const noSource = (icw: number): Project => ({ ...sampleProject, boards: sampleProject.boards.map((b) => (b.upstreamId ? b : { ...b, sourceKva: undefined, sourceImpedancePct: undefined, busbarIcwKa: icw })) });
  it('is flagged assumed, reported as a warning (never a pass or a fail)', () => {
    for (const icw of [1, 100]) {
      const p = noSource(icw);
      const c = busbarIcwChecks(p).find((x) => !x.board.upstreamId)!;
      expect(c.assumed).toBe(true);
      expect(boardSummary(p, c.board).faultAssumed).toBe(true);
      const item = buildDashboard(p).todo.find((t) => t.text.includes('busbar Icw'));
      expect(item?.status).toBe('warn');
      expect(item?.text).toMatch(/not verified: source fault level assumed$/);
    }
  });
  it('a board with a source has no assumed key', () => {
    const [c] = busbarIcwChecks(withIcw('SMDB-GF', 1));
    expect('assumed' in c).toBe(false);
    expect(boardSummary(sampleProject, c.board).faultAssumed).toBeUndefined();
  });
});
