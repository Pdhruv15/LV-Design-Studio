// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadCanvas, { type CadToggles } from './CadCanvas';
import type { CadView } from '../../engines/cad/cadEngine';
import type { SketchItem } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class Stub { moveTo() {} lineTo() {} closePath() {} arc() {} observe() {} disconnect() {} }
Object.assign(globalThis, { Path2D: Stub, ResizeObserver: Stub });

type M = [number, number, number, number, number, number];
/** A 2D context that keeps the transform (with save / restore) and notes the transform each stroke is made with. */
function recorder() {
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [], strokes: { m: M; lineWidth: number }[] = [], scales: number[][] = [], words: string[] = [];
  const state: Record<string | symbol, unknown> = { lineWidth: 1 };
  const own: Record<string, unknown> = {
    setTransform: (...a: number[]) => { m = a as M; },
    save: () => { stack.push(m); },
    restore: () => { m = stack.pop() ?? m; },
    stroke: () => { strokes.push({ m, lineWidth: state.lineWidth as number }); },
    scale: (...a: number[]) => { scales.push(a); },
    fillText: (t: string) => { words.push(t); },
    measureText: () => ({ width: 10 })
  };
  const ctx = new Proxy({}, {
    get: (_, k) => (typeof k === 'string' && k in own ? own[k] : k in state ? state[k] : () => {}),
    set: (_, k, v) => { state[k] = v; return true; }
  });
  return { ctx, strokes, scales, words, depth: () => stack.length };
}

function drawing(texts: unknown[] = []) {
  return {
    file: 'plan.dxf', bytes: new Uint8Array(), engine: 'worker', segs: new Float32Array(), segLayers: new Uint16Array(), segColors: new Uint32Array(), segLinetypes: new Uint16Array(),
    info: { format: 'DXF', units: 4, origin: [0, 0], extents: [0, 0, 8000, 5000], layers: [], texts: texts as never[], segments: 0, snaps: 0, truncated: false, linetypes: [[]], fills: [] },
    snap: vi.fn(async () => new Float64Array()), pick: vi.fn(async () => null), outlines: () => [], blocks: () => [], close: vi.fn()
  } as unknown as CadView;
}

const OFF: CadToggles = { snap: false, osnap: false, ortho: false, grid: false };
let root: Root, host: HTMLDivElement, rec: ReturnType<typeof recorder>;

beforeEach(() => {
  rec = recorder();
  HTMLCanvasElement.prototype.getContext = (() => rec.ctx) as unknown as HTMLCanvasElement['getContext'];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('drawn objects on the canvas', () => {
  it('draws every object in drawing units, also those after an object with no words', () => {
    const sketch: SketchItem[] = [
      { id: 'a', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [1000, 0]] },
      { id: 'b', kind: 'circle', layer: 'LV-SKETCH', pts: [[2000, 2000]], r: 510 },
      { id: 'c', kind: 'text', layer: 'LV-SKETCH', pts: [[0, 3000]], text: 'DB-1', h: 250 },
      { id: 'd', kind: 'circle', layer: 'LV-SKETCH', pts: [[4000, 2000]], r: 510 }
    ];
    act(() => root.render(<CadCanvas view={drawing()} layersOn={new Uint8Array()} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} sketch={sketch} />));
    // The view is zoomed out (under 0.1 pixel a unit), so a line drawn in screen pixels would be some 16 pixels wide.
    const drawn = rec.strokes.filter((s) => s.m[3] < 0); // drawing units: y up, so a negative y scale
    expect(drawn.length % 3).toBe(0); // the line and both circles, each time the view is drawn
    expect(drawn.length).toBeGreaterThan(0);
    for (const s of drawn) expect(s.lineWidth * -s.m[3]).toBeCloseTo(1.5);
    // Nothing on the screen stroked wider than 3 pixels (a picked object).
    expect(rec.strokes.filter((s) => s.lineWidth * Math.abs(s.m[3]) > 3)).toEqual([]);
    expect(rec.depth()).toBe(0);
  });

  it('squeezes or stretches a text fitted to a width, and leaves the others alone', () => {
    const texts = [
      { x: 100, y: 100, h: 2000, rot: 0, s: 'FIT', layer: 0, rgb: 0, align: 0, w: 5000 },
      { x: 100, y: 3000, h: 2000, rot: 0, s: 'PLAIN', layer: 0, rgb: 0, align: 0 }
    ];
    act(() => root.render(<CadCanvas view={drawing(texts)} layersOn={new Uint8Array([1])} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} />));
    expect(rec.words).toContain('FIT');
    expect(rec.words).toContain('PLAIN');
    // Natural width 10 (measureText), the width asked 5000 drawing units: x is scaled by 5000 × the view scale / 10, y by 1.
    const fitted = rec.scales.filter((a) => a[1] === 1 && a[0] !== 1);
    expect(fitted.length).toBeGreaterThan(0);
    // Per draw: one text is scaled, the other is not.
    expect(fitted.length).toBe(rec.words.filter((w) => w === 'FIT').length);
  });
});
