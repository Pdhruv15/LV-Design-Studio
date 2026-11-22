import type { Board, Project, SupplyIncomer } from '../types';
import { supplyMode, supplyPoint } from '../diagram/supplyPoint';
import { fedFromOf } from './designReference';
import { typicalImpedancePct } from '../calc/txGen';
import { withTransformer } from './transformers';

/** What feeds a first board, as the Supply tab offers it. */
export type FedFrom = 'transformer' | 'source' | 'board' | 'unset';
export const FED_FROM: { value: FedFrom; label: string }[] = [
  { value: 'transformer', label: 'Transformer' },
  { value: 'source', label: 'LV source (utility, supplier, own generation)' },
  { value: 'board', label: 'A board outside this project' },
  { value: 'unset', label: 'Not set yet' }
];

type Supply = NonNullable<Board['supply']>;
const named = (s?: string) => (typeof s === 'string' ? s.trim() || undefined : undefined);
const blank = (v: unknown) => v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

/** The choice a first board stands at, from its data. */
export const fedFromOfBoard = (b: Board): FedFrom => supplyMode(b) ?? 'unset';

/** The board changed to be fed from `to`; the same object when it already is. A switch to a transformer keeps the
 * supply block (the transformer documents read its rating and cable); a switch away removes the kVA and impedance. */
export function setFedFrom(project: Project, b: Board, to: FedFrom): Board {
  if (fedFromOfBoard(b) === to) return b;
  // Only the rating and impedance are written: the board's own rated current stays as typed.
  if (to === 'transformer') return b.sourceKva ? b : { ...b, sourceKva: 1000, sourceImpedancePct: typicalImpedancePct(1000) };
  if (to === 'unset') {
    const { sourceKva: _k, sourceImpedancePct: _z, supply: _s, rmu: _r, substation: _u, ...rest } = b;
    return rest;
  }
  // Blank fedBy means a source: 'source' is never written, it would count as a given value.
  const { fedBy: _f, ...supply } = { ...(b.supply ?? (to === 'source' ? fedFromOf(project) : {})) } as Supply;
  // A board outside the project has no meter of its own; the type would still print on the drawing.
  if (to === 'board') delete supply.meter;
  return { ...withTransformer(b, undefined, project.voltageV), supply: to === 'board' ? { ...supply, fedBy: 'board' } : supply };
}

/** Whether the supply block holds a value the user typed (the mode marker does not count). */
export const hasSupplyValues = (b: Board) => Object.entries(b.supply ?? {}).some(([k, v]) => k !== 'fedBy' && v !== undefined);

/** Whether switching to `to` removes values the user typed (the question is asked first). */
export function losesValues(b: Board, to: FedFrom): boolean {
  const from = fedFromOfBoard(b);
  if (from === to) return false;
  if (to === 'unset') return !!b.sourceKva || !!named(b.rmu) || !!named(b.substation) || hasSupplyValues(b);
  if (from === 'transformer') return !!b.sourceKva || b.sourceImpedancePct !== undefined;
  return from === 'source' && to === 'board' && !!b.supply?.meter;
}

/** Write or delete one key of the supply block (blank, empty text and NaN delete it); the block stays, so the
 * board keeps its LV supply even when every value is cleared. */
export function setSupplyValue<K extends keyof Supply>(b: Board, key: K, value: Supply[K] | undefined): Board {
  const supply: Supply = { ...(b.supply ?? {}) };
  if (blank(value)) delete supply[key]; else supply[key] = value as Supply[K];
  return { ...b, supply };
}

/** The same inside the incoming cable. A half-typed cable stores 0 for the missing size or length (the
 * calculations ignore it until both are above 0); a cable with no size, no length and no other value is removed. */
export function setIncomerValue<K extends keyof SupplyIncomer>(b: Board, key: K, value: SupplyIncomer[K] | undefined): Board {
  const inc: SupplyIncomer = { cableCsaMm2: 0, lengthM: 0, ...(b.supply?.incomer ?? {}) };
  if (blank(value) || ((key === 'parallel' || key === 'cpcMm2') && !((value as number) > 0))) delete inc[key]; else inc[key] = value as SupplyIncomer[K];
  inc.cableCsaMm2 = inc.cableCsaMm2 || 0;
  inc.lengthM = inc.lengthM || 0;
  const others = (Object.keys(inc) as (keyof SupplyIncomer)[]).some((k) => k !== 'cableCsaMm2' && k !== 'lengthM' && !blank(inc[k]));
  return setSupplyValue(b, 'incomer', inc.cableCsaMm2 > 0 || inc.lengthM > 0 || others ? inc : undefined);
}

/** "Supplied from" in words: the board above, or what feeds a first board. */
export function suppliedFromText(project: Project, b: Board): string {
  if (b.upstreamId) return b.upstreamId;
  const mode = fedFromOfBoard(b);
  if (mode === 'transformer') return 'Transformer';
  if (mode === 'source') return supplyPoint(project, b, false)!.title;
  if (mode === 'board') { const n = named(b.supply?.fedFrom); return n ? `${n} (not in this project)` : 'A board not in this project'; }
  return 'Not set';
}
