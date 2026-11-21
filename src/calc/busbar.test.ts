import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { ambientFactor, busbarTypeFrom, iecDiversity, MATERIAL_LABEL, newRiser, riserDiversityOf, sizeRiser, TAPOFF_A, TYPICAL_BUSBAR_DATA, type BusbarData, type BusRiser } from './busbar';
import { panelSummary } from './panelDemand';
import { STANDARD_BREAKER_A } from './sizing';
import { addG10RiserMockup } from '../model/riserMockup';
import type { Board, Feeder } from '../types';
import { buildSection, scopeOf } from '../docs/studyReport';
import type { Project } from '../types';

const tower: BusRiser = { ...newRiser('BR-1', 'MDB-1'), floors: [{ id: 'T', name: 'Typical 1–20', kw: 45, pf: 0.9, count: 20 }] };

describe('busbar riser', () => {
  it('demand with IEC diversity, sized for the feeding breaker after ambient derating', () => {
    const r = sizeRiser(sampleProject, tower);
    expect(r.tapOffs).toBe(20);
    expect(r.diversity).toBe(0.6);
    expect(r.demandKw).toBeCloseTo(540);
    expect(r.designA).toBeCloseTo(834.7, 0);
    expect(r.feederBreakerA).toBe(1000);
    expect(r.type!.ratingA).toBe(1250); // 1000 A ÷ 0.95 → 1053 A
    expect(r.feederBreakerA!).toBeLessThanOrEqual(r.type!.ratingA * r.derate);
    expect(r.currentDensity).toBeCloseTo(r.designA / r.type!.csaMm2);
    expect([iecDiversity(1), iecDiversity(3), iecDiversity(5), iecDiversity(8), iecDiversity(12)]).toEqual([1, 0.9, 0.8, 0.7, 0.6]);
    expect(ambientFactor(40)).toBe(1);
    expect(ambientFactor(50)).toBeCloseTo(0.9);
  });

  it('aluminium: same rating, bigger area and section, lighter', () => {
    const cu = sizeRiser(sampleProject, tower);
    const al = sizeRiser(sampleProject, { ...tower, material: 'al' });
    expect(al.type!.ratingA).toBe(cu.type!.ratingA);
    expect(al.type!.csaMm2).toBeGreaterThan(cu.type!.csaMm2);
    expect(al.type!.heightMm).toBeGreaterThan(cu.type!.heightMm);
    expect(al.weightKg!).toBeLessThan(cu.weightKg!);
    expect(al.vdTopPct).toBeGreaterThan(cu.vdTopPct);
  });

  it('voltage drop grows up the riser; lengths, parts, withstand', () => {
    const r = sizeRiser(sampleProject, { ...tower, floors: [
      { id: 'a', name: 'L1', kw: 60 }, { id: 'b', name: 'L2', kw: 60 }, { id: 'c', name: 'L3', kw: 60, count: 3 }
    ], offsetFloors: 2 });
    const vds = r.floors.map((f) => f.vdPct);
    expect(vds[1]).toBeGreaterThan(vds[0]);
    expect(vds[2]).toBeGreaterThan(vds[1]);
    expect(r.floors[0].heightM).toBeCloseTo(2 * 3.6);
    expect(r.floors[2].heightM).toBeCloseTo(6 * 3.6); // last of the three repeated floors
    expect(r.lengthM).toBeCloseTo(10 + 6 * 3.6 + 1);
    expect(r.elements).toBe(Math.ceil(r.lengthM / 3));
    expect(r.faultKa).toBeGreaterThan(20);
    expect(r.icwOk).toBe(true);
  });

  it('a floor can take its board’s demand; too big for the data is flagged', () => {
    const r = sizeRiser(sampleProject, { ...tower, floors: [{ id: 'a', name: 'GF', boardId: 'SMDB-GF' }] });
    expect(r.floors[0].kw).toBeGreaterThan(100);
    const huge = sizeRiser(sampleProject, { ...tower, floors: [{ id: 'a', name: 'x', kw: 250, count: 30 }] });
    expect(huge.type).toBeUndefined();
    expect(huge.notes.join(' ')).toMatch(/largest/);
  });

  it('manufacturer data replaces the typical table; report section', () => {
    const own: Project = { ...sampleProject, busbarData: { ...TYPICAL_BUSBAR_DATA, cu: [{ ratingA: 1100, csaMm2: 700, rMohmPerM: 0.05, xMohmPerM: 0.02, icwKa: 65, widthMm: 140, heightMm: 130, kgPerM: 20 }, ...TYPICAL_BUSBAR_DATA.cu.filter((t) => t.ratingA > 1100)] } };
    expect(sizeRiser(own, tower).type!.ratingA).toBe(1100); // 1053 A needed: the catalogue's 1100 A fits
    expect(sizeRiser(sampleProject, tower).type!.ratingA).toBe(1250);
    expect(busbarTypeFrom(['1600 A', '1070', '0.04', '0.016', '80', '135', '165', '26'])!.ratingA).toBe(1600);
    expect(busbarTypeFrom(['x', '', ''])).toBeNull();
    const p: Project = { ...sampleProject, busRisers: [tower] };
    const s = buildSection('busbar', { project: p, results: [], earthing: [], selectivity: [] }, scopeOf(p, { boards: [], downstream: true }));
    expect(s.tables[0].rows).toHaveLength(1);
    expect(s.tables[1].title).toMatch(/tap-offs/);
  });

  describe('one maximum demand with the MD forms', () => {
    const g10 = () => {
      const m = addG10RiserMockup(sampleProject, 'MDB-1');
      return { p: m.project, riser: m.project.busRisers!.find((x) => x.id === m.riserId)!, ids: m.panelIds };
    };
    const mdl = (p: Project, ids: string[]) => ids.reduce((a, id) => a + panelSummary(p, p.boards.find((b) => b.id === id)!).mdlKw, 0);

    it('an all-board riser: diversity 1.0 from the forms, demand = sum of the boards\' MDL', () => {
      const { p, riser, ids } = g10();
      const r = sizeRiser(p, riser);
      expect(r.allBoards).toBe(true);
      expect(r.diversityRule).toBe('forms');
      expect(r.diversity).toBe(1);
      expect(r.demandKw).toBeCloseTo(mdl(p, ids), 6);
      expect(r.demandKw).toBeCloseTo(500, 1);
      expect(r.designA).toBeCloseTo(772.89, 1);
      expect(r.feederBreakerA).toBe(800);
      expect(r.type!.ratingA).toBe(1000);
      expect(r.type!.icwKa).toBe(50);
      expect(r.type!.icwKa).toBeGreaterThanOrEqual(r.faultKa!);
      expect(r.notes.join(' ')).toMatch(/Diversity 1\.0: each tap-off at its maximum demand on its MD form/);
      // Its MD forms agree with the circuits (0.8 both ways): no "check the D.F" note.
      expect(r.notes.join(' ')).not.toMatch(/check the D\.F/);
    });

    it('IEC diversity on top of the boards\' MD', () => {
      const { p, riser } = g10();
      const r = sizeRiser(p, { ...riser, diversityRule: 'iec' });
      expect(r.diversityRule).toBe('iec');
      expect(r.diversity).toBe(0.6);
      expect(r.feederBreakerA).toBe(500);
      expect(r.type!.ratingA).toBe(630);
      expect(r.notes.join(' ')).toMatch(/on top of the boards' maximum demand on their MD forms/);
    });

    it('a typed factor wins; loads entered on the page default to IEC', () => {
      const { p, riser } = g10();
      const t = sizeRiser(p, { ...riser, diversity: 0.85, diversityRule: 'forms' });
      expect(t.diversityRule).toBe('typed');
      expect(t.diversity).toBe(0.85);
      expect(t.demandKw).toBeCloseTo(425, 1);
      expect(t.notes.join(' ')).toMatch(/Diversity 0\.85 \(typed\)/);
      const typedFloors = sizeRiser(sampleProject, tower);
      expect(typedFloors.diversityRule).toBe('iec');
      expect(typedFloors.allBoards).toBe(false);
      expect(typedFloors.notes.join(' ')).toMatch(/Diversity 0\.6 for 20 tap-offs \(IEC 61439-6\)/);
      expect(riserDiversityOf(p, { ...riser, floors: [] }, 0).allBoards).toBe(false);
      expect(riserDiversityOf(p, { ...riser, floors: [...riser.floors, { id: 'x', name: 'x', kw: 10 }] }, 12).rule).toBe('iec');
    });

    it('the tap-off unit is at least its MCCB', () => {
      const { p, riser } = g10();
      const feed = (a: number): Project => ({ ...p, feeders: p.feeders.map((f) => (f.feedsBoardId === riser.floors[1].boardId ? { ...f, breakerRatingA: a } : f)) });
      const r = sizeRiser(feed(160), riser);
      expect(r.floors[1].currentA).toBeLessThan(100);
      expect(r.floors[1].mccbA).toBe(160);
      expect(r.floors[1].tapOffA).toBe(160);
      const big = sizeRiser(feed(800), riser);
      expect(big.floors[1].tapOffA).toBeUndefined();
      expect(big.notes.join(' ')).toMatch(/no tap-off unit in the list carries 800 A \(largest 630 A\)/);
    });

    it('a leading board keeps its negative kvar from the MD-form kW', () => {
      const { p, riser } = g10();
      const id = riser.floors[1].boardId!;
      const bank: Feeder = { id: 'RC-LEAD', boardId: id, name: 'Fixed bank', loadKw: 0, demandFactor: 1, powerFactor: 0.1, kvar: 600, lengthM: 5, cableCsaMm2: 95, cores: 4, breakerRatingA: 800, breakerIcuKa: 25, breakerType: 'MCCB', loadType: 'capacitor' };
      const lead: Project = { ...p, feeders: [...p.feeders, bank] };
      const r = sizeRiser(lead, riser);
      expect(r.floors[1].kvar).toBeLessThan(0);
      expect(r.floors[1].kw).toBeCloseTo(panelSummary(lead, lead.boards.find((b) => b.id === id)!).mdlKw, 6);
    });
  });

  describe('for different loads and busbar sizes', () => {
    const small: BusbarData = {
      cu: [250, 400, 630, 1000, 1600].map((a, i) => ({ ratingA: a, csaMm2: a / 2, rMohmPerM: 0.2 / (i + 1), xMohmPerM: 0.03, icwKa: 30 + i * 10, widthMm: 100, heightMm: 80 + i * 10, kgPerM: 8 + i * 4 })),
      al: [315, 500, 800, 1250].map((a, i) => ({ ratingA: a, csaMm2: a / 1.5, rMohmPerM: 0.25 / (i + 1), xMohmPerM: 0.03, icwKa: 30 + i * 10, widthMm: 100, heightMm: 100 + i * 10, kgPerM: 6 + i * 3 }))
    };
    const rules = (p: Project, riser: BusRiser) => {
      const r = sizeRiser(p, riser);
      const table = (p.busbarData ?? TYPICAL_BUSBAR_DATA)[riser.material];
      expect(r.feederBreakerA).toBe(STANDARD_BREAKER_A.find((a) => a >= r.designA - 1e-9) ?? r.designA); // above the largest standard breaker: the current itself
      const qualifying = table.find((t) => t.ratingA * r.derate >= r.feederBreakerA! - 1e-9);
      expect(r.type).toBe(qualifying);
      if (r.type) expect(r.feederBreakerA!).toBeLessThanOrEqual(r.type.ratingA * r.derate + 1e-9);
      else expect(r.notes.join(' ')).toMatch(new RegExp(`largest ${MATERIAL_LABEL[riser.material].toLowerCase()} rating`));
      for (const f of r.floors) if (f.tapOffA !== undefined) expect(f.tapOffA).toBeGreaterThanOrEqual(f.currentA / 0.85 - 1e-9);
      expect(TAPOFF_A).toContain(r.floors[0].tapOffA ?? TAPOFF_A[0]);
      return r;
    };

    it.each([5, 20, 45, 100, 250, 600])('10 typed floors of %s kW, Cu and Al, 40 and 50 °C, typical and custom data', (kw) => {
      for (const material of ['cu', 'al'] as const) for (const ambientC of [40, 50]) for (const data of [undefined, small]) {
        const riser: BusRiser = { ...newRiser('BR-X', 'MDB-1'), material, ambientC, floors: Array.from({ length: 10 }, (_, i) => ({ id: `F${i}`, name: `L${i}`, kw, pf: 0.9 })) };
        const p: Project = data ? { ...sampleProject, busbarData: data } : sampleProject;
        const r = rules(p, riser);
        expect(r.demandKw).toBeCloseTo(kw * 10 * 0.6, 6);
        expect(r.ambientC).toBe(ambientC);
      }
    });

    it('an all-board riser of boards of different sizes: demand = sum of MDL', () => {
      const sizes = [20, 60, 150];
      const boards: Board[] = sizes.map((_, i) => ({ id: `RB-${i}`, name: `RB-${i}`, kind: 'SMDB', upstreamId: 'MDB-1', ratedCurrentA: 400, mdDemandFactor: 0.7 + i * 0.1 }));
      const loads: Feeder[] = sizes.map((kw, i) => ({ id: `RL-${i}`, boardId: `RB-${i}`, name: 'Load', loadKw: kw, demandFactor: 1, powerFactor: 0.9, lengthM: 20, cableCsaMm2: 50, cores: 4, breakerRatingA: 125, breakerIcuKa: 25, breakerType: 'MCCB' }));
      const ins: Feeder[] = sizes.map((_, i) => ({ id: `RI-${i}`, boardId: 'MDB-1', feedsBoardId: `RB-${i}`, name: 'In', loadKw: 0, demandFactor: 1, powerFactor: 0.9, lengthM: 8, cableCsaMm2: 70, cores: 4, breakerRatingA: [63, 160, 400][i], breakerIcuKa: 36, breakerType: 'MCCB' }));
      const base: Project = { ...sampleProject, boards: [...sampleProject.boards, ...boards], feeders: [...sampleProject.feeders, ...loads, ...ins] };
      const riser: BusRiser = { ...newRiser('BR-B', 'MDB-1'), floors: boards.map((b) => ({ id: b.id, name: b.id, boardId: b.id })) };
      for (const material of ['cu', 'al'] as const) for (const data of [undefined, small]) for (const ambientC of [40, 50]) {
        const p: Project = data ? { ...base, busbarData: data } : base;
        const r = rules(p, { ...riser, material, ambientC });
        expect(r.diversityRule).toBe('forms');
        expect(r.demandKw).toBeCloseTo(boards.reduce((a, b) => a + panelSummary(p, b).mdlKw, 0), 6);
        expect(r.floors.map((f) => f.tapOffA)).toEqual([63, 160, 400]);
      }
    });
  });
});

describe('busbar riser Icw on an assumed source', () => {
  const assumed: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => (b.upstreamId ? b : { ...b, sourceKva: undefined, sourceImpedancePct: undefined })) };
  it('is not verified, neither passed nor failed, and the notes and report say so', () => {
    const r = sizeRiser(assumed, tower);
    expect(r.icwAssumed).toBe(true);
    expect(r.icwOk).toBeUndefined();
    expect(r.notes.some((n) => n.includes('not verified: source fault level assumed'))).toBe(true);
    const p: Project = { ...assumed, busRisers: [tower] };
    const sec = buildSection('busbar', { project: p, results: [], earthing: [], selectivity: [] }, scopeOf(p, { boards: [], downstream: true }));
    expect(sec.statuses).toEqual(['warn']);
  });
  it('a real source is checked as before, with no flag', () => {
    const r = sizeRiser(sampleProject, tower);
    expect('icwAssumed' in r).toBe(false);
    expect(typeof r.icwOk).toBe('boolean');
  });
});
