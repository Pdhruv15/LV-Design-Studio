import type { Board, Project, SourceKind } from '../types';
import { SOURCE_KINDS, supplyFaultKa, supplyIncomerFeeder } from '../types';
import { cableSizeText, levelKaText, supplySourceLevel } from '../calc/electrical';

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

/** Whether a board shows and prices LV earth pits unless its own setting says otherwise: a first board, except one fed from
 * a board outside this project (its earth is at that board). */
export const earthPitsByDefault = (b: Board): boolean => !b.upstreamId && supplyMode(b) !== 'board';

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
  /** Draw the kWh meter box (mode 'source' only): a utility, or any source with a meter type typed. */
  meter: boolean;
  /** The supply's name as typed (trimmed); undefined when blank. */
  name?: string;
  /** The reference line ("Ref. <ref>"), also the last of `lines` when present: the printed sheet leaves it out, its
   * SUPPLY row already carries the reference. */
  refLine?: string;
  tooltip: string;
}

/** The supply point of a first board without a transformer; undefined for a transformer and for a board with a board
 * above it. `dewa`: the authority-style wording of the source block. No supplier's name is ever assumed. */
export function supplyPoint(project: Pick<Project, 'voltageV'>, b: Board, dewa: boolean): SupplyPoint | undefined {
  const mode = supplyMode(b);
  if (!mode || mode === 'transformer') return undefined;
  const s = b.supply;
  const name = named(s?.fedFrom);
  // A kind from a newer or hand-edited file draws as a utility rather than failing.
  const kind: SourceKind = SOURCE_KINDS.some((k) => k.value === s?.kind) ? s!.kind! : 'utility';
  const given = supplyFaultKa(b);
  const level = supplySourceLevel(project, b);
  const kaText = levelKaText(level.ka);
  const fault = given ? `Ik″ ${given} kA given` : `Ik″ ${kaText} kA ${level.basis}`;
  // What a calculated level rests on ("250 kVA · X″d 15 %"), the line after the fault line.
  const basis = level.basis === 'calculated' && level.text ? level.text : '';
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
    const lines = tail('not in this project', fault, basis, used, device, cable, ref);
    return { mode, kind, title: name ? `From ${name}` : 'From a board not named', name, lines, brief: tail(fault, cable || device), meter: false, refLine: ref || undefined, tooltip: `Fed from ${name ?? 'a board'} outside this project — double-click to edit` };
  }
  const title = kind === 'utility' ? (name ? `${name} supply` : 'Source') : name ?? 'Source';
  // A source that is not a utility has no meter cabinet unless a meter type is typed (a blank kind counts as a utility).
  const meter = kind === 'utility' || !!s?.meter;
  let lines: string[], device: string;
  if (!meter) {
    // No meter cabinet: the device line only when a rating is set, in both styles.
    device = s?.ratingA ? `${s.ratingA} A ${s.device ?? ''}`.trim() : '';
    lines = tail(device, fault, basis, used, cable, ref);
  } else if (!dewa) {
    device = `${s?.ratingA ? `${s.ratingA} A ${s.device ?? ''}` : 'meter cabinet'}${s?.meter ? ` · ${s.meter} meter` : ''}`;
    lines = tail(device, fault, basis, used, cable, ref);
  } else {
    const ct = s?.ctRatio ?? b.protection?.ctRatio;
    device = s?.ratingA ? `${s.ratingA}A TP ${s.device ?? 'MCCB'}${given ? ` ${given} kA` : ''}` : '';
    // The fault level already stands on the device line when it is given and there is one.
    const faultLine = !given || !device ? fault : '';
    // "Cable by" is a supplier's wording: not for an own source (generator, PV, wind, battery) that has a meter.
    const by = kind !== 'utility' ? '' : name ? `CABLE BY ${name} · FED FROM ${name}` : 'CABLE BY THE SUPPLIER';
    lines = tail(`METER CABINET${ct ? ` · CTM ${ct}` : ''}`, device, faultLine, faultLine && basis, used, cable || by, ref);
  }
  return { mode, kind, title, name, lines, brief: tail(fault, cable || device), meter, refLine: ref || undefined, tooltip: `${title} — double-click to edit` };
}
