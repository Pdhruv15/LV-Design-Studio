import { C_MAX, C_MV, localSources, MOTOR_LOCKED_ROTOR_MULTIPLE, cableImpedance, cableSizeText, DEFAULT_GRID_XR, DEFAULT_TRANSFORMER_XR, faultCurrentKA, gridFaultMva, gridImpedance, gridSourceOf, impedanceToBoard, runsOf, supplySourceLevel, transformerImpedance, type Impedance } from './electrical';
import { feederFamily } from './cableFamily';
import { lvSupplied, supplyIncomerFeeder, supplyXr, type Board, type Feeder, type Project } from '../types';

// Per-unit (p.u.) view of the short-circuit calculation. The app works the fault levels in ohms referred to the
// LV side (src/calc/electrical.ts); here the same impedances are expressed on a common base power and the base
// voltage of each level, as a hand calculation lays them out. The currents are the same by construction:
// Ik″ = c · I_base ÷ Z(p.u.) equals c · U ÷ (√3 · Z(Ω)).

const SQRT3 = Math.sqrt(3);
export const DEFAULT_BASE_MVA = 100;
export const baseMvaOf = (project: Pick<Project, 'baseMva'>): number => (project.baseMva && project.baseMva > 0 ? project.baseMva : DEFAULT_BASE_MVA);

export interface PuBase { mva: number; kv: number; /** Base current, kA. */ ika: number; /** Base impedance, Ω. */ zOhm: number }
export const puBase = (mva: number, kv: number): PuBase => ({ mva, kv, ika: mva / (SQRT3 * kv), zOhm: (kv * kv) / mva });
/** The base at the project's LV level. */
export const lvBase = (project: Pick<Project, 'voltageV' | 'baseMva'>): PuBase => puBase(baseMvaOf(project), project.voltageV / 1000);

export interface PuValue { r: number; x: number; z: number }
export const toPu = (z: Impedance, base: PuBase): PuValue => ({ r: z.r / base.zOhm, x: z.x / base.zOhm, z: Math.hypot(z.r, z.x) / base.zOhm });

/** Peak factor κ of IEC 60909-0 eq. (55): 1.02 + 0.98 · e^(−3R/X); a purely resistive path gives 1.02. */
export const peakFactor = (r: number, x: number): number => 1.02 + 0.98 * (x > 0 ? Math.exp((-3 * r) / x) : 0);

/** One element of the impedance diagram. `baseKv`: the voltage level(s) it sits on. */
export interface PuElement { element: string; data: string; baseKv: string; pu: PuValue; how: string }

const n = (v: number, d = 2): string => String(+v.toFixed(d));

/** Every element of the network's impedance diagram in per unit on the project's base: grid sources, transformers,
 * sources of first boards on an LV supply with their incoming cables, and the cables between boards.
 * `boardIds`: only the elements feeding these boards (default all). */
export function puElements(project: Project, boardIds?: Set<string>): PuElement[] {
  const base = lvBase(project), lvKv = n(base.kv, 3);
  const inScope = (id: string) => !boardIds || boardIds.has(id);
  const out: PuElement[] = [];
  const grids = new Set<string>();
  const cableRow = (name: string, f: Feeder): PuElement => ({
    element: name, data: `${cableSizeText(f)}, ${n(f.lengthM)} m`, baseKv: lvKv,
    pu: toPu(cableImpedance(f.cableCsaMm2, f.lengthM, runsOf(f), feederFamily(project, f)), base), how: 'ohms ÷ base Z'
  });
  for (const b of project.boards) {
    if (b.upstreamId || !inScope(b.id)) continue;
    if (b.sourceKva && b.sourceImpedancePct) {
      const g = gridSourceOf(project, b), zq = gridImpedance(g, project.voltageV);
      if (g && zq && !grids.has(g.id)) {
        grids.add(g.id);
        out.push({ element: `Source ${g.name || g.id}`, data: `${n(g.kv)} kV, ${n(gridFaultMva(g)!)} MVA, X/R ${n(g.xr && g.xr > 0 ? g.xr : DEFAULT_GRID_XR)}`, baseKv: n(g.kv), pu: toPu(zq, base), how: `c (${C_MV}) × base MVA ÷ fault MVA` });
      }
      out.push({
        element: `Transformer at ${b.id}`, data: `${n(b.sourceKva)} kVA, ${n(b.sourceImpedancePct)} %, X/R ${n(b.sourceXr ?? DEFAULT_TRANSFORMER_XR)}`, baseKv: `${g ? n(g.kv) : '—'} / ${lvKv}`,
        pu: toPu(transformerImpedance(b.sourceKva, b.sourceImpedancePct, project.voltageV, b.sourceXr), base), how: 'Z % × base MVA ÷ rated MVA'
      });
    } else if (lvSupplied(b)) {
      const level = supplySourceLevel(project, b);
      const data = level.basis === 'given' ? `Ik″ ${n(level.ka)} kA, X/R ${n(supplyXr(b) ?? DEFAULT_TRANSFORMER_XR)}` : level.basis === 'calculated' ? level.text ?? 'source rating' : `no source data: ${n(level.ka)} kA assumed`;
      const how = level.basis === 'calculated' ? (level.z.x === 0 ? `c (${C_MAX}) × base current ÷ fault current` : 'X″d × base MVA ÷ rated MVA') : `c (${C_MAX}) × base current ÷ Ik″`;
      out.push({ element: `Source at ${b.id}`, data, baseKv: lvKv, pu: toPu(level.z, base), how });
      const incomer = supplyIncomerFeeder(b);
      if (incomer) out.push(cableRow(`Incoming cable of ${b.id}`, incomer));
    }
  }
  for (const f of project.feeders) if (f.feedsBoardId && inScope(f.feedsBoardId)) out.push(cableRow(`Cable ${f.boardId} → ${f.feedsBoardId}`, f));
  // Sources on the boards themselves: a generator in parallel with the supply, running motors (with their cables).
  for (const b of project.boards) {
    if (!inScope(b.id)) continue;
    for (const s of localSources(project, b)) {
      out.push({ element: s.label, data: `${n(s.kva)} kVA${s.kind === 'motor' ? `, ${MOTOR_LOCKED_ROTOR_MULTIPLE} × rated, with its cable` : ', X″d 15 %, X/R 10'}`, baseKv: lvKv, pu: toPu(s.z, base), how: s.kind === 'motor' ? 'base MVA ÷ (multiple × rated MVA), plus the cable' : 'X″d × base MVA ÷ rated MVA' });
    }
  }
  return out;
}

/** The fault at a board's busbar in per unit: the path impedance, its X/R, Ik″ = c · I_base ÷ Z and the peak ip = κ · √2 · Ik″. */
export interface PuFault { board: Board; kv: number; pu: PuValue; xr: number; ikKa: number; kappa: number; ipKa: number }
export function puFaultAt(project: Project, board: Board): PuFault {
  const base = lvBase(project), z = impedanceToBoard(project, board.id), pu = toPu(z, base);
  const ikKa = pu.z > 0 ? (C_MAX * base.ika) / pu.z : NaN;
  const kappa = peakFactor(pu.r, pu.x);
  return { board, kv: base.kv, pu, xr: pu.r > 0 ? pu.x / pu.r : Infinity, ikKa, kappa, ipKa: kappa * Math.SQRT2 * ikKa };
}

/** The ohm method's Ik″ at the same busbar, for the identity check. */
export const ohmFaultKa = (project: Project, board: Board): number => faultCurrentKA(impedanceToBoard(project, board.id), project.voltageV);
