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
/** The cursor and snap name last reported (not the pixel size after them). */
const lastCursor = () => onCursor.mock.calls[onCursor.mock.calls.length - 1]?.slice(0, 2) as [[number, number] | null, string | undefined];

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

  const named = (file: string, over: Partial<CadView> = {}) => ({ ...drawing([]), file, ...over }) as CadView;

  it('keeps each drawing open in its tab, and closes them all when the app goes', () => {
    act(() => root.render(<Host />));
    const a = named('a.dxf'), b = named('b.dxf');
    act(() => cad.open(a));
    act(() => cad.open(a)); // the same one again stays open
    act(() => cad.open(b));
    expect(cad.drawings).toEqual([a, b]);
    expect(cad.view).toBe(b);
    expect(a.close).not.toHaveBeenCalled();
    expect(b.close).not.toHaveBeenCalled();
    act(() => root.render(null));
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledTimes(1);
  });

  it('shows the tab to the right when the one showing closes, else the last, and gives back each engine once', () => {
    act(() => root.render(<Host />));
    const [a, b, c] = ['a.dxf', 'b.dxf', 'c.dxf'].map((f) => named(f));
    for (const v of [a, b, c]) act(() => cad.open(v));
    act(() => cad.show(b));
    let done: string | undefined;
    act(() => { done = cad.close([b]); });
    expect(done).toBe('b.dxf closed. What you drew stays in the project.');
    expect(cad.drawings).toEqual([a, c]);
    expect(cad.view).toBe(c);
    expect(b.close).toHaveBeenCalledTimes(1);
    act(() => { cad.close([c]); });
    expect(cad.view).toBe(a);
    act(() => { done = cad.close([c]); }); // already closed: nothing to do
    expect(done).toBeUndefined();
    expect(c.close).toHaveBeenCalledTimes(1);
    act(() => { cad.close([a]); });
    expect(cad.view).toBeNull();
    expect(cad.drawings).toEqual([]);
    act(() => root.render(null));
    for (const v of [a, b, c]) expect(v.close).toHaveBeenCalledTimes(1);
  });

  it('leaves the showing tab when another closes; Close others and Close all', () => {
    act(() => root.render(<Host />));
    const [a, b, c] = ['a.dxf', 'b.dxf', 'c.dxf'].map((f) => named(f));
    for (const v of [a, b, c]) act(() => cad.open(v));
    act(() => { cad.close([a]); });
    expect(cad.view).toBe(c);
    act(() => { cad.close(cad.drawings.filter((v) => v !== b)); }); // the showing tab goes: the one kept shows
    expect(cad.drawings).toEqual([b]);
    expect(cad.view).toBe(b);
    const d = named('d.dxf');
    act(() => cad.open(d));
    let done: string | undefined;
    act(() => { done = cad.close(); });
    expect(done).toBe('2 drawings closed. What you drew stays in the project.');
    expect(cad.view).toBeNull();
  });

  it('goes to the tab of a file opened again unchanged, and gives back the copy just read', () => {
    act(() => root.render(<Host />));
    const a = named('a.dxf', { path: '/x/a.dxf', bytes: new Uint8Array([1, 2]) }), b = named('b.dxf');
    act(() => cad.open(a));
    act(() => cad.open(b));
    const again = named('A.DXF', { path: '/x/a.dxf', bytes: new Uint8Array([1, 2]) });
    act(() => cad.open(again));
    expect(cad.drawings).toEqual([a, b]);
    expect(cad.view).toBe(a);
    expect(again.close).toHaveBeenCalledTimes(1);
    expect(a.close).not.toHaveBeenCalled();
    expect(cad.history[cad.history.length - 1]).toBe('a.dxf is already open');
  });

  it('lets a file changed on disk, or of the same name from another folder, take over its tab', () => {
    act(() => root.render(<Host />));
    const a = named('a.dxf', { path: '/x/a.dxf', bytes: new Uint8Array([1, 2]) }), b = named('b.dxf');
    act(() => cad.open(a));
    act(() => cad.open(b));
    const changed = named('a.dxf', { path: '/x/a.dxf', bytes: new Uint8Array([1, 3]) });
    act(() => cad.open(changed));
    expect(cad.drawings).toEqual([changed, b]);
    expect(cad.view).toBe(changed);
    expect(a.close).toHaveBeenCalledTimes(1);
    const moved = named('a.dxf', { path: '/y/a.dxf', bytes: new Uint8Array([1, 3]) });
    act(() => cad.open(moved));
    expect(cad.drawings).toEqual([moved, b]);
    expect(changed.close).toHaveBeenCalledTimes(1);
  });

  it('puts the next revision of a plan in the tab of the one it replaces', () => {
    act(() => root.render(<Host />));
    const [a, b, c] = ['a.dxf', 'b.dxf', 'c.dxf'].map((f) => named(f));
    for (const v of [a, b, c]) act(() => cad.open(v));
    const revB = named('b-rev2.dxf');
    act(() => cad.open(revB, b));
    expect(cad.drawings).toEqual([a, revB, c]);
    expect(cad.view).toBe(revB);
    expect(b.close).toHaveBeenCalledTimes(1);
    // A revision whose file is already in another tab: both tabs become one.
    const cAgain = named('c.dxf', { path: '/new/c.dxf' });
    act(() => cad.open(cAgain, a));
    expect(cad.drawings).toEqual([cAgain, revB]);
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it('finds a tab by file name, in any case', () => {
    act(() => root.render(<Host />));
    const a = named('Plan-A.dwg');
    act(() => cad.open(a));
    expect(cad.tabOf('plan-a.DWG')).toBe(a);
    expect(cad.tabOf('other.dwg')).toBeUndefined();
    expect(cad.tabOf('')).toBeUndefined();
  });

  it('closes every tab when another project opens, not when the same one is opened again', () => {
    act(() => root.render(<Host />));
    const a = named('a.dxf'), b = named('b.dxf');
    act(() => cad.open(a));
    act(() => cad.open(b));
    act(() => cad.projectOpened('p1'));
    expect(cad.drawings).toEqual([a, b]);
    act(() => cad.projectOpened('p2'));
    expect(cad.drawings).toEqual([]);
    expect(cad.view).toBeNull();
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledTimes(1);
  });

  it('remembers the drawing showing as the one to reopen, and clears what was selected on another', () => {
    localStorage.clear();
    act(() => root.render(<Host />));
    const a = named('a.dxf', { path: '/x/a.dxf' }), b = named('b.dxf', { path: '/x/b.dxf' });
    act(() => cad.open(a));
    act(() => cad.open(b));
    expect(localStorage.getItem('lvds.cad.p1')).toBe('/x/b.dxf');
    act(() => cad.setSelected('sk:1'));
    act(() => cad.show(a));
    expect(localStorage.getItem('lvds.cad.p1')).toBe('/x/a.dxf');
    expect(cad.selected).toBeNull();
    act(() => { cad.close(); });
    expect(localStorage.getItem('lvds.cad.p1')).toBe('/x/a.dxf');
  });

  it('says when the drawings open are using a lot of memory', () => {
    act(() => root.render(<Host />));
    const big = (file: string) => { const v = named(file); v.info = { ...v.info, segments: 600_000 }; return v; };
    act(() => cad.open(big('a.dxf')));
    expect(cad.history[cad.history.length - 1]).toMatch(/^Command: OPEN {2}a\.dxf/);
    act(() => cad.open(big('b.dxf')));
    expect(cad.history[cad.history.length - 1]).toBe('2 drawings open use about 1.2 GB of memory. Close the ones you do not need (CLOSE).');
  });
});

describe('where a drawing was left', () => {
  const near = (a: [number, number] | null, b: [number, number] | null) => {
    expect(a![0]).toBeCloseTo(b![0], 6);
    expect(a![1]).toBeCloseTo(b![1], 6);
  };
  const off: CadToggles = { ...ON, osnap: false };
  const wheel = () => act(() => { canvas().dispatchEvent(new WheelEvent('wheel', { clientX: 100, clientY: 100, deltaY: -240, bubbles: true })); });
  const at = () => { mouse('mousemove', 300, 200); return lastCursor()[0]; };
  const other = () => ({ ...drawing([]), file: 'other.dxf', info: { ...view.info, extents: [0, 0, 4000, 2500] } }) as unknown as CadView;

  it('goes back to its zoom and pan when its tab shows again; one not moved is fitted', () => {
    draw({ toggles: off });
    const fitted = at();
    wheel();
    const zoomed = at();
    expect(zoomed).not.toEqual(fitted);
    const b = other();
    draw({ toggles: off, view: b });
    const fittedB = at();
    expect(fittedB![0]).toBeGreaterThan(fitted![0] * 3);
    draw({ toggles: off, view });
    near(at(), zoomed);
    draw({ toggles: off, view: b });
    near(at(), fittedB);
  });

  it('keeps it when the page is left and shown again', () => {
    draw({ toggles: off });
    wheel();
    const zoomed = at();
    act(() => root.render(null));
    draw({ toggles: off });
    near(at(), zoomed);
  });

  it('keeps it when the window changes size; a drawing not moved is fitted again', () => {
    let resized = () => {};
    const stub = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class { constructor(cb: () => void) { resized = cb; } observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    try {
      draw({ toggles: off });
      const model = host.querySelector('.cad-model')!;
      const widen = (w: number) => {
        Object.defineProperties(model, { clientWidth: { value: w, configurable: true }, clientHeight: { value: 500, configurable: true } });
        act(() => resized());
      };
      const fitted = at();
      widen(1600);
      expect(at()).not.toEqual(fitted);
      wheel();
      const zoomed = at();
      widen(900);
      near(at(), zoomed);
    } finally { globalThis.ResizeObserver = stub; }
  });

  it('forgets it on Fit', () => {
    draw({ toggles: off });
    const fitted = at();
    wheel();
    draw({ toggles: off, fitKey: 2 });
    near(at(), fitted);
    act(() => root.render(null));
    draw({ toggles: off, fitKey: 2 });
    near(at(), fitted);
  });

  it('forgets it on the 0 key', () => {
    draw({ toggles: off });
    const fitted = at();
    wheel();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' })); });
    near(at(), fitted);
    act(() => root.render(null));
    draw({ toggles: off });
    near(at(), fitted);
  });
});
