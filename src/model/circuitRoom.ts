import { rule } from '../database/catalog';
import type { Feeder, PointType } from '../types';

/** How full a final circuit is against the Rules sheet, for the circuit list of Add device and the offer of the next
 * circuit when one fills up. Only lighting points and 13 A sockets have a limit per circuit. */

const LIMIT: Partial<Record<PointType, string>> = { ltg: 'maxLtgPerCircuit', s13: 'maxS13PerCircuit' };
/** The most points of a type one circuit may carry (Rules sheet); undefined: the type has no limit. */
export const pointMax = (type: PointType | undefined): number | undefined => {
  const key = type && LIMIT[type];
  return key ? rule(key) : undefined;
};

export interface CircuitRoom {
  /** The point type counted: the one being placed where the circuit suits it, else the circuit's own limited type. */
  type?: PointType;
  n: number;
  max?: number;
  /** At or over the most allowed. */
  full: boolean;
  /** As the list shows it: "7 / 10", "4 pts", "empty". */
  text: string;
}

const count = (f: Feeder, type: PointType): number => f.points?.[type] ?? 0;
const totalOf = (f: Feeder): number => Object.values(f.points ?? {}).reduce((s, n) => s + (n ?? 0), 0);

/** A circuit suits a point type when it already carries points of that type, or none at all. */
export const suits = (f: Feeder, type: PointType): boolean => count(f, type) > 0 || totalOf(f) === 0;

export function circuitRoom(f: Feeder, placing?: PointType): CircuitRoom {
  const total = totalOf(f);
  let type: PointType | undefined;
  if (placing && pointMax(placing) !== undefined && (count(f, placing) > 0 || total === 0)) type = placing;
  else {
    let best = -1;
    for (const t of Object.keys(LIMIT) as PointType[]) {
      const n = count(f, t);
      const fill = n / (pointMax(t) as number);
      if (n > 0 && fill > best) { best = fill; type = t; }
    }
  }
  const max = pointMax(type);
  if (type && max !== undefined) {
    const n = count(f, type);
    return { type, n, max, full: n >= max, text: `${n} / ${max}` };
  }
  return { n: total, full: false, text: total ? `${total} pt${total === 1 ? '' : 's'}` : 'empty' };
}

/** The circuit to go on with when `current` is full for the type being placed: one that suits the type and has room —
 * on the same board first (the ways after it, then those before), then the other boards, in the order given. */
export function nextWithRoom(circuits: Feeder[], current: Feeder | undefined, placing: PointType | undefined): Feeder | undefined {
  const max = pointMax(placing);
  if (!placing || max === undefined || !current || count(current, placing) < max) return undefined;
  const open = circuits.filter((f) => f !== current && f.id !== current.id && suits(f, placing) && count(f, placing) < max);
  const at = circuits.findIndex((f) => f.id === current.id);
  const same = open.filter((f) => f.boardId === current.boardId);
  const after = same.filter((f) => at < 0 || circuits.indexOf(f) > at);
  const before = same.filter((f) => !after.includes(f));
  return [...after, ...before, ...open.filter((f) => f.boardId !== current.boardId)][0];
}
