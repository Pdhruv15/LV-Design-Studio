import { C_MAX, cableImpedance, impedanceToBoard, runsOf } from './electrical';
import { feederFamily } from './cableFamily';
import { earthFaultAtA } from './earthing';
import { boardOf, feedersOn } from './network';
import { lvBase, peakFactor, toPu, type PuValue } from './perUnit';
import type { FaultPoint, Feeder, Project } from '../types';

// Fault points: places the engineer marks on the SLD (a busbar, or a point along a cable) to get the fault there
// as one table: per-unit path impedance, X/R, Ik″, the peak current, the minimum line-to-earth current and the
// breaking capacity of the device that must clear it.

export interface FaultPointResult {
  point: FaultPoint;
  /** Where it is, in words: "MDB-1 busbar", "F3 cable, 20 m from MDB-1". */
  place: string;
  /** Why there is no result (the board or circuit is gone, the distance is past the cable's end). */
  problem?: string;
  kv: number;
  pu: PuValue;
  xr: number;
  /** Maximum 3-phase Ik″, kA (line-to-neutral on a 2-core circuit's cable, as the cable-end fault of the study). */
  ikKa: number;
  kappa: number;
  ipKa: number;
  /** Minimum line-to-earth fault current, kA; undefined when the earth loop to the place is not known. */
  earthKa?: number;
  /** Lowest breaking capacity that sees this fault, kA: the circuit's own breaker for a point on its cable, the
   * weakest breaker on the board for a busbar. Undefined when the board has no breaker. */
  icuKa?: number;
  icuOk?: boolean;
}

/** The next free mark number: F1, F2… (the lowest not in use). */
export function nextFaultPointId(points: readonly FaultPoint[] | undefined): string {
  const used = new Set((points ?? []).map((p) => p.id));
  for (let i = 1; ; i++) if (!used.has(`F${i}`)) return `F${i}`;
}

const NONE = { kv: NaN, pu: { r: NaN, x: NaN, z: NaN }, xr: NaN, ikKa: NaN, kappa: NaN, ipKa: NaN };
const m = (v: number): string => String(+v.toFixed(1));

/** How far along its cable a point on a circuit sits, in metres (the far end when no distance is given). */
export const faultPointDistanceM = (point: FaultPoint, f: Pick<Feeder, 'lengthM'>): number => point.distanceM ?? f.lengthM;

export function faultPointResult(project: Project, point: FaultPoint): FaultPointResult {
  const base = lvBase(project);
  const f = point.feederId ? project.feeders.find((x) => x.id === point.feederId) : undefined;
  const boardId = f ? f.boardId : point.boardId;
  const board = boardId ? boardOf(project, boardId) : undefined;
  if (point.feederId && !f) return { point, place: `circuit ${point.feederId}`, problem: `circuit ${point.feederId} is not in the project`, ...NONE };
  if (!board) return { point, place: boardId ? `${boardId} busbar` : 'not placed', problem: boardId ? `board ${boardId} is not in the project` : 'the mark is on no board or circuit', ...NONE };
  let z = impedanceToBoard(project, board.id), place = `${board.id} busbar`, fraction = 0;
  if (f) {
    const d = faultPointDistanceM(point, f);
    place = d <= 0 ? `${f.id} cable, at ${board.id}` : d >= f.lengthM ? `${f.id} cable, far end (${m(f.lengthM)} m)` : `${f.id} cable, ${m(d)} m from ${board.id}`;
    if (d < 0 || d > f.lengthM) return { point, place: `${f.id} cable`, problem: `${m(d)} m is not on the ${m(f.lengthM)} m cable of ${f.id}`, ...NONE };
    fraction = f.lengthM > 0 ? d / f.lengthM : 0;
    const zc = cableImpedance(f.cableCsaMm2, f.lengthM, runsOf(f), feederFamily(project, f));
    const loop = (f.cores >= 3 ? 1 : 2) * fraction; // a 2-core circuit: the fault returns in the neutral
    z = { r: z.r + zc.r * loop, x: z.x + zc.x * loop };
  }
  const pu = toPu(z, base);
  const ikKa = pu.z > 0 ? (C_MAX * base.ika) / pu.z : NaN;
  const kappa = peakFactor(pu.r, pu.x);
  const earthA = earthFaultAtA(project, board.id, f, fraction);
  // The device that clears it: the circuit's breaker (it sees the fault at its own terminals at most), or the weakest on the board.
  const icus = (f ? [f] : feedersOn(project, board.id)).map((x) => x.breakerIcuKa).filter((v) => v > 0);
  const icuKa = icus.length ? Math.min(...icus) : undefined;
  const atBreakerKa = (C_MAX * base.ika) / toPu(impedanceToBoard(project, board.id), base).z;
  return {
    point, place, kv: base.kv, pu, xr: pu.r > 0 ? pu.x / pu.r : Infinity, ikKa, kappa, ipKa: kappa * Math.SQRT2 * ikKa,
    ...(earthA !== undefined ? { earthKa: earthA / 1000 } : {}),
    ...(icuKa !== undefined ? { icuKa, icuOk: icuKa >= atBreakerKa } : {})
  };
}

/** Every fault point of the project, in mark order (F1, F2, F10 after F9). */
export function faultPointResults(project: Project): FaultPointResult[] {
  const num = (id: string) => Number(id.replace(/\D/g, '')) || 0;
  return [...(project.faultPoints ?? [])].sort((a, b) => num(a.id) - num(b.id) || a.id.localeCompare(b.id)).map((p) => faultPointResult(project, p));
}

/** Adds a fault point on a board's busbar or on a circuit's cable; the mark takes the next free number. */
export function addFaultPoint(project: Project, at: { boardId: string } | { feederId: string; distanceM?: number }): Project {
  const kept = pruneFaultPoints(project).faultPoints ?? []; // marks left behind by a deleted board or circuit go first
  const point: FaultPoint = { id: nextFaultPointId(kept), ...at };
  return { ...project, faultPoints: [...kept, point] };
}
export const removeFaultPoint = (project: Project, id: string): Project => {
  const left = (project.faultPoints ?? []).filter((p) => p.id !== id);
  return { ...project, faultPoints: left.length ? left : undefined };
};
export const updateFaultPoint = (project: Project, id: string, patch: Partial<Omit<FaultPoint, 'id'>>): Project =>
  ({ ...project, faultPoints: (project.faultPoints ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) });
/** Marks whose board or circuit is gone are dropped (after a delete). */
export function pruneFaultPoints(project: Project): Project {
  const boards = new Set(project.boards.map((b) => b.id)), feeders = new Set(project.feeders.map((f) => f.id));
  const kept = (project.faultPoints ?? []).filter((p) => (p.feederId ? feeders.has(p.feederId) : !!p.boardId && boards.has(p.boardId)));
  return kept.length === (project.faultPoints ?? []).length ? project : { ...project, faultPoints: kept.length ? kept : undefined };
}
