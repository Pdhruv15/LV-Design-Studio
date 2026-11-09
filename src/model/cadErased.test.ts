import { describe, expect, it } from 'vitest';
import { erasedOf, restoredErased, shownView, withErased } from './cadErased';
import type { CadView } from '../engines/cad/cadEngine';
import type { Project } from '../types';

const p = { id: 'p' } as unknown as Project;

describe('Objects erased in Design CAD (CROP)', () => {
  it('are kept per plan file, by handle, once each', () => {
    const q = withErased(withErased(p, 'GF.dwg', ['1a']), 'gf.DWG', ['1A', '2B']);
    expect(erasedOf(q, 'GF.DWG')).toEqual(['1A', '2B']);
    expect(erasedOf(q, 'FF.dwg')).toEqual([]);
    expect(erasedOf(p, 'GF.dwg')).toEqual([]);
  });

  it('come back per plan file (RESTOREDWG), the other files kept', () => {
    const q = withErased(withErased(p, 'GF.dwg', ['1A']), 'FF.dwg', ['2B']);
    const r = restoredErased(q, 'gf.DWG');
    expect(erasedOf(r, 'GF.dwg')).toEqual([]);
    expect(erasedOf(r, 'FF.dwg')).toEqual(['2B']);
    expect(restoredErased(restoredErased(r, 'FF.dwg'), 'FF.dwg').cadErased).toBeUndefined();
    expect(restoredErased(p, 'GF.dwg')).toBe(p);
  });

  it('are left out of the view: lines drawn as nothing (indices kept), texts, fills, blocks and outlines', () => {
    const v = {
      segs: Float32Array.from([0, 0, 10, 0, 10, 0, 10, 10, 20, 0, 30, 0]),
      info: { texts: [{ s: 'A', o: 0 }, { s: 'B', o: 1 }], fills: [{ loops: [[0, 2]] }, { loops: [[2, 3]] }] },
      blocks: () => [{ block: 'X', handle: '1A' }, { block: 'Y', handle: '2B' }],
      outlines: () => [{ handle: '1A' }, { handle: '3C' }]
    } as unknown as CadView;
    const s = shownView(v, { objects: [0], ranges: [[0, 2]] }, ['1a']);
    expect(Array.from(s.segs)).toEqual([0, 0, 0, 0, 10, 0, 10, 0, 20, 0, 30, 0]);
    expect(Array.from(v.segs).slice(0, 4)).toEqual([0, 0, 10, 0]); // the drawing as read is not changed
    expect(s.info.texts.map((t) => t.s)).toEqual(['B']);
    expect(s.info.fills).toEqual([{ loops: [[2, 3]] }]);
    expect(s.blocks().map((b) => b.handle)).toEqual(['2B']);
    expect(s.outlines().map((o) => o.handle)).toEqual(['3C']);
    expect(shownView(v, { objects: [], ranges: [] }, [])).toBe(v);
  });
});
