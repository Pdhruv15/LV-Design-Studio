import { resistanceFactor } from './electrical';
import type { SheetFunction } from './sheetElectrical';

/** ELV functions for the built-in sheets' formulas, with the methods and defaults of the ELV estimate (src/elv/estimate.ts,
 * src/elv/devices.ts, src/elv/defaults.ts). LV code may not use the ELV module (the module boundary in eslint.config.js),
 * so these few formulas are written here again; sheetElv.test.ts checks them against the ELV module.
 *
 * Optional arguments are left off the end. NaN out shows #VALUE!, undefined (a size the data does not have) #N/A. */

/** Pixels per metre of the scene for each DORI class (IEC 62676-4), as the ELV camera check uses. */
const DORI_PX_PER_M: Record<string, number> = { D: 25, DETECT: 25, O: 62.5, OBSERVE: 62.5, R: 125, RECOGNISE: 125, RECOGNIZE: 125, I: 250, IDENTIFY: 250 };
/** Conductor resistance at 20 °C, Ω/km: IEC 60228 class 1 and 2 plain copper, the sizes of ELV circuits. */
const R20_OHM_PER_KM: Record<number, number> = { 0.5: 36, 0.75: 24.5, 1: 18.1, 1.5: 12.1, 2.5: 7.41, 4: 4.61, 6: 3.08 };

const within = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
const count = (n: number) => Number.isInteger(n) && n >= 0;

export const ELV_FUNCTIONS: Record<string, SheetFunction> = {
  /** FABATT(quiescent mA, alarm mA, [standby h], [alarm h], [factor]): the fire alarm battery, Ah — factor × (quiescent A ×
   * standby h + alarm A × alarm h); 24 h standby, 30 min alarm and an ageing factor of 1.25 unless given. */
  FABATT: {
    min: 2, max: 5, fn: ([q, al, standbyH = 24, alarmH = 0.5, k = 1.25]) =>
      q >= 0 && al >= 0 && within(standbyH, 0, 168) && within(alarmH, 0, 24) && within(k, 1, 3) ? k * ((q / 1000) * standbyH + (al / 1000) * alarmH) : NaN
  },
  /** FACHARGE(Ah, [recharge h]): the charger current, A, to bring the battery back to 80 % in the recharge time (24 h). */
  FACHARGE: { min: 1, max: 2, fn: ([ah, h = 24]) => (ah >= 0 && within(h, 1, 168) ? (0.8 * ah) / h : NaN) },
  /** POESWITCH(devices, W each, ports per switch, PoE budget W): the PoE switches, enough for both the ports and the power. */
  POESWITCH: {
    min: 4, max: 4, fn: ([n, w, ports, budgetW]) =>
      count(n) && w >= 0 && Number.isInteger(ports) && ports >= 1 && budgetW > 0 ? Math.max(Math.ceil(n / ports), Math.ceil((n * w) / budgetW)) : NaN
  },
  /** CAMRANGE(field of view °, horizontal pixels, class): how far a camera meets a DORI class, m. Class: "D", "O", "R" or
   * "I" (detect, observe, recognise, identify), or the pixels per metre it needs. */
  CAMRANGE: {
    min: 3, max: 3, words: [2], fn: ([fov, px, cls]: (number | string)[]) => {
      const word = String(cls).trim();
      const pxPerM = DORI_PX_PER_M[word.toUpperCase()] ?? (word !== '' && Number(word) > 0 ? Number(word) : NaN);
      return typeof fov === 'number' && typeof px === 'number' && fov > 0 && fov < 180 && px > 0 ? px / (pxPerM * 2 * Math.tan((fov * Math.PI) / 360)) : NaN;
    }
  },
  /** PAWATTS(speaker taps W, [headroom]): the amplifier power for the speakers' taps, W (headroom 1.25). */
  PAWATTS: { min: 1, max: 2, fn: ([taps, headroom = 1.25]) => (taps >= 0 && within(headroom, 1, 3) ? taps * headroom : NaN) },
  /** NVRTB(cameras, Mbps each, days, [hours a day]): the recording storage, TB (10¹² bytes), recording 24 h a day. */
  NVRTB: {
    min: 3, max: 4, fn: ([cams, mbps, days, hours = 24]) =>
      count(cams) && mbps >= 0 && days >= 0 && within(hours, 0, 24) ? (cams * mbps * 3600 * hours * days) / 8 / 1e6 : NaN
  },
  /** VDDC(mA, length m, mm², [V], [°C]): the voltage drop of a 2-wire DC circuit (a fire alarm loop or sounder circuit),
   * % of V — 2 × I × L × R, at 24 V and 20 °C unless given. */
  VDDC: {
    min: 3, max: 5, fn: ([ma, lengthM, mm2, v = 24, tempC = 20]) => {
      if (!(ma >= 0 && lengthM >= 0 && v > 0 && within(tempC, -20, 90) && mm2 > 0)) return NaN;
      const r = R20_OHM_PER_KM[mm2];
      return r === undefined ? undefined : ((2 * (ma / 1000) * lengthM * (r / 1000) * resistanceFactor(tempC)) / v) * 100;
    }
  }
};
