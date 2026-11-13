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
type Stroke = { w: number; ops: (string | number)[][] };
let strokes: Stroke[] = [];
/** A drawing context for the cursor layer that records its strokes; every other call does nothing. */
function recorder() {
  let ops: (string | number)[][] = [];
  const props: Record<string | symbol, unknown> = { lineWidth: 1 };
  const own: Record<string, (...a: number[]) => unknown> = {
    beginPath: () => { ops = []; },
    moveTo: (x, y) => { ops.push(['M', x, y]); },
    lineTo: (x, y) => { ops.push(['L', x, y]); },
    rect: (x, y, w, h) => { ops.push(['R', x, y, w, h]); },
    stroke: () => { strokes.push({ w: props.lineWidth as number, ops: [...ops] }); },
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
const OFF: CadToggles = { snap: false, osnap: false, ortho: false, grid: false };
let root: Root, host: HTMLDivElement;
const draw = (props: Partial<Parameters<typeof CadCanvas>[0]> = {}) => act(() => root.render(<CadCanvas view={view} layersOn={new Uint8Array()} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} {...props} />));
const move = (x: number, y: number) => act(() => { host.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true })); });
/** The cursor as last drawn: the 3 px outline stroke and the 1 px stroke over it. */
function cursorAt(x: number, y: number) {
  strokes = [];
  move(x, y);
  const i = strokes.map((s) => s.w).lastIndexOf(1);
  return { outline: strokes[i - 1], line: strokes[i] };
}

beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
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
    expect(outline).toEqual({ w: 3, ops: line.ops });
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
