import { describe, expect, it } from 'vitest';
import { newProject, type Board, type Project } from '../types';
import { mvGeometry, mvLeads, mvPlan, mvRingOn, mvSheetKey, ssRank, substationTitle, type RmuItem } from './mvArrangement';

const tx = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, ...extra });
const project = (boards: Board[], extra: Partial<Project> = {}): Project => ({ ...newProject('MV'), voltageV: 400, boards, feeders: [], ...extra });
const opts = { earth: true };
const name = (i: { kind: string; name?: string; boardId?: string }) => (i.kind === 'rmu' ? i.name : i.boardId);

describe('11 kV ring plan', () => {
  it('is drawn once a main board names its RMU or substation', () => {
    expect(mvRingOn(project([tx('MDB-1')]))).toBe(false);
    expect(mvRingOn(project([tx('MDB-1', { rmu: 'RMU-1' })]))).toBe(true);
    expect(mvRingOn(project([tx('MDB-1', { substation: 'SS-1' })]))).toBe(true);
    // A blank name does not count, nor a name on a board fed from another.
    expect(mvRingOn(project([tx('MDB-1', { rmu: ' ' }), { id: 'DB-1', name: 'DB-1', kind: 'DB', upstreamId: 'MDB-1', rmu: 'RMU-1' }]))).toBe(false);
  });

  it('orders the main boards by substation, then RMU, in project order inside a group; authority supplies last', () => {
    const p = project([
      { id: 'MDB-A', name: 'MDB-A', kind: 'MDB', supply: { fedFrom: 'DEWA', ratingA: 200 } },
      tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }),
      tx('MDB-3', { rmu: 'RMU-2', substation: 'SS-2' }),
      tx('MDB-2', { rmu: 'RMU-1', substation: 'SS-1' }),
      tx('MDB-5', { rmu: 'RMU-4', substation: 'SS-2' }),
      tx('MDB-4', { rmu: 'RMU-3' }),
      tx('MDB-6', { substation: 'SS-1' })
    ]);
    const plan = mvPlan(p);
    expect(plan.order).toEqual(['MDB-1', 'MDB-2', 'MDB-6', 'MDB-3', 'MDB-5', 'MDB-4', 'MDB-A']);
    expect(plan.rings).toHaveLength(1);
    // A transformer with no RMU is teed off the ring inside its substation.
    expect(plan.rings[0].items.map(name)).toEqual(['RMU-1', 'MDB-6', 'RMU-2', 'RMU-4', 'RMU-3']);
  });

  it('draws every tee-off of the configuration: spares, and one for each transformer beyond it', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1' }), tx('MDB-2', { rmu: 'RMU-2' }), tx('MDB-3', { rmu: 'RMU-2' }), tx('MDB-4', { rmu: 'RMU-3' }), tx('MDB-5', { rmu: 'RMU-4' })],
      { rmus: [{ name: 'RMU-1', config: 'rrtt' }, { name: 'RMU-2', config: 'RRT' }, { name: 'RMU-4', config: 'RRRT' }] });
    const rmus = mvPlan(p).rings[0].items as RmuItem[];
    expect(rmus.map((r) => [r.name, r.config, r.tees, r.ringWays])).toEqual([
      ['RMU-1', 'RRTT', ['MDB-1', undefined], 2],
      ['RMU-2', 'RRT', ['MDB-2', 'MDB-3'], 2],
      ['RMU-3', undefined, ['MDB-4'], 2],
      ['RMU-4', 'RRRT', ['MDB-5'], 3]
    ]);
  });

  it('runs one ring per grid source, in the order of the sources', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1' }), tx('MDB-2', { rmu: 'RMU-2' }), tx('MDB-3', { rmu: 'RMU-3' })], {
      gridSources: [{ id: 'A', name: 'A', kv: 11 }, { id: 'B', name: 'B', kv: 11 }],
      rmus: [{ name: 'RMU-1', sourceId: 'B' }, { name: 'RMU-3', sourceId: 'A' }]
    });
    const plan = mvPlan(p);
    expect(plan.rings.map((r) => [r.source?.id, r.items.map(name)])).toEqual([['A', ['RMU-2', 'RMU-3']], ['B', ['RMU-1']]]);
    expect(plan.order).toEqual(['MDB-2', 'MDB-3', 'MDB-1']);
  });

  it('puts the substations in their records\' order (the Substations card); RMUs and transformers in none keep their places', () => {
    const boards = [tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-2' }), tx('MDB-3', { rmu: 'RMU-3', substation: 'SS-2' }), tx('MDB-4', { rmu: 'RMU-4', substation: 'SS-3' })];
    expect(mvPlan(project(boards)).rings[0].items.map(name)).toEqual(['RMU-1', 'RMU-2', 'RMU-3', 'RMU-4']);
    const recs = (...names: string[]) => names.map((n, i) => ({ id: `r${i}`, name: n, type: 'conventional' as const, transformers: 1 }));
    // SS-3, then ss-1 (a record matches whatever the case); SS-2 has none, so it comes after them; RMU-2 (in no substation) stays second.
    const p = project(boards, { substations: recs('SS-3', 'ss-1') });
    expect(mvPlan(p).rings[0].items.map(name)).toEqual(['RMU-4', 'RMU-2', 'RMU-1', 'RMU-3']);
    expect(mvPlan(p).order).toEqual(['MDB-4', 'MDB-2', 'MDB-1', 'MDB-3']);
    expect(ssRank(p)('SS-1')).toBe(1);
    expect(ssRank(p)('SS-2')).toBe(2);
  });

  it('puts an RMU in its first transformer\'s substation, else in the one its record names', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1' })], { rmus: [{ name: 'RMU-1', substation: 'SS-2' }] });
    expect((mvPlan(p).rings[0].items[0] as RmuItem).substation).toBe('SS-2');
    const q = project([tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' })], { rmus: [{ name: 'RMU-1', substation: 'SS-2' }] });
    expect((mvPlan(q).rings[0].items[0] as RmuItem).substation).toBe('SS-1');
  });

  it('keeps a normally open switch only on a unit with two ring switches', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1' }), tx('MDB-2', { rmu: 'RMU-2' }), tx('MDB-3', { rmu: 'RMU-3' })],
      { rmus: [{ name: 'RMU-1', config: 'RRT', normallyOpen: 'R2' }, { name: 'RMU-2', config: 'RT', normallyOpen: 'R1' }, { name: 'RMU-3', normallyOpen: 'R1' }] });
    expect((mvPlan(p).rings[0].items as RmuItem[]).map((r) => r.normallyOpen)).toEqual(['R2', undefined, 'R1']);
  });

  it('titles a substation frame with its DM-D-013 type and building', () => {
    const p = project([], { substations: [{ id: 'a', name: 'SS-1', type: 'pocket', transformers: 1, building: 'Villa cluster' }] });
    expect(substationTitle(p, 'ss-1')).toEqual({ name: 'ss-1', sub: 'Detached substation — POCKET type · Villa cluster' });
    expect(substationTitle(p, 'SS-2')).toEqual({ name: 'SS-2', sub: undefined });
  });
});

describe('11 kV ring geometry', () => {
  // Main boards one slot (132) apart: the frames and RMU boxes need more room than that.
  const tight = project([tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-2', substation: 'SS-1' }), tx('MDB-3', { rmu: 'RMU-3', substation: 'SS-2' })],
    { rmus: [{ name: 'RMU-1', config: 'RRTTT' }, { name: 'RMU-2', config: 'RRTTT' }, { name: 'RMU-3', config: 'RRT' }] });
  const at = (xs: number[]) => xs.map((x, i) => ({ id: `MDB-${i + 1}`, x }));

  it('adds room before main boards until the frames and RMUs keep apart', () => {
    const plan = mvPlan(tight);
    const roots = at([102, 234, 366]);
    const lead = mvLeads(tight, plan, roots, opts);
    expect(lead.size).toBeGreaterThan(0);
    // As the layout applies it: room before a board moves it and every board after it.
    let shift = 0;
    const moved = roots.map((r) => { shift += lead.get(r.id) ?? 0; return { ...r, x: r.x + shift }; });
    const g = mvGeometry(tight, plan, new Map(moved.map((r) => [r.id, r.x])), opts);
    expect(g.frames.map((f) => f.name)).toEqual(['SS-1', 'SS-2']);
    expect(g.frames[1].x1 - g.frames[0].x2).toBeGreaterThan(19.4);
    expect(g.rmus[1].x1 - g.rmus[0].x2).toBeGreaterThan(13.4);
    // The grid source and its labels stay on the drawing, left of the first frame.
    expect(g.runs[0].head.kind).toBe('source');
    expect(g.runs[0].head.x - 13).toBeGreaterThan(7.4);
    expect(mvLeads(tight, plan, moved, opts).size).toBe(0);
  });

  it('runs the ring into each RMU at its first ring switch and out at its last', () => {
    const g = mvGeometry(tight, mvPlan(tight), new Map(at([400, 900, 1400]).map((r) => [r.id, r.x])), opts);
    const [a, b, c] = g.rmus;
    const run = g.runs[0];
    expect(run.segs).toEqual([[run.head.x + 11, a.inX], [a.outX, b.inX], [b.outX, c.inX], [c.outX, run.tail!.x]]);
    expect(run.tail).toMatchObject({ kind: 'end', text: 'ring continues' });
    // RRTTT feeding one transformer: its first tee-off stands right over it, the other two are spares.
    expect(a.ways.map((w) => w.kind)).toEqual(['ring', 'tee', 'tee', 'tee', 'ring']);
    expect(a.ways[1].x).toBe(400);
    expect(a.ways.slice(2, 4).map((w) => w.boardId)).toEqual([undefined, undefined]);
  });

  it('stands a third ring switch next to the first, and the fuse rating beside the tee-off', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1' })], { rmus: [{ name: 'RMU-1', config: 'RRRT', tOff: 'fuse', fuseA: 63 }] });
    const r = mvGeometry(p, mvPlan(p), new Map([['MDB-1', 400]]), opts).rmus[0];
    expect(r.ways.map((w) => w.kind)).toEqual(['ring', 'ring-spare', 'tee', 'ring']);
    expect(r.ways[2]).toMatchObject({ x: 400, boardId: 'MDB-1' });
    expect(r.note).toEqual({ x: 407, lines: ['63 A'] });
  });

  it('ends the ring at an RT unit at its end; in the middle the ring runs on past it', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1' }), tx('MDB-2', { rmu: 'RMU-2' })], { rmus: [{ name: 'RMU-1', config: 'RT' }, { name: 'RMU-2', config: 'RT' }] });
    const g = mvGeometry(p, mvPlan(p), new Map([['MDB-1', 400], ['MDB-2', 900]]), opts);
    expect(g.rmus.map((r) => r.inX === r.outX)).toEqual([true, true]);
    expect(g.runs[0].tail).toBeUndefined();
    expect(g.runs[0].dots).toEqual([g.rmus[0].inX]);
  });

  it('on part of the network, draws stubs to the tee-offs and the ring drawn elsewhere', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-3', { rmu: 'RMU-2', substation: 'SS-2' }), tx('MDB-4', { rmu: 'RMU-3', substation: 'SS-3' })],
      { rmus: [{ name: 'RMU-1', config: 'RRTT' }] });
    // MDB-2 and MDB-3 drawn: RMU-1's first tee-off, and the ring after RMU-2, are elsewhere.
    const g = mvGeometry(p, mvPlan(p), new Map([['MDB-2', 600], ['MDB-3', 1200]]), opts);
    expect(g.rmus[0].stubs).toEqual([{ x: expect.any(Number), dir: -1, text: 'to TX-1 · MDB-1' }]);
    expect(g.runs).toHaveLength(1);
    expect(g.runs[0].head.kind).toBe('source');
    expect(g.runs[0].tail).toMatchObject({ kind: 'to', text: 'to RMU-3 · SS-3' });
    // MDB-3 alone: the ring comes in from RMU-1.
    const h = mvGeometry(p, mvPlan(p), new Map([['MDB-3', 600]]), opts);
    expect(h.runs[0].head).toMatchObject({ kind: 'from', text: 'from RMU-1 · SS-1' });
  });

  it('writes N/O beside the normally open ring switch, away from the other ways, and widens the box to take it', () => {
    const p = (way?: 'R1' | 'R2') => project([tx('MDB-1', { rmu: 'RMU-1' })], { rmus: [{ name: 'RMU-1', config: 'RRT', ...(way ? { normallyOpen: way } : {}) }] });
    const rmu = (way?: 'R1' | 'R2') => mvGeometry(p(way), mvPlan(p(way)), new Map([['MDB-1', 400]]), opts).rmus[0];
    const plain = rmu(), r2 = rmu('R2'), r1 = rmu('R1');
    expect(plain.nop).toBeUndefined();
    expect(r2.nop).toEqual({ x: r2.ways[2].x + 10, anchor: 'start' });
    expect([r2.x1, r2.x2 > plain.x2]).toEqual([plain.x1, true]);
    expect(r1.nop).toEqual({ x: r1.ways[0].x - 10, anchor: 'end' });
    expect([r1.x1 < plain.x1, r1.x2]).toEqual([true, plain.x2]);
    expect(r1.ways.map((w) => w.x)).toEqual(plain.ways.map((w) => w.x));
  });

  it('a sheet\'s fingerprint takes in the normally open switch only where one is entered', () => {
    const base = project([tx('MDB-1', { rmu: 'RMU-1' })], { rmus: [{ name: 'RMU-1', config: 'RRT' }] });
    const open: Project = { ...base, rmus: [{ name: 'RMU-1', config: 'RRT', normallyOpen: 'R2' }] };
    const rmuKey = (q: Project) => (mvSheetKey(q, q.boards) as unknown[][][])[1][0];
    expect(rmuKey(base)).toEqual(['RMU-1', 'RRT', 2, null, null, ['MDB-1'], []]);
    expect(rmuKey(open)).toEqual(['RMU-1', 'RRT', 2, null, null, ['MDB-1'], [], 'R2']);
  });
});
