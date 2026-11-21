import { applyAllRecommendations, applyRecommendation, recommend } from '../calc/sizing';
import { reconcilePlanLoads } from '../calc/loadAssessmentLumps';
import { areaLoad } from '../calc/spacePlan';
import { STANDARD_BREAKER_A } from '../calc/sizing';
import type { Board, Feeder, LoadType, Project, SpacePlan } from '../types';

/** The SLD from a space plan: per transformer a main LV switchboard (with
 * its transformer and RMU), the planned MDBs and SMDBs below it, and each
 * planned area as a load on its panel. Every breaker and cable is then
 * sized by the app, top-down. Replaces the project's boards and feeders. */

const USE_LOAD_TYPE: Record<string, LoadType> = {
  residential: 'general', villa: 'general', office: 'sockets', retail: 'general', fnb: 'general',
  hotel: 'general', common: 'lighting', parking: 'lighting', services: 'hvac'
};

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toUpperCase().slice(0, 16) || 'LOAD';

/** Rated current of a transformer's LV switchboard: its full-load current,
 * up to the next standard rating. */
const lvRating = (kva: number, voltageV: number) => {
  const i = (kva * 1000) / (Math.sqrt(3) * voltageV);
  return STANDARD_BREAKER_A.find((a) => a >= i) ?? STANDARD_BREAKER_A[STANDARD_BREAKER_A.length - 1];
};

export interface PlanToSld {
  project: Project;
  counts: { rmus: number; transformers: number; panels: number; loads: number };
}

export function planToSld(project: Project, plan: SpacePlan): PlanToSld {
  const boards: Board[] = [];
  const feeders: Feeder[] = [];
  const ids = new Set<string>();
  const unique = (base: string) => {
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };

  // Transformers → main LV switchboards (roots), grouped by RMU.
  const txBoard = new Map<string, string>();
  const byRmu = [...plan.transformers].sort((a, b) => (a.rmu ?? '').localeCompare(b.rmu ?? '') || a.id.localeCompare(b.id));
  for (const t of byRmu) {
    const id = unique(t.id);
    txBoard.set(t.id, id);
    boards.push({
      id, name: `${t.id} LV switchboard`, kind: 'MDB', rmu: t.rmu,
      sourceKva: t.kva, sourceImpedancePct: t.kva >= 1500 ? 6 : 5, ratedCurrentA: lvRating(t.kva, project.voltageV)
    });
  }

  // Panels: MDBs under their transformer, SMDBs under their parent (parents first).
  const panelBoard = new Map<string, string>();
  const pending = [...plan.panels];
  for (let guard = 0; pending.length && guard < 50; guard++) {
    for (const p of [...pending]) {
      const up = p.kind === 'MDB' ? (p.transformer ? txBoard.get(p.transformer) : undefined) : p.parent ? panelBoard.get(p.parent) : undefined;
      if (!up && (p.kind === 'MDB' ? p.transformer : p.parent) && pending.some((x) => x.id === p.parent)) continue; // parent not placed yet
      pending.splice(pending.indexOf(p), 1);
      if (!up) continue; // not fed: left out
      const id = unique(p.id);
      panelBoard.set(p.id, id);
      boards.push({ id, name: `${p.building}${p.location ? ` – ${p.location}` : ''} ${p.kind}`, kind: p.kind, upstreamId: up, location: p.location });
      feeders.push({
        id: unique(`INC-${id}`), boardId: up, name: `Incomer to ${id}`, feedsBoardId: id,
        loadKw: 0, demandFactor: 1, powerFactor: plan.settings.powerFactor, lengthM: 50, cableCsaMm2: 16, cores: 4,
        breakerRatingA: 100, breakerIcuKa: 36, device: p.kind === 'MDB' ? 'MCCB' : undefined
      });
    }
  }

  // Areas → loads on their panel.
  let loads = 0;
  for (const a of plan.areas) {
    const board = a.panel ? panelBoard.get(a.panel) : undefined;
    if (!board) continue;
    const l = areaLoad(plan, a);
    feeders.push({
      id: unique(`${board}-${slug(`${a.floor ?? ''} ${a.name}`)}`), boardId: board,
      name: [a.floor, a.name].filter(Boolean).join(' '),
      loadKw: +l.connectedKw.toFixed(2), demandFactor: l.demandFactor, powerFactor: plan.settings.powerFactor,
      lengthM: 30, cableCsaMm2: 16, cores: 4, breakerRatingA: 63, breakerIcuKa: 25,
      loadType: USE_LOAD_TYPE[a.use] ?? 'general',
      remarks: a.areaM2 ? `${a.areaM2} m² × ${l.wPerM2} W/m² (planned)` : 'Specific load (planned)'
    });
    loads++;
  }

  // Keep only the boards that ended up fed; drop the incomer of any board
  // that didn't make it.
  const next: Project = { ...project, boards, feeders, ties: [], vdSelection: undefined };
  const sized = applyAllRecommendations(next, 'optimise');
  return {
    project: sized,
    counts: {
      rmus: new Set(plan.transformers.map((t) => t.rmu).filter(Boolean)).size,
      transformers: plan.transformers.length,
      panels: panelBoard.size,
      loads
    }
  };
}

/** Board.generated of a board made from the plan (a transformer's switchboard, a panel),
 * and Feeder.fromRoom of a load feeder made from a plan row. */
export const SP_TX = 'sp:tx:';
export const SP_PANEL = 'sp:panel:';
export const SP_LOAD = 'sp:';

export interface SupplyUpdate {
  project: Project;
  counts: { rmus: number; transformers: number; panels: number; loads: number };
  created: string[]; // boards made
  updated: string[]; // plan boards that were already there
  removed: string[]; // boards taken away: no longer in the plan, or the load assessment's own MDBs, with nothing of yours on them
  left: string[]; // boards no longer in the plan that still feed something of yours: left in place
}

/** Makes or updates the supply from the plan without touching what was designed: the plan's
 * transformer switchboards, MDBs and SMDBs are created or brought up to date (a board made
 * from the plan before is found by its tag, an untagged one by its id), every plan row gets
 * a load feeder on its panel, and only those boards' incomers and load feeders are sized.
 * Boards and feeders you designed stay. The load assessment's own lump feeders go (the plan's
 * rows carry those loads), and a board left with nothing of yours on it is removed. The load
 * feeders of rows taken from the assessment are then reduced by what is already designed. */
export function updateSupply(project: Project, plan: SpacePlan): SupplyUpdate {
  let boards = [...project.boards];
  let feeders = [...project.feeders];
  const ids = new Set([...boards.map((b) => b.id), ...feeders.map((f) => f.id)]);
  const unique = (base: string) => {
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };
  const created: string[] = [], updated: string[] = [];
  const toSize = new Set<string>();
  const patch = (id: string, p: Partial<Board>) => { boards = boards.map((b) => (b.id === id ? { ...b, ...p } : b)); };

  // Transformers: main LV switchboards.
  const txBoard = new Map<string, string>();
  for (const t of [...plan.transformers].sort((a, b) => (a.rmu ?? '').localeCompare(b.rmu ?? '') || a.id.localeCompare(b.id))) {
    const tag = `${SP_TX}${t.id}`;
    const have = boards.find((b) => b.generated === tag) ?? boards.find((b) => b.id === t.id && !b.generated && !b.upstreamId);
    const fields = { rmu: t.rmu, sourceKva: t.kva, sourceImpedancePct: t.kva >= 1500 ? 6 : 5, ratedCurrentA: lvRating(t.kva, project.voltageV), generated: tag };
    if (have) { patch(have.id, fields); txBoard.set(t.id, have.id); updated.push(have.id); }
    else { const id = unique(t.id); boards.push({ id, name: `${t.id} LV switchboard`, kind: 'MDB', ...fields }); txBoard.set(t.id, id); created.push(id); }
  }

  // Panels: MDBs under their transformer, SMDBs under their parent (parents first).
  const panelBoard = new Map<string, string>();
  const pending = [...plan.panels];
  for (let guard = 0; pending.length && guard < 50; guard++) {
    for (const p of [...pending]) {
      const up = p.kind === 'MDB' ? (p.transformer ? txBoard.get(p.transformer) : undefined) : p.parent ? panelBoard.get(p.parent) : undefined;
      if (!up && p.kind === 'SMDB' && p.parent && pending.some((x) => x.id === p.parent)) continue; // parent not placed yet
      pending.splice(pending.indexOf(p), 1);
      if (!up) continue; // not fed: left out
      const tag = `${SP_PANEL}${p.id}`;
      const have = boards.find((b) => b.generated === tag) ?? boards.find((b) => b.id === p.id && !b.generated);
      let id: string;
      if (have) {
        id = have.id;
        patch(id, { generated: tag, kind: p.kind, upstreamId: up, ...(p.location ? { location: p.location } : {}) });
        updated.push(id);
      } else {
        id = unique(p.id);
        boards.push({ id, name: `${p.building}${p.location ? ` – ${p.location}` : ''} ${p.kind}`, kind: p.kind, upstreamId: up, location: p.location, generated: tag });
        created.push(id);
      }
      panelBoard.set(p.id, id);
      // Its incomer follows it to the board that feeds it now; a missing one is made.
      const inc = feeders.find((f) => f.feedsBoardId === id);
      if (inc) { if (inc.boardId !== up) { feeders = feeders.map((f) => (f === inc ? { ...f, boardId: up } : f)); toSize.add(inc.id); } }
      else {
        const incId = unique(`INC-${id}`);
        feeders.push({
          id: incId, boardId: up, name: `Incomer to ${id}`, feedsBoardId: id,
          loadKw: 0, demandFactor: 1, powerFactor: plan.settings.powerFactor, lengthM: 50, cableCsaMm2: 16, cores: 4,
          breakerRatingA: 100, breakerIcuKa: 36, device: p.kind === 'MDB' ? 'MCCB' : undefined
        });
        toSize.add(incId);
      }
    }
  }
  const planBoards = new Set([...txBoard.values(), ...panelBoard.values()]);

  // Loads: the feeders made from the plan before are replaced (their cable length kept); the
  // load assessment's own lump feeders go, as the plan's rows carry those loads.
  const planned = (f: Feeder) => !!f.fromRoom?.startsWith(SP_LOAD) || (!f.fromRoom && planBoards.has(f.boardId) && /\(planned\)$/.test(f.remarks ?? ''));
  const lengthOf = new Map(feeders.filter((f) => f.fromRoom?.startsWith(SP_LOAD)).map((f) => [f.fromRoom!, f.lengthM]));
  feeders = feeders.filter((f) => !planned(f) && !f.fromRoom?.startsWith('la:'));
  let loads = 0;
  for (const a of plan.areas) {
    const board = a.panel ? panelBoard.get(a.panel) : undefined;
    if (!board) continue;
    const l = areaLoad(plan, a);
    const tag = `${SP_LOAD}${a.id}`;
    const name = [a.floor, a.name].filter(Boolean).join(' ');
    // The share of a row on the standby generator becomes an essential feeder of its own, so the
    // generator sizing sees it. Fire and life safety is not in the plan's normal demand, but runs
    // at full load on the generator.
    const share = Math.min(1, Math.max(0, a.genShare ?? 0));
    const demandFactor = a.laKey === 'life' ? 1 : l.demandFactor;
    const parts = share > 0 && share < 1
      ? [{ tag, kw: l.connectedKw * (1 - share), essential: false, name }, { tag: `${tag}~e`, kw: l.connectedKw * share, essential: true, name: `${name} (essential)` }]
      : [{ tag, kw: l.connectedKw, essential: share >= 1, name }];
    for (const part of parts) {
      const id = unique(`${board}-${slug(`${a.floor ?? ''} ${part.name}`)}`);
      feeders.push({
        id, boardId: board, name: part.name,
        loadKw: +part.kw.toFixed(2), demandFactor, powerFactor: plan.settings.powerFactor,
        lengthM: lengthOf.get(part.tag) ?? 30, cableCsaMm2: 16, cores: 4, breakerRatingA: 63, breakerIcuKa: 25,
        loadType: USE_LOAD_TYPE[a.use] ?? 'general', fromRoom: part.tag, ...(part.essential ? { essential: true } : {}),
        remarks: a.areaM2 ? `${a.areaM2} m² × ${l.wPerM2} W/m² (planned)` : 'Specific load (planned)'
      });
      toSize.add(id);
    }
    loads++;
  }

  // Boards the plan no longer has, and the load assessment's own MDBs: removed when nothing
  // of yours is on them (leaves first), else left in place.
  const removed: string[] = [];
  const stale = () => boards.filter((b) => !planBoards.has(b.id) && (b.generated?.startsWith('sp:') || b.generated === 'la:mdb'));
  for (let again = true; again;) {
    again = false;
    for (const b of stale()) {
      if (feeders.some((f) => f.boardId === b.id) || boards.some((x) => x.upstreamId === b.id)) continue;
      boards = boards.filter((x) => x.id !== b.id);
      feeders = feeders.filter((f) => f.feedsBoardId !== b.id);
      removed.push(b.id);
      again = true;
    }
  }
  const left = stale().map((b) => b.id);

  let p: Project = { ...project, boards, feeders };
  for (const id of toSize) {
    const f = p.feeders.find((x) => x.id === id);
    if (f) p = { ...p, feeders: p.feeders.map((x) => (x.id === id ? applyRecommendation(f, recommend(p, f, 'optimise')) : x)) };
  }
  p = reconcilePlanLoads({ ...p, spacePlan: plan }).project;
  return {
    project: p, created, updated, removed, left,
    counts: { rmus: new Set(plan.transformers.map((t) => t.rmu).filter(Boolean)).size, transformers: plan.transformers.length, panels: panelBoard.size, loads }
  };
}
