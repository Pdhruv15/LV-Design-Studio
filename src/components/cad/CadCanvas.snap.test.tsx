// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadCanvas, { type CadToggles } from './CadCanvas';
import { useCad, type CadState } from './cadState';
import { SNAP, type CadView } from '../../engines/cad/cadEngine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no canvas drawing or resize observer: drawing is skipped, the view is 800 × 500.
class Stub { moveTo() {} lineTo() {} closePath() {} observe() {} disconnect() {} }
Object.assign(globalThis, { Path2D: Stub, ResizeObserver: Stub });
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];

type Question = { x: number; y: number; answer: (s: number[]) => Promise<void> };
/** A drawing whose engine answers only when told to. */
function drawing(asked: Question[]) {
  return {
    file: 'plan.dxf', bytes: new Uint8Array(), engine: 'worker', segs: new Float32Array(), segLayers: new Uint16Array(), segColors: new Uint32Array(), segLinetypes: new Uint16Array(),
    info: { format: 'DXF', units: 4, origin: [0, 0], extents: [0, 0, 800, 500], layers: [], texts: [], segments: 0, snaps: 0, truncated: false, linetypes: [[]], fills: [] },
    snap: vi.fn((x: number, y: number) => new Promise<Float64Array>((resolve) => {
      asked.push({ x, y, answer: (s) => act(async () => { resolve(new Float64Array(s)); }) });
    })),
    pick: vi.fn(async () => null), outlines: () => [], blocks: () => [], close: vi.fn()
  } as unknown as CadView;
}

const ON: CadToggles = { snap: false, osnap: true, ortho: false, grid: false };
let root: Root, host: HTMLDivElement, asked: Question[], view: CadView;
const onCursor = vi.fn(), onClick = vi.fn();
const layers = new Uint8Array();
const draw = (props: Partial<Parameters<typeof CadCanvas>[0]> = {}) => act(() => root.render(<CadCanvas view={view} layersOn={layers} toggles={ON} fitKey={1} onCursor={onCursor} onClick={onClick} {...props} />));
const canvas = () => host.querySelector('canvas.cad-over')!;
const mouse = (type: string, x = 0, y = 0) => act(() => { canvas().dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true })); });
const lastCursor = () => onCursor.mock.calls[onCursor.mock.calls.length - 1] as [[number, number] | null, string | undefined];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  asked = [];
  view = drawing(asked);
  onCursor.mockClear();
  onClick.mockClear();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('snap answers from the engine', () => {
  it('asks one question at a time, and only the newest of the moves made meanwhile', async () => {
    draw();
    mouse('mousemove', 10, 10);
    mouse('mousemove', 20, 20);
    mouse('mousemove', 30, 30);
    expect(asked).toHaveLength(1);
    const newest = lastCursor()[0]!;
    await asked[0].answer([]);
    expect(asked).toHaveLength(2);
    expect([asked[1].x, asked[1].y]).toEqual(newest);
    await asked[1].answer([]);
    expect(asked).toHaveLength(2);
  });

  it('shows the answer for where the cursor is, not an older one', async () => {
    draw();
    mouse('mousemove', 10, 10);
    mouse('mousemove', 300, 200);
    await asked[0].answer([111, 222, SNAP.endpoint]);
    expect(lastCursor()[0]).not.toEqual([111, 222]);
    await asked[1].answer([333, 444, SNAP.midpoint]);
    expect(lastCursor()).toEqual([[333, 444], 'Midpoint']);
  });

  it('keeps the cursor moving while it waits, with the last answer while that point is in reach', async () => {
    draw();
    mouse('mousemove', 100, 100);
    const [x, y] = [asked[0].x, asked[0].y];
    await asked[0].answer([x + 2, y, SNAP.endpoint]);
    expect(lastCursor()).toEqual([[x + 2, y], 'Endpoint']);
    mouse('mousemove', 101, 100); // asks again
    mouse('mousemove', 102, 100); // still waiting: the last answer is close by
    expect(lastCursor()).toEqual([[x + 2, y], 'Endpoint']);
    mouse('mousemove', 300, 300); // far from it: the plain cursor, no snap
    expect(lastCursor()[1]).toBeUndefined();
    expect(lastCursor()[0]).not.toEqual([x + 2, y]);
  });

  it('lands a click on the answer for where it was made, once that has come', async () => {
    draw();
    mouse('mousemove', 100, 100);
    await asked[0].answer([]);
    mouse('mouseup', 100, 100);
    expect(onClick).not.toHaveBeenCalled();
    expect(asked).toHaveLength(2);
    await asked[1].answer([555, 123, SNAP.center]);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toEqual([555, 123]);
    expect(onClick.mock.calls[0][1]).toBeCloseTo(1 / 0.92);
  });

  it('delivers quick clicks in order, each to the page as it is by then', async () => {
    draw();
    mouse('mousemove', 100, 100);
    await asked[0].answer([]);
    mouse('mouseup', 100, 100);
    mouse('mouseup', 100, 100);
    const newer = vi.fn();
    draw({ onClick: newer });
    await asked[1].answer([1, 1, SNAP.endpoint]);
    await asked[2].answer([2, 2, SNAP.endpoint]);
    expect(onClick).not.toHaveBeenCalled();
    expect(newer.mock.calls.map((c) => c[0])).toEqual([[1, 1], [2, 2]]);
  });

  it('clicks at once, without the engine, with object snap off', () => {
    draw({ toggles: { ...ON, osnap: false } });
    mouse('mousemove', 100, 100);
    expect(lastCursor()[0]).toBeTruthy();
    mouse('mouseup', 100, 100);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(asked).toHaveLength(0);
  });

  it('wins over points drawn in the app only when nearer, and grid snap applies with no answer', async () => {
    draw({ extraSnaps: [{ x: 0, y: 0, kind: SNAP.node }] });
    mouse('mousemove', 100, 100);
    const [x, y] = [asked[0].x, asked[0].y];
    await asked[0].answer([x + 1, y, SNAP.endpoint]);
    expect(lastCursor()).toEqual([[x + 1, y], 'Endpoint']);
    draw({ toggles: { ...ON, snap: true } });
    mouse('mousemove', 300, 300);
    await asked[1].answer([]);
    const [at] = lastCursor();
    expect(at![0] % 20).toBeCloseTo(0);
  });

  it('drops an answer that comes after the mouse has left', async () => {
    draw();
    mouse('mousemove', 100, 100);
    act(() => { canvas().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); }); // React's mouse leave
    expect(lastCursor()).toEqual([null]);
    await asked[0].answer([1, 2, SNAP.endpoint]);
    expect(lastCursor()).toEqual([null]);
  });

  it('drops an answer from the drawing before, and asks the new one', async () => {
    draw();
    mouse('mousemove', 100, 100);
    const before = asked[0];
    const later: Question[] = [];
    view = drawing(later);
    draw();
    await before.answer([1, 2, SNAP.endpoint]);
    expect(lastCursor()?.[0] ?? null).not.toEqual([1, 2]);
    mouse('mousemove', 110, 100);
    expect(later).toHaveLength(1);
  });
});

describe('the open drawing', () => {
  let cad: CadState;
  function Host() { cad = useCad('p1'); return null; }

  it('closes the drawing it replaces, and the last one when the app goes', () => {
    act(() => root.render(<Host />));
    const a = drawing([]), b = drawing([]);
    act(() => cad.open(a));
    expect(a.close).not.toHaveBeenCalled();
    act(() => cad.open(a)); // the same one again stays open
    expect(a.close).not.toHaveBeenCalled();
    act(() => cad.open(b));
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).not.toHaveBeenCalled();
    act(() => root.render(null));
    expect(b.close).toHaveBeenCalledTimes(1);
  });
});
