import { describe, expect, it } from 'vitest';
import { closeRefEdit, refEditOf, startRefEdit, workingSet } from './cadRefEdit';
import { blockDefOf, blockDefsOf, placed, unplaced, type CadBlockDef } from './cadBlocks';
import { addSketch, sketchOf, withSketchItems } from './cadSketch';
import { sampleProject } from '../data/sampleProject';
import type { Project, SketchItem } from '../types';

const F = 'plan.dwg';
const line = (id: string, a: [number, number], b: [number, number], layer = '0'): SketchItem => ({ id, kind: 'line', layer, pts: [a, b] });
const B1: CadBlockDef = { name: 'B1', units: 4, description: 'Socket', items: [line('b1', [0, 0], [100, 0]), { id: 'b2', kind: 'text', layer: 'E-TXT', pts: [[0, 50]], text: 'S', h: 20, rot: 0 }, { id: 'b3', kind: 'attdef', layer: '0', pts: [[0, -50]], tag: 'CCT', text: '?', h: 10 }] };
const ins = (id: string, at: [number, number], more: Partial<SketchItem> = {}): SketchItem => ({ id, kind: 'insert', layer: 'E-PWR', pts: [at], block: 'B1', ...more });
const base: Project = { ...sampleProject, cadBlockDefs: [{ file: F, defs: [B1] }], cadSketch: [{ file: F, items: [line('S1', [0, 0], [10, 10], 'A-WALL'), ins('S2', [1000, 2000], { sc: 2, rot: Math.PI / 2, attrs: { CCT: 'B6' } }), ins('S3', [5000, 0]), line('S4', [0, 5], [5, 5], 'A-WALL')] }] };
const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

describe('edit block in place (REFEDIT, REFCLOSE)', () => {
  it('placed and unplaced undo each other: scale, turn, move, sizes and angles', () => {
    const t: SketchItem = { id: 't', kind: 'text', layer: '0', pts: [[30, 40]], text: 'X', h: 5, rot: 0.3 };
    const back = unplaced(placed(t, 2.5, 1.1, [700, -300]), 2.5, 1.1, [700, -300]);
    expect(close(back.pts[0], [30, 40])).toBe(true);
    expect(back.h).toBeCloseTo(5, 9);
    expect(back.rot).toBeCloseTo(0.3, 9);
  });

  it('starts on an insert: its objects placed where it shows them (own layers kept), the insert out, the rest listed as others', () => {
    const r = startRefEdit(base, F, 'S2');
    if ('error' in r) throw new Error(r.error);
    expect([r.n, r.block]).toEqual([3, 'B1']);
    const s = refEditOf(r.project, F)!;
    expect(s).toMatchObject({ file: F, index: 1, others: ['S1', 'S3', 'S4'] });
    expect(s.insert).toEqual(base.cadSketch![0].items[1]);
    const work = workingSet(r.project, s);
    expect(work.map((it) => [it.kind, it.layer])).toEqual([['line', '0'], ['text', 'E-TXT'], ['attdef', '0']]);
    // Scaled 2 and turned 90° about (1000, 2000): (100, 0) lands at (1000, 2200).
    expect(close(work[0].pts[1], [1000, 2200])).toBe(true);
    expect(work[1].h).toBeCloseTo(40, 9);
    expect(sketchOf(r.project, F).some((it) => it.id === 'S2')).toBe(false);
    expect(refEditOf(r.project, 'other.dwg')).toBeUndefined();
  });

  it('refuses a second session, an object that is not an insert, and a block the drawing does not have', () => {
    const r = startRefEdit(base, F, 'S2') as { project: Project };
    expect(startRefEdit(r.project, F, 'S3')).toEqual({ error: 'REFEDIT  "B1" is being edited in place: REFCLOSE it first.' });
    expect(startRefEdit(r.project, 'x.dwg', 'S9')).toEqual({ error: 'REFEDIT  "B1" is being edited in place in plan.dwg: REFCLOSE it first.' });
    expect(startRefEdit(base, F, 'S1')).toEqual({ error: 'REFEDIT  Pick one block drawn here (an insert).' });
    expect(startRefEdit({ ...base, cadBlockDefs: [] }, F, 'S2')).toEqual({ error: 'REFEDIT  The block "B1" is not in this drawing.' });
  });

  it('REFCLOSE Save: the objects (one added, one erased) back in the block\'s units, the insert where it stood, its attributes kept', () => {
    const r = startRefEdit(base, F, 'S2') as { project: Project };
    const s = refEditOf(r.project, F)!, work = workingSet(r.project, s);
    let p = withSketchItems(r.project, F, sketchOf(r.project, F).filter((it) => it.id !== work[1].id)); // the text erased
    p = addSketch(p, F, { kind: 'line', layer: '0', pts: [[1000, 2000], [1000, 1800]] }).project; // drawn while editing
    const c = closeRefEdit(p, true);
    if ('error' in c) throw new Error(c.error);
    expect(c.message).toBe('REFCLOSE  "B1" saved: 3 objects · 2 inserts in plan.dwg updated');
    expect(c.project.cadRefEdit).toBeUndefined();
    expect(sketchOf(c.project, F).map((it) => it.id)).toEqual(['S1', 'S2', 'S3', 'S4']);
    expect(sketchOf(c.project, F)[1]).toEqual(s.insert);
    const def = blockDefOf(blockDefsOf(c.project, F), 'B1')!;
    expect(def).toMatchObject({ units: 4, description: 'Socket' });
    expect(def.items.map((it) => it.kind)).toEqual(['line', 'attdef', 'line']);
    expect(close(def.items[0].pts.flat(), [0, 0, 100, 0])).toBe(true);
    // (1000, 1800) is 200 below the insert point: turned back 90° and halved, (−100, 0) in the block.
    expect(close(def.items[2].pts.flat(), [0, 0, -100, 0])).toBe(true);
  });

  it('REFCLOSE Discard puts it all back as it was; Save refuses an insert of the block itself; nothing to close says so', () => {
    const r = startRefEdit(base, F, 'S2') as { project: Project };
    const d = closeRefEdit(addSketch(r.project, F, { kind: 'line', layer: '0', pts: [[0, 0], [1, 1]] }).project, false);
    if ('error' in d) throw new Error(d.error);
    expect(d.message).toBe('REFCLOSE  Edit of "B1" discarded: the block is as it was');
    expect(sketchOf(d.project, F)).toEqual(base.cadSketch![0].items);
    expect(blockDefsOf(d.project, F)).toEqual([B1]);
    const self = addSketch(r.project, F, { kind: 'insert', layer: '0', pts: [[0, 0]], block: 'b1' }).project;
    expect(closeRefEdit(self, true)).toEqual({ error: 'REFCLOSE  "B1" cannot hold an insert of itself: erase it first.' });
    expect(closeRefEdit(base, true)).toEqual({ error: 'REFCLOSE  No block is being edited in place (REFEDIT starts it).' });
  });
});
