import { describe, expect, it } from 'vitest';
import { newProject, type Board, type Project } from '../types';
import { runCalculations } from '../calc/runs';
import { mvPlan, type RmuItem } from '../diagram/mvArrangement';
import { addRmu, addTransformerOnRmu, rmuAddPlan } from './mvGrow';
import { txTag } from './transformers';

const tx = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, ...extra });
const project = (boards: Board[], extra: Partial<Project> = {}): Project => ({ ...newProject('Grow'), voltageV: 400, boards, feeders: [], ...extra });
const base = project([tx('MDB-1')], { rmus: [{ name: 'RMU-1', config: 'RRT', substation: 'SS-1' }] });
const rmuOf = (p: Project, n: string) => mvPlan(p).rings.flatMap((r) => r.items).find((i) => i.kind === 'rmu' && i.name === n) as RmuItem;

describe('Add transformer and main board on an RMU', () => {
  it('takes the spare tee-off of an RMU that feeds nothing yet, with a 1000 kVA transformer and the RMU\'s substation', () => {
    const before = JSON.stringify(base);
    const r = addTransformerOnRmu(base, 'RMU-1');
    expect(JSON.stringify(base)).toBe(before);
    const b = r.project.boards.find((x) => x.id === 'MDB-2')!;
    expect(b).toMatchObject({ id: 'MDB-2', name: 'MDB 2', kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 5, rmu: 'RMU-1', substation: 'SS-1' });
    expect(b.ratedCurrentA).toBeGreaterThanOrEqual(1443);
    expect(r.select).toEqual({ type: 'board', id: 'MDB-2' });
    expect(r.message).toBe('Added TX-2 (1000 kVA) with MDB-2 on RMU-1 · in SS-1 — set kVA and impedance on the Supply tab');
    expect(rmuOf(r.project, 'RMU-1').tees).toEqual(['MDB-2']);
    expect(mvPlan(r.project).order).toEqual(['MDB-1', 'MDB-2']);
    expect(() => runCalculations(r.project)).not.toThrow();
  });

  it('is put after the last main board, before the boards they feed', () => {
    const p = project([tx('MDB-1'), { id: 'DB-1', name: 'DB-1', kind: 'DB', upstreamId: 'MDB-1' }], { rmus: [{ name: 'RMU-1', config: 'RRT' }] });
    expect(addTransformerOnRmu(p, 'RMU-1').project.boards.map((b) => b.id)).toEqual(['MDB-1', 'MDB-2', 'DB-1']);
  });

  it('grows a full RRT to RRTT, and RRTT to RRTTT, and says so before (plan) and after', () => {
    const rrt = project([tx('MDB-1', { rmu: 'RMU-1' })], { rmus: [{ name: 'RMU-1', config: 'RRT' }] });
    const plan = rmuAddPlan(rrt, 'RMU-1');
    expect(plan).toMatchObject({ grow: 'RRTT', title: 'Add a transformer and main board on RMU-1?' });
    expect(plan.blocked).toBeUndefined();
    expect(plan.lines).toEqual(['RMU-1 is full (RRT): it becomes RRTT.', 'A new main board MDB-2 gets a 1000 kVA transformer on RMU-1.']);
    const r = addTransformerOnRmu(rrt, 'RMU-1');
    expect(r.project.rmus![0].config).toBe('RRTT');
    expect(r.message).toBe('Added TX-2 (1000 kVA) with MDB-2 on RMU-1 · RMU-1 is now RRTT — set kVA and impedance on the Supply tab');
    const rrtt = project([tx('MDB-1', { rmu: 'RMU-1' }), tx('MDB-2', { rmu: 'RMU-1' })], { rmus: [{ name: 'RMU-1', config: 'RRTT' }] });
    expect(rmuAddPlan(rrtt, 'RMU-1').grow).toBe('RRTTT');
    expect(addTransformerOnRmu(rrtt, 'RMU-1').project.rmus![0].config).toBe('RRTTT');
  });

  it('asks nothing of an RMU with a spare tee-off, and says the substation in the plan', () => {
    const p = rmuAddPlan(base, 'RMU-1');
    expect(p.grow).toBeUndefined();
    expect(p.lines).toEqual(['A new main board MDB-2 gets a 1000 kVA transformer on RMU-1.', 'It is put in SS-1, the substation of RMU-1.']);
  });

  it('is refused on a full RT, RRRT or RRTTT unit, and on a name nothing has', () => {
    for (const config of ['RT', 'RRRT', 'RRTTT']) {
      const n = config === 'RRTTT' ? 3 : 1;
      const p = project(Array.from({ length: n }, (_, i) => tx(`MDB-${i + 1}`, { rmu: 'RMU-1' })), { rmus: [{ name: 'RMU-1', config }] });
      const plan = rmuAddPlan(p, 'RMU-1');
      expect(plan.blocked).toContain('RMU-1 is full');
      const r = addTransformerOnRmu(p, 'RMU-1');
      expect(r.project).toBe(p);
      expect(r.message).toBe(plan.blocked);
    }
    const none = addTransformerOnRmu(base, 'RMU-9');
    expect(none.project).toBe(base);
    expect(none.message).toBe('No RMU RMU-9');
    expect(rmuAddPlan(base, 'RMU-9').blocked).toBe('No RMU RMU-9');
  });

  it('works on an RMU a board names but no record holds, which takes two', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-3' })]);
    const r = addTransformerOnRmu(p, 'RMU-3');
    expect(r.project.boards.find((b) => b.id === 'MDB-2')!.rmu).toBe('RMU-3');
    expect(txTag(r.project, 'MDB-2')).toBe('TX-2');
    expect(addTransformerOnRmu(r.project, 'RMU-3').project).toBe(r.project);
  });
});

describe('Add RMU', () => {
  it('adds the next free RMU as RRT, feeding nothing, in the substation when given', () => {
    const r = addRmu(base);
    expect(r.project.rmus).toEqual([{ name: 'RMU-1', config: 'RRT', substation: 'SS-1' }, { name: 'RMU-2', config: 'RRT' }]);
    expect(r.message).toBe('Added RMU-2 (RRT, no transformer yet): right-click it → Add transformer and main board');
    expect(addRmu(base, ' SS-2 ').project.rmus![1]).toEqual({ name: 'RMU-2', config: 'RRT', substation: 'SS-2' });
    expect(base.rmus).toHaveLength(1);
    expect(rmuOf(r.project, 'RMU-2').tees).toEqual([undefined]);
  });
});
