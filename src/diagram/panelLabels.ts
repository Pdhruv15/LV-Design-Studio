import type { Board, Feeder, Project, SpareWay } from '../types';
import { incomerDeviceOf } from '../types';
import { cableTypeOf, needsFireRated } from '../model/cableTypes';
import { cpcOf } from '../calc/cableTable';
import { faultCurrentKA, impedanceToBoard, runsOf, sourceAssumed } from '../calc/electrical';
import { atsLines, atsOf, isInterlocked } from '../model/changeover';
import { deviceKind, devicePoles } from './deviceText';
import { elcbUnitOf, rcdInSwitch } from './IecSymbols';
import { sldDevices } from './sldDevices';
import { supplyPoint } from './supplyPoint';

/** What a DEWA-style panel prints beside its ways and its incomer, shared by the SLD (which draws it) and the layout
 * (which sizes each panel's frame, and the room after it, to it), so a panel's labels stay inside its own frame. */

/** Advance widths (em) of Arial, which printed sheets use, as [characters, regular, bold]. */
const EM: [string, number, number][] = [
  [' ', 0.278, 0.278], ['.,:;·/!|', 0.278, 0.333], ["'", 0.191, 0.238], ['-()[]²³', 0.333, 0.333], ['*', 0.389, 0.389],
  ['+×=<>±~', 0.584, 0.584], ['%', 0.889, 0.889], ['&', 0.667, 0.722], ['0123456789#$_', 0.556, 0.556],
  ['fijlt', 0.25, 0.3], ['r', 0.333, 0.389], ['cksvxyz', 0.5, 0.556], ['abdeghnopqu', 0.556, 0.611], ['w', 0.722, 0.778], ['m', 0.833, 0.889],
  ['I', 0.278, 0.278], ['J', 0.5, 0.556], ['FLTZ', 0.611, 0.611], ['ABEKPSVXYΔ', 0.667, 0.722], ['CDHNRU', 0.722, 0.722], ['GOQΩ', 0.778, 0.778],
  ['M', 0.833, 0.833], ['W', 0.944, 0.944]
];
const EM_OF = new Map(EM.flatMap(([cs, r, b]) => [...cs].map((c) => [c, [r, b]] as const)));
/** The screen's system font (San Francisco, Segoe UI) runs a few per cent wider than Arial. */
const SCREEN_ALLOWANCE = 1.06;

/** Width of a label in drawing units (px at the given font size), on screen or printed, whichever is wider. */
export const textWidth = (text: string, px: number, bold = false): number =>
  [...text].reduce((w, c) => w + (EM_OF.get(c)?.[bold ? 1 : 0] ?? 1), 0) * px * SCREEN_ALLOWANCE;

/** Breaker of a way, DEWA wording: "160A TPN MCCB". The word is the device drawn: ISOLATOR for a switch-disconnector,
 * RCBO (IEC symbols) when the earth leakage is in the breaker symbol. */
export const breakerText = (f: Feeder, iec = false) => `${f.breakerRatingA}A ${devicePoles(f)} ${iec && rcdInSwitch(f) ? 'RCBO' : f.device === 'ISOL' ? 'ISOLATOR' : deviceKind(f)}`;
/** Its breaking capacity, and the earth leakage rating with it: "25 kA · 30mA ELCB". With IEC symbols the mA follows
 * only an RCBO ("10 kA · 30mA"); any other earth leakage names itself in its own box. */
export const icuText = (f: Feeder, iec = false) => {
  if (!iec) return `${f.breakerIcuKa} kA${f.rcdMa ? ` · ${f.rcdMa}mA ELCB` : ''}`;
  const ma = rcdInSwitch(f) ? sldDevices(f).elcb?.ma ?? f.rcdMa : undefined;
  return `${f.breakerIcuKa} kA${ma ? ` · ${ma}mA` : ''}`;
};
/** Local isolator at the equipment. */
export const isolatorText = (f: Feeder) => `${f.breakerRatingA}A ${devicePoles(f)} ISOLATOR (W/P)`;
/** A cable that should be fire rated and isn't, flagged after its size. */
export const fireRatedWarning = (project: Project, f: Feeder) => needsFireRated(project, f) && !cableTypeOf(project, f).fireRated;

/** The cable's two lines under the breaker: size and type, then the protective conductor and length. With cable
 * reference numbers the type goes to the cable schedule and the length prints smaller. */
export function cableLines(project: Project, f: Feeder, cableRefs = false): [string, string] {
  const t = cableTypeOf(project, f), runs = runsOf(f) > 1 ? `${runsOf(f)}×` : '';
  return cableRefs
    ? [`${runs}${f.cores}C ${f.cableCsaMm2}mm²${t.fireRated ? ' *' : ''}`, `${f.lengthM}m`]
    : [`${runs}${f.cores}C ${f.cableCsaMm2}mm² CU/${t.code}`, `${t.armoured ? `+1C ${cpcOf(f)}mm² ECC · ` : ''}${f.lengthM}m`];
}

/** How far right of its line a way's labels reach: breaker, breaking capacity, cable and isolator (results are left
 * out, so a calculation never moves the drawing). `load`: the way ends at a load, not at a sub-board's incomer. */
export function wayReach(project: Project, f: Feeder, load: boolean, cableRefs = false, iec = false): number {
  const [c1, c2] = cableLines(project, f, cableRefs);
  const unit = iec ? elcbUnitOf(f) : undefined;
  return Math.max(
    10 + textWidth(breakerText(f, iec), 11, true),
    10 + textWidth(icuText(f, iec), 10),
    unit ? 10 + 34 : 0,
    unit?.ma ? 10 + textWidth(`${unit.ma}mA`, 10) : 0,
    7 + textWidth(`${c1}${fireRatedWarning(project, f) ? ' ⚠ FR' : ''}`, 9),
    7 + textWidth(c2, cableRefs ? 8 : 9),
    load && f.localIsolator ? 10 + textWidth(isolatorText(f), 9) : 0
  );
}

/** Poles of a spare breaker or a space. */
export const sparePoles = (w: SpareWay) => (w.phase === 'RYB' ? 'TP' : 'SP');
/** A spare breaker's label: "63A TP MCCB". */
export const spareText = (w: SpareWay) => `${w.ratingA}A ${sparePoles(w)}${w.device ? ` ${w.device}` : ''}`;
/** How far right of its line a spare or a space reaches. */
export const spareReach = (w: SpareWay) => (w.kind === 'space'
  ? 10 + Math.max(textWidth('SPACE', 12, true), textWidth(`${sparePoles(w)} · no breaker`, 11))
  : 10 + Math.max(textWidth(spareText(w), 11, true), textWidth('SPARE', 12, true)));

/** The incomer's switching device and its breaking capacity: "500 A TP MCCB (NA)", "Icu 36 kA" (with "< Isc …" when it
 * can't break the board's prospective fault current, unless that fault level is only assumed). */
export function incomerTexts(project: Project, b: Board): { device: string; icu?: string; low: boolean } | undefined {
  const dev = incomerDeviceOf(b);
  if (!dev || b.standby) return undefined;
  const inc = project.feeders.find((f) => f.feedsBoardId === b.id && f.boardId === b.upstreamId);
  const rating = inc?.breakerRatingA ?? b.ratedCurrentA;
  const poles = inc ? (inc.cores >= 3 ? 'TP' : 'SP') : 'TP';
  const device = `${rating ? `${rating} A ` : ''}${poles} ${dev === 'MCCB-NA' ? 'MCCB (NA)' : dev === 'ISOL' ? 'ISOLATOR' : dev}`;
  if (!inc?.breakerIcuKa) return { device, low: false };
  const isc = faultCurrentKA(impedanceToBoard(project, b.id), project.voltageV);
  // An assumed source (placeholder fault level) is no ground for calling the Icu too low.
  const low = Number.isFinite(isc) && inc.breakerIcuKa < isc - 1e-6 && !sourceAssumed(project, b.id);
  return { device, icu: `Icu ${inc.breakerIcuKa} kA${low ? ` < Isc ${isc.toFixed(1)} kA` : ''}`, low };
}

/** A first board's supply lines, title first (bold), as the SLD prints them: from the shared supply model, so the
 * drawing, the Board tab and the sheet agree. Empty for a transformer or a board with a board above it. */
export function supplyLines(project: Pick<Project, 'voltageV'>, b: Board, dewa: boolean): string[] {
  const sp = supplyPoint(project, b, dewa);
  return sp ? [sp.title, ...sp.lines] : [];
}

/** How far right of its supply line a first board's supply texts reach, from the offsets and font sizes the SLD draws
 * them with: a source (symbol, then lines 24 right beside its meter box, 18 right without one), a board outside the project or an unset supply (11 px, 14 right). */
export function supplyReach(project: Pick<Project, 'voltageV'>, b: Board, dewa: boolean): number {
  const sp = supplyPoint(project, b, dewa);
  if (!sp) return 0;
  if (sp.mode === 'source') return Math.max(18 + textWidth(sp.title, 12, true), ...sp.lines.map((t) => (sp.meter ? 24 : 18) + textWidth(t, 11)));
  return Math.max(7, 14 + textWidth(sp.title, sp.mode === 'board' ? 11 : 12, true), ...sp.lines.map((t) => 14 + textWidth(t, 11)));
}

/** How far right of the incomer line its labels reach: the device and its breaking capacity, or an ATS and its
 * generator (a mains / generator changeover draws its own incomers, kept clear by its slots). */
export function incomerReach(project: Project, b: Board): number {
  const t = incomerTexts(project, b);
  const own = t ? 10 + Math.max(textWidth(t.device, 11, true), t.icu ? textWidth(t.icu, 10) : 0) : 0;
  const ats = b.standby && !isInterlocked(b) ? atsOf(project, b) : undefined;
  const sb = ats ? Math.max(...atsLines(ats).map((s, i) => 14 + textWidth(s, i ? 10 : 11, !i)), 60 + textWidth(`${b.standby!.kva} kVA`, 11)) : 0;
  return Math.max(own, sb);
}

/** A board's busbar description, drawn at the busbar's right-hand end on two lines: "630 A TPN+E", "Cu BUSBAR". */
export const busbarLines = (b: Board): [string, string] | undefined =>
  b.ratedCurrentA ? [`${b.ratedCurrentA} A TPN+E`, `${b.busbarMaterial === 'aluminium' ? 'Al' : 'Cu'} BUSBAR`] : undefined;

/** How far right of the incomer line the busbar must run so its two-line description clears the line. */
export const busbarReach = (b: Board): number => {
  const lines = busbarLines(b);
  return lines ? 10 + Math.max(...lines.map((t) => textWidth(t, 11, true))) : 0;
};
