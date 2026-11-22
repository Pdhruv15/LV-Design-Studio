import { describe, expect, it } from 'vitest';
import { newProject, type Board, type Feeder, type Project } from '../types';
import { parsePart, partBoards, partInfo, partKey, partMains, partOfBoard, partProject, partSteps, shownPart, showRows, supplyTree, treeGroups, validPart, WHOLE_NETWORK, type SldPart, type TreeItem } from './mvShow';

const tx = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, ...extra });
const db = (id: string, up: string): Board => ({ id, name: id, kind: 'DB', upstreamId: up });
const load = (id: string, boardId: string, feedsBoardId?: string) => ({ id, boardId, name: id, feedsBoardId }) as unknown as Feeder;
/** Two substations (SS-1 with RMU-1 → TX-1, TX-2 and a bus coupler; SS-2 with RMU-2 → TX-3 and a spare tee-off), RMU-3
 * in no substation, TX-5 teed straight off the ring, and a meter cabinet. */
const p: Project = {
  ...newProject('Show'), voltageV: 400,
  boards: [
    { id: 'MDB-A', name: 'MDB-A', kind: 'MDB', supply: { fedFrom: 'DEWA', ratingA: 200 } },
    tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-1', substation: 'SS-1' }),
    tx('MDB-3', { rmu: 'RMU-2', substation: 'SS-2', sourceKva: 1500 }), tx('MDB-4', { rmu: 'RMU-3' }), tx('MDB-5'),
    db('SMDB-1', 'MDB-1'), db('DB-1', 'SMDB-1'), db('DB-2', 'MDB-2'), db('DB-A', 'MDB-A'), db('DB-3', 'MDB-3')
  ],
  feeders: [load('F-1', 'MDB-1', 'SMDB-1'), load('F-2', 'SMDB-1', 'DB-1'), load('F-3', 'DB-1'), load('F-4', 'MDB-2', 'DB-2'), load('F-5', 'MDB-3', 'DB-3'), load('F-6', 'MDB-A', 'DB-A')],
  rmus: [{ name: 'RMU-1', config: 'RRTT' }, { name: 'RMU-2', config: 'RRTT' }],
  substations: [{ id: 's1', name: 'SS-1', type: 'conventional', transformers: 2, building: 'Ground floor' }],
  ties: [{ id: 'BC-1', a: 'MDB-1', b: 'MDB-2', ratingA: 2500 }]
};
const ss1: SldPart = { kind: 'substation', name: 'SS-1' };

describe('Show: the parts of the network', () => {
  it('names a part as one string and reads it back', () => {
    const parts: SldPart[] = [WHOLE_NETWORK, { kind: 'mv' }, ss1, { kind: 'rmu', name: 'RMU:1' }, { kind: 'tx', id: 'MDB-1' }, { kind: 'supply', id: 'MDB-A' }];
    for (const x of parts) expect(parsePart(partKey(x))).toEqual(x);
    expect(parsePart('ss:')).toBeUndefined();
    expect(parsePart('nope')).toBeUndefined();
  });

  it('lists the supply tree in ring order, each row with what it holds; the meter cabinet after it', () => {
    const rows = showRows(p, ss1, 'DB-1');
    expect(rows.map((r) => [r.label, r.depth, r.detail ?? '', r.note ?? ''])).toEqual([
      ['Whole network', 0, '', '5 transformers · 11 boards'],
      ['MV overview', 0, '', '2 substations · 5 transformers'],
      ['Substations, RMUs and transformers', 0, '', ''],
      ['SS-1', 0, 'Conventional substation · Ground floor', '2 TX · 5 boards'],
      ['RMU-1', 1, 'RRTT', ''],
      ['TX-1', 2, '1000 kVA → MDB-1', '3 boards'],
      ['TX-2', 2, '1000 kVA → MDB-2', '2 boards'],
      ['SS-2', 0, '', '1 TX · 2 boards'],
      ['RMU-2', 1, 'RRTT · 1 tee-off spare', ''],
      ['TX-3', 2, '1500 kVA → MDB-3', '2 boards'],
      ['RMU-3', 0, '', ''],
      ['TX-4', 1, '1000 kVA → MDB-4', '1 board'],
      ['TX-5', 0, '1000 kVA → MDB-5', '1 board'],
      ['LV source', 0, '', ''],
      ['MDB-A', 1, 'meter cabinet 200 A', '2 boards'],
      ['Selection\'s substation', 0, '', 'SS-1']
    ]);
    expect(rows.filter((r) => r.checked).map((r) => r.label)).toEqual(['SS-1']);
    expect(rows.filter((r) => r.head).map((r) => r.label)).toEqual(['Substations, RMUs and transformers', 'LV source']);
    expect(rows.find((r) => r.key === 'sel')?.part).toBe('ss:SS-1');
    // Nothing selected: the last row cannot be picked.
    expect(showRows(p, WHOLE_NETWORK).find((r) => r.key === 'sel')).toMatchObject({ disabled: true, part: undefined });
  });

  it('heads the list "Transformers" when no RMU or substation is named', () => {
    const plain: Project = { ...p, rmus: undefined, boards: p.boards.map((b) => ({ ...b, rmu: undefined, substation: undefined })) };
    expect(showRows(plain, WHOLE_NETWORK).map((r) => r.label).slice(2, 8)).toEqual(['Transformers', 'TX-1', 'TX-2', 'TX-3', 'TX-4', 'TX-5']);
  });

  it('draws a part as its boards, their loads and the couplers between them', () => {
    const s = partProject(p, ss1);
    expect(s.boards.map((b) => b.id)).toEqual(['MDB-1', 'MDB-2', 'SMDB-1', 'DB-1', 'DB-2']);
    expect(s.feeders.map((f) => f.id)).toEqual(['F-1', 'F-2', 'F-3', 'F-4']);
    expect(s.ties?.map((t) => t.id)).toEqual(['BC-1']);
    // One transformer: the coupler to the other is not drawn (the SLD makes it a stub).
    const one = partProject(p, { kind: 'tx', id: 'MDB-2' });
    expect(one.boards.map((b) => b.id)).toEqual(['MDB-2', 'DB-2']);
    expect(one.ties).toEqual([]);
    expect(partProject(p, WHOLE_NETWORK)).toBe(p);
    // The rest of the project (RMU records, substations) stays for the ring and the titles.
    expect(one.rmus).toBe(p.rmus);
  });

  it('draws the MV overview as the main boards alone: no ways, spares or earth pits', () => {
    const mv = partProject(p, { kind: 'mv' });
    expect(mv.boards.map((b) => b.id)).toEqual(['MDB-A', 'MDB-1', 'MDB-2', 'MDB-3', 'MDB-4', 'MDB-5']);
    expect(mv.feeders).toEqual([]);
    expect(mv.ties).toEqual([]);
    expect(mv.boards.every((b) => b.earthing?.show === false && !b.spareWays)).toBe(true);
    expect([...partBoards(p, { kind: 'mv' })]).toEqual(['MDB-A', 'MDB-1', 'MDB-2', 'MDB-3', 'MDB-4', 'MDB-5']);
  });

  it('finds the part of a board: its substation, else its RMU, else its transformer or LV source', () => {
    expect(partOfBoard(p, 'DB-1')).toEqual(ss1);
    expect(partOfBoard(p, 'DB-A')).toEqual({ kind: 'supply', id: 'MDB-A' });
    expect(partOfBoard(p, 'MDB-4')).toEqual({ kind: 'rmu', name: 'RMU-3' });
    expect(partOfBoard(p, 'MDB-5')).toEqual({ kind: 'tx', id: 'MDB-5' });
    expect(partOfBoard(p, 'nope')).toEqual(WHOLE_NETWORK);
  });

  it('shows the part chosen, or the part of a board selected outside it since (decision 4)', () => {
    const ss2: SldPart = { kind: 'substation', name: 'SS-2' };
    // Chosen while DB-1 (in SS-1) was selected: SS-2 stays until the selection moves.
    expect(shownPart(p, ss2, 'DB-1', 'DB-1')).toEqual(ss2);
    expect(shownPart(p, ss2, 'DB-1', 'DB-2')).toEqual(ss1);
    expect(shownPart(p, ss2, 'DB-1', 'DB-3')).toEqual(ss2);
    // The MV overview keeps a main board, not a board under one.
    expect(shownPart(p, { kind: 'mv' }, undefined, 'MDB-3')).toEqual({ kind: 'mv' });
    expect(shownPart(p, { kind: 'mv' }, undefined, 'DB-3')).toEqual(ss2);
    // A part that has gone (renamed, deleted) is the whole network.
    expect(shownPart(p, { kind: 'rmu', name: 'RMU-9' }, undefined, undefined)).toEqual(WHOLE_NETWORK);
  });

  it('names the part on the chip, and steps to the previous and next of the same kind', () => {
    expect(partInfo(p, ss1)).toEqual({ name: 'SS-1', detail: 'Conventional substation · Ground floor', counts: '2 transformers · 5 boards' });
    expect(partInfo(p, { kind: 'rmu', name: 'RMU-1' })).toEqual({ name: 'RMU-1', detail: 'RRTT · SS-1', counts: '2 transformers · 5 boards' });
    expect(partInfo(p, { kind: 'tx', id: 'MDB-2' })).toEqual({ name: 'TX-2', detail: '1000 kVA · SS-1 / RMU-1', counts: '2 boards' });
    expect(partInfo(p, { kind: 'supply', id: 'MDB-A' })).toEqual({ name: 'MDB-A', detail: 'meter cabinet 200 A', counts: '2 boards' });
    // A source that is not a utility, or a board-fed supply, has no meter cabinet: the row says what the drawing says.
    const withSupply = (supply: Board['supply']): Project => ({ ...p, boards: p.boards.map((b) => (b.id === 'MDB-A' ? { ...b, supply } : b)) });
    expect(partInfo(withSupply({ kind: 'generator', ratingA: 400 }), { kind: 'supply', id: 'MDB-A' }).detail).toBe('Source 400 A');
    expect(partInfo(withSupply({ fedBy: 'board', fedFrom: 'SMDB-3F' }), { kind: 'supply', id: 'MDB-A' }).detail).toBe('From SMDB-3F');
    expect(partInfo(p, { kind: 'mv' })).toEqual({ name: 'MV overview', counts: '2 substations · 5 transformers' });
    expect(partSteps(p, ss1)).toEqual({ prev: undefined, next: { kind: 'substation', name: 'SS-2' } });
    expect(partSteps(p, { kind: 'tx', id: 'MDB-3' })).toEqual({ prev: { kind: 'tx', id: 'MDB-2' }, next: { kind: 'tx', id: 'MDB-4' } });
    expect(partSteps(p, { kind: 'rmu', name: 'RMU-3' })).toEqual({ prev: { kind: 'rmu', name: 'RMU-2' }, next: undefined });
    expect(partSteps(p, { kind: 'mv' })).toEqual({});
  });
});

/** A group as [label, detail, note, items]; a main board as its id. */
const shape = (it: TreeItem): unknown => (typeof it === 'string' ? it : [it.label, it.detail ?? '', it.note ?? '', it.items.map(shape)]);

describe('Panel tree by substation', () => {
  it('groups the main boards by substation, then RMU; the rest under No substation, meter cabinets under LV source', () => {
    const g = treeGroups(p)!;
    expect(g.map(shape)).toEqual([
      ['SS-1', '', '2 TX · 5 boards', [['RMU-1', 'RRTT', '', ['MDB-1', 'MDB-2']]]],
      ['SS-2', '', '1 TX · 2 boards', [['RMU-2', 'RRTT', '', ['MDB-3']]]],
      ['No substation', '', '2 TX · 2 boards', [['RMU-3', '', '', ['MDB-4']], 'MDB-5']],
      ['LV source', '', '2 boards', ['MDB-A']]
    ]);
    // A substation or an RMU row shows that part; the others only group.
    const [ss1, , none, supply] = g as Exclude<TreeItem, string>[];
    expect([ss1.part, (ss1.items[0] as Exclude<TreeItem, string>).part, none.part, supply.part]).toEqual(['ss:SS-1', 'rmu:RMU-1', undefined, undefined]);
    // The tooltips say what each is and holds.
    expect(ss1.title).toBe('SS-1 · Conventional substation · Ground floor · 2 transformers · 5 boards');
    expect((g[1] as Exclude<TreeItem, string>).items.map((x) => (x as Exclude<TreeItem, string>).title)).toEqual(['RMU-2 · RRTT · 1 tee-off spare · 1 transformer · 2 boards']);
    expect([none.title, supply.title]).toEqual(['In no substation · 2 transformers · 2 boards', '1 main board on an LV source or with no supply set · 2 boards']);
  });

  it('has nothing to group until a main board names an RMU or a substation', () => {
    expect(treeGroups({ ...p, rmus: undefined, boards: p.boards.map((b) => ({ ...b, rmu: undefined, substation: undefined })) })).toBeUndefined();
  });

  it('with RMUs but no substation named, puts the RMUs at the top; a board whose upstream board is gone joins the rest', () => {
    const rmusOnly: Project = { ...p, boards: [...p.boards.map((b) => ({ ...b, substation: undefined })), db('DB-9', 'GONE')] };
    expect(treeGroups(rmusOnly)!.map(shape)).toEqual([
      ['RMU-1', 'RRTT', '', ['MDB-1', 'MDB-2']], ['RMU-2', 'RRTT', '', ['MDB-3']], ['RMU-3', '', '', ['MDB-4']], 'MDB-5', 'DB-9',
      ['LV source', '', '2 boards', ['MDB-A']]
    ]);
    const orphan: Project = { ...p, boards: [...p.boards, db('DB-9', 'GONE')] };
    expect(shape(treeGroups(orphan)![2])).toEqual(['No substation', '', '2 TX · 3 boards', [['RMU-3', '', '', ['MDB-4']], 'MDB-5', 'DB-9']]);
  });
});

describe('an RMU that feeds nothing yet', () => {
  // RMU-9 (RRT, record only, in SS-9) and RMU-10 (no configuration, no substation) join the sample's tree.
  const q: Project = { ...p, rmus: [...p.rmus!, { name: 'RMU-9', config: 'RRT', substation: 'SS-9' }, { name: 'RMU-10' }] };
  const rmu9: SldPart = { kind: 'rmu', name: 'RMU-9' };

  it('is a node of the supply tree with no children, in its substation', () => {
    const tree = supplyTree(q);
    const ss9 = tree.find((n) => partKey(n.part) === 'ss:SS-9')!;
    expect(ss9.children.map((n) => [partKey(n.part), n.children.length])).toEqual([['rmu:RMU-9', 0]]);
    expect(tree.map((n) => partKey(n.part))).toContain('rmu:RMU-10');
    // Nothing to show: the part falls back to the whole network.
    expect(partMains(q, rmu9)).toEqual([]);
    expect(validPart(q, rmu9)).toEqual(WHOLE_NETWORK);
    expect(validPart(q, { kind: 'substation', name: 'SS-9' })).toEqual(WHOLE_NETWORK);
  });

  it('counts none and takes its substation from the record', () => {
    expect(partInfo(q, rmu9)).toEqual({ name: 'RMU-9', detail: 'RRT · SS-9', counts: '0 transformers · 0 boards' });
    expect(partInfo(q, { kind: 'rmu', name: 'RMU-10' })).toEqual({ name: 'RMU-10', detail: undefined, counts: '0 transformers · 0 boards' });
  });

  it('is not offered by Show, nor stepped to, and the MV overview stays enabled', () => {
    const rows = showRows(q, WHOLE_NETWORK);
    expect(rows.find((r) => r.key === 'rmu:RMU-9')).toMatchObject({ disabled: true, detail: 'RRT · 1 tee-off spare' });
    expect(rows.find((r) => r.key === 'ss:SS-9')).toMatchObject({ disabled: true });
    expect(rows.find((r) => r.key === 'rmu:RMU-1')?.disabled).toBeUndefined();
    expect(rows.find((r) => r.key === 'mv')?.disabled).toBeFalsy();
    const only: Project = { ...q, boards: [{ id: 'MDB-A', name: 'MDB-A', kind: 'MDB', supply: { fedFrom: 'Source', ratingA: 200 } }], feeders: [], ties: [] };
    expect(showRows(only, WHOLE_NETWORK).find((r) => r.key === 'mv')?.disabled).toBeFalsy();
    expect(partSteps(q, { kind: 'rmu', name: 'RMU-3' }).next).toBeUndefined();
    expect(partSteps(q, { kind: 'rmu', name: 'RMU-2' })).toEqual({ prev: { kind: 'rmu', name: 'RMU-1' }, next: { kind: 'rmu', name: 'RMU-3' } });
    expect(partSteps(q, { kind: 'substation', name: 'SS-2' }).next).toBeUndefined();
  });

  it('is a group of the panel tree with nothing to show', () => {
    const g = treeGroups(q)!;
    const ss9 = g.find((x) => typeof x !== 'string' && x.key === 'ss:SS-9') as Exclude<TreeItem, string>;
    expect(ss9).toMatchObject({ part: undefined, note: '0 TX · 0 boards', items: [{ key: 'rmu:RMU-9', part: undefined, detail: 'RRT', title: 'RMU-9 · RRT · 1 tee-off spare · 0 transformers · 0 boards' }] });
  });
});
