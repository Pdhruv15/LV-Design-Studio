// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadPage from './CadPage';
import { useCad, type CadState } from './cadState';
import { useSheetUi } from '../sld/sheetUi';
import { cadFileMenu } from './cadFileMenu';
import { buildingInfoOf } from '../../calc/building';
import { trayPlanOf } from '../../calc/cableTray';
import { openDrawing } from '../../engines/cad/cadEngine';
import '../../engines/cad/cadOps'; // loaded ahead: the engine loads it on demand, which a busy test run can make slow
import { sampleProject } from '../../data/sampleProject';
import { placeLvPoint } from '../../model/cadDevices';
import { archOnOf } from '../../model/cadLayerState';
import { dimLabel } from '../../model/cadSketch';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
/** Whether the architect's layer i shows: its On, kept in the project (Layer palette or the Layers list). */
const shown = (i: number) => archOnOf(project, state.view!.file, state.view!.info.layers)[i];
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); localStorage.clear(); project = villa; onChange.mockClear();
  (window as { lvds?: unknown }).lvds = { cadFile: {
    engine: async () => bytes('electron/cad/lvds_cad_reader_bg.wasm'),
    sampleBytes: vi.fn(async (name: string) => ({ file: name, bytes: bytes(`electron/samples/${name}`) })),
    openBytes: vi.fn(async () => ({ file: 'plan.dwg', path: '/plans/plan.dwg', bytes: bytes('tests/fixtures/cad/plan-2018.dwg') }))
  } };
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; delete (window as { lvds?: unknown }).lvds; });

function Host({ start = villa }: { start?: Project }) {
  const cad = useCad('p1');
  const [p, setP] = useState(start);
  const sheetUi = useSheetUi();
  state = cad;
  return <CadPage cad={cad} project={p} onChange={(next, msg) => { setP(next); onChange(next, msg); }} onStatus={() => {}} sheetUi={sheetUi} />;
}
/** Waits for something on screen (a slower machine takes longer), up to 10 s. */
const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); expect(ok()).toBe(true); };
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
const result = () => document.querySelector('.cad-res')?.textContent ?? '';
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
/** A click on the drawing at a point in drawing units, through the fitted 800 × 500 view. */
const clickAt = async (x: number, y: number, shiftKey = false) => {
  const [sx, sy] = screenOf(x, y);
  const c = document.querySelector('canvas.cad-over')!;
  await act(async () => {
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mouseup', { clientX: sx, clientY: sy, button: 0, shiftKey, bubbles: true }));
  });
};

describe('CAD view', () => {
  it('opens the sample villa by default, with its layers, a command line and a status bar', async () => {
    act(() => root.render(<Host />));
    await flush();
    expect(state.view?.file).toBe('sample-villa-gf.dxf');
    expect(document.body.textContent).toContain('Sample plan for testing');
    expect(document.body.textContent).toMatch(/sample-villa-gf\.dxf · DXF · mm · 1 : 1/);
    expect(button('A-WALLon')).toBeDefined();
  });

  it('turns layers off and on, and toggles snaps from the status bar, the command line and the function keys', async () => {
    act(() => root.render(<Host />));
    await flush();
    const wall = state.view!.info.layers.findIndex((l) => l.name === 'A-WALL');
    act(() => button('A-WALLon').click());
    expect(shown(wall)).toBe(0);
    act(() => button('All on').click());
    expect(shown(wall)).toBe(1);
    act(() => button('OSNAP').click());
    expect(state.toggles.osnap).toBe(false);
    await command('grid');
    expect(state.toggles.grid).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' })); });
    expect(state.toggles.ortho).toBe(true);
    await command('xyz');
    expect(document.querySelector('.cad-hist')?.textContent).toMatch(/Unknown command "XYZ"/);
  });

  it('steps the grid lines → dots → off with F7, as the SLD does, and shows the zoom in the corner', async () => {
    act(() => root.render(<Host />));
    await flush();
    const f7 = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F7' })); });
    f7();
    expect([state.toggles.grid, state.gridDots]).toEqual([true, false]);
    f7();
    expect([state.toggles.grid, state.gridDots]).toEqual([true, true]);
    expect(button('GRID · DOTS')).toBeTruthy();
    f7();
    expect([state.toggles.grid, state.gridDots]).toEqual([false, false]);
    expect(document.querySelector('.zoom-chip')?.textContent).toBe('100 %'); // the drawing fitted
  });

  it('measures a distance between two snapped points (DI)', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('di');
    expect(state.tool).toBe('dist');
    await clickAt(30, -80); // snaps to the front wall's outside face end (0, -100)
    await clickAt(6170, -80); // … and to the entrance jamb (6200, -100)
    expect(result()).toMatch(/Distance 6\.20 m/);
    expect(result()).toMatch(/ΔX 6\.20 m · ΔY 0\.00 m · angle 0\.00°/);
    expect(document.querySelector('.cad-hist')?.textContent).toMatch(/Distance = 6\.20 m/);
  });

  it('says what an object is when clicked: a light block with its circuit', async () => {
    act(() => root.render(<Host />));
    await flush();
    await clickAt(6687.5 + 190, 7375); // on the light's circle
    expect(result()).toMatch(/Block · L1/);
    expect(result()).toMatch(/LayerE-LIGHT/);
    expect(result()).toMatch(/CCTDB-GF1\/R1/);
  });

  it('crops a light block (CROP): asks first as it is on a circuit, cuts it at a window and erases it, in one change (one ⌘Z)', async () => {
    act(() => root.render(<Host />));
    await flush();
    const last = () => state.history[state.history.length - 1];
    await command('CROP');
    expect(last()).toMatch(/CROP {2}Select a block to crop:/);
    await clickAt(6687.5 + 190, 7375); // on the light's circle
    await until(() => /Crop it\? \[Yes\/No\]/.test(last()));
    expect(last()).toMatch(/on circuit DB-GF1\/R1/);
    await command('Y');
    expect(last()).toMatch(/\[Circle\/Object\]/);
    // A window over the left half of the light: its circle cut at the window's right side.
    await command('6400,7100');
    await command('6687.5,7650');
    await command('');
    expect(last()).toBe('CROP  [Inside/Outside] <Inside>:');
    await command('');
    await until(() => onChange.mock.calls.length > 0);
    const [next, msg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(msg).toMatch(/^CROP {2}\d+ pieces? kept.* · original block erased · ⌘Z to undo$/);
    const erased = next.cadErased?.['sample-villa-gf.dxf'] ?? [];
    expect(erased).toHaveLength(1);
    const items = next.cadSketch?.find((s) => s.file === 'sample-villa-gf.dxf')?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(items.every((it) => state.view!.info.layers.some((l) => l.name === it.layer))).toBe(true); // on the drawing's own layers
    expect(items.some((it) => it.kind === 'arc')).toBe(true);
    for (const it of items.filter((x) => x.kind === 'line' || x.kind === 'pline')) for (const [x] of it.pts) expect(x).toBeLessThanOrEqual(6687.5 + 1e-6);
    // The block is no longer picked: a click where it was finds what is under it, not the light.
    await clickAt(6687.5 + 190, 7375);
    expect(result()).not.toMatch(/CCTDB-GF1\/R1/);
  });

  it('finds a room area from the walls and adds it to Building information', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.setTool('room'));
    await clickAt(10500, 2250); // the guest bedroom: no outline on the plan
    expect(result()).toMatch(/Room area 16\.\d\d m²/);
    act(() => button('Add').click()); // the room form is open: Click inside is a room tool
    const rooms = buildingInfoOf(project).rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ buildingId: 'V', levelId: 'GF' });
    expect(rooms[0].areaM2).toBeGreaterThan(16);
    expect(rooms[0].outline!.length).toBeGreaterThanOrEqual(4); // kept in metres: devices find their room by it
    expect(onChange.mock.calls[0][1]).toMatch(/added to Ground · ⌘Z to undo$/);
  });

  it('measures the area of a closed object (AREA, O)', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('area');
    await command('o');
    await clickAt(2500, 150); // the kitchen outline (A-ROOM), 4.85 × 4.35 m
    expect(result()).toMatch(/Area 21\.10 m²/);
    expect(result()).toMatch(/Perimeter 18\.40 m · of the object picked/);
  });

  it('places a light on a circuit, selects it with a click, and deletes it (the circuit count follows)', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('dev');
    expect(state.tool).toBe('dev');
    act(() => { state.setFeederId('DB-GF1-Y1'); state.toggle('osnap'); }); // OSNAP off: placed exactly where clicked
    const before = villa.feeders.find((f) => f.id === 'DB-GF1-Y1')!.points?.ltg ?? 0;
    await clickAt(3000, 9000);
    expect(project.lvPoints).toEqual([expect.objectContaining({ type: 'ltg', feederId: 'DB-GF1-Y1', buildingId: 'V', levelId: 'GF', x: expect.closeTo(3, 6), y: expect.closeTo(9, 6) })]);
    expect(project.feeders.find((f) => f.id === 'DB-GF1-Y1')!.points?.ltg).toBe(before + 1);
    expect(onChange.mock.calls[0][1]).toMatch(/^Light placed on DB-GF1\/Y1 · Majlis lighting/);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(state.tool).toBe('none');
    await clickAt(3000, 9000);
    expect(result()).toMatch(/Light LV point/);
    expect(result()).toMatch(/CircuitDB-GF1\/Y1 · Majlis lighting/);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); });
    expect(project.lvPoints ?? []).toEqual([]);
    expect(project.feeders.find((f) => f.id === 'DB-GF1-Y1')!.points?.ltg).toBe(before);
  });

  it('wires the circuits on the level, takes one off with Wire one, sends the length to the schedule and saves the wiring', async () => {
    const saveBinary = vi.fn(async () => '/plans/out.dxf');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary };
    const start: Project = {
      ...villa,
      boards: villa.boards.map((b) => (b.id === 'DB-GF1' ? { ...b, planPoint: { x: 1, y: 1 }, level: { building: 'V', level: 'GF' } } : b)),
      lvPoints: [
        { id: 'P1', type: 'ltg', feederId: 'DB-GF1-Y1', buildingId: 'V', levelId: 'GF', x: 3, y: 9 },
        { id: 'P2', type: 'ltg', feederId: 'DB-GF1-Y1', buildingId: 'V', levelId: 'GF', x: 6, y: 9 }
      ]
    };
    act(() => root.render(<Host start={start} />));
    await flush();
    await command('WC');
    expect(project.cadWiring).toEqual([{ feederId: 'DB-GF1-Y1' }]);
    expect(onChange.mock.calls[0][1]).toMatch(/^1 circuit wired on .* · Update schedules sends the lengths to the cable schedule/);
    await command('W1');
    expect(state.tool).toBe('wire');
    act(() => { state.toggle('osnap'); });
    await clickAt(3000, 9000);
    expect(project.cadWiring).toBeUndefined();
    expect(onChange.mock.calls[1][1]).toMatch(/^Wiring of DB-GF1\/Y1 taken off/);
    await clickAt(3000, 9000);
    expect(onChange.mock.calls[2][1]).toMatch(/^DB-GF1\/Y1 · \dC × [\d.]+ mm² · \d+ m wired/);
    expect(document.body.textContent).toContain('1 circuit wired on this level.');
    await command('SCHED');
    const m = /· (\d+) m wired/.exec(onChange.mock.calls[2][1])![1];
    expect(project.feeders.find((f) => f.id === 'DB-GF1-Y1')!.lengthM).toBe(Number(m));
    await command('save');
    await flush();
    const text = new TextDecoder().decode((saveBinary.mock.calls[0] as unknown as [{ bytes: Uint8Array }])[0].bytes);
    expect(text).toContain('E-LV-WIRING');
    expect(text).toContain('E-LV-TAGS');
    expect(document.querySelector('.cad-hist')?.textContent).toMatch(/1 circuit wired on E-LV-WIRING \/ E-LV-TAGS\)/);
  });

  it('draws polygons, circles by 2 or 3 points or a diameter, arcs by start, centre and end, ellipses and revision clouds, and saves them as such', async () => {
    const saveBinary = vi.fn(async () => '/plans/out.dxf');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary };
    const X = 200000;
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    const at = (x: number, y: number) => command(`${x},${y}`);
    const last = () => { const it = project.cadSketch![0].items; return it[it.length - 1]; };
    const near = (q: number[]) => q.map((v) => +v.toFixed(6) + 0);
    // Each tool repeats until another starts or Esc (C while Polygon runs is its Circumscribed option).
    const esc = () => act(() => state.setTool('none'));
    // A hexagon of radius 1000 m round (X, 0): six sides typed first.
    await command('POL'); await command('6'); await at(X, 0); await at(X + 1000, 0);
    expect(last()).toMatchObject({ kind: 'pline', layer: 'LV-SKETCH', closed: true });
    expect(last().pts.map(near)).toEqual([[X + 1000, 0], [X + 500, 866.025404], [X - 500, 866.025404], [X - 1000, 0], [X - 500, -866.025404], [X + 500, -866.025404]]);
    // Circles: by the ends of a diameter (2P), by three points (3P), by the centre and a diameter typed (D).
    esc(); await command('C'); await command('2P');
    expect(state.tool).toBe('circle2p');
    await at(X, 3000); await at(X + 2000, 3000);
    expect(last()).toMatchObject({ kind: 'circle', pts: [[X + 1000, 3000]], r: 1000 });
    esc(); await command('C'); await command('3P'); await at(X, 6000); await at(X + 2000, 6000); await at(X + 1000, 7000);
    expect([near(last().pts[0]), +last().r!.toFixed(6)]).toEqual([[X + 1000, 6000], 1000]);
    esc(); await command('C'); await at(X, 9000); await command('D'); await command('3000');
    expect(last()).toMatchObject({ kind: 'circle', pts: [[X, 9000]], r: 1500 });
    // An arc from its start, round its centre, to its end (a quarter, anticlockwise).
    act(() => state.setTool('arcsce'));
    await at(X + 1000, 12000); await at(X, 12000); await at(X, 13000);
    expect([last().kind, last().r, last().a0, +last().a1!.toFixed(9)]).toEqual(['arc', 1000, 0, +(Math.PI / 2).toFixed(9)]);
    // Ellipses: centre, the end of an axis, the other half-axis typed; then by the two ends of an axis (A).
    esc(); await command('EL'); await at(X, 15000); await at(X + 2000, 15000); await command('500');
    expect(last()).toMatchObject({ kind: 'ellipse', pts: [[X, 15000]], ax: [2000, 0], ratio: 0.25 });
    esc(); await command('EL'); await command('A'); await at(X, 18000); await at(X + 4000, 18000); await command('1000');
    expect(last()).toMatchObject({ kind: 'ellipse', pts: [[X + 2000, 18000]], ax: [2000, 0], ratio: 0.5 });
    // Revision clouds on the annotation layer: a rectangle with arcs typed 500 long; then round points (P).
    esc(); await command('REVCLOUD'); await command('500'); await at(X, 21000); await at(X + 3000, 23000);
    expect(last()).toMatchObject({ kind: 'pline', layer: 'LV-ANNO', closed: true, cloud: 500, pts: [[X, 21000], [X + 3000, 21000], [X + 3000, 23000], [X, 23000]] });
    esc(); await command('REVCLOUD'); await command('P'); await at(X, 25000); await at(X + 2000, 25000); await at(X + 1000, 27000); await command('');
    expect(last()).toMatchObject({ kind: 'pline', layer: 'LV-ANNO', closed: true, pts: [[X, 25000], [X + 2000, 25000], [X + 1000, 27000]] });
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toMatch(/^Revision cloud, arcs [\d.]+ m long · ⌘Z to undo$/);
    // Saved: an ELLIPSE, and the clouds as polylines with their arcs (bulges, group 42).
    esc(); await command('save');
    await flush();
    const text = new TextDecoder().decode((saveBinary.mock.calls[0] as unknown as [{ bytes: Uint8Array }])[0].bytes);
    expect(text.match(/\nELLIPSE\r?\n/g)).toHaveLength(2);
    expect(text).toMatch(/\n\s*42\r?\n\s*0\.5\r?\n/);
  });

  it('places an ELV device and saves the drawing as DXF with the devices on their layers', async () => {
    const saveBinary = vi.fn(async () => '/plans/out.dxf');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary };
    act(() => root.render(<Host />));
    await flush();
    act(() => { state.setDevice('smoke-detector'); state.setTool('dev'); state.toggle('osnap'); });
    await clickAt(3000, 8000);
    expect(project.elvDevices).toEqual([expect.objectContaining({ type: 'smoke-detector', x: expect.closeTo(3, 6), y: expect.closeTo(8, 6) })]);
    await command('save');
    await flush();
    const arg = (saveBinary.mock.calls[0] as unknown as [{ defaultName: string; bytes: Uint8Array }])[0];
    expect(arg.defaultName).toBe('sample-villa-gf - with devices.dxf');
    const text = new TextDecoder().decode(arg.bytes);
    expect(text).toContain('E-ELV-DEVICES');
    expect(document.querySelector('.cad-hist')?.textContent).toMatch(/SAVE {2}Saved out\.dxf \(1 device on E-LV-POINTS/);
  });

  it('draws lines, rectangles, circles, text and dimensions — by clicks and typed input', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap')); // exact points
    const sk = () => project.cadSketch?.[0]?.items ?? [];
    await command('l');
    await clickAt(1000, 1000);
    await clickAt(4000, 1000);
    expect(sk()[0]).toMatchObject({ kind: 'line', layer: 'LV-SKETCH' });
    expect(sk()[0].pts[1][0] - sk()[0].pts[0][0]).toBeCloseTo(3000, 0);
    await command('@0,2000'); // relative point from the last one
    expect(sk()[1].pts[1][1] - sk()[1].pts[0][1]).toBeCloseTo(2000, 6);
    await command(''); // Enter stops LINE
    await command('rec');
    await clickAt(6000, 6000);
    await clickAt(9000, 8000);
    expect(sk()[2]).toMatchObject({ kind: 'pline', closed: true });
    await command('c');
    await clickAt(12000, 9000);
    await command('500'); // typed radius
    expect(sk()[3]).toMatchObject({ kind: 'circle', r: 500 });
    await command('t');
    await clickAt(2000, 3000);
    await command('DB ROOM');
    expect(sk()[4]).toMatchObject({ kind: 'text', text: 'DB ROOM', layer: 'LV-ANNO' });
    await command('dim');
    await clickAt(1000, 500);
    await clickAt(4000, 500);
    await clickAt(2500, 200);
    expect(sk()[5]).toMatchObject({ kind: 'dim', layer: 'LV-ANNO' });
    expect(Number(sk()[5].text)).toBeCloseTo(3, 1);
  });

  it('moves, copies, rotates and erases what was drawn, and copies a light onto its circuit', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('l');
    await clickAt(1000, 1000);
    await clickAt(4000, 1000);
    await command('');
    await command('m');
    await clickAt(2500, 1000); // select the line
    await clickAt(1000, 1000); // base point
    await command('@0,500');
    const line = () => project.cadSketch![0].items[0];
    expect(line().pts[0][1] - 1000).toBeCloseTo(500, 0);
    await command('co');
    await clickAt(2500, line().pts[0][1]);
    await clickAt(0, 0);
    await command('@0,1000');
    await command('');
    expect(project.cadSketch![0].items).toHaveLength(2);
    await command('ro');
    await clickAt(2500, line().pts[0][1]);
    await clickAt(line().pts[0][0], line().pts[0][1]);
    await command('90');
    expect(Math.abs(line().pts[1][0] - line().pts[0][0])).toBeLessThan(1);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await clickAt(line().pts[0][0], (line().pts[0][1] + line().pts[1][1]) / 2);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); });
    expect(project.cadSketch![0].items).toHaveLength(1);
    // A light copied is one more point on its circuit.
    act(() => { state.setFeederId('DB-GF1-Y1'); state.setDevice('ltg'); state.setTool('dev'); });
    await clickAt(3000, 9000);
    const n = project.feeders.find((f) => f.id === 'DB-GF1-Y1')!.points?.ltg ?? 0;
    await command('co');
    await clickAt(3000, 9000);
    await clickAt(3000, 9000);
    await command('@1000,0');
    expect(project.lvPoints).toHaveLength(2);
    expect(project.feeders.find((f) => f.id === 'DB-GF1-Y1')!.points?.ltg).toBe(n + 1);
  });

  it('saves what was drawn into the DXF', async () => {
    const saveBinary = vi.fn(async () => '/plans/out.dxf');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary };
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('rec');
    await clickAt(6000, 6000);
    await clickAt(9000, 8000);
    await command('save');
    await flush();
    const text = new TextDecoder().decode((saveBinary.mock.calls[0] as unknown as [{ bytes: Uint8Array }])[0].bytes);
    expect(text).toContain('LV-SKETCH');
    expect(document.querySelector('.cad-hist')?.textContent).toMatch(/1 drawn object on LV-SKETCH \/ LV-ANNO/);
  });

  it('opens a DWG from the desktop dialog with OPEN', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('open');
    await flush();
    expect(state.view?.file).toBe('plan.dwg');
    expect(localStorage.getItem('lvds.cad.p1')).toBe('/plans/plan.dwg');
  });

  it('lists the plan of each level; opening one for a level makes the drawing that level\'s plan', async () => {
    const twoLevels: Project = { ...villa, building: { ...villa.building!, buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }, { id: 'FF', name: 'First', kind: 'typical', heightM: 4 }] }] } };
    act(() => root.render(<Host start={twoLevels} />));
    await flush();
    const plans = () => [...document.querySelectorAll('[aria-label="Plans of this project"] button')];
    expect(plans().map((b) => b.textContent)).toEqual(['Groundno planopen…', 'Firstno planopen…']);
    await act(async () => { (plans()[1] as HTMLButtonElement).click(); });
    await flush();
    expect(state.view?.file).toBe('plan.dwg');
    expect(project.cadPlans).toEqual([{ building: 'V', level: 'FF', file: 'plan.dwg', units: 4 }]);
    expect(plans()[1].textContent).toBe('Firstplan.dwgopen');
  });

  it('File group: sets the level and the units of the drawing, and shows the layer roles', async () => {
    act(() => root.render(<Host />));
    await flush();
    const apply = (next: Project, message: string) => onChange(next, message);
    let menu = cadFileMenu(project, state, apply, () => {});
    expect([menu.level, menu.unit, menu.plansSub]).toEqual(['Level?', 'mm', '0 of 1 levels']);
    act(() => menu.levels![0].onClick());
    expect(project.cadPlans).toEqual([{ building: 'V', level: 'GF', file: 'sample-villa-gf.dxf', units: 4 }]);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('sample-villa-gf.dxf is the plan of Ground · ⌘Z to undo');
    menu = cadFileMenu(project, state, apply, () => {});
    expect(menu.level).toBe('Ground');
    act(() => menu.units!.find((u) => u.label.startsWith('Metres'))!.onClick());
    expect(project.cadPlanUnits).toEqual({ 'sample-villa-gf.dxf': 'm' });
    act(() => state.setShowRoles(true));
    expect(document.body.textContent).toContain('Layer roles');
    const wallRole = [...document.querySelectorAll('select')].find((x) => x.closest('tr')?.textContent?.includes('A-WALL')) as HTMLSelectElement | undefined;
    expect(wallRole?.value).toBe('wall');
  });

  it('adds the rooms the plan outlines, named by the text inside; adding again updates them', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.actions.current.addFound());
    const names = () => buildingInfoOf(project).rooms.map((r) => r.name.toLowerCase()).sort();
    expect(names()).toEqual(['dining', 'electrical room', 'kitchen', 'living', 'maid room', 'majlis']);
    expect(onChange.mock.calls[0][1]).toMatch(/^6 rooms from the plan on Ground — level not set: File → Level · ⌘Z to undo$/);
    const majlis = buildingInfoOf(project).rooms.find((r) => /majlis/i.test(r.name))!;
    expect(majlis.outline!.length).toBeGreaterThanOrEqual(4);
    expect(majlis.areaM2).toBeGreaterThan(10);
    await command('ROOMS');
    expect(names()).toHaveLength(6);
  });

  it('traces a room and names it by picking its name on the drawing; a name outside any room says so', async () => {
    act(() => root.render(<Host />));
    await flush();
    const text = (s: string) => state.view!.info.texts.find((t) => t.s.trim() === s)!;
    const onText = async (s: string) => { const t = text(s); await clickAt(t.x + t.h * 0.1, t.y + t.h * 0.3); };
    const k = text('KITCHEN');
    await command('TR');
    for (const [dx, dy] of [[-1500, -1500], [1500, -1500], [1500, 1500], [-1500, 1500]]) await clickAt(k.x + dx, k.y + dy);
    await command('');
    expect(result()).toMatch(/Room area 9\.00 m²/);
    await command('PN');
    await onText('KITCHEN');
    expect((document.querySelector('.cad-roomform input') as HTMLInputElement).value).toBe('KITCHEN');
    act(() => button('Add').click());
    expect(buildingInfoOf(project).rooms.map((r) => r.name)).toEqual(['KITCHEN']);
    act(() => state.setTool('name'));
    await onText('HALL');
    expect(state.history[state.history.length - 1]).toMatch(/“HALL” is not inside a room yet/);
  });

  it('draws a power tray run without a route, then changes its width and service and saves it into the DXF', async () => {
    const saveBinary = vi.fn(async () => '/plans/out.dxf');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary };
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('CT');
    expect(document.body.textContent).toContain('The route can be left for later.');
    for (const [x, y] of [[2000, 3000], [8000, 3000], [8000, 7000]]) await clickAt(x, y);
    await command('');
    const run = state.view && project.cadSketch![0].items[0];
    expect(run).toMatchObject({ kind: 'pline', layer: 'E-TRAY', tray: { widthMm: 300, service: 'Power' } });
    expect(run!.tray!.route).toBeUndefined();
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toMatch(/^Cable tray 300 mm power, 10\.\d\d m \(no route: assign one when you know it\)/);
    act(() => state.setTool('none'));
    await clickAt(5000, 3000);
    expect(result()).toMatch(/Cable tray.*Length10\.\d\d m.*CarriesPower.*Routenot assigned/);
    const width = document.querySelector('.cad-res select[aria-label="Tray width"]') as HTMLSelectElement;
    act(() => { width.value = '450'; width.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(project.cadSketch![0].items[0].tray).toEqual({ widthMm: 450, service: 'Power' });
    const service = document.querySelector('.cad-res select[aria-label="Tray service"]') as HTMLSelectElement;
    act(() => { service.value = 'ELV'; service.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(project.cadSketch![0].items[0].tray).toEqual({ widthMm: 450, service: 'ELV' });
    await command('save');
    await flush();
    const text = new TextDecoder().decode((saveBinary.mock.calls[0] as unknown as [{ bytes: Uint8Array }])[0].bytes);
    expect(text).toContain('E-TRAY');
    expect(text).toContain('CT 450 ELV');
  });

  it('finds the fittings of the trays drawn: a branch of another width is a tee', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('CT');
    for (const [x, y] of [[2000, 3000], [8000, 3000]]) await clickAt(x, y);
    await command('');
    act(() => state.setTray({ widthMm: 150, service: 'Power', route: '' }));
    for (const [x, y] of [[5000, 3000], [5000, 7000]]) await clickAt(x, y);
    await command('');
    expect(document.querySelector('[aria-label="Fittings on this plan"]')?.textContent).toBe('Fittings on this plan1 × Tee 300 × 150');
  });

  it('draws a cable route along a tray, links a cable line of the drawing, and updates the schedules', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    const f = villa.feeders[0];
    await command('CT');
    act(() => state.setTray({ widthMm: 300, service: 'Power', route: 'A' }));
    for (const [x, y] of [[2000, 3000], [12000, 3000]]) await clickAt(x, y);
    await command('');
    await command('CR');
    act(() => state.setCableFeeder(f.id));
    for (const [x, y] of [[2000, 3000], [12000, 3000], [12000, 5000]]) await clickAt(x, y);
    await command('');
    expect(project.cadSketch![0].items[1]).toMatchObject({ layer: 'E-CABLE', cable: { feederId: f.id } });
    await command('SCHED');
    const msg = onChange.mock.calls[onChange.mock.calls.length - 1][1];
    expect(msg).toMatch(/^Schedules updated: route A 10\.\d m · 1 cable length · 1 feeder on trays · ⌘Z to undo$/);
    expect(trayPlanOf(project).routes.find((r) => r.name === 'A')!.lengthM).toBeCloseTo(10, 0);
    const fd = project.feeders.find((x) => x.id === f.id)!;
    expect(fd.trayRoute).toBe('A');
    expect(fd.lengthM).toBeGreaterThanOrEqual(Math.ceil((12 + 6 + 3) * 1.05) - 1);
    await command('SCHED');
    expect(state.history[state.history.length - 1]).toMatch(/^SCHED {2}Up to date/);

    // Link: a line on the drawing's cable layer becomes a cable's route.
    const v = state.view!, layer = v.info.layers.findIndex((l) => l.name === 'E-CABLE');
    const i = v.segLayers.findIndex((l) => l === layer);
    const [x1, y1, x2, y2] = [v.segs[i * 4], v.segs[i * 4 + 1], v.segs[i * 4 + 2], v.segs[i * 4 + 3]];
    await command('LR');
    await clickAt((x1 + x2) / 2 + v.info.origin[0], (y1 + y2) / 2 + v.info.origin[1]);
    expect(project.cadSketch![0].items).toHaveLength(3);
    expect(project.cadSketch![0].items[2]).toMatchObject({ layer: 'E-CABLE', cable: { feederId: f.id } });
  });

  it('fills a room with an ELV device at its spacing, shows coverage, and copies the devices to another level', async () => {
    const twoLevels: Project = { ...villa, building: { ...villa.building!, buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }, { id: 'FF', name: 'First', kind: 'typical', heightM: 4 }] }] } };
    act(() => root.render(<Host start={twoLevels} />));
    await flush();
    act(() => state.actions.current.addFound()); // rooms with outlines to fill
    const majlis = buildingInfoOf(project).rooms.find((r) => /majlis/i.test(r.name))!;
    const [cx, cy] = majlis.outline!.reduce(([x, y], q) => [x + q[0] / majlis.outline!.length, y + q[1] / majlis.outline!.length], [0, 0]);
    act(() => { state.setDevice('smoke-detector'); state.setTool('fill'); });
    await clickAt(cx / 0.001, cy / 0.001);
    const onGf = () => (project.elvDevices ?? []).filter((d) => d.levelId === 'GF');
    expect(onGf().length).toBeGreaterThan(0);
    expect(onGf().every((d) => d.type === 'smoke-detector' && d.roomId === majlis.id)).toBe(true);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toMatch(/smoke detectors? placed · ⌘Z to undo$/i);
    act(() => state.setCoverage(true));
    expect(document.body.textContent).toMatch(/not fully covered/);
    act(() => state.actions.current.copyTo('V/FF/0'));
    expect((project.elvDevices ?? []).filter((d) => d.levelId === 'FF')).toHaveLength(onGf().length);
  });

  it('lights a room by the lumen method (LUX): keeps the room, changes the luminaire, places the lights, replaces them', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.actions.current.addFound());
    const majlis = buildingInfoOf(project).rooms.find((r) => /majlis/i.test(r.name))!;
    const [cx, cy] = majlis.outline!.reduce(([x, y], q) => [x + q[0] / majlis.outline!.length, y + q[1] / majlis.outline!.length], [0, 0]);
    await command('LUX');
    expect(state.tool).toBe('lux');
    expect(document.body.textContent).toContain('Point at a room to see its lights');
    await clickAt(cx / 0.001, cy / 0.001);
    expect(document.body.textContent).toContain(`Light room ${majlis.name}`);
    const place = () => document.querySelector('.cad-devbtns .chip.primary') as HTMLButtonElement;
    expect(place().disabled).toBe(true); // no circuit yet
    const lum = document.querySelector('select[aria-label="Luminaire"]') as HTMLSelectElement;
    const before = place().textContent;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(lum, 'pnl36');
      lum.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(place().textContent).not.toBe(before); // brighter luminaire, fewer of them
    const n = Number(/Place (\d+)/.exec(place().textContent!)![1]);
    act(() => state.setFeederId('DB-GF1-Y1'));
    await act(async () => { place().click(); });
    const lights = () => (project.lvPoints ?? []).filter((d) => d.type === 'ltg');
    expect(lights()).toHaveLength(n);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toMatch(new RegExp(`^${n} lights? placed in ${majlis.name} on DB-GF1/Y1 — \\d+ lx · ⌘Z to undo$`));
    await clickAt(cx / 0.001, cy / 0.001); // again: replaces, does not double
    await act(async () => { place().click(); });
    expect(lights()).toHaveLength(n);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toContain(`(${n} taken off first)`);
  });

  it('lays out emergency lighting (EM): draws an escape route, an open area and a point of emphasis, then places them', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    act(() => state.actions.current.addFound());
    const majlis = buildingInfoOf(project).rooms.find((r) => /majlis/i.test(r.name))!;
    const [cx, cy] = majlis.outline!.reduce(([x, y], q) => [x + q[0] / majlis.outline!.length, y + q[1] / majlis.outline!.length], [0, 0]);
    await command('EM');
    expect(state.tool).toBe('em');
    expect(document.body.textContent).toContain('Emergency lighting');
    await clickAt(cx / 0.001 - 3000, cy / 0.001);
    await clickAt(cx / 0.001 + 3000, cy / 0.001);
    await command(''); // Enter: the route is done
    expect(document.body.textContent).toMatch(/Escape routes1 · 6\.\d\d m/);
    await act(async () => { button('Open area').click(); });
    await clickAt(cx / 0.001, cy / 0.001);
    expect(document.body.textContent).toContain(`(${majlis.name})`);
    await act(async () => { button('Point of emphasis').click(); });
    await clickAt(cx / 0.001, cy / 0.001 + 1000); // a call point 1 m off the route
    const place = () => document.querySelector('.cad-devbtns .chip.primary') as HTMLButtonElement;
    expect(place().disabled).toBe(true); // no circuit yet
    act(() => state.setFeederId('DB-GF1-Y1'));
    const [, nf, ns] = /Place (\d+) fittings? and (\d+) signs?/.exec(place().textContent!)!.map(Number);
    await act(async () => { place().click(); });
    const em = (project.lvPoints ?? []).filter((d) => d.emergency);
    expect(em.filter((d) => d.emergency === 'fitting')).toHaveLength(nf);
    expect(em.filter((d) => d.emergency !== 'fitting')).toHaveLength(ns);
    expect(em.every((d) => d.type === 'ltg' && d.feederId === 'DB-GF1-Y1')).toBe(true);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe(`${nf} emergency lights and ${ns} sign${ns === 1 ? '' : 's'} placed on DB-GF1/Y1 · ⌘Z to undo`);
    expect(place().disabled).toBe(true); // all placed: nothing marked any more
  });

  it('picks devices with a window and Shift-click; the toolbar beside them aligns them, moves them to a circuit and deletes them', async () => {
    const gf = { building: 'V', level: 'GF' };
    let start = villa;
    for (const [x, y] of [[3, 9], [6, 9.4], [9, 8.8]]) start = placeLvPoint(start, gf, 'ltg', 'DB-GF1-B2', x, y).project;
    start = placeLvPoint(start, gf, 's13', 'DB-GF1-B2', 6, 4).project;
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const bar = () => document.querySelector('[aria-label="Edit devices"]') as HTMLElement | null;
    const barButton = (t: string) => [...bar()!.querySelectorAll('button')].find((b) => b.textContent === t)!;
    await dragWindow([2000, 10000], [10000, 8000]); // left to right: the three lights, not the socket
    expect(bar()?.getAttribute('role')).toBe('toolbar');
    expect(bar()!.textContent).toMatch(/^3 selectedAlign rowAlign columnSpace equallyReplace ▾Circuit ▾MatchMoveCopyDelete$/);
    expect(result()).toMatch(/3 devices selected · Ground/);
    expect(result()).toMatch(/Devices3 × LightCircuits3 × DB-GF1\/B2/);
    await act(async () => { barButton('Align row').click(); });
    expect(new Set(project.lvPoints!.filter((d) => d.type === 'ltg').map((d) => d.y.toFixed(2)))).toEqual(new Set(['9.07']));
    await act(async () => { barButton('Circuit ▾').click(); });
    const y2 = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent!.startsWith('DB-GF1/Y2'))!;
    expect(y2.textContent).toMatch(/9 → 12 pts ⚠$/); // 8 lights and an exhaust fan, over the 10 lights allowed with 3 more
    const b2 = villa.feeders.find((f) => f.id === 'DB-GF1-B2')!.points!.ltg!;
    await act(async () => { (y2 as HTMLButtonElement).click(); });
    expect(project.lvPoints!.filter((d) => d.type === 'ltg').every((d) => d.feederId === 'DB-GF1-Y2')).toBe(true);
    expect(project.feeders.find((f) => f.id === 'DB-GF1-B2')!.points!.ltg).toBe(b2 + 3 - 3);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('CIRCUIT  3 devices on DB-GF1/Y2 (12 points; 11 of this type, over the 10 allowed) · ⌘Z to undo');
    await clickAt(9000, 9070, true); // Shift-click takes one off
    expect(bar()!.textContent).toMatch(/^2 selected/);
    await clickAt(6000, 4000, true); // and adds the socket: a mixed set gets Filter
    expect(bar()!.textContent).toMatch(/^3 selectedFilter ▾Align row/);
    await act(async () => { barButton('Filter ▾').click(); });
    await act(async () => { ([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent!.startsWith('Light only')) as HTMLButtonElement).click(); });
    expect(bar()!.textContent).toMatch(/^2 selected/);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); });
    expect(project.lvPoints!.map((d) => d.type)).toEqual(['ltg', 's13']);
    expect(bar()).toBeNull();
    await dragWindow([10000, 3000], [2000, 10000]); // right to left: crossing
    expect(bar()!.textContent).toMatch(/^2 selected/);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(bar()).toBeNull();
  });

  it('right-click: the menu of a device; Replace, then Array on line and Match from the tools', async () => {
    const gf = { building: 'V', level: 'GF' };
    const start = placeLvPoint(placeLvPoint(villa, gf, 's13', 'DB-GF1-B6', 6, 4).project, gf, 'ltg', 'DB-GF1-Y1', 3, 9).project;
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const [sx, sy] = screenOf(6000, 4000);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); });
    const menu = document.querySelector('[role="menu"][aria-label="Edit devices"]') as HTMLElement;
    expect(menu.textContent).toBe('Socket 13 A · DB-GF1/B6Replace ▾Circuit ▾MatchMoveCopyDelete');
    await act(async () => { [...menu.querySelectorAll('button')].find((b) => b.textContent === 'Replace ▾')!.click(); });
    await act(async () => { ([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent!.startsWith('Twin socket')) as HTMLButtonElement).click(); });
    expect(project.lvPoints!.find((d) => d.x === 6)!.type).toBe('s13t');
    expect(project.feeders.find((f) => f.id === 'DB-GF1-B6')!.points).toMatchObject({ s13: 6, s13t: 1 });
    await command('ARL');
    expect(state.tool).toBe('arl');
    await clickAt(0, 12000);
    await clickAt(10000, 12000);
    act(() => state.setFeederId('DB-GF1-Y1'));
    expect(document.body.textContent).toMatch(/Array on line line 10\.00 m/);
    expect(document.body.textContent).toMatch(/Devices5 × LightSpacing2\.00 m/);
    await command(''); // Enter places them
    expect(project.lvPoints!.filter((d) => d.y === 12).map((d) => d.x.toFixed(2))).toEqual(['1.00', '3.00', '5.00', '7.00', '9.00']);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('ARL  5 × Light placed on DB-GF1/Y1 · ⌘Z to undo');
    await command('MA');
    await clickAt(3000, 9000); // from the light on Y1
    expect(document.body.textContent).toMatch(/Match from Light · DB-GF1\/Y1/);
    await clickAt(6000, 4000); // the twin socket takes its circuit
    expect(project.lvPoints!.find((d) => d.x === 6)).toMatchObject({ type: 's13t', feederId: 'DB-GF1-Y1' });
  });

  it('edits what was drawn: Trim at a drawn line, Extend to one, Offset by a typed distance, Fillet into a sharp corner', async () => {
    const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
    // Well clear of the plan, so only the drawn lines are edges.
    const X = 200000, Y = 0;
    const start: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [
      line('S1', [X, Y], [X + 10000, Y]), line('S2', [X + 6000, Y - 2000], [X + 6000, Y + 2000]),
      line('S3', [X, Y + 5000], [X + 3000, Y + 5000]), line('S4', [X + 8000, Y + 3000], [X + 8000, Y + 7000])
    ] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const item = (id: string) => project.cadSketch![0].items.find((x) => x.id === id)!;
    const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
    await command('TRIM');
    expect(state.tool).toBe('trim');
    await clickAt(X + 8000, Y);
    expect(item('S1').pts).toEqual([[X, Y], [X + 6000, Y]]);
    expect(last()).toBe('TRIM  4.00 m cut off · ⌘Z to undo');
    await command('EX');
    await clickAt(X + 2900, Y + 5000);
    expect(item('S3').pts).toEqual([[X, Y + 5000], [X + 8000, Y + 5000]]);
    expect(last()).toBe('EXTEND  5.00 m longer · ⌘Z to undo');
    await command('O');
    await command('0.5');
    await clickAt(X + 3000, Y);
    await clickAt(X + 3000, Y + 1000);
    const copy = project.cadSketch![0].items.find((x) => x.pts[0][1] === Y + 500)!;
    expect(copy.pts).toEqual([[X, Y + 500], [X + 6000, Y + 500]]);
    expect(last()).toBe('OFFSET  Line copied 0.50 m to the side · ⌘Z to undo');
    await command('F');
    await clickAt(X + 4000, Y + 5000);
    await clickAt(X + 8000, Y + 6500);
    expect(item('S4').pts).toEqual([[X + 8000, Y + 5000], [X + 8000, Y + 7000]]);
    expect(last()).toBe('FILLET  sharp corner · ⌘Z to undo');
  });

  it('picks drawn objects with a window: their toolbar joins them; a grip drag moves an end; mirror keeps the originals', async () => {
    const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
    const X = 200000;
    const start: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 4000, 0]), line('S2', [X + 4000, 0], [X + 4000, 3000])] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const bar = () => document.querySelector('[aria-label="Edit drawn objects"]') as HTMLElement | null;
    await dragWindow([X - 500, -500], [X + 4500, 3500]);
    expect(bar()!.textContent).toBe('2 selectedJoinMirrorScaleArrayMoveCopyErase');
    expect(result()).toMatch(/^2 objects selectedJoin/);
    // The properties palette counts them by kind.
    expect([...document.querySelectorAll('[aria-label="Objects shown"] option')].map((o) => o.textContent)).toEqual(['All (2)', 'Line (2)']);
    await act(async () => { [...bar()!.querySelectorAll('button')].find((b) => b.textContent === 'Join')!.click(); });
    expect(project.cadSketch![0].items).toEqual([{ id: 'S1', kind: 'pline', layer: 'LV-SKETCH', pts: [[X, 0], [X + 4000, 0], [X + 4000, 3000]] }]);
    await clickAt(X + 2000, 0); // select it: its grips show
    expect(bar()!.textContent).toMatch(/^Polyline · 7\.00 m/);
    const [gx, gy] = screenOf(X + 4000, 3000), [tx, ty] = screenOf(X + 4000, 5000);
    const c = document.querySelector('canvas.cad-over')!;
    await act(async () => {
      c.dispatchEvent(new MouseEvent('mousedown', { clientX: gx, clientY: gy, button: 0, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mousemove', { clientX: tx, clientY: ty, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mouseup', { clientX: tx, clientY: ty, button: 0, bubbles: true }));
    });
    expect(project.cadSketch![0].items[0].pts[2].map((v) => Math.round(v))).toEqual([X + 4000, 5000]);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('GRIP  Polyline changed — now 9.00 m · ⌘Z to undo');
    await act(async () => { [...bar()!.querySelectorAll('button')].find((b) => b.textContent === 'Mirror')!.click(); });
    expect(state.tool).toBe('mirror');
    await clickAt(X, -1000);
    await clickAt(X + 1000, -1000); // about y = −1 m
    expect(document.querySelector('.cad-hist')!.textContent).toBe('MIRROR  Erase source objects? [Yes/No] <No>:');
    await command(''); // Enter: No, the originals stay
    const items = project.cadSketch![0].items;
    expect(items).toHaveLength(2);
    expect(items[1].pts.map((q) => q.map((v) => Math.round(v)))).toEqual([[X, -2000], [X + 4000, -2000], [X + 4000, -7000]]);
  });

  it('layer manager: a drawn layer locked cannot be picked; properties of an object and Match properties', async () => {
    const line = (id: string, layer: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer, pts: [a, b] });
    const X = 200000;
    const start: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', 'LV-SKETCH', [X, 0], [X + 4000, 0]), line('S2', 'LV-ANNO', [X, 2000], [X + 4000, 2000])] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const pick = (label: string, value: string) => {
      const el = document.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement;
      act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    await command('LM');
    // The layer palette docks beside the drawing: one table, drawn layers first.
    await until(() => !!document.querySelector('[aria-label="Layer palette"]'));
    expect(document.querySelector('[aria-label="Layers"]')!.textContent).toMatch(/^NameOnFrLkColourLinetypeWeightPr#Drawn in the appLV-SKETCH/);
    expect(document.querySelector('[aria-label="Layer palette"] [role="status"]')!.textContent).toMatch(/^Current layer: LV-SKETCH · \d+ layers$/);
    act(() => { (document.querySelector('[aria-label="LV-ANNO locked"]') as HTMLButtonElement).click(); });
    act(() => { (document.querySelector('[aria-label="LV-SKETCH linetype"]') as HTMLButtonElement).click(); });
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('[aria-label="LV-SKETCH linetype list"] [role="option"]')].find((b) => b.textContent === 'Dashed')!.click(); });
    expect(project.cadLayerStyle).toEqual({ 'sample-villa-gf.dxf': { 'LV-ANNO': { lock: true }, 'LV-SKETCH': { lt: 'dashed' } } });
    // Index colour by number: open the colour cell, type 8, Enter.
    act(() => { (document.querySelector('[aria-label="LV-SKETCH colour"]') as HTMLButtonElement).click(); });
    const num = document.querySelector('[aria-label="LV-SKETCH colour number or RGB"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(num, '8'); num.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { num.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(project.cadLayerStyle!['sample-villa-gf.dxf']['LV-SKETCH']).toEqual({ lt: 'dashed', color: 'idx:8' });
    expect(document.querySelector('[aria-label="LV-SKETCH colour"]')!.textContent).toBe('Grey (8)');
    // And from the grid: colour 130.
    act(() => { (document.querySelector('[aria-label="LV-SKETCH colour"]') as HTMLButtonElement).click(); });
    act(() => { (document.querySelector('[aria-label="LV-SKETCH colour picker"] [aria-label="Colour 130"]') as HTMLButtonElement).click(); });
    expect(project.cadLayerStyle!['sample-villa-gf.dxf']['LV-SKETCH'].color).toBe('idx:130');
    act(() => { (document.querySelector('[aria-label="Close the layer palette"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[aria-label="Layer palette"]')).toBeNull();
    await clickAt(X + 2000, 2000); // on the locked layer: not picked
    expect(state.selected).toBeNull();
    await clickAt(X + 2000, 0);
    expect(state.selected).toBe('sk:S1');
    act(() => { (document.querySelector('[aria-label="Object colour"]') as HTMLButtonElement).click(); });
    act(() => { (document.querySelector('[aria-label="Object colour picker"] [aria-label="Red"]') as HTMLButtonElement).click(); });
    pick('Object lineweight', '0.5');
    expect(project.cadSketch![0].items[0]).toMatchObject({ color: '#ff3b30', lw: 0.5 });
    await command('LM');
    act(() => { (document.querySelector('[aria-label="LV-ANNO locked"]') as HTMLButtonElement).click(); });
    await command('LM'); // LM again closes it
    expect(document.querySelector('[aria-label="Layer palette"]')).toBeNull();
    await command('MP');
    await clickAt(X + 2000, 0);
    await clickAt(X + 2000, 2000);
    expect(project.cadSketch![0].items[1]).toMatchObject({ layer: 'LV-SKETCH', color: '#ff3b30', lw: 0.5 });
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('MATCHPROP  Properties copied to the line · ⌘Z to undo');
  });

  it('layer tools by picking (off, freeze, lock, unlock, make current; all on, thaw all), new objects\' properties, what the ribbon is told, and Fit', async () => {
    const X = 200000, F = 'sample-villa-gf.dxf';
    const start: Project = { ...villa, cadSketch: [{ file: F, items: [{ id: 'S1', kind: 'line', layer: 'E-LIGHT', pts: [[X, 0], [X + 4000, 0]] }] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
    const said = () => document.querySelector('.cad-hist')!.textContent;
    // The ribbon is told the drawn layers, the current one and the properties of new objects.
    expect(state.ribbonInfo).toMatchObject({ current: 'LV-SKETCH', picked: 0, props: {} });
    expect(state.ribbonInfo!.layers.map((l) => l.name)).toEqual(expect.arrayContaining(['LV-SKETCH', 'E-LIGHT']));
    expect(state.ribbonInfo!.layers.map((l) => l.name)).not.toContain('A-WALL'); // the architect's cannot be current
    await command('LAYOFF');
    expect(said()).toBe('LAYOFF  Pick an object on the layer first, then LAYOFF.');
    await clickAt(X + 2000, 0);
    expect(state.selected).toBe('sk:S1');
    await command('LAYLCK');
    expect(last()).toBe('LAYLCK  Layer E-LIGHT locked · ⌘Z to undo');
    expect(project.cadLayerStyle).toEqual({ [F]: { 'E-LIGHT': { lock: true } } });
    await command('LAYULK');
    expect(project.cadLayerStyle).toBeUndefined();
    await command('LAYMCUR');
    expect(project.cadLayerFile).toEqual({ [F]: { current: 'E-LIGHT' } });
    await command('LAYFRZ');
    expect(said()).toBe('LAYFRZ  Nothing to change (E-LIGHT is the current layer: not frozen).');
    await command('CLAYER LV-SKETCH');
    await command('LAYFRZ');
    expect(last()).toBe('LAYFRZ  Layer E-LIGHT frozen · ⌘Z to undo');
    expect(state.selected).toBeNull(); // out of sight: no longer picked
    await command('LAYTHW');
    expect(last()).toBe('LAYTHW  Layer E-LIGHT thawed · ⌘Z to undo');
    await clickAt(X + 2000, 0);
    await command('LAYOFF');
    expect(last()).toBe('LAYOFF  Layer E-LIGHT off · ⌘Z to undo');
    await command('LAYON');
    expect(last()).toMatch(/^LAYON {2}(Layer E-LIGHT|\d+ layers) on · ⌘Z to undo$/);
    expect(project.cadLayerStyle).toBeUndefined();
    // Nothing picked: the lineweight chosen is for new objects, and the next line takes it.
    act(() => state.actions.current.setProps({ lw: 0.5 }));
    expect(last()).toBe('Lineweight of new objects: 0.50 mm · ⌘Z to undo');
    expect(state.ribbonInfo!.props).toEqual({ lw: 0.5 });
    expect((document.querySelector('select[aria-label="Lineweight of new objects"]') as HTMLSelectElement).value).toBe('0.5'); // the palette shows it too
    await command('L');
    await clickAt(X, 1000);
    await clickAt(X + 3000, 1000);
    await command('');
    act(() => state.setTool('none'));
    const items = () => project.cadSketch![0].items;
    expect(items()[1]).toMatchObject({ kind: 'line', layer: 'LV-SKETCH', lw: 0.5 });
    // Objects picked: the same list changes them, and the ribbon shows theirs.
    await clickAt(X + 1500, 1000);
    expect(state.ribbonInfo).toMatchObject({ picked: 1, props: { lw: 0.5 } });
    act(() => state.actions.current.setProps({ color: '#ff3b30' }));
    expect(items()[1]).toMatchObject({ color: '#ff3b30', lw: 0.5 });
    expect(last()).toBe('Colour Red: 1 object · ⌘Z to undo');
    // Fit is on the status bar.
    const before = state.fitKey;
    act(() => button('FIT').click());
    expect(state.fitKey).toBe(before + 1);
  });

  it('layer palette: new objects go on the current layer; freeze, isolate, rename and states from the palette and the command line', async () => {
    const X = 200000, F = 'sample-villa-gf.dxf';
    const start: Project = { ...villa, cadSketch: [{ file: F, items: [{ id: 'S1', kind: 'line', layer: 'E-LIGHT', pts: [[X, 0], [X + 4000, 0]] }] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const items = () => project.cadSketch![0].items;
    const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
    const wall = state.view!.info.layers.findIndex((l) => l.name === 'A-WALL');
    // CLAYER: lines, rectangles, circles … go on it; a tray or text keeps its own layer.
    await command('CLAYER e-light');
    expect(project.cadLayerFile).toEqual({ [F]: { current: 'E-LIGHT' } });
    await command('L');
    await clickAt(X, 1000);
    await clickAt(X + 3000, 1000);
    await command('');
    expect(items()[1]).toMatchObject({ kind: 'line', layer: 'E-LIGHT' });
    act(() => state.setTool('none'));
    await command('CLAYER A-WALL');
    expect(document.querySelector('.cad-hist')!.textContent).toBe('CLAYER  A-WALL is the architect\'s; new objects go on the app\'s drawn layers.');
    // The palette stays open beside the drawing, which is still in use.
    await command('LM');
    await until(() => !!document.querySelector('[aria-label="Layer palette"]'));
    expect(document.querySelector('[aria-label="Layer palette"] [role="status"]')!.textContent).toMatch(/^Current layer: E-LIGHT · \d+ layers$/);
    act(() => { (document.querySelector('[aria-label="E-LIGHT frozen"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[aria-label="Layer palette"] [role="status"]')!.textContent).toContain('E-LIGHT is the current layer; it cannot be frozen.');
    await command('CLAYER LV-SKETCH');
    expect(project.cadLayerFile).toBeUndefined();
    act(() => { (document.querySelector('[aria-label="E-LIGHT frozen"]') as HTMLButtonElement).click(); });
    expect(project.cadLayerStyle).toEqual({ [F]: { 'E-LIGHT': { freeze: true } } });
    await clickAt(X + 2000, 0); // frozen: not picked
    expect(state.selected).toBeNull();
    act(() => { (document.querySelector('[aria-label="E-LIGHT frozen"]') as HTMLButtonElement).click(); });
    await clickAt(X + 2000, 0);
    expect(state.selected).toBe('sk:S1');
    // LAYISO: every layer but the picked object's turns off; LAYUNISO puts them back.
    await command('LAYISO');
    expect(last()).toMatch(/^LAYISO {2}E-LIGHT kept on, \d+ other layers off \(LAYUNISO puts them back\) · ⌘Z to undo$/);
    expect(shown(wall)).toBe(0);
    expect(project.cadLayerStyle![F]['LV-SKETCH']).toEqual({ hidden: true });
    await command('LAYUNISO');
    expect(shown(wall)).toBe(1);
    expect(project.cadLayerStyle).toBeUndefined();
    expect(project.cadLayerFile).toBeUndefined();
    // Rename by double-click: the objects follow.
    const name = (n: string) => [...document.querySelectorAll<HTMLElement>('.cad-lp-name')].find((td) => td.textContent === n)!;
    act(() => { name('E-LIGHT').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const input = document.querySelector('[aria-label="Layer name"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'E-LIGHT-SW'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(items().map((it) => it.layer)).toEqual(['E-LIGHT-SW', 'E-LIGHT-SW']);
    expect(last()).toBe('Layer E-LIGHT renamed E-LIGHT-SW · ⌘Z to undo');
    // LAYER N adds an empty layer; a layer state saved and restored.
    await command('LAYER N');
    expect(project.cadLayerFile).toEqual({ [F]: { layers: ['Layer1'] } });
    act(() => { (document.querySelector('[aria-label="A-WALL on"]') as HTMLButtonElement).click(); });
    expect(shown(wall)).toBe(0);
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Layer states ▾')!.click(); });
    const sn = document.querySelector('[aria-label="New layer state name"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(sn, 'No walls'); sn.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { sn.form!.requestSubmit(); });
    expect(project.cadLayerFile![F].states).toEqual([{ name: 'No walls', layers: expect.objectContaining({ 'A-WALL': { on: false } }) }]);
    act(() => { (document.querySelector('[aria-label="A-WALL on"]') as HTMLButtonElement).click(); });
    expect(shown(wall)).toBe(1);
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Layer states ▾')!.click(); });
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('.cad-lp-state button')].find((b) => b.textContent === 'No walls')!.click(); });
    expect(shown(wall)).toBe(0);
  });

  it('properties palette: shown with a drawing open, defaults with nothing picked, geometry of a line edited in one undo step; Ctrl/Cmd+1 hides it', async () => {
    const X = 200000, F = 'sample-villa-gf.dxf';
    const start: Project = { ...villa, cadSketch: [{ file: F, items: [{ id: 'S1', kind: 'line', layer: 'LV-SKETCH', pts: [[X, 0], [X + 4000, 0]] }] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const pal = () => document.querySelector('[aria-label="Properties palette"]');
    await until(() => !!pal());
    expect(pal()!.textContent).toContain('Text height2.5 mm');
    await clickAt(X + 2000, 0);
    expect(state.selected).toBe('sk:S1');
    await until(() => !!document.querySelector('[aria-label="Objects shown"]'));
    const endX = () => document.querySelector('[aria-label="End X"]') as HTMLElement;
    expect(endX().textContent).toBe(((X + 4000) / 1000).toFixed(2));
    act(() => { (endX() as HTMLButtonElement).click(); });
    const input = endX() as HTMLInputElement;
    const calls = onChange.mock.calls.length;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String((X + 6000) / 1000)); input.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(onChange.mock.calls.length).toBe(calls + 1);
    expect(project.cadSketch![0].items[0]).toEqual({ id: 'S1', kind: 'line', layer: 'LV-SKETCH', pts: [[X, 0], [X + 6000, 0]] });
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe(`Line: end x ${((X + 6000) / 1000).toFixed(2)} · ⌘Z to undo`);
    // Ctrl/Cmd+1 hides and shows it.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true })); });
    expect(pal()).toBeNull();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true })); });
    expect(pal()).not.toBeNull();
  });

  it('hatches a closed object, adds a leader with its text, a room tag and a north arrow', async () => {
    const X = 200000;
    const start: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [{ id: 'S1', kind: 'pline', layer: 'LV-SKETCH', closed: true, pts: [[X, 0], [X + 4000, 0], [X + 4000, 3000], [X, 3000]] }] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const items = () => project.cadSketch![0].items;
    const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
    await command('H');
    expect(document.body.textContent).toContain('Hatch H');
    await clickAt(X + 1000, 1000);
    expect(items()[1]).toEqual({ id: 'S2', kind: 'pline', layer: 'LV-HATCH', closed: true, pts: items()[0].pts, hatch: { pattern: 'ansi31', scale: 3, angle: 0 } });
    expect(last()).toBe('Hatch ANSI31, 12.00 m² · ⌘Z to undo');
    await command('LE');
    await clickAt(X + 2000, 1500);
    await clickAt(X + 6000, 4000);
    await command('DB-GF1');
    expect(items().slice(2).map((x) => [x.kind, x.leader ?? false, x.text ?? ''])).toEqual([['line', true, ''], ['text', false, 'DB-GF1']]);
    expect(items()[3].h).toBeCloseTo(250, 6); // 2.5 mm at 1:100 on a mm drawing
    act(() => state.actions.current.addFound());
    const room = buildingInfoOf(project).rooms.find((r) => r.outline)!;
    const [cx, cy] = room.outline!.reduce(([x, y], q) => [x + q[0] / room.outline!.length, y + q[1] / room.outline!.length], [0, 0]);
    await command('RT');
    await clickAt(cx / 0.001, cy / 0.001);
    expect(last()).toBe(`Room tag ${room.name} · ⌘Z to undo`);
    expect(items().slice(-2).map((x) => x.text)).toEqual([room.name.toUpperCase(), `${room.areaM2.toFixed(2)} m²`]);
    await command('NORTH');
    await clickAt(X + 8000, 8000);
    expect(items().slice(-3).map((x) => x.kind)).toEqual(['circle', 'pline', 'text']);
    expect(state.tool).toBe('none');
  });

  it('turns a camera to face the point clicked (RO)', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    act(() => { state.setDevice('camera'); state.setTool('dev'); });
    await clickAt(5000, 5000);
    act(() => state.setTool('rotate'));
    await clickAt(5000, 5000); // select it
    await clickAt(5000, 9000); // face north
    expect(project.elvDevices![0]).toMatchObject({ type: 'camera', rotationDeg: 90 });
  });

  it('saves the drawing as DWG with what was drawn, and the DWG opens again with it', async () => {
    const saveBinary = vi.fn(async () => '/plans/out.dwg');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary };
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('rec');
    await clickAt(6000, 6000);
    await clickAt(9000, 8000);
    await command('SAVEDWG');
    await flush();
    const call = (saveBinary.mock.calls[0] as unknown as [{ defaultName: string; bytes: Uint8Array }])[0];
    expect(call.defaultName).toBe('sample-villa-gf - with devices.dwg');
    expect(new TextDecoder().decode(call.bytes.slice(0, 4))).toBe('AC10');
    const back = await openDrawing('out.dwg', call.bytes);
    expect(back.info.format).toBe('DWG');
    expect(back.info.layers.some((l) => l.name === 'LV-SKETCH' && l.count === 4)).toBe(true); // the rectangle drawn
    expect(back.info.segments).toBe(state.view!.info.segments + 4);
  });
});

describe('file tabs', () => {
  const tabs = () => [...document.querySelectorAll('.cad-tabs [role="tab"]')].map((t) => t.textContent);
  const shown = () => document.querySelector('.cad-tabs [aria-selected="true"]')?.textContent;
  const tabOf = (name: string) => [...document.querySelectorAll('.cad-tab')].find((t) => t.textContent?.includes(name))!;
  const nameOf = (name: string) => tabOf(name).querySelector('[role="tab"]') as HTMLButtonElement;
  const closeOf = (name: string) => tabOf(name).querySelector('.cad-tab-x') as HTMLButtonElement;
  const add = () => document.querySelector('.cad-tab-add') as HTMLButtonElement;
  const rightClick = (name: string) => act(() => { nameOf(name).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 60 })); });
  const menu = () => document.querySelector('.cad-tab-menu');
  const hist = () => document.querySelector('.cad-hist')?.textContent;
  const GF = 'sample-villa-gf.dxf', FF = 'sample-villa-ff.dxf';
  const sampleReads = () => (window.lvds!.cadFile!.sampleBytes as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
  const twoPlans: Project = {
    ...villa,
    building: { ...villa.building!, buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }, { id: 'FF', name: 'First', kind: 'typical', heightM: 4 }] }] },
    cadPlans: [{ building: 'V', level: 'GF', file: GF, units: 4 }, { building: 'V', level: 'FF', file: FF, units: 4 }]
  };
  const openAnother = async () => { await act(async () => { add().click(); }); await flush(); };

  it('has a tab for each drawing with its level; + opens another, and a click switches back', async () => {
    act(() => root.render(<Host />));
    await flush();
    expect(tabs()).toEqual([`Level? · ${GF}`]);
    await openAnother();
    expect(tabs()).toEqual([`Level? · ${GF}`, 'Level? · plan.dwg']);
    expect(shown()).toBe('Level? · plan.dwg');
    expect(document.body.textContent).toMatch(/plan\.dwg · DWG/);
    await act(async () => { nameOf(GF).click(); });
    await flush();
    expect(state.view?.file).toBe(GF);
    expect(shown()).toBe(`Level? · ${GF}`);
    expect(document.body.textContent).toMatch(/sample-villa-gf\.dxf · DXF/);
    expect(state.drawings).toHaveLength(2); // the other stays open
  });

  it('keeps the tab showing in view when the row is full', async () => {
    const seen: string[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) { seen.push(this.textContent ?? ''); });
    try {
      act(() => root.render(<Host />));
      await flush();
      await openAnother();
      expect(seen[seen.length - 1]).toContain('plan.dwg');
      await act(async () => { nameOf(GF).click(); });
      expect(seen[seen.length - 1]).toContain(GF);
    } finally { delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; }
  });

  it('shows the level of a drawing that is the plan of one', async () => {
    act(() => root.render(<Host start={twoPlans} />));
    await flush();
    expect(tabs()).toEqual([`Ground · ${GF}`]);
  });

  it('× closes a drawing, showing the next; the last leaves the page that offers to open one, with Reopen', async () => {
    (window.lvds!.cadFile as { readBytes?: unknown }).readBytes = vi.fn(async (p: string) => ({ file: 'plan.dwg', path: p, bytes: bytes('tests/fixtures/cad/plan-2018.dwg') }));
    act(() => root.render(<Host />));
    await flush();
    await openAnother();
    act(() => closeOf('plan.dwg').click());
    expect(tabs()).toEqual([`Level? · ${GF}`]);
    expect(state.view?.file).toBe(GF);
    expect(hist()).toBe('plan.dwg closed. What you drew stays in the project.');
    act(() => closeOf(GF).click());
    expect(tabs()).toEqual([]);
    expect(state.view).toBeNull();
    expect(document.querySelector('.cad-tabs')).toBeNull();
    expect(button('Open drawing…')).toBeDefined();
    expect(button('Reopen plan.dwg')).toBeDefined();
    expect(result()).toContain('No drawing open.');
    await act(async () => { button('Reopen plan.dwg').click(); });
    await flush();
    expect(tabs()).toEqual(['Level? · plan.dwg']);
  });

  it('right-click: Close, Close others and Close all; Close others is off with one tab', async () => {
    act(() => root.render(<Host />));
    await flush();
    await openAnother();
    rightClick(GF);
    expect(menu()).not.toBeNull();
    expect((document.activeElement as HTMLElement).textContent).toBe('Close');
    act(() => button('Close others').click());
    expect(menu()).toBeNull();
    expect(tabs()).toEqual([`Level? · ${GF}`]);
    expect(state.view?.file).toBe(GF); // plan.dwg was showing and has gone; the one kept shows
    rightClick(GF);
    expect(button('Close others').disabled).toBe(true);
    act(() => button('Close all').click());
    expect(tabs()).toEqual([]);
    await act(async () => { button('Open drawing…').click(); });
    await flush();
    rightClick('plan.dwg');
    act(() => button('Close').click());
    expect(tabs()).toEqual([]);
  });

  it('Esc or a click elsewhere shuts the menu and leaves the tool in use', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.setTool('dist'));
    rightClick(GF);
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(menu()).toBeNull();
    expect(state.tool).toBe('dist');
    rightClick(GF);
    act(() => (document.querySelector('.st-cover') as HTMLElement).click());
    expect(menu()).toBeNull();
    expect(state.drawings).toHaveLength(1);
    expect(state.tool).toBe('dist');
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(state.tool).toBe('none'); // with the menu shut, Esc cancels the tool as before
  });

  it('CLOSE and CLOSEALL at the command line, and Close on the ribbon', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('open');
    await flush();
    await command('close');
    expect(tabs()).toEqual([`Level? · ${GF}`]);
    await command('open');
    await flush();
    act(() => state.actions.current.close());
    expect(tabs()).toEqual([`Level? · ${GF}`]);
    await command('open');
    await flush();
    await command('CLOSEALL');
    expect(tabs()).toEqual([]);
    expect(hist()).toBe('2 drawings closed. What you drew stays in the project.');
    await command('close');
    expect(hist()).toBe('No drawing open.');
    await command('closeall');
    expect(hist()).toBe('No drawing open.');
    act(() => state.actions.current.close()); // nothing to close
    expect(hist()).toBe('No drawing open.');
    await command('help');
    expect(hist()).toContain('OPEN · CLOSE · CLOSEALL');
  });

  it('arrow keys, Home and End move between tabs without panning the drawing', async () => {
    act(() => root.render(<Host />));
    await flush();
    await openAnother();
    act(() => state.toggle('osnap'));
    const key = (k: string) => act(() => { (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
    const coords = () => {
      act(() => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 200, bubbles: true })); });
      return document.querySelector('.cad-coords')?.textContent;
    };
    const before = coords();
    act(() => nameOf('plan.dwg').focus());
    key('ArrowRight');
    expect(state.view?.file).toBe(GF);
    expect(document.activeElement).toBe(nameOf(GF));
    expect(nameOf(GF).tabIndex).toBe(0);
    expect(nameOf('plan.dwg').tabIndex).toBe(-1);
    key('ArrowLeft');
    expect(state.view?.file).toBe('plan.dwg');
    key('Home');
    expect(state.view?.file).toBe(GF);
    key('End');
    expect(state.view?.file).toBe('plan.dwg');
    expect(coords()).toBe(before);
  });

  it('clears what was picked or being drawn when another tab shows, and when the last one closes', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('di');
    await clickAt(30, -80);
    await clickAt(6170, -80);
    expect(result()).toMatch(/Distance 6\.20 m/);
    await openAnother();
    expect(result()).not.toMatch(/Distance/);
    await act(async () => { nameOf(GF).click(); });
    await flush();
    expect(result()).not.toMatch(/Distance/);
    await command('li');
    await clickAt(6687.5 + 190, 7375);
    await flush();
    expect(result()).toMatch(/Block · L1/);
    await command('closeall'); // what was picked needs its drawing: it goes with it
    await flush();
    expect(result()).toContain('No drawing open.');
    expect(state.view).toBeNull();
  });

  it('the Plans list marks the plans in tabs and goes to a tab without reading the file again', async () => {
    act(() => root.render(<Host start={twoPlans} />));
    await flush();
    const plans = () => [...document.querySelectorAll('[aria-label="Plans of this project"] button')] as HTMLButtonElement[];
    expect(plans().map((b) => b.textContent)).toEqual([`Ground${GF}open`, `First${FF}`]);
    expect(plans()[0].disabled).toBe(true);
    await act(async () => { plans()[1].click(); });
    await flush();
    expect(tabs()).toEqual([`Ground · ${GF}`, `First · ${FF}`]);
    expect(plans().map((b) => b.textContent)).toEqual([`Ground${GF}open`, `First${FF}open`]);
    const reads = sampleReads();
    expect(plans()[0].disabled).toBe(false);
    await act(async () => { plans()[0].click(); });
    await flush();
    expect(shown()).toBe(`Ground · ${GF}`);
    expect(sampleReads()).toBe(reads);
    expect(state.drawings).toHaveLength(2);
    act(() => closeOf(FF).click());
    expect(plans().map((b) => b.textContent)).toEqual([`Ground${GF}open`, `First${FF}`]);
  });

  it('the sample floor list goes to the tab of a sample already open', async () => {
    act(() => root.render(<Host />));
    await flush();
    const pick = async (file: string) => {
      const list = document.querySelector('select[aria-label="Sample floor"]') as HTMLSelectElement;
      await act(async () => { list.value = file; list.dispatchEvent(new Event('change', { bubbles: true })); });
      await flush();
    };
    await pick(FF);
    expect(state.drawings.map((v) => v.file)).toEqual([GF, FF]);
    const reads = sampleReads();
    await pick(GF);
    expect(state.view?.file).toBe(GF);
    expect(sampleReads()).toBe(reads);
  });

  it('File → Plans goes to a tab; replacing a plan stays in its tab', async () => {
    project = twoPlans;
    act(() => root.render(<Host start={twoPlans} />));
    await flush();
    const apply = (next: Project, message: string) => onChange(next, message);
    await act(async () => { cadFileMenu(project, state, apply, () => {}).plans[1].onClick(); });
    await flush();
    expect(state.drawings.map((v) => v.file)).toEqual([GF, FF]);
    const reads = sampleReads();
    await act(async () => { cadFileMenu(project, state, apply, () => {}).plans[0].onClick(); });
    await flush();
    expect(state.view?.file).toBe(GF);
    expect(sampleReads()).toBe(reads);
    const before = state.view!;
    const replace = cadFileMenu(project, state, apply, () => {}).plans.find((x) => x.label.startsWith('Replace'))!;
    await act(async () => { replace.onClick(); });
    await flush();
    expect(state.drawings.map((v) => v.file)).toEqual(['plan.dwg', FF]);
    expect(state.view?.file).toBe('plan.dwg');
    expect(state.drawings).not.toContain(before);
  });

  it('the sample villa stays closed: not when the page shows again, nor after a drawing opened from the ribbon', async () => {
    const status = vi.fn();
    let page: (on: boolean) => void = () => {};
    function Pages({ startOn }: { startOn: boolean }) {
      const cad = useCad('p1');
      const [on, setOn] = useState(startOn);
      state = cad;
      page = setOn;
      return on ? <CadPage cad={cad} project={villa} onChange={onChange} onStatus={status} /> : null;
    }
    act(() => root.render(<Pages startOn />));
    await flush();
    expect(state.view?.file).toBe(GF);
    await command('close');
    expect(status).toHaveBeenCalledWith(`${GF} closed. What you drew stays in the project.`);
    await flush();
    expect(state.view).toBeNull();
    act(() => page(false));
    act(() => page(true));
    await flush();
    expect(state.view).toBeNull();
    expect(button('Sample villa · Ground floor')).toBeDefined(); // still offered
    act(() => root.render(null));

    act(() => root.render(<Pages startOn={false} />));
    const v = await openDrawing('plan.dwg', bytes('tests/fixtures/cad/plan-2018.dwg'));
    act(() => state.open(v));
    act(() => page(true));
    await flush();
    await command('close');
    await flush();
    expect(state.view).toBeNull();
  });

  it('References: attaches a drawing under the plan, lists it, turns its layers off, clips, binds and detaches it', async () => {
    act(() => root.render(<Host />));
    await flush();
    const lvds = (window as unknown as { lvds: { cadFile: { openBytes: ReturnType<typeof vi.fn> }; files?: unknown } }).lvds;
    lvds.cadFile.openBytes.mockResolvedValueOnce({ file: 'STR-GF.dxf', path: '/refs/STR-GF.dxf', bytes: bytes('electron/samples/sample-villa-ff.dxf') });
    const saveBinary = vi.fn(async () => '/plans/out.dxf');
    lvds.files = { saveBinary };
    const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
    const refs = () => project.cadRefs?.['sample-villa-gf.dxf'] ?? [];
    await command('XA');
    await flush();
    expect(document.body.textContent).toContain('Attach a reference');
    expect((document.querySelector('[aria-label="Reference name"]') as HTMLInputElement).value).toBe('STR-GF');
    expect((document.querySelector('[aria-label="Reference prints"]') as HTMLInputElement).checked).toBe(true); // the structure prints by default
    act(() => button('Pick on plan').click());
    expect(state.tool).toBe('xattach');
    await clickAt(1000, 2000);
    expect(document.body.textContent).toContain('Attach a reference');
    await act(async () => { button('Attach').click(); });
    expect(refs()).toHaveLength(1);
    expect(refs()[0]).toMatchObject({ name: 'STR-GF', file: 'STR-GF.dxf', type: 'overlay', scale: 1, rot: 0, fade: 50, print: true });
    expect(refs()[0].at[0]).toBeCloseTo(1000, -1);
    expect(last()).toMatch(/^XATTACH {2}STR-GF \(STR-GF\.dxf\) on sample-villa-gf\.dxf — overlay at [\d.]+, [\d.]+, ×1, 0°, [\d,]+ lines, faded 50 % · ⌘Z to undo$/);
    // Its layers show in the Layers panel as NAME|LAYER, and in the manager with their status.
    const wall = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('STR-GF|A-WALL'))!;
    expect(wall).toBeDefined();
    act(() => wall.click());
    expect(refs()[0].layers).toEqual({ 'A-WALL': { hidden: true } });
    await command('XR');
    expect(document.querySelector('[aria-label="References"]')!.textContent).toMatch(/STR-GFLoadedSTR-GF\.dxf/);
    act(() => button('Unload').click());
    expect(refs()[0].unloaded).toBe(true);
    expect(document.querySelector('[aria-label="References"]')!.textContent).toContain('Unloaded');
    act(() => button('Load').click());
    act(() => button('Clip').click());
    expect(state.tool).toBe('xclip');
    await clickAt(0, 0);
    await clickAt(5000, 4000);
    await command('');
    expect(refs()[0].clip).toEqual([[expect.any(Number), expect.any(Number)], expect.anything(), expect.anything(), expect.anything()]);
    expect(last()).toBe('XREF  STR-GF: clipped to a rectangle · ⌘Z to undo');
    // Bind: the saved copy gets the reference's lines on NAME$0$LAYER layers.
    await command('XR');
    await act(async () => { button('Bind…').click(); });
    await flush();
    const text = new TextDecoder().decode((saveBinary.mock.calls[0] as unknown as [{ bytes: Uint8Array; defaultName: string }])[0].bytes);
    expect((saveBinary.mock.calls[0] as unknown as [{ defaultName: string }])[0].defaultName).toBe('sample-villa-gf - with devices and references.dxf');
    expect(text).toContain('STR-GF$0$');
    expect(text).not.toContain('STR-GF$0$A-WALL'); // its layer is off
    expect(document.body.textContent).toContain('2 reference lines bound on NAME$0$LAYER layers'); // inside the clip; no text or hatch there
    await command('XR');
    act(() => button('Detach').click());
    expect(project.cadRefs).toBeUndefined();
    expect(last()).toBe('XREF  STR-GF detached from sample-villa-gf.dxf. STR-GF.dxf is not changed · ⌘Z to undo');
  });

  it('References: one named inside the opened drawing is looked for beside the plan and shown; one detached is not looked for again', async () => {
    act(() => root.render(<Host />));
    await flush();
    const cadFile = (window as unknown as { lvds: { cadFile: { openBytes: ReturnType<typeof vi.fn>; readBytes?: unknown } } }).lvds.cadFile;
    cadFile.openBytes.mockResolvedValueOnce({ file: 'GF.dxf', path: '/jobs/A/Arch/GF.dxf', bytes: bytes('tests/fixtures/cad/xref-host.dxf') });
    const readBytes = vi.fn(async (p: string) => (p === '/jobs/A/Structure/STR-GF.dxf' ? { file: 'STR-GF.dxf', path: p, bytes: bytes('electron/samples/sample-villa-ff.dxf') } : null));
    cadFile.readBytes = readBytes;
    await command('open');
    await flush();
    expect(state.view?.file).toBe('GF.dxf');
    // Saved as ..\Structure\STR-GF.dxf: found from the plan's folder, at the drawing's insert.
    expect(readBytes.mock.calls[0][0]).toBe('/jobs/A/Structure/STR-GF.dxf');
    const refs = () => project.cadRefs?.['gf.dxf'] ?? [];
    expect(refs()).toEqual([expect.objectContaining({ name: 'STR-GF', file: 'STR-GF.dxf', type: 'overlay', at: [500, 0], found: true })]);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('XREF  Found inside GF.dxf and shown under it: STR-GF (/jobs/A/Structure/STR-GF.dxf) · ⌘Z to undo');
    expect(localStorage.getItem('lvds.cad.paths.p1')).toContain('/jobs/A/Structure/STR-GF.dxf');
    await command('XR');
    expect(document.querySelector('[aria-label="References"]')!.textContent).toMatch(/STR-GFLoaded/);
    act(() => button('Detach').click());
    expect(refs()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('lvds.cad.refsOff.p1.gf.dxf')!)).toEqual(['STR-GF']);
  });

  it('References: one named inside the opened drawing and not found says so', async () => {
    act(() => root.render(<Host />));
    await flush();
    const cadFile = (window as unknown as { lvds: { cadFile: { openBytes: ReturnType<typeof vi.fn>; readBytes?: unknown } } }).lvds.cadFile;
    cadFile.openBytes.mockResolvedValueOnce({ file: 'GF.dxf', path: '/jobs/A/Arch/GF.dxf', bytes: bytes('tests/fixtures/cad/xref-host.dxf') });
    cadFile.readBytes = vi.fn(async () => null);
    await command('open');
    await flush();
    expect(project.cadRefs).toBeUndefined();
    expect(document.body.textContent).toContain('XREF  Not found on this computer: STR-GF (inside GF.dxf). References → Repath… finds it.');
  });

  it('Layouts: + makes a layout of the level; its paper has a viewport; VPSCALE and VPLOCK set it, MS works in it, MV adds one, the Layer manager has This viewport', async () => {
    const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
    const gf = { building: 'V', level: 'GF' };
    let start: Project = { ...villa, cadPlans: [{ building: 'V', level: 'GF', file: 'sample-villa-gf.dxf', units: 4 }] };
    for (const [x, y] of [[3, 9], [6, 9.4], [9, 8.8]]) start = placeLvPoint(start, gf, 'ltg', 'DB-GF1-B2', x, y).project;
    act(() => root.render(<Host start={start} />));
    await flush();
    const tabs = () => [...document.querySelectorAll('[aria-label="Model and layouts"] [role="tab"]')].map((t) => t.textContent);
    expect(tabs()).toEqual(['Model']);
    act(() => (document.querySelector('[aria-label="New layout"]') as HTMLButtonElement).click());
    act(() => [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.startsWith('Lighting layout'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const sheet = () => project.drawingSet!.sheets.find((x) => x.kind === 'plan')!;
    expect(sheet()).toMatchObject({ plan: 'lighting', buildingId: 'V', levelId: 'GF', number: 'E-LTG-001' });
    expect(state.layout).toBe(sheet().id);
    expect(tabs()).toEqual(['Model', 'E-LTG-001']);
    expect(document.querySelector('.cad-paper')).not.toBeNull();
    expect(document.querySelector('.cad-status')!.textContent).toMatch(/PAPERViewport 1 · 1:100 · lockedE-LTG-001 · A3 · mm/);
    await until(() => !!document.querySelector('.cad-paper iframe'));
    // Its frame, dashed over the paper; picked, its properties show.
    await until(() => !!document.querySelector('.cad-vp'));
    expect([...document.querySelectorAll('.cad-vp')].map((v) => v.getAttribute('aria-label'))).toEqual(['Viewport 1']);
    act(() => document.querySelector('.cad-vp-edge')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 })));
    expect(state.vpSel).toBe('vp1');
    expect(document.querySelector('[aria-label="Viewport properties"]')!.textContent).toMatch(/^Viewport 1 E-LTG-001Scale/);
    act(() => document.querySelector('.cad-vp-edge')!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 })));
    expect(sheet().viewports).toBeUndefined(); // picked, not moved
    // VPSCALE and VPLOCK act on the only viewport; the worked-out one becomes the sheet's own.
    await command('VPSCALE 50');
    expect(sheet().viewports).toEqual([expect.objectContaining({ id: 'vp1', scale: 50 })]);
    await command('VPLOCK');
    expect(sheet().viewports![0].locked).toBe(false);
    // MS: the drawing inside the viewport; PS back to the paper.
    await command('MS');
    expect(state.msVp).toBe('vp1');
    expect(document.querySelector('.cad-status')!.textContent).toContain('MODEL');
    await command('PS');
    expect(state.msVp).toBeNull();
    // MV: two corners on the paper make a second viewport at the scale of the one picked, onto the model there.
    await command('MV');
    const paperAt = (x: number, y: number) => act(() => document.querySelector('.cad-vps')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y })));
    paperAt(300, 300);
    paperAt(400, 360);
    expect(sheet().viewports!.map((v) => v.id)).toEqual(['vp1', 'vp2']);
    expect(sheet().viewports![1]).toMatchObject({ scale: 50 });
    expect(sheet().viewports![1].box[2]).toBeGreaterThan(2);
    expect(state.vpSel).toBe('vp2');
    expect(last()).toMatch(/^E-LTG-001 {2}Viewport 2 added at 1:50 · ⌘Z to undo$/);
    // The Layer manager in a layout: This viewport freezes a drawn layer in the viewport picked only.
    act(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Layers in this viewport…')!.click());
    expect(document.querySelector('.cad-lp-head')!.textContent).toContain('Viewport 2');
    expect([...document.querySelectorAll('[aria-label="Layers"] th')].map((t) => t.textContent)).toContain('VP');
    act(() => (document.querySelector('[aria-label="Close the layer palette"]') as HTMLButtonElement).click());
    // A paper markup from the command line: the Sheets line tool, on the paper.
    await command('L');
    expect(document.querySelector('.cad-hist')!.textContent).toBe('L  On the paper: drag where it goes (Esc stops).');
    await command('MODEL');
    expect(state.layout).toBeNull();
    expect(document.querySelector('.cad-paper')).toBeNull();
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === 'E-LTG-001')!.click());
    expect(state.layout).toBe(sheet().id);
    // Delete from the tab's menu: the layout and its sheet go (undoable).
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === 'E-LTG-001')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 500 })));
    act(() => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent === 'Delete')!.click());
    expect(project.drawingSet!.sheets.some((x) => x.kind === 'plan')).toBe(false);
    expect(tabs()).toEqual(['Model']);
    expect(state.layout).toBeNull();
  });
});

describe('CAD page actions from the ribbon', () => {
  it('a command given while another page showed (the sheets) runs once the page is there', async () => {
    let showPage: (on: boolean) => void = () => {};
    function Later() {
      const cad = useCad('p1');
      const [on, setOn] = useState(false);
      const sheetUi = useSheetUi();
      state = cad;
      showPage = setOn;
      return on ? <CadPage cad={cad} project={villa} onChange={onChange} onStatus={() => {}} sheetUi={sheetUi} /> : null;
    }
    act(() => root.render(<Later />));
    const ran = vi.fn((x: Parameters<NonNullable<CadState['pending']['current']>>[0]) => x.command('GRID'));
    state.pending.current = ran;
    expect(state.toggles.grid).toBe(false);
    act(() => showPage(true));
    await until(() => ran.mock.calls.length > 0);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(state.pending.current).toBeNull();
    expect(state.toggles.grid).toBe(true); // GRID ran on the page, as if typed
    expect(state.history.slice(-1)[0]).toBe('Command: GRID');
  });
});

describe('CAD command line', () => {
  const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
  const X = 200000;
  const two: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 4000, 0]), line('S2', [X + 6000, 1000], [X + 6000, 5000])] }] };
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const earlier = () => [...document.querySelectorAll('.cad-hist-prev div')].map((d) => d.textContent);
  const key = (k: string, target: EventTarget = window, more: KeyboardEventInit = {}) => act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more })); });
  const keyUp = (k: string, target: EventTarget = window) => act(() => { target.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k === ' ' ? 'Space' : k, bubbles: true, cancelable: true })); });
  /** A key pressed and let go (Space works as Enter when it is let go). */
  const tap = (k: string, target: EventTarget = window) => { key(k, target, { code: k === ' ' ? 'Space' : k }); keyUp(k, target); };
  const items = () => project.cadSketch![0].items;
  const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
  const option = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.cad-hist .cad-opt')].find((b) => b.textContent === name)!;
  const hover = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true })); }); };
  const start = async (p: Project = two) => { project = p; act(() => root.render(<Host start={p} />)); await flush(); act(() => state.toggle('osnap')); };

  it('shows three earlier lines, the prompt with its options, one line for an unknown command, F1 the list and F2 the history', async () => {
    await start();
    await command('xyz');
    expect(hist()).toBe('Unknown command "XYZ". Press F1 for the list.');
    await command('O');
    expect(hist()).toBe('Command: OFFSET  Specify offset distance or [Through/Erase/Layer] <0.30>:');
    expect(earlier()).toHaveLength(3);
    expect(earlier().slice(1)).toEqual(['Unknown command "XYZ". Press F1 for the list.', 'Command: O']);
    expect([...document.querySelectorAll('.cad-hist .cad-opt')].map((b) => b.textContent)).toEqual(['Through', 'Erase', 'Layer']);
    key('F1');
    expect(document.querySelector('[aria-label="Command list (F1)"]')!.textContent).toContain('O · OFFSET  Offset');
    key('Escape');
    expect(document.querySelector('.cad-log')).toBeNull();
    expect(state.tool).toBe('offset'); // Esc closed the list only
    key('F2');
    expect(document.querySelector('[aria-label="Command history (F2)"]')!.textContent).toContain('Unknown command "XYZ"');
    key('F2');
    expect(document.querySelector('.cad-log')).toBeNull();
  });

  it('Offset: an option clicked works as typed, Enter takes the value in < >, then Enter ends the tool and repeats it', async () => {
    await start();
    await command('O');
    await act(async () => { option('Erase').click(); });
    expect(earlier()[2]).toBe('OFFSET  Erase source after offsetting: Yes');
    expect(hist()).toBe('OFFSET  Specify offset distance or [Through/Erase/Layer] <0.30>:');
    await command(''); // the 0.30 in < >
    expect(hist()).toBe('OFFSET  Select object to offset or [Exit]:');
    await clickAt(X + 2000, 0);
    expect(hist()).toBe('OFFSET  Specify point on side to offset:');
    await clickAt(X + 2000, 1000);
    expect(items()).toHaveLength(2); // the source moved, none added
    expect(items()[0]).toMatchObject({ id: 'S1', pts: [[X, 300], [X + 4000, 300]] });
    expect(last()).toBe('OFFSET  Line moved 0.30 m to the side · ⌘Z to undo');
    await command('');
    expect(state.tool).toBe('none');
    await command(''); // Enter with no tool: the last command again
    expect(state.tool).toBe('offset');
    key('Escape');
    act(() => { (document.querySelector('input[aria-label="Command"]') as HTMLInputElement).blur(); });
    tap(' '); // Space works as Enter
    expect(state.tool).toBe('offset');
  });

  it('Offset Through: the copy passes through the point clicked; Layer puts it on the current layer', async () => {
    const onLayer: Project = { ...two, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [{ ...line('S1', [X, 0], [X + 4000, 0]), layer: 'A-OTHER' }] }] };
    await start(onLayer);
    await command('O');
    await command('T');
    expect(hist()).toBe('OFFSET  Specify offset distance or [Through/Erase/Layer] <Through>:');
    await command('LAYER'); // the option's word works as its key
    await command('');
    await clickAt(X + 2000, 0);
    expect(hist()).toBe('OFFSET  Specify through point:');
    await clickAt(X + 1000, 750);
    expect(items()[1].layer).toBe('LV-SKETCH');
    expect(items()[1].pts.flat().map((v) => Math.round(v))).toEqual([X, 750, X + 4000, 750]);
    expect(last()).toBe('OFFSET  Line copied 0.75 m to the side (through the point) · ⌘Z to undo');
  });

  it('Fillet: Radius asks for the radius, Trim No keeps the lines and adds the arc', async () => {
    await start();
    await command('F');
    expect(hist()).toBe('Command: FILLET  Select first object or [Radius/Trim] <R 0.00>:');
    await command('R');
    expect(hist()).toBe('FILLET  Specify fillet radius <0.00>:');
    await command('0.5');
    expect(hist()).toBe('FILLET  Select first object or [Radius/Trim] <R 0.50>:');
    await command('T');
    expect(hist()).toBe('FILLET  Select first object or [Radius/Trim] <R 0.50, No trim>:');
    await clickAt(X + 3000, 0);
    expect(hist()).toBe('FILLET  Select second object:');
    await clickAt(X + 6000, 2000);
    expect(items().slice(0, 2).map((x) => x.pts)).toEqual([[[X, 0], [X + 4000, 0]], [[X + 6000, 1000], [X + 6000, 5000]]]);
    expect(items()[2]).toMatchObject({ kind: 'arc', r: 500 });
    expect(last()).toBe('FILLET  radius 0.50 m, lines not trimmed · ⌘Z to undo');
  });

  it('Scale asks for the factor after the base point; Array asks its type', async () => {
    await start();
    await dragWindow([X - 500, -500], [X + 6500, 5500]);
    await act(async () => { [...document.querySelectorAll('[aria-label="Edit drawn objects"] button')].find((b) => b.textContent === 'Scale')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(hist()).toBe('Command: SCALE  Specify base point:');
    await clickAt(X, 0);
    expect(hist()).toBe('SCALE  Specify scale factor <2>:');
    await command('0.5');
    expect(items()[0].pts).toEqual([[X, 0], [X + 2000, 0]]);
    expect(last()).toBe('SCALE  2 objects scaled × 0.5 · ⌘Z to undo');
    await command('AR');
    await clickAt(X + 1000, 0);
    await command('');
    expect(hist()).toBe('ARRAY  Enter array type [Rectangular/Polar] <Rectangular>:');
    await command('');
    expect(last()).toBe('ARRAY  5 copies made · ⌘Z to undo');
  });

  it('TEXT asks height and rotation after its point; a word typed there is the text', async () => {
    await start();
    await command('T');
    await clickAt(X, 0);
    expect(hist()).toBe('TEXT  Specify height <2.5 mm>:');
    await command('5');
    expect(hist()).toBe('TEXT  Specify rotation angle <0>:');
    await command('90');
    expect(hist()).toBe('TEXT  Enter text:');
    await command('DB ROOM');
    expect(items()[2]).toMatchObject({ kind: 'text', text: 'DB ROOM', h: 500 });
    expect(items()[2].rot).toBeCloseTo(Math.PI / 2, 6);
    await clickAt(X, 2000);
    await command('KITCHEN');
    expect(items()[3]).toMatchObject({ kind: 'text', text: 'KITCHEN', h: 250 });
  });

  it('lists matching commands while typing (Tab picks), and Up recalls the commands typed before', async () => {
    await start();
    const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
    const type = (text: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); });
    type('OF');
    expect(document.querySelector('[aria-label="Matching commands"]')!.textContent).toMatch(/^OFFSETOffset/);
    key('Tab', input);
    expect(input.value).toBe('OFFSET');
    await act(async () => { input.form!.requestSubmit(); });
    expect(state.tool).toBe('offset');
    await command('GRID');
    key('ArrowUp', input);
    expect(input.value).toBe('GRID');
    key('ArrowUp', input);
    expect(input.value).toBe('OFFSET');
    key('ArrowDown', input);
    expect(input.value).toBe('GRID');
  });

  it('right-click: with a tool, Enter and the prompt options; with none and nothing under it, Repeat and the recent commands', async () => {
    await start();
    const right = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); }); };
    const menu = () => [...document.querySelectorAll('[aria-label="Command menu"] button')];
    await command('GRID');
    await command('F');
    await right(X + 20000, 20000);
    expect(menu().map((b) => b.textContent)).toEqual(['Enter', 'RadiusR', 'TrimT', 'Cancel']);
    await act(async () => { (menu()[2] as HTMLButtonElement).click(); });
    expect(hist()).toBe('FILLET  Select first object or [Radius/Trim] <R 0.00, No trim>:');
    await command('');
    expect(state.tool).toBe('none');
    await right(X + 20000, 20000);
    expect(menu().map((b) => b.textContent)).toEqual(['Repeat FILLET', 'GRID']);
    await act(async () => { (menu()[0] as HTMLButtonElement).click(); });
    expect(state.tool).toBe('fillet');
  });

  it('dynamic input: a number typed goes to the length box at the cursor, Tab to the angle, Enter places the point; F12 turns it off', async () => {
    await start();
    const box = (name: string) => document.querySelector(`.cad-dyn input[aria-label="${name}"]`) as HTMLInputElement | null;
    const type = (el: HTMLInputElement, text: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await command('L');
    await hover(X, 9000);
    expect(document.querySelector('.cad-dyn-prompt')!.textContent).toBe('Specify first point');
    expect(box('Length')).toBeNull();
    await clickAt(X, 10000);
    expect(box('Length')!.placeholder).toBe('0.00');
    expect(document.querySelector('.cad-status button[aria-pressed="true"][title="DYN (F12)"]')).not.toBeNull();
    key('3');
    expect(document.activeElement).toBe(box('Length'));
    type(box('Length')!, '3');
    key('Tab', box('Length')!);
    expect(document.activeElement).toBe(box('Angle'));
    type(box('Angle')!, '90');
    await act(async () => { box('Angle')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(items()[2].pts.map((q) => q.map((v) => Math.round(v)))).toEqual([[X, 10000], [X, 13000]]);
    key('F12');
    expect(state.toggles.dyn).toBe(false);
    expect(document.querySelector('.cad-dyn')).toBeNull();
    key('F12');
    expect(document.querySelector('.cad-dyn')).not.toBeNull();
  });

  it('dynamic input: Offset asks its distance at the cursor; Down in the box opens the prompt options', async () => {
    await start();
    await command('O');
    await hover(X + 20000, 20000);
    const box = document.querySelector('.cad-dyn input[aria-label="Distance"]') as HTMLInputElement;
    expect(box.placeholder).toBe('0.30');
    expect(document.querySelector('.cad-dyn-prompt')!.textContent).toBe('Specify offset distance ↓');
    key('ArrowDown'); // on the drawing: it pans, as before
    expect(document.querySelector('.cad-dyn-menu')).toBeNull();
    act(() => box.focus());
    key('ArrowDown', box);
    expect([...document.querySelectorAll('.cad-dyn-menu button')].map((b) => b.textContent)).toEqual(['Through T', 'Erase E', 'Layer L']);
    key('ArrowDown', box);
    key('Enter', box);
    expect(hist()).toBe('OFFSET  Specify offset distance or [Through/Erase/Layer] <0.30>:');
    expect(earlier()[2]).toBe('OFFSET  Erase source after offsetting: Yes');
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, '0.5'); box.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(hist()).toBe('OFFSET  Select object to offset or [Exit]:');
    expect((document.querySelector('.cad-dyn input[aria-label="Distance"]') as HTMLInputElement).placeholder).toBe('0.50');
  });

  it('edit dialogs: a value changed in the Offset dialog is used at once and shows in the prompt; the command line\'s shows in it; Esc puts back', async () => {
    await start();
    const dlg = () => document.querySelector('[role="dialog"][aria-label="Offset"]') as HTMLElement | null;
    const field = (name: string) => dlg()!.querySelector(`[aria-label="${name}"]`) as HTMLInputElement;
    const type = (el: HTMLInputElement, text: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await command('O');
    expect(dlg()!.textContent).toMatch(/^OffsetO×DistancemThrough pointErase sourceLayer/);
    expect(document.querySelector('.cad-side')!.textContent).not.toContain('Click the object, then the side'); // the help moved behind ?
    type(field('Distance'), '0.');
    type(field('Distance'), '0.6');
    expect(hist()).toBe('Command: OFFSET  Specify offset distance or [Through/Erase/Layer] <0.60>:'); // at once, with no OK
    act(() => { field('Erase source').click(); });
    await command(''); // Enter takes the 0.60
    expect(hist()).toBe('OFFSET  Select object to offset or [Exit]:');
    expect(dlg()).not.toBeNull();
    await clickAt(X + 2000, 0);
    await clickAt(X + 2000, 1000);
    expect(last()).toBe('OFFSET  Line moved 0.60 m to the side · ⌘Z to undo');
    await command('0.4'); // the command line's value shows in the dialog; the others stay
    expect(field('Distance').value).toBe('0.4');
    expect(field('Erase source').checked).toBe(true);
    type(field('Distance'), '0.9');
    await act(async () => { field('Distance').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect(dlg()).toBeNull();
    expect(state.tool).toBe('offset'); // Esc in the dialog closes only the dialog
    await command('');
    await command('O'); // the dialog again: Esc put back what was changed in it (the 0.4 was the command line's)
    expect(field('Distance').value).toBe('0.4');
    expect(field('Erase source').checked).toBe(false);
    await act(async () => { (dlg()!.querySelector('[aria-label="Help"]') as HTMLButtonElement).click(); });
    expect(dlg()!.textContent).toContain('Click the object, then the side for the copy');
    type(field('Distance'), '0.5');
    await act(async () => { field('Distance').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(dlg()).toBeNull(); // Enter closes, keeping it
    expect(hist()).toBe('Command: OFFSET  Specify offset distance or [Through/Erase/Layer] <0.50>:');
  });

  it('edit dialogs: moved by the title, they keep their place; Array has Rectangular and Polar tabs with a count', async () => {
    await start();
    await command('AR');
    const dlg = () => document.querySelector('[role="dialog"][aria-label="Array"]') as HTMLElement;
    expect(dlg().style.left).toBe('12px');
    const title = dlg().querySelector('.cad-dlg-t')!;
    await act(async () => {
      title.dispatchEvent(new MouseEvent('pointerdown', { clientX: 20, clientY: 20, bubbles: true }));
      title.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 70, bubbles: true }));
      title.dispatchEvent(new MouseEvent('pointerup', { clientX: 120, clientY: 70, bubbles: true }));
    });
    expect([dlg().style.left, dlg().style.top]).toEqual(['112px', '62px']);
    expect(dlg().querySelector('.cad-dlg-prev')!.textContent).toBe('2 × 3 = 6 in all');
    await act(async () => { [...dlg().querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Polar')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(dlg().textContent).toContain('Rotate items');
    expect(dlg().querySelector('.cad-dlg-prev')!.textContent).toBe('6 in all');
    await act(async () => { (dlg().querySelector('.cad-dlg-ft .p') as HTMLButtonElement).click(); });
    key('Escape');
    await command('AR');
    expect([dlg().style.left, dlg().style.top]).toEqual(['112px', '62px']);
    expect(dlg().querySelector('[role="tab"][aria-selected="true"]')!.textContent).toBe('Polar');
  });

  it('STYLE: a new text style set current, kept in the project; TEXT then takes its height without asking', async () => {
    await start();
    await command('STYLE');
    const dlg = () => document.querySelector('[role="dialog"][aria-label="Text style"]') as HTMLElement | null;
    expect(dlg()!.querySelector('[aria-label="Styles"]')!.textContent).toBe('Standardcurrent');
    expect([...dlg()!.querySelectorAll('[aria-label="Font"] option')].map((o) => o.textContent)).toEqual(['Arial']);
    const btn = (t: string) => [...dlg()!.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLButtonElement;
    await act(async () => { btn('Delete').click(); });
    expect(dlg()!.textContent).toContain('Standard cannot be deleted.');
    await act(async () => { btn('New').click(); });
    const h = dlg()!.querySelector('[aria-label="Height"]') as HTMLInputElement;
    for (const t of ['2', '2.', '2.5']) act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(h, t); h.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(h.value).toBe('2.5'); // typed one key at a time, kept as typed
    await act(async () => { btn('Set current').click(); });
    await act(async () => { btn('OK').click(); });
    expect(dlg()).toBeNull();
    expect(project.cadTextStyles).toEqual({ styles: [{ name: 'Style 1', font: 'Arial', heightMm: 2.5 }], current: 'Style 1' }); // Standard unchanged: not kept
    expect(last()).toBe('STYLE  2 text styles, current "Style 1" · ⌘Z to undo');
    await command('T');
    await clickAt(X, 0);
    expect(hist()).toBe('TEXT  Specify rotation angle <0>:');
    await command('');
    await command('NOTE');
    expect(items()[2]).toMatchObject({ kind: 'text', text: 'NOTE', h: 250 });
  });

  it('DIMSTYLE: closed arrows and mm with no decimals for the dimensions drawn next; older ones keep their look', async () => {
    await start();
    await command('DIM');
    await clickAt(X, 10000); await clickAt(X + 3000, 10000); await clickAt(X + 1500, 11000);
    expect(items()[2].look).toBeUndefined();
    await command('D');
    const dlg = () => document.querySelector('[role="dialog"][aria-label="Dimension style"]') as HTMLElement;
    const pick = (name: string, v: string) => act(() => { const el = dlg().querySelector(`[aria-label="${name}"]`) as HTMLSelectElement | HTMLInputElement; Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
    const ok = () => act(async () => { (dlg().querySelector('.cad-dlg-ft .p') as HTMLButtonElement).click(); });
    expect(dlg().querySelector('[role="note"]')!.textContent).toBe('Standard draws as before (sizes follow each dimension\'s length) until it is changed.');
    const changes = onChange.mock.calls.length;
    await ok(); // nothing changed: nothing kept, the dimensions draw as before
    expect(onChange.mock.calls).toHaveLength(changes);
    expect(project.cadDimStyles).toBeUndefined();
    expect(hist()).toBe('DIMSTYLE  No change.');
    await command('D');
    pick('Arrow', 'closed'); pick('Unit', 'mm'); pick('Decimal places', '0');
    expect(dlg().querySelector('[role="note"]')).toBeNull();
    await ok();
    expect(project.cadDimStyles!.styles[0]).toMatchObject({ name: 'Standard', arrow: 'closed', unit: 'mm', decimals: 0 });
    await command('DIM');
    await clickAt(X, 12000); await clickAt(X + 3000, 12000); await clickAt(X + 1500, 13000);
    expect(items()[3]).toMatchObject({ kind: 'dim', look: { arrow: 'closed', size: 250, unit: 'mm', decimals: 0 }, h: 200 });
    expect(items()[3].text).toBeUndefined(); // measured wherever it is drawn or saved
    expect(dimLabel(items()[3], 0.001)).toBe('3000');
    expect(items()[2].look).toBeUndefined();
  });

  it('edit dialogs come back in view when the place they kept is off the window', async () => {
    localStorage.setItem('lvds.cad.dlg.scale', JSON.stringify({ left: 5000, top: -40 }));
    await start();
    await command('SC');
    const d = document.querySelector('[role="dialog"][aria-label="Scale"]') as HTMLElement;
    expect([d.style.left, d.style.top]).toEqual([`${window.innerWidth - 240}px`, '0px']);
  });

  it('Space held to pan does not end the step; tapped it does; held long with no tool it does not repeat', async () => {
    await start();
    await command('PL');
    await clickAt(X, 10000);
    await clickAt(X + 2000, 10000);
    act(() => { (document.querySelector('input[aria-label="Command"]') as HTMLInputElement).blur(); });
    const c = document.querySelector('canvas.cad-over')!, [sx, sy] = screenOf(X + 1000, 10000);
    key(' ', window, { code: 'Space' });
    await act(async () => {
      c.dispatchEvent(new MouseEvent('mousedown', { clientX: sx, clientY: sy, button: 0, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mousemove', { clientX: sx + 40, clientY: sy + 20, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mouseup', { clientX: sx + 40, clientY: sy + 20, button: 0, bubbles: true }));
    });
    keyUp(' ');
    expect(items()).toHaveLength(2); // the polyline goes on (the view was panned)
    await command('@0,2000');
    tap(' ');
    expect(items()[2]).toMatchObject({ kind: 'pline', pts: [[X, 10000], [X + 2000, 10000], [X + 2000, 12000]] });
    act(() => state.setTool('none'));
    await command('GRID');
    expect([state.toggles.grid, state.gridDots]).toEqual([true, false]);
    act(() => { (document.querySelector('input[aria-label="Command"]') as HTMLInputElement).blur(); });
    key(' ', window, { code: 'Space' });
    key(' ', window, { code: 'Space', repeat: true });
    key(' ', window, { code: 'Space', repeat: true });
    keyUp(' ');
    expect(state.gridDots).toBe(false); // held: not a repeat of GRID
    tap(' ');
    expect(state.gridDots).toBe(true);
  });

  it('Esc with the right-click menu open closes the menu only; Enter in a dialog over the page is the dialog\'s', async () => {
    await start();
    await command('PL');
    await clickAt(X, 10000);
    await clickAt(X + 2000, 10000);
    const [sx, sy] = screenOf(X + 20000, 20000);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); });
    expect(document.querySelector('[aria-label="Command menu"]')).not.toBeNull();
    key('Escape');
    expect(document.querySelector('[aria-label="Command menu"]')).toBeNull();
    expect(hist()).toBe('PLINE  Specify next point or [Close], Enter to finish:'); // not cancelled
    await command('XR'); // the references dialog over the page
    const dlg = document.querySelector('[aria-label="References"]') as HTMLElement;
    key('Enter', dlg);
    tap(' ', dlg);
    expect(items()).toHaveLength(2); // the polyline behind it goes on
    key('Escape', dlg);
    expect(document.querySelector('[aria-label="References"]')).toBeNull();
    expect(state.tool).toBe('pline');
    await clickAt(X + 2000, 12000);
    key('Enter');
    expect(items()[2]).toMatchObject({ kind: 'pline', pts: [[X, 10000], [X + 2000, 10000], [X + 2000, 12000]] });
  });

  it('Enter and Space on a row of the layer palette, or on the properties palette, are the palette\'s', async () => {
    await start();
    await command('PL');
    await clickAt(X, 10000);
    await clickAt(X + 2000, 10000);
    await command('LM');
    await until(() => !!document.querySelector('[aria-label="Layer palette"]'));
    const row = document.querySelector('[aria-label="Layer palette"] .cad-lp-name') as HTMLElement;
    key('Enter', row);
    tap(' ', row);
    expect(items()).toHaveLength(2); // the polyline goes on
    const props = document.querySelector('[aria-label="Properties palette"]') as HTMLElement;
    key('Enter', props);
    tap(' ', props);
    expect(items()).toHaveLength(2); // nor on the properties palette
    expect(state.tool).toBe('pline');
    await clickAt(X + 2000, 12000);
    key('Enter');
    expect(items()[2]).toMatchObject({ kind: 'pline', pts: [[X, 10000], [X + 2000, 10000], [X + 2000, 12000]] });
  });

  it('F1 and F2 not with Ctrl or ⌘, nor in another field; Space takes the command picked in the list', async () => {
    await start();
    key('F1', window, { ctrlKey: true });
    key('F1', window, { metaKey: true });
    key('F2', document.querySelector('select[aria-label="Sample floor"]')!);
    expect(document.querySelector('.cad-log')).toBeNull();
    const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'OF'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    key('ArrowDown', input);
    expect(document.querySelector('[aria-label="Matching commands"] [aria-selected="true"]')!.textContent).toMatch(/^OFFSET/);
    key(' ', input);
    expect(state.tool).toBe('offset');
  });

  it('TEXT: at the height and rotation a word typed gets its space; a number takes Space as Enter', async () => {
    await start();
    const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
    const type = (text: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); });
    const space = () => { const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }); act(() => { input.dispatchEvent(e); }); return e.defaultPrevented; };
    await command('T');
    await clickAt(X, 0);
    type('DB');
    expect(space()).toBe(false); // the space is typed
    expect(items()).toHaveLength(2);
    type('5');
    expect(space()).toBe(true);
    expect(hist()).toBe('TEXT  Specify rotation angle <0>:');
    type('DB');
    expect(space()).toBe(false);
    await command('DB ROOM');
    expect(items()[2]).toMatchObject({ kind: 'text', text: 'DB ROOM', h: 500 });
  });

  it('Offset with Erase moves a cable route: it stays the route of its circuit, on its layer', async () => {
    const route: Project = { ...two, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [{ id: 'C1', kind: 'pline', layer: 'E-CABLE', pts: [[X, 0], [X + 4000, 0]], cable: { feederId: 'DB-GF1-Y1' } }] }] };
    await start(route);
    await command('O');
    await command('E');
    await command('L'); // Layer: current — the route keeps its own
    await command('');
    await clickAt(X + 2000, 0);
    await clickAt(X + 2000, 1000);
    expect(items()).toEqual([{ id: 'C1', kind: 'pline', layer: 'E-CABLE', pts: [[X, 300], [X + 4000, 300]], cable: { feederId: 'DB-GF1-Y1' } }]);
    expect(last()).toBe('OFFSET  Cable route moved 0.30 m to the side · ⌘Z to undo');
  });

  it('numbers typed: 0 goes to the box with a tool running (it fits the view only with none); ".5" is 0.5; a point typed in a box works', async () => {
    await start();
    const zero = () => { const e = new KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }); act(() => { window.dispatchEvent(e); }); return e.defaultPrevented; };
    const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
    act(() => input.blur());
    expect(zero()).toBe(true); // no tool: the view fits
    expect(document.activeElement).not.toBe(input);
    await command('O');
    await hover(X + 20000, 20000);
    act(() => input.blur());
    expect(zero()).toBe(false); // typed, not a fit
    expect(document.activeElement).toBe(document.querySelector('.cad-dyn input[aria-label="Distance"]'));
    await command('.5');
    expect(earlier()[2]).toBe('OFFSET  Distance 0.50 m');
    expect((document.querySelector('.cad-dyn input[aria-label="Distance"]') as HTMLInputElement).placeholder).toBe('0.50');
    await command('');
    act(() => state.setTool('none'));
    await command('L');
    await clickAt(X, 10000);
    const len = document.querySelector('.cad-dyn input[aria-label="Length"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(len, '@0,2000'); len.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { len.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(items()[2].pts.map((q) => q.map((v) => Math.round(v)))).toEqual([[X, 10000], [X, 12000]]); // drawing units, as on the command line
    const len2 = document.querySelector('.cad-dyn input[aria-label="Length"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(len2, '3,'); len2.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { len2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(hist()).toBe('  3,: type a point as x,y, @dx,dy or @distance<angle (drawing units), or a length in metres.');
  });
});

