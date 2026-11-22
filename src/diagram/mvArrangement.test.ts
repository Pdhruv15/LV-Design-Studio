import { describe, expect, it } from 'vitest';
import { newProject, type Board, type Project, type Rmu } from '../types';
import { sldLayout } from '../components/SystemDiagram';
import { partProject, WHOLE_NETWORK } from './mvShow';
import { MV_ROWS, mvGeometry, mvLeads, mvPlan, mvRingOn, mvSheetKey, offMvSide, onMvSide, sourceLabels, ssRank, substationTitle, txLabelReach, type MvGeom, type RmuItem } from './mvArrangement';

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

describe('a first board with no supply set', () => {
  const unset: Board = { id: 'MDB-U', name: 'MDB-U', kind: 'MDB', ratedCurrentA: 200 };
  it('is off the 11 kV side, listed after the transformer boards, and none is lost', () => {
    const p = project([unset, tx('MDB-1', { rmu: 'RMU-1' }), { id: 'MDB-A', name: 'MDB-A', kind: 'MDB', supply: { fedFrom: 'X' } }]);
    expect(onMvSide(unset)).toBe(false);
    expect(offMvSide(unset)).toBe(true);
    expect(onMvSide(tx('MDB-1'))).toBe(true);
    expect(mvPlan(p).order).toEqual(['MDB-1', 'MDB-U', 'MDB-A']);
    // Alone, it draws no ring.
    expect(mvRingOn(project([unset]))).toBe(false);
  });
  it('a board naming its RMU is a transformer board, not unset', () => {
    expect(onMvSide({ ...unset, rmu: 'RMU-1' })).toBe(true);
  });
  it('the grid source label says MV source when none is recorded', () => {
    expect(sourceLabels(undefined)[0].text).toBe('MV source');
  });
});

describe('RMUs that feed no transformer yet', () => {
  const tees = (g: ReturnType<typeof mvGeometry>, n: string) => g.rmus.find((m) => m.item.name === n)!;
  const finite = (g: ReturnType<typeof mvGeometry>) => [g.right, ...g.rmus.flatMap((m) => [m.x1, m.x2, m.inX, m.outX, m.textX, ...m.ways.map((w) => w.x)]), ...g.frames.flatMap((f) => [f.x1, f.x2]), ...g.runs.flatMap((r) => [...r.segs.flat(), r.head.x])];
  const out = (q: Project, ids: string[], xs: number[]) => mvGeometry(q, mvPlan(q), new Map(ids.map((id, i) => [id, xs[i]])), opts);

  it('make a ring of their own: all tee-offs spare, two without a configuration, none in the order of boards', () => {
    const p = project([], { rmus: [{ name: 'RMU-1', config: 'RRTT' }, { name: 'RMU-2' }, { name: 'RMU-3', config: 'RT' }] });
    expect(mvRingOn(p)).toBe(true);
    const plan = mvPlan(p);
    expect(plan.order).toEqual([]);
    expect(plan.rings).toHaveLength(1);
    expect((plan.rings[0].items as RmuItem[]).map((r) => [r.name, r.config, r.tees, r.ringWays])).toEqual([
      ['RMU-1', 'RRTT', [undefined, undefined], 2], ['RMU-2', undefined, [undefined, undefined], 2], ['RMU-3', 'RT', [undefined], 1]
    ]);
    expect(mvRingOn(project([tx('MDB-1')]))).toBe(false);
  });

  it('follow the ones with transformers inside their substation, by name; a name a board uses is not one of them', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-5' })],
      { rmus: [{ name: 'RMU-9', substation: 'SS-1' }, { name: 'RMU-2', substation: 'SS-1' }, { name: 'RMU-1' }, { name: 'RMU-5' }, { name: 'RMU-3' }] });
    const plan = mvPlan(p);
    expect(plan.rings[0].items.map(name)).toEqual(['RMU-1', 'RMU-2', 'RMU-9', 'RMU-5', 'RMU-3']);
    expect((plan.rings[0].items[1] as RmuItem).substation).toBe('SS-1');
    expect(plan.order).toEqual(['MDB-1', 'MDB-2']);
  });

  it('go on the ring of their grid source, as an RMU with a board does, whatever ring their substation is on', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' })], {
      gridSources: [{ id: 'A', name: 'A', kv: 11 }, { id: 'B', name: 'B', kv: 11 }],
      rmus: [{ name: 'RMU-1', sourceId: 'A' }, { name: 'RMU-2', sourceId: 'B' }, { name: 'RMU-3', sourceId: 'B', substation: 'SS-1' }]
    });
    expect(mvPlan(p).rings.map((r) => [r.source?.id, r.items.map(name)])).toEqual([['A', ['RMU-1']], ['B', ['RMU-2', 'RMU-3']]]);
  });

  it('are drawn with finite places, every tee-off SPARE, the ring through them and the grid source head', () => {
    const p = project([], { rmus: [{ name: 'RMU-1', config: 'RRTT', normallyOpen: 'R2', fuseA: 100, tOff: 'fuse' }, { name: 'RMU-2' }] });
    const g = out(p, [], []);
    expect(finite(g).every(Number.isFinite)).toBe(true);
    expect(g.rmus.map((m) => m.item.name)).toEqual(['RMU-1', 'RMU-2']);
    expect(g.rmus[0].ways.map((w) => w.kind)).toEqual(['ring', 'tee', 'tee', 'ring']);
    expect(g.rmus.flatMap((m) => m.ways.filter((w) => w.kind === 'tee').map((w) => w.boardId))).toEqual([undefined, undefined, undefined, undefined]);
    expect(g.rmus[0].nop).toBeDefined();
    expect(g.rmus[1].x1 - g.rmus[0].x2).toBeGreaterThan(19.4);
    expect(g.runs).toHaveLength(1);
    expect(g.runs[0].head.kind).toBe('source');
    expect(g.runs[0].head.x - 13).toBeGreaterThan(7.4);
    const run = g.runs[0];
    expect(run.segs[0]).toEqual([run.head.x + 11, g.rmus[0].inX]);
    expect(run.tail).toMatchObject({ kind: 'end' });
    expect(g.right).toBeGreaterThan(g.rmus[1].x2);
  });

  it('stand clear of the boxes, labels and frames round them, and the boards after them are moved to keep clear', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-3', substation: 'SS-2' }), tx('MDB-3', { rmu: 'RMU-5' })],
      { rmus: [{ name: 'RMU-1', config: 'RRTT' }, { name: 'RMU-2', config: 'RRTT', substation: 'SS-1' }, { name: 'RMU-3', config: 'RRT' }, { name: 'RMU-4', substation: 'SS-4' }, { name: 'RMU-6' }] });
    const plan = mvPlan(p);
    const roots = [{ id: 'MDB-1', x: 102 }, { id: 'MDB-2', x: 234 }, { id: 'MDB-3', x: 366 }];
    const lead = mvLeads(p, plan, roots, opts);
    let shift = 0;
    const moved = roots.map((r) => { shift += lead.get(r.id) ?? 0; return { ...r, x: r.x + shift }; });
    expect(lead.size).toBeGreaterThan(0);
    const g = out(p, moved.map((r) => r.id), moved.map((r) => r.x));
    expect(finite(g).every(Number.isFinite)).toBe(true);
    expect(g.rmus.map((m) => m.item.name)).toEqual(['RMU-1', 'RMU-2', 'RMU-3', 'RMU-5', 'RMU-4', 'RMU-6']);
    // Boxes, left to right, never overlap; frames keep their gap; nothing starts left of the margin.
    for (let i = 1; i < g.rmus.length; i++) expect(g.rmus[i].x1).toBeGreaterThan(g.rmus[i - 1].x2 + 13.4);
    expect(g.frames.map((f) => f.name)).toEqual(['SS-1', 'SS-2', 'SS-4']);
    for (let i = 1; i < g.frames.length; i++) expect(g.frames[i].x1 - g.frames[i - 1].x2).toBeGreaterThan(19.4);
    expect(g.frames[0].x1).toBeGreaterThan(7.4);
    // RMU-2 is inside SS-1's frame, after RMU-1 and its transformer's label.
    const ss1 = g.frames[0];
    expect(tees(g, 'RMU-2').x1).toBeGreaterThan(ss1.x1);
    expect(tees(g, 'RMU-2').x2).toBeLessThan(ss1.x2);
    expect(tees(g, 'RMU-2').x1).toBeGreaterThan(moved[0].x + 100);
    // The frame of a substation of such RMUs only has its box and title.
    expect(g.frames[2].x2 - g.frames[2].x1).toBeGreaterThan(tees(g, 'RMU-4').x2 - tees(g, 'RMU-4').x1);
    expect(mvLeads(p, plan, moved, opts).size).toBe(0);
  });

  it('start at the ring\'s left when nothing is drawn before them, and the board after them keeps clear', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-2' })], { rmus: [{ name: 'RMU-1' }, { name: 'RMU-2' }] });
    // RMU-1 is named by no board: it is first on the ring (records follow boards, so it comes last here).
    const plan = mvPlan(p);
    expect(plan.rings[0].items.map(name)).toEqual(['RMU-2', 'RMU-1']);
    const g = out(p, ['MDB-1'], [200]);
    expect(finite(g).every(Number.isFinite)).toBe(true);
    expect(g.rmus[1].x1).toBeGreaterThan(g.rmus[0].x2 + 19.4);
    // Alone in the project, with a board off the 11 kV side: the ring is placed above it at the left.
    const q = project([{ id: 'MDB-A', name: 'MDB-A', kind: 'MDB', supply: { fedFrom: 'X' } }], { rmus: [{ name: 'RMU-1' }] });
    const h = mvGeometry(q, mvPlan(q), new Map(), opts);
    expect(h.rmus[0].x1).toBeGreaterThan(40);
    expect(mvLeads(q, mvPlan(q), [{ id: 'MDB-A', x: 100 }], opts).get('MDB-A')).toBeGreaterThan(0);
  });

  it('on part of the network are a stub like any item drawn elsewhere, or left out', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1' }), tx('MDB-2', { rmu: 'RMU-3' })], { rmus: [{ name: 'RMU-1' }, { name: 'RMU-2' }, { name: 'RMU-3' }] });
    const g = out(p, ['MDB-1'], [200]);
    expect(g.rmus.map((m) => m.item.name)).toEqual(['RMU-1']);
    expect(g.runs[0].tail).toMatchObject({ kind: 'to', text: 'to RMU-3' });
    const only = project([tx('MDB-9')], { rmus: [{ name: 'RMU-1' }] });
    expect(mvGeometry(only, mvPlan(only), new Map(), opts).rmus).toEqual([]);
  });

  it('change a sheet\'s fingerprint, which is none where nothing is drawn', () => {
    const base = project([tx('MDB-1', { rmu: 'RMU-1' })], { rmus: [{ name: 'RMU-1', config: 'RRT' }] });
    const more: Project = { ...base, rmus: [...base.rmus!, { name: 'RMU-2', config: 'RRTT' }] };
    expect(JSON.stringify(mvSheetKey(more, more.boards))).not.toBe(JSON.stringify(mvSheetKey(base, base.boards)));
    expect(JSON.stringify(mvSheetKey({ ...more, rmus: [base.rmus![0], { name: 'RMU-2', config: 'RRT' }] }, more.boards))).not.toBe(JSON.stringify(mvSheetKey(more, more.boards)));
    // A sheet of only some main boards does not draw them.
    const two: Project = { ...more, boards: [...more.boards, tx('MDB-2')] };
    const part = (mvSheetKey(two, [two.boards[0]]) as unknown[][][])[1].map((r) => r[0]);
    expect(part).toEqual(['RMU-1']);
    expect(mvSheetKey(project([], { rmus: [{ name: 'RMU-1' }] }), [])).toBeDefined();
  });
});

describe('a project with no RMU feeding nothing', () => {
  it('keeps the places it had before (numbers taken from the version without spare RMUs)', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-2', substation: 'SS-1' }), tx('MDB-3', { rmu: 'RMU-3' }), tx('MDB-4', { substation: 'SS-2' }), tx('MDB-5', { rmu: 'RMU-4' })], {
      gridSources: [{ id: 'A', name: 'A', kv: 11 }, { id: 'B', name: 'B', kv: 11 }], substations: [{ name: 'SS-1' }, { name: 'SS-2' }] as Project['substations'],
      rmus: [{ name: 'RMU-1', config: 'RRTT', normallyOpen: 'R2' }, { name: 'RMU-3', config: 'RT' }, { name: 'RMU-4', sourceId: 'B' }] });
    const roots = [102, 234, 366, 498, 630].map((x, i) => ({ id: `MDB-${i + 1}`, x }));
    const lead = mvLeads(p, mvPlan(p), roots, opts);
    expect([...lead].map(([id, v]) => [id, Math.round(v * 10) / 10])).toEqual([['MDB-1', 32], ['MDB-2', 31.3], ['MDB-3', 84.1], ['MDB-5', 215]]);
    let shift = 0;
    const g = mvGeometry(p, mvPlan(p), new Map(roots.map((r) => { shift += lead.get(r.id) ?? 0; return [r.id, r.x + shift]; })), opts);
    const r1 = (n: number) => Math.round(n * 10) / 10;
    expect(g.rmus.map((m) => [m.item.name, r1(m.x1), r1(m.x2)])).toEqual([['RMU-1', 86, 235.3], ['RMU-2', 249.3, 345.3], ['RMU-3', 465.4, 539.7], ['RMU-4', 944.5, 1040.5]]);
    expect(g.frames.map((f) => [f.name, r1(f.x1), r1(f.x2)])).toEqual([['SS-1', 52, 445.4], ['SS-2', 563.4, 793.6]]);
    expect(r1(g.right)).toBe(1127.4);
  });
});

describe('11 kV side: nothing drawn lies on anything else', () => {
  type Rect = { what: string; owner?: string; ss?: string; x1: number; x2: number; y1: number; y2: number };
  const rects = (g: MvGeom, q: Project): Rect[] => {
    const out: Rect[] = [];
    const byId = new Map(q.boards.map((b) => [b.id, b]));
    for (const m of g.rmus) {
      out.push({ what: `RMU ${m.item.name}`, owner: m.item.name, ss: m.item.substation, x1: m.x1, x2: m.x2, y1: MV_ROWS.boxTop, y2: MV_ROWS.boxBottom });
      for (const [id, x] of m.txX) out.push({ what: `tx of ${id}`, owner: id, ss: m.item.substation, x1: x - 24, x2: x + txLabelReach(q, byId.get(id)!), y1: MV_ROWS.txTop, y2: g.frameBottom - 10 });
    }
    for (const t of g.taps) out.push({ what: `tap ${t.boardId}`, owner: t.boardId, ss: byId.get(t.boardId)?.substation?.trim() || undefined, x1: t.x - 24, x2: t.x + txLabelReach(q, byId.get(t.boardId)!), y1: MV_ROWS.txTop, y2: g.frameBottom - 10 });
    for (const r of g.runs) if (r.head.kind === 'source') out.push({ what: 'source head', x1: r.head.x - 13, x2: r.head.x + 11, y1: MV_ROWS.frameTop, y2: MV_ROWS.boxTop + 40 });
    return out;
  };
  /** Every pair of different items that intersect, every non-finite number, every ring piece running backwards. */
  const clashes = (q: Project, g: MvGeom): string[] => {
    const bad: string[] = [];
    const nums = [g.right, ...g.rmus.flatMap((m) => [m.x1, m.x2, m.inX, m.outX, m.textX, ...m.ways.map((w) => w.x)]), ...g.frames.flatMap((f) => [f.x1, f.x2]), ...g.runs.flatMap((r) => [...r.segs.flat(), r.head.x])];
    if (!nums.every(Number.isFinite)) bad.push('not finite');
    const rs = rects(g, q);
    const hit = (a: Rect, b: Rect) => Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 0.5 && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 0.5;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (hit(rs[i], rs[j])) bad.push(`${rs[i].what} / ${rs[j].what}`);
    const fr = g.frames.map((f): Rect => ({ what: `frame ${f.name}`, ss: f.name, x1: f.x1, x2: f.x2, y1: MV_ROWS.frameTop, y2: g.frameBottom }));
    for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) if (hit(fr[i], fr[j])) bad.push(`${fr[i].what} / ${fr[j].what}`);
    for (const f of fr) for (const r of rs) if (r.ss !== f.ss && hit(f, r)) bad.push(`${f.what} / ${r.what}`);
    for (const r of g.runs) for (let i = 0; i < r.segs.length; i++) if (!(r.segs[i][1] > r.segs[i][0]) || (i && r.segs[i][0] < r.segs[i - 1][1] - 0.5)) bad.push(`ring piece ${i} of ${r.source?.id}`);
    return bad;
  };
  /** The layout the drawing makes (whole network, or the MV overview) and what clashes in it. */
  const check = (p: Project, view: 'all' | 'mv' = 'all') => {
    const drawn = partProject(p, view === 'all' ? WHOLE_NETWORK : { kind: 'mv' });
    const { mvRing } = sldLayout(drawn, false, false, 0, undefined, false, p);
    return mvRing ? clashes(p, mvRing) : [];
  };
  const both = (p: Project) => { expect(check(p, 'all')).toEqual([]); expect(check(p, 'mv')).toEqual([]); };
  const src = [{ id: 'A', name: 'A', kv: 11 }, { id: 'B', name: 'B', kv: 11 }, { id: 'C', name: 'C', kv: 11 }];
  const db = (id: string): Board => ({ id, name: id, kind: 'DB', supply: { fedFrom: 'Source', ratingA: 100 } as Board['supply'] });

  it('rings of different grid sources stand side by side, a spare RMU alone on its ring included', () => {
    both(project([tx('MDB-1', { rmu: 'RMU-1' }), tx('MDB-2', { rmu: 'RMU-2' })], { gridSources: src.slice(0, 2), rmus: [{ name: 'RMU-1', sourceId: 'A' }, { name: 'RMU-2', sourceId: 'A' }, { name: 'RMU-9', config: 'RRT', sourceId: 'B' }] }));
    both(project([db('DB-1')], { gridSources: src.slice(0, 2), rmus: [{ name: 'RMU-1', sourceId: 'A' }, { name: 'RMU-2', sourceId: 'B' }] }));
    both(project([tx('MDB-1', { rmu: 'RMU-1' }), tx('MDB-2', { rmu: 'RMU-2', substation: 'SS-2' })], {
      gridSources: src.slice(0, 2), substations: [{ name: 'SS-1' }, { name: 'SS-2' }] as Project['substations'],
      rmus: [{ name: 'RMU-1', sourceId: 'A' }, { name: 'RMU-2', sourceId: 'B' }, { name: 'RMU-5', sourceId: 'B', substation: 'SS-1' }] }));
  });

  it('keeps the ring order when blocks share a place: spare RMUs of several substations after one board', () => {
    both(project([tx('MDB-0', { rmu: 'RMU-1' })], {
      substations: [{ name: 'SS-6' }, { name: 'SS-1' }, { name: 'SS-5' }] as Project['substations'],
      rmus: [{ name: 'RMU-1', config: 'RRTT', substation: 'SS-2' }, { name: 'RMU-7', substation: 'SS-6', normallyOpen: 'R1' }, { name: 'RMU-10', substation: 'SS-6', normallyOpen: 'R2' }, { name: 'RMU-3', config: 'RRT', substation: 'SS-1', normallyOpen: 'R2' }] }));
  });

  it('keeps a transformer and its label out of the frame of a spare RMU before it', () => {
    both(project([tx('MDB-0', { rmu: 'RMU-3', substation: 'SS-1' }), tx('MDB-1', { rmu: 'RMU-2' }), tx('MDB-2', { rmu: 'RMU-2' })], {
      substations: [{ name: 'SS-6' }, { name: 'SS-1' }] as Project['substations'],
      rmus: [{ name: 'RMU-8', config: 'RRT', substation: 'SS-6' }] }));
  });

  it('shows a substation\'s own spare RMU on its part, with no stub to it', () => {
    const p = project([tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-3', substation: 'SS-2' })], { rmus: [{ name: 'RMU-2', substation: 'SS-1' }] });
    const { mvRing } = sldLayout(partProject(p, { kind: 'substation', name: 'SS-1' }), false, false, 0, undefined, false, p, true);
    expect(mvRing!.rmus.map((m) => m.item.name)).toEqual(['RMU-1', 'RMU-2']);
    expect(mvRing!.runs.map((r) => r.tail?.text ?? '')).not.toContain('to RMU-2 · SS-1');
    expect(clashes(p, mvRing!)).toEqual([]);
  });

  it('holds for 400 generated projects, whole network and MV overview', () => {
    let s = 20261122;
    const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const cfgs = ['RT', 'RRT', 'RRTT', 'RRRT', 'RRTTT', undefined];
    const failed: string[] = [];
    for (let n = 0; n < 400; n++) {
      const sources = src.slice(0, 1 + Math.floor(rnd() * 3));
      const ssNames = ['SS-1', 'SS-2', 'SS-3', 'SS-4'].slice(0, Math.floor(rnd() * 5));
      const rmuNames = ['RMU-1', 'RMU-2', 'RMU-3', 'RMU-4', 'RMU-5', 'RMU-6'].slice(0, Math.floor(rnd() * 7));
      const recs = rmuNames.filter(() => rnd() < 0.8).map((name): Rmu => ({ name, config: pick(cfgs), sourceId: pick(sources).id, ...(rnd() < 0.5 && ssNames.length ? { substation: pick(ssNames) } : {}), ...(rnd() < 0.3 ? { normallyOpen: pick(['R1', 'R2'] as const) } : {}), ...(rnd() < 0.3 ? { fuseA: 100 } : {}) }));
      const boards: Board[] = [];
      for (let i = 0, k = Math.floor(rnd() * 6); i < k; i++) {
        const r = rnd();
        boards.push(r < 0.15 ? db(`DB-${i}`) : tx(`MDB-${i}`, { ...(rmuNames.length && r < 0.8 ? { rmu: pick(rmuNames) } : {}), ...(ssNames.length && rnd() < 0.4 ? { substation: pick(ssNames) } : {}) }));
      }
      if (!boards.length) boards.push(db('DB-X'));
      const p = project(boards, { gridSources: sources, rmus: recs, substations: ssNames.map((name) => ({ name })) as Project['substations'] });
      for (const view of ['all', 'mv'] as const) { const bad = check(p, view); if (bad.length) failed.push(`#${n} ${view}: ${bad[0]}`); }
    }
    expect(failed.slice(0, 8)).toEqual([]);
  });
});
