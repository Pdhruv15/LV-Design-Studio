import { describe, expect, it } from 'vitest';
import { buildBom } from '../calc/bom';
import { rcdOf } from '../calc/earthing';
import { elcbGroups, elcbSections, isRcbo, oddElcbCircuits, rcbosOf, scheduleCircuits } from '../calc/loadSchedule';
import { buildLoadScheduleHtml, elcbColumn, loadScheduleRows, scheduleTable } from '../docs/loadScheduleDoc';
import { buildDbSheet } from '../docs/dbSheet';
import type { Feeder, Project } from '../types';
import { neededDevices } from './enclosureLibrary';
import { addBoardElcb, allAutomatic, editElcbAt, fixElcbs, regroupElcbs, regroupPreview, removeBoardElcb, removeElcbAt, resizeElcb, setNewElcbSize, setNoRcd, setRcbo, updateBoardElcb } from './elcbs';
import { anonymizeProject } from './anonymize';
import { addCircuit, balanceInsideElcbs, balancePhases, updateCircuit } from './schedule';

const WATTS = { ltg: 100, cfan: 80, exfan: 40, shaver: 20, s13: 250, wh: 3000, hd: 1800, cooker: 6000, s15: 1000, wac: 2000, sac: 2500, pump: 750 };

/** A DB with `n` 1-phase lighting circuits filled R1, Y1, B1, R2 … (way count = n / 3). */
function db(n: number, board: Partial<Project['boards'][number]> = {}): Project {
  let p: Project = {
    name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '',
    boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }, { id: 'DB', name: 'Villa DB', upstreamId: 'MDB', ratedCurrentA: 100, pointWatts: WATTS, ...board }],
    feeders: [{ id: 'INC', boardId: 'MDB', name: 'Incomer', loadKw: 0, demandFactor: 1, powerFactor: 0.9, lengthM: 30, cableCsaMm2: 35, cores: 4, breakerRatingA: 100, breakerIcuKa: 36, feedsBoardId: 'DB' } as Feeder]
  };
  for (let i = 0; i < n; i++) {
    const r = addCircuit(p, 'DB');
    p = updateCircuit(r.project, r.id, { points: { ltg: 5 }, room: `Room ${i + 1}` });
  }
  return p;
}
const board = (p: Project) => p.boards.find((b) => b.id === 'DB')!;
const ways = (p: Project) => elcbGroups(p, board(p)).map((g) => g.ways);
const withElcbs = (p: Project, elcbs: NonNullable<Project['boards'][number]['elcbs']>): Project => ({ ...p, boards: p.boards.map((b) => (b.id === 'DB' ? { ...b, elcbs } : b)) });

describe('ELCB sections and groups', () => {
  it('without hand ELCBs the groups are as before', () => {
    const p = db(21);
    expect(ways(p)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
    expect(elcbGroups(p, board(p)).map((g) => [g.index, g.poles, g.byHand])).toEqual([[1, 4, undefined], [2, 4, undefined], [3, 4, undefined], [4, 4, undefined]]);
  });

  it('a hand ELCB on way 5 splits the automatic sections around it', () => {
    const p = withElcbs(db(21), [{ id: 'h', fromWay: 5, toWay: 5 }]);
    expect(ways(p)).toEqual([[1, 2], [3, 4], [5], [6, 7]]);
    const g = elcbGroups(p, board(p))[2];
    expect(g).toMatchObject({ index: 3, byHand: { id: 'h' }, poles: 4 });
    expect(g.circuits.map((c) => c.way)).toEqual([5, 5, 5]);
    expect(elcbSections(board(p), 7).map((s) => s.index)).toEqual([1, 2, 3, 4]);
  });

  it('a hand ELCB over spares only is a group, an automatic section of spares only is not', () => {
    let p = db(6);
    p = { ...p, boards: p.boards.map((b) => (b.id === 'DB' ? { ...b, spareWays: [{ id: 'sp1', kind: 'spare', phase: 'R', way: 4, ratingA: 20 }, { id: 'sp2', kind: 'spare', phase: 'R', way: 6, ratingA: 20 }] } : b)) };
    expect(ways(p)).toEqual([[1, 2]]);
    const q = withElcbs(p, [{ id: 'h', fromWay: 4, toWay: 4 }]);
    expect(elcbGroups(q, board(q)).map((g) => [g.index, g.circuits.length, g.category])).toEqual([[1, 6, 'lighting'], [3, 0, 'power']]);
  });

  it('an RCBO circuit is in no group and a section of only RCBOs has none', () => {
    let p = db(6, { elcbGroupSize: 3 });
    for (const f of scheduleCircuits(p, 'DB').filter((x) => x.way === 1)) p = setRcbo(p, f.id, true);
    expect(ways(p)).toEqual([[2]]);
    expect(elcbGroups(p, board(p))[0].index).toBe(2);
    p = setRcbo(p, 'DB-R2', true);
    expect(elcbGroups(p, board(p))[0].circuits.map((c) => c.id)).toEqual(['DB-Y2', 'DB-B2']);
  });

  it('hand rating, mA and 3 poles give the label', () => {
    const p = withElcbs(db(6), [{ id: 'h', fromWay: 1, toWay: 2, poles: 3, ratingA: 63, sensitivityMa: 100 }]);
    expect(elcbGroups(p, board(p))[0]).toMatchObject({ ratingA: 63, sensitivityMa: 100, poles: 3, label: '63 A 100 mA 3P' });
  });

  it('with no ELCB grouping, only hand ELCBs make sections', () => {
    const p = withElcbs(db(6, { elcbGroupSize: 0 }), [{ id: 'h', fromWay: 2, toWay: 2 }]);
    expect(elcbGroups(p, board(p)).map((g) => [g.index, g.ways])).toEqual([[1, [2]]]);
  });

  it('rcbosOf numbers RCBOs in way order and labels them 2P', () => {
    let p = db(6);
    p = setRcbo(p, 'DB-Y2', true);
    p = setRcbo(p, 'DB-R1', true, 100);
    const r = rcbosOf(p, board(p));
    expect(r.map((x) => [x.index, x.circuit.id, x.sensitivityMa])).toEqual([[1, 'DB-R1', 100], [2, 'DB-Y2', 100]]);
    expect(r[0].label).toBe(`${r[0].ratingA} A 100 mA 2P`);
  });
});

describe('placing ELCBs and RCBOs', () => {
  it('adds an ELCB without moving the others, takes the ways of one it overlaps, updates and removes it', () => {
    const p = db(21);
    const a = addBoardElcb(p, 'DB', { fromWay: 5, toWay: 5 });
    expect(a.message).toMatch(/^ELCB-3 \d+ A \d+ mA 4P placed over way 5$/);
    expect(ways(a.project)).toEqual([[1, 2], [3, 4], [5], [6], [7, 8]]);
    expect(ways(addBoardElcb(a.project, 'DB', { fromWay: 4, toWay: 5 }).project)).toEqual([[1, 2], [3], [4, 5], [6], [7, 8]]);
    expect(ways(addBoardElcb(p, 'DB', { fromWay: 2, toWay: 3 }).project)).toEqual([[1], [2, 3], [4], [5, 6], [7, 8]]);
    expect(() => addBoardElcb(p, 'DB', { fromWay: 3, toWay: 2 })).toThrow();
    expect(() => addBoardElcb(p, 'MDB', { fromWay: 1, toWay: 1 })).toThrow();
    const u = updateBoardElcb(a.project, 'DB', a.id, { toWay: 6, poles: 3, ratingA: 63 });
    expect(board(u.project).elcbs!.find((e) => e.id === a.id)).toEqual({ id: a.id, fromWay: 5, toWay: 6, poles: 3, ratingA: 63 });
    expect(ways(u.project)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
    const r = removeBoardElcb(u.project, 'DB', a.id);
    expect(ways(r)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
    expect(elcbGroups(r, board(r))[2].byHand).toBeUndefined();
  });

  it('setRcbo turns an RCBO on and off; a 3-phase circuit gets a 4P RCBO', () => {
    let p = db(3);
    p = addCircuit(p, 'DB', 'RYB').project;
    const four = setRcbo(p, 'DB-RYB2', true);
    expect(rcbosOf(four, board(four)).map((r) => r.label.split(' ').pop())).toEqual(['4P']);
    expect(elcbGroups(four, board(four)).flatMap((g) => g.circuits.map((c) => c.id))).not.toContain('DB-RYB2');
    expect(() => setRcbo(p, 'INC', true)).toThrow();
    const on = setRcbo(p, 'DB-R1', true, 100);
    expect(on.feeders.find((f) => f.id === 'DB-R1')).toMatchObject({ rcbo: true, rcdMa: 100 });
    expect(isRcbo(on.feeders.find((f) => f.id === 'DB-R1')!)).toBe(true);
    const auto = setRcbo(on, 'DB-R1', true);
    expect(auto.feeders.find((f) => f.id === 'DB-R1')!.rcdMa).toBeUndefined();
    const off = setRcbo(on, 'DB-R1', false);
    expect(off.feeders.find((f) => f.id === 'DB-R1')).not.toHaveProperty('rcbo');
    expect(off.feeders.find((f) => f.id === 'DB-R1')).not.toHaveProperty('rcdMa');
  });

  it('allAutomatic removes both', () => {
    let p = db(6);
    p = setRcbo(p, 'DB-R1', true, 100);
    p = addBoardElcb(p, 'DB', { fromWay: 2, toWay: 2 }).project;
    const q = allAutomatic(p, 'DB');
    expect(board(q).elcbs).toBeUndefined();
    expect(q.feeders.some((f) => f.rcbo || (f.boardId === 'DB' && f.rcdMa))).toBe(false);
  });

  it('sizes the board again: the earth leakage change reaches the earth-fault check', () => {
    const p = db(3);
    const before = rcdOf(p, p.feeders.find((f) => f.id === 'DB-R1')!);
    const q = setRcbo(p, 'DB-R1', true, 10);
    expect(rcdOf(q, q.feeders.find((f) => f.id === 'DB-R1')!)).toBe(10);
    expect(before).toBe(100); // lighting group, project setting
  });
});

describe('every ELCB is its own device', () => {
  const groups = (p: Project) => elcbGroups(p, board(p)).map((g) => [g.index, g.ways, g.label, g.circuits.map((c) => c.id)]);

  it('fixElcbs changes nothing on the schedule or its prints', () => {
    let p = setRcbo(db(21), 'DB-Y3', true);
    p = { ...p, boards: p.boards.map((b) => (b.id === 'DB' ? { ...b, spareWays: [{ id: 'sp1', kind: 'spare', phase: 'R', way: 9, ratingA: 20 }] } : b)) };
    const q = fixElcbs(p, 'DB');
    expect(board(q).elcbs!.map((e) => [e.fromWay, e.toWay])).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
    expect(groups(q)).toEqual(groups(p));
    expect(buildLoadScheduleHtml(q, 'DB')).toBe(buildLoadScheduleHtml(p, 'DB'));
    // What the sheet shows: its cells, merges and texts (rows and board carry the data objects; functions are left out).
    const sheet = (x: Project) => JSON.stringify({ ...buildDbSheet(x, 'DB'), board: undefined, rows: undefined });
    expect(sheet(q)).toEqual(sheet(p));
    const plain = db(9);
    expect(sheet(fixElcbs(plain, 'DB'))).toEqual(sheet(plain));
    expect(fixElcbs(q, 'DB')).toBe(q);
  });

  it('changing the New ELCBs size keeps every ELCB already on the DB', () => {
    let p = db(12);
    expect(ways(p)).toEqual([[1, 2], [3, 4]]);
    p = setNewElcbSize(p, 'DB', 3);
    expect(board(p).elcbGroupSize).toBe(3);
    expect(ways(p)).toEqual([[1, 2], [3, 4]]);
    for (let i = 0; i < 3; i++) p = addCircuit(p, 'DB').project;
    expect(ways(p)).toEqual([[1, 2], [3, 4], [5]]);
    p = setNewElcbSize(p, 'DB', 12);
    for (let i = 0; i < 3; i++) p = addCircuit(p, 'DB').project;
    expect(ways(p)).toEqual([[1, 2], [3, 4], [5], [6, 7, 8, 9]]);
  });

  it('resizes one ELCB: bigger takes the next ways, smaller gives the freed ways their own ELCB', () => {
    const p = db(12);
    expect(ways(resizeElcb(p, 'DB', 1, 3).project)).toEqual([[1], [2], [3, 4]]);
    expect(ways(resizeElcb(p, 'DB', 2, 9).project)).toEqual([[1, 2, 3], [4]]);
    const all = resizeElcb(p, 'DB', 1, 12);
    expect(ways(all.project)).toEqual([[1, 2, 3, 4]]);
    expect(all.message).toMatch(/^ELCB-1 \d+ A \d+ mA 4P over ways 1–4 \(12 circuits\)$/);
    const same = resizeElcb(p, 'DB', 3, 6);
    expect(same.project).toBe(p);
    expect(same.message).toBe('ELCB-2 already covers 6 circuits');
    // Freed ways with nothing in them get no ELCB.
    expect(ways(resizeElcb(db(3), 'DB', 1, 3).project)).toEqual([[1]]);
    expect(() => resizeElcb(p, 'DB', 1, 4)).toThrow(/3, 6, 9 or 12/);
    expect(ways(setNewElcbSize(db(3), 'DB', 0))).toEqual([[1, 2]]);
    expect(() => resizeElcb(regroupElcbs(db(3), 'DB', { size: 0, keepApart: false, keepRcbos: true }), 'DB', 1, 3)).toThrow('Way 1 has no ELCB');
  });

  it('edits and removes an automatic ELCB like one of its own; its ways then take the New ELCBs size', () => {
    const p = db(12);
    const e = editElcbAt(p, 'DB', 3, { poles: 3 });
    expect(elcbGroups(e.project, board(e.project)).map((g) => [g.ways, g.poles])).toEqual([[[1, 2], 4], [[3, 4], 3]]);
    const split = resizeElcb(p, 'DB', 1, 3).project;
    const gone = removeElcbAt(split, 'DB', 2);
    expect(ways(gone)).toEqual([[1], [2], [3, 4]]);
    expect(elcbGroups(gone, board(gone))[1].byHand).toBeUndefined();
  });

  it('Re-group cuts the whole DB again; it keeps lighting and power apart and the RCBOs when asked', () => {
    let p = resizeElcb(db(12), 'DB', 1, 3).project;
    p = updateCircuit(setRcbo(p, 'DB-B4', true), 'DB-R1', { points: { s13: 4 } });
    const plain = regroupElcbs(p, 'DB', { size: 6, keepApart: false, keepRcbos: true });
    expect(board(plain).elcbs).toBeUndefined();
    expect(ways(plain)).toEqual([[1, 2], [3, 4]]);
    expect(plain.feeders.find((f) => f.id === 'DB-B4')!.rcbo).toBe(true);
    expect(elcbGroups(plain, board(plain))[0].category).toBe('mixed');
    const apart = regroupElcbs(p, 'DB', { size: 6, keepApart: true, keepRcbos: false });
    expect(apart.feeders.some((f) => f.rcbo)).toBe(false);
    expect(elcbGroups(apart, board(apart)).map((g) => g.category)).toEqual(['lighting', 'lighting', 'power']);
    const pv = regroupPreview(p, 'DB', { size: 6, keepApart: true, keepRcbos: false });
    expect(pv.before).toEqual([3, 3, 6]);
    expect(pv.after).toEqual([6, 6, 6]);
    expect(pv.moved).toBeGreaterThan(0);
    expect(regroupPreview(p, 'DB', { size: 12, keepApart: false, keepRcbos: true })).toEqual({ before: [3, 3, 6], after: [12], moved: 0 });
  });

  it('Balance phases keeps every circuit and spare inside its own ELCB', () => {
    let p = db(12);
    p = updateCircuit(p, 'DB-R1', { points: { ltg: 30 } });
    p = updateCircuit(p, 'DB-R2', { points: { ltg: 25 } });
    p = resizeElcb(p, 'DB', 1, 3).project;
    p = { ...p, boards: p.boards.map((b) => (b.id === 'DB' ? { ...b, spareWays: [{ id: 'sp1', kind: 'spare', phase: 'R', way: 5, ratingA: 20 }] } : b)) };
    p = resizeElcb(p, 'DB', 3, 9).project; // ways 3–5, with the spare
    const before = groups(p).map((g) => g[1]);
    const blockOf = (q: Project, room: string) => before.findIndex((w) => (w as number[]).includes(scheduleCircuits(q, 'DB').find((f) => f.room === room)!.way!));
    const q = balanceInsideElcbs(p, 'DB');
    expect(groups(q).map((g) => g[1])).toEqual(before);
    for (let i = 1; i <= 12; i++) expect(blockOf(q, `Room ${i}`), `Room ${i}`).toBe(blockOf(p, `Room ${i}`));
    const sp = board(q).spareWays![0];
    expect(sp.way).toBeGreaterThanOrEqual(3);
    expect(sp.way).toBeLessThanOrEqual(5);
    const taken = scheduleCircuits(q, 'DB').map((f) => `${f.phase}${f.way}`);
    expect(new Set(taken).size).toBe(12);
    expect(taken).not.toContain(`${sp.phase}${sp.way}`);
    expect(scheduleCircuits(q, 'DB').every((f) => f.id === `DB-${f.phase}${f.way}`)).toBe(true);
  });
});

describe('keeping lighting and power apart', () => {
  /** Adds n 1-phase circuits in the next free ways: lighting (5 LTG) or power (2 sockets). */
  const add = (p: Project, n: number, kind: 'lighting' | 'power') => {
    for (let i = 0; i < n; i++) {
      const r = addCircuit(p, 'DB');
      p = updateCircuit(r.project, r.id, { points: kind === 'lighting' ? { ltg: 5 } : { s13: 2 } });
    }
    return p;
  };
  const cats = (p: Project) => elcbGroups(p, board(p)).map((g) => [g.ways, g.category]);

  it('once a DB\'s ELCBs are changed, new ways get ELCBs that never mix lighting and power', () => {
    let p = setNewElcbSize(db(12), 'DB', 6);
    expect(board(p).elcbKeepApart).toBe(true);
    p = add(add(p, 3, 'lighting'), 3, 'power');
    expect(cats(p)).toEqual([[[1, 2], 'lighting'], [[3, 4], 'lighting'], [[5], 'lighting'], [[6, 7], 'power']]);
    // Re-group without "keep apart" turns it off: the same new ways share one ELCB.
    let q = regroupElcbs(db(12), 'DB', { size: 6, keepApart: false, keepRcbos: true });
    expect(board(q).elcbKeepApart).toBe(false);
    q = add(add(q, 3, 'lighting'), 3, 'power');
    expect(cats(q)[cats(q).length - 1]).toEqual([[5, 6], 'mixed']);
  });

  it('an old DB keeps its ELCBs as they print today until one is changed', () => {
    const p = withElcbs(add(add(db(3), 3, 'power'), 3, 'lighting'), [{ id: 'h', fromWay: 1, toWay: 1 }]);
    expect(board(p).elcbKeepApart).toBeUndefined();
    expect(cats(p)).toEqual([[[1], 'lighting'], [[2, 3], 'mixed']]);
    expect(elcbGroups(p, board(p)).map((g) => g.ways)).toEqual(elcbSections(board(p), 3).map((s) => s.ways));
  });

  it('finds the one odd circuit of a mixed ELCB; an RCBO there leaves the ELCB with one kind', () => {
    let p = updateCircuit(db(6), 'DB-B2', { points: { s13: 2 } });
    const odd = oddElcbCircuits(elcbGroups(p, board(p)));
    expect([...odd.keys()]).toEqual(['DB-B2']);
    expect(odd.get('DB-B2')!.sensitivityMa).toBe(30);
    p = setRcbo(p, 'DB-B2', true);
    const g = elcbGroups(p, board(p))[0];
    expect([g.category, g.sensitivityMa]).toEqual(['lighting', 100]);
    expect(oddElcbCircuits(elcbGroups(p, board(p))).size).toBe(0);
    // One of each: the power circuit is offered; two of each: none; a 3-phase circuit never.
    const two = updateCircuit(db(2), 'DB-Y1', { points: { s13: 2 } });
    expect([...oddElcbCircuits(elcbGroups(two, board(two))).keys()]).toEqual(['DB-Y1']);
    const four = updateCircuit(updateCircuit(db(4), 'DB-Y1', { points: { s13: 2 } }), 'DB-R2', { points: { s13: 2 } });
    expect(oddElcbCircuits(elcbGroups(four, board(four))).size).toBe(0);
    let ryb = addCircuit(db(3), 'DB', 'RYB');
    ryb = { ...ryb, project: updateCircuit(ryb.project, ryb.id, { points: { s13: 3 } }) };
    // A 3-phase odd one is offered too: it gets a 4P RCBO.
    expect([...oddElcbCircuits(elcbGroups(ryb.project, board(ryb.project))).keys()]).toEqual([ryb.id]);
  });
});

describe('4P RCBO and No RCD', () => {
  it('a 4P RCBO is counted TP+N in the BOQ and prints 4P', () => {
    let p = addCircuit(db(3), 'DB', 'RYB').project;
    p = setRcbo(updateCircuit(p, 'DB-RYB2', { points: { s13: 3 } }), 'DB-RYB2', true);
    const lines = buildBom(p).filter((l) => /RCBO/.test(l.description));
    expect(lines.map((l) => l.description)).toEqual([expect.stringMatching(/^RCBO \d+ A, 30 mA, TP\+N/)]);
    expect(buildLoadScheduleHtml(p, 'DB')).toMatch(/RCBO-1<br>\d+ A 30 mA 4P/);
  });

  it('No RCD takes a circuit off its ELCB, with no earth leakage device, and prints the reason', () => {
    const p = db(6);
    expect(() => setNoRcd(p, 'INC', 'x')).toThrow();
    const q = setNoRcd(p, 'DB-B2', '  Fire alarm panel ');
    const f = q.feeders.find((x) => x.id === 'DB-B2')!;
    expect(f.noRcd).toBe('Fire alarm panel');
    expect(elcbGroups(q, board(q))[0].circuits.map((c) => c.id)).not.toContain('DB-B2');
    expect(rcdOf(q, f)).toBeUndefined();
    expect(rcdOf(p, p.feeders.find((x) => x.id === 'DB-B2')!)).toBe(100);
    expect(buildLoadScheduleHtml(q, 'DB')).toContain('No RCD<br>Fire alarm panel');
    const t = scheduleTable(q, 'DB');
    expect(t.rows.map((r) => r[2]).filter(Boolean).map((x) => String(x).split(' ')[0])).toEqual(['ELCB-1', 'No']);
    const elcbCol = buildDbSheet(q, 'DB').data.map((r) => String(r[1] ?? '')).filter(Boolean);
    expect(elcbCol).toContain('No RCD (Fire alarm panel)');
    // The BOQ and the enclosure count its MCB only, no RCBO.
    expect(buildBom(q).some((l) => /RCBO/.test(l.description))).toBe(false);
    expect(neededDevices(q, 'DB').filter((d) => d.kind === 'RCBO')).toHaveLength(0);
    // An RCBO replaces No RCD, and No RCD replaces an RCBO; no reason puts it back on the ELCB.
    const r = setRcbo(q, 'DB-B2', true);
    expect(r.feeders.find((x) => x.id === 'DB-B2')).toMatchObject({ rcbo: true });
    expect(r.feeders.find((x) => x.id === 'DB-B2')).not.toHaveProperty('noRcd');
    expect(setNoRcd(r, 'DB-B2', 'Smoke extract').feeders.find((x) => x.id === 'DB-B2')).not.toHaveProperty('rcbo');
    const back = setNoRcd(q, 'DB-B2');
    expect(elcbGroups(back, board(back))[0].circuits.map((c) => c.id)).toContain('DB-B2');
  });

  it('Re-group keeps No RCD circuits with the RCBOs, or clears them; an anonymised copy keeps the fact only', () => {
    const q = setNoRcd(db(6), 'DB-B2', 'Fire alarm panel');
    expect(regroupElcbs(q, 'DB', { size: 6, keepApart: false, keepRcbos: true }).feeders.find((x) => x.id === 'DB-B2')!.noRcd).toBe('Fire alarm panel');
    expect(regroupElcbs(q, 'DB', { size: 6, keepApart: false, keepRcbos: false }).feeders.find((x) => x.id === 'DB-B2')).not.toHaveProperty('noRcd');
    const anon = anonymizeProject(q).project;
    expect(anon.feeders.filter((x) => x.noRcd).map((x) => x.noRcd)).toEqual(['No RCD']);
  });
});

describe('earth leakage of circuits', () => {
  it('an Auto RCBO gets the setting for its type, a chosen mA stays, a circuit under a hand ELCB gets its mA', () => {
    let p = db(6);
    p = setRcbo(p, 'DB-R1', true);
    const get = (q: Project, id: string) => rcdOf(q, q.feeders.find((f) => f.id === id)!);
    expect(get(p, 'DB-R1')).toBe(100);
    p = setRcbo(p, 'DB-Y1', true, 30);
    expect(get(p, 'DB-Y1')).toBe(30);
    const h = addBoardElcb(p, 'DB', { fromWay: 2, toWay: 2, sensitivityMa: 300 }).project;
    expect(get(h, 'DB-R2')).toBe(300);
  });
});

describe('Balance phases with hand ELCBs', () => {
  it('without hand ELCBs the result is as before', () => {
    const p = db(9);
    const same = balancePhases(p, 'DB');
    expect(scheduleCircuits(same, 'DB').map((f) => f.id)).toEqual(scheduleCircuits(balancePhases(allAutomatic(p, 'DB'), 'DB'), 'DB').map((f) => f.id));
  });

  it('keeps circuits under a hand ELCB and fills the other ways, sections starting on automatic sections', () => {
    const p = addBoardElcb(db(15, { elcbGroupSize: 6 }), 'DB', { fromWay: 2, toWay: 2 }).project;
    const b = balancePhases(p, 'DB');
    const cs = scheduleCircuits(b, 'DB');
    expect(cs.filter((f) => f.way === 2).map((f) => f.id)).toEqual(['DB-R2', 'DB-Y2', 'DB-B2']);
    expect(new Set(cs.map((f) => `${f.phase}${f.way}`)).size).toBe(15);
    expect(Math.max(...cs.map((f) => f.way!))).toBe(5); // 12 others in ways 1, 3, 4, 5
  });

  it('a power section starts on the next automatic ELCB section of the ways that are left', () => {
    let p = db(7, { elcbGroupSize: 6 });
    p = addBoardElcb(p, 'DB', { fromWay: 2, toWay: 2 }).project;
    const r = addCircuit(p, 'DB', 'R', 9);
    p = updateCircuit(r.project, r.id, { points: { s13: 1 } });
    const power = scheduleCircuits(balancePhases(p, 'DB'), 'DB').find((f) => f.points?.s13);
    expect(power!.way).toBe(5); // 4 lighting circuits fill ways 1 and 3; the section [3, 4] ends, the next starts at way 5
  });

  it('a 3-phase circuit moves to a free way, never under the hand ELCB', () => {
    let p = db(3);
    p = addCircuit(p, 'DB', 'RYB').project;
    p = addBoardElcb(p, 'DB', { fromWay: 1, toWay: 1 }).project;
    const b = balancePhases(p, 'DB');
    expect(b.feeders.find((f) => f.id === 'DB-RYB3')).toBeUndefined();
    expect(scheduleCircuits(b, 'DB').filter((f) => f.phase === 'RYB').map((f) => f.way)).toEqual([2]);
    expect(scheduleCircuits(b, 'DB').filter((f) => f.way === 1)).toHaveLength(3);
  });
});

describe('BOQ and enclosure', () => {
  it('an RCBO replaces the MCB and no RCCB is counted for an all-RCBO section', () => {
    let p = db(3, { elcbGroupSize: 3 });
    for (const id of ['DB-R1', 'DB-Y1', 'DB-B1']) p = setRcbo(p, id, true, 30);
    const bom = buildBom(p).filter((i) => i.where.includes('DB'));
    expect(bom.filter((i) => i.key.startsWith('rcbo:30:SP+N:'))).toHaveLength(1);
    expect(bom.find((i) => i.key.startsWith('rcbo:'))!.qty).toBe(3);
    expect(bom.some((i) => i.key.startsWith('mcb:') && i.where.includes('DB'))).toBe(false);
    expect(bom.some((i) => i.key.startsWith('rccb:') || i.key.startsWith('rcd:'))).toBe(false);
  });

  it('a 3-pole hand ELCB is TP, 4-pole stays TP+N', () => {
    const p = addBoardElcb(db(6), 'DB', { fromWay: 1, toWay: 2, poles: 3 }).project;
    expect(buildBom(p).some((i) => /^rccb:\d+:TP:/.test(i.key))).toBe(true);
    const q = addBoardElcb(db(6), 'DB', { fromWay: 1, toWay: 2 }).project;
    expect(buildBom(q).some((i) => /^rccb:\d+:TP\+N:/.test(i.key))).toBe(true);
  });

  it('the enclosure counts RCBOs and a 3-pole RCCB', () => {
    let p = db(6);
    p = setRcbo(p, 'DB-R1', true);
    p = addBoardElcb(p, 'DB', { fromWay: 2, toWay: 2, poles: 3 }).project;
    const devices = neededDevices(p, 'DB', []);
    expect(devices.find((d) => d.kind === 'RCBO')?.count).toBe(1);
    expect(devices.some((d) => d.kind === 'RCCB' && d.poles === 3)).toBe(true);
  });
});

describe('schedule documents', () => {
  const sample = () => {
    let p = db(9, { elcbGroupSize: 6 });
    p = setRcbo(p, 'DB-Y1', true, 30);
    return addBoardElcb(p, 'DB', { fromWay: 3, toWay: 3 }).project;
  };

  it('elcbColumn: an RCBO in the middle splits its group into two cells', () => {
    const { entries } = loadScheduleRows(sample(), 'DB');
    const col = elcbColumn(entries);
    expect(col.map((c) => c && [c.span, c.group ? `E${c.group.index}` : c.rcbo ? `R${c.rcbo.index}` : '-'])).toEqual([
      [1, 'E1'], [1, 'R1'], [4, 'E1'], null, null, null, [3, 'E2'], null, null
    ].map((x) => x) as never);
  });

  it('the PDF has the RCBO cell, the table and the grid sheet merge it', () => {
    const p = sample();
    const html = buildLoadScheduleHtml(p, 'DB');
    expect(html).toContain('RCBO-1<br>');
    expect(html).toMatch(/rowspan="3">ELCB-2<br>/);
    const t = scheduleTable(p, 'DB');
    expect(t.rows.map((r) => r[2]).filter(Boolean).map((s) => s.split(' ')[0])).toEqual(['ELCB-1', 'RCBO-1', 'ELCB-1', 'ELCB-2']);
    const sheet = buildDbSheet(p, 'DB');
    const e = sheet.sheetCols.findIndex((c) => c.key === 'elcb');
    const labels = sheet.data.map((r) => String(r[e])).filter(Boolean);
    expect(labels.some((l) => l.startsWith('RCBO-1 '))).toBe(true);
    expect(Object.values(sheet.merges).some(([, span]) => span === 3)).toBe(true);
  });

  it('a DB with no ELCB size saved shows its ELCBs on the Excel sheet too (6 circuits, as on the schedule)', () => {
    const p = db(9);
    expect(board(p).elcbGroupSize).toBeUndefined();
    const elcbCol = buildDbSheet(p, 'DB').data.map((r) => r[1]).filter((c) => /^ELCB-/.test(String(c)));
    expect(elcbCol.map((c) => String(c).split(' ')[0])).toEqual(['ELCB-1', 'ELCB-2']);
  });

  it('with nothing placed by hand the printed forms are unchanged', () => {
    const p = db(9);
    expect(buildLoadScheduleHtml(allAutomatic(p, 'DB'), 'DB')).toBe(buildLoadScheduleHtml(p, 'DB'));
    expect(buildLoadScheduleHtml(p, 'DB')).not.toContain('RCBO');
  });
});
