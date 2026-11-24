import { afterEach, describe, expect, it } from 'vitest';
import { alphaOf, familyFromWords, familyLabel, familyOfType, feederFamily, kCpcOf, singleCoreXOhmPerKm, type CableFamily } from './cableFamily';
import { ambientCorrectionFactor, cableDataFindings, cableDataStatus, cables, getCable, methodRating, resolveCable, setCables, typesOnDefaultData } from './cableTable';
import { cableImpedance, evaluateFeeder, feederRating, rOperatingOhmPerKm } from './electrical';
import { evaluateEarthing } from './earthing';
import { vdRow } from './voltageDrop';
import type { Feeder, Project } from '../types';

const AL: CableFamily = { conductor: 'al', insulation: 'xlpe', form: 'multi' };
const PVC: CableFamily = { conductor: 'cu', insulation: 'pvc', form: 'multi' };
const TREFOIL: CableFamily = { conductor: 'cu', insulation: 'xlpe', form: 'trefoil' };

const feeder = (over: Partial<Feeder>): Feeder => ({
  id: 'F', boardId: 'MDB', name: 'F', loadKw: 60, demandFactor: 1, powerFactor: 0.9, lengthM: 80,
  cableCsaMm2: 95, cores: 4, breakerRatingA: 125, breakerIcuKa: 36, ...over
});
const project = (feeders: Feeder[], over: Partial<Project> = {}): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 40, vdLimitPct: 4, updatedAt: '',
  boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }],
  feeders, ...over
});

afterEach(() => setCables(null));

describe('cable families', () => {
  it('maps the cable types of the list to a family; unknown and fire-rated types stay copper / XLPE / multicore', () => {
    expect(familyOfType('AL/XLPE/SWA/PVC')).toEqual(AL);
    expect(familyOfType('PVC/SWA/PVC')).toEqual(PVC);
    expect(familyOfType('XLPE 1C')).toEqual(TREFOIL);
    expect(familyOfType('XLPE 1C FLAT').form).toBe('flat');
    expect(familyLabel(familyOfType('FR BS 8491'))).toBe('Cu/XLPE multicore');
    expect(familyLabel(familyOfType(undefined))).toBe('Cu/XLPE multicore');
  });

  it('uses a type\'s family only when the project keeps cable data by type', () => {
    const f = { cableType: 'AL/XLPE/SWA/PVC' };
    expect(feederFamily({}, f).conductor).toBe('cu');
    expect(feederFamily({ cableDataByType: true }, f)).toEqual(AL);
  });

  it('reads the words of a Cables.xlsx row; blank is the default, an unknown word is refused', () => {
    expect(familyFromWords('', '', '')).toEqual({ conductor: 'cu', insulation: 'xlpe', form: 'multi' });
    expect(familyFromWords('Al', 'PVC', 'Single-core, flat')).toEqual({ conductor: 'al', insulation: 'pvc', form: 'flat' });
    expect(familyFromWords('Ag', '', '')).toBeNull();
  });

  it('gives the conductor constants of the family', () => {
    expect(alphaOf(AL)).toBe(0.00403);
    expect(alphaOf(PVC)).toBe(0.00393);
    expect([kCpcOf(), kCpcOf(PVC), kCpcOf(AL), kCpcOf({ ...AL, insulation: 'pvc' })]).toEqual([143, 115, 94, 76]);
  });

  it('calculates the reactance of single cores: flat above trefoil, both above 0.07 and below 0.13 ohm/km', () => {
    const t = singleCoreXOhmPerKm(240, 'trefoil')!, f = singleCoreXOhmPerKm(240, 'flat')!;
    expect(t).toBeCloseTo(0.078, 3);
    expect(f - t).toBeCloseTo(2 * Math.PI * 50 * 0.2e-3 * Math.log(Math.cbrt(2)), 3);
    for (const csa of [1.5, 16, 95, 300]) { const x = singleCoreXOhmPerKm(csa, 'flat')!; expect(x).toBeGreaterThan(0.07); expect(x).toBeLessThan(0.13); }
    expect(singleCoreXOhmPerKm(7, 'trefoil')).toBeUndefined();
  });
});

describe('cable data by family', () => {
  it('keeps the default family exactly as before', () => {
    expect(getCable(95)).toBe(getCable(95, { conductor: 'cu', insulation: 'xlpe', form: 'multi' }));
    expect(methodRating(95, 'E')?.a).toBe(306);
  });

  it('builds aluminium from IEC 60228 with the multicore reactance and no rating', () => {
    const r = resolveCable(95, AL)!;
    expect(r.source).toBe('reference');
    expect(r.spec.rOhmPerKm20C).toBe(0.32);
    expect(r.spec.xOhmPerKm).toBe(getCable(95).xOhmPerKm);
    expect(methodRating(95, 'E', AL)).toBeNull();
    expect(resolveCable(10, AL)).toBeNull(); // not made in aluminium
    expect(() => getCable(10, AL)).toThrow(/Al\/XLPE multicore/);
  });

  it('corrects aluminium resistance with its own coefficient', () => {
    expect(rOperatingOhmPerKm(95, 90, AL)).toBeCloseTo(0.32 * (1 + 0.00403 * 70), 6);
    expect(rOperatingOhmPerKm(95, undefined, AL)).toBeCloseTo(0.32 * 1.2, 6);
    expect(cableImpedance(95, 1000, 2, AL)).toEqual({ r: 0.16, x: getCable(95).xOhmPerKm / 2 });
  });

  it('derates PVC cable for ambient on 70 °C, and gives no factor above its table', () => {
    expect(ambientCorrectionFactor(40, PVC)).toBeCloseTo(0.87, 2);
    expect(ambientCorrectionFactor(60, PVC)).toBeCloseTo(0.5, 2);
    expect(ambientCorrectionFactor(65, PVC)).toBeNaN();
    expect(ambientCorrectionFactor(40)).toBeCloseTo(0.91, 2);
  });

  it('takes rows of another family from Cables.xlsx and leaves them out of the size list', () => {
    setCables([
      { csaMm2: 95, rOhmPerKm20C: 0.193, xOhmPerKm: 0.075, ampacityA: 300 },
      { csaMm2: 95, rOhmPerKm20C: 0.32, xOhmPerKm: 0.076, ampacityA: 230, family: AL, methodRatings: { C: 210 }, manufacturer: 'M', referenceDoc: 'D' }
    ]);
    expect(cables().map((c) => c.csaMm2)).toEqual([95]);
    expect(getCable(95).ampacityA).toBe(300);
    expect(methodRating(95, 'E', AL)).toEqual({ a: 230, source: 'manufacturer' });
    expect(methodRating(95, 'C', AL)).toEqual({ a: 210, source: 'manufacturer' });
    expect(methodRating(95, 'D1', AL)).toBeNull();
    expect(resolveCable(120, AL)?.source).toBe('reference');
  });
});

describe('a project with cable data by type', () => {
  const al = feeder({ cableType: 'AL/XLPE/SWA/PVC' });

  it('off: an aluminium-typed cable is calculated as before, with a to-do line', () => {
    const off = project([al]), plain = project([feeder({})]);
    expect(evaluateFeeder(off, al).vdPct).toBe(evaluateFeeder(plain, plain.feeders[0]).vdPct);
    expect(evaluateFeeder(off, al).endFaultKA).toBe(evaluateFeeder(plain, plain.feeders[0]).endFaultKA);
    expect(typesOnDefaultData(off)).toEqual(['Al/XLPE multicore']);
    expect(cableDataFindings(off).some((x) => x.status === 'warn' && /Cable data by type is off/.test(x.text))).toBe(true);
    expect(cableDataFindings(plain)).toEqual([]);
  });

  it('on: voltage drop and the end fault follow the aluminium resistance', () => {
    const on = project([al], { cableDataByType: true }), plain = project([feeder({})]);
    const a = evaluateFeeder(on, al), c = evaluateFeeder(plain, plain.feeders[0]);
    expect(a.vdPct).toBeGreaterThan(c.vdPct * 1.4);
    expect(a.endFaultKA).toBeLessThan(c.endFaultKA);
    expect(a.breakerFaultKA).toBe(c.breakerFaultKA);
    expect(vdRow(on, al).vdPct).toBeCloseTo(a.vdPct, 6);
  });

  it('on: with no rating in the data the rating is missing (DATA REQUIRED), never the copper one', () => {
    const on = project([al], { cableDataByType: true });
    const rating = feederRating(on, al);
    expect(rating.iz).toBeNaN();
    expect(rating.missing).toMatch(/Al\/XLPE multicore/);
    expect(cableDataStatus(on).families).toMatchObject([{ csaMm2: 95, label: 'Al/XLPE multicore', source: 'reference', rating: undefined }]);
    expect(cableDataFindings(on).some((x) => x.status === 'bad' && /no current rating for 95 mm² Al\/XLPE multicore/.test(x.text))).toBe(true);
  });

  it('on: a rating from Cables.xlsx is derated and used', () => {
    setCables([{ csaMm2: 95, rOhmPerKm20C: 0.32, xOhmPerKm: 0.076, ampacityA: 230, family: AL, manufacturer: 'M', referenceDoc: 'D' }]);
    const on = project([al], { cableDataByType: true });
    expect(feederRating(on, al).iz).toBeCloseTo(230 * ambientCorrectionFactor(40), 6);
    expect(cableDataFindings(on)).toEqual([]);
  });

  it('on: the adiabatic check uses the k of the family', () => {
    const pvc = feeder({ cableType: 'PVC/SWA/PVC' });
    const on = evaluateEarthing(project([pvc], { cableDataByType: true }), pvc), off = evaluateEarthing(project([pvc]), pvc);
    expect(on.adiabaticWholeMm2 / off.adiabaticWholeMm2).toBeCloseTo(143 / 115, 6);
  });

  it('on: a protective conductor size aluminium is not made in is taken as copper', () => {
    const f = feeder({ cableType: 'AL/XLPE/SWA/PVC', cableCsaMm2: 16, cpcMm2: 6, loadKw: 10, breakerRatingA: 32 });
    expect(Number.isFinite(evaluateEarthing(project([f], { cableDataByType: true }), f).zsOhm)).toBe(true);
  });
});
