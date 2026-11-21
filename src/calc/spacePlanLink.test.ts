import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { assess, DEFAULT_SPACES, DEFAULT_TYPES, newAssessment } from './loadAssessment';
import { emptyPlan, summarize } from './spacePlan';
import { assessmentLoads, keepPlanFigures, planLink, takeLoads, usesFromStandard, withAssessmentSettings, withStandardUses } from './spacePlanLink';
import type { BuildingInfo, Project, SpacePlan } from '../types';

// A tower (25,200 m² above ground) and a block of shops (1,200 m²).
const building: BuildingInfo = {
  buildings: [
    { id: 'T', name: 'Tower A', levels: [
      { id: 'T-G', name: 'Ground', kind: 'ground', heightM: 4.5, grossM2: 1200 },
      { id: 'T-T', name: 'Typical floors', kind: 'typical', heightM: 3.6, grossM2: 1200, count: 20 }
    ] },
    { id: 'P', name: 'Podium shops', levels: [{ id: 'P-G', name: 'Ground', kind: 'ground', heightM: 5, grossM2: 1200 }] }
  ],
  rooms: []
};
const a = { ...newAssessment(DEFAULT_TYPES[0], { gfaM2: 26400, floors: 21, parkingM2: 8000 }, { types: [] }), custom: [{ id: 'c1', label: 'Cold room', qty: 2, kw: 10, diversity: 0.5, onGenerator: false }] };
const project = (spacePlan?: SpacePlan): Project => ({ ...sampleProject, building, loadAssessment: a, spacePlan });

describe('load assessment against the space plan', () => {
  it('gives the assessment’s loads as rows per building and category, shared by floor area', () => {
    const rows = assessmentLoads(project(), a);
    const r = assess(a);
    // Every category of the assessment on both buildings.
    expect(rows).toHaveLength(r.categories.length * 2);
    expect(rows.every((x) => x.from === 'la' && x.use === 'services')).toBe(true);
    const ltg = r.categories.find((c) => c.key === 'ltg')!;
    const tower = rows.find((x) => x.id === 'la-T-ltg')!, shops = rows.find((x) => x.id === 'la-P-ltg')!;
    expect(tower).toMatchObject({ building: 'Tower A', name: 'Lighting', demandFactor: ltg.diversity });
    expect(tower.kw! + shops.kw!).toBeCloseTo(ltg.connectedKw, 1);
    expect(tower.kw! / shops.kw!).toBeCloseTo(25200 / 1200, 1);
    // Fire and life safety is not in the normal demand; a custom load keeps its own diversity.
    expect(rows.find((x) => x.id === 'la-T-life')!.demandFactor).toBe(0);
    expect(rows.find((x) => x.id === 'la-T-custom-c1')).toMatchObject({ name: 'Cold room', demandFactor: 0.5 });
    expect(rows.reduce((s, x) => s + x.kw!, 0)).toBeCloseTo(r.connectedKw, 0);
  });

  it('with the assessment’s loads and settings the plan’s maximum demand is the assessment’s', () => {
    const base = emptyPlan();
    const plan = { ...takeLoads(project(base), base, a), settings: withAssessmentSettings(base.settings, a) };
    const sum = summarize(plan), r = assess(a);
    expect(sum.demandKva).toBeCloseTo(r.mdKva, 0);
    expect(sum.connectedKw).toBeCloseTo(r.connectedKw, 0);
    expect(plan.settings).toMatchObject({ maxLoadingPct: 80, powerFactor: 0.9, growthPct: 0, coincidence: 0.9 });
    const l = planLink(project(plan))!;
    expect(l.fromAssessment).toBe(true);
    expect(l.rows.find((x) => x.key === 'md')!.differs).toBe(false);
    expect(l.rows.find((x) => x.key === 'settings')!.differs).toBe(false);
  });

  it('replaces rows taken from the rooms or taken before, and keeps typed rows and panels', () => {
    const plan: SpacePlan = { ...emptyPlan(), areas: [
      { id: 'room-r1', building: 'Tower A', name: 'Lobby', use: 'common', areaM2: 300 },
      { id: 'unit-T-T-U1', building: 'Tower A', name: '1BR ×120', use: 'residential', areaM2: 6000 },
      { id: 'la-T-ltg', building: 'Tower A', name: 'Lighting', use: 'services', kw: 1, demandFactor: 1, from: 'la', panel: 'MDB-A1' },
      { id: 'a7', building: 'Tower A', name: 'Chiller for the lobby', use: 'services', kw: 45, demandFactor: 0.8, panel: 'MDB-A1' }
    ], kept: 'old' };
    const next = takeLoads(project(plan), plan, a);
    expect(next.areas.some((x) => x.id.startsWith('room-') || x.id.startsWith('unit-'))).toBe(false);
    expect(next.areas.find((x) => x.id === 'a7')).toMatchObject({ name: 'Chiller for the lobby', kw: 45, panel: 'MDB-A1' });
    const ltg = next.areas.find((x) => x.id === 'la-T-ltg')!;
    expect(ltg.panel).toBe('MDB-A1');
    expect(ltg.kw).toBeGreaterThan(100);
    expect(next.kept).toBeUndefined();
    // Taking again changes nothing.
    expect(takeLoads(project(next), next, a).areas).toEqual(next.areas);
  });

  it('marks what differs, and Keep my figures hides the notice until the assessment changes', () => {
    const plan: SpacePlan = { ...emptyPlan(), areas: [{ id: 'a1', building: 'Tower A', name: 'Flats', use: 'residential', areaM2: 60000 }] };
    const l = planLink(project(plan))!;
    expect(l.fromAssessment).toBe(false);
    const md = l.rows.find((x) => x.key === 'md')!;
    // 60,000 m² × 80 W/m² × 0.7 ÷ 0.9 = 3,733 kVA in the plan.
    expect(md).toMatchObject({ plan: '3,733 kVA', differs: true });
    expect(l.rows.find((x) => x.key === 'settings')).toMatchObject({ assessment: '80 % · 0.90 · 0 % · 0.90', plan: '80 % · 0.90 · 0 % · 1.00', differs: true });
    expect(l.rows.find((x) => x.key === 'sizes')!.plan).toBe('1,000 or 1,500 kVA');
    expect(l.differs && l.notice).toBe(true);
    const kept = keepPlanFigures(plan, a);
    expect(planLink(project(kept))).toMatchObject({ differs: true, notice: false });
    expect(planLink({ ...project(kept), loadAssessment: { ...a, gfaM2: 40000 } })!.notice).toBe(true);
    expect(planLink({ ...project(plan), loadAssessment: undefined })).toBeUndefined();
  });

  it('makes use types from a density standard: lighting, power and the electrical A/C together', () => {
    const uses = usesFromStandard({ name: 'Mine', spaces: [
      { id: 'apt', label: 'Apartment', ltg: 8, pwr: 35, clg: 110, dwelling: true },
      { id: 'fnb', label: 'F&B', ltg: 6, pwr: 15, clg: 200, location: 'oc' }
    ] }, a);
    // Apartment: 8 + 35 + 110 × 0.3 (VRF) = 76 W/m²; demand factor (8×0.9 + 35×0.5 + 33×0.85) ÷ 76.
    expect(uses[0]).toEqual({ id: 'apt', label: 'Apartment', wPerM2: 76, demandFactor: 0.69 });
    // Outdoor: no cooling.
    expect(uses[1]).toEqual({ id: 'fnb-oc', label: 'F&B (outdoor, covered)', wPerM2: 21, demandFactor: 0.61 });
    // An electrical-basis standard is used as typed.
    expect(usesFromStandard({ name: 'E', acBasis: 'electrical', spaces: [{ id: 'x', label: 'X', ltg: 10, pwr: 20, clg: 30 }] }, a)[0].wPerM2).toBe(60);
    const plan: SpacePlan = { ...emptyPlan(), areas: [{ id: 'a1', building: 'B', name: 'Shops', use: 'retail', areaM2: 100 }] };
    const next = withStandardUses(plan, { name: 'Starting', spaces: DEFAULT_SPACES });
    expect(next.uses!.some((u) => u.id === 'apt')).toBe(true);
    // The Plant / services type stays for kW rows.
    expect(next.uses!.some((u) => u.id === 'services')).toBe(true);
  });
});
