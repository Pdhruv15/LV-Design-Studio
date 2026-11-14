// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadCanvas, { type CadToggles } from './CadCanvas';
import type { CadView } from '../../engines/cad/cadEngine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
/** The canvas's resize observers: called when a test gives the drawing's box a new size. */
let observers: (() => void)[] = [];
class Observer { constructor(cb: () => void) { observers.push(cb); } observe() {} disconnect() {} }
class Path { moveTo() {} lineTo() {} closePath() {} }
Object.assign(globalThis, { Path2D: Path, ResizeObserver: Observer });

/** The boxes cleared on each canvas, in its own pixels (the transform set at the time applied); every other call does
 * nothing. */
const cleared = new WeakMap<HTMLCanvasElement, number[][]>();
function recorder(c: HTMLCanvasElement) {
  let m = [1, 0, 0, 1, 0, 0];
  const own: Record<string, (...a: number[]) => unknown> = {
    setTransform: (...a) => { m = a; },
    clearRect: (x, y, w, h) => { cleared.set(c, [...(cleared.get(c) ?? []), [m[0] * x + m[4], m[3] * y + m[5], m[0] * w, m[3] * h]]); },
    measureText: () => ({ width: 0 })
  };
  return new Proxy({}, { get: (_, k) => (typeof k === 'string' && k in own ? own[k] : () => ({ width: 0 })), set: () => true });
}
const contexts = new WeakMap<HTMLCanvasElement, unknown>();
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
  if (!contexts.has(this)) contexts.set(this, recorder(this));
  return contexts.get(this);
} as unknown as HTMLCanvasElement['getContext'];

/** A drawing of its own per test (where a drawing was zoomed to is kept per drawing). */
const drawing = () => ({
  file: 'plan.dxf', bytes: new Uint8Array(), engine: 'worker', segs: new Float32Array(), segLayers: new Uint16Array(), segColors: new Uint32Array(), segLinetypes: new Uint16Array(),
  info: { format: 'DXF', units: 4, origin: [0, 0], extents: [0, 0, 800, 500], layers: [], texts: [], segments: 0, snaps: 0, truncated: false, linetypes: [[]], fills: [] },
  snap: vi.fn(async () => new Float64Array()), pick: vi.fn(async () => null), outlines: () => [], blocks: () => [], close: vi.fn()
}) as unknown as CadView;
const OFF: CadToggles = { snap: false, osnap: false, ortho: false, grid: false };
let root: Root, host: HTMLDivElement;
const draw = () => act(() => root.render(<CadCanvas view={drawing()} layersOn={new Uint8Array()} toggles={OFF} fitKey={1} onCursor={() => {}} />));
const over = () => host.querySelector('canvas.cad-over') as HTMLCanvasElement;
/** The cursor layer's backing size (device pixels) and the box it last cleared. */
const layer = () => ({ size: [over().width, over().height], cleared: (cleared.get(over()) ?? []).slice(-1)[0] });
/** Gives the drawing's box a new size (CSS pixels), as the page's layout does, and lets the canvas see it. */
const resize = (w: number, h: number) => act(() => {
  const box = host.querySelector('.cad-model')!;
  Object.defineProperty(box, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(box, 'clientHeight', { value: h, configurable: true });
  for (const o of observers) o();
});

beforeEach(() => {
  observers = [];
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('the cursor layer keeps to the size of the drawing', () => {
  it('a shorter or taller canvas, its width the same: the layer takes the new height and is cleared whole', () => {
    draw();
    expect(layer().size).toEqual([1600, 1000]);
    // Shorter (a panel under the drawing grew): rows below the new height used to stay, never cleared, so what
    // crossed them while zooming (rubber bands, previews, grips) piled up along the bottom of the drawing.
    resize(800, 460);
    expect(layer()).toEqual({ size: [1600, 920], cleared: [0, 0, 1600, 920] });
    // Taller: the layer grows with it rather than being stretched over it.
    resize(800, 540);
    expect(layer()).toEqual({ size: [1600, 1080], cleared: [0, 0, 1600, 1080] });
  });

  it('zoomed first (the view stays where it was left): a resize alone redraws the layer at the new size', () => {
    draw();
    act(() => { over().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 300, clientY: 200, bubbles: true })); });
    resize(800, 460);
    expect(layer()).toEqual({ size: [1600, 920], cleared: [0, 0, 1600, 920] });
  });
});
