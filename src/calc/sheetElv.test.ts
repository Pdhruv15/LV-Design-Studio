import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOGUE } from '../elv/defaults';
import { cameraRangeM, DORI_PX_PER_M } from '../elv/devices';
import { APP_FUNCTIONS, evaluateSheet, type SheetCells } from './sheetFormula';

const one = (formula: string, cells: SheetCells = {}) => evaluateSheet({ ...cells, Z99: formula }).Z99;
const v = (formula: string, cells: SheetCells = {}) => one(formula, cells).value as number;
const err = (formula: string, cells: SheetCells = {}) => one(formula, cells).error;

describe('sheet formulas — ELV functions', () => {
  it('are the app\'s own functions too', () => {
    for (const f of ['CAMRANGE', 'FABATT', 'FACHARGE', 'NVRTB', 'PAWATTS', 'POESWITCH', 'VDDC']) expect(APP_FUNCTIONS).toContain(f);
  });

  it('use the ELV estimate\'s defaults (the ELV module is kept apart, so they are written twice)', () => {
    const fa = DEFAULT_CATALOGUE.fireAlarm;
    expect([fa.standbyH, fa.alarmH, fa.batteryFactor, fa.rechargeH]).toEqual([24, 0.5, 1.25, 24]);
    expect(DEFAULT_CATALOGUE.pa.headroom).toBe(1.25);
    expect(DORI_PX_PER_M).toEqual({ detect: 25, observe: 62.5, recognise: 125, identify: 250 });
  });

  it('FABATT and FACHARGE: the battery and charger, as the ELV estimate sizes the fire alarm panel', () => {
    // 1.25 × (0.4 A × 24 h + 1.5 A × 0.5 h) = 12.94 Ah.
    expect(v('=FABATT(400,1500)')).toBeCloseTo(12.94, 2);
    expect(v('=FABATT(400,1500,72,0.5,1)')).toBeCloseTo(29.55, 9);
    expect(v('=FACHARGE(FABATT(400,1500))')).toBeCloseTo(0.43, 2); // 80 % of 12.94 Ah in 24 h
    expect(err('=FABATT(-1,1500)')).toBe('#VALUE!');
    expect(err('=FABATT(400,1500,24,0.5,0.9)')).toBe('#VALUE!'); // a factor below 1
    expect(err('=FACHARGE(12,0)')).toBe('#VALUE!');
  });

  it('POESWITCH: enough switches for the ports and for the PoE budget', () => {
    expect(v('=POESWITCH(50,12.95,20,370)')).toBe(3); // ports decide: 50 ÷ 20
    expect(v('=POESWITCH(30,30,24,370)')).toBe(3); // power decides: 900 W ÷ 370 W
    expect(v('=POESWITCH(0,12.95,20,370)')).toBe(0);
    expect(err('=POESWITCH(2.5,12.95,20,370)')).toBe('#VALUE!');
    expect(err('=POESWITCH(50,12.95,20,0)')).toBe('#VALUE!');
  });

  it('CAMRANGE: the distance a camera meets a DORI class, by letter, by word or in pixels per metre', () => {
    expect(v('=CAMRANGE(90,1920,"R")')).toBeCloseTo(7.68, 9); // 1920 ÷ (125 × 2 × tan 45°)
    expect(v('=CAMRANGE(90,1920,"recognise")')).toBeCloseTo(7.68, 9);
    expect(v('=CAMRANGE(90,1920,125)')).toBeCloseTo(7.68, 9);
    expect(v('=CAMRANGE(90,1920,A1)', { A1: 'i' })).toBeCloseTo(3.84, 9);
    expect(v('=CAMRANGE(60,2560,"D")')).toBeCloseTo(cameraRangeM(60, 2560, 'detect'), 9);
    expect(err('=CAMRANGE(90,1920,"X")')).toBe('#VALUE!');
    expect(err('=CAMRANGE(90,1920,A1)')).toBe('#VALUE!'); // a blank class
    expect(err('=CAMRANGE(0,1920,"R")')).toBe('#VALUE!');
    expect(err('=CAMRANGE("wide",1920,"R")')).toBe('#VALUE!');
  });

  it('PAWATTS and NVRTB: amplifier power and recording storage', () => {
    expect(v('=PAWATTS(600)')).toBe(750);
    expect(v('=PAWATTS(600,1.5)')).toBe(900);
    expect(err('=PAWATTS(600,0.5)')).toBe('#VALUE!');
    expect(v('=NVRTB(100,4,30)')).toBeCloseTo(129.6, 9); // 100 × 4 Mbit/s × 30 days
    expect(v('=NVRTB(100,4,30,12)')).toBeCloseTo(64.8, 9);
    expect(err('=NVRTB(100,4,30,25)')).toBe('#VALUE!');
  });

  it('VDDC: the drop of a 24 V loop or sounder circuit, out and back, warmer conductors losing more', () => {
    // 2 × 0.5 A × 500 m × 0.0121 Ω/m = 6.05 V of 24 V.
    expect(v('=VDDC(500,500,1.5)')).toBeCloseTo(25.21, 2);
    expect(v('=VDDC(500,500,1.5,24,50)')).toBeCloseTo(25.21 * (1 + 0.00393 * 30), 1);
    expect(v('=VDDC(500,500,1.5,12)')).toBeCloseTo(50.42, 2);
    expect(v('=VDDC(100,200,1)')).toBeCloseTo(3.02, 2); // 2 × 0.1 × 200 × 0.0181 ÷ 24
    expect(err('=VDDC(500,500,3)')).toBe('#N/A'); // not a conductor size
    expect(err('=VDDC(500,500,1.5,0)')).toBe('#VALUE!');
  });
});
