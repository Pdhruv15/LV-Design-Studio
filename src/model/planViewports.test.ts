import { describe, expect, it } from 'vitest';
import { boxFrom, insideVp, isFrozen, isLocked, patchViewport, toggleFrozen, vpId, vpName, vpToModel, vpToPaper, vpWindow, withViewports, type PlanViewport } from './planViewports';
import type { DrawingSet } from './drawingSet';

const v: PlanViewport = { id: 'vp1', box: [10, 20, 200, 100], at: [50, 30], scale: 100 };

describe('layout viewports', () => {
  it('shows the model window around its centre at its scale, and maps paper ↔ model both ways', () => {
    expect(vpWindow(v)).toEqual({ x0: 40, x1: 60, y0: 25, y1: 35 }); // 200 × 100 mm at 1:100 = 20 × 10 m
    expect(vpToPaper(v, [50, 30])).toEqual([110, 70]);
    expect(vpToPaper(v, [60, 35])).toEqual([210, 20]); // top right: y is down on paper
    expect(vpToModel(v, [210, 20])).toEqual([60, 35]);
    expect(insideVp(v, [10, 20])).toBe(true);
    expect(insideVp(v, [9, 20])).toBe(false);
    expect(boxFrom([50, 40], [10, 10])).toEqual([10, 10, 40, 30]);
  });

  it('is locked unless unlocked, names itself in order, freezes layers without case', () => {
    expect(isLocked(v)).toBe(true);
    expect(isLocked({ ...v, locked: false })).toBe(false);
    expect(vpId([v, { ...v, id: 'vp3' }])).toBe('vp2');
    expect(vpId([{ ...v, id: 'vp2' }])).toBe('vp1');
    expect(vpName([v, { ...v, id: 'vp7' }], 'vp7')).toBe('Viewport 2');
    const f = { ...v, ...toggleFrozen(v, 'E-POWER') };
    expect(isFrozen(f, 'e-power')).toBe(true);
    expect(toggleFrozen(f, 'e-POWER')).toEqual({ frozen: undefined });
  });

  it('changes a viewport, and puts them on their sheet (none: back to the worked-out one)', () => {
    expect(patchViewport([v], 'vp1', { scale: 50, frame: true, locked: undefined })).toEqual([{ ...v, scale: 50, frame: true }]);
    const set = { sheets: [{ id: 's1', number: '', title: '', kind: 'plan', boards: [], size: 'auto' }] } as unknown as DrawingSet;
    const one = withViewports(set, 's1', [v]);
    expect(one.sheets[0].viewports).toEqual([v]);
    expect(withViewports(one, 's1', []).sheets[0]).not.toHaveProperty('viewports');
  });
});
