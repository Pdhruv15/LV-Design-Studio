import { describe, expect, it } from 'vitest';
import { cadCommand } from './cadCommands';
import { type CtxEntry, type CtxItem } from './cadContextMenu';
import { closedToggled, findCount, findReplace, gripMenu, withVertexAdded, withVertexRemoved } from './cadDrawnMenus';
import type { SketchItem } from '../../types';

const flat = (list: CtxEntry[]): CtxItem[] => list.flatMap((x) => (x === '-' ? [] : [x, ...(x.sub ?? [])]));
const labels = (list: CtxEntry[]) => list.map((x) => (x === '-' ? '-' : x.label));
const pl = (pts: [number, number][], closed = false): SketchItem => ({ id: 'p', kind: 'pline', layer: '0', pts, ...(closed ? { closed: true } : {}) });
const zig = pl([[0, 0], [4, 0], [4, 3]]);

describe('right-click menus (phase 4): grips, vertices and FIND', () => {
  it('the grip menu: every entry runs a typed command or a page action', () => {
    const all = [gripMenu({ index: 0, kind: 'point', it: zig }), gripMenu({ index: 3, kind: 'mid', it: zig }), gripMenu({ index: 0, kind: 'point', it: { id: 'c', kind: 'circle', layer: '0', pts: [[0, 0]], r: 1 } })];
    for (const x of all.flatMap(flat)) {
      if (x.cmd) expect(cadCommand(x.cmd), x.cmd).toBeTruthy();
      else expect(x.act, x.label).toBeTruthy();
    }
  });

  it('a corner grip: Remove vertex and Close; a side grip: Add vertex; a circle: no Rotate; a two-point line keeps its points', () => {
    expect(labels(gripMenu({ index: 1, kind: 'point', it: zig }))).toEqual(['Move from this point', 'Copy from this point', 'Rotate about this point', '-', 'Remove vertex', 'Close', '-', 'Undo', 'Exit']);
    expect(labels(gripMenu({ index: 3, kind: 'mid', it: zig }))).toEqual(['Move from this point', 'Copy from this point', 'Rotate about this point', '-', 'Add vertex', 'Close', '-', 'Undo', 'Exit']);
    expect(labels(gripMenu({ index: 0, kind: 'point', it: { id: 'l', kind: 'line', layer: '0', pts: [[0, 0], [1, 0]] } }))).toEqual(['Move from this point', 'Copy from this point', 'Rotate about this point', '-', 'Undo', 'Exit']);
    expect(labels(gripMenu({ index: 0, kind: 'point', it: { id: 'c', kind: 'circle', layer: '0', pts: [[0, 0]], r: 1 } }))).toEqual(['Move from this point', 'Copy from this point', '-', 'Undo', 'Exit']);
    expect(gripMenu({ index: 3, kind: 'mid', it: zig }).find((x) => x !== '-' && x.label === 'Add vertex')).toMatchObject({ act: 'grip', arg: 'add|3' });
  });

  it('add a vertex at the middle of a side (a line becomes a polyline; the closing side of a closed one); remove one', () => {
    expect(withVertexAdded(zig, 3).pts).toEqual([[0, 0], [2, 0], [4, 0], [4, 3]]);
    expect(withVertexAdded({ id: 'l', kind: 'line', layer: '0', pts: [[0, 0], [2, 2]] }, 2)).toMatchObject({ kind: 'pline', pts: [[0, 0], [1, 1], [2, 2]] });
    expect(withVertexAdded(pl([[0, 0], [4, 0], [4, 4]], true), 5).pts).toEqual([[0, 0], [4, 0], [4, 4], [2, 2]]);
    expect(withVertexAdded(zig, 1)).toBe(zig); // a corner grip adds nothing
    expect(withVertexRemoved(zig, 1).pts).toEqual([[0, 0], [4, 3]]);
    expect(withVertexRemoved(pl([[0, 0], [1, 0]]), 0).pts).toHaveLength(2);
    expect(withVertexRemoved(pl([[0, 0], [4, 0], [4, 4]], true), 0).pts).toHaveLength(3);
  });

  it('close and open a polyline', () => {
    expect(closedToggled(zig).closed).toBe(true);
    expect(closedToggled(closedToggled(zig)).closed).toBeUndefined();
    expect(closedToggled(pl([[0, 0], [1, 0]]))).toEqual(pl([[0, 0], [1, 0]]));
  });

  it('FIND: any case, in texts, notes, attribute values, attribute defaults and dimension texts; special characters as typed', () => {
    const items: SketchItem[] = [
      { id: 't', kind: 'text', layer: '0', pts: [[0, 0]], text: 'DB-GF1 room' },
      { id: 'n', kind: 'mtext', layer: '0', pts: [[0, 0]], note: [{ runs: [{ s: 'Feed from db-gf1' }, { s: ' and DB-GF1.', b: true }] }] },
      { id: 'i', kind: 'insert', layer: '0', pts: [[0, 0]], block: 'TAG', attrs: { CCT: 'DB-GF1/R3', ROOM: 'Kitchen' } },
      { id: 'a', kind: 'attdef', layer: '0', pts: [[0, 0]], tag: 'CCT', text: 'DB-GF1/R1' },
      { id: 'd', kind: 'dim', layer: '0', pts: [[0, 0], [1, 0], [0.5, 1]], text: 'to DB-GF1' },
      { id: 'x', kind: 'text', layer: '0', pts: [[0, 0]], text: 'Lighting' }
    ];
    const r = findReplace(items, 'db-gf1', 'DB-G01');
    expect(r.n).toBe(6);
    expect(r.changed.map((x) => x.id)).toEqual(['t', 'n', 'i', 'a', 'd']);
    expect(r.changed[0].text).toBe('DB-G01 room');
    expect(r.changed[1].note![0].runs.map((x) => x.s)).toEqual(['Feed from DB-G01', ' and DB-G01.']);
    expect(r.changed[1].note![0].runs[1].b).toBe(true);
    expect(r.changed[2].attrs).toEqual({ CCT: 'DB-G01/R3', ROOM: 'Kitchen' });
    expect(findCount(items, '/R')).toBe(2);
    expect(findCount(items, '(')).toBe(0);
    expect(findReplace(items, '', 'x').n).toBe(0);
  });
});
