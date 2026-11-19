import { afterEach, describe, expect, it } from 'vitest';
import { ambientCorrectionFactor, cables, getCable, REFERENCE_CABLE_TABLE, setCables } from './cableTable';
import { cableFor, voltageDrop } from './quick';
import { APP_FUNCTIONS, evaluateSheet, SHEET_FUNCTIONS, shiftFormula, type SheetCells } from './sheetFormula';
import { setBreakerLists } from './sizing';

const one = (formula: string, cells: SheetCells = {}) => evaluateSheet({ ...cells, Z99: formula }).Z99;
const v = (formula: string, cells: SheetCells = {}) => one(formula, cells).value as number;
const err = (formula: string, cells: SheetCells = {}) => one(formula, cells).error;

afterEach(() => { setCables(null); setBreakerLists(null, null); });

describe('sheet formulas — electrical functions', () => {
  it('are sheet functions of the app\'s own, which Excel does not have', () => {
    const own = ['AMPS', 'BREAKER', 'CABLESIZE', 'CPC', 'DERATE', 'FAULTKA', 'KVAR', 'KW', 'TXSIZE', 'VD'];
    expect(APP_FUNCTIONS).toEqual(own);
    for (const f of own) expect(SHEET_FUNCTIONS).toContain(f);
  });

  it('AMPS and KW: line current from kW and back, 3-phase 400 V or 1-phase 230 V unless a voltage is given', () => {
    expect(v('=AMPS(10,0.85)')).toBeCloseTo(16.98, 2); // 10 000 ÷ (√3 · 400 · 0.85)
    expect(v('=AMPS(2,0.9,1)')).toBeCloseTo(9.66, 2); // 2 000 ÷ (230 · 0.9)
    expect(v('=AMPS(2,0.9,1,240)')).toBeCloseTo(9.26, 2);
    expect(v('=AMPS(10,0.85,3,415)')).toBeCloseTo(16.37, 2);
    expect(v('=KW(AMPS(10,0.85),0.85)')).toBeCloseTo(10, 9);
    expect(v('=KW(10,1,1)')).toBeCloseTo(2.3, 9);
    expect(v('=amps(A1,B1)', { A1: 10, B1: 0.85 })).toBeCloseTo(16.98, 2); // cells, any letter case
  });

  it('VD: the voltage drop %, as the app\'s calculators work it out', () => {
    // √3 · 100 A · 100 m · (0.524 · 1.2 · 0.85 + 0.08 · 0.527) ÷ 1000 = 9.99 V of 400 V.
    expect(v('=VD(100,100,35,0.85)')).toBeCloseTo(2.5, 2);
    expect(v('=VD(100,100,35,0.85)')).toBeCloseTo(voltageDrop(100, 100, 35, 3, 400, 0.85).pct, 12);
    // 1-phase: 2 · 10 A · 20 m · 7.41 · 1.2 ÷ 1000 = 3.56 V of 230 V.
    expect(v('=VD(10,20,2.5,1,1)')).toBeCloseTo(1.55, 2);
    // Twice the current on two runs: the same drop.
    expect(v('=VD(200,100,35,0.85,3,400,2)')).toBeCloseTo(v('=VD(100,100,35,0.85)'), 12);
    expect(err('=VD(100,100,7,0.85)')).toBe('#N/A'); // not a cable size the data has
    expect(err('=VD(100,100,0,0.85)')).toBe('#VALUE!');
  });

  it('BREAKER: the next rating of the app\'s breaker list (Breakers.xlsx when it has one)', () => {
    expect(v('=BREAKER(16.98)')).toBe(20);
    expect(v('=BREAKER(20)')).toBe(20);
    expect(v('=BREAKER(0)')).toBe(6);
    expect(err('=BREAKER(4001)')).toBe('#N/A');
    expect(err('=BREAKER(-1)')).toBe('#VALUE!');
    setBreakerLists([10, 25, 50], null);
    expect(v('=BREAKER(11)')).toBe(25);
  });

  it('CABLESIZE: the smallest cable whose derated rating covers the breaker and whose drop is in the limit', () => {
    // 16.98 A, 20 A breaker, 50 °C (factor 0.82): 1.5 mm² carries 21.3 A, and drops 2.73 % over 30 m.
    expect(v('=CABLESIZE(16.98,30,0.85,50,4)')).toBe(1.5);
    // Over 150 m the drop decides: 4 mm² drops 5.24 %, 6 mm² 3.52 %.
    expect(v('=CABLESIZE(16.98,150,0.85,50,4)')).toBe(6);
    const quick = cableFor(16.98, { lengthM: 150, phases: 3, voltageV: 400, pf: 0.85, ambientC: 50, groupFactor: 1, vdLimitPct: 4 });
    expect(quick.sel).toEqual({ csaMm2: 6, runs: 1 });
    // A larger breaker of the engineer's own: the cable must carry it.
    expect(v('=CABLESIZE(16.98,30,0.85,50,4,3,400,1,1,32)')).toBe(4); // 32 ÷ 0.82 = 39 A: 4 mm² (47 A)
  });

  it('CABLESIZE on parallel runs: each run 50 mm² or more, grouped for the runs unless a factor is given', () => {
    expect(err('=CABLESIZE(600,50,0.85,50,4)')).toBe('#N/A'); // 630 A breaker: no single cable at 50 °C
    // Two runs: 630 ÷ (0.82 · 0.88 · 2) = 437 A per run: 185 mm² (448 A).
    expect(v('=CABLESIZE(600,50,0.85,50,4,3,400,2)')).toBe(185);
    expect(getCable(185).ampacityA * ambientCorrectionFactor(50) * 0.88 * 2).toBeGreaterThanOrEqual(630);
    expect(v('=CABLESIZE(600,50,0.85,50,4,3,400,2,1)')).toBe(150); // grouping 1: 630 ÷ 1.64 = 384 A: 150 mm² (393 A)
    expect(v('=CABLESIZE(60,10,0.85,30,4,3,400,2)')).toBe(50); // never below 50 mm² in parallel
  });

  it('CABLESIZE refuses inputs it cannot size from', () => {
    expect(err('=CABLESIZE(9999,10,0.85,40,4)')).toBe('#N/A'); // no breaker that large
    expect(err('=CABLESIZE(16,30,0.85,80,4)')).toBe('#VALUE!'); // beyond the ambient table
    expect(err('=CABLESIZE(16,30,0.85,40,0)')).toBe('#VALUE!');
    expect(err('=CABLESIZE(16,30,0.85,40,4,3,400,1.5)')).toBe('#VALUE!');
    expect(err('=CABLESIZE(16,30,0.85,40,4,3,400,1,1,10)')).toBe('#VALUE!'); // breaker below the current
    expect(err('=CABLESIZE(16,30,0.85,40,4,2)')).toBe('#VALUE!'); // 2 phases
  });

  it('uses the cable data in use: Cables.xlsx rows replace the reference values', () => {
    const before = v('=VD(100,100,35,0.85)');
    setCables(REFERENCE_CABLE_TABLE.map((c) => (c.csaMm2 === 35 ? { ...c, rOhmPerKm20C: c.rOhmPerKm20C * 2 } : c)));
    expect(cables().find((c) => c.csaMm2 === 35)!.rOhmPerKm20C).toBeCloseTo(1.048, 9);
    expect(v('=VD(100,100,35,0.85)')).toBeGreaterThan(before * 1.8);
  });

  it('DERATE and CPC: the ambient factor (times grouping) and the protective conductor', () => {
    expect(v('=DERATE(30)')).toBe(1);
    expect(v('=DERATE(50,0.8)')).toBeCloseTo(0.656, 9);
    expect(v('=DERATE(52.5)')).toBeCloseTo(0.79, 9); // between 0.82 at 50 °C and 0.76 at 55 °C
    expect(err('=DERATE(20)')).toBe('#VALUE!');
    expect(err('=DERATE(40,1.2)')).toBe('#VALUE!');
    expect([16, 25, 35, 95, 240].map((s) => v(`=CPC(${s})`))).toEqual([16, 16, 16, 50, 120]);
    expect(err('=CPC(0)')).toBe('#VALUE!');
  });

  it('TXSIZE, FAULTKA and KVAR: transformer rating and fault level, capacitor kvar', () => {
    expect(v('=TXSIZE(900)')).toBe(1000);
    expect(v('=TXSIZE(1000)')).toBe(1000);
    expect(err('=TXSIZE(3200)')).toBe('#N/A');
    expect(v('=FAULTKA(1000,6)')).toBeCloseTo(25.26, 2); // 1.05 · 1 443 A ÷ 0.06
    expect(v('=FAULTKA(1000,6,415)')).toBeCloseTo(24.35, 2);
    expect(v('=KVAR(100,0.8,0.95)')).toBeCloseTo(42.13, 2); // 100 · (0.75 − 0.329)
    expect(v('=KVAR(100,0.96,0.95)')).toBe(0);
    expect(err('=KVAR(100,0,0.95)')).toBe('#VALUE!');
  });

  it('wrong arguments: too few or many, a range, a text, an unknown phase count', () => {
    expect(err('=AMPS(10)')).toBe('#VALUE!');
    expect(err('=AMPS(10,0.85,3,400,1)')).toBe('#VALUE!');
    expect(err('=AMPS(A1:A2,0.85)', { A1: 1, A2: 2 })).toBe('#VALUE!');
    expect(err('=AMPS("ten",0.85)')).toBe('#VALUE!');
    expect(err('=AMPS(10,0.85,2)')).toBe('#VALUE!');
    expect(err('=AMPS(10,1.2)')).toBe('#VALUE!');
    expect(v('=IFERROR(BREAKER(5000),"too big")')).toBe('too big');
  });

  it('fill down moves the cells and leaves the function names alone', () => {
    expect(shiftFormula('=CABLESIZE(C2,D2,E2,$B$1,$B$2)', 1, 0)).toBe('=CABLESIZE(C3,D3,E3,$B$1,$B$2)');
    expect(shiftFormula('=VD(C2,D2,F2,E2)', 2, 0)).toBe('=VD(C4,D4,F4,E4)');
  });
});
