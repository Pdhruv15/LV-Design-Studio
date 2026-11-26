import { afterEach, describe, expect, it } from 'vitest';
import { alphaOf, familyFromWords, familyLabel, familyOfType, familyRatingA, feederFamily, kCpcOf, singleCoreXOhmPerKm, type CableFamily } from './cableFamily';
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

  it('builds aluminium from the standard resistance, the multicore reactance and its built-in rating', () => {
    const r = resolveCable(95, AL)!;
    expect(r.source).toBe('reference');
    expect(r.spec.rOhmPerKm20C).toBe(0.32);
    expect(r.spec.xOhmPerKm).toBe(getCable(95).xOhmPerKm);
    expect(methodRating(95, 'E', AL)).toEqual({ a: 227, source: 'reference' });
    expect(methodRating(95, 'C', AL)).toBeNull(); // other installation methods: no built-in rating
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

  it('on: the built-in rating of the family is derated and used, reported as a reference value', () => {
    const on = project([al], { cableDataByType: true });
    const rating = feederRating(on, al);
    expect(rating.baseA).toBe(227);
    expect(rating.iz).toBeCloseTo(227 * ambientCorrectionFactor(40), 6);
    expect(cableDataStatus(on).families).toMatchObject([{ csaMm2: 95, label: 'Al/XLPE multicore', source: 'reference', rating: 'reference' }]);
    expect(cableDataFindings(on)).toEqual([]);
    expect(cableDataFindings({ ...on, strictCableData: true }).some((x) => x.status === 'bad' && /95 mm² Al\/XLPE multicore without manufacturer data/.test(x.text))).toBe(true);
  });

  it('on: an installation method with no rating for the family is missing (DATA REQUIRED), never the copper one', () => {
    const clipped = { ...al, installMethod: 'C' as const };
    const on = project([clipped], { cableDataByType: true });
    const rating = feederRating(on, clipped);
    expect(rating.iz).toBeNaN();
    expect(rating.missing).toMatch(/Al\/XLPE multicore/);
    expect(cableDataFindings(on).some((x) => x.status === 'bad' && /no current rating for 95 mm² Al\/XLPE multicore \(C\)/.test(x.text))).toBe(true);
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

describe('built-in ratings of the cable families', () => {
  const fam = (conductor: 'cu' | 'al', insulation: 'xlpe' | 'pvc', form: 'multi' | 'trefoil' | 'flat'): CableFamily => ({ conductor, insulation, form });
  const SIZES = [16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];
  it('gives the standard values at 95 mm²', () => {
    expect(familyRatingA(fam('cu', 'pvc', 'multi'), 95)).toBe(238);
    expect(familyRatingA(fam('al', 'xlpe', 'multi'), 95)).toBe(227);
    expect(familyRatingA(fam('al', 'pvc', 'multi'), 95)).toBe(183);
    expect(familyRatingA(fam('cu', 'xlpe', 'trefoil'), 95)).toBe(328);
    expect(familyRatingA(fam('cu', 'xlpe', 'flat'), 95)).toBe(342);
    expect(familyRatingA(fam('cu', 'pvc', 'trefoil'), 95)).toBe(264);
    expect(familyRatingA(fam('al', 'xlpe', 'trefoil'), 95)).toBe(253);
  });
  it('rises with the size in every family, and keeps the physical order between families', () => {
    for (const f of [fam('cu', 'pvc', 'multi'), fam('al', 'xlpe', 'multi'), fam('al', 'pvc', 'multi'), fam('cu', 'xlpe', 'trefoil'), fam('cu', 'xlpe', 'flat'), fam('cu', 'pvc', 'trefoil'), fam('cu', 'pvc', 'flat'), fam('al', 'xlpe', 'trefoil'), fam('al', 'xlpe', 'flat'), fam('al', 'pvc', 'trefoil')]) {
      const amps = SIZES.map((s) => familyRatingA(f, s)!);
      expect(amps.every((a) => a > 0), familyLabel(f)).toBe(true);
      expect(amps.every((a, i) => i === 0 || a > amps[i - 1]), familyLabel(f)).toBe(true);
    }
    for (const s of SIZES.slice(1)) {
      expect(familyRatingA(fam('cu', 'pvc', 'multi'), s)!).toBeLessThan(methodRating(s, 'E')!.a); // PVC below XLPE
      expect(familyRatingA(fam('al', 'xlpe', 'multi'), s)!).toBeLessThan(methodRating(s, 'E')!.a); // aluminium below copper
      expect(familyRatingA(fam('al', 'pvc', 'multi'), s)!).toBeLessThan(familyRatingA(fam('al', 'xlpe', 'multi'), s)!);
      expect(familyRatingA(fam('cu', 'xlpe', 'flat'), s)!).toBeGreaterThan(familyRatingA(fam('cu', 'xlpe', 'trefoil'), s)!); // side by side cools better
      expect(familyRatingA(fam('cu', 'xlpe', 'trefoil'), s)!).toBeGreaterThan(familyRatingA(fam('cu', 'pvc', 'trefoil'), s)!);
      // Aluminium carries about 0.78 of copper in the same cable.
      const ratio = familyRatingA(fam('al', 'xlpe', 'trefoil'), s)! / familyRatingA(fam('cu', 'xlpe', 'trefoil'), s)!;
      expect(ratio).toBeGreaterThan(0.74); expect(ratio).toBeLessThan(0.8);
    }
  });
  it('small single cores take the multicore rating of the same conductor and insulation (the lower one)', () => {
    expect(familyRatingA(fam('cu', 'pvc', 'trefoil'), 2.5)).toBe(25);
    expect(familyRatingA(fam('cu', 'xlpe', 'flat'), 16)).toBe(100);
    expect(familyRatingA(fam('al', 'xlpe', 'trefoil'), 16)).toBe(77);
    expect(familyRatingA(fam('cu', 'pvc', 'trefoil'), 16)!).toBeLessThan(familyRatingA(fam('cu', 'pvc', 'trefoil'), 25)!);
  });
  it('has none where the family is not made or not tabulated', () => {
    expect(familyRatingA(fam('al', 'xlpe', 'multi'), 10)).toBeUndefined();
    expect(familyRatingA(fam('al', 'pvc', 'flat'), 95)).toBeUndefined();
    expect(familyRatingA(fam('cu', 'pvc', 'multi'), 400)).toBeUndefined();
  });
  it('a PVC wire in a project with cable data by type gets a rating and a result', () => {
    const wire = feeder({ cableType: 'PVC 1C', cableCsaMm2: 4, cores: 2, loadKw: 3, breakerRatingA: 20, lengthM: 20 });
    const on = project([wire], { cableDataByType: true });
    expect(feederRating(on, wire).baseA).toBe(34);
    expect(Number.isFinite(evaluateFeeder(on, wire).ampacity)).toBe(true);
  });
});
