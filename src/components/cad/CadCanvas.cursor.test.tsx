// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadCanvas, { type CadToggles } from './CadCanvas';
import { DRAFT_DEFAULTS } from '../../model/cadDraft';
import type { CadView } from '../../engines/cad/cadEngine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class Stub { moveTo() {} lineTo() {} closePath() {} observe() {} disconnect() {} }
Object.assign(globalThis, { Path2D: Stub, ResizeObserver: Stub });

/** One stroke on the cursor layer: its width and the path's moves, lines and boxes since the last beginPath. */
type Stroke = { w: number; ops: (string | number)[][]; c?: unknown; alpha?: unknown };
let strokes: Stroke[] = [];
/** Filled squares (grips): their colour and box. */
let fills: { c: unknown; box: number[] }[] = [];
/** Outlined boxes (the selection window) with their colour and dash, and the texts written (its name). */
let frames: { c: unknown; dash: unknown; box: number[] }[] = [], texts: string[] = [];
/** A drawing context for the cursor layer that records its strokes; every other call does nothing. */
function recorder() {
  let ops: (string | number)[][] = [];
  const props: Record<string | symbol, unknown> = { lineWidth: 1 };
  const own: Record<string, (...a: number[]) => unknown> = {
    beginPath: () => { ops = []; },
    moveTo: (x, y) => { ops.push(['M', x, y]); },
    lineTo: (x, y) => { ops.push(['L', x, y]); },
    rect: (x, y, w, h) => { ops.push(['R', x, y, w, h]); },
    stroke: () => { strokes.push({ w: props.lineWidth as number, ops: [...ops], c: props.strokeStyle, alpha: props.globalAlpha }); },
    fillRect: (x, y, w, h) => { fills.push({ c: props.fillStyle, box: [x, y, w, h] }); },
    arc: (x, y, r) => { ops.push(['A', x, y, r]); },
    strokeRect: (x, y, w, h) => { frames.push({ c: props.strokeStyle, dash: props.dash, box: [x, y, w, h] }); },
    setLineDash: ((d: number[]) => { props.dash = d; }) as unknown as (...a: number[]) => unknown,
    fillText: ((t: string) => { texts.push(t); }) as unknown as (...a: number[]) => unknown,
    measureText: () => ({ width: 0 })
  };
  return new Proxy({}, {
    get: (_, k) => (typeof k === 'string' && k in own ? own[k] : k in props ? props[k] : () => ({ width: 0 })),
    set: (_, k, v) => { props[k] = v; return true; }
  });
}
const contexts = new WeakMap<HTMLCanvasElement, unknown>();
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
  if (!contexts.has(this)) contexts.set(this, recorder());
  return contexts.get(this);
} as unknown as HTMLCanvasElement['getContext'];

const view = {
  file: 'plan.dxf', bytes: new Uint8Array(), engine: 'worker', segs: new Float32Array(), segLayers: new Uint16Array(), segColors: new Uint32Array(), segLinetypes: new Uint16Array(),
  info: { format: 'DXF', units: 4, origin: [0, 0], extents: [0, 0, 800, 500], layers: [], texts: [], segments: 0, snaps: 0, truncated: false, linetypes: [[]], fills: [] },
  snap: vi.fn(async () => new Float64Array()), pick: vi.fn(async () => null), outlines: () => [], blocks: () => [], close: vi.fn()
} as unknown as CadView;
const last = <T,>(a: T[]): T => a[a.length - 1];
const OFF: CadToggles = { snap: false, osnap: false, ortho: false, grid: false };
let root: Root, host: HTMLDivElement;
const draw = (props: Partial<Parameters<typeof CadCanvas>[0]> = {}) => act(() => root.render(<CadCanvas view={view} layersOn={new Uint8Array()} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} {...props} />));
const over = () => host.querySelector('canvas.cad-over') as HTMLCanvasElement;
const press = (type: string, x: number, y: number, button = 0) => act(() => { over().dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true })); });
const key = (type: 'keydown' | 'keyup', k: string, code = k) => act(() => { window.dispatchEvent(new KeyboardEvent(type, { key: k, code })); });
const move = (x: number, y: number) => act(() => { host.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true })); });
/** The cursor as last drawn: the 3 px outline stroke and the 1 px stroke over it. */
function cursorAt(x: number, y: number) {
  strokes = [];
  move(x, y);
  const i = strokes.map((s) => s.w).lastIndexOf(1);
  return { outline: strokes[i - 1], line: { w: strokes[i].w, ops: strokes[i].ops } };
}

beforeEach(() => { fills = []; frames = []; texts = []; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('the cursor follows what the canvas waits for', () => {
  it('no command: the crosshair stops 2 px outside a 12 px pick box, over an outline of the same shape', () => {
    draw();
    const { outline, line } = cursorAt(300, 200);
    const c = [300.5, 200.5];
    expect(line.ops).toEqual([
      ['M', 0, c[1]], ['L', c[0] - 8, c[1]], ['M', c[0] + 8, c[1]], ['L', 800, c[1]],
      ['M', c[0], 0], ['L', c[0], c[1] - 8], ['M', c[0], c[1] + 8], ['L', c[0], 500],
      ['R', c[0] - 6, c[1] - 6, 12, 12]
    ]);
    expect(outline).toMatchObject({ w: 3, ops: line.ops });
  });

  it('a point wanted: the crosshair only, its lines meeting at the point', () => {
    draw({ cursorMode: 'point' });
    const { line } = cursorAt(300, 200);
    expect(line.ops).toEqual([
      ['M', 0, 200.5], ['L', 300.5, 200.5], ['M', 300.5, 200.5], ['L', 800, 200.5],
      ['M', 300.5, 0], ['L', 300.5, 200.5], ['M', 300.5, 200.5], ['L', 300.5, 500]
    ]);
  });

  it('objects wanted: the pick box only, at the size set', () => {
    draw({ cursorMode: 'objects', draft: { ...DRAFT_DEFAULTS, pickBoxPx: 20 } });
    const { line } = cursorAt(300, 200);
    expect(line.ops).toEqual([['R', 290.5, 190.5, 20, 20]]);
  });

  it('a short crosshair (DS, Cursor %) keeps the gap around the box', () => {
    draw({ draft: { ...DRAFT_DEFAULTS, crossPct: 10 } });
    const { line } = cursorAt(300, 200);
    // 10 % of the longer side (800 px): 40 px each way from the centre.
    expect(line.ops.slice(0, 4)).toEqual([['M', 260.5, 200.5], ['L', 292.5, 200.5], ['M', 308.5, 200.5], ['L', 340.5, 200.5]]);
  });
});

describe('what a click would pick is marked first', () => {
  // The hover and grip colours from the theme, so they can be told apart from the snap colour.
  beforeEach(() => { document.documentElement.style.setProperty('--acc', '#f5b301'); document.documentElement.style.setProperty('--warn', '#f5c04a'); });
  const halo = () => strokes.find((s) => s.w === 7);

  it('an object of the opened drawing: its segments in amber at 40 %, over it', () => {
    const v = { ...view, segs: new Float32Array([0, 0, 100, 0]) } as unknown as CadView;
    draw({ view: v, hover: { seg: [0, 1] } });
    cursorAt(300, 200);
    expect(halo()).toMatchObject({ c: '#f5b301', alpha: 0.4 });
    expect(halo()!.ops).toHaveLength(2);
  });

  it('a device: a ring around its symbol', () => {
    draw({ hover: { device: 'd1' }, devices: [{ key: 'd1', x: 400, y: 250, r: 5, shape: 'circle', text: '', label: 'L1' }] });
    cursorAt(300, 200);
    expect(halo()!.ops.some((o) => o[0] === 'A')).toBe(true);
  });

  it('not while a point is wanted', () => {
    draw({ cursorMode: 'point', hover: { device: 'd1' }, devices: [{ key: 'd1', x: 400, y: 250, r: 5, shape: 'circle', text: '', label: 'L1' }] });
    cursorAt(300, 200);
    expect(halo()).toBeUndefined();
  });

  it('a grip under the pick box turns the hover colour, and the box locks onto it', () => {
    // Where the cursor lands at two screen points gives the drawing units per pixel; the grip goes 3 px right of it.
    const landed: [number, number][] = [];
    draw({ onCursor: (p) => { if (p) landed.push(p); } });
    cursorAt(300, 200);
    cursorAt(310, 200);
    const [a, b] = [landed[landed.length - 2], landed[landed.length - 1]];
    const grip: [number, number] = [a[0] + (3 * (b[0] - a[0])) / 10, a[1]];
    fills = [];
    draw({ grips: [grip] });
    const { line } = cursorAt(300, 200);
    expect(last(fills)!.c).toBe('#f5c04a');
    // The box is centred on the grip (3 px right of the cursor), not on the cursor.
    expect(last(line.ops)).toEqual(['R', 303.5 - 6, 200.5 - 6, 12, 12]);
    // Away from the grip: snap colour, box on the cursor.
    fills = [];
    const away = cursorAt(200, 100).line;
    expect(last(fills)!.c).not.toBe('#f5c04a');
    expect(last(away.ops)).toEqual(['R', 194.5, 94.5, 12, 12]);
  });
});

describe('window and crossing, Shift and the hand', () => {
  beforeEach(() => {
    for (const [k, v] of [['--res-cur', '#7fd1ff'], ['--ok', '#37d67a'], ['--cad-snap', '#37d67a'], ['--bad', '#ff5d6c']]) document.documentElement.style.setProperty(k, v);
  });

  it('left to right: a blue, solid window named "Window"; right to left: a green, dashed "Crossing"', () => {
    draw({ windowSelect: true });
    press('mousedown', 100, 100); move(200, 160);
    expect(last(frames)).toMatchObject({ c: '#7fd1ff', dash: [] });
    expect(texts).toContain('Window');
    press('mouseup', 200, 160);
    frames = []; texts = [];
    press('mousedown', 300, 100); move(200, 160);
    expect(last(frames)).toMatchObject({ c: '#37d67a', dash: [6, 4] });
    expect(texts).toContain('Crossing');
  });

  it('Shift with no command: + over an object a click would add, − over one already picked, nothing over empty space', () => {
    const dev = { key: 'd1', x: 400, y: 250, r: 5, shape: 'circle', text: '', label: 'L1' };
    const badge = () => strokes.filter((x) => x.w === 1.5).pop();
    draw({ hover: { device: 'd1' }, devices: [dev] });
    key('keydown', 'Shift');
    cursorAt(300, 200);
    expect(badge()!.ops).toHaveLength(4); // a + : two strokes
    draw({ hover: { device: 'd1', picked: true }, devices: [dev] });
    cursorAt(300, 200);
    expect(badge()).toMatchObject({ c: '#ff5d6c' });
    expect(badge()!.ops).toHaveLength(2); // a −
    draw({ hover: undefined, devices: [dev] });
    cursorAt(300, 200);
    expect(badge()).toBeUndefined();
    // Not while a command wants objects (Shift does not toggle there), nor once Shift is let go.
    draw({ cursorMode: 'objects', hover: { device: 'd1' }, devices: [dev] });
    cursorAt(300, 200);
    expect(badge()).toBeUndefined();
    key('keyup', 'Shift');
    draw({ hover: { device: 'd1' }, devices: [dev] });
    cursorAt(300, 200);
    expect(badge()).toBeUndefined();
  });

  it('panning: an open hand with Space or the Pan tool, closed while dragging, and no crosshair', () => {
    draw();
    expect(over().style.cursor).toBe('');
    key('keydown', ' ', 'Space');
    expect(over().style.cursor).toBe('grab');
    strokes = [];
    move(300, 200);
    expect(strokes.filter((x) => x.w === 1)).toHaveLength(0);
    key('keyup', ' ', 'Space');
    expect(over().style.cursor).toBe('');
    draw({ panLeft: true });
    expect(over().style.cursor).toBe('grab');
    press('mousedown', 300, 200);
    expect(over().style.cursor).toBe('grabbing');
    press('mouseup', 300, 200);
    expect(over().style.cursor).toBe('grab');
    // The middle button pans with any tool: closed hand while it is held.
    draw();
    press('mousedown', 300, 200, 1);
    expect(over().style.cursor).toBe('grabbing');
    press('mouseup', 300, 200, 1);
    expect(over().style.cursor).toBe('');
  });
});

