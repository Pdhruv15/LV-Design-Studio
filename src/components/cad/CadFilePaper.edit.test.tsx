// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CadFilePaper, type PaperEdit } from './CadFilePaper';
import { asFileLayout, type DrawingLayout } from '../../model/drawingLayouts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom gives the pane no size, so the paper is drawn at the smallest zoom; the frames' places on screen are read back
// from the frames themselves (px per mm, and where the paper's lower left corner is).
const model = { segs: new Float32Array(0), segLayers: new Uint16Array(0), info: { origin: [0, 0], layers: [], texts: [] } } as unknown as Parameters<typeof CadFilePaper>[0]['model'];
const vp = (x: number, w: number) => ({ x, y: 10, w, h: 277, cx: 0, cy: 0, vh: 27700 });
const layoutOf = (locked = false): DrawingLayout => ({ name: 'Layout2', paper: [420, 297], viewports: [{ ...vp(10, 200), ...(locked ? { locked: true } : {}) }, vp(220, 190)] });
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

function edit(over: Partial<Pick<PaperEdit, 'sel' | 'ms' | 'mv' | 'outline' | 'onOutlinePoint'>> = {}) {
  return { sel: null as number | null, ms: null as number | null, mv: false, onSelect: vi.fn(), onMs: vi.fn(), onBox: vi.fn(), onNew: vi.fn(), onPan: vi.fn(), onZoom: vi.fn(), ...over };
}
const show = (e: PaperEdit | undefined, l = layoutOf()) => act(() => root.render(<CadFilePaper layout={asFileLayout(l, 1)} model={model} edit={e} />));
const frame = (n: number) => document.querySelector<HTMLElement>(`.cad-vp[aria-label="Viewport ${n}"]`)!;
const pane = () => document.querySelector<HTMLElement>('.cad-filepaper')!;
/** Where a point of the paper (mm from its lower left corner) is on screen, from Viewport 1's frame (x 10, y 10 to 287 mm). */
const at = (mx: number, my: number) => {
  const f = frame(1), k = parseFloat(f.style.width) / 200, left = parseFloat(f.style.left) - 10 * k, bottom = parseFloat(f.style.top) + 277 * k + 10 * k;
  return { clientX: left + mx * k, clientY: bottom - my * k, k };
};
const mouse = (type: string, p: { clientX: number; clientY: number }, init: MouseEventInit = {}) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: p.clientX, clientY: p.clientY, ...init });
const fire = (el: Element, type: string, p: { clientX: number; clientY: number }, init?: MouseEventInit) => act(() => { el.dispatchEvent(mouse(type, p, init)); });
const close = (got: number[], want: number[]) => { expect(got).toHaveLength(want.length); want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 1)); };

describe('CadFilePaper: editing the viewports of a layout made here', () => {
  it('draws no frames over the paper without edit, and a frame named Viewport N for each viewport with it', () => {
    show(undefined);
    expect(document.querySelector('.cad-vps')).toBeNull();
    show(edit());
    expect(document.querySelector('.cad-vps')).not.toBeNull();
    expect([...document.querySelectorAll('.cad-vp')].map((x) => x.getAttribute('aria-label'))).toEqual(['Viewport 1', 'Viewport 2']);
  });

  it('a frame dragged by its edge is picked and moved; its corners (on the one picked only) resize it', () => {
    const e = edit();
    show(e);
    const p0 = at(100, 10), edge = frame(1).querySelector('.cad-vp-edge.b')!;
    fire(edge, 'pointerdown', p0);
    expect(e.onSelect).toHaveBeenCalledWith(0);
    const k = p0.k;
    fire(edge, 'pointermove', { clientX: p0.clientX + 40 * k, clientY: p0.clientY - 20 * k });
    fire(edge, 'pointerup', { clientX: p0.clientX + 40 * k, clientY: p0.clientY - 20 * k });
    expect(e.onBox).toHaveBeenCalledTimes(1);
    expect(e.onBox.mock.calls[0][0]).toBe(0);
    close(e.onBox.mock.calls[0][1], [50, 30, 200, 277]);
    expect(e.onBox.mock.calls[0][2]).toBe('move');
    // Corners: only on the viewport picked.
    expect(document.querySelectorAll('.cad-vp-grip')).toHaveLength(0);
    show(edit({ sel: 0 }));
    expect(frame(1).querySelectorAll('.cad-vp-grip')).toHaveLength(4);
    expect(frame(2).querySelectorAll('.cad-vp-grip')).toHaveLength(0);
    const r = edit({ sel: 0 });
    show(r);
    const grip = frame(1).querySelector('.cad-vp-grip.se')!, g0 = at(210, 10);
    fire(grip, 'pointerdown', g0);
    fire(grip, 'pointermove', { clientX: g0.clientX + 10 * k, clientY: g0.clientY + 10 * k });
    fire(grip, 'pointerup', { clientX: g0.clientX + 10 * k, clientY: g0.clientY + 10 * k });
    close(r.onBox.mock.calls[0][1], [10, 0, 210, 287]);
    expect(r.onBox.mock.calls[0][2]).toBe('resize');
  });

  it('MV: two presses on the paper make a viewport from the two corners', () => {
    const e = edit({ mv: true });
    show(e);
    const overlay = document.querySelector('.cad-vps')!;
    fire(overlay, 'pointerdown', at(30, 30));
    expect(e.onNew).not.toHaveBeenCalled();
    fire(overlay, 'pointerdown', at(130, 100));
    expect(e.onNew).toHaveBeenCalledTimes(1);
    close(e.onNew.mock.calls[0][0], [30, 30, 100, 70]);
    expect(e.onSelect).not.toHaveBeenCalled(); // a press while MV is on does not pick or move a frame
  });

  it('a double-click inside a viewport works in it, outside goes back to the paper (not when none is worked in)', () => {
    const e = edit();
    show(e);
    fire(pane(), 'dblclick', at(100, 100));
    expect(e.onMs).toHaveBeenCalledWith(0);
    fire(pane(), 'dblclick', at(215, 150));
    expect(e.onMs).toHaveBeenCalledTimes(1); // outside, with none worked in: nothing to leave
    const w = edit({ ms: 0 });
    show(w);
    fire(pane(), 'dblclick', at(100, 100));
    expect(w.onMs).not.toHaveBeenCalled(); // inside the one already worked in
    fire(pane(), 'dblclick', at(300, 100));
    expect(w.onMs).toHaveBeenLastCalledWith(1);
    fire(pane(), 'dblclick', at(215, 150));
    expect(w.onMs).toHaveBeenLastCalledWith(null);
  });

  it('the wheel uses the step and the direction given (Options → General → Mouse); 1.2 and not reversed without them', () => {
    const e = edit({ ms: 0 });
    act(() => root.render(<CadFilePaper layout={asFileLayout(layoutOf(), 1)} model={model} edit={e} wheel={{ step: 1.3, reverse: true }} />));
    const p = at(100, 100);
    act(() => { pane().dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100, clientX: p.clientX, clientY: p.clientY })); });
    expect(e.onZoom.mock.calls[0][1]).toBeCloseTo(1 / 1.3, 6); // reversed: wheel up zooms out
    act(() => { pane().dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100, clientX: p.clientX, clientY: p.clientY })); });
    expect(e.onZoom.mock.calls[1][1]).toBeCloseTo(1.3, 6);
  });

  it('in the viewport worked in the wheel zooms its view and a drag moves it; locked, neither; elsewhere the wheel zooms the paper', () => {
    const e = edit({ ms: 0 });
    show(e);
    const p = at(100, 100);
    act(() => { pane().dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100, clientX: p.clientX, clientY: p.clientY })); });
    expect(e.onZoom).toHaveBeenCalledTimes(1);
    expect(e.onZoom.mock.calls[0][0]).toBe(0);
    expect(e.onZoom.mock.calls[0][1]).toBeCloseTo(1.2, 6);
    close(e.onZoom.mock.calls[0][2], [100, 100]);
    fire(pane(), 'pointerdown', p);
    fire(pane(), 'pointermove', { clientX: p.clientX + 4, clientY: p.clientY - 2 });
    fire(pane(), 'pointerup', { clientX: p.clientX + 4, clientY: p.clientY - 2 });
    expect(e.onPan).toHaveBeenCalledTimes(1);
    expect(e.onPan.mock.calls[0][0]).toBe(0);
    expect(e.onPan.mock.calls[0][1]).toBeCloseTo(4 / p.k, 4);
    expect(e.onPan.mock.calls[0][2]).toBeCloseTo(2 / p.k, 4);
    // Locked: the wheel and a drag leave its view alone.
    const l = edit({ ms: 0 });
    show(l, layoutOf(true));
    act(() => { pane().dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100, clientX: p.clientX, clientY: p.clientY })); });
    fire(pane(), 'pointerdown', p);
    fire(pane(), 'pointermove', { clientX: p.clientX + 4, clientY: p.clientY });
    fire(pane(), 'pointerup', { clientX: p.clientX + 4, clientY: p.clientY });
    expect(l.onZoom).not.toHaveBeenCalled();
    expect(l.onPan).not.toHaveBeenCalled();
    // Outside it the wheel zooms the paper: the frames get bigger.
    const o = edit({ ms: 0 }), before = parseFloat(frame(1).style.width), out = at(215, 150);
    show(o);
    act(() => { pane().dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100, clientX: out.clientX, clientY: out.clientY })); });
    expect(o.onZoom).not.toHaveBeenCalled();
    expect(parseFloat(frame(1).style.width)).toBeGreaterThan(before);
  });

  it('a click on the paper picks nothing; a click that drags moves the paper, not the pick', () => {
    const e = edit({ sel: 0 });
    show(e);
    const p = at(215, 150);
    fire(pane(), 'pointerdown', p);
    fire(pane(), 'pointerup', p);
    expect(e.onSelect).toHaveBeenCalledWith(null);
    const d = edit({ sel: 0 });
    show(d);
    fire(pane(), 'pointerdown', p);
    fire(pane(), 'pointermove', { clientX: p.clientX + 20, clientY: p.clientY });
    fire(pane(), 'pointerup', { clientX: p.clientX + 20, clientY: p.clientY });
    expect(d.onSelect).not.toHaveBeenCalled();
    expect(d.onPan).not.toHaveBeenCalled();
  });
});

describe('CadFilePaper: the design made in the app, over the model in each viewport', () => {
  const piece = '<g fill="#fff" stroke="#000" stroke-width="0.25"><circle cx="100" cy="150" r="1.8"/></g><text x="100" y="140" font-size="2.8" fill="#000">DB-GF1</text>';
  const showDesign = (design: string[] | undefined, e?: PaperEdit) => act(() => root.render(<CadFilePaper layout={asFileLayout(layoutOf(), 1)} model={model} design={design} edit={e} />));
  const overlay = () => document.querySelector<SVGSVGElement>('.cad-filepaper-design');

  it('is an SVG the size of the paper over the canvas, each piece clipped to its viewport\'s frame; none without a design', () => {
    showDesign(undefined);
    expect(overlay()).toBeNull();
    showDesign(['', '']);
    expect(overlay()).toBeNull();
    showDesign([piece, ''], edit());
    const svg = overlay()!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 420 297');
    expect(svg.style.pointerEvents).toBe('none');
    // It lies on the paper: as wide as the paper on screen, its left edge 10 mm left of Viewport 1's frame.
    const f = frame(1), k = parseFloat(f.style.width) / 200;
    close([parseFloat(svg.style.width), parseFloat(svg.style.height), parseFloat(svg.style.left)], [420 * k, 297 * k, parseFloat(f.style.left) - 10 * k]);
    // One group, for the viewport that has a piece: clipped to its frame (x 10, y 10 to 287 mm from the bottom: 10 mm from the top).
    expect([...svg.querySelectorAll('g[data-vp]')].map((g) => g.getAttribute('data-vp'))).toEqual(['0']);
    const clip = svg.querySelector('clipPath#fpd0 rect')!;
    expect(['x', 'y', 'width', 'height'].map((a) => Number(clip.getAttribute(a)))).toEqual([10, 10, 200, 277]);
    expect(svg.querySelector('g[data-vp="0"]')!.getAttribute('clip-path')).toBe('url(#fpd0)');
    expect(svg.querySelectorAll('circle[r="1.8"]')).toHaveLength(1);
    expect(svg.textContent).toBe('DB-GF1');
    // The frames to pick stay above it.
    expect(svg.compareDocumentPosition(document.querySelector('.cad-vps')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('takes nothing that could run: a script or a handler in a piece is dropped', () => {
    showDesign(['<circle cx="1" cy="1" r="1.8" onclick="alert(1)"/><script>alert(1)</script>', '']);
    const svg = overlay()!;
    expect(svg.querySelector('script')).toBeNull();
    expect(svg.querySelector('circle')!.hasAttribute('onclick')).toBe(false);
  });

  it('follows the view while it is dragged in the viewport worked in', () => {
    const e = edit({ ms: 0 });
    showDesign([piece, piece], e);
    const inner = () => overlay()!.querySelector('g[data-vp="0"] > g')!;
    expect(inner().hasAttribute('transform')).toBe(false);
    const from = at(100, 100), to = { clientX: from.clientX + 4, clientY: from.clientY - 2 };
    fire(pane(), 'pointerdown', from);
    fire(pane(), 'pointermove', to);
    // 4 px right and 2 px up on screen, in mm on the paper: the piece moves with it (y is down on the page).
    const m = /translate\(([\d.-]+) ([\d.-]+)\)/.exec(inner().getAttribute('transform')!)!;
    close([Number(m[1]), Number(m[2])], [4 / from.k, -2 / from.k]);
    expect(overlay()!.querySelector('g[data-vp="1"] > g')!.hasAttribute('transform')).toBe(false);
    fire(pane(), 'pointerup', to);
    expect(inner().hasAttribute('transform')).toBe(false);
    expect(e.onPan).toHaveBeenCalledTimes(1);
  });
});

describe('CadFilePaper: a clipped viewport (VPCLIP)', () => {
  it('is worked in by a double-click inside its outline, not in the part of its frame cut away; the design over it is cut at the outline', () => {
    // Viewport 1 (x 10 to 210, y 10 to 287 mm from the bottom) with its top right quarter cut away: beyond x 110 above y 148.5.
    const clip: [number, number][] = [[0, 0], [0.5, 0], [0.5, 0.5], [1, 0.5], [1, 1], [0, 1]];
    const l: DrawingLayout = { name: 'Layout2', paper: [420, 297], viewports: [{ ...vp(10, 200), clip }, vp(220, 190)] };
    const e = edit();
    act(() => root.render(<CadFilePaper layout={asFileLayout(l, 1)} model={model} design={['<circle cx="50" cy="150" r="1.8"/>', '<circle cx="300" cy="150" r="1.8"/>']} edit={e} />));
    fire(pane(), 'dblclick', at(160, 250));
    expect(e.onMs).not.toHaveBeenCalled();
    fire(pane(), 'dblclick', at(60, 250));
    expect(e.onMs).toHaveBeenCalledWith(0);
    // On the page (mm from its top left corner) the outline is the clip of that viewport's design; the other keeps its frame.
    expect(document.querySelector('.cad-filepaper-design clipPath#fpd0 polygon')!.getAttribute('points')).toBe('10,10 110,10 110,148.5 210,148.5 210,287 10,287');
    expect(document.querySelector('.cad-filepaper-design clipPath#fpd0 rect')).toBeNull();
    expect(document.querySelector('.cad-filepaper-design clipPath#fpd1 rect')).not.toBeNull();
  });
});

describe('CadFilePaper: picking the outline of a viewport (VPCLIP)', () => {
  const band = () => document.querySelector('svg[aria-label="Outline being picked"]');
  it('a press on the paper is a corner in mm (to 0.1), and nothing else: no frame is picked or moved, no viewport made', () => {
    const onOutlinePoint = vi.fn(), e = edit({ outline: [], onOutlinePoint });
    show(e);
    const overlay = document.querySelector('.cad-vps')!;
    expect(overlay.className).toContain('mv');
    expect((overlay as HTMLElement).style.cursor).toBe('crosshair');
    fire(overlay, 'pointerdown', at(30, 30));
    fire(frame(1).querySelector('.cad-vp-edge.b')!, 'pointerdown', at(100, 10)); // a frame's edge is no grab now: the press is a corner too
    fire(overlay, 'pointerdown', at(130.04, 100.26));
    expect(onOutlinePoint).toHaveBeenCalledTimes(3);
    close(onOutlinePoint.mock.calls[0][0], [30, 30]);
    close(onOutlinePoint.mock.calls[1][0], [100, 10]);
    expect(onOutlinePoint.mock.calls[2][0].map((n: number) => +n.toFixed(1))).toEqual(onOutlinePoint.mock.calls[2][0]);
    expect(e.onSelect).not.toHaveBeenCalled();
    expect(e.onBox).not.toHaveBeenCalled();
    expect(e.onNew).not.toHaveBeenCalled();
  });

  it('the rubber band has a point per corner picked plus the pointer, a dashed line back to the first from two corners on, and a dot on each corner', () => {
    show(edit({ outline: [[30, 30]] }));
    expect(band()).not.toBeNull();
    const overlay = document.querySelector('.cad-vps')!;
    expect(band()!.querySelectorAll('circle')).toHaveLength(1);
    expect(band()!.querySelector('polyline')).toBeNull(); // one corner and no pointer yet: nothing to join
    fire(overlay, 'pointermove', at(130, 30));
    expect(band()!.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(2);
    expect(band()!.querySelector('line')).toBeNull();
    show(edit({ outline: [[30, 30], [130, 30], [130, 100]] }));
    fire(overlay, 'pointermove', at(30, 100));
    expect(band()!.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(4);
    expect(band()!.querySelector('polyline')!.getAttribute('stroke')).toBe('var(--acc)');
    expect(band()!.querySelector('line')!.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(band()!.querySelectorAll('circle')).toHaveLength(3);
  });

  it('with no outline being picked there is no band, and a press is MV\'s or a frame\'s as before', () => {
    const e = edit({ outline: null, onOutlinePoint: vi.fn() });
    show(e);
    expect(band()).toBeNull();
    expect(document.querySelector('.cad-vps')!.className).not.toContain('mv');
    fire(frame(1).querySelector('.cad-vp-edge.b')!, 'pointerdown', at(100, 10));
    expect(e.onSelect).toHaveBeenCalledWith(0);
    expect(e.onOutlinePoint).not.toHaveBeenCalled();
  });

  it('the title of a clipped viewport\'s edges says so', () => {
    const l: DrawingLayout = { name: 'Layout2', paper: [420, 297], viewports: [{ ...vp(10, 200), clip: [[0, 0], [1, 0], [0.5, 1]] }, vp(220, 190)] };
    show(edit(), l);
    expect(frame(1).querySelector('.cad-vp-edge')!.getAttribute('title')).toContain(' · clipped — drag');
    expect(frame(2).querySelector('.cad-vp-edge')!.getAttribute('title')).not.toContain('clipped');
  });
});
