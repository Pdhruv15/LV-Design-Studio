import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { buildMdSheet } from '../docs/mdSheet';
import { addOutgoingFeeder, deleteOutgoingFeeder, duplicateOutgoingFeeder, feederDeleteBlock } from './mdFeeders';
import { scheduleCircuits } from '../calc/loadSchedule';

const p = sampleProject;
const root = p.boards.find((b) => !b.upstreamId)!;
const toBoard = p.feeders.find((f) => f.boardId === root.id && f.feedsBoardId)!;

describe('outgoing feeders from the connected load / MD form', () => {
  it('adds a sized general-load feeder at the end of the panel', () => {
    const r = addOutgoingFeeder(p, root.id);
    const f = r.project.feeders.find((x) => x.id === r.id)!;
    expect(f.boardId).toBe(root.id);
    expect(f.feedsBoardId).toBeUndefined();
    expect(f.phase).toBeUndefined(); // not a DB schedule circuit
    expect(f.breakerRatingA).toBeGreaterThan(0);
    expect(r.project.feeders).toHaveLength(p.feeders.length + 1);
    const rows = buildMdSheet(r.project, root.id).rows;
    const last = rows[rows.length - 2];
    expect(last.type === 'feeder' && last.feeder.id).toBe(r.id);
  });

  it('numbers repeated adds uniquely', () => {
    const a = addOutgoingFeeder(p, root.id);
    const b = addOutgoingFeeder(a.project, root.id);
    expect(b.id).not.toBe(a.id);
  });

  it('leaves the project alone for an unknown board', () => {
    expect(addOutgoingFeeder(p, 'NOPE').project).toBe(p);
  });

  it('deletes an equipment feeder', () => {
    const { project: q, id } = addOutgoingFeeder(p, root.id);
    const r = deleteOutgoingFeeder(q, id!);
    expect(r.project.feeders.some((f) => f.id === id)).toBe(false);
    expect(r.message).toMatch(/Deleted/);
  });

  it('refuses to delete a feeder that supplies a panel', () => {
    expect(feederDeleteBlock(p, toBoard.id)).toMatch(new RegExp(`supplies ${toBoard.feedsBoardId}`));
    const r = deleteOutgoingFeeder(p, toBoard.id);
    expect(r.project).toBe(p);
    expect(r.message).toMatch(/no supply/);
  });

  it('allows deleting a feeder whose panel is already gone', () => {
    const q = { ...p, feeders: [...p.feeders, { ...toBoard, id: 'X-OLD', feedsBoardId: 'GONE' }] };
    expect(feederDeleteBlock(q, 'X-OLD')).toBeUndefined();
    expect(deleteOutgoingFeeder(q, 'X-OLD').project.feeders.some((f) => f.id === 'X-OLD')).toBe(false);
  });
});

describe('duplicating an outgoing feeder', () => {
  const marked = (() => {
    const { project: q, id } = addOutgoingFeeder(p, root.id);
    return { id: id!, project: { ...q, feeders: q.feeders.map((f) => (f.id === id ? { ...f, name: 'Pump', loadKw: 12, uid: 'u-1', trayRoute: 'A-B', cadVerticalM: 3, lengthToCheck: true, elvLoad: 'x#1' } : f)) } };
  })();

  it('copies an equipment feeder to the end of its panel with a new id and none of the links', () => {
    const r = duplicateOutgoingFeeder(marked.project, marked.id);
    expect(r.id).toBeDefined();
    expect(r.id).not.toBe(marked.id);
    expect(r.message).toBe(`Added ${r.id} as a copy of ${marked.id}`);
    expect(r.project.feeders).toHaveLength(marked.project.feeders.length + 1);
    const copy = r.project.feeders.find((f) => f.id === r.id)!;
    expect(copy).toMatchObject({ boardId: root.id, name: 'Pump', loadKw: 12 });
    expect(copy.uid).toBeUndefined();
    for (const k of ['trayRoute', 'cadVerticalM', 'lengthToCheck', 'elvLoad', 'feedsBoardId'] as const) expect(copy[k], k).toBeUndefined();
    const rows = buildMdSheet(r.project, root.id).rows;
    const lastRow = rows[rows.length - 2];
    expect(lastRow.type === 'feeder' && lastRow.feeder.id).toBe(r.id);
  });

  it('refuses a feeder to a panel, a DB circuit and a missing feeder', () => {
    const toPanel = duplicateOutgoingFeeder(p, toBoard.id);
    expect(toPanel.project).toBe(p);
    expect(toPanel.message).toMatch(new RegExp(`supplies ${toBoard.feedsBoardId}`));
    const circuit = scheduleCircuits(p, 'DB-GF1')[0];
    const c = duplicateOutgoingFeeder(p, circuit.id);
    expect(c.project).toBe(p);
    expect(c.message).toMatch(/load schedule/);
    const gone = duplicateOutgoingFeeder(p, 'NOPE');
    expect(gone.project).toBe(p);
    expect(gone.message).toMatch(/no longer/);
  });
});
