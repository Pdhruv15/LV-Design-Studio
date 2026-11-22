import type { Board, Project, SourceKind } from '../types';
import { SOURCE_KINDS, supplyFaultKa, supplyIncomerFeeder } from '../types';
import { assumedSourceFaultKa, cableSizeText } from '../calc/electrical';

/** What a first board's supply point shows on the SLD, the Board tab and the printed board sheet, from one place so
 * the three cannot say different things. A first board is one with no board above it. */
export type SupplyMode = 'transformer' | 'source' | 'board' | 'unset';

const named = (s?: string) => (typeof s === 'string' ? s.trim() || undefined : undefined);

/** How a first board is supplied: a transformer (its own, or an RMU / substation named), a supply source, a board
 * outside this project, or not set. Undefined for a board that has a board above it. */
export function supplyMode(b: Board): SupplyMode | undefined {
  if (b.upstreamId) return undefined;
  if (b.sourceKva) return 'transformer';
  if (b.supply) return b.supply.fedBy === 'board' ? 'board' : 'source';
  return named(b.rmu) || named(b.substation) ? 'transformer' : 'unset';
}

export interface SupplyPoint {
  mode: 'source' | 'board' | 'unset';
  /** Symbol in mode 'source'; utility when blank. */
  kind: SourceKind;
  /** Bold line. */
  title: string;
  /** Muted lines, top to bottom. */
  lines: string[];
  /** At most two of the lines, for the compact Board tab. */
  brief: string[];
  /** Draw the kWh meter box (mode 'source' only). */
  meter: boolean;
  tooltip: string;
}

/** The supply point of a first board without a transformer; undefined for a transformer and for a board with a board
 * above it. `dewa`: the authority-style wording of the source block. No supplier's name is ever assumed. */
export function supplyPoint(project: Pick<Project, 'voltageV' | 'boards'>, b: Board, dewa: boolean): SupplyPoint | undefined {
  const mode = supplyMode(b);
  if (!mode || mode === 'transformer') return undefined;
  const s = b.supply;
  const name = named(s?.fedFrom);
  // A kind from a newer or hand-edited file draws as a utility rather than failing.
  const kind: SourceKind = SOURCE_KINDS.some((k) => k.value === s?.kind) ? s!.kind! : 'utility';
  const given = supplyFaultKa(b);
  const fault = given ? `Ik″ ${given} kA given` : `Ik″ ${assumedSourceFaultKa(project).toFixed(1)} kA assumed`;
  if (mode === 'unset') {
    return { mode, kind: 'utility', title: 'Supply not set', lines: [fault, 'checks: not verified'], brief: [fault], meter: false, tooltip: 'Supply not set — double-click to edit' };
  }
  const used = [s?.vdUsedPct !== undefined ? `Drop used ${s.vdUsedPct} %` : '', s?.zeOhm ? `Ze ${s.zeOhm} Ω` : ''].filter(Boolean).join(' · ');
  const inc = supplyIncomerFeeder(b);
  const cable = inc ? `${cableSizeText(inc)} · ${inc.lengthM} m` : '';
  const ref = named(s?.ref) ? `Ref. ${named(s?.ref)}` : '';
  const tail = (...xs: string[]) => xs.filter(Boolean);
  if (mode === 'board') {
    const device = s?.ratingA ? `${`${s.ratingA} A ${s.device ?? ''}`.trim()}${name ? ` at ${name}` : ''}${s.meter ? ` · ${s.meter} meter` : ''}` : '';
    const lines = tail('not in this project', fault, used, device, cable, ref);
    return { mode, kind, title: name ? `From ${name}` : 'From a board not named', lines, brief: tail(fault, cable || device), meter: false, tooltip: `Fed from ${name ?? 'a board'} outside this project — double-click to edit` };
  }
  const title = kind === 'utility' ? (name ? `${name} supply` : 'Source') : name ?? 'Source';
  let lines: string[], device: string;
  if (!dewa) {
    device = `${s?.ratingA ? `${s.ratingA} A ${s.device ?? ''}` : 'meter cabinet'}${s?.meter ? ` · ${s.meter} meter` : ''}`;
    lines = tail(device, fault, used, cable, ref);
  } else {
    const ct = s?.ctRatio ?? b.protection?.ctRatio;
    device = s?.ratingA ? `${s.ratingA}A TP ${s.device ?? 'MCCB'}${given ? ` ${given} kA` : ''}` : '';
    // The fault level already stands on the device line when it is given and there is one.
    const faultLine = !given || !device ? fault : '';
    lines = tail(`METER CABINET${ct ? ` · CTM ${ct}` : ''}`, device, faultLine, used, cable || (name ? `CABLE BY ${name} · FED FROM ${name}` : 'CABLE BY THE SUPPLIER'), ref);
  }
  return { mode, kind, title, lines, brief: tail(fault, cable || device), meter: true, tooltip: `${title} — double-click to edit` };
}
