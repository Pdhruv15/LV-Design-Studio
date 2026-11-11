import { describe, expect, it } from 'vitest';
import { asFileLayout, drawingLayoutsOf, fitScale, newDrawingLayout, nextLayoutName, withDrawingLayouts } from './drawingLayouts';
import { fileLayoutTitle, viewportScale } from './fileLayouts';
import type { Project } from '../types';

describe('layouts made on a drawing', () => {
  it('are named LayoutN, the first free (case ignored)', () => {
    expect(nextLayoutName([])).toBe('Layout1');
    expect(nextLayoutName(['Layout1', 'A1 Lighting', 'layout2'])).toBe('Layout3');
  });

  it('fit the drawing at the largest standard scale', () => {
    // 30 m × 20 m in mm on a 400 × 277 mm frame needs 1:75.0 by width → 1:75.
    expect(fitScale([0, 0, 30000, 20000], 400, 277, 1)).toBe(75);
    // The same in metres (1000 mm per unit).
    expect(fitScale([0, 0, 30, 20], 400, 277, 1000)).toBe(75);
    expect(fitScale([0, 0, 0, 0], 400, 277, 1)).toBe(100); // empty drawing
    expect(fitScale([0, 0, 1e9, 1], 400, 277, 1)).toBe(2500000); // beyond the list: whole thousands
  });

  it('new: A3 landscape, one viewport inside a 10 mm margin, centred on the drawing, at that scale', () => {
    const l = newDrawingLayout('Layout2', [1000, 2000, 31000, 22000], 1);
    expect(l).toEqual({ name: 'Layout2', paper: [420, 297], viewports: [{ x: 10, y: 10, w: 400, h: 277, cx: 16000, cy: 12000, vh: 277 * 75 }] });
    const f = asFileLayout(l, 3);
    expect(viewportScale(f.viewports[0], f.mm_per_unit, 1)).toBe('1:75');
    expect(fileLayoutTitle(f, 1)).toBe('420 × 297 mm · 1 viewport at 1:75');
  });

  it('are kept by drawing file (case ignored); the last one gone takes the entry with it', () => {
    const p = {} as Project, l = newDrawingLayout('Layout2', [0, 0, 10, 10], 1);
    const q = withDrawingLayouts(p, 'GF.DWG', [l]);
    expect(q.cadLayouts).toEqual({ 'gf.dwg': [l] });
    expect(drawingLayoutsOf(q, 'gf.dwg')).toEqual([l]);
    expect(drawingLayoutsOf(q, undefined)).toEqual([]);
    expect('cadLayouts' in withDrawingLayouts(q, 'gf.dwg', [])).toBe(false);
  });
});
