import { describe, expect, it } from 'vitest';
import { DEFAULT_PAPER, fileLayoutId, fileLayoutOf, fileLayoutTitle, isFileLayoutId, paperOf, viewportMap, viewportScale } from './fileLayouts';
import type { FileLayout, FileViewport } from '../engines/cad/cadEngine';

const vp: FileViewport = { x: 50, y: 40, w: 300, h: 200, cx: 10000, cy: 5000, vh: 20000, locked: false, on: true };
const layout = (over: Partial<FileLayout> = {}): FileLayout => ({
  name: 'Layout1', tab: 1, paper: [420, 297], margins: [6, 7, 6, 7], at: [6, 7], mm_per_unit: 1, viewports: [vp],
  origin: [0, 0], segs: new Float32Array(), segColors: new Uint32Array(), segLayers: new Uint16Array(), texts: [], layers: [], ...over
});

describe('a drawing file\'s own layouts', () => {
  it('tab ids are kept apart from the project\'s sheets and found by name', () => {
    expect(fileLayoutId('A1 Lighting')).toBe('file:A1 Lighting');
    expect([isFileLayoutId('file:Layout1'), isFileLayoutId('sh3'), isFileLayoutId(null)]).toEqual([true, false, false]);
    expect(fileLayoutOf([layout()], 'file:Layout1')?.name).toBe('Layout1');
    expect(fileLayoutOf([layout()], 'Layout1')).toBeUndefined();
  });

  it('the paper: its size, the printable area within the printer\'s margins, paper space placed from the layout origin', () => {
    const p = paperOf(layout());
    expect([p.w, p.h, p.known]).toEqual([420, 297, true]);
    expect(p.printable).toEqual([6, 7, 408, 283]);
    expect(p.mm(100, 50)).toEqual([106, 57]);
    expect(paperOf(layout({ mm_per_unit: 25.4, at: [0, 0] })).mm(1, 2)).toEqual([25.4, 50.8]);
  });

  it('a layout with no paper set up shows A3 with a 5 mm printable edge, its origin at that corner', () => {
    const p = paperOf(layout({ paper: [0, 0], margins: [0, 0, 0, 0], at: [0, 0] }));
    expect([p.w, p.h, p.known]).toEqual([...DEFAULT_PAPER, false]);
    expect(p.printable).toEqual([5, 5, 410, 287]);
    expect(p.mm(0, 0)).toEqual([5, 5]);
  });

  it('a viewport maps the model into its frame at its scale', () => {
    const m = viewportMap(vp);
    expect(m.scale).toBe(0.01);
    expect(m.ps(10000, 5000)).toEqual([200, 140]); // its view centre at the frame's centre
    expect(m.ps(20000, 5000)).toEqual([300, 140]);
    expect(viewportScale(vp, 1, 1)).toBe('1:100'); // a millimetre drawing on a millimetre layout
    expect(viewportScale({ ...vp, vh: 20 }, 1, 1000)).toBe('1:100'); // a drawing in metres: 20 m in the 200 mm frame
    expect(viewportScale({ ...vp, vh: 0.1 }, 1, 1000)).toBe('2:1'); // a detail, enlarged
    expect(viewportScale({ ...vp, vh: 0 }, 1, 1)).toBe('1:1');
  });

  it('says what a layout is in a few words', () => {
    expect(fileLayoutTitle(layout())).toBe('420 × 297 mm · 1 viewport at 1:100');
    expect(fileLayoutTitle(layout({ paper: [0, 0], viewports: [] }))).toBe('420 × 297 mm (paper not set up: A3 shown) · no viewports');
    expect(fileLayoutTitle(layout({ viewports: [vp, { ...vp, on: false }] }))).toBe('420 × 297 mm · 1 viewport at 1:100');
  });
});
