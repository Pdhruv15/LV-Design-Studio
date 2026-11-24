import { boardOf, feedersOn, memoized } from './network';
import { recordedPQ } from '../model/existing';
import { switchedOnBoard } from './capSwitching';
import { hasRules, resolveRule, type RuleContext } from '../model/designRules';
import { DEFAULT_POINT_WATTS, LIGHTING_POINTS, POINT_TYPES, pointTemplateOf, settingsOf, type Board, type BoardElcb, type CircuitLoadItem, type Feeder, type LoadType, type Phase, type PointType, type Project } from '../types';

export const SINGLE_PHASES: ('R' | 'Y' | 'B')[] = ['R', 'Y', 'B'];
const PHASE_ORDER: Record<Phase, number> = { R: 0, Y: 1, B: 2, RYB: 3 };

export const STANDARD_ELCB_A = [25, 40, 63, 80, 100, 125];

export type PhaseKw = Record<'R' | 'Y' | 'B', number>;

export const isScheduleCircuit = (f: Feeder) => !!f.phase && !!f.way;

/** Circuit reference as on the DEWA schedule: phase + way (R1, Y1, B1…);
 * a 3-phase circuit is RYB + way. */
export function circuitRef(f: Feeder): string | undefined {
  if (!f.phase || !f.way) return undefined;
  return `${f.phase}${f.way}`;
}

export function pointWattsFor(board: Board | undefined): Record<PointType, number> {
  return { ...DEFAULT_POINT_WATTS, ...board?.pointWatts };
}

/** Column heading: the DB's own name for a spare column, else the form
 * template's heading, else the standard label. */
export function pointLabel(board: Board | undefined, t: PointType, project?: Pick<Project, 'pointTemplate'>): string {
  if (t === 'spare1' && board?.spareNames?.spare1) return board.spareNames.spare1;
  if (t === 'spare2' && board?.spareNames?.spare2) return board.spareNames.spare2;
  return (project && pointTemplateOf(project).labels?.[t]) ?? POINT_TYPES.find((p) => p.value === t)!.label;
}

export interface PointColumn {
  value: PointType;
  label: string;
  title: string;
}

/** Point columns of a DB's schedule: the project's form template, then any
 * other point type already used on the DB (so no entered point is hidden). */
export function pointColumns(project: Project, board: Board): PointColumn[] {
  const template = pointTemplateOf(project).columns;
  const used = new Set<PointType>();
  for (const f of scheduleCircuits(project, board.id)) {
    for (const [t, n] of Object.entries(f.points ?? {})) if ((n ?? 0) > 0) used.add(t as PointType);
  }
  const extra = POINT_TYPES.map((p) => p.value).filter((t) => used.has(t) && !template.includes(t));
  return [...template, ...extra].map((t) => ({ value: t, label: pointLabel(board, t, project), title: POINT_TYPES.find((p) => p.value === t)!.title }));
}

const isPointType = (t: unknown): t is PointType => POINT_TYPES.some((p) => p.value === t);

/** Clean circuit items: trimmed text, whole positive quantities, watts ≥ 0, known point types. */
export function normalizeLoadItems(items: CircuitLoadItem[] | undefined): CircuitLoadItem[] {
  const out: CircuitLoadItem[] = [];
  for (const it of items ?? []) {
    const quantity = Math.round(Number(it?.quantity));
    const unitWatts = Number(it?.unitWatts);
    if (!isPointType(it?.pointType) || !(quantity > 0) || !Number.isFinite(unitWatts) || unitWatts < 0) continue;
    const reference = typeof it.reference === 'string' ? it.reference.trim() : '';
    const name = typeof it.name === 'string' ? it.name.trim() : '';
    out.push({ ...(reference && { reference }), name: name || reference, pointType: it.pointType, quantity, unitWatts });
  }
  return out;
}

/** Point types whose count and watts come from the circuit's items. */
export function itemizedTypes(f: Pick<Feeder, 'loadItems'>): Set<PointType> {
  return new Set(normalizeLoadItems(f.loadItems).map((it) => it.pointType));
}

/** The point counts with every itemized type set to the sum of its items' quantities. */
export function pointsWithItems(points: Feeder['points'], items: CircuitLoadItem[] | undefined): Feeder['points'] {
  const list = normalizeLoadItems(items);
  if (!list.length) return points;
  const out: Partial<Record<PointType, number>> = { ...points };
  for (const t of new Set(list.map((it) => it.pointType))) out[t] = list.filter((it) => it.pointType === t).reduce((s, it) => s + it.quantity, 0);
  return out;
}

/** Watts of each point type on a circuit: exact from its items where it has them, else count × WATT / UNIT. */
export function circuitWattsByType(f: Feeder, board: Board | undefined): Partial<Record<PointType, number>> {
  const w = pointWattsFor(board);
  const items = normalizeLoadItems(f.loadItems);
  const itemized = new Set(items.map((it) => it.pointType));
  const out: Partial<Record<PointType, number>> = {};
  for (const [t, n] of Object.entries(f.points ?? {})) if (!itemized.has(t as PointType)) out[t as PointType] = (n ?? 0) * (w[t as PointType] ?? 0);
  for (const it of items) out[it.pointType] = (out[it.pointType] ?? 0) + it.quantity * it.unitWatts;
  return out;
}

/** Connected load of a circuit in watts: Σ items × their own watts, plus
 * Σ other points × the DB's watts per point. */
export function circuitWatts(f: Feeder, board: Board | undefined): number {
  return Object.values(circuitWattsByType(f, board)).reduce((sum: number, v) => sum + (v ?? 0), 0);
}

/** WATT / UNIT printed for a column: the DB's value, plus each other wattage
 * mixed items use on its circuits (e.g. "10 / 20"); the DB's value is left out
 * when every circuit with that type is itemized. */
export function wattUnitText(project: Project, board: Board, t: PointType): string {
  const own: number[] = [];
  let plain = false;
  for (const f of scheduleCircuits(project, board.id)) {
    const items = normalizeLoadItems(f.loadItems).filter((it) => it.pointType === t);
    if (items.length) own.push(...items.map((it) => it.unitWatts));
    else if ((f.points?.[t] ?? 0) > 0) plain = true;
  }
  const values = [...new Set([...(plain || !own.length ? [pointWattsFor(board)[t] || 0] : []), ...own])];
  return values.length === 1 && !values[0] ? '' : values.join(' / ');
}

/** The circuit's items as text, e.g. "6×L1 10 W + 4×L2 20 W" (empty when it has none). */
export function loadItemsText(f: Pick<Feeder, 'loadItems'>, pointType?: PointType): string {
  return normalizeLoadItems(f.loadItems)
    .filter((it) => !pointType || it.pointType === pointType)
    .map((it) => `${it.quantity}×${it.reference || it.name} ${it.unitWatts} W`)
    .join(' + ');
}

export type CircuitCategory = 'lighting' | 'power';

/** A lighting circuit has only lighting points (LTG, C.FAN, EX.FAN);
 * anything else — or a circuit with no points yet — counts as power, the
 * stricter case (larger minimum wire, 30 mA ELCB). */
export function circuitCategory(f: Feeder): CircuitCategory {
  const used = Object.entries(f.points ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([t]) => t as PointType);
  return used.length > 0 && used.every((t) => LIGHTING_POINTS.includes(t)) ? 'lighting' : 'power';
}

const ruleContext = (f: Feeder): RuleContext => ({ category: circuitCategory(f), loadType: f.loadType, kw: f.loadKw });

/** Minimum circuit wire: the project's matching design rule, else the
 * project setting for the circuit's type (lighting / power). */
export function minWireMm2(project: Project, f: Feeder): number {
  const rule = resolveRule(project.designRules, 'minWireMm2', ruleContext(f));
  if (rule) return rule.value;
  const s = settingsOf(project);
  return circuitCategory(f) === 'lighting' ? s.minWireLightingMm2 : s.minWirePowerMm2;
}

/** Point types used on a board's circuits whose WATT/UNIT is still 0. */
export function missingWatts(project: Project, board: Board): PointType[] {
  const w = pointWattsFor(board);
  const used = new Set<PointType>();
  for (const f of scheduleCircuits(project, board.id)) {
    const itemized = itemizedTypes(f); // these carry their own watts
    for (const [t, n] of Object.entries(f.points ?? {})) if ((n ?? 0) > 0 && !itemized.has(t as PointType)) used.add(t as PointType);
  }
  return POINT_TYPES.map((p) => p.value).filter((t) => used.has(t) && !w[t]);
}

/** Icon for the diagram: the point type contributing the most watts. */
export function dominantLoadType(f: Feeder, board: Board | undefined): LoadType {
  let best: PointType | undefined;
  let bestW = 0;
  for (const [t, watts = 0] of Object.entries(circuitWattsByType(f, board))) {
    if (watts > bestW) {
      bestW = watts;
      best = t as PointType;
    }
  }
  switch (best) {
    case 'ltg': return 'lighting';
    case 's13': case 's13t': case 's15': case 'shaver': case 'spur': return 'sockets';
    case 'wac': case 'sac': case 'cfan': case 'exfan': case 'fcu': return 'hvac';
    case 'pump': return 'motor';
    default: return 'general';
  }
}

/** Demand real and reactive power (kW, kvar) on each phase of a board, including everything
 * downstream (ENG-005). Each load's demand factor is applied once and its kvar comes from its own
 * PF; capacitor banks give negative kvar; incomers add the board they feed (their own loadKw / PF
 * are placeholders, not loads). Phase allocation as boardPhaseKw: labelled single-phase circuits
 * on their phase, three-phase and older unlabelled single-phase feeders spread evenly. Generation
 * and standby units are treated exactly as boardPhaseKw treats them (counted like loads). */
export type PhasePQ = Record<'R' | 'Y' | 'B', { p: number; q: number }>;
export function boardPhasePQ(project: Project, boardId: string, seen = new Set<string>(), covered = false): PhasePQ {
  if (seen.has(boardId)) return { R: { p: 0, q: 0 }, Y: { p: 0, q: 0 }, B: { p: 0, q: 0 } };
  seen.add(boardId);
  return memoized(project, `phasePQ:${boardId}${covered ? ':covered' : ''}`, () => boardPhasePQOf(project, boardId, seen, covered));
}

/** `covered`: a recorded maximum demand above (or on) this board already includes its existing load. */
function boardPhasePQOf(project: Project, boardId: string, seen: Set<string>, covered: boolean): PhasePQ {
  const board = boardOf(project, boardId);
  const rec = !covered && board ? recordedPQ(project, board) : undefined;
  const cov = covered || !!rec?.covers;
  const out: PhasePQ = { R: { p: (rec?.p ?? 0) / 3, q: (rec?.q ?? 0) / 3 }, Y: { p: (rec?.p ?? 0) / 3, q: (rec?.q ?? 0) / 3 }, B: { p: (rec?.p ?? 0) / 3, q: (rec?.q ?? 0) / 3 } };
  const put = (f: Feeder, p: number, q: number) => {
    if (f.cores === 2 && f.phase && f.phase !== 'RYB') { out[f.phase].p += p; out[f.phase].q += q; return; }
    for (const ph of ['R', 'Y', 'B'] as const) { out[ph].p += p / 3; out[ph].q += q / 3; }
  };
  const caps: Feeder[] = [];
  for (const f of feedersOn(project, boardId)) {
    if (f.feedsBoardId) {
      const sub = boardPhasePQ(project, f.feedsBoardId, seen, cov);
      for (const ph of ['R', 'Y', 'B'] as const) { out[ph].p += sub[ph].p; out[ph].q += sub[ph].q; }
      continue;
    }
    if (cov && f.existing) continue;
    if (f.kvar) { caps.push(f); continue; }
    const kw = f.loadKw * f.demandFactor;
    const pf = Math.min(Math.max(f.powerFactor, 0.01), 1);
    put(f, kw, kw * Math.tan(Math.acos(pf)));
  }
  // Capacitor banks: the switched steps for this board's load (as boardTotals), kvar negative.
  if (caps.length) {
    const p = out.R.p + out.Y.p + out.B.p, q = out.R.q + out.Y.q + out.B.q;
    const sw = switchedOnBoard(caps, p, q, settingsOf(project).pfTarget);
    for (const c of caps) put(c, c.loadKw * c.demandFactor, -(sw.get(c.id) ?? 0));
  }
  return out;
}

/** Demand kW on each phase of a board, including everything downstream.
 * Single-phase circuits load their own phase; 3-phase circuits, and older
 * single-phase feeders with no phase set, are spread evenly. */
export function boardPhaseKw(project: Project, boardId: string, seen = new Set<string>(), covered = false): PhaseKw {
  const out: PhaseKw = { R: 0, Y: 0, B: 0 };
  if (seen.has(boardId)) return out;
  seen.add(boardId);
  // A recorded maximum demand (existing installation): balanced, and it covers the existing load below.
  const board = project.boards.find((b) => b.id === boardId);
  const rec = !covered && board ? recordedPQ(project, board) : undefined;
  const cov = covered || !!rec?.covers;
  if (rec) { out.R += rec.p / 3; out.Y += rec.p / 3; out.B += rec.p / 3; }
  for (const f of project.feeders.filter((x) => x.boardId === boardId)) {
    if (cov && f.existing && !f.feedsBoardId) continue;
    if (f.feedsBoardId) {
      const sub = boardPhaseKw(project, f.feedsBoardId, seen, cov);
      out.R += sub.R;
      out.Y += sub.Y;
      out.B += sub.B;
      continue;
    }
    const kw = f.loadKw * f.demandFactor;
    if (f.cores === 2 && f.phase && f.phase !== 'RYB') out[f.phase] += kw;
    else {
      out.R += kw / 3;
      out.Y += kw / 3;
      out.B += kw / 3;
    }
  }
  return out;
}

/** Phase imbalance: (max − min) ÷ average, in %. */
export function imbalancePct(p: PhaseKw): number {
  const avg = (p.R + p.Y + p.B) / 3;
  return avg > 0 ? ((Math.max(p.R, p.Y, p.B) - Math.min(p.R, p.Y, p.B)) / avg) * 100 : 0;
}

/** Schedule circuits of a board in schedule order: by way, then R, Y, B. */
export function scheduleCircuits(project: Project, boardId: string): Feeder[] {
  return project.feeders
    .filter((f) => f.boardId === boardId && isScheduleCircuit(f))
    .sort((a, b) => a.way! - b.way! || PHASE_ORDER[a.phase!] - PHASE_ORDER[b.phase!]);
}

/** First free slot on a board: fills R1, Y1, B1, R2… A 3-phase circuit
 * needs a way with all three phases free. */
export function nextFreeSlot(project: Project, boardId: string, phase?: Phase): { phase: Phase; way: number } {
  const used = new Set<string>();
  // Spares and spaces of the board keep their slots too.
  const spares = project.boards.find((b) => b.id === boardId)?.spareWays ?? [];
  for (const f of [...scheduleCircuits(project, boardId), ...spares.filter((s) => s.way)]) {
    for (const p of f.phase === 'RYB' ? SINGLE_PHASES : [f.phase as 'R' | 'Y' | 'B']) used.add(`${p}${f.way}`);
  }
  for (let way = 1; way < 1000; way++) {
    if (phase === 'RYB') {
      if (SINGLE_PHASES.every((p) => !used.has(`${p}${way}`))) return { phase, way };
      continue;
    }
    for (const p of phase ? [phase] : SINGLE_PHASES) if (!used.has(`${p}${way}`)) return { phase: p, way };
  }
  throw new Error('No free way');
}

/** A circuit whose breaker is an RCBO (MCB + earth leakage in one): single-phase circuits only. */
export const isRcbo = (f: Feeder) => !!f.rcbo && f.phase !== 'RYB';

/** What the circuits of a way are, for keeping lighting and power on ELCBs of their own; undefined for a way with none. */
export type WayKind = CircuitCategory | 'mixed';

/** The ELCB sections of a DB over ways 1…lastWay, numbered 1, 2, … in way order: an ELCB of the board's own is one section
 * over its ways; the ways between them are cut into automatic sections of "New ELCBs" ÷ 3 ways (none when the board has
 * no ELCBs). With `kindOf`, an automatic section also ends where the next way's circuits are of another kind. */
export function elcbSections(board: Board, lastWay: number, kindOf?: (way: number) => WayKind | undefined): { index: number; ways: number[]; elcb?: BoardElcb }[] {
  const hand = [...(board.elcbs ?? [])].sort((a, b) => a.fromWay - b.fromWay);
  const per = (board.elcbGroupSize ?? 6) / 3;
  const last = Math.max(lastWay, ...hand.map((h) => h.toWay));
  const out: { index: number; ways: number[]; elcb?: BoardElcb }[] = [];
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  let way = 1;
  while (way <= last) {
    const h = hand.find((x) => x.fromWay <= way && way <= x.toWay);
    if (h) {
      out.push({ index: out.length + 1, ways: span(way, h.toWay), elcb: h });
      way = h.toWay + 1;
    } else if (!per) way++;
    else {
      const next = hand.find((x) => x.fromWay > way);
      let end = next ? Math.min(way + per - 1, next.fromWay - 1) : way + per - 1;
      if (kindOf) {
        let kind = kindOf(way);
        for (let w = way + 1; w <= end; w++) {
          const k = kindOf(w);
          if (kind && k && k !== kind) { end = w - 1; break; }
          kind ??= k;
        }
      }
      out.push({ index: out.length + 1, ways: span(way, end) });
      way = end + 1;
    }
  }
  return out;
}

/** The ELCB sections the schedule shows: elcbSections, and on a DB that keeps lighting and power apart (elcbKeepApart) the
 * automatic sections also end where they meet. RCBO circuits count for no way. */
export function elcbSectionsOf(project: Project, board: Board, lastWay: number) {
  if (!board.elcbKeepApart) return elcbSections(board, lastWay);
  const kinds = new Map<number, Set<CircuitCategory>>();
  for (const f of scheduleCircuits(project, board.id)) {
    if (isRcbo(f)) continue;
    const set = kinds.get(f.way!) ?? new Set<CircuitCategory>();
    kinds.set(f.way!, set.add(circuitCategory(f)));
  }
  return elcbSections(board, lastWay, (w) => {
    const set = kinds.get(w);
    return !set ? undefined : set.size > 1 ? 'mixed' : [...set][0];
  });
}

export interface ElcbGroup {
  index: number; // 1-based
  ways: number[];
  circuits: Feeder[];
  category: CircuitCategory | 'mixed';
  phaseKw: PhaseKw;
  maxPhaseA: number;
  ratingA: number;
  sensitivityMa: number;
  poles: 3 | 4;
  byHand?: BoardElcb;
  label: string; // e.g. "40 A 30 mA 4P"
}

/** IΔn for earth leakage protection over the given circuits: the board's override, else with ELCB rules the most sensitive
 * value any circuit needs, else the project setting (100 mA for lighting, 30 mA otherwise). No circuits: the power setting. */
function sensitivityFor(project: Project, board: Board, cs: Feeder[], category: CircuitCategory | 'mixed'): number {
  const s = settingsOf(project);
  const bySetting = (c: CircuitCategory) => (c === 'lighting' ? s.elcbLightingMa : s.elcbPowerMa);
  if (board.elcbSensitivityMa !== undefined) return board.elcbSensitivityMa;
  if (cs.length && hasRules(project.designRules, 'elcbMa')) return Math.min(...cs.map((f) => resolveRule(project.designRules, 'elcbMa', ruleContext(f))?.value ?? bySetting(circuitCategory(f))));
  return bySetting(category === 'lighting' ? 'lighting' : 'power');
}

/** ELCB (RCCB) groups: by default one 4-pole ELCB per 6 circuits (two
 * ways); 3 gives one per way; 0 means no ELCBs. Rated for the group's most
 * loaded phase, and 100 mA for an all-lighting group / 30 mA otherwise
 * (project settings), unless the board overrides either. ELCBs placed by hand
 * (Board.elcbs) are groups of their own, with their own pole count, rating and
 * mA when set; RCBO circuits are not in any group. */
export function elcbGroups(project: Project, board: Board): ElcbGroup[] {
  const all = scheduleCircuits(project, board.id);
  const circuits = all.filter((f) => !isRcbo(f));
  const lastWay = Math.max(0, ...all.map((f) => f.way!), ...(board.spareWays ?? []).map((sp) => sp.way ?? 0));
  const u0 = project.voltageV / Math.sqrt(3);
  const groups: ElcbGroup[] = [];
  for (const sec of elcbSectionsOf(project, board, lastWay)) {
    const cs = circuits.filter((f) => sec.ways.includes(f.way!));
    if (!cs.length && !sec.elcb) continue;
    const phaseKw: PhaseKw = { R: 0, Y: 0, B: 0 };
    const phaseKvar: PhaseKw = { R: 0, Y: 0, B: 0 };
    for (const f of cs) {
      const kw = f.loadKw * f.demandFactor;
      const pf = Math.min(Math.max(f.powerFactor, 0.01), 1);
      const kvar = kw * Math.tan(Math.acos(pf));
      if (f.phase === 'RYB') SINGLE_PHASES.forEach((p) => { phaseKw[p] += kw / 3; phaseKvar[p] += kvar / 3; });
      else {
        const phase = f.phase as 'R' | 'Y' | 'B';
        phaseKw[phase] += kw;
        phaseKvar[phase] += kvar;
      }
    }
    const maxPhaseA = Math.max(...SINGLE_PHASES.map((p) => Math.hypot(phaseKw[p], phaseKvar[p]) * 1000 / u0));
    const ratingA = sec.elcb?.ratingA ?? board.elcbRatingA ?? STANDARD_ELCB_A.find((r) => r >= maxPhaseA) ?? STANDARD_ELCB_A[STANDARD_ELCB_A.length - 1];
    const cats = new Set(cs.map(circuitCategory));
    const category: ElcbGroup['category'] = !cs.length ? 'power' : cats.size === 1 ? [...cats][0] : 'mixed';
    // With ELCB rules, the most sensitive value any circuit in the group needs.
    const sensitivityMa = sec.elcb?.sensitivityMa ?? sensitivityFor(project, board, cs, category);
    const poles = sec.elcb?.poles ?? 4;
    groups.push({ index: sec.index, ways: sec.ways, circuits: cs, category, phaseKw, maxPhaseA, ratingA, sensitivityMa, poles, byHand: sec.elcb, label: `${ratingA} A ${sensitivityMa} mA ${poles}P` });
  }
  return groups;
}

/** The circuit that alone makes its ELCB mix lighting and power — the one power circuit among lighting ones, or the one
 * lighting circuit among power ones (power first when there is one of each) — keyed by circuit id. An RCBO in its place
 * leaves the ELCB with one kind. 3-phase circuits are never offered (an RCBO here is 1-phase). */
export function oddElcbCircuits(groups: ElcbGroup[]): Map<string, ElcbGroup> {
  const out = new Map<string, ElcbGroup>();
  for (const g of groups) {
    if (g.category !== 'mixed') continue;
    const power = g.circuits.filter((f) => circuitCategory(f) === 'power');
    const lighting = g.circuits.filter((f) => circuitCategory(f) === 'lighting');
    const odd = power.length === 1 ? power[0] : lighting.length === 1 ? lighting[0] : undefined;
    if (odd && odd.phase !== 'RYB') out.set(odd.id, g);
  }
  return out;
}

export interface Rcbo { index: number; circuit: Feeder; ratingA: number; sensitivityMa: number; label: string }

/** The board's RCBO circuits in way order (then R, Y, B), numbered RCBO-1, 2, …: rated as the circuit's breaker, IΔn
 * as chosen (rcdMa) else as an ELCB over that circuit would be. Printed as 2P (1P+N). */
export function rcbosOf(project: Project, board: Board): Rcbo[] {
  return scheduleCircuits(project, board.id).filter(isRcbo).map((f, i) => {
    const ratingA = f.breakerRatingA;
    const sensitivityMa = f.rcdMa ?? sensitivityFor(project, board, [f], circuitCategory(f));
    return { index: i + 1, circuit: f, ratingA, sensitivityMa, label: `${ratingA} A ${sensitivityMa} mA 2P` };
  });
}
