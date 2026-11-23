import type { Board, BoardKind, Feeder, LoadType, Project } from '../types';
import { newProject } from '../types';
import { applyStartLevel, type StartChoice } from './startLevel';
import { applyDrop } from './sldEdit';
import { addSpareWay } from './spareWays';
import { packRevisions } from './revisionStore';
import { nextFreeSlot } from '../calc/loadSchedule';
import { applyAllRecommendations, boardDemandKva, breakerRatings } from '../calc/sizing';
import { selectCable } from '../calc/electrical';

/** Eight sample projects, one for each SLD start level (docs/samples/start-levels). They are made with the app's own
 * functions (start level, adding a board below a board, sizing) and written with fixed ids and dates, so the files
 * can be compared byte for byte (startSamples.test.ts); `npm run samples:start-levels` writes them again. */

export interface StartSample { file: string; title: string; note: string; project: Project }

export const SAMPLE_DATE = '2026-11-23T00:00:00.000Z';
/** The text of a project file, as the app saves it (electron/projectFiles.cjs projectText: "format" first, two-space JSON, no final newline). */
export const sampleFileText = (project: Project): string =>
  JSON.stringify(Object.assign({ format: 'lvds.project' }, packRevisions(project), { format: 'lvds.project' }), null, 2);

// ---- Building blocks ------------------------------------------------------------------------------------------------

/** A circuit: kW connected, power factor, length m; on a DB it takes the next free way (3-phase: a whole way). */
interface Circuit { name: string; kw: number; pf?: number; len: number; type?: LoadType; phase?: 'single' | 'three'; purpose?: 'sockets' | 'fixed'; rcdMa?: number }

const nextStandard = (a: number): number => breakerRatings().find((r) => r >= a) ?? Math.ceil(a);

function below(p: Project, kind: BoardKind, parent: string, name?: string): { project: Project; id: string } {
  const r = applyDrop(p, { kind: 'board', board: kind }, { type: 'bus', boardId: parent });
  const id = r.select!.id;
  return { project: name ? { ...r.project, boards: r.project.boards.map((b) => (b.id === id ? { ...b, name } : b)) } : r.project, id };
}

/** Circuits on a board: a DB gets final circuits in the schedule (phase + way), any other board outgoing feeders. Each is
 * given a starting breaker and cable; sizing comes afterwards (applyAllRecommendations). */
function withCircuits(p: Project, boardId: string, list: Circuit[]): Project {
  const db = (p.boards.find((b) => b.id === boardId)!.kind ?? 'DB') === 'DB';
  let q = p;
  list.forEach((c, i) => {
    const three = c.phase === 'three' || !db;
    const slot = db ? nextFreeSlot(q, boardId, three ? 'RYB' : undefined) : undefined;
    const f: Feeder = {
      id: slot ? `${boardId}-${slot.phase}${slot.way}` : `${boardId}-F${i + 1}`,
      boardId, name: c.name, loadKw: c.kw, demandFactor: 1, powerFactor: c.pf ?? 0.9, lengthM: c.len,
      cableCsaMm2: three ? 4 : 2.5, cores: three ? 4 : 2, breakerRatingA: three ? 20 : 10, breakerIcuKa: db ? 10 : 36,
      loadType: c.type ?? 'general',
      ...(slot ? { phase: slot.phase, way: slot.way } : {}),
      ...(c.purpose ? { circuitPurpose: c.purpose } : {}),
      ...(c.rcdMa ? { rcdMa: c.rcdMa } : {})
    };
    q = { ...q, feeders: [...q.feeders, f] };
  });
  return q;
}

const spare = (p: Project, boardId: string): Project => addSpareWay(p, boardId, 'spare', 'R').project;

const FINAL: Circuit[] = [
  { name: 'Lighting', kw: 1.2, len: 30, type: 'lighting', purpose: 'fixed' },
  { name: 'Lighting 2', kw: 0.9, len: 25, type: 'lighting', purpose: 'fixed' },
  { name: 'Sockets', kw: 2.2, len: 28, type: 'sockets', purpose: 'sockets', rcdMa: 30 },
  { name: 'Sockets 2', kw: 2.2, len: 22, type: 'sockets', purpose: 'sockets', rcdMa: 30 },
  { name: 'AC unit', kw: 2.8, pf: 0.85, len: 20, type: 'hvac', purpose: 'fixed' },
  { name: 'Water heater', kw: 3, pf: 1, len: 15, type: 'general', purpose: 'fixed' }
];
const FEW: Circuit[] = FINAL.slice(0, 4);

/** Sizes every breaker and cable (incomers first), then gives each board below the rating of the breaker that feeds it. */
function sized(p: Project): Project {
  // The authority-table remark the sizing adds is dropped: a sample names no authority.
  const s = applyAllRecommendations(p, 'optimise');
  s.feeders = s.feeders.map((f) => { if (!f.remarks) return f; const { remarks: _r, ...rest } = f; return rest; });
  const rating = new Map(s.feeders.filter((f) => f.feedsBoardId).map((f) => [f.feedsBoardId!, f.breakerRatingA]));
  return { ...s, boards: s.boards.map((b) => (rating.has(b.id) ? { ...b, ratedCurrentA: rating.get(b.id) } : b)) };
}

/** A first board fed from a board outside the project: its breaker, incoming cable and the values given from upstream. */
function givenFirst(p: Project, boardId: string, o: { fedFrom: string; ref: string; faultKa: number; xr: number; vdUsedPct: number; zeOhm: number; lengthM: number }): Project {
  const kva = boardDemandKva(p, boardId);
  const ib = (kva * 1000) / (Math.sqrt(3) * p.voltageV);
  // The supply device sits at least 1.6 times above the largest breaker it feeds (discrimination ratio).
  const out = Math.max(0, ...p.feeders.filter((f) => f.boardId === boardId).map((f) => f.breakerRatingA));
  const ratingA = nextStandard(Math.max(ib / 0.85, out * 1.6));
  const csa = selectCable(ib, o.lengthM, p.voltageV, 4, 0.9, p.ambientC, 1, ratingA) ?? 300;
  return {
    ...p,
    boards: p.boards.map((b): Board => (b.id !== boardId ? b : {
      ...b, ratedCurrentA: ratingA,
      supply: { fedBy: 'board', fedFrom: o.fedFrom, ref: o.ref, device: 'MCCB', ratingA, faultKa: o.faultKa, xr: o.xr, vdUsedPct: o.vdUsedPct, zeOhm: o.zeOhm, allowedA: ratingA, incomer: { cableCsaMm2: csa, lengthM: o.lengthM, cores: 4 } }
    }))
  };
}

const start = (name: string, choice: StartChoice): Project => applyStartLevel({ ...newProject(name), name }, choice);

// ---- The eight projects ---------------------------------------------------------------------------------------------

function s01(): Project {
  let p = start('Sample 01 — Final DB', { level: 'db' });
  const id = p.boards[0].id;
  p = withCircuits(p, id, FINAL);
  p = spare(p, id);
  return sized(givenFirst(sized(p), id, { fedFrom: 'SMDB-1 (not in this project)', ref: 'Board schedule, Rev A', faultKa: 15, xr: 4, vdUsedPct: 0.8, zeOhm: 0.15, lengthM: 35 }));
}

function s02(): Project {
  let p = start('Sample 02 — Sub-main board', { level: 'submain' });
  const smdb = p.boards[0].id;
  const a = below(p, 'DB', smdb, 'DB Flat 1'); p = a.project;
  const b = below(p, 'DB', smdb, 'DB Flat 2'); p = b.project;
  p = withCircuits(p, a.id, FINAL); p = spare(p, a.id);
  p = withCircuits(p, b.id, FEW);
  p = withCircuits(p, smdb, [{ name: 'Lift', kw: 11, pf: 0.8, len: 25, type: 'motor' }]);
  return sized(givenFirst(sized(p), smdb, { fedFrom: 'MDB-1 (not in this project)', ref: 'Board schedule, Rev A', faultKa: 22, xr: 5, vdUsedPct: 0.8, zeOhm: 0.1, lengthM: 60 }));
}

function s03(): Project {
  let p = start('Sample 03 — Main board on an LV source', { level: 'source' });
  const mdb = p.boards[0].id;
  p = { ...p, boards: p.boards.map((b) => (b.id === mdb ? { ...b, ratedCurrentA: 630, supply: { ...b.supply, fedFrom: 'Source', faultKa: 25, device: 'MCCB', ratingA: 630 } } : b)) };
  const sm = below(p, 'SMDB', mdb); p = sm.project;
  const db = below(p, 'DB', sm.id); p = db.project;
  const db2 = below(p, 'DB', mdb); p = db2.project;
  p = withCircuits(p, db.id, FINAL); p = spare(p, db.id);
  p = withCircuits(p, db2.id, FEW);
  p = withCircuits(p, sm.id, [{ name: 'Pump', kw: 7.5, pf: 0.85, len: 40, type: 'motor' }]);
  p = withCircuits(p, mdb, [{ name: 'Chiller', kw: 45, pf: 0.85, len: 30, type: 'hvac' }]);
  return sized(p);
}

function tree(p: Project, mdb: string, tag: string): Project {
  const sm = below(p, 'SMDB', mdb, `SMDB ${tag}`); p = sm.project;
  const db = below(p, 'DB', sm.id, `DB ${tag}`); p = db.project;
  p = withCircuits(p, db.id, FINAL); p = spare(p, db.id);
  return withCircuits(p, sm.id, [{ name: 'Pump', kw: 7.5, pf: 0.85, len: 40, type: 'motor' }]);
}

function s04(): Project {
  let p = start('Sample 04 — Transformer and main board', { level: 'transformer' });
  p = tree(p, p.boards[0].id, 'A');
  const db = below(p, 'DB', p.boards[0].id, 'DB B'); p = db.project;
  p = withCircuits(p, db.id, FEW);
  return sized(p);
}

function s05(): Project {
  let p = start('Sample 05 — RMU and one transformer', { level: 'rmu', transformers: 1 });
  p = tree(p, p.boards[0].id, 'A');
  return sized(p);
}

function s06(): Project {
  let p = start('Sample 06 — RMU and two transformers', { level: 'rmu', transformers: 2 });
  p = tree(p, 'MDB-1', 'A');
  const db = below(p, 'DB', 'MDB-2', 'DB B'); p = db.project;
  p = withCircuits(p, db.id, FINAL);
  return sized(p);
}

function s07(): Project {
  let p = start('Sample 07 — 11 kV ring, two substations', { level: 'ring' });
  p = tree(p, 'MDB-1', 'A');
  const db = below(p, 'DB', 'MDB-2', 'DB B'); p = db.project;
  p = withCircuits(p, db.id, FINAL);
  return sized(p);
}

function s08(): Project {
  let p = start('Sample 08 — Generator and solar', { level: 'source' });
  const first = p.boards[0].id;
  const r = applyDrop(p, { kind: 'board', board: 'MDB' }, { type: 'canvas' });
  p = r.project;
  const second = r.select!.id;
  const gen = below(p, 'DB', first, 'DB Generator'); p = gen.project;
  const pv = below(p, 'DB', second, 'DB Solar'); p = pv.project;
  p = withCircuits(p, gen.id, FINAL);
  p = withCircuits(p, pv.id, FEW.slice(0, 2));
  p = {
    ...p,
    boards: p.boards.map((b) => b.id === first
      ? { ...b, name: 'Generator board', ratedCurrentA: 400, supply: { fedFrom: 'Generator set', kind: 'generator' as const, ratedKva: 250, xr: 10, device: 'MCCB' as const, ratingA: 400 } }
      : b.id === second
        ? { ...b, name: 'Solar board', ratedCurrentA: 160, supply: { fedFrom: 'Solar PV', kind: 'pv' as const, ratedKva: 100, device: 'MCCB' as const, ratingA: 160 } }
        : b)
  };
  return sized(p);
}

const BUILD: { file: string; note: string; make: () => Project }[] = [
  { file: '01-final-db.lvds', make: s01, note: 'A final DB fed from a board outside the project, with the values given from upstream typed on its supply.' },
  { file: '02-sub-main-board.lvds', make: s02, note: 'A sub-main board fed from outside, two DBs below it.' },
  { file: '03-main-board-lv-source.lvds', make: s03, note: 'A main board on an LV source with a given fault level, one sub-main board and two DBs.' },
  { file: '04-transformer-main-board.lvds', make: s04, note: 'The default start: a transformer and its main board, one sub-main board and two DBs.' },
  { file: '05-rmu-one-transformer.lvds', make: s05, note: 'An 11 kV RMU feeding one transformer and its main board.' },
  { file: '06-rmu-two-transformers.lvds', make: s06, note: 'An RMU feeding two transformers, two main boards joined by the bus coupler BC-1 (normally open).' },
  { file: '07-ring-two-substations.lvds', make: s07, note: 'An 11 kV ring: a grid source, two substations with an RMU and a transformer each.' },
  { file: '08-generator-and-solar.lvds', make: s08, note: 'Two first boards on LV sources: a 250 kVA generator (2.43 kA calculated) and a 100 kVA solar inverter source (0.17 kA). Earth-fault disconnection on the generator board is not verified until a minimum fault level is typed; the solar board has two small circuits because its fault current is low.' }
];

/** Every generated id and uid replaced by a value counted in order, the project's own ids fixed, so the file is the same every time. */
function fixed(p: Project, n: number): Project {
  const tag = `sample-${String(n).padStart(2, '0')}`;
  const map = new Map<string, string>();
  const stable = (old: string, kind: string): string => { const k = `${kind}:${old}`; if (!map.has(k)) map.set(k, `${tag}-${kind}-${map.size + 1}`); return map.get(k)!; };
  const { pointTemplate: _t, ...rest } = p; // the new-project template id names an authority; the app falls back to its standard columns
  return {
    ...rest, id: tag, createdAt: SAMPLE_DATE, updatedAt: SAMPLE_DATE,
    boards: p.boards.map((b) => ({ ...b, uid: stable(b.uid ?? b.id, 'board') })),
    feeders: p.feeders.map((f) => ({ ...f, uid: stable(f.uid ?? f.id, 'circuit') })),
    ...(p.substations ? { substations: p.substations.map((s) => ({ ...s, id: stable(s.id, 'substation') })) } : {})
  };
}

export function startSamples(): StartSample[] {
  return BUILD.map(({ file, note, make }, i) => {
    const project = fixed(make(), i + 1);
    return { file, title: project.name, note, project };
  });
}
