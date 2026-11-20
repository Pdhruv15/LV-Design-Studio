// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadPage from './CadPage';
import { useCad, type CadState } from './cadState';
import { useSheetUi } from '../sld/sheetUi';
import type { CadShow } from './cadObjectMenus';
import '../../engines/cad/cadOps'; // loaded ahead: the engine loads it on demand, which a busy test run can make slow
import { sampleProject } from '../../data/sampleProject';
import type { Project, SketchItem } from '../../types';
import { DRAFT_DEFAULTS, type DraftSettings } from '../../model/cadDraft';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// What the page last gave the canvas: the shadow before the click and the cursor's shape.
type Seen = { cutAway?: SketchItem[]; meets?: [number, number][]; preview?: SketchItem[]; cursorMode?: string; shadowDevices?: { x: number; y: number }[]; movingPoints?: [number, number][]; selectedSketch?: string | string[] | null };
const seen = vi.hoisted(() => ({ last: {} as Seen }));
vi.mock('./CadCanvas', async (importOriginal) => {
  const real = await importOriginal<typeof import('./CadCanvas')>();
  const Canvas = real.default;
  return { ...real, default: (p: Parameters<typeof Canvas>[0]) => { seen.last = { cutAway: p.cutAway, meets: p.meets, preview: p.preview, cursorMode: p.cursorMode, shadowDevices: p.shadowDevices, movingPoints: p.movingPoints, selectedSketch: p.selectedSketch }; return Canvas(p); } };
});
// jsdom has no canvas drawing or resize observer: drawing is skipped, the page still works (the view is 800 × 500).
class Stub { moveTo() {} lineTo() {} closePath() {} observe() {} disconnect() {} }
Object.assign(globalThis, { Path2D: Stub, ResizeObserver: Stub });
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];

const root0 = path.resolve(__dirname, '../../..');
const bytes = (rel: string) => new Uint8Array(readFileSync(path.join(root0, rel)));
const villa: Project = {
  ...sampleProject, id: 'p1', cadPlanLinks: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }] }], rooms: [] }
};
let root: Root, host: HTMLDivElement, state: CadState, project: Project;
const onChange = vi.fn((p: Project, _message: string) => { project = p; });
const onPrefs = vi.fn((_p: { draft: DraftSettings; autosaveMin: number }) => {});
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); localStorage.clear(); project = villa; onChange.mockClear();
  (window as { lvds?: unknown }).lvds = { cadFile: {
    engine: async () => bytes('electron/cad/lvds_cad_reader_bg.wasm'),
    sampleBytes: vi.fn(async (name: string) => ({ file: name, bytes: bytes(`electron/samples/${name}`) })),
    openBytes: vi.fn(async () => ({ file: 'plan.dwg', path: '/plans/plan.dwg', bytes: bytes('tests/fixtures/cad/plan-2018.dwg') }))
  } };
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; delete (window as { lvds?: unknown }).lvds; });

function Host({ start = villa, show }: { start?: Project; show?: (s: CadShow) => void }) {
  const cad = useCad('p1');
  const [p, setP] = useState(start);
  const sheetUi = useSheetUi();
  const [draft, setDraft] = useState(DRAFT_DEFAULTS);
  state = cad;
  return <CadPage cad={cad} project={p} onChange={(next, msg) => { setP(next); onChange(next, msg); }} onStatus={() => {}} sheetUi={sheetUi}
    draft={draft} onPrefs={(x) => { setDraft(x.draft); onPrefs(x); }} onShow={show} />;
}
/** Waits for something on screen (a slower machine takes longer), up to 10 s. */
const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); expect(ok()).toBe(true); };
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const command = async (text: string) => {
  const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { input.form!.requestSubmit(); });
};
/** Drawing units → canvas pixels, through the fitted 800 × 500 view. */
const screenOf = (x: number, y: number) => {
  const { extents: [x0, y0, x1, y1] } = state.view!.info;
  const scale = Math.min(800 / (x1 - x0), 500 / (y1 - y0)) * 0.92;
  return [(x - (x0 + x1) / 2) * scale + 400, 250 - (y - (y0 + y1) / 2) * scale];
};
/** A selection window dragged from one point to another (drawing units). */
const dragWindow = async (a: [number, number], b: [number, number]) => {
  const [[ax, ay], [bx, by]] = [screenOf(...a), screenOf(...b)];
  const c = document.querySelector('canvas.cad-over')!;
  await act(async () => {
    c.dispatchEvent(new MouseEvent('mousedown', { clientX: ax, clientY: ay, button: 0, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: (ax + bx) / 2, clientY: (ay + by) / 2, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: bx, clientY: by, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mouseup', { clientX: bx, clientY: by, button: 0, bubbles: true }));
  });
};
/** Text typed on the command line, not entered yet. */
const typeOnly = (text: string) => act(async () => {
  const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
/** A click on the drawing at a point in drawing units, through the fitted 800 × 500 view. */
const clickAt = async (x: number, y: number, shiftKey = false) => {
  const [sx, sy] = screenOf(x, y);
  const c = document.querySelector('canvas.cad-over')!;
  await act(async () => {
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mouseup', { clientX: sx, clientY: sy, button: 0, shiftKey, bubbles: true }));
  });
};


describe('Trim and Extend show the piece before the click (2026-11-17)', () => {
  const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
  const X = 200000;
  // A line crossed at 4 m by a second one, with a third 2 m past its end.
  const three: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 8000, 0]), line('S2', [X + 4000, -2000], [X + 4000, 2000]), line('S3', [X + 10000, -2000], [X + 10000, 2000])] }] };
  const hist = () => document.querySelector('.cad-hist')?.textContent ?? '';
  const items = () => project.cadSketch![0].items;
  const r0 = (q: [number, number][]) => q.map((p) => p.map(Math.round));
  const hover = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true })); }); };
  const shift = (down: boolean) => act(() => { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: 'Shift' })); });
  const start = async () => { project = three; act(() => root.render(<Host start={three} />)); await flush(); act(() => state.toggle('osnap')); };

  it('Trim: the piece under the cursor shows faded, and the click cuts exactly that piece; the pick box stays', async () => {
    await start();
    await command('TRIM');
    await until(() => hist().includes('TRIM  Select the part to cut away (Shift-click extends):'));
    expect(seen.last.cursorMode).toBe('objects');
    await hover(X + 6000, 0);
    await until(() => !!seen.last.cutAway?.length);
    const piece = seen.last.cutAway![0];
    expect(piece.id).toBe('S1');
    expect(r0(piece.pts)).toEqual([[X + 4000, 0], [X + 8000, 0]]);
    expect(seen.last.meets).toBeUndefined();
    await clickAt(X + 6000, 0);
    await until(() => hist().includes('TRIM  4.00 m cut off'));
    expect(r0(items().find((x) => x.id === 'S1')!.pts)).toEqual([[X, 0], [X + 4000, 0]]);
    expect(seen.last.cursorMode).toBe('objects');
    // What is left ends at the 4 m line: nothing crosses it, so no shadow (a click says so, as before).
    await hover(X + 1000, 0);
    await until(() => seen.last.cutAway === undefined);
  });

  it('Trim on a circle: the arc under the cursor shows faded, and the click leaves the other arc', async () => {
    // A circle of radius 2 m on the line, which crosses it at 0° and 180°.
    const round: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 8000, 0]), { id: 'C1', kind: 'circle' as const, layer: 'LV-SKETCH', pts: [[X + 4000, 0]], r: 2000 }] }] };
    const ends = (it: SketchItem) => [it.a0!, it.a1!].map((a) => +a.toFixed(6));
    project = round; act(() => root.render(<Host start={round} />)); await flush(); act(() => state.toggle('osnap'));
    await command('TRIM');
    await hover(X + 4000, 2000);
    await until(() => !!seen.last.cutAway?.length);
    expect(seen.last.cutAway![0]).toMatchObject({ id: 'C1', kind: 'arc', r: 2000 });
    expect(ends(seen.last.cutAway![0])).toEqual([0, +Math.PI.toFixed(6)]); // the upper half
    await clickAt(X + 4000, 2000);
    await until(() => hist().includes('TRIM  6.28 m cut off'));
    const left = items().find((x) => x.id === 'C1')!;
    expect(left).toMatchObject({ kind: 'arc', r: 2000, pts: [[X + 4000, 0]] });
    expect(ends(left)).toEqual([+Math.PI.toFixed(6), 0]); // the lower half stays
  });

  it("Shift held shows Extend's new length up to the line ahead, with a cross where it meets it; let go, the trim piece again", async () => {
    await start();
    await command('TRIM');
    await hover(X + 7500, 0);
    await until(() => !!seen.last.cutAway?.length);
    shift(true);
    await until(() => !!seen.last.meets?.length);
    expect(r0(seen.last.meets!)).toEqual([[X + 10000, 0]]);
    expect(seen.last.cutAway).toBeUndefined();
    expect(seen.last.preview!.map((it) => r0(it.pts))).toEqual([[[X + 8000, 0], [X + 10000, 0]]]);
    shift(false);
    await until(() => !!seen.last.cutAway?.length && !seen.last.meets);
  });

  it('Extend: the new length before the click is what the click adds; no line ahead, no shadow', async () => {
    await start();
    await command('EXTEND');
    await until(() => hist().includes('EXTEND  Select the end to lengthen (Shift-click trims):'));
    await hover(X + 7500, 0);
    await until(() => !!seen.last.meets?.length);
    expect(seen.last.preview!.map((it) => r0(it.pts))).toEqual([[[X + 8000, 0], [X + 10000, 0]]]);
    await clickAt(X + 7500, 0);
    await until(() => hist().includes('EXTEND  2.00 m longer'));
    expect(r0(items().find((x) => x.id === 'S1')!.pts)).toEqual([[X, 0], [X + 10000, 0]]);
    // The 4 m line's ends have nothing ahead of them.
    await hover(X + 4000, 1800);
    await until(() => seen.last.meets === undefined && seen.last.preview?.length === 0);
  });
});

describe('Move, Copy, Rotate, Mirror, Scale and Stretch show the result before the click (2026-11-17)', () => {
  const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
  const X = 200000;
  const three: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 8000, 0]), line('S2', [X + 4000, -2000], [X + 4000, 2000]), line('S3', [X + 10000, -2000], [X + 10000, 2000])] }] };
  const hist = () => document.querySelector('.cad-hist')?.textContent ?? '';
  const items = () => project.cadSketch![0].items;
  const item = (id: string) => items().find((x) => x.id === id)!;
  /** What the last change said (the command line has moved on to the next prompt by then). */
  const said = () => (onChange.mock.calls[onChange.mock.calls.length - 1]?.[1] as string | undefined) ?? '';
  const r0 = (q: [number, number][]) => q.map((p) => p.map(Math.round));
  const near = (a: [number, number][], b: [number, number][], tol = 60) => a.length === b.length && a.every((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) < tol);
  const hover = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true })); }); };
  const start = async (p: Project = three) => { project = p; act(() => root.render(<Host start={p} />)); await flush(); act(() => state.toggle('osnap')); };
  /** A light placed at a point (drawing units), on DB-GF1-Y1. */
  const light = async (x: number, y: number) => {
    act(() => { state.setFeederId('DB-GF1-Y1'); state.setDevice('ltg'); state.setTool('dev'); });
    await clickAt(x, y);
    await until(() => (project.lvPoints ?? []).length === 1);
    act(() => state.setTool('none'));
  };
  // The sample plan is drawn in millimetres; devices are placed in metres.
  const mm = (d: { x: number; y: number }): [number, number] => [d.x * 1000, d.y * 1000];

  it('Move with several objects picked: each follows the cursor, a light as its own symbol faded; the click puts them there', async () => {
    await start();
    await light(X + 6000, 3000);
    await dragWindow([X - 500, -2500], [X + 8500, 3500]); // S1, S2 and the light; S3 is outside
    await command('MOVE');
    await command(`${X},0`);
    await hover(X + 1000, 500);
    await until(() => seen.last.preview?.length === 2 && seen.last.shadowDevices?.length === 1);
    const shown = seen.last.preview!.map((it) => r0(it.pts)), ghost = seen.last.shadowDevices![0];
    await clickAt(X + 1000, 500);
    await until(() => said().includes('3 objects moved'));
    expect(shown).toEqual([r0(item('S1').pts), r0(item('S2').pts)]);
    expect(near([[ghost.x, ghost.y]], [mm(project.lvPoints![0])], 1)).toBe(true);
  });

  it('Rotate takes several objects: they turn with the cursor (the light round the base point), and a typed angle turns them so', async () => {
    await start();
    await light(X + 6000, 3000);
    await dragWindow([X - 500, -2500], [X + 8500, 3500]);
    await command('ROTATE');
    await command(`${X},0`);
    await until(() => hist().includes('ROTATE  Specify rotation angle (degrees) or a point:'));
    await hover(X, 5000); // 90° from the base point
    await until(() => seen.last.preview?.length === 2);
    expect(near(seen.last.preview![0].pts, [[X, 0], [X, 8000]])).toBe(true);
    expect(near(seen.last.preview![1].pts, [[X + 2000, 4000], [X - 2000, 4000]])).toBe(true);
    expect(near(seen.last.shadowDevices!.map((d) => [d.x, d.y]), [[X - 3000, 6000]])).toBe(true);
    await command('90');
    await until(() => said().includes('3 objects rotated 90.00°'));
    expect(r0(item('S1').pts)).toEqual([[X, 0], [X, 8000]]);
    expect(r0(item('S2').pts)).toEqual([[X + 2000, 4000], [X - 2000, 4000]]);
    expect(near([mm(project.lvPoints![0])], [[X - 3000, 6000]], 1)).toBe(true);
    expect(item('S3').pts).toEqual([[X + 10000, -2000], [X + 10000, 2000]]);
  });

  it('Mirror: the mirrored copy follows the mirror line, stays where the line was chosen, and Enter gives the same', async () => {
    await start();
    await dragWindow([X + 3500, -2500], [X + 4500, 2500]); // S2
    await command('MIRROR');
    await until(() => hist().includes('MIRROR  Specify first point of the mirror line:'));
    await clickAt(X + 6000, -5000);
    await hover(X + 6000, 5000);
    await until(() => seen.last.preview?.length === 1);
    expect(near(seen.last.preview![0].pts, [[X + 8000, -2000], [X + 8000, 2000]], 200)).toBe(true);
    await clickAt(X + 6000, 5000);
    await until(() => hist().includes('Erase source objects?'));
    const chosen = r0(seen.last.preview![0].pts).join();
    await hover(X, 0); // the line is chosen: the copy stays where it was
    await until(() => !!seen.last.preview?.length && r0(seen.last.preview[0].pts).join() === chosen);
    await command('');
    await until(() => said().includes('mirrored'));
    expect(items().some((x) => r0(x.pts).join() === chosen)).toBe(true);
  });

  it('Scale: the objects show at the factor in < >, then at the factor being typed, before Enter gives the same', async () => {
    await start();
    await dragWindow([X - 500, -500], [X + 8500, 500]); // S1 only (S2 crosses the window)
    await command('SCALE');
    await clickAt(X, 0);
    await until(() => hist().includes('SCALE  Specify scale factor <2>:'));
    await hover(X + 3000, 3000);
    await until(() => seen.last.preview?.length === 1);
    expect(near(seen.last.preview![0].pts, [[X, 0], [X + 16000, 0]], 100)).toBe(true);
    await typeOnly('3');
    await until(() => near(seen.last.preview?.[0]?.pts ?? [], [[X, 0], [X + 24000, 0]], 100));
    const shown = r0(seen.last.preview![0].pts);
    await command('3');
    await until(() => said().includes('scaled × 3'));
    expect(r0(item('S1').pts)).toEqual(shown);
  });

  it('Stretch: what the window caught looks picked, squares on the points to move; after the base point they follow the cursor', async () => {
    await start();
    await command('STRETCH');
    await dragWindow([X + 8500, 500], [X + 7000, -500]); // round S1's right end
    await until(() => hist().includes('STRETCH  Specify base point:'));
    expect(seen.last.selectedSketch).toEqual(['S1']);
    expect(seen.last.movingPoints).toEqual([[X + 8000, 0]]);
    await clickAt(X + 8000, 0);
    await until(() => hist().includes('STRETCH  Specify second point:'));
    expect(seen.last.movingPoints).toBeUndefined();
    expect(seen.last.selectedSketch).toEqual([]);
    await hover(X + 9000, 0);
    await until(() => seen.last.preview?.length === 1);
    const shown = r0(seen.last.preview![0].pts);
    expect(near(seen.last.preview![0].pts, [[X, 0], [X + 9000, 0]])).toBe(true);
    await clickAt(X + 9000, 0);
    await until(() => said().includes('STRETCH  1 drawn object'));
    expect(r0(item('S1').pts)).toEqual(shown);
  });

  it('Mirror, Scale and Stretch take typed points, as Move and Rotate do', async () => {
    await start();
    // Mirror S2 about the line x = X + 6 m, typed: a copy at X + 8 m (the original kept).
    await dragWindow([X + 3500, -2500], [X + 4500, 2500]);
    await command('MIRROR');
    await command(`${X + 6000},-5000`);
    await until(() => hist().includes('MIRROR  Specify second point of the mirror line:'));
    await command('@0,10000');
    await until(() => hist().includes('Erase source objects?'));
    await command('');
    await until(() => said().includes('mirrored'));
    expect(items().some((x) => r0(x.pts).join() === [[X + 8000, -2000], [X + 8000, 2000]].join())).toBe(true);
    // Scale S1 about its start, the base point typed.
    await dragWindow([X - 500, -500], [X + 8500, 500]);
    await command('SCALE');
    await command(`${X},0`);
    await until(() => hist().includes('SCALE  Specify scale factor <2>:'));
    await command('2');
    await until(() => said().includes('scaled × 2'));
    expect(r0(item('S1').pts)).toEqual([[X, 0], [X + 16000, 0]]);
    // Stretch S3's top end 1 m up, both points typed.
    await command('STRETCH');
    await dragWindow([X + 10500, 2500], [X + 9500, 1500]);
    await until(() => hist().includes('STRETCH  Specify base point:'));
    await command(`${X + 10000},2000`);
    await until(() => hist().includes('STRETCH  Specify second point:'));
    await command('@0,1000');
    await until(() => said().includes('STRETCH  1 drawn object'));
    expect(r0(item('S3').pts)).toEqual([[X + 10000, -2000], [X + 10000, 3000]]);
  });

  it("Copy and Mirror of the opened drawing's objects: the shadow is what the click then adds", async () => {
    const WALL: [number, number] = [15900, 6000]; // a wall line of the sample plan (A-WALL)
    const walls = () => items().filter((x) => x.layer === 'A-WALL').map((x) => r0(x.pts));
    await start();
    await clickAt(...WALL);
    await command('CO');
    await until(() => state.tool === 'copy');
    await flush();
    await clickAt(...WALL);
    await hover(WALL[0] + 500, WALL[1]);
    await until(() => (seen.last.preview?.length ?? 0) > 0);
    const copied = seen.last.preview!.map((it) => r0(it.pts));
    await clickAt(WALL[0] + 500, WALL[1]);
    await until(() => said().startsWith('COPY  1 object copied as drawn objects'));
    expect(walls()).toEqual(copied);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    // Mirror: the drawing's wall again, about a line 1 m to its right.
    await clickAt(...WALL);
    await command('MI');
    await until(() => hist().includes('MIRROR  Specify first point of the mirror line:'));
    await flush();
    await clickAt(WALL[0] + 1000, WALL[1] - 3000);
    await clickAt(WALL[0] + 1000, WALL[1] + 3000);
    await until(() => hist().includes('Erase source objects?') && (seen.last.preview?.length ?? 0) > 0);
    const mirroredWall = seen.last.preview!.map((it) => r0(it.pts));
    await command('');
    await until(() => said().includes('mirrored'));
    expect(walls()).toEqual([...copied, ...mirroredWall]);
  });

  const many = (n: number): Project => ({ ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: Array.from({ length: n }, (_, i) => line(`L${i}`, [X + i * 5, 5000], [X + i * 5, 5500])) }] });
  const moveAll = async (n: number) => {
    await start(many(n));
    await dragWindow([X - 500, 4500], [X + n * 5 + 500, 6000]);
    await until(() => hist().includes(`${n} objects selected`));
    await command('MOVE');
    await command(`${X},5000`);
    await hover(X + 1000, 6000);
  };
  it('2,000 objects picked: each shows its shadow', async () => {
    await moveAll(2000);
    await until(() => seen.last.preview?.length === 2000);
  }, 30000);
  it('2,001 objects picked: only the rubber line', async () => {
    await moveAll(2001);
    await until(() => seen.last.preview?.length === 1);
    expect(seen.last.preview![0].pts).toHaveLength(2);
  }, 30000);
});
