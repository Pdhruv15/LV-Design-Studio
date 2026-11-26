import { circuitCategory, circuitRef, circuitWatts, dominantLoadType, elcbSections, elcbSectionsOf, minWireMm2, nextFreeSlot, normalizeLoadItems, pointsWithItems, scheduleCircuits, SINGLE_PHASES } from '../calc/loadSchedule';
import { applyRecommendation, recommend } from '../calc/sizing';
import type { Board, Feeder, Phase, Project } from '../types';
import { reslotSpares } from './spareWays';

/** Feeder id for a schedule circuit: board + circuit reference, e.g. DB-GF1-R3. */
const circuitId = (boardId: string, phase: Phase, way: number) => `${boardId}-${phase}${way}`;

const replaceFeeder = (p: Project, id: string, f: Feeder): Project => ({ ...p, feeders: p.feeders.map((x) => (x.id === id ? f : x)) });

/** Re-derive a circuit's load from its points and, unless the user fixed
 * the sizes by hand, size its MCB, breaking capacity and wire — never below
 * the minimum wire for its type (lighting / power, project settings). A
 * larger wire always still passes ampacity and voltage drop. */
function refresh(project: Project, f: Feeder): Feeder {
  const board = project.boards.find((b) => b.id === f.boardId);
  const next: Feeder = { ...f, loadKw: circuitWatts(f, board) / 1000, loadType: dominantLoadType(f, board) };
  if (next.manualSize) return next;
  const tmp = replaceFeeder(project, f.id, next);
  const sized = applyRecommendation(next, recommend(tmp, next, 'optimise'));
  const min = minWireMm2(project, sized);
  return sized.cableCsaMm2 < min ? { ...sized, cableCsaMm2: min, cpcMm2: undefined } : sized;
}

/** Adds a circuit in the next free slot, or in the given slot (phase and
 * way) when the user types into an empty row of the schedule. */
export function addCircuit(project: Project, boardId: string, phase?: Phase, way?: number): { project: Project; id: string } {
  const slot = phase && way ? { phase, way } : nextFreeSlot(project, boardId, phase);
  const id = circuitId(boardId, slot.phase, slot.way);
  const f: Feeder = {
    id, boardId, name: '', room: '', points: {},
    phase: slot.phase, way: slot.way,
    loadKw: 0, demandFactor: 1, powerFactor: 0.9, lengthM: 20,
    cableCsaMm2: 2.5, cores: slot.phase === 'RYB' ? 4 : 2,
    breakerRatingA: 16, breakerIcuKa: 10, breakerType: 'C'
  };
  // A DB re-grouped as "RCBO on every circuit" gives new circuits an RCBO too.
  if (project.boards.find((b) => b.id === boardId)?.rcboEveryCircuit) f.rcbo = true;
  const withF = { ...project, feeders: [...project.feeders, f] };
  return { project: replaceFeeder(withF, id, refresh(withF, f)), id };
}

/** A copy of a circuit in the next free slot of its board (the next free RYB way for a 3-phase one), with its own id and
 * everything typed the same, sized again like any edit (a hand-sized circuit keeps its sizes). What belongs to the
 * original alone is left out: its permanent ID, its route on the plans and the ELV load it feeds. */
export function duplicateCircuit(project: Project, id: string): { project: Project; id: string } {
  const src = project.feeders.find((x) => x.id === id);
  if (!src || !src.phase) throw new Error('That circuit is no longer on the schedule');
  const slot = nextFreeSlot(project, src.boardId, src.phase === 'RYB' ? 'RYB' : undefined);
  const copyId = circuitId(src.boardId, slot.phase, slot.way);
  const f: Feeder = { ...src, uid: undefined, trayRoute: undefined, cadVerticalM: undefined, lengthToCheck: undefined, elvLoad: undefined,
    id: copyId, phase: slot.phase, way: slot.way, points: { ...src.points }, loadItems: src.loadItems?.map((i) => ({ ...i })) };
  const withF = { ...project, feeders: [...project.feeders, f] };
  return { project: replaceFeeder(withF, copyId, refresh(withF, f)), id: copyId };
}

/** Applies a quick fix (a change of breaker or cable sizes) to a schedule circuit; the sizes it sets count as chosen by hand. */
export function fixCircuit(project: Project, id: string, patch: Partial<Feeder>): Project {
  const f = project.feeders.find((x) => x.id === id);
  return f ? replaceFeeder(project, id, refresh(project, { ...f, ...patch, manualSize: true })) : project;
}

export type CircuitPatch = Partial<Pick<Feeder, 'room' | 'points' | 'loadItems' | 'remarks' | 'lengthM' | 'powerFactor' | 'demandFactor' | 'breakerRatingA' | 'breakerType' | 'cableCsaMm2' | 'cpcMm2' | 'breakerIcuKa' | 'manualSize'>>;

/** Applies an edit from the schedule. Changing MCB, wire or ECC by hand
 * marks the circuit as manually sized, so later load edits keep them. */
export function updateCircuit(project: Project, id: string, patch: CircuitPatch): Project {
  const f = project.feeders.find((x) => x.id === id);
  if (!f) return project;
  const manual = ['breakerRatingA', 'cableCsaMm2', 'cpcMm2', 'breakerType'].some((k) => k in patch);
  const next: Feeder = {
    ...f,
    ...patch,
    ...withLoadItems(f, patch),
    name: patch.room !== undefined ? patch.room : f.name,
    manualSize: patch.manualSize ?? (manual ? true : f.manualSize)
  };
  return replaceFeeder(project, id, refresh(project, next));
}

/** Points and items after an edit, kept consistent: an itemized type's count is
 * always the sum of its items. A count typed for an itemized type (grid, paste)
 * replaces that type's items — the type then uses the DB's WATT / UNIT again. */
function withLoadItems(f: Feeder, patch: CircuitPatch): Pick<Feeder, 'points' | 'loadItems'> {
  let items = normalizeLoadItems('loadItems' in patch ? patch.loadItems : f.loadItems);
  const points = patch.points ?? f.points;
  if (patch.points && !('loadItems' in patch)) {
    const sum = pointsWithItems({}, items) ?? {};
    items = items.filter((it) => (patch.points![it.pointType] ?? 0) === sum[it.pointType]);
  }
  return { points: pointsWithItems(points, items), loadItems: items.length ? items : undefined };
}

export function deleteCircuit(project: Project, id: string): Project {
  return { ...project, feeders: project.feeders.filter((f) => f.id !== id) };
}

/** Re-sizes every auto-sized circuit on a board (e.g. after WATT/UNIT
 * values change, which alters every circuit's load). */
export function refreshBoard(project: Project, boardId: string): Project {
  let p = project;
  for (const f of scheduleCircuits(project, boardId)) p = replaceFeeder(p, f.id, refresh(p, p.feeders.find((x) => x.id === f.id)!));
  return p;
}

/** Spreads the circuits over R/Y/B and renumbers the ways:
 *  - lighting circuits take the first ways, power circuits follow, and each
 *    section starts on an ELCB boundary (3 or 6 circuits), so no ELCB mixes
 *    lighting (100 mA) and power (30 mA) — spare slots are left if needed;
 *  - within a section, largest circuit first onto the lightest phase (phase
 *    totals carry over between sections, so the whole DB balances);
 *  - circuits under an ELCB placed by hand stay where they are (their load counts first) and the others fill the ways
 *    that are left, each section starting on the next automatic ELCB section;
 *  - 3-phase circuits are power and take whole ways at the start of the
 *    power section.
 * Circuit ids are renamed to match their new references. Spares and spaces
 * then take the free slots after the circuits. */
export function balancePhases(project: Project, boardId: string): Project {
  const board = project.boards.find((b) => b.id === boardId);
  const hand = (board?.elcbs ?? []).filter((h) => !h.incomer); // the ELCB at the incomer covers whatever way a circuit takes
  const covered = (w: number) => hand.some((h) => h.fromWay <= w && w <= h.toWay);
  const all = scheduleCircuits(project, boardId);
  const circuits = all.filter((f) => !covered(f.way!));
  const kw = (f: Feeder) => f.loadKw * f.demandFactor;
  const load = { R: 0, Y: 0, B: 0 };
  for (const f of all.filter((x) => covered(x.way!))) {
    if (f.phase === 'RYB') SINGLE_PHASES.forEach((p) => (load[p] += kw(f) / 3));
    else load[f.phase as 'R' | 'Y' | 'B'] += kw(f);
  }
  // The ways circuits may take (not under a hand ELCB), and where each automatic ELCB section starts in that list.
  const limit = Math.max(0, ...hand.map((h) => h.toWay)) + circuits.length + 6;
  const freeWays: number[] = [];
  for (let w = 1; w <= limit; w++) if (!covered(w)) freeWays.push(w);
  const per = (board?.elcbGroupSize ?? 6) / 3;
  const starts = per && board ? elcbSections(board as Board, limit).filter((s) => !s.elcb).map((s) => freeWays.indexOf(s.ways[0])) : freeWays.map((_, i) => i);
  const nextStart = (pos: number) => starts.find((s) => s >= pos) ?? pos;
  const renamed = new Map<string, Feeder>();
  let cur = 0;

  for (const cat of ['lighting', 'power'] as const) {
    const inCat = circuits.filter((f) => circuitCategory(f) === cat);
    if (!inCat.length) continue;
    const three = inCat.filter((f) => f.phase === 'RYB');
    const single = inCat.filter((f) => f.phase !== 'RYB').sort((a, b) => kw(b) - kw(a));
    three.forEach((f, i) => {
      renamed.set(f.id, { ...f, phase: 'RYB', way: freeWays[cur + i] });
      SINGLE_PHASES.forEach((p) => (load[p] += kw(f) / 3));
    });
    const byPhase: Record<'R' | 'Y' | 'B', Feeder[]> = { R: [], Y: [], B: [] };
    for (const f of single) {
      // Lightest phase; ties go to the phase with fewer circuits so ways fill evenly.
      const p = [...SINGLE_PHASES].sort((a, b) => load[a] - load[b] || byPhase[a].length - byPhase[b].length)[0];
      load[p] += kw(f);
      byPhase[p].push(f);
    }
    const first = cur + three.length;
    for (const p of SINGLE_PHASES) byPhase[p].forEach((f, i) => renamed.set(f.id, { ...f, phase: p, way: freeWays[first + i] }));
    const used = three.length + Math.max(...SINGLE_PHASES.map((p) => byPhase[p].length));
    cur = nextStart(cur + used); // next section starts on an ELCB boundary
  }

  const feeders = project.feeders.map((f) => {
    const r = renamed.get(f.id);
    return r ? { ...r, id: circuitId(boardId, r.phase!, r.way!) } : f;
  });
  return reslotSpares({ ...project, feeders }, boardId);
}

/** Balance phases with every ELCB kept (the page's and the panels page's Balance phases): each ELCB's 1-phase circuits
 * are spread over the R / Y / B slots of its own ways, largest first onto the phase that is lightest with the whole DB
 * counted, so every ELCB keeps its circuits and its size. 3-phase circuits and spares stay in their way; 1-phase spares
 * and spaces take the slots left in their ELCB. A run of ways with no ELCB is balanced the same way, on its own.
 * Circuit ids are renamed to match their new references. */
export function balanceInsideElcbs(project: Project, boardId: string): Project {
  const board = project.boards.find((b) => b.id === boardId);
  if (!board) return project;
  const circuits = scheduleCircuits(project, boardId);
  const spares = (board.spareWays ?? []).filter((s) => s.way);
  const last = Math.max(0, ...circuits.map((f) => f.way!), ...spares.map((s) => s.way!));
  // The blocks circuits may move within: each ELCB section, and each run of ways with none.
  const sections = elcbSectionsOf(project, board as Board, last);
  const blocks: number[][] = [];
  for (let w = 1; w <= last;) {
    const sec = sections.find((x) => x.ways.includes(w));
    if (sec) {
      blocks.push(sec.ways);
      w = sec.ways[sec.ways.length - 1] + 1;
      continue;
    }
    const run: number[] = [];
    while (w <= last && !sections.some((x) => x.ways.includes(w))) run.push(w++);
    blocks.push(run);
  }
  const kw = (f: Feeder) => f.loadKw * f.demandFactor;
  const load = { R: 0, Y: 0, B: 0 };
  for (const f of circuits) if (f.phase === 'RYB') SINGLE_PHASES.forEach((p) => (load[p] += kw(f) / 3));
  const circuitAt = new Map<string, { phase: Phase; way: number }>();
  const spareAt = new Map<string, { phase: Phase; way: number }>();
  for (const ways of blocks) {
    const inBlock = (w?: number) => !!w && ways.includes(w);
    const three = new Set([...circuits, ...spares].filter((x) => x.phase === 'RYB' && inBlock(x.way)).map((x) => x.way!));
    const open = ways.filter((w) => !three.has(w)); // ways with an R, a Y and a B slot
    const byPhase: Record<'R' | 'Y' | 'B', Feeder[]> = { R: [], Y: [], B: [] };
    for (const f of circuits.filter((x) => x.phase !== 'RYB' && inBlock(x.way)).sort((a, b) => kw(b) - kw(a))) {
      // Lightest phase with a slot left in this ELCB; ties go to the phase with fewer circuits so ways fill evenly.
      const p = SINGLE_PHASES.filter((x) => byPhase[x].length < open.length).sort((a, b) => load[a] - load[b] || byPhase[a].length - byPhase[b].length)[0];
      if (!p) break;
      load[p] += kw(f);
      byPhase[p].push(f);
    }
    for (const p of SINGLE_PHASES) byPhase[p].forEach((f, i) => circuitAt.set(f.id, { phase: p, way: open[i] }));
    const free = open.flatMap((w, i) => SINGLE_PHASES.filter((p) => byPhase[p].length <= i).map((p) => ({ phase: p as Phase, way: w })));
    const order = (ph: Phase) => SINGLE_PHASES.indexOf(ph as 'R');
    spares.filter((x) => x.phase !== 'RYB' && inBlock(x.way)).sort((a, b) => a.way! - b.way! || order(a.phase) - order(b.phase))
      .forEach((x, i) => { if (free[i]) spareAt.set(x.id, free[i]); });
  }
  const feeders = project.feeders.map((f) => {
    const at = circuitAt.get(f.id);
    return at && (at.phase !== f.phase || at.way !== f.way) ? { ...f, phase: at.phase, way: at.way, id: circuitId(boardId, at.phase, at.way) } : f;
  });
  const boards = project.boards.map((b) => (b.id !== boardId || !b.spareWays ? b : {
    ...b, spareWays: b.spareWays.map((x) => { const at = spareAt.get(x.id); return at ? { ...x, phase: at.phase, way: at.way } : x; })
  }));
  return { ...project, feeders, boards };
}

export { circuitRef };
