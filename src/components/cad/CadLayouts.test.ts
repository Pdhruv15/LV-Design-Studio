import { describe, expect, it } from 'vitest';
import { layoutsOf, moveLayout, newLayout } from './CadLayouts';
import type { DrawingSet } from '../../model/drawingSet';
import type { Project } from '../../types';

const gf = { buildingId: 'V', levelId: 'GF', name: 'Ground floor' };
const empty: DrawingSet = { sheets: [] } as unknown as DrawingSet;

describe('layouts of a level', () => {
  it('makes a layout as a numbered plan sheet of the level, copies one, and lists a level\'s own', () => {
    const a = newLayout(empty, gf, 'lighting');
    expect(a.set.sheets).toEqual([expect.objectContaining({ id: a.id, number: 'E-LTG-001', title: 'Ground floor · Lighting layout', kind: 'plan', plan: 'lighting', buildingId: 'V', levelId: 'GF', scale: '1:100', size: 'auto' })]);
    const b = newLayout(a.set, gf, 'power');
    const c = newLayout(b.set, gf, 'lighting', { ...a.set.sheets[0], viewports: [{ id: 'vp1', box: [0, 0, 10, 10], at: [0, 0], scale: 50 }], rev: 'B' });
    expect(c.set.sheets.map((s) => s.number)).toEqual(['E-LTG-001', 'E-LTG-002', 'E-PWR-001']); // after the other lighting layouts
    expect(c.set.sheets[1]).toMatchObject({ title: 'Ground floor · Lighting layout (copy)', viewports: [expect.objectContaining({ scale: 50 })] });
    expect(c.set.sheets[1].rev).toBeUndefined(); // a copy is a new sheet, not issued yet
    const p = { drawingSet: c.set } as unknown as Project;
    expect(layoutsOf(p, gf)).toHaveLength(3);
    expect(layoutsOf(p, { buildingId: 'V', levelId: 'FF' })).toEqual([]);
    expect(layoutsOf(p, undefined)).toEqual([]);
  });

  it('moves a layout among its level\'s layouts, past other sheets, not off the end', () => {
    const a = newLayout(empty, gf, 'lighting'), b = newLayout(a.set, gf, 'power');
    const withSld = { ...b.set, sheets: [b.set.sheets[0], { id: 'sld', kind: 'system' } as never, b.set.sheets[1]] };
    expect(moveLayout(withSld, b.id, -1).sheets.map((s) => s.id)).toEqual([b.id, 'sld', a.id]);
    expect(moveLayout(withSld, a.id, -1)).toBe(withSld);
    expect(moveLayout(withSld, 'gone', 1)).toBe(withSld);
  });
});
