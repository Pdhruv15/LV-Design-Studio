import { describe, expect, it } from 'vitest';
import {
  addDrawingViewport, alignDrawingView, arrangeDrawingViewports, asFileLayout, copyDrawingViewport, dvId, dvIndex, fitDrawingViewports, LAYOUT_PAPERS, paperName, patchDrawingViewport, panDrawingView, removeDrawingViewport, scaleDrawingViewport,
  viewportAt, viewportScaleN, viewportWindow, withPaper, withViewportBox, zoomDrawingView, drawingLayoutsOf, fitScale, layoutPaperMm, newDrawingLayout, nextLayoutName, withDrawingLayouts
} from './drawingLayouts';
import { fileLayoutTitle, viewportScale } from './fileLayouts';
import { arrangementOf } from './planViewports';
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

  it('new on another paper: the viewport fills it inside the same margin; a paper not given is A3 landscape', () => {
    const ext: [number, number, number, number] = [1000, 2000, 31000, 22000];
    const l = newDrawingLayout('Layout2', ext, 1, [594, 841]);
    expect(l.paper).toEqual([594, 841]);
    expect(l.viewports[0]).toMatchObject({ x: 10, y: 10, w: 574, h: 821, cx: 16000, cy: 12000 });
    expect(newDrawingLayout('Layout2', ext, 1, [420, 297])).toEqual(newDrawingLayout('Layout2', ext, 1));
  });

  it('a paper of the list, across or upright; A3 for an id not in it', () => {
    expect(layoutPaperMm('A1', false)).toEqual([841, 594]);
    expect(layoutPaperMm('A1', true)).toEqual([594, 841]);
    expect(layoutPaperMm('A4', true)).toEqual([210, 297]);
    expect(layoutPaperMm('A3', false)).toEqual([420, 297]);
    expect(layoutPaperMm('B7', false)).toEqual([420, 297]);
    expect(layoutPaperMm('', true)).toEqual([297, 420]);
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

describe('layout tools on a drawing', () => {
  const ext: [number, number, number, number] = [1000, 2000, 31000, 22000];
  it('names papers in either orientation, or by size', () => {
    expect(LAYOUT_PAPERS.map((x) => x.id)).toEqual(['A4', 'A3', 'A2', 'A1', 'A0']);
    expect([paperName([420, 297]), paperName([594, 841]), paperName([297, 210]), paperName([500, 300])]).toEqual(['A3 landscape', 'A1 portrait', 'A4 landscape', '500 × 300 mm']);
  });
  it('a new paper keeps each viewport in proportion, its centre and its scale', () => {
    const l = { ...newDrawingLayout('Layout2', ext, 1), name: 'Layout2' };
    const q = withPaper(l, [841, 594]);
    expect(q.paper).toEqual([841, 594]);
    expect(viewportScaleN(q.viewports[0], 1)).toBe(viewportScaleN(l.viewports[0], 1));
    expect(q.viewports[0]).toMatchObject({ cx: l.viewports[0].cx, cy: l.viewports[0].cy });
    expect(q.viewports[0].x).toBeCloseTo(10 * 841 / 420, 0);
    const portrait = withPaper(l, [297, 420]);
    expect(viewportScaleN(portrait.viewports[0], 1)).toBe(75);
    expect(portrait.viewports[0].w).toBeLessThan(l.viewports[0].w);
  });
  it('arranges viewports inside the margin from the bottom, keeping existing scales', () => {
    const l = newDrawingLayout('Layout2', ext, 1);
    const q = arrangeDrawingViewports(l, arrangementOf('2V')!, ext, 1);
    expect(q.viewports).toHaveLength(2);
    expect(viewportScaleN(q.viewports[0], 1)).toBe(75);
    for (const v of q.viewports) { expect(v.x).toBeGreaterThanOrEqual(10); expect(v.y).toBeGreaterThanOrEqual(10 - 0.1); expect(v.x + v.w).toBeLessThanOrEqual(410.1); expect(v.y + v.h).toBeLessThanOrEqual(287.1); }
    expect(q.viewports[1].cx).toBe(16000);
    const four = arrangeDrawingViewports(l, arrangementOf('4')!, ext, 1);
    expect(four.viewports).toHaveLength(4);
    const upper = four.viewports[0], lower = four.viewports[2];
    expect(upper.y).toBeGreaterThan(lower.y); // the first frame is at the top: y runs up from the bottom
    // A key plan goes by the plan's scale (1:75 → 1:500), not by what its own small frame would fit.
    const key = arrangeDrawingViewports(l, arrangementOf('KEY')!, ext, 1);
    expect([viewportScaleN(key.viewports[0], 1), viewportScaleN(key.viewports[1], 1)]).toEqual([75, 500]);
    expect(viewportScaleN(arrangeDrawingViewports({ ...l, viewports: [] }, arrangementOf('KEY')!, ext, 1).viewports[1], 1)).toBe(500);
    expect(arrangeDrawingViewports(four, arrangementOf('1')!, ext, 1).viewports).toHaveLength(1);
  });
  it('fits every viewport to the whole drawing, centred', () => {
    const l = arrangeDrawingViewports(newDrawingLayout('Layout2', ext, 1), arrangementOf('2H')!, ext, 1);
    const f = fitDrawingViewports({ ...l, viewports: l.viewports.map((v) => ({ ...v, cx: 0, cy: 0, vh: 5 })) }, ext, 1);
    for (const v of f.viewports) {
      expect([v.cx, v.cy]).toEqual([16000, 12000]);
      const n = viewportScaleN(v, 1);
      expect(n * v.w).toBeGreaterThanOrEqual(30000 - 1); expect(n * v.h).toBeGreaterThanOrEqual(20000 - 1);
    }
  });
});

describe('viewports of a layout made on a drawing', () => {
  const ext: [number, number, number, number] = [1000, 2000, 31000, 22000];
  const one = () => newDrawingLayout('Layout2', ext, 1); // 400 × 277 mm at 10, 10, 1:75, centred on 16000, 12000
  it('are named by their place; another kind of id names none', () => {
    const l = arrangeDrawingViewports(one(), arrangementOf('2V')!, ext, 1);
    expect([dvIndex(l, dvId(0)), dvIndex(l, dvId(1)), dvIndex(l, dvId(2)), dvIndex(l, 'vp1'), dvIndex(l, null), dvIndex(undefined, dvId(0))]).toEqual([0, 1, -1, -1, -1, -1]);
  });
  it('show a window of the model round their centre', () => {
    const [x0, y0, x1, y1] = viewportWindow(one().viewports[0]);
    expect([x0, y0, x1, y1]).toEqual([16000 - 200 * 75, 12000 - 138.5 * 75, 16000 + 200 * 75, 12000 + 138.5 * 75]);
  });
  it('are found under a paper point, the last made first', () => {
    const l = addDrawingViewport(one(), [300, 200, 80, 60], ext, 1);
    expect([viewportAt(l, [320, 220]), viewportAt(l, [50, 50]), viewportAt(l, [2, 2])]).toEqual([1, 0, -1]);
  });
  it('moved: the view goes with the frame; resized: the model stays where it is on the paper', () => {
    const l = one(), v = l.viewports[0];
    const moved = withViewportBox(l, 0, [30.04, 20, 999, 999], 'move').viewports[0];
    expect(moved).toEqual({ ...v, x: 30, y: 20 });
    // The right and top edges pulled in by 100 and 77 mm: the centre moves half of that, at 75 units per mm.
    const sized = withViewportBox(l, 0, [10, 10, 300, 200], 'resize').viewports[0];
    expect(sized).toMatchObject({ x: 10, y: 10, w: 300, h: 200, cx: 16000 - 50 * 75, cy: 12000 - 38.5 * 75 });
    expect(viewportScaleN(sized, 1)).toBe(75);
    // The model point at the frame's lower left corner has not moved.
    expect(viewportWindow(sized).slice(0, 2)).toEqual(viewportWindow(v).slice(0, 2));
  });
  it('a new one shows the whole drawing at the scale it fits, and goes last', () => {
    const l = addDrawingViewport(one(), [300.04, 200, 80, 60], ext, 1);
    expect(l.viewports).toHaveLength(2);
    expect(l.viewports[1]).toMatchObject({ x: 300, y: 200, w: 80, h: 60, cx: 16000, cy: 12000 });
    expect(viewportScaleN(l.viewports[1], 1)).toBe(500); // 30 m over 80 mm needs 1:375 → 1:500
  });
  it('are copied 10 mm right and down, kept on the paper, and deleted', () => {
    const l = copyDrawingViewport(patchDrawingViewport(one(), 0, { frame: true }), 0);
    expect(l.viewports[1]).toEqual({ ...l.viewports[0], x: 20, y: 0 });
    const small = copyDrawingViewport({ ...one(), viewports: [{ ...one().viewports[0], x: 100, y: 100, w: 50, h: 40 }] }, 0);
    expect(small.viewports[1]).toMatchObject({ x: 110, y: 90, w: 50, h: 40 });
    expect(copyDrawingViewport(one(), 4)).toEqual(one());
    expect(removeDrawingViewport(l, 0).viewports).toEqual([l.viewports[1]]);
  });
  it('take a scale, a lock and a printed frame; a cleared field goes', () => {
    const l = scaleDrawingViewport(one(), 0, 50, 1);
    expect(viewportScaleN(l.viewports[0], 1)).toBe(50);
    expect(viewportScaleN(scaleDrawingViewport(one(), 0, 50, 1000).viewports[0], 1000)).toBe(50); // a drawing in metres
    const locked = patchDrawingViewport(l, 0, { locked: true, frame: true });
    expect(locked.viewports[0]).toMatchObject({ locked: true, frame: true });
    expect(asFileLayout(locked, 2).viewports[0].locked).toBe(true);
    expect(asFileLayout(l, 2).viewports[0].locked).toBe(false);
    expect('locked' in patchDrawingViewport(locked, 0, { locked: undefined }).viewports[0]).toBe(false);
  });
  it('fit one viewport and leave the others', () => {
    const l = arrangeDrawingViewports(one(), arrangementOf('2V')!, ext, 1);
    const off = { ...l, viewports: l.viewports.map((v) => ({ ...v, cx: 0, cy: 0, vh: 5 })) };
    const f = fitDrawingViewports(off, ext, 1, 1);
    expect(f.viewports[0]).toEqual(off.viewports[0]);
    expect([f.viewports[1].cx, f.viewports[1].cy]).toEqual([16000, 12000]);
  });
  it('line a view up with the first viewport: side by side on one line, stacked on one column', () => {
    const l = arrangeDrawingViewports(one(), arrangementOf('2V')!, ext, 1);
    const off = patchDrawingViewport(l, 1, { cx: 5, cy: 7 });
    // Side by side at the same height on the paper: the same model height at the centre.
    expect(alignDrawingView(off, 1, 'h').viewports[1]).toMatchObject({ cx: 5, cy: l.viewports[0].cy });
    const stacked = arrangeDrawingViewports(one(), arrangementOf('2H')!, ext, 1);
    expect(alignDrawingView(patchDrawingViewport(stacked, 1, { cx: 5, cy: 7 }), 1, 'v').viewports[1]).toMatchObject({ cx: stacked.viewports[0].cx, cy: 7 });
    // A viewport 20 mm lower on the paper shows the model lower by 20 mm at its own scale (1:200 in half the width).
    const low = patchDrawingViewport(l, 1, { y: l.viewports[1].y - 20 });
    expect(viewportScaleN(low.viewports[1], 1)).toBe(200);
    expect(alignDrawingView(low, 1, 'h').viewports[1].cy).toBeCloseTo(l.viewports[0].cy - 20 * 200, 6);
    expect(alignDrawingView(l, 0, 'h')).toBe(l); // the first one is what the others line up with
  });
  it('worked in: a drag carries the model with the pointer, a zoom keeps the model point under it', () => {
    const v = one().viewports[0]; // 75 units per mm, centre 16000, 12000 at 210, 148.5 on the paper
    expect(panDrawingView(v, 10, -4)).toEqual({ cx: 16000 - 750, cy: 12000 + 300 });
    // Twice as close about the frame's centre: the centre stays, half the height shows.
    expect(zoomDrawingView(v, 2, [210, 148.5])).toEqual({ cx: 16000, cy: 12000, vh: v.vh / 2 });
    // About a point 40 mm right of the centre: its model point (16000 + 3000) is still 40 mm right of the centre at the new scale.
    const z = zoomDrawingView(v, 2, [250, 148.5]);
    expect(z.cx + 40 * (z.vh / v.h)).toBeCloseTo(19000, 6);
    expect(zoomDrawingView(v, 0, [0, 0])).toEqual({ cx: v.cx, cy: v.cy, vh: v.vh });
  });
});
