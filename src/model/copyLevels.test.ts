import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Board, Feeder, Project } from '../types';
import { placeAccessory, placeLvPoint } from './cadDevices';
import { boardChoices, boardsToMap, copyLvToLevels, defaultBoard, type CopyTarget } from './copyLevels';

const tplB = sampleProject.boards[0];
const tplF = sampleProject.feeders.find((f) => !f.feedsBoardId && !f.generation)!;
const board = (id: string, level: string, index?: number): Board => ({ ...tplB, id, name: id, level: { building: 'B', level, ...(index ? { index } : {}) } });
const way = (boardId: string, n: number, points: Feeder['points'] = {}): Feeder => ({ ...tplF, id: `${boardId}-${n}`, boardId, phase: 'R', way: n, name: `Way ${n}`, points, feedsBoardId: undefined, generation: undefined });
const F1 = { building: 'B', level: 'L1' }, F2 = { building: 'B', level: 'L2' }, F3 = { building: 'B', level: 'L3' };

// L1: DB-1A, DB-1B; L2 (a typical level, two floors): DB-2A, DB-2B on floor 1 and DB-2C on floor 2; L3: DB-3A only (way 2 missing).
const base = (): Project => ({
  ...sampleProject, lvPoints: undefined, cadAccessories: undefined, lvPointSeq: undefined, cadAccessorySeq: undefined,
  boards: [board('DB-1A', 'L1'), board('DB-1B', 'L1'), board('DB-2A', 'L2'), board('DB-2B', 'L2'), board('DB-2C', 'L2', 1), board('DB-3A', 'L3')],
  feeders: [way('DB-1A', 1), way('DB-1A', 2), way('DB-1B', 1), way('DB-2A', 1), way('DB-2A', 2), way('DB-2B', 1), way('DB-2C', 1), way('DB-3A', 1)]
});
const count = (p: Project, id: string, type: 'ltg' | 's13') => p.feeders.find((f) => f.id === id)!.points?.[type] ?? 0;
const target = (level: typeof F2, label: string, boards: CopyTarget['boards']): CopyTarget => ({ level, label, boards });

/** Level 1 holds two lights (way 1 and way 2 of DB-1A) and a socket (DB-1B way 1), and a switch of DB-1A way 1. */
function level1(): Project {
  let p = base();
  p = placeLvPoint(p, F1, 'ltg', 'DB-1A-1', 1, 1, undefined, { id: 'L', label: 'Panel', watts: 36, lumens: 3000 }, 90).project;
  p = placeLvPoint(p, F1, 'ltg', 'DB-1A-2', 2, 2, 'fitting').project;
  p = placeLvPoint(p, F1, 's13', 'DB-1B-1', 3, 3, undefined, undefined, 180, 'floor').project;
  return placeAccessory(p, F1, 'switch', 4, 4, { feederId: 'DB-1A-1', rot: 270 }).project;
}

describe('Copy to levels', () => {
  it('lists the boards that carry the level, and the boards copies may go on', () => {
    const p = level1();
    expect(boardsToMap(p, F1)).toEqual([{ boardId: 'DB-1A', n: 2 }, { boardId: 'DB-1B', n: 1 }]);
    expect(boardsToMap(p, F2)).toEqual([]);
    const c = boardChoices(p, F2);
    expect(c.here.map((b) => b.id)).toEqual(['DB-2A', 'DB-2B', 'DB-2C']); // a typical level offers the boards of all its floors
    expect(c.others.map((b) => b.id)).toEqual(['DB-1A', 'DB-1B', 'DB-3A']);
  });

  it('offers the board at the same place, a board of neither level for itself, or none', () => {
    const p = level1();
    expect(defaultBoard(p, F1, 'DB-1A', F2)).toBe('DB-2A');
    expect(defaultBoard(p, F1, 'DB-1B', F2)).toBe('DB-2B');
    expect(defaultBoard(p, F1, 'DB-1B', F3)).toBeUndefined();
    expect(defaultBoard(p, F1, 'DB-3A', F2)).toBe('DB-3A');
    expect(defaultBoard(p, F1, 'NOPE', F2)).toBeUndefined();
  });

  it('copies to two levels on the same ways of the chosen boards and counts them on the circuits', () => {
    const p = level1();
    const r = copyLvToLevels(p, F1, [target(F2, 'Level 2', { 'DB-1A': 'DB-2A', 'DB-1B': 'DB-2B' }), target(F3, 'Level 3', { 'DB-1A': 'DB-3A', 'DB-1B': 'DB-3A' })], { points: true, acc: true }, false);
    expect(r.levels).toEqual([{ label: 'Level 2', points: 3, acc: 1, removed: 0, leftOut: 0 }, { label: 'Level 3', points: 2, acc: 1, removed: 0, leftOut: 1 }]);
    const on2 = r.project.lvPoints!.filter((d) => d.levelId === 'L2');
    expect(on2.map((d) => [d.feederId, d.type, d.x, d.y, d.rot, d.variant, d.emergency, d.luminaire?.label])).toEqual([
      ['DB-2A-1', 'ltg', 1, 1, 90, undefined, undefined, 'Panel'], ['DB-2A-2', 'ltg', 2, 2, undefined, undefined, 'fitting', undefined], ['DB-2B-1', 's13', 3, 3, 180, 'floor', undefined, undefined]
    ]);
    expect(count(r.project, 'DB-2A-1', 'ltg')).toBe(1);
    expect(count(r.project, 'DB-2B-1', 's13')).toBe(1);
    expect(count(r.project, 'DB-1A-1', 'ltg')).toBe(1); // the level copied from keeps its own
    expect(r.project.cadAccessories!.filter((a) => a.levelId === 'L2')[0]).toMatchObject({ x: 4, y: 4, rot: 270, feederId: 'DB-2A-1' });
    expect(r.project.lvPoints!.filter((d) => d.levelId === 'L3')).toHaveLength(2);
  });

  it('lists the ways that are missing and the boards left out, and places nothing for them', () => {
    const p = level1();
    const r = copyLvToLevels(p, F1, [target(F3, 'Level 3', { 'DB-1A': 'DB-3A', 'DB-1B': undefined })], { points: true, acc: true }, false);
    expect(r.notes).toEqual(['DB-3A has no way R2: 1 light left out on Level 3', 'No board chosen for DB-1B: 1 socket left out on Level 3']);
    expect(r.levels[0]).toMatchObject({ points: 1, leftOut: 2 });
    expect(r.project.lvPoints!.filter((d) => d.levelId === 'L3').map((d) => d.feederId)).toEqual(['DB-3A-1']);
    expect(r.project.cadAccessories!.find((a) => a.levelId === 'L3')!.feederId).toBe('DB-3A-1');
    const none = copyLvToLevels(p, F1, [target(F3, 'Level 3', {})], { points: true, acc: true }, false);
    expect(none.project.lvPoints!.filter((d) => d.levelId === 'L3')).toHaveLength(0);
    expect(none.project.cadAccessories!.find((a) => a.levelId === 'L3')!.feederId).toBeUndefined(); // a switch is copied without a circuit
  });

  it('says when a way already carries other points but still copies', () => {
    let p = level1();
    p = placeLvPoint(p, F2, 's13', 'DB-2A-1', 9, 9).project;
    const r = copyLvToLevels(p, F1, [target(F2, 'Level 2', { 'DB-1A': 'DB-2A', 'DB-1B': 'DB-2B' })], { points: true, acc: false }, false);
    expect(r.notes).toEqual(['DB-2A R1 carries other points: 1 light added to it on Level 2']);
    expect(r.levels[0].points).toBe(3);
    expect(count(r.project, 'DB-2A-1', 'ltg')).toBe(1);
  });

  it('takes off the points and switches already on the level first when asked, and never touches the level copied from', () => {
    let p = level1();
    p = placeLvPoint(p, F2, 's13', 'DB-2B-1', 9, 9).project;
    p = placeAccessory(p, F2, 'switch', 8, 8).project;
    const map = { 'DB-1A': 'DB-2A', 'DB-1B': 'DB-2B' };
    const kept = copyLvToLevels(p, F1, [target(F2, 'Level 2', map)], { points: true, acc: false }, true);
    expect(kept.levels[0]).toMatchObject({ removed: 1, points: 3 });
    expect(kept.project.cadAccessories!.filter((a) => a.levelId === 'L2')).toHaveLength(1);
    expect(count(kept.project, 'DB-2B-1', 's13')).toBe(1); // the old one went, the new one counts
    const all = copyLvToLevels(p, F1, [target(F2, 'Level 2', map), target(F1, 'Level 1', map)], { points: true, acc: true }, true);
    expect(all.levels).toHaveLength(1);
    expect(all.levels[0]).toMatchObject({ removed: 2, points: 3, acc: 1 });
    expect(all.project.lvPoints!.filter((d) => d.levelId === 'L1')).toHaveLength(3);
  });
});
