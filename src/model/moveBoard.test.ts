import { describe, expect, it } from 'vitest';
import type { Project } from '../types';
import { sampleProject } from '../data/sampleProject';
import { below, incomerOf, indentTarget, moveBlocked, moveBoard, outdentTarget, reorderBoard, siblings } from './moveBoard';

const p = sampleProject;
const root = p.boards.find((b) => !b.upstreamId)!;
const kid = p.boards.find((b) => b.upstreamId === root.id && p.boards.some((c) => c.upstreamId === b.id))!;
const grand = p.boards.find((b) => b.upstreamId === kid.id)!;

describe('moving boards in the panel tree', () => {
  it('blocks loops, self and the current source', () => {
    expect(moveBlocked(p, kid.id, grand.id)).toMatch(/loop/);
    expect(moveBlocked(p, kid.id, kid.id)).toBeTruthy();
    expect(moveBlocked(p, kid.id, root.id)).toMatch(/already/);
    expect(below(p, kid.id).has(grand.id)).toBe(true);
  });

  it('moves the board, its incomer, and flags the length', () => {
    const q = moveBoard(p, grand.id, root.id);
    expect(q.boards.find((b) => b.id === grand.id)!.upstreamId).toBe(root.id);
    const inc = incomerOf(q, grand.id);
    if (incomerOf(p, grand.id)) {
      expect(inc!.boardId).toBe(root.id);
      expect(inc!.lengthToCheck).toBe(true);
    }
    expect(moveBoard(p, kid.id, grand.id)).toBe(p); // a loop is refused
  });

  it('a first board gets its incoming cable as the way, and its supply block goes', () => {
    const first: Project = { ...p, boards: [...p.boards, { id: 'DB-LV', name: 'DB LV', kind: 'DB', ratedCurrentA: 63, supply: { faultKa: 10, ratingA: 63, incomer: { cableCsaMm2: 16, lengthM: 25 } } }] };
    const q = moveBoard(first, 'DB-LV', root.id);
    expect(q.boards.find((b) => b.id === 'DB-LV')).not.toHaveProperty('supply');
    expect(q.boards.find((b) => b.id === 'DB-LV')!.upstreamId).toBe(root.id);
    expect(incomerOf(q, 'DB-LV')).toMatchObject({ boardId: root.id, cableCsaMm2: 16, lengthM: 25, breakerRatingA: 63 });
    expect(moveBoard(first, 'DB-LV', 'DB-LV')).toBe(first); // moveBlocked still decides
  });

  it('outdent goes to the source of the source; indent to the board above', () => {
    expect(outdentTarget(p, grand.id)).toBe(root.id);
    expect(outdentTarget(p, kid.id)).toBeUndefined();
    const s = siblings(p, kid.id);
    if (s.length > 1) expect(indentTarget(p, s[1].id)).toBe(s[0].id);
    expect(indentTarget(p, s[0].id)).toBeUndefined();
  });

  it('reorders boards on the same source', () => {
    const s = siblings(p, kid.id);
    if (s.length < 2) return;
    const q = reorderBoard(p, s[1].id, -1);
    expect(siblings(q, kid.id).map((b) => b.id).slice(0, 2)).toEqual([s[1].id, s[0].id]);
  });
});
