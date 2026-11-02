// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SystemDiagram, { canvasDrawing } from './SystemDiagram';
import { evaluateProject } from '../calc/electrical';
import { DEWA_EXTRA_Y, layoutSystem } from '../diagram/layout';
import { network } from '../../tests/fixtures/networks';
import type { Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
// With an id, as every real project has: the canvas opens zoomed in, once per project.
const base = { ...network(20, 'shallow'), id: 'zoom' };
const results = evaluateProject(base);
const nodes = layoutSystem(base, DEWA_EXTRA_Y, { frames: true }).feeders; // as the canvas draws it (DEWA style)

describe('SLD zoom and pan on the design canvas', () => {
  let host: HTMLDivElement, root: Root;
  const project: Project = base;
  /** How often the drawing is drawn: each draw measures its fitted labels once. */
  let selects: MockInstance<(selector: string) => unknown>;
  const draws = () => selects.mock.calls.filter(([s]) => s.startsWith('text[data-dxf-max-width]')).length;
  const draw = (p: Project = project, extra: { focus?: { kind: 'board' | 'feeder'; id: string; n: number } } = {}) => act(() => root.render(
    <SystemDiagram {...canvasDrawing(false)} project={p} calcProject={p} results={results} selectedFeederId={null} selectedBoardId={null}
      onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} resizable fullScreen onToggleFullScreen={noop} {...extra} />
  ));
  const svg = () => host.querySelector<SVGSVGElement>('.sysdiag > svg')!;
  const view = () => { const [x, y, w, h] = svg().getAttribute('viewBox')!.split(' ').map(Number); return { x, y, w, h }; };
  const circuits = () => host.querySelectorAll('.sysdiag > svg .fd').length;
  const wheel = (deltaY = -100) => act(() => { svg().dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: 700, clientY: 400, bubbles: true, cancelable: true })); });
  const press = (label: string) => act(() => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
  const key = (k: string) => act(() => { host.querySelector('.sysdiag')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
  const fit = () => press('Fit the drawing');
  const pan = (dx: number) => {
    const fire = (type: string, clientX: number) => act(() => { svg().dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 300 })); });
    fire('pointerdown', 700);
    fire('pointermove', 700 + dx);
    fire('pointerup', 700 + dx);
  };
  /** Every circuit near the view is drawn: nothing shows a gap, at the smallest margin the canvas has ever kept. */
  const expectNoGaps = () => {
    const v = view(), drawn = new Set([...host.querySelectorAll('.sysdiag > svg .fd')].map((g) => g.getAttribute('data-lv-id')));
    for (const n of nodes) if (n.x >= v.x - 400 && n.x <= v.x + v.w + 400) expect(drawn.has(`feeder:${n.feeder.id}`), n.feeder.id).toBe(true);
  };

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { private fire: () => void; constructor(fire: () => void) { this.fire = fire; } observe() { this.fire(); } unobserve() {} disconnect() {} });
    selects = vi.spyOn(Element.prototype, 'querySelectorAll') as unknown as MockInstance<(selector: string) => unknown>;
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1400);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(800);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 1400, bottom: 800, width: 1400, height: 800, x: 0, y: 0, toJSON: () => ({}) });
    (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = noop; // not in jsdom
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    draw();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    localStorage.removeItem('lvds.sldDetail');
    delete (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens zoomed in, drawing only what is in view', () => {
    expect(view().w).toBe(1400);
    expect(circuits()).toBeLessThan(project.feeders.length);
    expectNoGaps();
  });

  it('zooms with the whole drawing in view without drawing it again', () => {
    fit();
    const whole = view().w;
    expect(circuits()).toBe(project.feeders.length);
    const before = draws();
    for (let i = 0; i < 4; i++) wheel();
    expect(draws()).toBe(before);
    expect(view().w).toBeCloseTo(whole / 1.15 ** 4);
    expect(host.querySelector('.zoom-chip')!.textContent).toBe(`${Math.round(1.15 ** 4 * 100)} %`);
  });

  it('steps the zoom buttons and keys from where the view is now', () => {
    fit();
    wheel();
    wheel();
    const before = draws(), a = view();
    press('Zoom in');
    const b = view();
    expect(b.w).toBeCloseTo(a.w / 1.25);
    expect(b.x + b.w / 2).toBeCloseTo(a.x + a.w / 2);
    key('+');
    expect(view().w).toBeCloseTo(b.w / 1.25);
    const c = view();
    key('ArrowRight');
    expect(view().x).toBeCloseTo(c.x + c.w * 0.1);
    press('Zoom out');
    expect(view().w).toBeCloseTo(c.w * 1.25);
    expect(draws()).toBe(before);
  });

  it('drags from where the view is now, without drawing again inside the drawn area', () => {
    wheel();
    const before = draws(), a = view();
    pan(-50);
    expect(view().x).toBeCloseTo(a.x + 50 * Math.max(a.w / 1400, a.h / 800));
    expect(view().w).toBe(a.w);
    expect(draws()).toBe(before);
    expectNoGaps();
  });

  it('draws what comes into view when a pan nears the edge of the drawn area', () => {
    const before = draws();
    for (let i = 0; i < 12; i++) { pan(-300); expectNoGaps(); }
    for (let i = 0; i < 24; i++) { pan(300); expectNoGaps(); }
    expect(draws()).toBeGreaterThan(before);
    expect(draws()).toBeLessThan(before + 36); // fewer draws than steps
  });

  it('leaves no gap while zooming out step by step', () => {
    for (let i = 0; i < 30; i++) { wheel(100); expectNoGaps(); }
    expect(view().w).toBeGreaterThan(50000);
    expect(circuits()).toBe(project.feeders.length);
  });

  it('drops what is far out of view once zooming stops', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fit();
    for (let i = 0; i < 18; i++) wheel();
    expect(circuits()).toBe(project.feeders.length);
    act(() => { vi.advanceTimersByTime(100); });
    wheel();
    act(() => { vi.advanceTimersByTime(200); });
    expect(circuits()).toBe(project.feeders.length); // still zooming: each step starts the wait again
    act(() => { vi.advanceTimersByTime(100); });
    expect(circuits()).toBeLessThan(project.feeders.length);
    expectNoGaps();
  });

  it('draws the whole drawing on Fit, and centres on a board picked in the results', () => {
    fit();
    expect(view()).toMatchObject({ x: 0, y: 0 });
    expect(circuits()).toBe(project.feeders.length);
    const board = project.boards[3];
    draw(project, { focus: { kind: 'board', id: board.id, n: 1 } });
    expect(view().w).toBe(1400);
    expect(host.querySelector(`[data-lv-id="board:${board.id}"]`)).not.toBeNull();
    expectNoGaps();
  });

  it('keeps the zoom and position through an edit, and opens another project as new', () => {
    wheel();
    pan(-50);
    const a = view();
    draw({ ...project, feeders: project.feeders.map((f, i) => (i ? f : { ...f, loadKw: f.loadKw + 1 })) });
    expect(view()).toEqual(a);
    expectNoGaps();
    draw({ ...project, id: 'another' });
    expect(view().w).toBe(1400);
    expect(view().x).not.toBe(a.x);
  });

  it('moves the grid with the view', () => {
    wheel();
    const v = view(), grid = host.querySelector('.grid-bg > rect');
    if (!grid) return; // the grid is off
    expect(Number(grid.getAttribute('x'))).toBeCloseTo(v.x - v.w * 2);
    expect(Number(grid.getAttribute('y'))).toBeCloseTo(v.y - v.h * 2);
    expect(Number(grid.getAttribute('width'))).toBeCloseTo(v.w * 5);
    expect(Number(grid.getAttribute('height'))).toBeCloseTo(v.h * 5);
  });

  it('follows the zoom with text detail set to auto, drawing again only when the detail changes', () => {
    localStorage.setItem('lvds.sldDetail', 'auto');
    act(() => root.unmount());
    root = createRoot(host);
    draw();
    fit();
    const canvas = () => host.querySelector<HTMLElement>('.sysdiag')!;
    expect(canvas().className).toContain('lod-far');
    expect(canvas().style.getPropertyValue('--lod-fs')).toBe('22.0px');
    const before = draws();
    wheel();
    wheel();
    expect(draws()).toBe(before); // the same detail and text size
    expect(canvas().className).toContain('lod-far');
    for (let i = 0; i < 40 && canvas().className.includes('lod-far'); i++) wheel();
    expect(draws()).toBeGreaterThan(before);
    expect(canvas().className).toContain('lod-mid');
    expect(host.querySelector('.lod-hint')!.textContent).toContain('cables and results hidden');
    for (let i = 0; i < 40 && canvas().className.includes('lod-mid'); i++) wheel();
    expect(canvas().className).not.toContain('lod-');
    expect(host.querySelector('.lod-hint')).toBeNull();
  });

  it('leaves no trace on the drawing', () => {
    fit();
    const clean = svg().outerHTML;
    for (let i = 0; i < 6; i++) wheel();
    pan(-200);
    key('ArrowLeft');
    fit();
    expect(svg().outerHTML).toBe(clean);
  });
});
