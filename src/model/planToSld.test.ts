import { describe, expect, it } from 'vitest';
import { newProject } from '../types';
import type { Project, SpacePlan } from '../types';
import { addServices, generateBuildingDbs } from '../calc/buildingDesign';
import { assess, DEFAULT_TYPES, newAssessment } from '../calc/loadAssessment';
import { createMdbFromAssessment } from '../calc/loadAssessmentMdb';
import { reconcileLumps } from '../calc/loadAssessmentLumps';
import { autoAssign, emptyPlan } from '../calc/spacePlan';
import { takeLoads, withAssessmentSettings } from '../calc/spacePlanLink';
import { updateSupply } from './planToSld';

const a = newAssessment(DEFAULT_TYPES[0], { gfaM2: 24000, floors: 20, parkingM2: 8000 }, { types: [] });
const empty = (): Project => ({ ...newProject('Test'), boards: [], feeders: [], loadAssessment: a });
/** The plan with the assessment's loads and settings, auto-assigned. */
const planFor = (p: Project): SpacePlan => autoAssign({ ...takeLoads(p, emptyPlan(), a), settings: withAssessmentSettings(emptyPlan().settings, a) });
const planLoads = (p: Project) => p.feeders.filter((f) => f.fromRoom?.startsWith('sp:'));
/** One load feeder per plan row, and one more for a row that is partly on the generator. */
const feedersOf = (plan: SpacePlan) => plan.areas.length + plan.areas.filter((x) => (x.genShare ?? 0) > 0 && (x.genShare ?? 0) < 1).length;

describe('Create / Update supply from the space plan', () => {
  it('makes the plan’s transformers, panels and load feeders on an empty project', () => {
    const plan = planFor(empty());
    const r = updateSupply(empty(), plan);
    expect(r.counts.transformers).toBe(plan.transformers.length);
    expect(r.created).toHaveLength(plan.transformers.length + plan.panels.length);
    expect(r.updated).toEqual([]);
    const tx = r.project.boards.filter((b) => b.generated?.startsWith('sp:tx:'));
    expect(tx.map((b) => b.sourceKva)).toEqual(plan.transformers.map((t) => t.kva));
    expect(r.project.boards.filter((b) => b.generated?.startsWith('sp:panel:'))).toHaveLength(plan.panels.length);
    // A load feeder per plan row (two when it is partly on the generator), carrying the row's kW and diversity.
    expect(planLoads(r.project)).toHaveLength(feedersOf(plan));
    expect(planLoads(r.project).reduce((s, f) => s + f.loadKw, 0)).toBeCloseTo(assess(a).connectedKw, 0);
    // Sized: no longer the starting 63 A on a load of hundreds of kW.
    const big = planLoads(r.project).sort((x, y) => y.loadKw - x.loadKw)[0];
    expect(big.breakerRatingA).toBeGreaterThan(63);
  });

  it('a second run updates the same boards and replaces only its own load feeders', () => {
    const plan = planFor(empty());
    const first = updateSupply(empty(), plan).project;
    // Something of the user's: a hand-made feeder on a plan panel, and a board of their own.
    const panel = first.boards.find((b) => b.generated?.startsWith('sp:panel:'))!;
    const mine: Project = {
      ...first,
      boards: [...first.boards, { id: 'DB-MINE', name: 'My DB', kind: 'DB', upstreamId: panel.id }],
      feeders: [...first.feeders, { id: 'F-MINE', boardId: panel.id, name: 'My pump', loadKw: 5, demandFactor: 1, powerFactor: 0.85, lengthM: 77, cableCsaMm2: 6, cores: 4, breakerRatingA: 32, breakerIcuKa: 25, loadType: 'motor' }]
    };
    const again = updateSupply(mine, { ...plan, transformers: plan.transformers.map((t) => ({ ...t, kva: 1500 })) });
    expect(again.created).toEqual([]);
    expect(again.updated).toHaveLength(plan.transformers.length + plan.panels.length);
    expect(again.project.boards.map((b) => b.id).sort()).toEqual(mine.boards.map((b) => b.id).sort());
    expect(again.project.boards.filter((b) => b.generated?.startsWith('sp:tx:')).every((b) => b.sourceKva === 1500)).toBe(true);
    // The user's feeder and board are untouched; the plan's load feeders are not doubled.
    expect(again.project.feeders.find((f) => f.id === 'F-MINE')).toEqual(mine.feeders.find((f) => f.id === 'F-MINE'));
    expect(again.project.boards.some((b) => b.id === 'DB-MINE')).toBe(true);
    expect(planLoads(again.project)).toHaveLength(feedersOf(plan));
  });

  it('removes the load assessment’s own MDBs and lump feeders, and plan boards that are gone and empty', () => {
    const withLa = createMdbFromAssessment(empty(), a).project;
    expect(withLa.feeders.some((f) => f.fromRoom?.startsWith('la:'))).toBe(true);
    const plan = planFor(withLa);
    const r = updateSupply(withLa, plan);
    expect(r.project.feeders.some((f) => f.fromRoom?.startsWith('la:'))).toBe(false);
    expect(r.project.boards.some((b) => b.generated === 'la:mdb')).toBe(false);
    expect(r.removed.length).toBeGreaterThan(0);
    expect(r.left).toEqual([]);
    // A panel dropped from the plan goes when nothing of the user's is on it, and stays when something is.
    const gone = plan.panels[plan.panels.length - 1];
    const smaller: SpacePlan = { ...plan, panels: plan.panels.filter((p) => p.id !== gone.id), areas: plan.areas.map((x) => (x.panel === gone.id ? { ...x, panel: plan.panels[0].id } : x)) };
    const goneBoard = r.project.boards.find((b) => b.generated === `sp:panel:${gone.id}`)!.id;
    expect(updateSupply(r.project, smaller).removed).toContain(goneBoard);
    const used: Project = { ...r.project, boards: [...r.project.boards, { id: 'DB-X', name: 'DB', kind: 'DB', upstreamId: goneBoard }] };
    const kept = updateSupply(used, smaller);
    expect(kept.left).toEqual([goneBoard]);
    expect(kept.project.boards.some((b) => b.id === 'DB-X')).toBe(true);
  });

  it('the load feeders of rows from the assessment shrink as loads are designed, and never double', () => {
    const plan = planFor(empty());
    const made = updateSupply({ ...empty(), spacePlan: plan }, plan).project;
    const board = made.boards.find((b) => b.generated?.startsWith('sp:panel:'))!.id;
    const lifts = () => planLoads(made).filter((f) => f.name.startsWith('Lifts'));
    const liftKw = lifts().reduce((s, f) => s + f.loadKw, 0);
    expect(liftKw).toBeGreaterThan(44);
    const withLift = addServices({ ...made, spacePlan: plan }, board, [{ id: 'lift', label: 'Lift', kw: 22, qty: 2, loadType: 'motor' }]).project;
    const rec = reconcileLumps(withLift, a);
    const after = rec.project.feeders.filter((f) => f.fromRoom?.startsWith('sp:') && f.name.startsWith('Lifts')).reduce((s, f) => s + f.loadKw, 0);
    expect(after).toBeCloseTo(liftKw - 44, 1);
    expect(rec.changes.some((c) => c.key === 'lift')).toBe(true);
    // Again: nothing more is taken off.
    expect(reconcileLumps(rec.project, a).changes).toEqual([]);
    // A fresh Create / Update supply gives the same reduced feeders, not the full ones.
    const fresh = updateSupply(rec.project, plan).project;
    expect(fresh.feeders.filter((f) => f.fromRoom?.startsWith('sp:') && f.name.startsWith('Lifts')).reduce((s, f) => s + f.loadKw, 0)).toBeCloseTo(liftKw - 44, 1);
    // Generated room circuits are not removed by it, and a designed DB is not counted as a stand-in.
    expect(generateBuildingDbs(fresh, 'none', board).project.feeders.filter((f) => f.fromRoom?.startsWith('sp:')).length).toBe(planLoads(fresh).length);
  });

  it('keeps each row’s share on the standby generator as an essential feeder', () => {
    const plan = planFor(empty());
    const p = updateSupply(empty(), plan).project;
    const ess = planLoads(p).filter((f) => f.essential);
    // The generator demand of the network's stand-in feeders is the assessment's essential demand.
    expect(ess.reduce((s, f) => s + f.loadKw * f.demandFactor, 0)).toBeCloseTo(assess(a).generatorKw, 0);
    // Lighting is all on the generator: one essential feeder. Small power is 30 % on it: two feeders.
    expect(planLoads(p).filter((f) => f.name === 'Lighting').map((f) => !!f.essential)).toEqual([true]);
    const power = planLoads(p).filter((f) => f.name.startsWith('Small power'));
    expect(power.map((f) => [f.name, !!f.essential])).toEqual([['Small power', false], ['Small power (essential)', true]]);
    expect(power[1].loadKw / (power[0].loadKw + power[1].loadKw)).toBeCloseTo(0.3, 2);
    // Fire and life safety: not in the plan's normal demand, at full load on the generator.
    const life = planLoads(p).find((f) => f.name.startsWith('Fire'))!;
    expect(life).toMatchObject({ essential: true, demandFactor: 1 });
    // The connected load is unchanged by the split.
    expect(planLoads(p).reduce((s, f) => s + f.loadKw, 0)).toBeCloseTo(assess(a).connectedKw, 0);
    // A second run does not double the pairs.
    expect(planLoads(updateSupply(p, plan).project)).toHaveLength(planLoads(p).length);
  });

  it('adopts the boards of an SLD made before the tags existed, by their ids', () => {
    const plan = planFor(empty());
    const old: Project = { ...empty(), boards: plan.transformers.map((t) => ({ id: t.id, name: `${t.id} LV switchboard`, kind: 'MDB' as const, sourceKva: t.kva })) };
    const r = updateSupply(old, plan);
    expect(r.updated).toEqual(expect.arrayContaining(plan.transformers.map((t) => t.id)));
    expect(r.project.boards.filter((b) => b.kind === 'MDB' && !b.upstreamId)).toHaveLength(plan.transformers.length);
  });
});
