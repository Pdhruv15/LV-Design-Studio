// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, useState, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadPage from './CadPage';
import { useCad, type CadState } from './cadState';
import { useSheetUi } from '../sld/sheetUi';
import { cadFileMenu } from './cadFileMenu';
import { buildingInfoOf, DEFAULT_ROOM_TYPES } from '../../calc/building';
import type { CadShow } from './cadObjectMenus';
import { sizeRoute, trayPlanOf } from '../../calc/cableTray';
import { explodeObjects, openDrawing } from '../../engines/cad/cadEngine';
import { toDxf } from '../../docs/dxf';
import { dropRefGeometry, keepRefGeometry } from '../../model/cadRefs';
vi.mock('../../engines/cad/cadEngine', async (orig) => { const m = await orig<typeof import('../../engines/cad/cadEngine')>(); return { ...m, explodeObjects: vi.fn(m.explodeObjects) }; });
import '../../engines/cad/cadOps'; // loaded ahead: the engine loads it on demand, which a busy test run can make slow
import { sampleProject } from '../../data/sampleProject';
import { placeBoard, placeLvPoint } from '../../model/cadDevices';
import { planTarget, type PlanTarget } from '../../model/planTarget';
import { archOnOf } from '../../model/cadLayerState';
import { plotPrinter, setPlotPrinter } from '../../util/printers';
import { dimLabel, dimMeasure, sketchOf } from '../../model/cadSketch';
import { annoOf, unitsPerPaperMm } from '../../model/cadAnnotate';
import { drawingLayoutsOf } from '../../model/drawingLayouts';
import type { CadDimStyle } from '../../model/cadStyles';
import { explodeNote, noteBox } from '../../model/cadMtext';
import { CHAR_W } from '../../model/cadText';
import { blockDefOf, blockDefsOf, type CadBlockDef } from '../../model/cadBlocks';
import { openTitleBlockInCad, TB_LAYERS } from '../../model/titleBlockCad';
import type { TitleTemplate } from '../../model/titleBlock';
import type { Project, SketchItem } from '../../types';
import { DRAFT_DEFAULTS, type DraftSettings } from '../../model/cadDraft';
import { loadLayerTemplates } from '../../model/cadLayerTemplates';
import { settingsFile, type CadSettingsLibraries, type CadSettingsOptions } from './cadSettingsFile';
import { clearClip } from './cadClipboardStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
/** The words of a right-click menu row (its label, not the icon or the key). */
const rowLabel = (b: Element) => b.querySelector('.lb')?.textContent ?? b.firstElementChild?.textContent ?? b.textContent;
/** A right-click menu row, in the menu or in a list open beside it, by its label. */
const menuRow = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => rowLabel(b) === label)!;
/** Clicks the rows in turn: a row that opens a list, then its entry. */
const chooseMenu = async (...path: string[]) => { for (const l of path) { const b = menuRow(l); expect(b, l).toBeTruthy(); await act(async () => { b.click(); }); } };
/** The labels of the rows of the menu, or of its list. */
const menuRows = (menu = '[role="menu"]') => [...document.querySelectorAll<HTMLButtonElement>(`${menu} > button`)].map((b) => rowLabel(b));
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
const onChange = vi.fn((p: Project, _message: string, _join?: boolean) => { project = p; });
const onUndo = vi.fn();
const onPrefs = vi.fn((_p: { draft: DraftSettings; autosaveMin: number; app?: { theme: string; palette: string; cadLabels: boolean; ribbonOrder: string[]; aliases: Record<string, string>; keys: Record<string, string> }; libraries?: unknown }) => {});
/** Whether the architect's layer i shows: its On, kept in the project (Layer palette or the Layers list). */
const shown = (i: number) => archOnOf(project, state.view!.file, state.view!.info.layers)[i];
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); localStorage.clear(); project = villa; onChange.mockClear(); onUndo.mockClear();
  (window as { lvds?: unknown }).lvds = { cadFile: {
    engine: async () => bytes('electron/cad/lvds_cad_reader_bg.wasm'),
    sampleBytes: vi.fn(async (name: string) => ({ file: name, bytes: bytes(`electron/samples/${name}`) })),
    openBytes: vi.fn(async () => ({ file: 'plan.dwg', path: '/plans/plan.dwg', bytes: bytes('tests/fixtures/cad/plan-2018.dwg') }))
  } };
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; delete (window as { lvds?: unknown }).lvds; });

// Save As keeps the sample drawing's own format (DXF) unless a test passes the format set.
function Host({ start = villa, show, gripMax, undoLabel, saveFormat = 'own', extra, draft0 }: { start?: Project; show?: (s: CadShow) => void; gripMax?: number; undoLabel?: string; saveFormat?: DraftSettings['saveFormat']; extra?: Partial<ComponentProps<typeof CadPage>>; draft0?: Partial<DraftSettings> }) {
  const cad = useCad('p1');
  const [p, setP] = useState(start);
  const sheetUi = useSheetUi();
  const [draft, setDraft] = useState({ ...DRAFT_DEFAULTS, saveFormat, ...(gripMax ? { gripMax } : {}), ...draft0 });
  state = cad;
  return <CadPage cad={cad} project={p} onChange={(next, msg, join) => { setP(next); onChange(next, msg, join); }} onUndo={onUndo} onStatus={() => {}} sheetUi={sheetUi}
    draft={draft} onPrefs={(x) => { setDraft(x.draft); onPrefs(x); }} onShow={show} canUndo={!!undoLabel} undoLabel={undoLabel} {...extra} />;
}
/** Waits for something on screen (a slower machine takes longer), up to 10 s. */
const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); expect(ok()).toBe(true); };
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
/** A status bar switch, by its name (an icon, no text). */
const tg = (label: string) => document.querySelector<HTMLButtonElement>(`.cad-status button[aria-label="${label}"]`)!;
const result = () => document.querySelector('.cad-res')?.textContent ?? '';
const command = async (text: string) => {
  const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { input.form!.requestSubmit(); });
};
/** SAVE / SAVEDWG the first time: Save As opens, and its Save is pressed as it starts. */
const saveCmd = async (text: string) => {
  await command(text);
  const ok = [...document.querySelectorAll('[role="dialog"][aria-label="Save As"] button')].find((b) => b.textContent === 'Save') as HTMLButtonElement | undefined;
  expect(ok, 'Save As opens').toBeTruthy();
  await act(async () => { ok!.click(); });
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
    act(() => tg('OSNAP').click());
    expect(state.toggles.osnap).toBe(false);
    await command('grid');
    expect(state.toggles.grid).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' })); });
    expect(state.toggles.ortho).toBe(true);
    await command('xyz');
    expect(document.querySelector('.cad-hist')?.textContent).toMatch(/Unknown command "XYZ"/);
  });

  it('starts with the grid lines on; F7 steps lines → dots → off, as the SLD does, and shows the zoom in the corner', async () => {
    act(() => root.render(<Host />));
    await flush();
    const f7 = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F7' })); });
    expect([state.toggles.grid, state.gridDots]).toEqual([true, false]);
    f7();
    expect([state.toggles.grid, state.gridDots]).toEqual([true, true]);
    expect(tg('GRID').title).toMatch(/^Grid: dots/);
    f7();
    expect([state.toggles.grid, state.gridDots]).toEqual([false, false]);
    f7();
    expect([state.toggles.grid, state.gridDots]).toEqual([true, false]);
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

  it('erases an object of the opened drawing (Delete), by handle, and RESTOREDWG brings it back', async () => {
    act(() => root.render(<Host />));
    await flush();
    const last = () => state.history[state.history.length - 1];
    await clickAt(6687.5 + 190, 7375); // on the light's circle
    expect(result()).toMatch(/Block · L1/);
    expect(button('Erase')).toBeTruthy();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toMatch(/^Block L1 on E-LIGHT erased \(the drawing file is unchanged.* · ⌘Z to undo$/);
    expect(project.cadErased?.['sample-villa-gf.dxf']).toHaveLength(1);
    expect(project.cadSketch ?? []).toEqual([]); // nothing drawn in its place
    await flush();
    await clickAt(6687.5 + 190, 7375);
    expect(result()).not.toMatch(/Block · L1/);
    await command('RESTOREDWG');
    expect(last()).toMatch(/^RESTOREDWG {2}1 erased drawing object back/);
    expect(project.cadErased?.['sample-villa-gf.dxf'] ?? []).toEqual([]);
    await flush();
    await clickAt(6687.5 + 190, 7375);
    expect(result()).toMatch(/Block · L1/);
    await command('RESTOREDWG');
    expect(last()).toBe('RESTOREDWG  Nothing of this drawing is erased.');
  });

  it('picks several objects of the opened drawing with Shift-click and erases them in one change (E)', async () => {
    act(() => root.render(<Host />));
    await flush();
    await clickAt(6687.5 + 190, 7375); // the light block
    await clickAt(2500, 150, true); // the kitchen outline, added
    expect(state.history[state.history.length - 1]).toBe('SEL  2 objects selected');
    await command('E');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toMatch(/^2 objects erased/);
    const erased = project.cadErased?.['sample-villa-gf.dxf'] ?? [];
    expect(new Set(erased).size).toBe(2);
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

  it('shows the circuit with its room, warns when it is full and goes on to the next circuit with Tab', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('dev');
    act(() => { state.setFeederId('DB-GF1-Y1'); state.toggle('osnap'); });
    const field = document.querySelector('button[aria-label="Circuit"]');
    expect(field?.textContent).toMatch(/10 \/ 10/);
    await clickAt(3000, 9000); // the 11th light: still placed, over the most
    expect(project.feeders.find((f) => f.id === 'DB-GF1-Y1')!.points?.ltg).toBe(11);
    await flush();
    const line = document.querySelector('.cad-hist')?.textContent ?? '';
    expect(line).toMatch(/DB-GF1\/Y1 · Majlis lighting is over: 11 of 10 \(Rules sheet\)\. Next with room: /);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); });
    expect(state.feederId).not.toBe('DB-GF1-Y1');
    expect(document.querySelector('.cad-hist')?.textContent).toContain('DEV  Now on ');
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
    await saveCmd('save');
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
    // Revision clouds on the annotation layer: Arc makes their length adjustable; P draws round picked points.
    esc(); await command('REVCLOUD');
    expect(document.querySelector('.cad-hist')?.textContent).toContain('[Arc/Polygonal]');
    await command('A');
    expect(document.querySelector('.cad-hist')?.textContent).toContain('Specify arc length in drawing units');
    await command('500'); await at(X, 21000); await at(X + 3000, 23000);
    expect(last()).toMatchObject({ kind: 'pline', layer: 'LV-ANNO', closed: true, cloud: 500, pts: [[X, 21000], [X + 3000, 21000], [X + 3000, 23000], [X, 23000]] });
    esc(); await command('REVCLOUD'); await command('P'); await at(X, 25000); await at(X + 2000, 25000); await at(X + 1000, 27000); await command('');
    expect(last()).toMatchObject({ kind: 'pline', layer: 'LV-ANNO', closed: true, cloud: 500, pts: [[X, 25000], [X + 2000, 25000], [X + 1000, 27000]] });
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toMatch(/^Revision cloud, arcs [\d.]+ m long · ⌘Z to undo$/);
    // Saved: an ELLIPSE, and the clouds as polylines with their arcs (bulges, group 42).
    esc(); await saveCmd('save');
    await flush();
    const text = new TextDecoder().decode((saveBinary.mock.calls[0] as unknown as [{ bytes: Uint8Array }])[0].bytes);
    expect(text.match(/\nELLIPSE\r?\n/g)).toHaveLength(2);
    expect(text).toMatch(/\n\s*42\r?\n\s*0\.5\r?\n/);
  });

  it('saves a DXF drawing as DWG when Save As starts with the default format', async () => {
    const saveBinary = vi.fn(async () => '/plans/out.dwg');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary };
    act(() => root.render(<Host saveFormat={DRAFT_DEFAULTS.saveFormat} />));
    await flush();
    await saveCmd('save');
    await flush();
    const arg = (saveBinary.mock.calls[0] as unknown as [{ defaultName: string; bytes: Uint8Array }])[0];
    expect(arg.defaultName).toBe('sample-villa-gf - with devices.dwg');
    expect(new TextDecoder().decode(arg.bytes.slice(0, 4))).toBe('AC10');
  });

  it('places an ELV device and saves the drawing as DXF with the devices on their layers', async () => {
    const saveBinary = vi.fn(async () => '/plans/out.dxf');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary };
    act(() => root.render(<Host />));
    await flush();
    act(() => { state.setDevice('smoke-detector'); state.setTool('dev'); state.toggle('osnap'); });
    await clickAt(3000, 8000);
    expect(project.elvDevices).toEqual([expect.objectContaining({ type: 'smoke-detector', x: expect.closeTo(3, 6), y: expect.closeTo(8, 6) })]);
    await saveCmd('save');
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
    await command('1000,500'); // typed points: never a pick of what is under them
    await command('4000,500');
    await clickAt(2500, 200);
    expect(sk()[5]).toMatchObject({ kind: 'dim', layer: 'LV-ANNO' });
    expect(Number(sk()[5].text)).toBeCloseTo(3, 1);
  });

  it('TJUST justifies the texts picked without moving them; TXTHEIGHT sets their height on paper, or the height for new text', async () => {
    const X = 200000, F = 'sample-villa-gf.dxf';
    // "DB ROOM" 250 high (2.5 mm at 1:100, its capitals): 7 letters 0.84 × 250 wide from the left end of its baseline at
    // (X, 0); its middle 3.5 letters in.
    const mid = 3.5 * CHAR_W * 250;
    const start: Project = { ...villa, cadSketch: [{ file: F, items: [{ id: 'T1', kind: 'text', layer: 'LV-ANNO', pts: [[X, 0]], text: 'DB ROOM', h: 250 }] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const it = () => project.cadSketch![0].items[0];
    await clickAt(X + 300, 100);
    expect(state.selected).toBe('sk:T1');
    await command('tj');
    expect(state.history[state.history.length - 1]).toContain('TJUST  Justify [Left/Centre/Right/TL/TC/TR/ML/MC/MR/BL/BC/BR] <Left>:');
    await command('mc');
    expect(it().just).toBe('MC');
    expect(it().pts[0][0]).toBeCloseTo(X + mid, 6); expect(it().pts[0][1]).toBeCloseTo(125, 6);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('TJUST  1 text justified middle centre · ⌘Z to undo');
    // Its box is where it was: a click at the old spot still picks it, and Properties shows the justification.
    act(() => state.setSelected(null));
    await clickAt(X + 300, 100);
    expect(state.selected).toBe('sk:T1');
    await until(() => !!document.querySelector('[aria-label="Justify"]'));
    expect((document.querySelector('[aria-label="Justify"]') as HTMLSelectElement).value).toBe('MC');
    await command('th');
    expect(state.history[state.history.length - 1]).toContain('<2.5>:');
    await command('5');
    expect(it().h).toBe(500);
    expect(it().pts[0][0]).toBeCloseTo(X + mid, 6);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('TXTHEIGHT  1 object 5 mm on paper at 1:100 · ⌘Z to undo');
    // With nothing picked: the height for new text.
    act(() => state.setSelected(null));
    await command('th');
    await command('');
    expect(state.history[state.history.length - 1]).toContain('for new text');
    await command('3.5');
    expect(project.cadAnno?.textMm).toBe(3.5);
    expect(it().h).toBe(500);
  });

  it('text tools on the texts picked: TCASE, TPREFIX, TALIGN, TCEN, TCOPY; ROOMTAGALL tags the rooms not tagged yet', async () => {
    const X = 200000, F = 'sample-villa-gf.dxf';
    // T1 "db room" (7 letters 0.84 × 250 wide) at the left end of its baseline (X, 0); T2 "L1" at (X + 400, 1000); T3
    // "SOCKETS" centred on (X, 3000), its left edge 3.5 letters left of it.
    const half = 3.5 * CHAR_W * 250;
    const start: Project = { ...villa, cadSketch: [{ file: F, items: [
      { id: 'T1', kind: 'text', layer: 'LV-ANNO', pts: [[X, 0]], text: 'db room', h: 250 },
      { id: 'T2', kind: 'text', layer: 'LV-ANNO', pts: [[X + 400, 1000]], text: 'L1', h: 250 },
      { id: 'T3', kind: 'text', layer: 'LV-ANNO', pts: [[X, 3000]], text: 'SOCKETS', h: 250, just: 'MC' }
    ] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const it = (id: string) => project.cadSketch![0].items.find((x) => x.id === id)!;
    const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
    await dragWindow([X - 100, -100], [X + 2000, 1300]); // T1 and T2
    await command('tc');
    expect(state.history[state.history.length - 1]).toContain('TCASE  Case [Upper/Lower/Title/Sentence] <Upper>:');
    await command('title');
    expect([it('T1').text, it('T2').text]).toEqual(['Db Room', 'L1']);
    expect(last()).toBe('TCASE  2 texts in title case · ⌘Z to undo');
    await command('tprefix');
    await command('EX. ');
    expect([it('T1').text, it('T2').text]).toEqual(['EX. Db Room', 'EX. L1']);
    await command('tsuffix');
    await command('/GF');
    expect(it('T2').text).toBe('EX. L1/GF');
    // Line up on the left edge of T3's box (X − half).
    await command('ta');
    expect(state.history[state.history.length - 1]).toContain('TALIGN  Align [Left/Right/Centre/Top/Bottom/Spacing] <Left>:');
    await command('l');
    await clickAt(X, 3000);
    expect(it('T1').pts[0][0]).toBeCloseTo(X - half, 6); expect(it('T1').pts[0][1]).toBe(0);
    expect(it('T2').pts[0][0]).toBeCloseTo(X - half, 6); expect(it('T2').pts[0][1]).toBe(1000);
    expect(it('T3').pts[0]).toEqual([X, 3000]);
    expect(last()).toBe('TALIGN  2 texts lined up left on "SOCKETS" · ⌘Z to undo');
    // Space the two picked 5 mm apart on paper (500 units at 1:100): T2 (centre y 1125) stays on top, T1's centre goes to 625.
    await command('ta');
    await command('s');
    expect(state.history[state.history.length - 1]).toContain('Gap between texts on paper (mm) <3.75>:');
    await command('5');
    expect(it('T2').pts[0][1]).toBe(1000);
    expect(it('T1').pts[0][1]).toBeCloseTo(500, 6);
    expect(last()).toBe('TALIGN  2 texts spaced 5 mm apart on paper · ⌘Z to undo');
    // TCEN: one text between two typed points.
    act(() => { state.setSelected(null); });
    await clickAt(X - half + 150, 1100); // inside T2's box
    expect(state.selected).toBe('sk:T2');
    await command('tcen');
    expect(state.history[state.history.length - 1]).toContain('TCEN  Specify first point:');
    await command(`${X},5000`);
    await command(`${X + 2000},5000`);
    const w2 = CHAR_W * 250 * it('T2').text!.length;
    expect(it('T2').pts[0][0]).toBeCloseTo(X + 1000 - w2 / 2, 6); expect(it('T2').pts[0][1]).toBeCloseTo(5000 - 125, 6);
    // TCOPY: T2 takes T3's words.
    await command('tcopy');
    await clickAt(X, 3000);
    expect(it('T2').text).toBe('SOCKETS');
    expect(last()).toBe('TCOPY  1 text given the words "SOCKETS" · ⌘Z to undo');
    // ROOMTAGALL: the plan's rooms found, every one tagged once; again: nothing to do; A tags them all again.
    act(() => state.actions.current.addFound());
    const rooms = buildingInfoOf(project).rooms.length;
    expect(rooms).toBe(6);
    const texts = () => project.cadSketch![0].items.filter((x) => x.kind === 'text').length;
    await command('rtall');
    expect(state.history[state.history.length - 1]).toContain('ROOMTAGALL  Tag [All rooms/Untagged only] <Untagged>:');
    await command('');
    expect(texts()).toBe(3 + 2 * rooms);
    expect(last()).toBe('ROOMTAGALL  6 room tags · ⌘Z to undo');
    await command('rtall');
    await command('');
    expect(state.history.slice(-2)).toContain('ROOMTAGALL  Every room of the level is tagged.');
    await command('rtall');
    await command('a');
    expect(texts()).toBe(3 + 4 * rooms);
  });

  it('TFRAME and TMASK on the texts picked; TCOUNT places numbered texts, takes one back and renumbers; KEYNOTE bubbles with a legend', async () => {
    const X = 200000, F = 'sample-villa-gf.dxf';
    const start: Project = { ...villa, cadSketch: [{ file: F, items: [{ id: 'T1', kind: 'text', layer: 'LV-ANNO', pts: [[X, 0]], text: 'L1', h: 250 }] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const items = () => project.cadSketch![0].items;
    const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
    const lastSaid = () => state.history[state.history.length - 1];
    await clickAt(X + 100, 100);
    expect(state.selected).toBe('sk:T1');
    await command('tframe');
    expect(lastSaid()).toContain('TFRAME  Frame [Circle/Box/Hexagon/None] <Circle>:');
    await command('h');
    expect(items()[0].frame).toBe('hexagon');
    expect(last()).toBe('TFRAME  1 text framed with a hexagon · ⌘Z to undo');
    await command('tmask');
    await command('');
    expect(items()[0].mask).toBe(true);
    await until(() => !!document.querySelector('[aria-label="Frame"]'));
    expect((document.querySelector('[aria-label="Frame"]') as HTMLSelectElement).value).toBe('hexagon');
    expect((document.querySelector('[aria-label="Mask"]') as HTMLSelectElement).value).toBe('Yes');
    await command('tframe');
    await command('none');
    expect(items()[0].frame).toBeUndefined();
    // TCOUNT: "L" + 01, 02 … placed centred at each click; U takes the last back; S renumbers the texts picked.
    act(() => state.setSelected(null));
    await command('tcount');
    expect(lastSaid()).toContain('TCOUNT  Prefix <>:');
    await command('L');
    await command('01');
    await command('');
    await command('');
    expect(lastSaid()).toContain('next "L01"');
    await command(`${X},5000`);
    await clickAt(X + 3000, 5000);
    await clickAt(X + 6000, 5000);
    expect(items().slice(1).map((it) => it.text)).toEqual(['L01', 'L02', 'L03']);
    expect(items()[1]).toMatchObject({ just: 'MC', layer: 'LV-ANNO', h: 250 });
    expect(items()[1].pts[0][0]).toBeCloseTo(X, 6);
    await command('u');
    expect(items().slice(1).map((it) => it.text)).toEqual(['L01', 'L02']);
    await clickAt(X + 6000, 5000);
    expect(items()[3].text).toBe('L03');
    await command(''); // Enter ends
    expect(state.tool).toBe('none');
    // Renumber the three from 7, step 2, as "S07" … picked in order with a window first.
    await dragWindow([X - 500, 4000], [X + 7000, 6000]);
    await command('tnum');
    await command('S');
    await command('7');
    await command('2');
    await command('');
    await command('s');
    expect(items().slice(1).map((it) => it.text).sort()).toEqual(['S11', 'S7', 'S9']);
    expect(last()).toBe('TCOUNT  3 texts renumbered from S7 · ⌘Z to undo');
    // KEYNOTE: the first asks where the legend starts; the next goes under it.
    act(() => { state.setSelected(null); });
    await command('kn');
    expect(lastSaid()).toContain('KEYNOTE  Number (Enter: the next):');
    await command('');
    expect(lastSaid()).toContain('KEYNOTE  Place keynote 1:');
    await clickAt(X, 8000);
    expect(lastSaid()).toContain('KEYNOTE  Note text:');
    await command('Fire rated wall');
    expect(lastSaid()).toContain('Legend position');
    await clickAt(X + 10000, 9000);
    const kns = () => items().filter((it) => it.kn);
    expect(kns().map((it) => it.text)).toEqual(['1', 'KEYNOTES', '1  Fire rated wall']);
    expect(kns()[0]).toMatchObject({ frame: 'hexagon', just: 'MC' });
    expect(kns()[1].pts[0]).toEqual([X + 10000, 9000 - 250]);
    expect(lastSaid()).toContain('KEYNOTE  Number <2>:');
    await command('');
    await clickAt(X + 2000, 8000);
    await command('Existing DB');
    expect(kns().map((it) => it.text)).toEqual(['1', 'KEYNOTES', '1  Fire rated wall', '2', '2  Existing DB']);
    expect(kns()[4].pts[0][1]).toBeCloseTo(9000 - 250 - 2 * 400, 6);
    expect(last()).toBe('KEYNOTE  2 "Existing DB" · ⌘Z to undo');
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
    await saveCmd('save');
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

  it('Show on plan (from the SLD) shows the level\'s drawing, picks the board and zooms to a window round it', async () => {
    const placedBoard: Project = { ...villa, cadPlans: [{ building: 'V', level: 'GF', file: 'sample-villa-gf.dxf', units: 4 }], boards: villa.boards.map((b, i) => (i ? b : { ...b, level: { building: 'V', level: 'GF' }, planPoint: { x: 3, y: 9 } })) };
    const id = placedBoard.boards[0].id;
    act(() => root.render(<Host start={placedBoard} />));
    await flush();
    const t = planTarget(placedBoard, { board: id });
    expect(typeof t).not.toBe('string');
    act(() => state.actions.current.showOnPlan(t as PlanTarget));
    await until(() => state.view?.file === 'sample-villa-gf.dxf' && state.selected === `board:${id}`);
    await until(() => document.querySelector('.zoom-chip')?.textContent !== '100 %'); // the 8 m window, not the drawing fitted
    expect(document.querySelector('.zoom-chip')?.textContent).toMatch(/^\d+ %$/);
    // The drawing already shown: asking again picks and zooms again without loading it.
    act(() => state.setSelected(null));
    act(() => state.actions.current.showOnPlan(t as PlanTarget));
    await until(() => state.selected === `board:${id}`);
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
    await command('TRACE');
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
    await saveCmd('save');
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

  it('finds and approves a bounded optimal LV cable route, updating its schedule in the same change', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    const f = villa.feeders[0];
    await command('CR');
    act(() => state.setCableFeeder(f.id));
    const mode = document.querySelector('select[aria-label="Cable routing method"]') as HTMLSelectElement;
    act(() => { mode.value = 'optimal'; mode.dispatchEvent(new Event('change', { bubbles: true })); });
    await clickAt(2000, 3000);
    await clickAt(4000, 3000);

    expect(document.body.textContent).toContain('Route A · Recommended');
    expect(document.body.textContent).toMatch(/Bounded search: [\d,]+ \/ 60,000 cells/);
    act(() => button('Approve route A').click());

    const routes = sketchOf(project, state.view!.file).filter((it) => it.cable?.feederId === f.id);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ kind: 'pline', layer: 'E-CABLE', cable: { feederId: f.id } });
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toMatch(/^LV route A approved .* · 1 cable length · ⌘Z to undo$/);
    expect(project.feeders.find((x) => x.id === f.id)!.lengthM).not.toBe(f.lengthM);
  });

  it('finds and approves a system-first ELV route in metres for the ELV route schedule', async () => {
    const withPlan: Project = { ...villa, cadPlans: [{ building: 'V', level: 'GF', file: 'sample-villa-gf.dxf', units: 4 }] };
    act(() => root.render(<Host start={withPlan} />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('CR');
    const service = document.querySelector('select[aria-label="Route service"]') as HTMLSelectElement;
    act(() => { service.value = 'elv'; service.dispatchEvent(new Event('change', { bubbles: true })); });
    expect((document.querySelector('select[aria-label="ELV route system"]') as HTMLSelectElement).value).toBe('ict');
    expect(document.body.textContent).toContain('Permanent link ≤ 90 m');
    await clickAt(2000, 3000);
    await clickAt(4000, 3000);

    expect(document.body.textContent).toContain('Route A · Recommended');
    expect(document.body.textContent).toContain('No LV cable route is drawn on this plan');
    act(() => button('Approve route A').click());

    expect(project.elvRoutes).toHaveLength(1);
    expect(project.elvRoutes![0]).toMatchObject({ id: 'ER1', system: 'ict', buildingId: 'V', levelId: 'GF', lvClearanceM: 0.3 });
    expect(project.elvRoutes![0].points[0][0]).toBeCloseTo(2, 1);
    const routePoints = project.elvRoutes![0].points;
    expect(routePoints[routePoints.length - 1][0]).toBeCloseTo(4, 1);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toMatch(/^ER1 · Data and Wi-Fi route A approved: .* · length check passed · ELV cable route schedule updated · ⌘Z to undo$/);
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

  it("fills with Fill room's own device whatever Add device has chosen; the palette sets it while FILL runs, and Coverage keeps its own system", async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.actions.current.addFound());
    const majlis = buildingInfoOf(project).rooms.find((r) => /majlis/i.test(r.name))!;
    const [cx, cy] = majlis.outline!.reduce(([x, y], q) => [x + q[0] / majlis.outline!.length, y + q[1] / majlis.outline!.length], [0, 0]);
    const types = () => new Set((project.elvDevices ?? []).map((d) => d.type));
    const palette = (label: string) => [...document.querySelectorAll('.cad-pal button')].find((b) => b.querySelector('span')?.textContent === label) as HTMLButtonElement;
    act(() => { state.setDevice('ltg'); state.setTool('fill'); });
    await clickAt(cx / 0.001, cy / 0.001);
    expect([...types()]).toEqual(['smoke-detector']);
    act(() => { state.setFillDevice('heat-detector'); });
    await clickAt(cx / 0.001, cy / 0.001);
    expect(types().has('heat-detector')).toBe(true);
    // While FILL runs, an ELV device with a spacing becomes Fill room's device; any other goes to Add device.
    act(() => { state.setFillDevice('smoke-detector'); });
    act(() => { palette('Ceiling speaker').click(); });
    expect(state.fillDevice).toBe('ceiling-speaker');
    expect(state.tool).toBe('fill');
    expect(state.device).toBe('ltg');
    act(() => { palette('Light').click(); });
    expect(state.tool).toBe('dev');
    expect(state.device).toBe('ltg');
    act(() => { state.setCoverage(true); });
    expect(document.body.textContent).toContain('Coverage: Fire alarm');
    act(() => state.setCoverageSystem('cctv'));
    expect(document.body.textContent).toContain('Coverage: CCTV');
  });

  it('keeps the devices placed last, newest first', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => { state.setDevice('smoke-detector'); state.setTool('dev'); });
    await clickAt(3000, 8000);
    act(() => { state.setDevice('camera'); });
    await clickAt(5000, 5000);
    expect(state.recentDevices.slice(0, 2)).toEqual(['camera', 'smoke-detector']);
    expect(JSON.parse(localStorage.getItem('lvds.cadRecentDevices') ?? '[]').slice(0, 2)).toEqual(['camera', 'smoke-detector']);
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

  it('previews and approves one bounded coordinated room device template (RDT), then replaces it', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.actions.current.addFound());
    const majlis = buildingInfoOf(project).rooms.find((r) => /majlis/i.test(r.name))!;
    const [cx, cy] = majlis.outline!.reduce(([x, y], q) => [x + q[0] / majlis.outline!.length, y + q[1] / majlis.outline!.length], [0, 0]);
    await command('RDT');
    expect(state.tool).toBe('roomtemplate');
    expect(document.body.textContent).toContain('Click one room to preview');
    await clickAt(cx / 0.001, cy / 0.001);
    expect(document.body.textContent).toContain(`Room devices ${majlis.name}`);
    const choose = async (label: string, value: string) => {
      const select = document.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value); select.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    await choose('Room template', 'meeting');
    await choose('Template lighting circuit', 'DB-GF1-Y1');
    await choose('Template power circuit', 'DB-GF1-B6');
    const approve = () => [...document.querySelectorAll<HTMLButtonElement>('.cad-devbtns .chip.primary')].find((b) => b.textContent?.startsWith('Approve'))!;
    expect(approve().disabled).toBe(false);
    const count = Number(/Approve (\d+)/.exec(approve().textContent!)![1]);
    await act(async () => { approve().click(); });
    const lv = () => (project.lvPoints ?? []).filter((d) => d.buildingId === majlis.buildingId && d.levelId === majlis.levelId && (d.type === 'ltg' || d.type === 's13t'));
    const elv = () => (project.elvDevices ?? []).filter((d) => d.roomId === majlis.id && ['data-outlet', 'access-point', 'smoke-detector'].includes(d.type));
    expect(lv().length + elv().length).toBe(count);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toMatch(new RegExp(`^RDT  ${count} devices? approved in ${majlis.name}`));
    await clickAt(cx / 0.001, cy / 0.001);
    await act(async () => { approve().click(); });
    expect(lv().length + elv().length).toBe(count);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toContain('replaced');
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
    // The drawing's own layers off: windows pick devices only (a window picks the drawing's objects too).
    for (const l of state.view!.info.layers) { const b = button(`${l.name}on`); if (b) act(() => b.click()); }
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
    const menu = document.querySelector('[role="menu"][aria-label="Command menu"]') as HTMLElement;
    const top = [...menu.children].filter((x) => x.tagName === 'BUTTON').map((x) => rowLabel(x));
    expect(top).toEqual(['Circuit', 'Swap device type', 'Arrange', 'Undo', 'Redo', 'Erase', 'Move', 'Copy selection', 'Isolate', 'Pan', 'Zoom', 'Select same circuit', 'Select same type', 'Invert selection', 'Deselect all', 'Count', 'Properties', 'Options…']);
    await act(async () => { [...menu.querySelectorAll('button')].find((b) => b.textContent!.startsWith('Swap device type'))!.click(); });
    await act(async () => { ([...document.querySelectorAll('[role="menuitem"]')].find((o) => o.textContent!.startsWith('Twin socket')) as HTMLButtonElement).click(); });
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

  it('grips on every drawn object picked: dragging one of the second object edits that object; past the limit there are none', async () => {
    const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
    const X = 200000;
    const start: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 4000, 0]), line('S2', [X, 3000], [X + 4000, 3000])] }] };
    const dragGrip = async (from: [number, number], to: [number, number]) => {
      const [gx, gy] = screenOf(...from), [tx, ty] = screenOf(...to), c = document.querySelector('canvas.cad-over')!;
      await act(async () => {
        c.dispatchEvent(new MouseEvent('mousedown', { clientX: gx, clientY: gy, button: 0, bubbles: true }));
        c.dispatchEvent(new MouseEvent('mousemove', { clientX: tx, clientY: ty, bubbles: true }));
        c.dispatchEvent(new MouseEvent('mouseup', { clientX: tx, clientY: ty, button: 0, bubbles: true }));
      });
    };
    // Past the limit (1 object): no grips, so the same gesture edits nothing.
    project = start;
    act(() => root.render(<Host start={start} gripMax={1} />));
    await flush();
    act(() => state.toggle('osnap'));
    await dragWindow([X - 500, -500], [X + 4500, 3500]);
    await dragGrip([X + 4000, 3000], [X + 4000, 5000]);
    expect(project.cadSketch![0].items.map((x) => x.pts)).toEqual([[[X, 0], [X + 4000, 0]], [[X, 3000], [X + 4000, 3000]]]);
    act(() => root.unmount());
    root = createRoot(host); project = start;
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    await dragWindow([X - 500, -500], [X + 4500, 3500]);
    await dragGrip([X + 4000, 3000], [X + 4000, 5000]);
    const items = project.cadSketch![0].items;
    expect(items[1].pts.map((q) => q.map((v) => Math.round(v)))).toEqual([[X, 3000], [X + 4000, 5000]]);
    expect(items[0].pts).toEqual([[X, 0], [X + 4000, 0]]);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('GRIP  Line changed — now 4.47 m · ⌘Z to undo');
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
    const num = document.querySelector('[aria-label="LV-SKETCH colour index number"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(num, '8'); num.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { num.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(project.cadLayerStyle!['sample-villa-gf.dxf']['LV-SKETCH']).toEqual({ lt: 'dashed', color: 'idx:8' });
    expect(document.querySelector('[aria-label="LV-SKETCH colour"]')!.textContent).toBe('Grey (8)');
    // And from the grid: colour 130, applied with OK.
    act(() => { (document.querySelector('[aria-label="LV-SKETCH colour"]') as HTMLButtonElement).click(); });
    act(() => { (document.querySelector('[role="dialog"] [aria-label="Colour 130"]') as HTMLButtonElement).click(); });
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === 'OK')!.click(); });
    expect(project.cadLayerStyle!['sample-villa-gf.dxf']['LV-SKETCH'].color).toBe('idx:130');
    act(() => { (document.querySelector('[aria-label="Close the layer palette"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[aria-label="Layer palette"]')).toBeNull();
    await clickAt(X + 2000, 2000); // on the locked layer: not picked
    expect(state.selected).toBeNull();
    await clickAt(X + 2000, 0);
    expect(state.selected).toBe('sk:S1');
    act(() => { (document.querySelector('[aria-label="Object colour"]') as HTMLButtonElement).click(); });
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] [role="tab"]')].find((b) => b.textContent === 'True colour')!.click(); });
    act(() => { (document.querySelector('[role="dialog"] [aria-label="Red"]') as HTMLButtonElement).click(); });
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === 'OK')!.click(); });
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
    act(() => tg('FIT').click());
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
    expect(document.querySelector('[role="toolbar"][aria-label="Hatch"]')).not.toBeNull(); // the Hatch strip
    await clickAt(X + 1000, 1000);
    expect(items()[1]).toEqual({ id: 'S2', kind: 'pline', layer: 'LV-HATCH', closed: true, pts: items()[0].pts, hatch: { pattern: 'ansi31', scale: 3, angle: 0 }, assoc: ['S1'] });
    expect(last()).toBe('Hatch ANSI31, 12.00 m² · associative · ⌘Z to undo');
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
    await saveCmd('SAVEDWG');
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

  it('NEW opens a blank drawing in millimetres in a tab of its own, Drawing1.dxf then Drawing2.dxf, with the grid on', async () => {
    act(() => root.render(<Host />));
    await flush();
    expect(state.toggles.grid).toBe(true);
    expect(document.querySelector('.cad-tg[aria-pressed="true"][title^="Grid: lines"]')).not.toBeNull();
    await command('NEW');
    await until(() => tabs().includes('Level? · Drawing1.dxf'));
    expect(tabs()).toEqual([`Level? · ${GF}`, 'Level? · Drawing1.dxf']);
    expect(state.view?.file).toBe('Drawing1.dxf');
    expect(state.view?.path).toBeUndefined();
    expect(state.view?.info).toMatchObject({ units: 4, segments: 0, layers: [{ name: '0' }] });
    expect(document.querySelector('.cad-hist-prev')?.textContent ?? '').toContain('NEW  Drawing1.dxf — a blank drawing in millimetres.');
    await command('QNEW');
    await until(() => tabs().includes('Level? · Drawing2.dxf'));
    expect(state.drawings.map((v) => v.file)).toEqual([GF, 'Drawing1.dxf', 'Drawing2.dxf']);
    // Saved the first time with Save As, as a drawing opened without a path.
    await saveCmd('SAVE');
    expect(document.querySelector('[role="dialog"][aria-label="Save As"]')).toBeNull();
  });

  it('the page with no drawing open offers New drawing beside Open drawing…', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => closeOf(GF).click());
    expect(tabs()).toEqual([]);
    await act(async () => { button('New drawing').click(); });
    await until(() => tabs().length === 1);
    expect(tabs()).toEqual(['Level? · Drawing1.dxf']);
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

  it('asks the engine what is under the pick box once the cursor rests, as far out as a click picks', async () => {
    act(() => root.render(<Host />));
    await flush();
    await openAnother();
    act(() => state.toggle('osnap'));
    const pick = vi.spyOn(state.view!, 'pick');
    const c = document.querySelector('canvas.cad-over')!;
    act(() => { c.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 200, bubbles: true })); });
    // Moving: not asked yet.
    expect(pick).not.toHaveBeenCalled();
    await act(() => new Promise((r) => setTimeout(r, 60)));
    expect(pick).toHaveBeenCalledTimes(1);
    const hoverTol = pick.mock.calls[0][2];
    await act(async () => { for (const t of ['mousedown', 'mouseup']) c.dispatchEvent(new MouseEvent(t, { clientX: 300, clientY: 200, button: 0, bubbles: true })); });
    await flush();
    expect(pick.mock.calls[pick.mock.calls.length - 1][2]).toBeCloseTo(hoverTol);
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

  it('Layouts of the drawing file itself: a tab each on any drawing; the paper with its viewport, shown as saved', async () => {
    act(() => root.render(<Host />));
    await flush();
    const v = await openDrawing('paper-layouts.dxf', bytes('tests/fixtures/cad/paper-layouts.dxf'));
    act(() => state.open(v));
    await flush();
    const ltabs = () => [...document.querySelectorAll('[aria-label="Model and layouts"] [role="tab"]')].map((t) => t.textContent);
    expect(ltabs()).toEqual(['Model', 'Layout1', 'A1 Lighting']);
    const tab = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === name)!;
    expect(tab('Layout1').title).toBe('420 × 297 mm · 1 viewport at 1:100');
    act(() => tab('Layout1').click());
    expect(state.layout).toBe('file:Layout1');
    expect(document.querySelector('.cad-filepaper')!.getAttribute('aria-label')).toBe('Layout Layout1: 420 × 297 mm paper, 1 viewport');
    expect(document.querySelector('.cad-status')!.textContent).toContain('PAPERLayout1 · 420 × 297 mm · 1 viewport at 1:100');
    expect(document.querySelector('.cad-hist')!.textContent).toBe("LAYOUT  Layout1 — the drawing file's own layout, as saved: 420 × 297 mm · 1 viewport at 1:100.");
    await command('MV');
    expect(document.querySelector('.cad-hist')!.textContent).toMatch(/^MV {2}Layout1 is the drawing file's own layout, shown as it was saved/);
    act(() => tab('A1 Lighting').click());
    expect(document.querySelector('.cad-filepaper')!.getAttribute('aria-label')).toBe('Layout A1 Lighting: 841 × 594 mm paper, 0 viewports');
    act(() => tab('Model').click());
    expect(state.layout).toBeNull();
    expect(document.querySelector('.cad-filepaper')).toBeNull();
  });

  it('Layouts: + makes a layout of the drawing (no level needed): A3, the whole drawing in a viewport; rename, copy, move, delete; a plan sheet needs a level', async () => {
    act(() => root.render(<Host start={{ ...villa, building: undefined }} />));
    await flush();
    const v = await openDrawing('paper-layouts.dxf', bytes('tests/fixtures/cad/paper-layouts.dxf'));
    act(() => state.open(v));
    await flush();
    const ltabs = () => [...document.querySelectorAll('[aria-label="Model and layouts"] [role="tab"]')].map((t) => t.textContent);
    const tab = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === name)!;
    const hist = () => document.querySelector('.cad-hist')!.textContent;
    act(() => (document.querySelector('[aria-label="New layout"]') as HTMLButtonElement).click());
    expect(document.querySelector('[role="menu"]')).toBeNull(); // made at once, no menu
    expect(ltabs()).toEqual(['Model', 'Layout1', 'A1 Lighting', 'Layout2']);
    expect(state.layout).toBe('dwg:Layout2');
    const key = v.file.toLowerCase();
    expect(project.cadLayouts![key]).toHaveLength(1);
    expect(project.cadLayouts![key][0]).toMatchObject({ name: 'Layout2', paper: [420, 297] });
    expect(document.querySelector('.cad-filepaper')!.getAttribute('aria-label')).toBe('Layout Layout2: 420 × 297 mm paper, 1 viewport');
    expect(document.querySelector('.cad-status')!.textContent).toMatch(/PAPERViewport 1 · 1:\d+Layout2 · 420 × 297 mm · 1 viewport at 1:\d+/);
    // LAYOUT alone makes the next one.
    await command('LAYOUT');
    expect(ltabs()).toEqual(['Model', 'Layout1', 'A1 Lighting', 'Layout2', 'Layout3']);
    // Right-click: rename, copy, move, delete; then New plan sheet, which needs a level.
    const menu = (name: string, item: string) => {
      act(() => tab(name).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 500 })));
      act(() => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent?.startsWith(item))!.click());
    };
    menu('Layout3', 'Rename');
    await command('Lighting GF');
    expect(ltabs()).toEqual(['Model', 'Layout1', 'A1 Lighting', 'Layout2', 'Lighting GF']);
    menu('Lighting GF', 'Move left');
    expect(ltabs()).toEqual(['Model', 'Layout1', 'A1 Lighting', 'Lighting GF', 'Layout2']);
    menu('Layout2', 'Copy');
    expect(ltabs()).toEqual(['Model', 'Layout1', 'A1 Lighting', 'Lighting GF', 'Layout2', 'Layout3']);
    menu('Layout2', 'Delete');
    expect(ltabs()).toEqual(['Model', 'Layout1', 'A1 Lighting', 'Lighting GF', 'Layout3']);
    menu('Model', 'Lighting layout');
    expect(hist()).toBe('LAYOUT  Add the building and its levels in Building information first: a layout is a plan sheet of a level.');
    expect(project.cadLayouts![key].map((l) => l.name)).toEqual(['Lighting GF', 'Layout3']);
  });

  it('Layouts: + makes a layout of the level; its paper has a viewport; VPSCALE and VPLOCK set it, MS works in it, MV adds one, the Layer manager has This viewport', async () => {
    const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
    const gf = { building: 'V', level: 'GF' };
    let start: Project = { ...villa, cadPlans: [{ building: 'V', level: 'GF', file: 'sample-villa-gf.dxf', units: 4 }] };
    for (const [x, y] of [[3, 9], [6, 9.4], [9, 8.8]]) start = placeLvPoint(start, gf, 'ltg', 'DB-GF1-B2', x, y).project;
    act(() => root.render(<Host start={start} />));
    await flush();
    const tabs = () => [...document.querySelectorAll('[aria-label="Model and layouts"] [role="tab"]')].map((t) => t.textContent);
    expect(tabs()).toEqual(['Model', 'Layout1']); // the drawing file's own (empty) layout, then the level's plan sheets
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === 'Model')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 500 })));
    act(() => [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.startsWith('Lighting layout'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const sheet = () => project.drawingSet!.sheets.find((x) => x.kind === 'plan')!;
    expect(sheet()).toMatchObject({ plan: 'lighting', buildingId: 'V', levelId: 'GF', number: 'E-LTG-001' });
    expect(state.layout).toBe(sheet().id);
    expect(tabs()).toEqual(['Model', 'Layout1', 'E-LTG-001sheet']);
    expect(document.querySelector('.cad-paper')).not.toBeNull();
    expect(document.querySelector('.cad-status')!.textContent).toMatch(/PAPERViewport 1 · 1:100 · lockedE-LTG-001 · A3 · mm/);
    await until(() => !!document.querySelector('.cad-paper iframe'));
    // Its frame, dashed over the paper; picked, its properties show.
    await until(() => !!document.querySelector('.cad-vp'));
    expect([...document.querySelectorAll('.cad-vp')].map((v) => v.getAttribute('aria-label'))).toEqual(['Viewport 1']);
    // The paper's printable area, dashed, and trim marks outside its four corners; the command bar above the tabs.
    expect(document.querySelector('.cad-paper .cad-printable')!.getAttribute('title')).toMatch(/^Printable area: 5 mm in from the paper's edge/);
    expect([...document.querySelectorAll('.cad-paper .cad-trim')].map((t) => t.className)).toEqual(['cad-trim nw', 'cad-trim ne', 'cad-trim sw', 'cad-trim se']);
    const bottom = [...document.querySelectorAll('.cad-cmdbox, .cad-ltabs, .cad-status')].map((el) => el.className.split(' ')[0]);
    expect(bottom).toEqual(['cad-cmdbox', 'cad-ltabs', 'cad-status']);
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
    // LEGEND: a click on the paper places a legend table (its rows follow the plan); picked, its properties show; NOTES the same.
    await command('LEGEND');
    expect(document.querySelector('.cad-hist')!.textContent).toMatch(/^LEGEND {2}Click where the legend table's top left corner goes/);
    paperAt(320, 200);
    expect(sheet().tables).toEqual([expect.objectContaining({ id: 'tb1', kind: 'legend', widthMm: 92 })]);
    expect(state.vpSel).toBe('tb1');
    expect(last()).toMatch(/^E-LTG-001 {2}Legend table placed at [\d.-]+, [\d.-]+ mm · ⌘Z to undo$/);
    await until(() => !!document.querySelector('.cad-ptab'));
    expect(document.querySelector('.cad-ptab')!.getAttribute('aria-label')).toBe('Legend');
    expect(document.querySelector('[aria-label="Table properties"]')!.textContent).toMatch(/^Legend E-LTG-001Width/);
    expect([...document.querySelectorAll('[aria-label="Table properties"] [role="group"][aria-label="Rows"] label')].map((l) => l.textContent?.trim())).toContain('Light');
    act(() => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Columns"] button')].find((b) => b.textContent === '2 columns')!.click());
    expect(sheet().tables![0].cols).toBe(2);
    await command('NOTES');
    paperAt(320, 400);
    expect(sheet().tables!.map((t) => t.kind)).toEqual(['legend', 'notes']);
    expect(state.vpSel).toBe('tb2');
    act(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Delete notes table')!.click());
    expect(sheet().tables!.map((t) => t.kind)).toEqual(['legend']);
    expect(state.vpSel).toBeNull();
    act(() => state.setVpSel('vp2'));
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
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent?.startsWith('E-LTG-001'))!.click());
    expect(state.layout).toBe(sheet().id);
    // Delete from the tab's menu: the layout and its sheet go (undoable).
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent?.startsWith('E-LTG-001'))!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 500 })));
    act(() => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent === 'Delete')!.click());
    expect(project.drawingSet!.sheets.some((x) => x.kind === 'plan')).toBe(false);
    expect(tabs()).toEqual(['Model', 'Layout1']);
    expect(state.layout).toBeNull();
  });

  /** A select or text field of an open dialog set the way a person would. */
  const setField = (label: string, value: string) => {
    const el = document.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement | HTMLInputElement;
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    act(() => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
  };

  const lastMsg = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];

  it('LAYOUTMANAGER: lists the tabs of the open drawing; a copy, a rename, a move and a delete made in it are one project change each, and the tabs follow', async () => {
    const gf = { building: 'V', level: 'GF' };
    let start: Project = { ...villa, cadPlans: [{ building: 'V', level: 'GF', file: 'sample-villa-gf.dxf', units: 4 }] };
    for (const [x, y] of [[3, 9], [6, 9.4], [9, 8.8]]) start = placeLvPoint(start, gf, 'ltg', 'DB-GF1-B2', x, y).project;
    act(() => root.render(<Host start={start} />));
    await flush();
    const ltabs = () => [...document.querySelectorAll('[aria-label="Model and layouts"] [role="tab"]')].map((t) => t.textContent);
    act(() => (document.querySelector('[aria-label="New layout"]') as HTMLButtonElement).click());
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === 'Model')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 500 })));
    act(() => [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.startsWith('Lighting layout'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(ltabs()).toEqual(['Model', 'Layout1', 'Layout2', 'E-LTG-001sheet']);
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === 'Layout2')!.click()); // the layout showing
    const dlg = () => document.querySelector('[aria-label="Layout manager"]');
    const names = () => [...document.querySelectorAll('[aria-label="Layouts of this drawing"] tbody tr')].map((r) => r.querySelector('td:nth-child(2)')!.textContent);
    const tick = (name: string) => act(() => document.querySelector<HTMLInputElement>(`[aria-label="Pick ${name}"]`)!.click());
    const doing = (text: string) => { const n = onChange.mock.calls.length; act(() => button(text).click()); expect(onChange.mock.calls.length, text).toBe(n + 1); };
    await command('LAYOUTMANAGER');
    await until(() => !!dlg());
    const sheetName = project.drawingSet!.sheets.find((x) => x.kind === 'plan')!.number;
    expect(names()).toEqual(['Layout1', 'Layout2 · current', `${sheetName} — Ground · Lighting layout`]);
    const texts = [...document.querySelectorAll('[aria-label="Layouts of this drawing"] tbody tr')].map((r) => [...r.querySelectorAll('td')].slice(2).map((c) => c.textContent));
    expect(texts[1]).toEqual(['Layout', 'A3 landscape', expect.stringMatching(/^1 viewport at 1:\d+/), 'Paper only']);
    expect(texts[2].slice(2)).toEqual(['Lighting layout · 1:100', "Set's default"]);
    // Copy a layout made here and the plan sheet in one go: one change, one message, both tabs.
    tick('Layout2'); tick(`${sheetName} — Ground · Lighting layout`);
    doing('Copy');
    expect(lastMsg()).toBe('LAYOUT  2 layouts copied: Layout3, E-LTG-002 · ⌘Z to undo');
    expect(ltabs()).toEqual(['Model', 'Layout1', 'Layout2', 'Layout3', 'E-LTG-001sheet', 'E-LTG-002sheet']);
    expect(names()).toHaveLength(5);
    // Rename the layout made here: the tick and the tab showing follow it.
    tick(`${sheetName} — Ground · Lighting layout`); // only Layout2 stays ticked
    act(() => button('Rename…').click());
    setField('New name', 'Layout1');
    await act(async () => { document.querySelector('[aria-label="New name"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(document.querySelector('[role="alert"]')!.textContent).toBe('⚠ There is a layout "Layout1" already.');
    setField('New name', 'Ground floor');
    const n0 = onChange.mock.calls.length;
    await act(async () => { document.querySelector('[aria-label="New name"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(onChange.mock.calls.length).toBe(n0 + 1);
    expect(lastMsg()).toBe('LAYOUT  Layout2 renamed Ground floor · ⌘Z to undo');
    expect(ltabs().slice(1, 4)).toEqual(['Layout1', 'Ground floor', 'Layout3']);
    expect(state.layout).toBe('dwg:Ground floor');
    expect((document.querySelector('[aria-label="Pick Ground floor"]') as HTMLInputElement).checked).toBe(true);
    // Move it down, then delete it and the second sheet: back to the Model tab.
    doing('Move down');
    expect(lastMsg()).toBe('LAYOUT  Ground floor moved down · ⌘Z to undo');
    expect(ltabs().slice(1, 4)).toEqual(['Layout1', 'Layout3', 'Ground floor']);
    tick('E-LTG-002 — Ground · Lighting layout (copy)');
    doing('Delete');
    expect(lastMsg()).toBe('LAYOUT  2 layouts deleted: Ground floor, E-LTG-002 Ground · Lighting layout (copy) · ⌘Z to undo');
    expect(ltabs()).toEqual(['Model', 'Layout1', 'Layout3', 'E-LTG-001sheet']);
    expect(state.layout).toBeNull();
    // A double-click opens a layout and closes the dialog.
    act(() => { document.querySelectorAll('[aria-label="Layouts of this drawing"] tbody tr')[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(dlg()).toBeNull();
    expect(state.layout).toBe('dwg:Layout3');
    // The tab menu and the typed LAYOUT M open it too.
    await command('LAYOUT M');
    await until(() => !!dlg());
    act(() => button('Close').click());
    expect(dlg()).toBeNull();
  });

  it('Layout viewports on a plan sheet: VPORTS arranges them, VPCOPY / VPFIT / VPALIGN / VPFRAME act on the one picked, VPMAX shows its area on the Model tab and VPMIN comes back; the scale list adds 1:75', async () => {
    const gf = { building: 'V', level: 'GF' };
    let start: Project = { ...villa, cadPlans: [{ building: 'V', level: 'GF', file: 'sample-villa-gf.dxf', units: 4 }] };
    for (const [x, y] of [[3, 9], [6, 9.4], [9, 8.8]]) start = placeLvPoint(start, gf, 'ltg', 'DB-GF1-B2', x, y).project;
    act(() => root.render(<Host start={start} />));
    await flush();
    await command('LAYOUT L');
    const sheet = () => project.drawingSet!.sheets.find((x) => x.kind === 'plan')!;
    expect(state.layout).toBe(sheet().id);
    await until(() => !!document.querySelector('.cad-vp'));
    await command('VPORTS');
    expect(hist()).toMatch(/^VPORTS {2}Type VPORTS and an arrangement: 1, 2V, 2H, 3L, 3R, 3A, 3B, 4 or KEY/);
    await command('VPALIGN H');
    expect(hist()).toBe('VPALIGN  Pick another viewport: the others line up with Viewport 1.');
    // Two side by side: the first keeps its view.
    await command('VPORTS 2V');
    const vps = () => sheet().viewports!;
    expect(vps().map((v) => [v.id, v.scale])).toEqual([['vp1', 100], ['vp2', 100]]);
    expect(vps()[0].box[0] + vps()[0].box[2]).toBeLessThan(vps()[1].box[0]);
    await command('VPORTS 1');
    expect(vps().map((v) => v.id)).toEqual(['vp1']);
    await command('VPORTS KEY');
    expect(vps().map((v) => v.scale)).toEqual([100, 500]);
    // The second one picked: fit, align, frame, copy.
    act(() => state.setVpSel('vp2'));
    await command('VPALIGN H');
    const [a, b] = vps();
    const lineOf = (v: typeof a) => v.box[1] + v.box[3] / 2 - (a.at[1] - v.at[1]) * (1000 / v.scale);
    expect(Math.abs(lineOf(b) - (a.box[1] + a.box[3] / 2))).toBeLessThan(1e-6);
    await command('VPALIGN');
    expect(hist()).toBe('VPALIGN  Type VPALIGN H (side by side) or VPALIGN V (stacked).');
    await command('VPFIT');
    expect(vps()[1].scale).toBeGreaterThanOrEqual(100);
    expect([100, 200, 500, 1000, 20, 50]).toContain(vps()[1].scale);
    expect(vps()[1].at[0]).toBeCloseTo(vps()[0].at[0], 0); // centred on the level, as the first is
    expect(project.drawingSet!.sheets.find((x) => x.kind === 'plan')!.viewports![1].frame).toBeUndefined();
    await command('VPFRAME');
    expect(vps()[1].frame).toBe(true);
    expect(lastMsg()).toMatch(/Viewport 2: frame prints · ⌘Z to undo$/);
    await command('VPFRAME');
    expect(vps()[1].frame).toBeUndefined();
    await command('VPCOPY');
    expect(vps().map((v) => v.id)).toEqual(['vp1', 'vp2', 'vp3']);
    expect(state.vpSel).toBe('vp3');
    expect(lastMsg()).toMatch(/Viewport 2 copied as Viewport 3 · ⌘Z to undo$/);
    // VPMAX: the viewport's area on the Model tab; VPMIN and the layout's tab bring the paper back.
    await command('VPMAX');
    expect(state.layout).toBeNull();
    expect(hist()).toMatch(/VPMIN or the layout's tab goes back to the paper\.$/);
    await command('VPMIN');
    expect(state.layout).toBe(sheet().id);
    expect(hist()).toBe('VPMIN  Back on the layout.');
    await command('MODEL');
    await command('VPMIN');
    expect(hist()).toBe('VPMIN  No viewport is maximised (VPMAX on a layout first).');
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((t) => t.textContent?.startsWith('E-LTG-001'))!.click());
    // A single viewport again; the scale list gives the viewport panel 1:75.
    await command('VPORTS 1');
    expect(vps()).toHaveLength(1);
    act(() => state.setVpSel('vp1'));
    expect([...document.querySelectorAll('[aria-label="Viewport scale"] option')].map((o) => o.textContent)).toEqual(['1:20', '1:50', '1:100', '1:200', '1:500', '1:1000', 'Custom…']);
    await command('SCALELISTEDIT');
    expect(document.querySelector('[aria-label="Scale list"]')).not.toBeNull();
    act(() => [...document.querySelectorAll('[aria-label="Scales"] label')].find((l) => l.textContent?.trim() === '1:75')!.querySelector('input')!.click());
    act(() => button('Save').click());
    expect(project.plot?.scales).toEqual([20, 50, 75, 100, 200, 500, 1000]);
    expect(lastMsg()).toBe('SCALELISTEDIT  7 scales in the list · ⌘Z to undo');
    expect([...document.querySelectorAll('[aria-label="Viewport scale"] option')].map((o) => o.textContent)).toContain('1:75');
    await command('VPFIT');
    expect(lastMsg()).toMatch(/Viewport 1: the whole level at 1:\d+ · ⌘Z to undo$/);
  });

  it('A new layout starts with the paper in Options: A1 portrait named in the message; Page setup opens only when asked, and not from the Layout manager', async () => {
    const make = async (draft0: Partial<DraftSettings>) => {
      act(() => root.unmount()); root = createRoot(host);
      act(() => root.render(<Host start={{ ...villa, building: undefined }} draft0={draft0} />));
      await flush();
      const v = await openDrawing('paper-layouts.dxf', bytes('tests/fixtures/cad/paper-layouts.dxf'));
      act(() => state.open(v));
      await flush();
      return v.file.toLowerCase();
    };
    const setup = () => document.querySelector('[aria-label="Page setup"]');
    // The defaults: A3, as before, Page setup stays shut.
    let key = await make({});
    await command('LAYOUT');
    expect(lastMsg()).toMatch(/^LAYOUT {2}Layout2 — A3 paper, the whole drawing in one viewport at 1:\d+ · Page setup changes the paper · ⌘Z to undo$/);
    expect(project.cadLayouts![key][0].paper).toEqual([420, 297]);
    expect(setup()).toBeNull();
    // A1 portrait, Page setup asked for: it opens for the new layout, which is the one shown.
    key = await make({ layoutPaper: 'A1', layoutPortrait: true, layoutSetupOpen: true });
    act(() => (document.querySelector('[aria-label="New layout"]') as HTMLButtonElement).click());
    expect(project.cadLayouts![key][0].paper).toEqual([594, 841]);
    expect(lastMsg()).toMatch(/^LAYOUT {2}Layout2 — A1 portrait paper, /);
    expect(state.layout).toBe('dwg:Layout2');
    await until(() => !!setup());
    expect(setup()!.textContent).toContain('Layout2');
    expect((document.querySelector('[aria-label="Paper"]') as HTMLSelectElement).value).toBe('A1');
    act(() => button('Cancel').click());
    expect(setup()).toBeNull();
    // From the Layout manager: made, but the manager stays and Page setup does not open.
    await command('LAYOUTMANAGER');
    await until(() => !!document.querySelector('[aria-label="Layout manager"]'));
    act(() => button('New layout').click());
    expect(project.cadLayouts![key].map((l) => l.name)).toEqual(['Layout2', 'Layout3']);
    expect(project.cadLayouts![key][1].paper).toEqual([594, 841]);
    expect(document.querySelector('[aria-label="Layout manager"]')).not.toBeNull();
    expect(setup()).toBeNull();
  });

  it('Layouts made with +: VPORTS 4, VPFIT, VPSCALE, Page setup (paper and orientation), Save as template and New layout from it', async () => {
    localStorage.removeItem('lvds.layoutTemplates');
    act(() => root.render(<Host start={{ ...villa, building: undefined }} />));
    await flush();
    const v = await openDrawing('paper-layouts.dxf', bytes('tests/fixtures/cad/paper-layouts.dxf'));
    act(() => state.open(v));
    await flush();
    const key = v.file.toLowerCase(), mine = () => project.cadLayouts![key];
    const ltabs = () => [...document.querySelectorAll('[aria-label="Model and layouts"] [role="tab"]')].map((t) => t.textContent);
    await command('LAYOUT');
    expect(lastMsg()).toMatch(/Page setup changes the paper · ⌘Z to undo$/);
    expect(state.layout).toBe('dwg:Layout2');
    await command('VPORTS');
    expect(hist()).toMatch(/^VPORTS {2}Type VPORTS and an arrangement/);
    await command('VPSCALE 50');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 1 at 1:50 · ⌘Z to undo');
    const perMm = (q: { vh: number; h: number }) => Math.round((q.vh / q.h) * 1e6) / 1e6; // the scale: model height per paper mm
    const vhBefore = perMm(mine()[0].viewports[0]);
    await command('VPORTS 4');
    expect(mine()[0].viewports).toHaveLength(4);
    expect(perMm(mine()[0].viewports[0])).toBe(vhBefore); // the first keeps its scale
    expect(lastMsg()).toBe('LAYOUT  Layout2: viewports arranged, four: equal · ⌘Z to undo');
    await command('VPFIT');
    expect(lastMsg()).toBe('LAYOUT  Layout2: the whole drawing in 4 viewports · ⌘Z to undo');
    await command('VPSCALE 50');
    expect(hist()).toBe('VPSCALE  Layout2 has 4 viewports: pick one first (click its frame), or right-click inside one.');
    // Page setup: A1 portrait; the viewports keep their scale.
    const scales = () => mine()[0].viewports.map((q) => Math.round(perMm(q) * 10) / 10); // the frame is kept to 0.1 mm
    const before = scales();
    expect(before.every((x) => x === 100)).toBe(true); // Fit: the whole drawing, at the scale it fits
    await command('PAGESETUP');
    setField('Paper', 'A1');
    act(() => button('Portrait').click());
    act(() => button('Save').click());
    expect(mine()[0].paper).toEqual([594, 841]);
    expect(scales()).toEqual(before);
    expect(lastMsg()).toBe('LAYOUT  Layout2: A1 portrait · ⌘Z to undo');
    // Save as template, then a new layout from it.
    await command('LAYOUT S');
    setField('Template name', 'My A1 portrait');
    act(() => button('Save as template').click());
    expect(JSON.parse(localStorage.getItem('lvds.layoutTemplates')!).map((t: { name: string; paper: number[] }) => [t.name, t.paper])).toEqual([['My A1 portrait', [594, 841]]]);
    act(() => button('Close').click());
    await command('LAYOUT T');
    act(() => button('New layout').click());
    expect(document.querySelector('[aria-label="Layout templates"]')).toBeNull();
    expect(ltabs()).toEqual(['Model', 'Layout1', 'A1 Lighting', 'Layout2', 'Layout3']);
    expect(mine()[1]).toMatchObject({ name: 'Layout3', paper: [594, 841] });
    expect(mine()[1].viewports).toHaveLength(4);
    expect(state.layout).toBe('dwg:Layout3');
    // VPMAX on a layout of the drawing, and back.
    await command('VPMAX');
    expect(state.layout).toBeNull();
    await command('VPMIN');
    expect(state.layout).toBe('dwg:Layout3');
    // Back by the layout's own tab: nothing is maximised any more, so VPMIN goes nowhere.
    await command('VPMAX');
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === 'Layout2')!.click());
    expect(state.layout).toBe('dwg:Layout2');
    await command('VPMIN');
    expect(state.layout).toBe('dwg:Layout2');
    expect(hist()).toBe('VPMIN  No viewport is maximised (VPMAX on a layout first).');
    // A viewport command with several viewports and none picked asks for one.
    await command('VPCOPY');
    expect(hist()).toBe('VPCOPY  Pick a viewport first (click its frame).');
  });

  it('Layouts made with +: MV (Esc stops it), VPCOPY, VPLOCK, VPFRAME, VPALIGN, VPSCALE on the viewport picked, MS / PS and the MODEL / PAPER button, the Viewport properties panel, the right-click menu, PLOT', async () => {
    act(() => root.render(<Host start={{ ...villa, building: undefined }} />));
    await flush();
    const v = await openDrawing('paper-layouts.dxf', bytes('tests/fixtures/cad/paper-layouts.dxf'));
    act(() => state.open(v));
    await flush();
    const hist = () => document.querySelector('.cad-hist')!.textContent;
    const mine = () => project.cadLayouts![v.file.toLowerCase()][0];
    const status = () => document.querySelector('.cad-status')!.textContent;
    const panel = () => document.querySelector('[aria-label="Viewport properties"]');
    await command('LAYOUT');
    expect(state.layout).toBe('dwg:Layout2');
    // Where a point of the paper is on screen (mm from its lower left corner): from the first frame, A3 with a 10 mm margin.
    const f1 = document.querySelector<HTMLElement>('.cad-vp[aria-label="Viewport 1"]')!;
    const k = parseFloat(f1.style.width) / 400, left = parseFloat(f1.style.left) - 10 * k, bottom = parseFloat(f1.style.top) + 287 * k;
    const px = (mx: number, my: number) => ({ clientX: left + mx * k, clientY: bottom - my * k });
    const press = (mx: number, my: number) => act(() => { document.querySelector('.cad-vps')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...px(mx, my) })); });
    const rightAt = (mx: number, my: number) => act(async () => { document.querySelector('.cad-filepaper')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...px(mx, my) })); });
    const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => (rowLabel(b)) === label)!;
    const labels = () => [...document.querySelectorAll('[role="menu"] button')].map((b) => rowLabel(b));
    // MV: Esc stops it; typed again, two presses make Viewport 2 and pick it.
    await command('MV');
    expect(hist()).toBe('MVIEW  Click two corners of the new viewport on the paper:');
    expect(document.querySelector('.cad-vps.mv')).not.toBeNull();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(hist()).toBe('MVIEW  Cancelled.');
    expect(document.querySelector('.cad-vps.mv')).toBeNull();
    await command('MV');
    press(20, 20);
    press(120, 100);
    expect(mine().viewports).toHaveLength(2);
    expect(mine().viewports[1]).toMatchObject({ x: 20, y: 20, w: 100, h: 80 });
    expect(lastMsg()).toMatch(/^LAYOUT {2}Layout2: Viewport 2 added at 1:\d+ · ⌘Z to undo$/);
    expect(state.vpSel).toBe('dv1');
    expect(document.querySelector('.cad-vps.mv')).toBeNull();
    expect(panel()!.textContent).toMatch(/^Viewport 2 Layout2Scale/);
    // VPCOPY, VPLOCK, VPFRAME act on the one picked.
    await command('VPCOPY');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 2 copied as Viewport 3 · ⌘Z to undo');
    expect(mine().viewports).toHaveLength(3);
    expect(state.vpSel).toBe('dv2');
    await command('VPLOCK');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 3: locked · ⌘Z to undo');
    expect(mine().viewports[2].locked).toBe(true);
    expect(status()).toMatch(/Viewport 3 · 1:\d+ · locked/);
    await command('VPLOCK');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 3: unlocked: the wheel and a drag inside it move its view · ⌘Z to undo');
    expect('locked' in mine().viewports[2]).toBe(false);
    await command('VPFRAME');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 3: frame prints · ⌘Z to undo');
    expect(mine().viewports[2].frame).toBe(true);
    expect((panel()!.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    await command('VPFRAME');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 3: frame on screen only · ⌘Z to undo');
    // VPALIGN lines the picked viewport up with Viewport 1.
    await command('VPALIGN');
    expect(hist()).toBe('VPALIGN  Type VPALIGN H (side by side) or VPALIGN V (stacked).');
    await command('VPALIGN H');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 3 lined up with Viewport 1 (side by side) · ⌘Z to undo');
    act(() => state.setVpSel('dv0'));
    await command('VPALIGN V');
    expect(hist()).toBe('VPALIGN  Pick another viewport: the others line up with Viewport 1.');
    // VPSCALE: the picked one; none picked with several: asks for one.
    act(() => state.setVpSel('dv2'));
    await command('VPSCALE 50');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 3 at 1:50 · ⌘Z to undo');
    act(() => state.setVpSel(null));
    await command('VPSCALE 50');
    expect(hist()).toBe('VPSCALE  Layout2 has 3 viewports: pick one first (click its frame), or right-click inside one.');
    await command('VPLOCK');
    expect(hist()).toBe('VPLOCK  Pick a viewport first (click its frame).');
    // MS works in the one picked; the status bar button (MODEL / PAPER) goes back and forth; PS returns.
    act(() => state.setVpSel('dv2'));
    await command('MS');
    expect(state.msVp).toBe('dv2');
    expect(hist()).toBe('MSPACE  In Viewport 3 (1:50): the wheel and a drag move its view. PS or a double-click outside returns to the paper.');
    const toggle = () => document.querySelector<HTMLButtonElement>('.cad-status button[aria-label="Model space in a viewport"], .cad-status button[aria-label="Paper space"]')!;
    expect(toggle().getAttribute('aria-label')).toBe('Model space in a viewport');
    expect(toggle().textContent).toBe('MODEL');
    act(() => toggle().click());
    expect(state.msVp).toBeNull();
    expect(hist()).toBe('PSPACE  On the paper.');
    expect(toggle().textContent).toBe('PAPER');
    act(() => toggle().click());
    expect(state.msVp).toBe('dv2');
    await command('PS');
    expect(state.msVp).toBeNull();
    // The Viewport properties panel: scale, Locked, Delete viewport.
    setField('Viewport scale', '100');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 3 at 1:100 · ⌘Z to undo');
    act(() => button('Locked').click());
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 3: locked · ⌘Z to undo');
    act(() => button('Delete viewport').click());
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 3 deleted · ⌘Z to undo');
    expect(mine().viewports).toHaveLength(2);
    expect(panel()).toBeNull();
    // Right-click inside Viewport 2 picks it; Lock display, then Erase viewport.
    await rightAt(70, 60);
    expect(state.vpSel).toBe('dv1');
    expect(labels()).toEqual(['Activate (model space)', 'Show on the Model tab', 'Viewport scale', 'Lock display', 'Frame prints', 'Clip to an outline…', 'Erase viewport', 'Plot this layout…', 'Page setup…']);
    await act(async () => { entry('Lock display').click(); });
    expect(mine().viewports[1].locked).toBe(true);
    await rightAt(70, 60);
    expect(labels()).toContain('Unlock display');
    await act(async () => { entry('Erase viewport').click(); });
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 2 deleted · ⌘Z to undo');
    expect(mine().viewports).toHaveLength(1);
    expect(state.vpSel).toBeNull();
    // LEGEND and NOTES belong to the plan sheets; PLOT opens the Plot dialog.
    await command('LEGEND');
    expect(hist()).toBe("LEGEND  Legend and notes tables go on the project's plan sheets (right-click a tab for a new plan sheet of the level).");
    await command('PLOT');
    expect(document.querySelector('[aria-label="Plot"]')!.textContent).toMatch(/^Plot Layout2/);
    act(() => button('Cancel').click());
    expect(document.querySelector('[aria-label="Plot"]')).toBeNull();
  });

  it('Layout viewports on a plan sheet: VPCLIP cuts the viewport picked to an outline clicked on the paper, the model worked in is cut at it, VPCLIP D takes it off, the menu and the panel offer both', async () => {
    const gf = { building: 'V', level: 'GF' };
    let start: Project = { ...villa, cadPlans: [{ building: 'V', level: 'GF', file: 'sample-villa-gf.dxf', units: 4 }] };
    for (const [x, y] of [[3, 9], [6, 9.4], [9, 8.8]]) start = placeLvPoint(start, gf, 'ltg', 'DB-GF1-B2', x, y).project;
    act(() => root.render(<Host start={start} />));
    await flush();
    await command('LAYOUT L');
    const sheet = () => project.drawingSet!.sheets.find((x) => x.kind === 'plan')!;
    await until(() => !!document.querySelector('.cad-vp'));
    await command('VPORTS 2V');
    const vps = () => sheet().viewports!;
    expect(vps()).toHaveLength(2);
    const START = 'VPCLIP  Click the corners of the outline on the paper. Enter closes it (three corners or more), U takes the last corner back, Esc cancels.';
    await until(() => document.querySelectorAll('.cad-vp').length === 2);
    // Where a point of the drawing area (mm, y down) is on screen: from Viewport 1's frame.
    const f1 = document.querySelector<HTMLElement>('.cad-vp[aria-label="Viewport 1"]')!, b1 = vps()[0].box;
    const k = parseFloat(f1.style.width) / b1[2], left = parseFloat(f1.style.left) - b1[0] * k, top = parseFloat(f1.style.top) - b1[1] * k;
    const px = (mx: number, my: number) => ({ clientX: left + mx * k, clientY: top + my * k });
    const press = (mx: number, my: number) => act(() => { document.querySelector('.cad-vps')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...px(mx, my) })); });
    const rightAt = (mx: number, my: number) => act(async () => { document.querySelector('.cad-vps')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...px(mx, my) })); });
    const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => (rowLabel(b)) === label)!;
    const labels = () => [...document.querySelectorAll('[role="menu"] button')].map((b) => rowLabel(b));
    const band = () => document.querySelector('svg[aria-label="Outline being picked"]');
    act(() => state.setVpSel(null));
    await command('VPCLIP');
    expect(hist()).toBe('VPCLIP  Pick a viewport first: click its frame.');
    act(() => state.setVpSel('vp2'));
    const [bx, by, bw, bh] = vps()[1].box, n = onChange.mock.calls.length;
    await command('VPCLIP');
    expect(hist()).toBe(START);
    expect(document.querySelector('.cad-vps.mv')).not.toBeNull();
    expect(band()).not.toBeNull();
    press(bx + 10, by + 10); press(bx + bw - 10, by + 10);
    expect(band()!.querySelectorAll('circle')).toHaveLength(2); // a dot on each corner so far
    await command('');
    expect(hist()).toBe('VPCLIP  An outline needs three corners that enclose an area: click more corners, or Esc.');
    expect(onChange.mock.calls.length).toBe(n);
    press(bx + bw / 2, by + bh - 10);
    expect(hist()).toBe('VPCLIP  Corner 3: click the next, Enter to close, U to take it back.');
    await command('U');
    expect(hist()).toBe('VPCLIP  Corner taken back: 2 left.');
    press(bx + bw / 2, by + bh - 10);
    await command('');
    expect(lastMsg()).toBe('E-LTG-001  Viewport 2 clipped to an outline of 3 corners · ⌘Z to undo');
    expect(onChange.mock.calls.length).toBe(n + 1);
    expect(vps()[1].clip).toHaveLength(3);
    expect(vps()[1].box[2]).toBeCloseTo(bw - 20, 0);
    expect(document.querySelector('.cad-vps.mv')).toBeNull();
    expect(document.querySelector('[aria-label="Viewport properties"]')!.textContent).toContain('Outline: clipped, 3 corners');
    // Worked in, the model is cut at the outline.
    await command('MS');
    expect(state.msVp).toBe('vp2');
    expect(document.querySelector<HTMLElement>('.cad-vp[aria-label="Viewport 2"] .cad-vp-model')!.getAttribute('style')).toMatch(/clip-path: polygon\(0% 0%, 100% 0%, 49\.96% 100%\)/);
    await command('PS');
    // The menu inside it offers both; a corner of its frame cut away is not inside.
    await rightAt(bx + bw / 2, by + 20);
    expect(labels()).toEqual(expect.arrayContaining(['Clip to an outline…', 'Remove the outline']));
    await act(async () => { entry('Remove the outline').click(); });
    expect(lastMsg()).toBe('E-LTG-001  Viewport 2: outline removed, it is its frame again · ⌘Z to undo');
    expect('clip' in vps()[1]).toBe(false);
    await command('VPCLIP D');
    expect(hist()).toBe('VPCLIP  Viewport 2 has no outline.');
    // Clip… on the panel starts picking; Esc stops it; VPCLIP D after clipping again.
    act(() => button('Clip…').click());
    expect(hist()).toBe(START);
    press(bx + 10, by + 10);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(hist()).toBe('VPCLIP  Cancelled.');
    expect(document.querySelector('.cad-vps.mv')).toBeNull();
    await command('VPCLIP P');
    press(bx + 10, by + 10); press(bx + bw - 10, by + 10); press(bx + bw / 2, by + bh - 10);
    await command('C');
    expect(vps()[1].clip).toHaveLength(3);
    act(() => button('Remove').click());
    expect('clip' in vps()[1]).toBe(false);
  });

  it('Layouts made with +: VPCLIP cuts the viewport picked to an outline clicked on the paper (Enter closes it, U takes a corner back, Esc stops it), VPCLIP D takes it off; the right-click menu and the properties panel offer both', async () => {
    act(() => root.render(<Host start={{ ...villa, building: undefined }} />));
    await flush();
    const v = await openDrawing('paper-layouts.dxf', bytes('tests/fixtures/cad/paper-layouts.dxf'));
    act(() => state.open(v));
    await flush();
    const hist = () => document.querySelector('.cad-hist')!.textContent;
    const mine = () => project.cadLayouts![v.file.toLowerCase()][0];
    const panel = () => document.querySelector('[aria-label="Viewport properties"]');
    await command('LAYOUT');
    const f1 = document.querySelector<HTMLElement>('.cad-vp[aria-label="Viewport 1"]')!;
    const k = parseFloat(f1.style.width) / 400, left = parseFloat(f1.style.left) - 10 * k, bottom = parseFloat(f1.style.top) + 287 * k;
    const px = (mx: number, my: number) => ({ clientX: left + mx * k, clientY: bottom - my * k });
    const press = (mx: number, my: number) => act(() => { document.querySelector('.cad-vps')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...px(mx, my) })); });
    const rightAt = (mx: number, my: number) => act(async () => { document.querySelector('.cad-filepaper')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...px(mx, my) })); });
    const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => (rowLabel(b)) === label)!;
    const labels = () => [...document.querySelectorAll('[role="menu"] button')].map((b) => rowLabel(b));
    const band = () => document.querySelector('svg[aria-label="Outline being picked"]');
    const esc = () => act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    const START = 'VPCLIP  Click the corners of the outline on the paper. Enter closes it (three corners or more), U takes the last corner back, Esc cancels.';
    await command('MV');
    press(20, 20);
    press(120, 100);
    expect(mine().viewports).toHaveLength(2);
    // Two viewports and none picked: it asks for one.
    act(() => state.setVpSel(null));
    await command('VPCLIP');
    expect(hist()).toBe('VPCLIP  Pick a viewport first: click its frame.');
    expect(document.querySelector('.cad-vps.mv')).toBeNull();
    act(() => state.setVpSel('dv1'));
    let n = onChange.mock.calls.length;
    // Three corners and Enter: one project change; the frame becomes the corners' bounding box.
    await command('VPCLIP');
    expect(hist()).toBe(START);
    expect(document.querySelector('.cad-vps.mv')).not.toBeNull();
    expect(band()).not.toBeNull();
    press(30, 30);
    expect(hist()).toBe('VPCLIP  Corner 1: click the next, Enter to close, U to take it back.');
    press(110, 30);
    press(70, 90);
    expect(hist()).toBe('VPCLIP  Corner 3: click the next, Enter to close, U to take it back.');
    expect(band()!.querySelectorAll('circle')).toHaveLength(3);
    expect(onChange.mock.calls.length).toBe(n);
    // U takes a corner back; Enter with two says an outline needs three and goes on.
    await command('U');
    expect(hist()).toBe('VPCLIP  Corner taken back: 2 left.');
    expect(band()!.querySelectorAll('circle')).toHaveLength(2);
    await command('');
    expect(hist()).toBe('VPCLIP  An outline needs three corners that enclose an area: click more corners, or Esc.');
    expect(document.querySelector('.cad-vps.mv')).not.toBeNull();
    expect(onChange.mock.calls.length).toBe(n);
    press(70, 90);
    await command('');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 2 clipped to an outline of 3 corners · ⌘Z to undo');
    expect(onChange.mock.calls.length).toBe(n + 1);
    const w = mine().viewports[1];
    expect(w.clip).toHaveLength(3);
    [w.x, w.y, w.w, w.h].forEach((got, i) => expect(got).toBeCloseTo([30, 30, 80, 60][i], 0));
    expect(document.querySelector('.cad-vps.mv')).toBeNull();
    expect(band()).toBeNull();
    // The properties panel says so and offers Clip… and Remove.
    expect(panel()!.textContent).toContain('Outline: clipped, 3 corners');
    expect(button('Remove')).toBeDefined();
    // Esc stops picking and changes nothing.
    n = onChange.mock.calls.length;
    await command('VPCLIP');
    press(40, 40);
    await esc();
    expect(hist()).toBe('VPCLIP  Cancelled.');
    expect(document.querySelector('.cad-vps.mv')).toBeNull();
    expect(onChange.mock.calls.length).toBe(n);
    // The right-click menu inside the clipped viewport offers both; Remove the outline takes it off.
    await rightAt(70, 60);
    expect(labels()).toEqual(['Activate (model space)', 'Show on the Model tab', 'Viewport scale', 'Lock display', 'Frame prints', 'Clip to an outline…', 'Remove the outline', 'Erase viewport', 'Plot this layout…', 'Page setup…']);
    await act(async () => { entry('Remove the outline').click(); });
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 2: outline removed, it is its frame again · ⌘Z to undo');
    expect('clip' in mine().viewports[1]).toBe(false);
    expect(panel()!.textContent).toContain('Outline: its frame');
    await command('VPCLIP D');
    expect(hist()).toBe('VPCLIP  Viewport 2 has no outline.');
    // Clip to an outline… from the menu, and Clip… on the panel, start picking the same way.
    await rightAt(70, 60);
    expect(labels()).not.toContain('Remove the outline');
    await act(async () => { entry('Clip to an outline…').click(); });
    expect(hist()).toBe(START);
    await esc();
    act(() => button('Clip…').click());
    expect(hist()).toBe(START);
    press(30, 30); press(110, 30); press(70, 90);
    await command('CLOSE');
    expect(mine().viewports[1].clip).toHaveLength(3);
    await command('VPCLIP D');
    expect(lastMsg()).toBe('LAYOUT  Layout2: Viewport 2: outline removed, it is its frame again · ⌘Z to undo');
    expect('clip' in mine().viewports[1]).toBe(false);
    // Another command typed while picking stops it first.
    await command('VPCLIP');
    press(30, 30);
    await command('VPLOCK');
    expect(document.querySelector('.cad-vps.mv')).toBeNull();
    expect(mine().viewports[1].locked).toBe(true);
    // Going to another tab ends picking silently.
    await command('VPCLIP');
    expect(document.querySelector('.cad-vps.mv')).not.toBeNull();
    await command('MODEL');
    await command('LAYOUT');
    expect(document.querySelector('.cad-vps.mv')).toBeNull();
  });

  it('LAYOUT I: the layouts of another drawing, picked in a dialog, are added to this one; a name taken becomes the next LayoutN; the other drawing is closed', async () => {
    localStorage.removeItem('lvds.layoutTemplates');
    act(() => root.render(<Host start={{ ...villa, building: undefined }} />));
    await flush();
    const cadFile = (window as unknown as { lvds: { cadFile: { openBytes: ReturnType<typeof vi.fn> } } }).lvds.cadFile;
    const other = () => cadFile.openBytes.mockResolvedValueOnce({ file: 'paper-layouts.dxf', path: '/jobs/paper-layouts.dxf', bytes: bytes('tests/fixtures/cad/paper-layouts.dxf') });
    const key = state.view!.file.toLowerCase(), mine = () => project.cadLayouts![key];
    const ltabs = () => [...document.querySelectorAll('[aria-label="Model and layouts"] [role="tab"]')].map((t) => t.textContent);
    const dlg = () => document.querySelector('[aria-label="Layouts from another drawing"]');
    const box = (name: string) => document.querySelector<HTMLInputElement>(`[aria-label="Import ${name}"]`)!;
    expect(ltabs()).toEqual(['Model', 'Layout1']);
    other();
    await command('LAYOUT I');
    await until(() => !!dlg());
    expect(cadFile.openBytes).toHaveBeenLastCalledWith({ templates: true }); // drawing templates (DWT) are offered too
    expect(dlg()!.querySelector('h3')!.textContent).toBe('Layouts from another drawing paper-layouts.dxf');
    const rows = [...document.querySelectorAll('[aria-label="Layouts of that drawing"] tbody tr')].map((r) => [...r.querySelectorAll('td')].slice(1).map((c) => c.textContent));
    expect(rows[0].slice(0, 2)).toEqual(['Layout1', 'A3 landscape']);
    expect(rows[0][2]).toMatch(/^1 · /);
    expect(rows[1]).toEqual(['A1 Lighting', 'A1 landscape', '0']);
    expect(box('Layout1').checked).toBe(true);
    expect(box('A1 Lighting').checked).toBe(true);
    expect(button('Import 2 layouts')).toBeDefined();
    act(() => box('A1 Lighting').click());
    expect(button('Import 1 layout')).toBeDefined();
    act(() => button('Import 1 layout').click());
    expect(dlg()).toBeNull();
    // Layout1 is taken here, so it comes in as Layout2; the viewport shows this drawing.
    expect(ltabs()).toEqual(['Model', 'Layout1', 'Layout2']);
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toMatchObject({ name: 'Layout2', paper: [420, 297] });
    expect(mine()[0].viewports).toHaveLength(1);
    expect(lastMsg()).toBe('LAYOUT  1 layout from paper-layouts.dxf: Layout2 · ⌘Z to undo');
    expect(state.layout).toBe('dwg:Layout2');
    expect(localStorage.getItem('lvds.layoutTemplates')).toBeNull(); // not kept as a template
    // Again, both, and kept as templates too.
    other();
    await command('LAYOUT I');
    await until(() => !!dlg());
    act(() => document.querySelector<HTMLInputElement>('[aria-label="Layouts from another drawing"] .cad-devform input[type="checkbox"]')!.click());
    act(() => button('Import 2 layouts').click());
    expect(ltabs()).toEqual(['Model', 'Layout1', 'Layout2', 'Layout3', 'A1 Lighting']);
    expect(lastMsg()).toBe('LAYOUT  2 layouts from paper-layouts.dxf: Layout3, A1 Lighting · ⌘Z to undo');
    expect(mine()[2]).toMatchObject({ name: 'A1 Lighting', paper: [841, 594] });
    expect(JSON.parse(localStorage.getItem('lvds.layoutTemplates')!).map((t: { name: string }) => t.name).sort()).toEqual(['A1 Lighting', 'Layout1']);
    // The tab menu and the paper's menu offer it too.
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === 'Model')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 500 })));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.firstChild?.textContent?.trim()).slice(0, 3)).toEqual(['New layout', 'From template…', 'From another drawing…']);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    // A drawing template (DWT) is read the same way.
    cadFile.openBytes.mockResolvedValueOnce({ file: 'office.dwt', path: '/jobs/office.dwt', bytes: bytes('tests/fixtures/cad/paper-layouts.dxf') });
    await command('LAYOUT I');
    await until(() => !!dlg());
    expect(dlg()!.querySelector('h3')!.textContent).toBe('Layouts from another drawing office.dwt');
    act(() => box('A1 Lighting').click());
    act(() => button('Import 1 layout').click());
    expect(lastMsg()).toBe('LAYOUT  1 layout from office.dwt: Layout4 · ⌘Z to undo');
  });

  it('A layout shows the design made in the app over the drawing — devices, the DB, wiring and drawn work — and plots it; the file\'s own layouts too', async () => {
    const gf = { building: 'V', level: 'GF' };
    let start = placeBoard(villa, 'DB-GF1', gf, 1, 1);
    for (const [x, y] of [[3, 9], [6, 9.4], [9, 8.8]]) start = placeLvPoint(start, gf, 'ltg', 'DB-GF1-Y1', x, y).project;
    start = placeLvPoint(start, gf, 's13', 'DB-GF1-B6', 6, 4).project;
    // A line drawn on the sample plan in the app.
    start = { ...start, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [{ id: 'k1', kind: 'line', layer: '0', pts: [[2000, 2000], [8000, 2000]] }] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    expect(state.view!.file).toBe('sample-villa-gf.dxf');
    const overlay = () => document.querySelector('.cad-filepaper-design');
    expect(overlay()).toBeNull(); // the Model tab draws the design itself
    await command('LAYOUT');
    expect(state.layout).toBe('dwg:Layout2');
    // The whole drawing in one viewport: the three lights (circles), the socket (a box), the DB with its name, the line.
    expect(overlay()).not.toBeNull();
    expect(overlay()!.querySelectorAll('circle[r="1.8"]')).toHaveLength(3);
    expect(overlay()!.querySelectorAll('g[data-vp]')).toHaveLength(1);
    expect(overlay()!.textContent).toContain('DB-GF1');
    expect(overlay()!.querySelectorAll('.drawn path')).toHaveLength(1);
    // The plot carries the same design.
    const pdfBytes = vi.fn(async (_a: { html: string; cssPages?: boolean }) => new Uint8Array([37, 80, 68, 70]));
    const lvds = (window as unknown as { lvds: { files?: unknown } }).lvds;
    lvds.files = { pdfBytes, saveBinary: vi.fn(async () => '/out/Layout2.pdf') };
    await command('PLOT');
    act(() => button('Plot PDF').click());
    await until(() => pdfBytes.mock.calls.length === 1);
    const html = pdfBytes.mock.calls[0][0].html;
    expect(html.match(/<circle [^>]*r="1.8"/g)).toHaveLength(3);
    expect(html).toContain('>DB-GF1<');
    // A drawing file's own layout shows the model through its viewport, so the design is on it as well: the devices of
    // the level the drawing shows (the first level, as on its Model tab), not the line drawn on the other drawing.
    await until(() => !document.querySelector('[aria-label="Plot"]'));
    const v = await openDrawing('paper-layouts.dxf', bytes('tests/fixtures/cad/paper-layouts.dxf'));
    act(() => state.open(v));
    await flush();
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === 'Layout1')!.click());
    await flush();
    expect(state.layout).toBe('file:Layout1');
    expect(overlay()!.querySelectorAll('circle[r="1.8"]')).toHaveLength(3);
    expect(overlay()!.querySelectorAll('.drawn path')).toHaveLength(0);
  });

  it("The drawing file's own layouts: PLOT opens the Plot dialog, PAGESETUP says the paper is the file's, the viewport commands say to make a layout with +", async () => {
    act(() => root.render(<Host start={{ ...villa, building: undefined }} />));
    await flush();
    const v = await openDrawing('paper-layouts.dxf', bytes('tests/fixtures/cad/paper-layouts.dxf'));
    act(() => state.open(v));
    await flush();
    const hist = () => document.querySelector('.cad-hist')!.textContent;
    const tab = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === name)!;
    act(() => tab('Layout1').click());
    expect(state.layout).toBe('file:Layout1');
    await command('PAGESETUP');
    expect(hist()).toBe("PAGESETUP  Layout1 is the drawing file's own layout: its paper (A3 landscape) is as the file has it. A layout made with + takes its own paper.");
    await command('VPCOPY');
    expect(hist()).toBe("VPCOPY  Layout1 is the drawing file's own layout, shown as it was saved. To change its viewports, save it as a template (LAYOUT S) and make a layout from it, or make one with +.");
    await command('PLOT');
    expect(document.querySelector('[aria-label="Plot"]')!.textContent).toMatch(/^Plot Layout1/);
    expect(document.querySelector('[aria-label="Plot"]')!.textContent).toContain('420 × 297 mm');
    act(() => button('Cancel').click());
    // Its tab's menu: the top block, Save as template…, Plot….
    act(() => tab('Layout1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 500 })));
    expect(document.querySelector('[role="menu"]')!.getAttribute('aria-label')).toBe('Layout Layout1');
    act(() => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent?.startsWith('Plot…'))!.click());
    expect(document.querySelector('[aria-label="Plot"]')).not.toBeNull();
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
    expect([state.toggles.grid, state.gridDots]).toEqual([true, false]);
    act(() => showPage(true));
    await until(() => ran.mock.calls.length > 0);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(state.pending.current).toBeNull();
    expect([state.toggles.grid, state.gridDots]).toEqual([true, true]); // GRID ran on the page, as if typed: lines → dots
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

  it('right-click: with a tool, the command menu (Enter, options, Snap overrides…); with none and nothing under it, the blank-canvas menu', async () => {
    await start();
    const right = (x: number, y: number, shiftKey = false) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, shiftKey, bubbles: true, cancelable: true })); }); };
    const menu = () => [...document.querySelectorAll('[aria-label="Command menu"] > button')] as HTMLButtonElement[];
    const labels = () => menu().map((b) => rowLabel(b));
    const entry = (label: string) => menu().find((b) => rowLabel(b) === label)!;
    await command('GRID');
    await command('F');
    await right(X + 20000, 20000);
    expect(labels()).toEqual(['Enter', 'Cancel', 'Radius', 'Trim', 'Snap overrides', 'Object snap', 'Ortho', 'Polar tracking', 'Zoom']);
    await act(async () => { entry('Trim').click(); });
    expect(hist()).toBe('FILLET  Select first object or [Radius/Trim] <R 0.00, No trim>:');
    await command('');
    expect(state.tool).toBe('none');
    await right(X + 20000, 20000);
    expect(labels()).toEqual(['Repeat FILLET', 'Recent commands', 'Paste', 'Paste to original coordinates', 'Undo', 'Redo', 'Isolate', 'Pan', 'Zoom',
      'Select all', 'Quick select…', 'Count', 'Place device', 'Cable route', 'Cable tray', 'Properties', 'Options…']);
    expect([entry('Paste').disabled, entry('Undo').disabled]).toEqual([true, true]); // nothing on the clipboard; no undo given
    await act(async () => { entry('Recent commands').click(); });
    expect([...document.querySelectorAll('[aria-label="Recent commands"] button')].map((b) => rowLabel(b))).toEqual(['GRID']);
    await act(async () => { entry('Repeat FILLET').click(); });
    expect(state.tool).toBe('fillet');
    // A prompt without options: right-click is Enter, Shift+right-click the command menu.
    await command('');
    await command('L');
    await right(X + 20000, 20000, true);
    expect(labels()).toContain('Snap overrides');
  });

  it('right-click set to repeat: blank canvas repeats the last command, a running command takes Enter; Shift, the menu key and an object keep the menu', async () => {
    project = two; act(() => root.render(<Host start={two} draft0={{ rightClick: 'repeat' }} />)); await flush(); act(() => state.toggle('osnap'));
    const right = (x: number, y: number, shiftKey = false) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, shiftKey, bubbles: true, cancelable: true })); }); };
    const menu = () => [...document.querySelectorAll('[aria-label="Command menu"] > button')].map((b) => rowLabel(b));
    const blankMenu = () => document.querySelector('.cad-menu [role="menuitem"], [role="menu"] [role="menuitem"]');
    await command('F');
    expect(state.tool).toBe('fillet');
    // A running command whose prompt has options: Enter, no menu.
    await right(X + 20000, 20000);
    expect(state.tool).toBe('none');
    expect(menu()).toEqual([]);
    // Nothing running: the last command again, no menu.
    await right(X + 20000, 20000);
    expect(state.tool).toBe('fillet');
    expect(menu()).toEqual([]);
    expect(blankMenu()).toBeNull();
    // Shift + right-click while it runs: the command menu.
    await right(X + 20000, 20000, true);
    expect(menu()).toContain('Snap overrides');
    await key('Escape');
    await command('');
    expect(state.tool).toBe('none');
    // Shift + right-click on blank canvas: the blank-canvas menu, nothing repeated.
    await right(X + 20000, 20000, true);
    expect(state.tool).toBe('none');
    expect(menu()).toContain('Repeat FILLET');
    await key('Escape');
    // The menu key opens the menu at the cursor.
    await hover(X + 20000, 20000);
    await key('ContextMenu');
    expect(state.tool).toBe('none');
    expect(menu()).toContain('Repeat FILLET');
    await key('Escape');
    // An object under the cursor: its own menu, as before.
    await right(X + 2000, 0);
    expect(state.tool).toBe('none');
    expect(menu()).not.toContain('Repeat FILLET');
    expect(document.querySelector('.cad-menu-hd')?.textContent ?? '').toContain('Line');
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
    expect(document.querySelector('.cad-status button[aria-pressed="true"][title^="DYN (F12)"]')).not.toBeNull();
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

  it('DLI, DCO and DBA: a horizontal dimension of two points on a slope, a chain in line with it, then one stepped out', async () => {
    await start();
    await command('DCO');
    await clickAt(X, 20000);
    expect(hist()).toBe('DIMCONTINUE  No dimension on this drawing to go on from: draw one first (DIM or DLI).');
    await command('DLI');
    await clickAt(X, 10000); await clickAt(X + 3000, 11000); await clickAt(X + 1500, 13000);
    expect(items()[2]).toMatchObject({ kind: 'dim', layer: 'LV-ANNO', dir: 0, text: '3.00' });
    expect(last()).toContain('Linear dimension');
    expect(dimMeasure(items()[2])).toBeCloseTo(3000, 3);
    await command('DCO');
    await clickAt(X + 5000, 10500);
    expect(items()[3]).toMatchObject({ kind: 'dim', dir: 0, text: '2.00' });
    expect(items()[3].pts.slice(0, 2)).toEqual([[X + 3000, 11000], [X + 5000, 10500]]);
    expect(items()[3].pts[2][1]).toBeCloseTo(13000, 3); // in line with the first
    await clickAt(X + 6000, 10500); // goes on from the one just drawn
    expect(items()[4].pts[0]).toEqual([X + 5000, 10500]);
    expect(hist()).toBe('DIMCONTINUE  Specify second extension line origin (from the last dimension):');
    await command('DBA');
    await clickAt(X + 8000, 10000);
    expect(items()[5].pts[0]).toEqual([X + 5000, 10500]); // from the last one's first point
    expect(items()[5].text).toBe('3.00');
    expect(items()[5].pts[2][1]).toBeGreaterThan(13000); // one step further out
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
    expect(dlg().querySelector('[role="note"]')!.textContent).toBe('Draws as before until changed');
    const changes = onChange.mock.calls.length;
    await ok(); // nothing changed: nothing kept, the dimensions draw as before
    expect(onChange.mock.calls).toHaveLength(changes);
    expect(project.cadDimStyles).toBeUndefined();
    expect(hist()).toBe('DIMSTYLE  No change.');
    await command('D');
    pick('Arrow', 'closed');
    act(() => { (dlg().querySelector('[role="tab"]:nth-child(3)') as HTMLButtonElement).click(); }); // Units
    pick('Unit', 'mm'); pick('Decimal places', '0');
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

  it('Space twice: the first press ends a command that keeps going, the next starts it again; the command line says which (2026-11-17)', async () => {
    await start();
    const space = () => { act(() => { (document.querySelector('input[aria-label="Command"]') as HTMLInputElement).blur(); }); tap(' '); };
    const again = (tool: string, label: string) => {
      space();
      expect([tool, state.tool]).toEqual([tool, 'none']);
      expect(hist()).toBe(`Command: Click an object to see what it is · Space repeats ${label}`);
      space();
      expect(state.tool).toBe(tool);
    };
    // At the prompt each comes back to after every use (Offset's, after its distance).
    for (const [typed, tool, label] of [['TR', 'trim', 'TRIM'], ['EX', 'extend', 'EXTEND'], ['F', 'fillet', 'FILLET'], ['CHA', 'chamfer', 'CHAMFER'], ['BR', 'break', 'BREAK'], ['X', 'explode', 'EXPLODE'], ['O', 'offset', 'OFFSET']] as const) {
      await command(typed);
      if (tool === 'offset') await command('');
      again(tool, label);
      key('Escape');
    }
    // Those that end after one use, still waiting for their objects: the first press ends them too.
    for (const [typed, tool, label] of [['M', 'move', 'MOVE'], ['CO', 'copy', 'COPY'], ['RO', 'rotate', 'ROTATE'], ['MI', 'mirror', 'MIRROR'], ['SC', 'scale', 'SCALE'], ['S', 'stretch', 'STRETCH'], ['AL', 'align', 'ALIGN'], ['AR', 'array', 'ARRAY'], ['J', 'join', 'JOIN']] as const) {
      await command(typed);
      again(tool, label);
      key('Escape');
    }
    // A move done ends it, and says so; one press starts it again.
    await command('M');
    await clickAt(X + 2000, 0);
    await clickAt(X, 0);
    await command('@0,500');
    expect(items()[0].pts[0][1]).toBeCloseTo(500, 0);
    expect(hist()).toBe('Command: Click an object to see what it is · Space repeats MOVE');
    space();
    expect(state.tool).toBe('move');
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
    expect([state.toggles.grid, state.gridDots]).toEqual([true, true]); // the grid starts on: lines → dots
    act(() => { (document.querySelector('input[aria-label="Command"]') as HTMLInputElement).blur(); });
    key(' ', window, { code: 'Space' });
    key(' ', window, { code: 'Space', repeat: true });
    key(' ', window, { code: 'Space', repeat: true });
    keyUp(' ');
    expect(state.toggles.grid).toBe(true); // held: not a repeat of GRID
    tap(' ');
    expect([state.toggles.grid, state.gridDots]).toEqual([false, false]);
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


describe('Design CAD File: Save, Save As, Close and Options', () => {
  const dialog = (name: string) => document.querySelector(`[role="dialog"][aria-label="${name}"]`) as HTMLElement | null;
  const press = async (d: HTMLElement, label: string) => { const b = [...d.querySelectorAll('button')].find((x) => x.textContent === label) as HTMLButtonElement; expect(b, label).toBeTruthy(); await act(async () => { b.click(); }); await flush(); };
  const set = (el: HTMLInputElement | HTMLSelectElement, value: string) => act(() => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
  const tick = (d: HTMLElement, label: string) => act(() => { (d.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement).click(); });
  const dirtyMark = () => document.querySelector('.cad-tab-dirty');

  it('Save the first time is Save As (name, format and version); after that Save writes over that copy, keeping a .bak', async () => {
    const saveBinary = vi.fn(async () => '/plans/villa-copy.dxf');
    const overwriteBinary = vi.fn(async ({ file }: { file: string }) => file);
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary, overwriteBinary };
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('rec');
    await clickAt(6000, 6000);
    await clickAt(9000, 8000);
    expect(dirtyMark()).not.toBeNull(); // changed since saved: ● on its tab
    await command('save');
    const d = dialog('Save As')!;
    expect(d.closest('.cad-work')).not.toBeNull();
    expect((d.querySelector('input[aria-label="File name"]') as HTMLInputElement).value).toBe('sample-villa-gf - with devices');
    set(d.querySelector('input[aria-label="File name"]') as HTMLInputElement, 'villa-copy');
    set(d.querySelector('select[aria-label="Format"]') as HTMLSelectElement, 'dxf:R12');
    await press(d, 'Save');
    const first = (saveBinary.mock.calls[0] as unknown as [{ defaultName: string; bytes: Uint8Array }])[0];
    expect(first.defaultName).toBe('villa-copy.dxf');
    expect(new TextDecoder().decode(first.bytes)).toContain('AC1009');
    expect(dirtyMark()).toBeNull();
    await command('rec');
    await clickAt(6500, 6500);
    await clickAt(8000, 7000);
    expect(dirtyMark()).not.toBeNull();
    await command('save');
    await flush();
    expect(dialog('Save As')).toBeNull();
    expect(saveBinary).toHaveBeenCalledTimes(1);
    expect(overwriteBinary).toHaveBeenCalledTimes(1);
    const again = (overwriteBinary.mock.calls[0] as unknown as [{ file: string; bytes: Uint8Array; bak: boolean }])[0];
    expect([again.file, again.bak]).toEqual(['/plans/villa-copy.dxf', true]);
    expect(new TextDecoder().decode(again.bytes)).toContain('AC1009'); // the same version again
    expect(dirtyMark()).toBeNull();
  });

  it('Close asks first when the drawing changed since saved: Cancel keeps it, Don\'t save closes it', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('l');
    await clickAt(6000, 6000);
    await clickAt(9000, 6000);
    await command('');
    await command('close');
    const d = dialog('Close sample-villa-gf.dxf')!;
    expect(d.closest('.cad-work')).not.toBeNull();
    expect(d.textContent).toContain('changes since last saved');
    await press(d, 'Cancel');
    expect(state.view?.file).toBe('sample-villa-gf.dxf');
    await command('close');
    await press(dialog('Close sample-villa-gf.dxf')!, "Don't save");
    expect(state.view).toBeNull();
  });

  // Options (OP): the page names are the labels of the page list (the changed count sits in its own <i>).
  const opt = () => dialog('Options')!;
  const pageTab = (d: HTMLElement, name: string) => [...d.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.querySelector('span')?.textContent === name || t.textContent === name)!;
  const shownTab = (d: HTMLElement) => [...d.querySelectorAll('.cad-dlg-pl [role="tab"][aria-selected="true"]')].map((t) => t.querySelector('span')?.textContent ?? t.textContent);
  const subTab = (d: HTMLElement) => d.querySelector('.cad-dlg-tabs [role="tab"][aria-selected="true"]')?.textContent;
  const countOf = (d: HTMLElement, name: string) => pageTab(d, name).querySelector('i')?.textContent ?? '';
  const openPage = async (d: HTMLElement, name: string) => { await act(async () => { pageTab(d, name).click(); }); };
  const field = (d: HTMLElement, label: string) => d.querySelector(`[aria-label="${label}"]`) as HTMLInputElement & HTMLSelectElement;
  const keyOn = (el: Element, init: KeyboardEventInit) => act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); });

  it('DS opens Options at the Drafting page; OK changes the toggles and the settings, Cancel nothing', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OS');
    let d = opt();
    expect(shownTab(d)).toEqual(['Drafting']);
    expect(subTab(d)).toBe('Object snap');
    expect(d.closest('.cad-work'), 'over the drawing, not under the ribbon').not.toBeNull();
    tick(d, 'Perpendicular');
    await press(d, 'Cancel');
    expect(onPrefs).not.toHaveBeenCalled();
    await command('DS');
    d = opt();
    expect(subTab(d)).toBe('Snap & grid');
    await act(async () => { ([...d.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Polar tracking') as HTMLButtonElement).click(); });
    tick(d, 'Polar tracking on');
    set(d.querySelector('select[aria-label="Increment angle"]') as HTMLSelectElement, '30');
    set(d.querySelector('input[aria-label="Extra angles"]') as HTMLInputElement, '15, 400');
    await act(async () => { ([...d.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Object snap') as HTMLButtonElement).click(); });
    set(d.querySelector('input[aria-label="Snap aperture"]') as HTMLInputElement, '14');
    await openPage(d, 'Display');
    set(d.querySelector('select[aria-label="Crosshair colour"]') as HTMLSelectElement, 'accent');
    tick(d, 'Outline the cursor');
    await openPage(d, 'Selection');
    tick(d, 'Highlight what is under the pick box');
    tick(d, 'Name tag after a pause');
    await press(d, 'OK');
    expect(opt()).toBeNull();
    expect(state.toggles.polar).toBe(true);
    expect(onPrefs.mock.calls[0][0].draft).toMatchObject({ polarInc: 30, polarExtra: [15], aperturePx: 14, crossColor: 'accent', cursorOutline: false, hoverMark: false, hoverTag: true });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' })); });
    expect([state.toggles.ortho, state.toggles.polar]).toEqual([true, false]); // ORTHO and POLAR turn each other off
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11' })); });
    expect(state.toggles.otrack).toBe(true);
    // Right-click on a status-bar toggle: its settings.
    await act(async () => { document.querySelector('.cad-status button[title^="Grid:"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
    expect(subTab(opt())).toBe('Snap & grid');
  });

  it('Options: General has a Mouse section; right-click, wheel step and direction show the amber dot, reset, and reach onPrefs; Plot & publish lists the new layout rows first', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    const d = opt();
    expect([...d.querySelectorAll('.cad-dlg-sec')].map((x) => x.firstChild?.textContent)).toEqual(['Ribbon', 'Mouse', 'Your settings']);
    expect(field(d, 'Right-click in the drawing').value).toBe('menu');
    expect([...field(d, 'Right-click in the drawing').options].map((o) => o.textContent)).toEqual(['Opens the menu', 'Repeats the last command']);
    expect(field(d, 'Wheel zoom step').value).toBe('15');
    expect(d.querySelectorAll('.cad-dlg-r.chg')).toHaveLength(0);
    set(field(d, 'Right-click in the drawing'), 'repeat');
    set(field(d, 'Wheel zoom step'), '25');
    tick(d, 'Reverse the wheel direction');
    expect(d.querySelectorAll('.cad-dlg-r.chg')).toHaveLength(3);
    expect(countOf(d, 'General')).toBe('3');
    await act(async () => { (d.querySelector('button[aria-label="Reset Wheel zoom step"]') as HTMLButtonElement).click(); });
    expect(field(d, 'Wheel zoom step').value).toBe('15');
    expect(d.querySelectorAll('.cad-dlg-r.chg')).toHaveLength(2);
    set(field(d, 'Wheel zoom step'), '25');
    await openPage(d, 'Plot & publish');
    expect([...d.querySelectorAll('.cad-dlg-sec')].map((x) => x.firstChild?.textContent).slice(0, 2)).toEqual(['A new layout starts with', 'Plotting']);
    expect([...d.querySelectorAll('.cad-dlg-r')].map((r) => r.textContent).slice(0, 3)).toEqual(['Paper', 'Orientation', 'Open Page setup when a layout is made'].map((t) => expect.stringContaining(t)));
    expect([...field(d, 'Paper').options].map((o) => o.value)).toEqual(['A4', 'A3', 'A2', 'A1', 'A0']);
    expect([field(d, 'Paper').value, field(d, 'Orientation').value]).toEqual(['A3', 'landscape']);
    set(field(d, 'Paper'), 'A1');
    set(field(d, 'Orientation'), 'portrait');
    tick(d, 'Open Page setup when a layout is made');
    expect(countOf(d, 'Plot & publish')).toBe('3');
    await press(d, 'OK');
    expect(onPrefs.mock.calls[0][0].draft).toMatchObject({ rightClick: 'repeat', wheelPct: 25, wheelReverse: true, layoutPaper: 'A1', layoutPortrait: true, layoutSetupOpen: true });
  });

  it('OP opens the page last used; UNITS opens This drawing ("Not set"), Files & saving lists the formats and still reaches onPrefs, arrows move between pages', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    let d = opt();
    expect(shownTab(d)).toEqual(['General']); // nothing used yet
    await openPage(d, 'Selection');
    await press(d, 'Cancel');
    await command('OP');
    d = opt();
    expect(shownTab(d)).toEqual(['Selection']);
    await press(d, 'Cancel');
    await command('UNITS');
    d = opt();
    expect(d.querySelector('[role="tablist"]')!.getAttribute('aria-orientation')).toBe('vertical');
    expect(shownTab(d)).toEqual(['This drawing']);
    expect((d.querySelector('select[aria-label="Level"]') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Not set');
    expect(d.textContent).toContain('The level this drawing is the plan of.');
    const tabs = () => [...d.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Options"] > [role="tab"]')];
    await keyOn(pageTab(d, 'This drawing'), { key: 'ArrowUp' });
    expect(shownTab(d)).toEqual(['Shortcuts & aliases']); // the page between Plot & publish and This drawing
    await openPage(d, 'Files & saving');
    const fmt = d.querySelector('select[aria-label="Save As format"]') as HTMLSelectElement;
    expect([...fmt.options].map((o) => o.textContent)).toEqual(['DWG (default)', 'DXF', "The drawing's own format"]);
    expect(fmt.value).toBe('own'); // the test host keeps the sample drawing's own format; the app's default is DWG (cadDraft)
    tick(d, 'Keep the previous copy as .bak on Save');
    set(d.querySelector('input[aria-label="Recovery copy every"]') as HTMLInputElement, '7');
    await press(d, 'OK');
    expect(onPrefs.mock.calls[0][0]).toMatchObject({ autosaveMin: 7, draft: { keepBak: false } });
    await command('DS');
    d = opt();
    await act(async () => { tabs().find((t) => t.querySelector('span')?.textContent === 'Display')!.click(); });
    await keyOn(pageTab(d, 'Display'), { key: 'ArrowDown' });
    expect(shownTab(d)).toEqual(['Drafting']);
    expect(document.activeElement!.textContent).toBe('Drafting');
    // OS and the status bar's LWT open their own place.
    await press(d, 'Cancel');
    await act(async () => { tg('LWT').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
    expect(shownTab(opt())).toEqual(['Display']);
  });

  it('Options takes the keyboard when it opens, and goes to another place when asked for again while open, keeping what was changed', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    let d = opt();
    expect(document.activeElement).toBe(field(d, 'Find a setting')); // type to find a setting, Esc closes
    await openPage(d, 'Selection');
    set(field(d, 'Grip size'), '12');
    await command('OS'); // typed while the window is open
    d = opt();
    expect([shownTab(d), subTab(d)]).toEqual([['Drafting'], 'Object snap']);
    expect(countOf(d, 'Selection')).toBe('1');
    await press(d, 'OK');
    expect(onPrefs.mock.calls[0][0].draft).toMatchObject({ gripPx: 12 });
  });

  it('Options: find a setting shows the real rows from several pages; Esc clears, Ctrl F focuses, Enter opens the first match', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    const d = opt();
    const box = field(d, 'Find a setting');
    set(box, 'size');
    expect(d.querySelector('.cad-dlg-hits')!.textContent).toContain('5 settings match “size”'); // Paper (new layout) is found by its words
    expect([...d.querySelectorAll('.cad-dlg-sec.go b')].map((x) => x.textContent)).toEqual(['Display', 'Drafting › Object snap', 'Selection', 'Plot & publish']);
    expect(['Crosshair size', 'Snap marker size', 'Pick box size', 'Grip size'].every((l) => !!d.querySelector(`input[aria-label="${l}"]`)) && !!d.querySelector('select[aria-label="Paper"]')).toBe(true);
    expect(d.querySelector('mark')?.textContent?.toLowerCase()).toBe('size');
    expect(shownTab(d)).toEqual([]); // no page is selected while finding
    set(field(d, 'Grip size'), '12');
    // Esc with text clears it and keeps the window.
    await keyOn(box, { key: 'Escape' });
    expect(box.value).toBe('');
    expect(opt()).not.toBeNull();
    set(box, 'size');
    await act(async () => { (d.querySelector('button[aria-label="Go to Selection"]') as HTMLButtonElement).click(); });
    expect(box.value).toBe('');
    expect(shownTab(d)).toEqual(['Selection']);
    expect((field(d, 'Grip size')).value).toBe('12');
    // A short label says what it belongs to in the find results, and not on its own page.
    set(box, 'spacing');
    expect([...d.querySelectorAll('.cad-dlg-ctx')].map((x) => x.textContent)).toEqual(['Snap · ', 'Snap · ', 'Grid · ']);
    await act(async () => { (d.querySelector('button[aria-label="Go to Drafting › Snap & grid"]') as HTMLButtonElement).click(); });
    expect(d.querySelector('.cad-dlg-ctx')).toBeNull();
    // Ctrl F anywhere in the window.
    (document.activeElement as HTMLElement | null)?.blur();
    await keyOn(pageTab(d, 'Display'), { key: 'f', ctrlKey: true });
    expect(document.activeElement).toBe(box);
    // Enter opens the first match and does not press OK.
    set(box, 'osnap f3');
    await keyOn(box, { key: 'Enter' });
    expect(opt()).not.toBeNull();
    expect(box.value).toBe('');
    expect(shownTab(d)).toEqual(['Drafting']);
    expect(subTab(d)).toBe('Object snap');
    expect(onPrefs).not.toHaveBeenCalled();
    await press(d, 'OK');
    expect(onPrefs.mock.calls[0][0].draft.gripPx).toBe(12); // a value changed in the find results is what OK applies
  });

  it('Options: Display and Selection show a live preview that follows the values before OK; find results show none', async () => {
    act(() => root.render(<Host saveFormat="dwg" />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Display');
    expect(d.querySelector('.cad-dlg-pv svg[aria-label="Preview: the cursor and line widths"]')).not.toBeNull();
    await openPage(d, 'Selection');
    const grip = () => d.querySelector('.cad-dlg-pv [data-part="grip"]')!.getAttribute('width');
    expect(d.querySelector('.cad-dlg-pv svg[aria-label="Preview: picking, picked objects and grips"]')).not.toBeNull();
    expect(grip()).toBe('8');
    set(field(d, 'Grip size'), '12');
    expect(grip()).toBe('12');
    await act(async () => { (d.querySelector('button[aria-label="Reset Grip size"]') as HTMLButtonElement).click(); });
    expect(grip()).toBe('8');
    set(field(d, 'Find a setting'), 'grip');
    expect(d.querySelector('.cad-dlg-pv')).toBeNull();
    await press(d, 'Cancel');
  });

  it('Options: a setting not at its default has a dot, a count and a reset; Reset page and Changed work', async () => {
    act(() => root.render(<Host saveFormat="dwg" />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Selection');
    expect(d.querySelector('.chg')).toBeNull();
    expect(countOf(d, 'Selection')).toBe('');
    set(field(d, 'Grip size'), '12');
    expect(d.querySelectorAll('.cad-dlg-pg .chg')).toHaveLength(1);
    expect(countOf(d, 'Selection')).toBe('1');
    expect(pageTab(d, 'Changed').querySelector('i')!.textContent).toBe('1');
    // Its own reset puts the default back, and the counts drop.
    await act(async () => { (d.querySelector('button[aria-label="Reset Grip size"]') as HTMLButtonElement).click(); });
    expect(field(d, 'Grip size').value).toBe('8');
    expect(d.querySelector('.cad-dlg-pg .chg')).toBeNull();
    expect(countOf(d, 'Selection')).toBe('');
    expect(pageTab(d, 'Changed').querySelector('i')).toBeNull();
    // Reset page resets the page shown only.
    set(field(d, 'Grip size'), '12');
    set(field(d, 'Pick box size'), '20');
    await openPage(d, 'Display');
    set(field(d, 'Crosshair size'), '50');
    await openPage(d, 'Selection');
    expect(countOf(d, 'Selection')).toBe('2');
    await press(d, 'Reset page');
    expect(field(d, 'Grip size').value).toBe('8');
    expect(countOf(d, 'Selection')).toBe('');
    expect(countOf(d, 'Display')).toBe('1');
    expect((d.querySelector('.cad-dlg-ft button:not(.q)') as HTMLButtonElement).disabled).toBe(true); // nothing changed on this page
    // The Changed page lists what is left, and Reset all clears it.
    await act(async () => { pageTab(d, 'Changed').click(); });
    expect(shownTab(d)).toEqual(['Changed']); // no page is selected, only Changed
    expect(d.querySelector('.cad-dlg-hits')!.textContent).toBe('1 setting is not at its default');
    expect(field(d, 'Crosshair size').value).toBe('50');
    await press(d, 'Reset all');
    expect(d.querySelector('.cad-dlg-hits')!.textContent).toBe('Every setting is at its default.');
    await openPage(d, 'Display');
    expect(field(d, 'Crosshair size').value).toBe('100');
  });

  it('Options: a snap mode and extra polar angles are marked and reset on the Drafting tab', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OS');
    const d = opt();
    tick(d, 'Nearest');
    tick(d, 'Endpoint');
    expect(d.querySelectorAll('.cad-dlg-mode.chg')).toHaveLength(2);
    expect(countOf(d, 'Drafting')).toBe('2');
    await act(async () => { (d.querySelector('button[aria-label="Reset Nearest"]') as HTMLButtonElement).click(); });
    expect(countOf(d, 'Drafting')).toBe('1');
    await act(async () => { ([...d.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Polar tracking') as HTMLButtonElement).click(); });
    set(field(d, 'Extra angles'), '60');
    expect(countOf(d, 'Drafting')).toBe('2');
    await press(d, 'Reset tab'); // this tab only
    expect(field(d, 'Extra angles').value).toBe('');
    expect(countOf(d, 'Drafting')).toBe('1');
  });

  it('Options: Colour theme and palette, tool names and the panel order reach onPrefs as the app\'s settings', async () => {
    act(() => root.render(<Host extra={{ appPrefs: { ribbonOrder: ['layers', 'draw'] } }} />));
    await flush();
    await command('OP');
    const d = opt();
    expect(d.textContent).toContain('Your own');
    expect(pageTab(d, 'General').querySelector('i')!.textContent).toBe('1');
    await act(async () => { button('Reset order').click(); });
    expect(d.textContent).toContain('Standard');
    expect((button('Reset order') as HTMLButtonElement).disabled).toBe(true);
    tick(d, 'Show the name of every tool, the small ones too');
    await openPage(d, 'Display');
    set(field(d, 'Colour theme'), 'light');
    set(field(d, 'Colour palette'), 'blueprint');
    await press(d, 'OK');
    expect(onPrefs.mock.calls[0][0].app).toEqual({ theme: 'light', palette: 'blueprint', cadLabels: true, ribbonOrder: [], aliases: {}, keys: {} });
  });

  it('Options: Your settings: Export… writes the options as the window shows them, with the panel order', async () => {
    const saveText = vi.fn(async (_a: { defaultName: string; content: string }) => '/exports/Design CAD settings.json');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveText };
    act(() => root.render(<Host extra={{ appPrefs: { ribbonOrder: ['layers', 'draw'] } }} />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Selection');
    set(field(d, 'Grip size'), '12');
    await openPage(d, 'General');
    expect(d.querySelector('[role="group"][aria-label="Your settings file"]')).not.toBeNull();
    await press(d, 'Export…');
    await until(() => !!d.querySelector('p[role="status"]'));
    expect(d.querySelector('p[role="status"]')!.textContent).toBe('Saved Design CAD settings.json');
    const saved = JSON.parse(saveText.mock.calls[0][0].content);
    expect(saveText.mock.calls[0][0].defaultName).toBe('Design CAD settings.json');
    expect(saved).toMatchObject({ kind: 'lvds.cadSettings', version: 1, options: { draft: { gripPx: 12 }, ribbonOrder: ['layers', 'draw'] } });
    expect(onPrefs).not.toHaveBeenCalled();
  });

  const settingsOptions = (over: Partial<CadSettingsOptions> = {}): CadSettingsOptions => ({ draft: { ...DRAFT_DEFAULTS, gripPx: 14 }, autosaveMin: 2, theme: 'dark', palette: 'graphite', cadLabels: false, ribbonOrder: [], aliases: { CX: 'CO' }, keys: {}, ...over });
  const settingsLibraries: CadSettingsLibraries = { layerTemplates: [{ id: 'lt-1', name: 'Studio', layers: [{ layer: 'WALLS', role: 'wall' }], savedAt: '2026-11-01T00:00:00.000Z' }], layoutTemplates: [], setups: { kind: 'lvds.pageSetups', setups: [], tables: [] }, patterns: [] };
  const giveFile = async (d: HTMLElement, name: string, text: string) => {
    const input = d.querySelector('input[aria-label="Settings file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([text], name, { type: 'application/json' })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  };

  it('Options: Your settings: Import… fills the window; Cancel leaves everything, OK keeps the options and the libraries', async () => {
    const text = JSON.stringify(settingsFile(settingsOptions({ ribbonOrder: ['layers'] }), settingsLibraries, '2.279'));
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    let d = opt();
    await giveFile(d, 'studio.json', text);
    await until(() => !!d.querySelector('p[role="status"]'));
    expect(d.querySelector('p[role="status"]')!.textContent).toBe('From studio.json: options, 1 typed name, 1 layer template. OK keeps them; Cancel leaves everything as it was.');
    expect(countOf(d, 'Selection')).toBe('1');
    expect(countOf(d, 'Shortcuts & aliases')).toBe('1');
    expect(countOf(d, 'General')).toBe('1');
    expect(loadLayerTemplates()).toEqual([]);
    await press(d, 'Cancel');
    expect(loadLayerTemplates()).toEqual([]);
    expect(onPrefs).not.toHaveBeenCalled();
    await command('OP');
    d = opt();
    expect(countOf(d, 'Selection')).toBe('');
    await giveFile(d, 'studio.json', text);
    await until(() => !!d.querySelector('p[role="status"]'));
    await press(d, 'OK');
    expect(onPrefs.mock.calls[0][0].draft.gripPx).toBe(14);
    expect(onPrefs.mock.calls[0][0].app).toMatchObject({ aliases: { CX: 'CO' }, ribbonOrder: ['layers'] });
    expect(loadLayerTemplates().map((t) => t.name)).toEqual(['Studio']);
  });

  it('Options: Your settings: a file that is not a settings file is named in an alert and changes nothing', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    const d = opt();
    await giveFile(d, 'notes.json', '{"kind":"other"}');
    await until(() => !!d.querySelector('p[role="alert"]'));
    expect(d.querySelector('p[role="alert"]')!.textContent).toBe('notes.json is not a Design CAD settings file.');
    await giveFile(d, 'broken.json', '{ not json');
    await until(() => d.querySelector('p[role="alert"]')!.textContent === 'broken.json is not a Design CAD settings file.');
    expect(countOf(d, 'Selection')).toBe('');
    expect(countOf(d, 'Shortcuts & aliases')).toBe('');
  });

  it('Options: Your settings: Reset all puts every changed value back and is off when nothing is changed', async () => {
    act(() => root.render(<Host saveFormat="dwg" />));
    await flush();
    await command('OP');
    const d = opt();
    expect((button('Reset all') as HTMLButtonElement).disabled).toBe(true);
    await openPage(d, 'Selection');
    set(field(d, 'Grip size'), '12');
    await openPage(d, 'General');
    expect(countOf(d, 'Selection')).toBe('1');
    const reset = d.querySelector('[role="group"][aria-label="Your settings file"] button:last-child') as HTMLButtonElement;
    expect(reset.textContent).toBe('Reset all');
    expect(reset.disabled).toBe(false);
    await act(async () => { reset.click(); });
    expect(countOf(d, 'Selection')).toBe('');
    expect(reset.disabled).toBe(true);
  });

  it('Options: Reset order empties the ribbon\'s panel order on OK', async () => {
    act(() => root.render(<Host extra={{ appPrefs: { ribbonOrder: ['layers'] } }} />));
    await flush();
    await command('OP');
    const d = opt();
    await press(d, 'Reset order');
    await press(d, 'OK');
    expect(onPrefs.mock.calls[0][0].app!.ribbonOrder).toEqual([]);
  });

  it('Options: Plot & publish opens Page setups and Pen tables, and keeps the printer chosen', async () => {
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { printers: async () => [{ name: 'Office', displayName: 'Office laser', isDefault: false }] };
    const onOutput = vi.fn();
    act(() => root.render(<Host extra={{ onOutput }} />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Plot & publish');
    const inGroup = (name: string) => d.querySelector(`[role="group"][aria-label="${name}"]`) as HTMLElement;
    expect(inGroup('Page setups').textContent).toContain('None named');
    expect(inGroup('Pen tables').textContent).toContain('LVDS Electrical');
    await act(async () => { ([...inGroup('Page setups').querySelectorAll('button')].find((b) => b.textContent === 'Open…') as HTMLButtonElement).click(); });
    await act(async () => { ([...inGroup('Pen tables').querySelectorAll('button')].find((b) => b.textContent === 'Open…') as HTMLButtonElement).click(); });
    expect(onOutput.mock.calls).toEqual([['setups'], ['pens']]);
    expect(opt()).not.toBeNull(); // Options stays open behind the manager
    const sel = field(d, 'Plot to');
    await until(() => [...sel.options].some((o) => o.value === 'Office'));
    set(sel, 'Office');
    expect(countOf(d, 'Plot & publish')).toBe('1');
    await press(d, 'OK');
    expect(plotPrinter()).toBe('Office');
    setPlotPrinter('');
  });

  it('Options: Files & saving shows the four folders from the desktop app, Change… asks and reads again; a browser shows only a note', async () => {
    let projects = '/plans/Projects';
    const showFolder = vi.fn(async () => '');
    (window as unknown as { lvds: Record<string, unknown> }).lvds.settings = { get: vi.fn(async () => ({ projectsFolder: projects })), showFolder };
    (window as unknown as { lvds: Record<string, unknown> }).lvds.database = { open: vi.fn(async () => '') };
    const chooseProjects = vi.fn(async () => { projects = '/data/Plans'; });
    act(() => root.render(<Host extra={{ folders: { chooseProjects, chooseDatabase: async () => {} } }} />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Files & saving');
    const grp = (name: string) => d.querySelector(`[role="group"][aria-label="${name}"]`) as HTMLElement;
    await until(() => grp('Projects').textContent!.includes('/plans/Projects'));
    expect(grp('LV Database').textContent).toContain('/plans/Projects/LV Database');
    expect(grp('Block library').textContent).toContain('Not set');
    expect(grp('Recovery copies').textContent).toContain('App data › recovery');
    expect(grp('Block library').textContent).not.toContain('Change…'); // no chooser without the desktop CAD bridge
    expect((grp('Block library').querySelector('button.cad-dlg-ib') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { (grp('Recovery copies').querySelector('button.cad-dlg-ib') as HTMLButtonElement).click(); });
    expect(showFolder).toHaveBeenCalledWith('recovery');
    await act(async () => { ([...grp('Projects').querySelectorAll('button')].find((b) => b.textContent === 'Change…') as HTMLButtonElement).click(); });
    expect(chooseProjects).toHaveBeenCalled();
    await until(() => grp('Projects').textContent!.includes('/data/Plans'));
    expect(d.textContent).toContain('A folder changes at once, without OK.');
  });

  it('Options: without the desktop app Files & saving shows only a note in place of the folders', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Files & saving');
    expect(d.textContent).toContain('Folders belong to the desktop app.');
    expect(d.querySelector('[role="group"][aria-label="Projects"]')).toBeNull();
    set(field(d, 'Find a setting'), 'folder');
    expect(d.querySelector('.cad-dlg-hits')!.textContent).toContain('No setting matches');
  });

  // Options → Shortcuts & aliases: typed names and keys of the user's own.
  const rowOf = (d: HTMLElement, id: string) => d.querySelector(`[data-cmd="${id}"]`) as HTMLElement;
  const click = (el: Element) => act(async () => { (el as HTMLElement).click(); });
  const subOf = (d: HTMLElement, name: string) => [...d.querySelectorAll<HTMLButtonElement>('.cad-dlg-tabs [role="tab"]')].find((t) => t.textContent === name)!;
  const warn = (d: HTMLElement) => d.querySelector('[role="alert"]')?.textContent ?? '';
  const addName = async (d: HTMLElement, id: string, full: string, text: string) => {
    await click(rowOf(d, id).querySelector(`[aria-label="Add a typed name to ${full}"]`)!);
    const box = field(d, `New typed name for ${full}`);
    set(box, text);
    await keyOn(box, { key: 'Enter' });
  };
  const addKey = async (d: HTMLElement, id: string, full: string, init: KeyboardEventInit) => {
    await click(rowOf(d, id).querySelector(`[aria-label="Add a key to ${full}"]`)!);
    await keyOn(field(d, `Press a key for ${full}`), init);
  };

  it('Options: Shortcuts & aliases adds a typed name of your own, refuses one in use naming its command, and OK hands it to Preferences', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Shortcuts & aliases');
    expect(shownTab(d)).toEqual(['Shortcuts & aliases']);
    expect(subTab(d)).toBe('Typed names');
    expect(rowOf(d, 'CO').textContent).toContain('COPY');
    expect(rowOf(d, 'CO').querySelectorAll('.cad-dlg-al')).toHaveLength(3);
    await click(rowOf(d, 'CO').querySelector('[aria-label="Add a typed name to COPY"]')!);
    const box = field(d, 'New typed name for COPY');
    set(box, 'c');
    expect(box.value).toBe('C');
    expect(warn(d)).toBe('C is the typed name of CIRCLE. Choose another.');
    await keyOn(box, { key: 'Enter' });
    expect(rowOf(d, 'CO').querySelector('.cad-dlg-al.own')).toBeNull();
    expect(field(d, 'New typed name for COPY')).not.toBeNull();
    set(box, 'copy');
    expect(warn(d)).toBe('COPY is already a typed name of COPY.');
    set(box, 'cx');
    expect(warn(d)).toBe('');
    await keyOn(box, { key: 'Enter' });
    expect(rowOf(d, 'CO').querySelector('.cad-dlg-al.own')!.textContent).toContain('CX');
    expect(rowOf(d, 'CO').querySelector('[aria-label="Remove CX"]')).not.toBeNull();
    expect(rowOf(d, 'CO').className).toContain('chg');
    expect(countOf(d, 'Shortcuts & aliases')).toBe('1');
    await press(d, 'OK');
    expect(onPrefs.mock.calls[0][0].app).toMatchObject({ aliases: { CX: 'CO' }, keys: {} });
  });

  it('Options: a typed name of your own starts its command and shows in the suggestions', async () => {
    act(() => root.render(<Host extra={{ aliases: { CX: 'CO' } }} />));
    await flush();
    const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
    set(input, 'CX');
    expect(document.querySelector('[aria-label="Matching commands"]')?.textContent).toContain('CX');
    await command('CX');
    expect(state.tool).toBe('copy');
    await command('UNKNOWNX');
    expect(document.querySelector('.cad-hist')?.textContent).toMatch(/Unknown command "UNKNOWNX"/);
  });

  it('Options: Enter and Esc in the name box do not press OK or close the window', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Shortcuts & aliases');
    await click(rowOf(d, 'CO').querySelector('[aria-label="Add a typed name to COPY"]')!);
    const box = field(d, 'New typed name for COPY');
    set(box, 'zz');
    await keyOn(box, { key: 'Enter' });
    expect(opt()).not.toBeNull();
    expect(onPrefs).not.toHaveBeenCalled();
    await click(rowOf(d, 'CO').querySelector('[aria-label="Add a typed name to COPY"]')!);
    set(field(d, 'New typed name for COPY'), 'qq');
    await keyOn(field(d, 'New typed name for COPY'), { key: 'Escape' });
    expect(opt()).not.toBeNull();
    expect(d.querySelector('[aria-label="New typed name for COPY"]')).toBeNull();
    expect(rowOf(d, 'CO').textContent).not.toContain('QQ'); // Esc drops what was typed
    expect(onPrefs).not.toHaveBeenCalled();
    // Leaving the box any other way keeps a name that can be added (a click on OK must not lose it).
    await click(rowOf(d, 'CO').querySelector('[aria-label="Add a typed name to COPY"]')!);
    set(field(d, 'New typed name for COPY'), 'yy');
    await act(async () => { field(d, 'New typed name for COPY').blur(); });
    expect(d.querySelector('[aria-label="New typed name for COPY"]')).toBeNull();
    expect([...rowOf(d, 'CO').querySelectorAll('.cad-dlg-al.own')].map((x) => x.textContent!.replace('×', ''))).toEqual(['ZZ', 'YY']);
    // … but not one that is in use.
    await click(rowOf(d, 'CO').querySelector('[aria-label="Add a typed name to COPY"]')!);
    set(field(d, 'New typed name for COPY'), 'c');
    await act(async () => { field(d, 'New typed name for COPY').blur(); });
    expect(rowOf(d, 'CO').querySelectorAll('.cad-dlg-al.own')).toHaveLength(2);
  });

  it('Options: Shortcuts & aliases lists the standard keys, refuses a key in use or one a command cannot have, adds its own, and OK hands it to Preferences', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Shortcuts & aliases');
    await click(subOf(d, 'Keys'));
    expect(subTab(d)).toBe('Keys');
    expect(rowOf(d, 'ORTHO').textContent).toContain('F8');
    expect(rowOf(d, 'ORTHO').querySelector('.cad-dlg-al button')).toBeNull();
    expect(rowOf(d, 'PR').textContent).toContain('Ctrl+1');
    await addKey(d, 'L', 'LINE', { key: 'F8', bubbles: true });
    expect(warn(d)).toBe('F8 is the key of ORTHO. Choose another.');
    expect(state.toggles.ortho).toBe(false); // the key went no further than the button
    await keyOn(field(d, 'Press a key for LINE'), { key: 'a' });
    expect(warn(d)).toBe('Use F1 to F12, alone or with Ctrl, Alt or Shift, or Ctrl with a digit.');
    await keyOn(field(d, 'Press a key for LINE'), { key: 'F4' });
    expect(rowOf(d, 'L').querySelector('.cad-dlg-al.own')!.textContent).toContain('F4');
    expect(rowOf(d, 'L').querySelector('[aria-label="Remove F4"]')).not.toBeNull();
    expect(countOf(d, 'Shortcuts & aliases')).toBe('1');
    await press(d, 'OK');
    expect(onPrefs.mock.calls[0][0].app).toMatchObject({ aliases: {}, keys: { F4: 'L' } });
  });

  it('Options: a key of your own starts its command, but not while a field has text; a switch works while a command runs', async () => {
    act(() => root.render(<Host extra={{ keys: { F4: 'L', F5: 'ORTHO' } }} />));
    await flush();
    const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
    set(input, 'abc');
    await keyOn(input, { key: 'F4' });
    expect(state.tool).not.toBe('line');
    set(input, '');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4' })); });
    expect(state.tool).toBe('line');
    expect(state.toggles.ortho).toBe(false);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5' })); });
    expect(state.tool).toBe('line');
    expect(state.toggles.ortho).toBe(true);
  });

  it('Options: a standard key with Shift is the user\'s once they give it a command, and the standard switch as before when they do not', async () => {
    act(() => root.render(<Host extra={{ keys: { 'Shift+F8': 'C' } }} />));
    await flush();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', shiftKey: true })); });
    expect(state.tool).toBe('circle');
    expect(state.toggles.ortho).toBe(false); // not ORTHO's
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' })); });
    expect(state.toggles.ortho).toBe(true); // F8 alone stays ORTHO's
    const snap = state.toggles.snap;
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', shiftKey: true })); });
    expect(state.toggles.snap).toBe(!snap); // Shift+F9 has no command of the user's: SNAP, as before
  });

  it('Options: the filter narrows the rows; Reset all clears a tab\'s own entries, Reset page both; Changed lists them', async () => {
    act(() => root.render(<Host />));
    await flush();
    await command('OP');
    const d = opt();
    await openPage(d, 'Shortcuts & aliases');
    const total = d.querySelectorAll('.cad-dlg-tbody .cad-dlg-tr').length;
    expect(total).toBeGreaterThan(100);
    set(field(d, 'Filter commands'), 'copy');
    const some = d.querySelectorAll('.cad-dlg-tbody .cad-dlg-tr').length;
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(total);
    expect(rowOf(d, 'CO')).not.toBeNull();
    expect((d.querySelector('.cad-dlg-btns button') as HTMLButtonElement).disabled).toBe(true);
    await addName(d, 'CO', 'COPY', 'CX');
    await click(subOf(d, 'Keys'));
    await addKey(d, 'CO', 'COPY', { key: 'F4' });
    expect(countOf(d, 'Shortcuts & aliases')).toBe('2');
    await click(pageTab(d, 'Changed'));
    expect(d.textContent).toContain('Typed names of your own');
    expect(d.textContent).toContain('Keys of your own');
    expect(d.textContent).toContain('1 added');
    await openPage(d, 'Shortcuts & aliases');
    await press(d, 'Reset all');
    expect(countOf(d, 'Shortcuts & aliases')).toBe('1');
    await click(subOf(d, 'Typed names'));
    expect(rowOf(d, 'CO').querySelector('.cad-dlg-al.own')).not.toBeNull();
    await press(d, 'Reset page');
    expect(countOf(d, 'Shortcuts & aliases')).toBe('');
    expect(rowOf(d, 'CO').querySelector('.cad-dlg-al.own')).toBeNull();
  });

  it('DYN turns dynamic input on and off as F12 does; HISTORY opens the command history as F2 does', async () => {
    act(() => root.render(<Host />));
    await flush();
    expect(state.toggles.dyn).toBe(true);
    await command('DYN');
    expect(state.toggles.dyn).toBe(false);
    await command('DYNMODE');
    expect(state.toggles.dyn).toBe(true);
    expect(document.querySelector('[aria-label="Command history (F2)"]')).toBeNull();
    await command('HISTORY');
    expect(document.querySelector('[aria-label="Command history (F2)"]')).not.toBeNull();
    await command('HISTORY');
    expect(document.querySelector('[aria-label="Command history (F2)"]')).toBeNull();
  });

  it('WBLOCK saves the objects picked as a DXF of their own; with none picked it says what to do', async () => {
    const saveBinary = vi.fn(async () => '/plans/objects.dxf');
    (window as unknown as { lvds: { files?: unknown } }).lvds.files = { saveBinary };
    act(() => root.render(<Host />));
    await flush();
    await command('WBLOCK');
    expect(document.querySelector('.cad-hist')?.textContent).toMatch(/WBLOCK {2}Pick the drawn objects/);
    act(() => state.toggle('osnap'));
    await command('rec');
    await clickAt(6000, 6000);
    await clickAt(9000, 8000);
    act(() => state.setTool('none'));
    await dragWindow([5000, 5000], [10000, 9000]);
    await command('WBLOCK');
    await flush();
    await until(() => saveBinary.mock.calls.length > 0);
    const out = (saveBinary.mock.calls[0] as unknown as [{ defaultName: string; bytes: Uint8Array }])[0];
    expect(out.defaultName).toBe('sample-villa-gf - objects.dxf');
    const back = await openDrawing('objects.dxf', out.bytes);
    expect(back.info.layers.find((l) => l.name === 'LV-SKETCH')?.count).toBe(4);
    expect(back.info.segments).toBe(4);
  });
});

describe('Design CAD properties dock', () => {
  const dock = () => document.querySelector('.cad-dock') as HTMLElement;
  const head = () => document.querySelector('.cad-dock-h')?.textContent ?? '';
  const info = () => document.querySelector('.cad-info') as HTMLElement;
  const press = (label: string) => act(() => { (document.querySelector(`.cad-dock button[aria-label="${label}"]`) as HTMLButtonElement).click(); });

  it('stands left of the drawing and shows what is picked: nothing, the architect\'s object, a device', async () => {
    act(() => root.render(<Host />));
    await flush();
    expect(document.querySelector('.cad-work')!.firstElementChild).toBe(dock());
    expect(dock().className).toContain('left');
    expect(head()).toContain('No selection');
    expect(document.querySelector('.cad-work')!.lastElementChild).toBe(info()); // the drawing in its own column
    expect(info().textContent).toContain('sample-villa-gf.dxf');
    expect(info().textContent).toContain('Layers');
    expect(dock().textContent).not.toContain('sample-villa-gf.dxf'); // not mixed into the properties
    expect(dock().textContent).not.toContain('All on');
    expect(dock().querySelector('[aria-label="Properties palette"]')).not.toBeNull(); // defaults for new objects
    await clickAt(6687.5 + 190, 7375); // the architect's light block
    expect(head()).toContain('Block · L1');
    expect(dock().textContent).toMatch(/LayerE-LIGHT/);
    await until(() => dock().querySelector('[aria-label="Properties palette"]') !== null); // it stands in as a drawn object: editable (the first edit takes it over)
    act(() => state.toggle('osnap'));
    act(() => { state.setDevice('camera'); state.setTool('dev'); });
    await clickAt(5000, 5000);
    act(() => state.setTool('none'));
    await clickAt(5000, 5000);
    expect(head()).toMatch(/Camera/i);
    expect(dock().textContent).toMatch(/Room/);
    expect(dock().textContent).toMatch(/Position/);
  });

  it('folds to a strip and opens again; docks on the right and remembers it', async () => {
    act(() => root.render(<Host />));
    await flush();
    press('Fold the properties palette');
    expect(dock().className).toContain('folded');
    press('Show the properties palette');
    expect(dock().className).not.toContain('folded');
    press('Dock on the right');
    expect(document.querySelector('.cad-work')!.lastElementChild).toBe(dock());
    expect(document.querySelector('.cad-work')!.firstElementChild).toBe(info()); // the drawing column swaps over
    expect(JSON.parse(localStorage.getItem('lvds.cad.dock')!)).toMatchObject({ side: 'right' });
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(<Host />));
    await flush();
    expect(dock().className).toContain('right');
  });
});

describe('title block drawing (Project → Title block → Edit in CAD)', () => {
  const drawn: TitleTemplate = {
    id: 'tb-d', name: 'ACME', kind: 'drawn', cols: [], rows: [], cells: [], size: { w: 180, h: 44 },
    shapes: [{ kind: 'line', x1: 0, y1: 0, x2: 180, y2: 0 }, { kind: 'line', x1: 0, y1: 44, x2: 180, y2: 44 }, { kind: 'line', x1: 0, y1: 0, x2: 0, y2: 44 }, { kind: 'line', x1: 180, y1: 0, x2: 180, y2: 44 }],
    texts: [{ id: 't1', x: 5, y: 40, h: 2.5, text: 'ACME CONSULTANTS' }, { id: 't2', x: 100, y: 40, h: 3.5, text: '{SheetNo}', tag: 'DWG_NO' }]
  };
  it('opens the block at 1 : 1 mm, places a field from the palette at a click, and TBSAVE writes the drawing back into the template', async () => {
    const r = openTitleBlockInCad({ ...villa, titleTemplates: [drawn] }, drawn);
    act(() => root.render(<Host start={r.project} />));
    await flush();
    const v = await openDrawing(r.file, new TextEncoder().encode(r.dxf));
    act(() => state.open(v));
    await flush();
    expect(state.view?.file).toBe(r.file);
    expect(state.view?.info.units).toBe(4);
    await until(() => !!button('Save as template'));
    // A field chip starts the text tool with the field preset; the next click places it on TB-FIELD at 2.5 mm.
    const chip = [...document.querySelectorAll('button')].find((b) => b.textContent === '{Rev}')!;
    await act(async () => { chip.click(); });
    expect(state.tool).toBe('text');
    await clickAt(300, 30);
    await flush();
    const p1 = onChange.mock.calls[onChange.mock.calls.length - 1][0] as Project;
    const placed = sketchOf(p1, r.file).find((it) => it.text === '{Rev}');
    expect(placed).toMatchObject({ kind: 'text', layer: TB_LAYERS.field, h: 2.5 });
    expect(placed!.pts[0].map(Math.round)).toEqual([300, 30]);
    // Back into the template: its size from the drawn outline, the new field among its texts.
    await command('TBSAVE');
    await flush();
    const p2 = onChange.mock.calls[onChange.mock.calls.length - 1][0] as Project;
    const saved = p2.titleTemplates!.find((t) => t.id === 'tb-d')!;
    expect(saved.size).toEqual({ w: 180, h: 44 });
    expect(saved.texts!.map((t) => t.text).sort()).toEqual(['ACME CONSULTANTS', '{Rev}', '{SheetNo}']);
    expect(saved.texts!.find((t) => t.text === '{SheetNo}')).toMatchObject({ tag: 'DWG_NO' });
    expect(saved.texts!.find((t) => t.text === '{Rev}')).toMatchObject({ x: 90, y: 14, h: 2.5 });
  });
});

describe('clipboard of drawn objects', () => {
  const GF = 'sample-villa-gf.dxf', X = 200000;
  const start: Project = { ...villa, cadSketch: [{ file: GF, items: [
    { id: 'S1', kind: 'line', layer: 'LV-SKETCH', pts: [[X, 0], [X + 4000, 0]] },
    { id: 'S2', kind: 'circle', layer: 'E-POWER', pts: [[X + 2000, 1000]], r: 500 }
  ] }], cadLayerStyle: { [GF]: { 'E-POWER': { color: '1', lw: 0.35 } } } };
  const key = (k: string, mods: KeyboardEventInit = {}, on: Element = document.body) => act(() => { on.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true, ...mods })); });
  const said = () => state.history[state.history.length - 1];
  const tabOf = (name: string) => [...document.querySelectorAll('.cad-tab')].find((t) => t.textContent?.includes(name))!.querySelector('[role="tab"]') as HTMLButtonElement;
  beforeEach(() => clearClip());

  it('Ctrl+C copies the drawn objects picked; Ctrl+V pastes them into another drawing in one change, with the layer and its style', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    await key('v');
    expect(said()).toBe('PASTECLIP  Nothing copied yet: pick drawn objects and press Ctrl+C.');
    await key('c');
    expect(said()).not.toMatch(/COPYCLIP/); // nothing picked: the page's own text copy
    await dragWindow([X - 600, -600], [X + 4600, 1600]);
    await key('c');
    expect(said()).toBe('COPYCLIP  2 objects copied');
    await act(async () => { (document.querySelector('.cad-tab-add') as HTMLButtonElement).click(); });
    await flush();
    expect(state.view?.file).toBe('plan.dwg');
    const calls = onChange.mock.calls.length;
    await key('v');
    expect(said()).toContain('PASTECLIP  Specify insertion point:');
    const [x0, y0, x1, y1] = state.view!.info.extents;
    await clickAt((x0 + x1) / 2, (y0 + y1) / 2);
    expect(onChange.mock.calls.length).toBe(calls + 1);
    expect(onChange.mock.calls[calls][1]).toMatch(/^PASTECLIP {2}2 objects pasted · layer E-POWER added · ⌘Z to undo$/);
    const pasted = sketchOf(project, 'plan.dwg');
    expect(pasted.map((x) => x.kind)).toEqual(['line', 'circle']);
    expect(new Set([...sketchOf(project, GF), ...pasted].map((x) => x.id)).size).toBe(4);
    expect(project.cadLayerStyle?.['plan.dwg']?.['E-POWER']).toEqual({ color: '1', lw: 0.35 });
    // PASTEORIG: the same coordinates, here as it is another drawing; refused in the drawing they came from.
    await command('pasteorig');
    expect(sketchOf(project, 'plan.dwg')).toHaveLength(4);
    await act(async () => { tabOf(GF).click(); });
    await flush();
    await command('pasteorig');
    expect(said()).toBe('PASTEORIG  Not in the drawing the objects came from — use PASTECLIP.');
    expect(sketchOf(project, GF)).toHaveLength(2);
  });

  it('Ctrl+Shift+C asks for the base point; Ctrl+V in the command line is the field\'s own', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    await dragWindow([X - 600, -600], [X + 4600, 1600]);
    await key('C', { shiftKey: true });
    expect(said()).toContain('COPYBASE  Specify base point:');
    await clickAt(X, 0);
    expect(state.history).toContain('COPYBASE  2 objects copied');
    const input = document.querySelector('input[aria-label="Command"]')!;
    await key('v', {}, input);
    expect(state.tool).toBe('none');
    await key('v');
    expect(state.tool).toBe('paste');
    const calls = onChange.mock.calls.length;
    await clickAt(X + 10000, 5000);
    expect(onChange.mock.calls.length).toBe(calls + 1);
    const line = sketchOf(project, GF).filter((x) => x.kind === 'line')[1];
    expect(line.pts[0][0]).toBeCloseTo(X + 10000, -1);
    expect(line.pts[1][0] - line.pts[0][0]).toBeCloseTo(4000, 6);
  });
});

describe('CAD 2D gap plan: zoom, quick select and radial / angular dimensions', () => {
  const last = () => state.history[state.history.length - 1];
  const rest = () => act(async () => { await new Promise((r) => setTimeout(r, 450)); });
  const chip = () => document.querySelector('.zoom-chip')!.textContent;
  const setSelect = (label: string, value: string) => act(() => {
    const el = document.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const X = 200000, F = 'sample-villa-gf.dxf';

  it('ZOOM Window, Scale and Previous move the view; the zoom chip shows the zoom and opens the menu', async () => {
    act(() => root.render(<Host />));
    await flush();
    expect(chip()).toBe('100 %');
    await rest(); // the fitted view goes into the history once it rests
    await command('z');
    expect(last()).toContain('ZOOM  [Window/Previous/Scale/Extents] <Window>:');
    await command('w');
    expect(last()).toContain('ZOOM  First corner:');
    const [x0, y0, x1, y1] = state.view!.info.extents, w = x1 - x0, h = y1 - y0;
    await command(`${x0 + w / 4},${y0 + h / 4}`);
    expect(last()).toContain('ZOOM  Opposite corner:');
    await command(`${x0 + w / 2},${y0 + h / 2}`);
    // A quarter of the drawing fills the view: 4 × the fit (which keeps a 0.92 margin).
    await until(() => chip() === '435 %');
    expect(state.tool).toBe('none');
    await rest();
    await command('z s');
    expect(last()).toContain('ZOOM  Scale factor (2, 0.5 or 2x):');
    await command('abc');
    expect(last()).toContain('A factor such as');
    await command('2x');
    await until(() => chip() === '870 %');
    await rest();
    await command('zoom scale');
    await command('2'); // of the whole drawing
    await until(() => chip() === '200 %');
    await rest();
    await command('z p');
    await until(() => chip() === '870 %');
    await rest();
    // The chip's menu: ▾ opens it, Previous steps back again.
    act(() => (document.querySelector('[aria-label="Zoom menu"]') as HTMLButtonElement).click());
    expect([...document.querySelectorAll('.zoom-chip-menu [role="menuitem"]')].map((b) => b.textContent)).toEqual(['WindowZ W', 'PreviousZ P', 'Scale…Z S', 'ExtentsZE']);
    act(() => (document.querySelector('.zoom-chip-menu [role="menuitem"]:nth-child(2)') as HTMLButtonElement).click());
    await until(() => chip() === '435 %');
    await rest();
    await command('z p');
    await until(() => chip() === '100 %');
    await rest();
    await command('z p');
    expect(last()).toContain('ZOOM  No previous view');
    // A window dragged: the same.
    await command('z w');
    await dragWindow([x0 + w / 4, y0 + h / 4], [x0 + w / 2, y0 + h / 2]);
    await until(() => chip() === '435 %');
  });

  it('QSELECT picks drawn objects by kind, layer and a measure through its dialog; SELECTSIMILAR those like the ones picked', async () => {
    const start: Project = { ...villa, cadSketch: [{ file: F, items: [
      { id: 'S1', kind: 'line', layer: 'LV-SKETCH', pts: [[X, 0], [X + 1000, 0]] },
      { id: 'S2', kind: 'line', layer: 'LV-SKETCH', pts: [[X, 500], [X + 2000, 500]] },
      { id: 'S3', kind: 'line', layer: 'LV-ANNO', pts: [[X, 1000], [X + 1000, 1000]] },
      { id: 'C1', kind: 'circle', layer: 'LV-SKETCH', pts: [[X + 5000, 0]], r: 300 },
      { id: 'T1', kind: 'text', layer: 'LV-ANNO', pts: [[X, 3000]], text: 'DB-1', h: 250 }
    ] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('qs');
    await until(() => !!document.querySelector('[aria-label="Quick select"]'));
    expect([...document.querySelectorAll('[aria-label="Object type"] option')].map((o) => o.textContent)).toEqual(['Multiple (5)', 'Line (3)', 'Circle (1)', 'Text (1)']);
    setSelect('Object type', 'Line');
    expect([...document.querySelectorAll('[aria-label="Property"] option')].map((o) => o.textContent)).toEqual(['Layer', 'Colour', 'Linetype', 'Lineweight', 'Start X', 'Start Y', 'End X', 'End Y', 'Length', 'Angle']);
    expect([...document.querySelectorAll('[aria-label="Value"] option')].map((o) => o.textContent)).toEqual(['LV-ANNO', 'LV-SKETCH']);
    setSelect('Value', 'LV-SKETCH');
    expect(document.querySelector('.cad-dlg-ft .m')!.textContent).toBe('2 objects');
    act(() => button('OK').click());
    expect(last()).toBe('QSELECT  2 objects selected');
    await until(() => document.querySelector('.cad-ctx-what')?.textContent === '2 selected');
    // Lines longer than 1.5 m: the one of 2 m.
    await command('qselect');
    await until(() => !!document.querySelector('[aria-label="Quick select"]'));
    setSelect('Object type', 'Line'); setSelect('Property', 'len'); setSelect('Operator', '>');
    await act(async () => {
      const el = document.querySelector('[aria-label="Value"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '1.5'); el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.querySelector('.cad-dlg-ft .m')!.textContent).toBe('1 object');
    act(() => button('OK').click());
    expect(last()).toBe('QSELECT  1 object selected');
    expect(state.selected).toBe('sk:S2');
    // SELECTSIMILAR with S1 picked: every line on LV-SKETCH.
    act(() => state.setSelected(null));
    await clickAt(X + 500, 0);
    expect(state.selected).toBe('sk:S1');
    await command('selectsimilar');
    expect(state.history.slice(-3)).toContain('SELECTSIMILAR  2 objects selected');
    expect(state.tool).toBe('none');
    expect(document.querySelector('.cad-ctx-what')?.textContent).toBe('2 selected');
    // With nothing picked: it asks, S sets what else to match, a click picks the pattern, Enter selects.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); // clears the picks
    await command('selectsimilar');
    expect(last()).toContain('SELECTSIMILAR  Select objects or [Settings]:');
    await command('s');
    expect(last()).toContain('Also match [Colour/Linetype/Both/None] <None>:');
    await command('c');
    await clickAt(X + 500, 1000);
    expect(last()).toContain('SEL  1 object selected — Enter when done');
    await command('');
    expect(state.history.slice(-3)).toContain('SELECTSIMILAR  1 object selected');
    expect(state.selected).toBe('sk:S3');
  });

  it('DIMRADIUS, DIMDIAMETER and DIMANGULAR draw dimensions from a circle, two lines, or a vertex and two points', async () => {
    const start: Project = { ...villa, cadSketch: [{ file: F, items: [
      { id: 'C1', kind: 'circle', layer: 'LV-SKETCH', pts: [[X, 0]], r: 500 },
      { id: 'L1', kind: 'line', layer: 'LV-SKETCH', pts: [[X + 5000, 0], [X + 7000, 0]] },
      { id: 'L2', kind: 'line', layer: 'LV-SKETCH', pts: [[X + 5000, 0], [X + 5000, 2000]] }
    ] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const dims = () => project.cadSketch![0].items.filter((it) => it.kind === 'dim');
    await command('dra');
    expect(last()).toContain('DIMRADIUS  Select arc or circle:');
    await command(`${X + 2000},2000`);
    expect(last()).toContain('No arc or circle there');
    await command(`${X + 500},0`);
    expect(last()).toContain('DIMRADIUS  Dimension line location:');
    await command(`${X + 200},0`);
    expect(dims().length).toBe(1);
    const r = dims()[0];
    expect(r.dimKind).toBe('radius');
    expect(r.pts.map((q) => q.map(Math.round))).toEqual([[X, 0], [X + 500, 0], [X + 200, 0]]);
    expect(dimLabel(r, 0.001).startsWith('R')).toBe(true);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe(`Radius dimension ${dimLabel(r, 0.001)} · ⌘Z to undo`);
    expect(last()).toContain('DIMRADIUS  Select arc or circle:'); // ready for the next
    await command('ddi');
    await command(`${X},500`);
    await command(`${X},900`);
    const d = dims()[1];
    expect(d.dimKind).toBe('diameter');
    expect(dimMeasure(d)).toBeCloseTo(1000, 6);
    expect(dimLabel(d, 0.001).startsWith('Ø')).toBe(true);
    // Two lines: the vertex where they cross, the angle towards the ends clicked, the arc inside the corner.
    await command('dan');
    expect(last()).toContain('DIMANGULAR  Select arc, circle, line or <specify vertex>:');
    await command(`${X + 6000},0`);
    expect(last()).toContain('DIMANGULAR  Select second line:');
    await command(`${X + 5000},1000`);
    expect(last()).toContain('DIMANGULAR  Dimension arc line location:');
    await command(`${X + 5500},500`);
    const a = dims()[2];
    expect(a.dimKind).toBe('angular');
    expect(a.pts.map((q) => q.map(Math.round))).toEqual([[X + 5000, 0], [X + 7000, 0], [X + 5000, 2000], [X + 5500, 500]]);
    expect(dimMeasure(a)).toBeCloseTo(90, 6);
    expect(dimLabel(a, 0.001).endsWith('°')).toBe(true);
    // Enter: a vertex and two points; the arc placed on the far side measures the reflex angle.
    await command('');
    expect(last()).toContain('DIMANGULAR  Specify angle vertex:');
    await command(`${X + 9000},0`);
    expect(last()).toContain('Specify first angle endpoint:');
    await command(`${X + 10000},0`);
    expect(last()).toContain('Specify second angle endpoint:');
    await command(`${X + 9000},1000`);
    expect(last()).toContain('Dimension arc line location:');
    await command(`${X + 8500},500`);
    expect(dimMeasure(dims()[3])).toBeCloseTo(270, 6);
    // DCO goes on from the last linear dimension, not from these.
    await command('dco');
    await command(`${X + 12000},0`);
    expect(last()).toContain('No dimension on this drawing to go on from');
  });

  it('DIM takes its kind from what is clicked: a circle its diameter, an arc its radius, a line its length, aligned beside a sloping one (v2.273)', async () => {
    const start: Project = { ...villa, cadLayerFile: undefined, cadSketch: [{ file: F, items: [
      { id: 'C1', kind: 'circle', layer: 'LV-SKETCH', pts: [[X, 0]], r: 500 },
      { id: 'A1', kind: 'arc', layer: 'LV-SKETCH', pts: [[X + 3000, 0]], r: 400, a0: 0, a1: Math.PI },
      { id: 'L1', kind: 'line', layer: 'LV-SKETCH', pts: [[X + 5000, 0], [X + 7000, 0]] },
      { id: 'L2', kind: 'line', layer: 'LV-SKETCH', pts: [[X + 9000, 0], [X + 11000, 2000]] }
    ] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap')); // no snaps: a click on an object picks it
    const dims = () => project.cadSketch![0].items.filter((it) => it.kind === 'dim');
    await command('dim');
    expect(last()).toContain('DIM  Select a line, arc or circle, or specify first extension line origin:');
    await clickAt(X + 500, 0);
    expect(last()).toBe('DIM  Diameter of the circle: dimension line location:');
    await clickAt(X + 200, 300);
    expect(dims()[0]).toMatchObject({ dimKind: 'diameter', layer: 'LV-ANNO' });
    expect(dimMeasure(dims()[0])).toBeCloseTo(1000, 6);
    expect(last()).toBe('DIM  Select a line, arc or circle, or specify first extension line origin:'); // ready for the next
    await clickAt(X + 3000, 400);
    expect(last()).toBe('DIM  Radius of the arc: dimension line location:');
    await clickAt(X + 3200, 200);
    expect(dims()[1].dimKind).toBe('radius');
    expect(dimMeasure(dims()[1])).toBeCloseTo(400, 6);
    await clickAt(X + 6000, 0);
    expect(last()).toBe('DIM  The line picked: dimension line location:');
    await clickAt(X + 6000, 800);
    expect(dims()[2]).toMatchObject({ dir: 0 });
    expect(dims()[2].pts.slice(0, 2)).toEqual([[X + 5000, 0], [X + 7000, 0]]);
    expect(dimMeasure(dims()[2])).toBeCloseTo(2000, 6);
    await clickAt(X + 10000, 1000);
    await clickAt(X + 9500, 1500); // beside the sloping line: along it
    expect(dims()[3].dir).toBeUndefined();
    expect(dimMeasure(dims()[3])).toBeCloseTo(2000 * Math.SQRT2, 6);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('Aligned dimension 2.83 m · ⌘Z to undo');
    // Typed points are points even on a line; a horizontal pair gives a horizontal dimension.
    await command(`${X + 5000},0`);
    expect(last()).toBe('DIM  Specify second extension line origin:');
    await command(`${X + 6000},0`);
    await clickAt(X + 5500, -600);
    expect(dimMeasure(dims()[4])).toBeCloseTo(1000, 6);
    // DAL: always along the two points.
    await command('dal');
    expect(last()).toContain('DIMALIGNED  Specify first extension line origin:');
    await command(`${X},3000`); await command(`${X + 3000},7000`); await clickAt(X, 7000);
    expect(dims()[5].dir).toBeUndefined();
    expect(dimMeasure(dims()[5])).toBeCloseTo(5000, 6);
  });

  it('DIMLAYER sets where new dimensions go; DIMSTYLE R makes a style current, DIMSTYLE A gives it to the dimensions picked (v2.273)', async () => {
    const styles = { styles: [{ name: 'Standard' }, { name: 'LV 1:100', arrow: 'filled', arrowMm: 3, textMm: 2.5, offsetMm: 1, extendMm: 2, decimals: 0, unit: 'mm' }], current: 'Standard' } as Project['cadDimStyles'];
    const start: Project = { ...villa, cadLayerFile: undefined, cadDimStyles: styles, cadSketch: [{ file: F, items: [] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const dims = () => project.cadSketch![0].items.filter((it) => it.kind === 'dim');
    const dimAt = async (y: number) => { await command('dli'); await command(`${X},${y}`); await command(`${X + 2000},${y}`); await command(`${X + 1000},${y + 500}`); await command(''); };
    await command('DIMLAYER');
    expect(last()).toContain('DIMLAYER  New dimensions go on LV-ANNO.');
    await command('DIMLAYER NOPE');
    expect(last()).toBe('DIMLAYER  There is no layer NOPE. Add it with New layer in the layer palette (LM).');
    await command('DIMLAYER .');
    expect(Object.values(project.cadLayerFile!)[0].dimLayer).toBe('.');
    await dimAt(0);
    expect(dims()[0]).toMatchObject({ layer: 'LV-SKETCH' }); // the current layer
    await command('DIMLAYER LV-ANNO');
    expect(project.cadLayerFile).toBeUndefined(); // as before: nothing kept
    await command('DIMSTYLE R LV 1:100');
    expect(project.cadDimStyles!.current).toBe('LV 1:100');
    await dimAt(3000);
    expect(dims()[1]).toMatchObject({ layer: 'LV-ANNO', dimStyle: 'LV 1:100', look: { unit: 'mm', decimals: 0 } });
    expect(dimLabel(dims()[1], 0.001)).toBe('2000');
    await command('DIMSTYLE A');
    expect(last()).toBe('DIMSTYLE  Pick the dimensions first, then Update (DIMSTYLE A).');
    await command('SELECTALL');
    await command('DIMSTYLE A Standard');
    expect(dims().map((d) => d.dimStyle)).toEqual([undefined, undefined]);
    await command('DIMSTYLE A');
    expect(dims().map((d) => d.dimStyle)).toEqual(['LV 1:100', 'LV 1:100']);
    expect(dims()[0].text).toBeUndefined(); // its length in metres, drawn before a style, now measured by the style
    await command('DIMSTYLE R NOPE');
    expect(last()).toBe('DIMSTYLE  There is no dimension style NOPE. D opens the styles.');
  });

  it('QDIM dimensions a pick in one row: Baseline or Continuous, horizontal above it, each place once (v2.305)', async () => {
    const start: Project = { ...villa, cadLayerFile: undefined, cadSketch: [{ file: F, items: [
      { id: 'L1', kind: 'line', layer: 'LV-SKETCH', pts: [[X, 0], [X + 6000, 0]] },
      { id: 'C1', kind: 'circle', layer: 'LV-SKETCH', pts: [[X + 2000, 1000]], r: 300 },
      { id: 'L2', kind: 'line', layer: 'LV-SKETCH', pts: [[X + 4000, 0], [X + 4000, 2000]] }
    ] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const dims = () => project.cadSketch![0].items.filter((it) => it.kind === 'dim');
    await command('qdim');
    expect(last()).toContain('QDIM  Select geometry to dimension:');
    await clickAt(X + 500, 0); await clickAt(X + 2300, 1000); await clickAt(X + 4000, 1000);
    expect(last()).toBe('QDIM  3 objects selected — Enter when done');
    await command('');
    expect(last()).toBe('QDIM  Specify dimension line position, or [Continuous/Baseline] <Continuous>:');
    await command('B');
    expect(last()).toBe('QDIM  Specify dimension line position, or [Continuous/Baseline] <Baseline>:');
    await clickAt(X + 3000, 3000);
    expect(dims().map((d) => Math.round(dimMeasure(d)))).toEqual([2000, 4000, 6000]);
    expect(dims().every((d) => d.dir === 0 && d.layer === 'LV-ANNO')).toBe(true);
    const ys = dims().map((d) => d.pts[2][1]);
    expect(ys[0]).toBeCloseTo(3000, 6);
    expect(ys[1]).toBeGreaterThan(ys[0]); expect(ys[2] - ys[1]).toBeCloseTo(ys[1] - ys[0], 6);
    expect(dims()[1].pts[1]).toEqual([X + 4000, 2000]); // of the two points at X + 4000, the one nearer the line
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('QDIM  3 dimensions, baseline · ⌘Z to undo');
    // The way it lays the row is kept; Continuous chains them, below the pick.
    await command('qdim');
    await clickAt(X + 500, 0); await clickAt(X + 4000, 1000); await command('');
    expect(last()).toBe('QDIM  Specify dimension line position, or [Continuous/Baseline] <Baseline>:');
    await command('C'); await clickAt(X + 3000, -1500);
    expect(dims().slice(3).map((d) => Math.round(dimMeasure(d)))).toEqual([4000, 2000]);
    for (const d of dims().slice(3)) expect(d.pts[2][1]).toBeCloseTo(-1500, 6);
    // Enter with nothing picked ends it; a pick with nothing to measure says so.
    await command('qdim'); await command('');
    expect(last()).not.toContain('QDIM  Specify dimension line position');
  });

  it('DIMSPACE spaces the dimensions picked out from the base: a gap in metres, or Auto, leaving others (v2.305)', async () => {
    const lin = (id: string, y: number): SketchItem => ({ id, kind: 'dim', layer: 'LV-ANNO', pts: [[X, 0], [X + 2000, 0], [X, y]], dir: 0, h: 250 });
    const start: Project = { ...villa, cadLayerFile: undefined, cadSketch: [{ file: F, items: [
      lin('D1', 1000), lin('D2', 2500), lin('D3', 6000),
      { id: 'V1', kind: 'dim', layer: 'LV-ANNO', pts: [[X + 9000, 0], [X + 9000, 2000], [X + 10000, 0]], dir: Math.PI / 2, h: 250 }
    ] }] };
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    const yOf = (id: string) => project.cadSketch![0].items.find((it) => it.id === id)!.pts[2][1];
    await command('dimspace');
    expect(last()).toContain('DIMSPACE  Select base dimension:');
    await clickAt(X + 1000, 1000);
    expect(last()).toBe('DIMSPACE  Select dimensions to space:');
    await clickAt(X + 1000, 2500); await clickAt(X + 1000, 6000); await clickAt(X + 10000, 1000);
    expect(last()).toBe('DIMSPACE  3 objects selected — Enter when done');
    await command('');
    expect(last()).toBe('DIMSPACE  Enter value or [Auto] <Auto>:');
    await command('0.7');
    expect([yOf('D1'), yOf('D2'), yOf('D3')]).toEqual([1000, 1700, 2400]);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('DIMSPACE  2 dimensions spaced 0.70 m apart; 1 at another angle, or radial, left as it was · ⌘Z to undo');
    // Auto: twice the base's text (250 → 500).
    await command('dimspace'); await clickAt(X + 1000, 1000); await clickAt(X + 1000, 1700); await clickAt(X + 1000, 2400); await command(''); await command('');
    expect([yOf('D2'), yOf('D3')]).toEqual([1500, 2000]);
    // 0 lines them up with the base.
    await command('dimspace'); await clickAt(X + 1000, 1000); await clickAt(X + 1000, 1500); await clickAt(X + 1000, 2000); await command(''); await command('0');
    expect([yOf('D2'), yOf('D3')]).toEqual([1000, 1000]);
  });
});

describe('CAD 2D gap plan: TEXTEDIT, a double-click on a text or dimension to type over it', () => {
  const last = () => state.history[state.history.length - 1];
  const X = 200000, F = 'sample-villa-gf.dxf';
  const box = () => document.querySelector('input[aria-label="Edit text"]') as HTMLInputElement | null;
  const dblClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('dblclick', { clientX: sx, clientY: sy, button: 0, bubbles: true })); });
  };
  const rightClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); });
  };
  const typeBox = (text: string) => act(() => {
    const el = box()!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const keyBox = (key: string) => act(() => { box()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
  const items = () => sketchOf(project, F);
  // "DB ROOM" at (X, 0); a 3 m dimension of a style in mm above it; a text on a locked layer.
  const start: Project = { ...villa, cadSketch: [{ file: F, items: [
    { id: 'T1', kind: 'text', layer: 'LV-ANNO', pts: [[X, 0]], text: 'DB ROOM', h: 250 },
    { id: 'D1', kind: 'dim', layer: 'LV-ANNO', pts: [[X, 2000], [X + 3000, 2000], [X + 1500, 2500]], dir: 0, h: 200, look: { arrow: 'tick', size: 100, off: 50, ext: 80, unit: 'mm', decimals: 0 } },
    { id: 'T2', kind: 'text', layer: 'LV-LOCKED', pts: [[X, 4000]], text: 'FIXED', h: 250 }
  ] }], cadLayerStyle: { [F]: { 'LV-LOCKED': { lock: true } } } };

  it('a double-click opens the box over the text; Enter keeps what is typed in one undo step, Esc leaves it', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    expect(box()).toBeNull();
    await dblClickAt(X + 300, 100);
    expect(box()).not.toBeNull();
    expect(box()!.value).toBe('DB ROOM');
    expect(state.selected).toBe('sk:T1');
    expect(last()).toBe('TEXTEDIT  Type the text, Enter (Esc keeps it as it was):');
    // The box sits at the text: at the left end of its baseline, as high as the text on the screen, not turned.
    expect(box()!.style.transform).toBe('translateY(-100%) rotate(0rad)');
    const [sx, sy] = screenOf(X, 0);
    expect(parseFloat(box()!.style.left)).toBeCloseTo(sx, 0); expect(parseFloat(box()!.style.top)).toBeCloseTo(sy, 0);
    await typeBox('MAIN DB');
    await keyBox('Enter');
    expect(box()).toBeNull();
    expect(items()[0].text).toBe('MAIN DB');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('TEXTEDIT  Text "MAIN DB" · ⌘Z to undo');
    // Esc: nothing changes, and the page's Esc (which would drop the selection) is not reached.
    await dblClickAt(X + 300, 100);
    await typeBox('NOT THIS');
    await keyBox('Escape');
    expect(box()).toBeNull();
    expect(items()[0].text).toBe('MAIN DB');
    expect(state.selected).toBe('sk:T1');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last()).toBe('*Cancel*');
    // A click outside (the box losing focus) keeps what is typed; nothing typed, nothing changes.
    await dblClickAt(X + 300, 100);
    await act(async () => { box()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(box()).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
    // A double-click on empty drawing, or with a drawing tool running, opens nothing.
    await dblClickAt(X + 8000, 8000);
    expect(box()).toBeNull();
    await command('l');
    await dblClickAt(X + 300, 100);
    expect(box()).toBeNull();
  });

  it('ED (TEXTEDIT) picks the object; a dimension takes an override, <> standing for the measure, blank giving it back', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    await command('ed');
    expect(last()).toBe('Command: TEXTEDIT  Select a text or dimension:');
    await clickAt(X + 8000, 8000);
    expect(last()).toBe('TEXTEDIT  Nothing there. Select a text or dimension:');
    await clickAt(X + 1500, 2500);
    expect(box()!.value).toBe('');
    expect(last()).toBe('TEXTEDIT  Type the dimension\'s text (<> stands for the measured value; blank gives it back), Enter:');
    await typeBox('<> mm');
    await keyBox('Enter');
    expect(items()[1].text).toBe('<> mm');
    expect(dimLabel(items()[1], 0.001)).toBe('3000 mm');
    expect(onChange.mock.calls[0][1]).toBe('TEXTEDIT  Dimension text "<> mm" · ⌘Z to undo');
    // The tool stays for the next one; blank gives the measured value back.
    expect(state.tool).toBe('textedit');
    expect(last()).toBe('TEXTEDIT  Select a text or dimension:');
    await clickAt(X + 1500, 2500);
    expect(box()!.value).toBe('<> mm');
    await typeBox('');
    await keyBox('Enter');
    expect(items()[1].text).toBeUndefined();
    expect(onChange.mock.calls[1][1]).toBe('TEXTEDIT  Dimension measured again · ⌘Z to undo');
    expect(onChange).toHaveBeenCalledTimes(2);
    // A text on a locked layer is refused; Esc with no box ends the tool.
    await clickAt(X + 300, 4100);
    expect(box()).toBeNull();
    expect(last()).toBe('TEXTEDIT  Text on layer LV-LOCKED, which is locked: unlock it first (LAYULK).');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(state.tool).toBe('none');
    // ED with a text picked first opens its box at once.
    await clickAt(X + 300, 100);
    expect(state.selected).toBe('sk:T1');
    await command('ed');
    expect(box()!.value).toBe('DB ROOM');
    await keyBox('Escape');
  });

  it('the right-click menu of a text or dimension has Edit text', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    act(() => state.toggle('osnap'));
    await rightClickAt(X + 300, 100);
    const menu = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"][aria-label="Edit drawn objects"] > button')];
    expect(menu().map((b) => rowLabel(b))).toEqual(['Text tools', 'Clipboard', 'Undo', 'Redo', 'Erase', 'Move', 'Copy selection', 'Rotate', 'Draw order', 'Isolate', 'Pan', 'Zoom', 'Select similar', 'Invert selection', 'Deselect all', 'Quick select…', 'Count', 'Properties', 'Options…']);
    await act(async () => { menu()[0].click(); });
    const tools = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"][aria-label="Text tools"] button')];
    expect(tools().map((b) => rowLabel(b))).toEqual(['Edit text', 'Find and replace…', 'Justify', 'Text height', 'Case', 'Frame', 'Background mask', 'Add selected', 'Make block…']);
    await act(async () => { tools()[0].click(); });
    expect(box()!.value).toBe('DB ROOM');
    await keyBox('Escape');
    // A line's menu has none.
    await command('l');
    await clickAt(X, 6000);
    await clickAt(X + 2000, 6000);
    await command('');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); // the line tool ends
    await rightClickAt(X + 1000, 6000);
    expect(menu().map((b) => rowLabel(b))).not.toContain('Text tools');
    await act(async () => { menu()[0].click(); });
    expect([...document.querySelectorAll<HTMLButtonElement>('[role="menu"][aria-label="Line tools"] button')].map((b) => rowLabel(b))).not.toContain('Edit text');
  });
});

describe('CAD 2D gap plan: MTEXT, notes in a box with their lines wrapped to its width', () => {
  const last = () => state.history[state.history.length - 1];
  const X = 200000, F = 'sample-villa-gf.dxf';
  const editor = () => document.querySelector('.cad-ntedit') as HTMLDivElement | null;
  const words = () => document.querySelector('[aria-label="Note text"]') as HTMLDivElement | null;
  const items = () => sketchOf(project, F);
  const dblClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('dblclick', { clientX: sx, clientY: sy, button: 0, bubbles: true })); });
  };
  const rightClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); });
  };
  const keyWords = (key: string, more: KeyboardEventInit = {}) => act(() => { words()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...more })); });
  /** What is typed in the box: a block per line, a word in <b> or <u> for bold or underline (as the box keeps them). */
  const typeWords = (lines: (string | [string, 'b' | 'u'])[][]) => act(() => {
    const el = words()!;
    el.replaceChildren();
    for (const l of lines) {
      const d = document.createElement('div');
      for (const r of l) { if (typeof r === 'string') d.appendChild(document.createTextNode(r)); else { const e = document.createElement(r[1]); e.textContent = r[0]; d.appendChild(e); } }
      if (!l.length) d.appendChild(document.createElement('br'));
      el.appendChild(d);
    }
  });
  const setField = (label: string, value: string) => act(() => {
    // The editor's own field (the Properties palette has a Justify of its own for a note).
    const el = (document.querySelector(`.cad-ntedit [aria-label="${label}"]`) ?? document.querySelector(`[aria-label="${label}"]`)) as HTMLInputElement | HTMLSelectElement;
    if (el instanceof HTMLSelectElement) { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }
    else { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  const N1: SketchItem = { id: 'N1', kind: 'mtext', layer: 'LV-ANNO', pts: [[X, 6000]], h: 250, w: 3000, note: [{ runs: [{ s: 'GENERAL NOTES', b: true }] }, { runs: [{ s: 'LSZH cables' }] }] };
  // A note of two lines in a 3 m box at (X, 6000), and one on a locked layer below it.
  const start: Project = { ...villa, cadSketch: [{ file: F, items: [N1, { ...N1, id: 'N2', layer: 'LV-LOCKED', pts: [[X, 3000]] }] }], cadLayerStyle: { [F]: { 'LV-LOCKED': { lock: true } } } };

  it('MT: two corners (H and J first, if wanted) open the editor over the box; Ctrl/⌘+Enter draws the note in one undo step, Esc draws nothing', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await command('mt');
    expect(last()).toBe('Command: MTEXT  First corner:');
    await clickAt(X, 0);
    expect(last()).toBe('MTEXT  Opposite corner or [Height/Justify/Width]:');
    await command('j');
    expect(last()).toBe('MTEXT  Justify [TL/TC/TR/ML/MC/MR/BL/BC/BR] <TL>:');
    await command('tc');
    expect(last()).toBe('MTEXT  Opposite corner or [Height/Justify/Width]:');
    await command('h');
    expect(last()).toBe('MTEXT  Height on paper (mm) <2.5>:');
    await command('3.5');
    expect(editor()).toBeNull();
    await clickAt(X + 3000, -1000);
    expect(editor()).not.toBeNull();
    expect(last()).toBe('MTEXT  Type the note (Enter starts a new line); Ctrl/⌘+Enter or OK keeps it, Esc cancels:');
    // The bar shows the height and justification chosen; the box sits at the top left corner, 3 m wide, not turned.
    expect((document.querySelector('[aria-label="Height (mm on paper)"]') as HTMLInputElement).value).toBe('3.5');
    expect((document.querySelector('[aria-label="Justify"]') as HTMLSelectElement).value).toBe('TC');
    const [sx, sy] = screenOf(X, 0), [ex] = screenOf(X + 3000, 0);
    expect(parseFloat(editor()!.style.left)).toBeCloseTo(sx, 0); expect(parseFloat(editor()!.style.top)).toBeCloseTo(sy, 0);
    expect(parseFloat(editor()!.style.width)).toBeCloseTo(ex - sx, 0);
    expect(editor()!.style.transform).toBe('rotate(0rad)');
    await typeWords([[['GENERAL NOTES', 'b']], ['All cables to be ', ['LSZH', 'u'], ' unless noted'], []]);
    await keyWords('Enter', { metaKey: true });
    expect(editor()).toBeNull();
    expect(items().filter((it) => it.kind === 'mtext' && it.id === 'S1')).toEqual([{
      id: 'S1', kind: 'mtext', layer: 'LV-ANNO', pts: [[X + 1500, 0]], h: 350, w: 3000, just: 'TC',
      note: [{ runs: [{ s: 'GENERAL NOTES', b: true }] }, { runs: [{ s: 'All cables to be ' }, { s: 'LSZH', u: true }, { s: ' unless noted' }] }]
    }]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('Note · ⌘Z to undo');
    expect(state.tool).toBe('none');
    // Esc in the box: nothing drawn, the command ends.
    await command('mt');
    await clickAt(X, -5000);
    await clickAt(X + 2000, -6000);
    expect(editor()).not.toBeNull();
    await keyWords('Escape');
    expect(editor()).toBeNull();
    expect(state.history.slice(-2)[0]).toBe('*Cancel*');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(state.tool).toBe('none');
  });

  it('a double-click opens the note\'s words; the bar\'s height and justification apply with OK; Esc keeps it; EXPLODE gives a text per line', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await dblClickAt(X + 500, 5900);
    expect(editor()).not.toBeNull();
    expect(words()!.textContent).toBe('GENERAL NOTESLSZH cables');
    expect(words()!.querySelector('b')?.textContent).toBe('GENERAL NOTES');
    expect(state.selected).toBe('sk:N1');
    expect(last()).toBe('MTEXT  Type the note (Enter starts a new line); Ctrl/⌘+Enter or OK keeps it, Esc leaves it as it was:');
    await keyWords('Escape');
    expect(editor()).toBeNull();
    expect(items()[0]).toEqual(N1);
    expect(last()).toBe('*Cancel*');
    expect(onChange).toHaveBeenCalledTimes(0);
    await dblClickAt(X + 500, 5900);
    await setField('Justify', 'MC');
    await setField('Height (mm on paper)', '5');
    await act(async () => { button('OK').click(); });
    expect(editor()).toBeNull();
    const after = items()[0];
    expect([after.just, after.h, after.w, after.note]).toEqual(['MC', 500, 3000, N1.note]);
    // Justified middle centre, the anchor went to the centre of the 2-line box (250 + 416.7 high); taller letters then grow it about that centre.
    expect(after.pts[0][0]).toBeCloseTo(X + 1500); expect(after.pts[0][1]).toBeCloseTo(6000 - (250 + 1250 / 3) / 2, 6);
    expect(noteBox(after).lines.length).toBe(4);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('MTEXT  Note changed · ⌘Z to undo');
    // EXPLODE: the lines as drawn (wrapped at 3 m with 5 mm letters) become single-line texts.
    const lines = explodeNote(after);
    await command('x');
    await clickAt(X + 500, 5900);
    expect(last()).toBe(`EXPLODE  ${lines.length} texts · ⌘Z to undo`);
    expect(items().filter((it) => it.layer === 'LV-ANNO').map((it) => [it.kind, it.text])).toEqual(lines.map((l) => ['text', l.text]));
  });

  it('right-click on a note: Edit text, Width… (typed in metres) and Justify ▸; a note on a locked layer is refused', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    // The locked one: ED and a double-click both refuse it.
    await command('ed');
    await clickAt(X + 500, 2900);
    expect(last()).toBe('TEXTEDIT  Note on layer LV-LOCKED, which is locked: unlock it first (LAYULK).');
    expect(editor()).toBeNull();
    await dblClickAt(X + 500, 2900);
    expect(editor()).toBeNull();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(state.tool).toBe('none');
    await rightClickAt(X + 500, 5900);
    expect(menuRows('[aria-label="Edit drawn objects"]')).toEqual(['Repeat TEXTEDIT', 'Note tools', 'Clipboard', 'Undo', 'Redo', 'Erase', 'Move', 'Copy selection', 'Rotate', 'Draw order', 'Isolate', 'Pan', 'Zoom', 'Select similar', 'Invert selection', 'Deselect all', 'Quick select…', 'Count', 'Properties', 'Options…']);
    expect(menuRows('[aria-label="Note tools"]')).toEqual([]);
    await chooseMenu('Note tools', 'Width…');
    expect(last()).toBe('MTEXT  Width (m) <3.00>:');
    await command('4');
    expect(items()[0].w).toBe(4000);
    expect(items()[0].pts).toEqual([[X, 6000]]);
    expect(onChange.mock.calls[0][1]).toMatch(/^MTEXT {2}Note 4\.00 m wide/);
    await rightClickAt(X + 500, 5900);
    await chooseMenu('Note tools', 'Justify', 'Bottom right');
    expect(items()[0].just).toBe('BR');
    expect(noteBox(items()[0]).tl[0]).toBeCloseTo(X); expect(noteBox(items()[0]).tl[1]).toBeCloseTo(6000);
    expect(onChange).toHaveBeenCalledTimes(2);
    // Edit text opens the editor too.
    await rightClickAt(X + 500, 5900);
    await chooseMenu('Note tools', 'Edit text');
    expect(editor()).not.toBeNull();
    await keyWords('Escape');
    expect(editor()).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('CAD 2D gap plan: DRAWORDER and TEXTTOFRONT, the order the drawn objects paint in', () => {
  const last = () => state.history[state.history.length - 1];
  const X = 200000, F = 'sample-villa-gf.dxf';
  const order = () => sketchOf(project, F).map((it) => it.id).join('');
  const rightClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); });
  };
  const options = () => [...document.querySelectorAll('[role="menu"][aria-label="Draw order"] button')] as HTMLButtonElement[];
  // A solid hatch, a line beside it and a text over the hatch, drawn in that order (the text on top).
  const start: Project = { ...villa, cadSketch: [{ file: F, items: [
    { id: 'H', kind: 'pline', layer: 'LV-HATCH', closed: true, pts: [[X, 0], [X + 4000, 0], [X + 4000, 3000], [X, 3000]], hatch: { pattern: 'solid', scale: 3, angle: 0 } },
    { id: 'L', kind: 'line', layer: 'LV-SKETCH', pts: [[X + 5000, 0], [X + 8000, 0]] },
    { id: 'T', kind: 'text', layer: 'LV-ANNO', pts: [[X + 1000, 1000]], text: 'DB', h: 250 }
  ] }] };

  it('DR: pick the objects, Enter, then Front, Back, Above or Under (the reference clicked); one undo step each', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await command('dr');
    expect(last()).toBe('Command: DRAWORDER  Select objects:');
    await clickAt(X + 1100, 1100);
    await clickAt(X + 6000, 0);
    expect(last()).toBe('DRAWORDER  2 objects selected — Enter when done');
    await command('');
    expect(last()).toBe('DRAWORDER  [Above objects/Under objects/Front/Back] <Back>:');
    await command('b');
    expect(order()).toBe('LTH');
    expect(onChange.mock.calls[0][1]).toBe('DRAWORDER  2 objects sent to the back · ⌘Z to undo');
    expect(state.tool).toBe('none');
    // One object selected first: the options come at once; Above asks for the reference object.
    await clickAt(X + 1100, 1100);
    expect(state.selected).toBe('sk:T');
    await command('dr');
    expect(last()).toBe('Command: DRAWORDER  [Above objects/Under objects/Front/Back] <Back>:');
    await command('a');
    expect(last()).toBe('DRAWORDER  Select reference objects:');
    await clickAt(X + 2000, 0);
    expect(order()).toBe('LHT');
    expect(onChange.mock.calls[1][1]).toBe('DRAWORDER  1 object put above the hatch · ⌘Z to undo');
    // Already there: nothing changes. DR with its order typed skips the question.
    await clickAt(X + 1100, 1100);
    await command('dr f');
    expect(state.history.slice(-2)[0]).toBe('DRAWORDER  1 object already in front.'); // then the command ends and prompts again
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(state.tool).toBe('none');
  });

  it('TEXTTOFRONT lifts the texts, dimensions or leaders; DR B typed picks the objects next', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await command('texttofront');
    expect(last()).toBe('Command: TEXTTOFRONT  [Text/Dimensions/Leaders/All] <All>:');
    await command('');
    expect(state.history.slice(-2)[0]).toBe('TEXTTOFRONT  The texts, dimensions and leaders are in front already.');
    expect(onChange).toHaveBeenCalledTimes(0);
    expect(state.tool).toBe('none');
    await command('dr b');
    expect(last()).toBe('Command: DRAWORDER  Select objects:');
    await clickAt(X + 1100, 1100);
    await command('');
    expect(order()).toBe('THL');
    expect(onChange.mock.calls[0][1]).toBe('DRAWORDER  1 object sent to the back · ⌘Z to undo');
    await command('texttofront');
    await command('t');
    expect(order()).toBe('HLT');
    expect(onChange.mock.calls[1][1]).toBe('TEXTTOFRONT  The texts brought to the front · ⌘Z to undo');
  });

  it('the right-click menu of drawn objects has Draw order with the four orders; Above and Under then ask for the reference', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await rightClickAt(X + 6000, 0);
    expect(menuRows('[aria-label="Edit drawn objects"]')).toEqual(['Line tools', 'Clipboard', 'Undo', 'Redo', 'Erase', 'Move', 'Copy selection', 'Scale', 'Rotate', 'Mirror', 'Draw order', 'Isolate', 'Pan', 'Zoom', 'Select similar', 'Invert selection', 'Deselect all', 'Quick select…', 'Count', 'Properties', 'Options…']);
    await chooseMenu('Draw order');
    expect(options().map((b) => b.textContent)).toEqual(['Bring to front', 'Send to back', 'Above object', 'Under object']);
    await act(async () => { options()[1].click(); });
    expect(order()).toBe('LHT');
    expect(onChange.mock.calls[0][1]).toBe('DRAWORDER  1 object sent to the back · ⌘Z to undo');
    await rightClickAt(X + 6000, 0);
    await chooseMenu('Draw order');
    await act(async () => { options()[2].click(); });
    expect(last()).toBe('Command: DRAWORDER  Select reference objects:');
    await clickAt(X + 1100, 1100);
    expect(order()).toBe('HTL');
    expect(onChange.mock.calls[1][1]).toBe('DRAWORDER  1 object put above the text · ⌘Z to undo');
    expect(state.tool).toBe('none');
  });
});

describe('CAD 2D gap plan: POINT, DIVIDE, MEASURE and the point style', () => {
  const last = () => state.history[state.history.length - 1];
  const X = 200000, F = 'sample-villa-gf.dxf';
  const points = () => sketchOf(project, F).filter((it) => it.kind === 'point').map((it) => [Math.round(it.pts[0][0] - X), Math.round(it.pts[0][1])]);
  // A 10 m line.
  const start: Project = { ...villa, cadSketch: [{ file: F, items: [{ id: 'L', kind: 'line', layer: 'LV-SKETCH', pts: [[X, 0], [X + 10000, 0]] }] }] };

  it('PO draws a point at each click until Enter; DIV and ME set points out along the object clicked', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await command('po');
    expect(last()).toBe('Command: POINT  Specify a point:');
    await clickAt(X + 1000, 3000);
    await clickAt(X + 2000, 3000);
    expect(points()).toEqual([[1000, 3000], [2000, 3000]]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][1]).toBe('Point · ⌘Z to undo');
    expect(last()).toBe('POINT  Specify a point:');
    await command('');
    expect(state.tool).toBe('none');
    // DIVIDE: the object, then the number of parts (Block waits for Steps 9 and 10); one undo step for all the points.
    await command('div');
    expect(last()).toBe('Command: DIVIDE  Select object to divide:');
    await clickAt(X + 8000, 8000);
    expect(last()).toBe('DIVIDE  Click a line, polyline, arc, circle or ellipse:');
    await clickAt(X + 5000, 0);
    expect(last()).toBe('DIVIDE  Number of segments or [Block]:');
    await command('b');
    expect(last()).toBe('DIVIDE  Block name:');
    await command('nope');
    expect(last()).toBe('DIVIDE  No block "nope" in this drawing or Recent. Block name:');
    await command(''); // no name: back to the number
    expect(last()).toBe('DIVIDE  Number of segments or [Block]:');
    await command('1');
    expect(last()).toBe('DIVIDE  A whole number of 2 or more. DIVIDE  Number of segments or [Block]:');
    await command('5');
    expect(points().slice(2)).toEqual([[2000, 0], [4000, 0], [6000, 0], [8000, 0]]);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange.mock.calls[2][1]).toBe('DIVIDE  4 points on the line · ⌘Z to undo');
    expect(state.tool).toBe('none');
    // MEASURE: from the end nearer the click, every length typed in metres.
    await command('me');
    await clickAt(X + 9000, 0);
    expect(last()).toBe('MEASURE  Segment length or [Block]:');
    await command('3');
    expect(points().slice(6)).toEqual([[7000, 0], [4000, 0], [1000, 0]]);
    expect(onChange.mock.calls[3][1]).toBe('MEASURE  3 points on the line · ⌘Z to undo');
    await command('me');
    await clickAt(X + 5000, 0);
    await command('20');
    expect(last()).toMatch(/^MEASURE {2}The line is shorter than 20/);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('PTYPE: the Point style dialog sets the shape and the size, relative to the screen or in drawing units', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    await command('ptype');
    expect(last()).toBe('PTYPE  Points shown as dot');
    const dlg = () => document.querySelector('[role="dialog"][aria-label="Point style"]');
    expect(dlg()).not.toBeNull();
    // The two Size options are a group that wraps, not a label of one small box.
    const sizeRow = document.querySelector('input[aria-label="Size relative to screen"]')!.closest('.cad-dlg-r')!;
    expect([sizeRow.tagName, sizeRow.className, sizeRow.getAttribute('role'), sizeRow.getAttribute('aria-label')]).toEqual(['DIV', 'cad-dlg-r cad-dlg-g', 'group', 'Size']);
    expect(document.querySelectorAll('[role="radiogroup"][aria-label="Point shape"] [role="radio"]')).toHaveLength(20);
    expect((document.querySelector('[role="radio"][aria-label="Dot"]') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
    await act(async () => { (document.querySelector('[role="radio"][aria-label="Cross in a circle"]') as HTMLButtonElement).click(); });
    await act(async () => {
      const el = document.querySelector('input[aria-label="Point size"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '300');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { (document.querySelector('input[aria-label="Size in absolute units"]') as HTMLInputElement).click(); });
    await act(async () => { (document.querySelector('.cad-dlg-ft .p') as HTMLButtonElement).click(); });
    expect(dlg()).toBeNull();
    expect(project.cadPointStyle).toEqual({ mode: 35, size: 300, relative: false });
    expect(onChange.mock.calls[0][1]).toBe('PTYPE  Points shown as cross in a circle, 300 drawing units · ⌘Z to undo');
  });
});

describe('CAD 2D gap plan: BLOCK, a block from drawn objects', () => {
  const last = () => state.history[state.history.length - 1];
  const X = 200000, F = 'sample-villa-gf.dxf';
  const items = () => sketchOf(project, F);
  const defs = () => project.cadBlockDefs?.find((t) => t.file === F)?.defs ?? [];
  const dlg = () => document.querySelector('[role="dialog"][aria-label="Block definition"]');
  const field = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
  const setField = (label: string, value: string) => act(() => {
    const el = field(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const rightClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); });
  };
  // A rectangle with a text in it (a board symbol), and a line apart from them.
  const start: Project = { ...villa, cadSketch: [{ file: F, items: [
    { id: 'R', kind: 'pline', layer: 'LV-SKETCH', closed: true, pts: [[X, 0], [X + 400, 0], [X + 400, 300], [X, 300]] },
    { id: 'T', kind: 'text', layer: 'LV-ANNO', pts: [[X + 50, 100]], text: 'DB', h: 100 },
    { id: 'L', kind: 'line', layer: 'LV-SKETCH', pts: [[X + 2000, 0], [X + 3000, 0]] }
  ] }] };

  it('-BLOCK: the name, the base point, the objects, Enter: the block is defined and the objects become one insert, which picks and explodes as one', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await command('-block');
    expect(last()).toBe('Command: BLOCK  Block name:');
    await command('DB/A');
    expect(last()).toBe('BLOCK  A block name cannot contain < > / \\ " : ; ? * | = or `. Block name:');
    await command('DB-A');
    expect(last()).toBe('BLOCK  Specify base point:');
    await command(`${X},0`);
    expect(last()).toBe('BLOCK  Select objects — Enter when done:');
    await clickAt(X + 200, 0);
    await clickAt(X + 100, 150);
    expect(last()).toBe('BLOCK  2 objects selected — Enter when done');
    await command('');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('BLOCK  "DB-A" defined from 2 objects and inserted · ⌘Z to undo');
    expect(defs().map((d) => [d.name, d.items.length, d.units])).toEqual([['DB-A', 2, 4]]);
    expect(defs()[0].items[0].pts).toEqual([[0, 0], [400, 0], [400, 300], [0, 300]]);
    expect(items().map((it) => [it.id, it.kind, it.block])).toEqual([['L', 'line', undefined], ['S1', 'insert', 'DB-A']]);
    expect(items()[1].pts).toEqual([[X, 0]]);
    expect(state.tool).toBe('none');
    // The insert picks as one object where its block shows, and explodes back into the objects.
    await clickAt(X + 100, 150);
    expect(state.selected).toBe('sk:S1');
    await command('x');
    await clickAt(X + 200, 0);
    expect(last()).toBe('EXPLODE  2 objects · ⌘Z to undo');
    expect(items().map((it) => [it.kind, it.pts[0]])).toEqual([['line', [X + 2000, 0]], ['pline', [X, 0]], ['text', [X + 50, 100]]]);
  });

  it('B: the Block definition dialog, stepping aside to pick the objects and the base point; Retain keeps the objects; a name defined asks before redefining', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await command('b');
    expect(dlg()).not.toBeNull();
    expect(dlg()!.textContent).toContain('Type a name for the block.');
    // A form: a row of several controls is a group, not a label (a click anywhere on a label would press Pick point).
    expect(dlg()!.className).toBe('cad-dlg form');
    expect([...dlg()!.querySelectorAll('.cad-dlg-g[role="group"]')].map((r) => r.getAttribute('aria-label'))).toEqual(['Base point', 'Objects', 'What becomes of the objects']);
    expect([button('Pick point'), button('Select objects'), field('Retain')].map((el) => el.closest('.cad-dlg-r')!.tagName)).toEqual(['DIV', 'DIV', 'DIV']);
    expect(field('Block name').closest('.cad-dlg-r')!.tagName).toBe('LABEL');
    await setField('Block name', 'DB-A');
    expect(dlg()!.textContent).toContain('Pick or type the base point.');
    expect(document.querySelector('[aria-label="Objects selected"]')!.textContent).toBe('0 selected');
    await act(async () => { button('Select objects').click(); });
    expect(dlg()).toBeNull();
    expect(last()).toBe('Command: BLOCK  Select objects — Enter when done:');
    await clickAt(X + 200, 0);
    await clickAt(X + 100, 150);
    await command('');
    expect(dlg()).not.toBeNull();
    expect(document.querySelector('[aria-label="Objects selected"]')!.textContent).toBe('2 selected');
    await act(async () => { button('Pick point').click(); });
    expect(dlg()).toBeNull();
    expect(last()).toBe('Command: BLOCK  Specify base point:');
    await clickAt(X, 0);
    expect(dlg()).not.toBeNull();
    expect(field('Base X').value).toBe('200.000');
    expect(field('Base Y').value).toBe('0.000');
    expect(dlg()!.textContent).toContain('millimetres');
    await act(async () => { field('Retain').click(); });
    await setField('Block description', 'Board symbol');
    await act(async () => { (document.querySelector('.cad-dlg-ft .p') as HTMLButtonElement).click(); });
    expect(dlg()).toBeNull();
    expect(onChange.mock.calls[0][1]).toBe('BLOCK  "DB-A" defined from 2 objects · ⌘Z to undo');
    expect(defs().map((d) => [d.name, d.description, d.items.length])).toEqual([['DB-A', 'Board symbol', 2]]);
    expect(items().map((it) => it.kind)).toEqual(['pline', 'text', 'line']); // Retain: the objects stay, nothing inserted
    // The same name again (case aside) asks first; Yes redefines it, the earlier insert then shows the new objects.
    await command('b');
    await setField('Block name', 'db-a');
    await act(async () => { button('Select objects').click(); });
    await clickAt(X + 2500, 0);
    await command('');
    await setField('Base X', '202');
    await setField('Base Y', '0');
    await act(async () => { (document.querySelector('.cad-dlg-ft .p') as HTMLButtonElement).click(); });
    expect(dlg()).not.toBeNull();
    expect(dlg()!.textContent).toContain('Block "db-a" exists. Redefine it?');
    await act(async () => { button('Yes').click(); });
    expect(dlg()).toBeNull();
    expect(defs().map((d) => [d.name, d.items.length])).toEqual([['db-a', 1]]);
    expect(items().map((it) => [it.kind, it.block])).toEqual([['pline', undefined], ['text', undefined], ['insert', 'db-a']]); // Convert: the line became an insert
  });

  it('the right-click menu of drawn objects has Make block…, opening the dialog with them as its objects', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await rightClickAt(X + 2500, 0);
    expect(menuRows('[aria-label="Edit drawn objects"]').slice(0, 3)).toEqual(['Line tools', 'Clipboard', 'Undo']);
    await chooseMenu('Line tools');
    expect(menuRows('[aria-label="Line tools"]').slice(-3)).toEqual(['Quick measure', 'Add selected', 'Make block…']);
    await chooseMenu('Make block…');
    expect(dlg()).not.toBeNull();
    expect(document.querySelector('[aria-label="Objects selected"]')!.textContent).toBe('1 selected');
    expect(field('Base X').value).toBe('202.000');
    await act(async () => { button('Cancel').click(); });
    expect(dlg()).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(0);
  });
});

describe('CAD 2D gap plan: INSERT and the Blocks palette', () => {
  const last = () => state.history[state.history.length - 1];
  const X = 200000, F = 'sample-villa-gf.dxf';
  const items = () => sketchOf(project, F);
  const inserts = () => items().filter((it) => it.kind === 'insert');
  const palette = () => document.querySelector('[aria-label="Blocks palette"]');
  const pickBlock = (name: string) => act(async () => { (document.querySelector(`.cad-bk-item[aria-label="${name}"]`) as HTMLButtonElement).click(); });
  const tick = (label: string) => act(async () => { (document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement).click(); });
  const rightClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); });
  };
  const def: CadBlockDef = { name: 'DB-A', units: 4, items: [{ id: 'r', kind: 'pline', layer: '0', closed: true, pts: [[0, 0], [400, 0], [400, 300], [0, 300]] }, { id: 't', kind: 'text', layer: 'LV-ANNO', pts: [[50, 100]], text: 'DB', h: 100 }] };
  // A 10 m line, and one block defined.
  const start: Project = { ...villa, cadSketch: [{ file: F, items: [{ id: 'L', kind: 'line', layer: 'LV-SKETCH', pts: [[X, 0], [X + 10000, 0]] }] }], cadBlockDefs: [{ file: F, defs: [def] }] };

  it('I opens the palette; a block clicked waits at the cursor and goes where the click is, scaled and turned as set; Repeat keeps placing; Explode places its objects', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    expect(palette()).toBeNull();
    await command('i');
    expect(palette()).not.toBeNull();
    expect(state.tool).toBe('none');
    // The drawing's own block first, then the architect's blocks (the sample villa has several).
    const names = [...document.querySelectorAll('[role="list"][aria-label="Current drawing"] button')].map((b) => b.getAttribute('aria-label'));
    expect(names[0]).toBe('DB-A');
    expect(names.length).toBeGreaterThan(1);
    await pickBlock('DB-A');
    expect(state.tool).toBe('insert');
    expect(last()).toBe('Command: INSERT  Insertion point or [Scale/Rotate]:');
    await command('s');
    expect(last()).toBe('INSERT  Scale <1>:');
    await command('2');
    expect(last()).toBe('INSERT  Insertion point or [Scale/Rotate]:');
    await command('r');
    await command('90');
    await clickAt(X + 3000, 2000);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0]).toMatchObject({ kind: 'insert', block: 'DB-A', sc: 2, rot: Math.PI / 2 });
    expect(inserts()[0].pts[0].map(Math.round)).toEqual([X + 3000, 2000]);
    expect(onChange.mock.calls[0][1]).toMatch(/^INSERT {2}"DB-A" at /);
    expect(state.tool).toBe('none');
    expect(JSON.parse(localStorage.getItem('lvds.cad.recentBlocks')!).map((d: CadBlockDef) => d.name)).toEqual(['DB-A']);
    // Repeat placement: a click for each; Esc stops.
    await tick('Repeat placement');
    await pickBlock('DB-A');
    await clickAt(X + 5000, 2000);
    await clickAt(X + 6000, 2000);
    expect(inserts()).toHaveLength(3);
    expect(state.tool).toBe('insert');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(state.tool).toBe('none');
    // Explode: the block's objects go in, not an insert.
    await tick('Repeat placement');
    await tick('Explode');
    await pickBlock('DB-A');
    await clickAt(X + 8000, 2000);
    expect(inserts()).toHaveLength(3);
    expect(items().slice(-2).map((it) => [it.kind, it.text])).toEqual([['pline', undefined], ['text', 'DB']]);
    expect(onChange.mock.calls[3][1]).toMatch(/^INSERT {2}"DB-A", exploded, at /);
    await act(async () => { (document.querySelector('[aria-label="Close the Blocks palette"]') as HTMLButtonElement).click(); });
    expect(palette()).toBeNull();
  });

  it('-INSERT by name (also what Insert\'s arrow sends); DIVIDE\'s Block option sets blocks out, aligned; Select all of this block', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await command('-insert');
    expect(last()).toBe('Command: INSERT  Block name:');
    await command('nope');
    expect(last()).toBe('INSERT  No block "nope" in this drawing or Recent. Block name:');
    await command('DB-A');
    expect(last()).toBe('INSERT  Insertion point or [Scale/Rotate]:');
    await command(`${X + 1000},1000`);
    expect(inserts().map((it) => it.pts[0])).toEqual([[X + 1000, 1000]]);
    expect(state.tool).toBe('none');
    await command('-insert DB-A');
    expect(last()).toBe('Command: INSERT  Insertion point or [Scale/Rotate]:');
    await clickAt(X + 2000, 1000);
    expect(inserts()).toHaveLength(2);
    // DIVIDE with Block: the name, aligned or not, then the number of parts.
    await command('div');
    await clickAt(X + 5000, 0);
    await command('b');
    expect(last()).toBe('DIVIDE  Block name:');
    await command('DB-A');
    expect(last()).toBe('DIVIDE  Align block with object? [Yes/No] <Yes>:');
    await command('');
    expect(last()).toBe('DIVIDE  Number of segments:');
    await command('5');
    expect(inserts()).toHaveLength(6);
    expect(inserts().slice(2).map((it) => [it.pts[0][0] - X, it.block, it.rot])).toEqual([[2000, 'DB-A', undefined], [4000, 'DB-A', undefined], [6000, 'DB-A', undefined], [8000, 'DB-A', undefined]]);
    expect(onChange.mock.calls[2][1]).toBe('DIVIDE  4 "DB-A" blocks on the line · ⌘Z to undo');
    // The right-click menu of a block has its own list, Block tools, with Select all of this block.
    await rightClickAt(X + 1000, 1150);
    expect(menuRows('[aria-label="Edit drawn objects"]').slice(0, 2)).toEqual(['Repeat DIVIDE', 'Block tools']);
    await chooseMenu('Block tools');
    expect(menuRows('[aria-label="Block tools"]').slice(0, 3)).toEqual(['Open block editor', 'Edit block in place', 'Select all of this block']);
    await chooseMenu('Select all of this block');
    expect(last()).toBe('SELECT  Every "DB-A" block picked');
  });
});

describe('CAD 2D gap plan: block attributes (ATTDEF, INSERT prompts, ATTEDIT)', () => {
  const last = () => state.history[state.history.length - 1];
  const X = 200000, F = 'sample-villa-gf.dxf';
  const items = () => sketchOf(project, F);
  const dlg = (name: string) => document.querySelector(`[role="dialog"][aria-label="${name}"]`);
  const field = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
  const setField = (label: string, value: string) => act(() => {
    const el = field(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const ok = () => act(async () => { (document.querySelector('.cad-dlg-ft .p') as HTMLButtonElement).click(); });
  const dblClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('dblclick', { clientX: sx, clientY: sy, button: 0, bubbles: true })); });
  };
  const light: CadBlockDef = { name: 'LIGHT', units: 4, items: [
    { id: 'c', kind: 'circle', layer: '0', pts: [[0, 0]], r: 150 },
    { id: 'a1', kind: 'attdef', layer: '0', pts: [[200, 0]], tag: 'CIRCUIT', prompt: 'Circuit', text: 'L1', h: 100 },
    { id: 'a2', kind: 'attdef', layer: '0', pts: [[200, -150]], tag: 'WATTS', prompt: 'Load (W)', text: '36', h: 80, att: { invisible: true } },
    { id: 'a3', kind: 'attdef', layer: '0', pts: [[0, 200]], tag: 'TYPE', text: 'LED', h: 80, att: { constant: true } }
  ] };
  const start: Project = { ...villa, cadSketch: [{ file: F, items: [{ id: 'R', kind: 'pline', layer: 'LV-SKETCH', closed: true, pts: [[X, 0], [X + 400, 0], [X + 400, 300], [X, 300]] }] }], cadBlockDefs: [{ file: F, defs: [light] }] };

  it('ATTDEF draws an attribute definition (shown as its tag); BLOCK takes it; the Properties palette edits an insert\'s values', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await command('att');
    expect(dlg('Attribute definition')).not.toBeNull();
    expect(dlg('Attribute definition')!.textContent).toContain('Type a tag');
    // The insertion point: Pick on plan on a row of its own, then X and Y on the next, each a group that fits its controls.
    expect([button('Pick on plan'), field('Insertion X'), field('Insertion Y')].map((el) => el.closest('.cad-dlg-r')!.className)).toEqual(['cad-dlg-r cad-dlg-g', 'cad-dlg-r cad-dlg-g', 'cad-dlg-r cad-dlg-g']);
    expect(button('Pick on plan').closest('.cad-dlg-r')).not.toBe(field('Insertion X').closest('.cad-dlg-r'));
    expect(field('Insertion X').closest('.cad-dlg-r')).toBe(field('Insertion Y').closest('.cad-dlg-r'));
    await setField('Tag', 'db ref');
    await setField('Prompt', 'Board reference');
    await setField('Default', 'DB-1');
    await act(async () => { button('Pick on plan').click(); });
    expect(dlg('Attribute definition')).toBeNull();
    expect(last()).toBe('Command: ATTDEF  Specify insertion point:');
    await clickAt(X + 50, 100);
    expect(dlg('Attribute definition')).not.toBeNull();
    expect(field('Insertion X').value).toBe('200.050');
    await act(async () => { field('Invisible').click(); });
    await ok();
    expect(dlg('Attribute definition')).toBeNull();
    const ad = items().find((it) => it.kind === 'attdef')!;
    expect(ad).toMatchObject({ tag: 'DB_REF', prompt: 'Board reference', text: 'DB-1', h: 250, att: { invisible: true } });
    expect(ad.pts[0].map(Math.round)).toEqual([X + 50, 100]);
    expect(onChange.mock.calls[0][1]).toBe('Attribute DB_REF · ⌘Z to undo');
    // The definition picks by its tag's box, and goes into a block with the rectangle.
    await command('-block');
    await command('BOARD');
    await command(`${X},0`);
    await clickAt(X + 200, 0);
    await clickAt(X + 100, 150);
    expect(last()).toBe('BLOCK  2 objects selected — Enter when done');
    await command('');
    const def = project.cadBlockDefs!.find((t) => t.file === F)!.defs.find((d) => d.name === 'BOARD')!;
    expect(def.items.map((it) => it.kind)).toEqual(['pline', 'attdef']);
    expect(def.items[1].pts[0].map(Math.round)).toEqual([50, 100]);
  });

  it('inserting a block with attributes asks each prompt on the command line (Enter keeps the default); the values show, invisible ones do not; a double-click edits them', async () => {
    act(() => root.render(<Host start={start} />));
    await flush();
    project = start;
    act(() => state.toggle('osnap'));
    await command('-insert LIGHT');
    await clickAt(X + 2000, 2000);
    expect(last()).toBe('INSERT  Circuit <L1>:');
    expect(items().filter((it) => it.kind === 'insert')).toHaveLength(0);
    await command('DB1/L3');
    expect(last()).toBe('INSERT  Load (W) <36>:');
    await command('');
    const ins = items().find((it) => it.kind === 'insert')!;
    expect(ins).toMatchObject({ block: 'LIGHT', attrs: { CIRCUIT: 'DB1/L3', WATTS: '36' } });
    expect(state.tool).toBe('none');
    // What shows: the circle, the circuit and the constant type; not the invisible load.
    const { expandInsert } = await import('../../model/cadBlocks');
    expect(expandInsert(ins, [light]).map((x) => [x.kind, x.text])).toEqual([['circle', undefined], ['text', 'DB1/L3'], ['text', 'LED']]);
    // A double-click on the block: the Edit attributes dialog; a value typed and OK is one undo step.
    await dblClickAt(X + 2150, 2000);
    expect(dlg('Edit attributes')).not.toBeNull();
    expect(dlg('Edit attributes')!.textContent).toContain('LIGHT');
    expect(field('Value of CIRCUIT').value).toBe('DB1/L3');
    await setField('Value of CIRCUIT', 'DB1/L4');
    await setField('Value of WATTS', '18');
    await ok();
    expect(dlg('Edit attributes')).toBeNull();
    expect(items().find((it) => it.kind === 'insert')!.attrs).toEqual({ CIRCUIT: 'DB1/L4', WATTS: '18' });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][1]).toBe('ATTEDIT  "LIGHT" attributes · ⌘Z to undo');
    // ATE picks the block too; Esc leaves it.
    await command('ate');
    expect(last()).toBe('Command: ATTEDIT  Select a block:');
    await clickAt(X + 8000, 8000);
    expect(last()).toBe('ATTEDIT  Select a block:');
    await clickAt(X + 2150, 2000);
    expect(dlg('Edit attributes')).not.toBeNull();
    expect(state.tool).toBe('none');
    await act(async () => { button('Cancel').click(); });
    expect(dlg('Edit attributes')).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('right-click menus, phase 1: the tools behind them', () => {
  const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
  const X = 200000;
  const two: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 4000, 0]), line('S2', [X + 6000, 1000], [X + 6000, 5000])] }] };
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const start = async (p: Project = two) => { project = p; act(() => root.render(<Host start={p} />)); await flush(); act(() => state.toggle('osnap')); };
  const right = (x: number, y: number, shiftKey = false) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, shiftKey, bubbles: true, cancelable: true })); }); };
  const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => (rowLabel(b)) === label)!;
  const lines = () => sketchOf(project, 'sample-villa-gf.dxf').filter((it) => it.kind === 'line');

  it('COUNT, SELECTALL (and Ctrl+A), ISOLATEOBJECTS, HIDEOBJECTS and UNISOLATEOBJECTS', async () => {
    await start();
    await command('COUNT');
    expect(hist()).toMatch(/^COUNT {2}In view: 2 Line/);
    await command('SELECTALL');
    expect(hist()).toMatch(/^SELECTALL {2}\d+ objects selected$/);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })); });
    expect(hist()).toMatch(/^SELECTALL {2}\d+ objects selected$/);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await clickAt(X + 2000, 0); // S1 picked
    await command('COUNT');
    expect(hist()).toBe('COUNT  Picked: 1 Line — 1 in all');
    await command('ISOLATEOBJECTS');
    expect(hist()).toBe('ISOLATEOBJECTS  1 object shown alone · UNISOLATEOBJECTS shows all again');
    await command('COUNT');
    expect(hist()).toMatch(/^COUNT {2}In view: 1 Line — 1 in all$/);
    // What is drawn while isolated shows.
    await command('L'); await clickAt(X, 9000); await clickAt(X + 1000, 9000); await command('');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await command('COUNT');
    expect(hist()).toMatch(/^COUNT {2}In view: 2 Line — 2 in all$/);
    await command('UNISOLATEOBJECTS');
    expect(hist()).toBe('UNISOLATEOBJECTS  All objects shown again.');
    await command('COUNT');
    expect(hist()).toMatch(/^COUNT {2}In view: 3 Line/);
    await clickAt(X + 6000, 3000); // S2
    await command('HIDEOBJECTS');
    expect(hist()).toBe('HIDEOBJECTS  1 object hidden · UNISOLATEOBJECTS shows all again');
    await command('COUNT');
    expect(hist()).toMatch(/^COUNT {2}In view: 2 Line/);
    await command('UNHIDE');
    await command('COUNT');
    expect(hist()).toMatch(/^COUNT {2}In view: 3 Line/);
  });

  it('QUICKMEASURE, ADDSELECTED, PAN, UNDO and REDO', async () => {
    await start();
    await command('QM');
    expect(hist()).toBe('QUICKMEASURE  Pick lines, polylines, arcs or circles first.');
    await clickAt(X + 2000, 0);
    await command('QM');
    expect(hist()).toMatch(/^QUICKMEASURE {2}1 object: length 4(\.0+)? m$/);
    await command('ADDSELECTED');
    expect(state.tool).toBe('line');
    await command('');
    await command('PAN');
    expect([state.tool, hist()]).toEqual(['pan', 'Command: PAN  Drag to pan. Enter or Esc to end:']);
    await command('');
    expect(state.tool).toBe('none');
    expect(state.history).toContain('PAN  Ended.');
    await command('UNDO');
    expect(hist()).toBe('UNDO  Nothing to undo.');
    await command('REDO');
    expect(hist()).toBe('REDO  Nothing to redo.');
  });

  it('the command menu: Snap overrides ▸ Endpoint makes the next point snap to an endpoint only; Recent input ▸ types a value again', async () => {
    await start();
    expect(state.toggles.osnap).toBe(false);
    await command('L');
    await right(X + 20000, 20000, true);
    await act(async () => { entry('Snap overrides').click(); });
    await act(async () => { entry('Endpoint').click(); });
    expect(hist()).toBe('Endpoint snap for the next point.');
    await clickAt(X + 4000 + 60, 60); // near S1's end
    await command('@0,2000');
    await command('');
    expect(lines().slice(-1)[0].pts[0]).toEqual([X + 4000, 0]);
    await command('L');
    await right(X + 20000, 20000, true);
    await act(async () => { entry('Recent input').click(); });
    expect(entry('@0,2000')).toBeTruthy();
  });

  it('the menu of drawn objects picked: Isolate, Add selected, Quick measure, Count and Deselect all run their tools', async () => {
    await start();
    await clickAt(X + 2000, 0);
    await right(X + 2000, 0);
    await chooseMenu('Line tools', 'Quick measure');
    expect(hist()).toMatch(/^QUICKMEASURE {2}1 object/);
    await right(X + 2000, 0);
    await chooseMenu('Isolate', 'Hide objects');
    expect(hist()).toBe('HIDEOBJECTS  1 object hidden · UNISOLATEOBJECTS shows all again');
    await clickAt(X + 6000, 3000);
    await right(X + 6000, 3000);
    await act(async () => { entry('Deselect all').click(); });
    await command('COUNT');
    expect(hist()).toMatch(/^COUNT {2}In view: 1 Line/);
  });
});

describe('right-click menus, stage 2: one order, new look, new tools', () => {
  const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
  const X = 200000;
  const two: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 4000, 0]), line('S2', [X + 6000, 1000], [X + 6000, 5000])] }] };
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const start = async (p: Project = two, undoLabel?: string) => { project = p; act(() => root.render(<Host start={p} undoLabel={undoLabel} />)); await flush(); act(() => state.toggle('osnap')); };
  const right = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); }); };
  const key = (init: KeyboardEventInit) => act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); });
  const objectMenu = () => document.querySelector('[role="menu"][aria-label="Edit drawn objects"]') as HTMLElement | null;

  it('a right-click on a picked line: the header names it, Line tools has Trim, Undo says what it takes back', async () => {
    await start(two, 'Offset');
    await clickAt(X + 2000, 0);
    await right(X + 2000, 0);
    expect(objectMenu()!.querySelector('.cad-menu-hd')!.textContent).toBe('Line · 4.00 m · LV-SKETCH');
    expect(menuRows('[aria-label="Edit drawn objects"]')).toEqual(expect.arrayContaining(['Line tools', 'Clipboard', 'Undo Offset', 'Redo', 'Erase', 'Move', 'Copy selection', 'Scale', 'Properties', 'Options…']));
    expect(menuRow('Undo Offset').disabled).toBe(false);
    expect(menuRow('Redo').disabled).toBe(true);
    await chooseMenu('Line tools');
    expect(menuRows('[aria-label="Line tools"]')).toContain('Trim');
    await chooseMenu('Trim');
    expect(state.tool).toBe('trim');
  });

  it('SELECTINVERT picks what was not picked and drops what was; Invert selection on the menu does the same', async () => {
    await start();
    await clickAt(X + 2000, 0); // S1
    expect(state.selected).toBe('sk:S1');
    await command('SELECTINVERT');
    expect(hist()).toBe('SELECTINVERT  1 object selected');
    expect(state.selected).toBe('sk:S2');
    await right(X + 6000, 3000);
    await chooseMenu('Invert selection');
    expect(state.selected).toBe('sk:S1');
    // Nothing picked: everything is.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await command('SELECTINVERT');
    expect(hist()).toBe('SELECTINVERT  2 objects selected');
  });

  it('Z O zooms to the objects picked (and says so when none are); Zoom to selection on the menu is the same', async () => {
    const chip = () => document.querySelector('.zoom-chip')!.textContent;
    await start();
    await command('Z O');
    expect(hist()).toBe('ZOOM  Pick the objects first.');
    expect(chip()).toBe('100 %');
    await clickAt(X + 2000, 0);
    await command('Z O');
    expect(hist()).toBe('ZOOM  1 object selected filled the view');
    await until(() => chip() !== '100 %');
    expect(parseInt(chip()!, 10)).toBeGreaterThan(100);
    await right(X + 2000, 0);
    expect(menuRows('[aria-label="Zoom"]')).toEqual([]);
    await chooseMenu('Zoom');
    expect(menuRows('[aria-label="Zoom"]')).toEqual(['Zoom window', 'Zoom to selection', 'Zoom previous', 'Zoom extents']);
  });

  it('Shift+F10 and the menu key open the menu at the objects picked; with nothing picked and no cursor yet, they say so', async () => {
    await start();
    await key({ key: 'F10', shiftKey: true });
    expect(objectMenu()).toBeNull();
    expect(hist()).toBe('Move the cursor over the drawing first.');
    expect(state.toggles.polar).toBe(false); // F10 alone is Polar; with Shift it is the menu
    await clickAt(X + 2000, 0);
    await key({ key: 'F10', shiftKey: true });
    expect(objectMenu()).not.toBeNull();
    expect(objectMenu()!.querySelector('.cad-menu-hd')!.textContent).toBe('Line · 4.00 m · LV-SKETCH');
    expect(state.selected).toBe('sk:S1'); // the pick stays
    await key({ key: 'Escape' });
    expect(objectMenu()).toBeNull();
    await key({ key: 'ContextMenu' });
    expect(objectMenu()).not.toBeNull();
    await key({ key: 'F10' });
    expect(state.toggles.polar).toBe(true);
  });

  it('Properties on the menu is checked while the palette shows, and a click folds it away', async () => {
    await start();
    act(() => state.setShowProps(true));
    await clickAt(X + 2000, 0);
    await right(X + 2000, 0);
    expect(menuRow('Properties').getAttribute('aria-checked')).toBe('true');
    await chooseMenu('Properties');
    expect(state.showProps).toBe(false);
    await right(X + 2000, 0);
    expect(menuRow('Properties').getAttribute('aria-checked')).toBe('false');
    await chooseMenu('Properties');
    expect(state.showProps).toBe(true);
  });

  it('Pan from the menu of a picked object keeps the pick', async () => {
    await start();
    await clickAt(X + 2000, 0);
    await right(X + 2000, 0);
    await chooseMenu('Pan');
    expect(state.tool).toBe('pan');
    expect(state.selected).toBe('sk:S1');
    await command('');
    expect(state.tool).toBe('none');
    expect(state.selected).toBe('sk:S1');
  });

  it('the menu has the keyboard: Down moves to a row, Right opens its list, Esc closes the list and then the menu', async () => {
    await start();
    await clickAt(X + 2000, 0);
    await right(X + 2000, 0);
    const menu = objectMenu()!;
    expect(document.activeElement).toBe(menu);
    const press = (k: string) => act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
    await press('ArrowDown');
    expect(rowLabel(document.activeElement!)).toBe('Line tools');
    await press('ArrowRight');
    expect(document.querySelector('[role="menu"][aria-label="Line tools"]')).not.toBeNull();
    expect(rowLabel(document.activeElement!)).toBe('Trim');
    await press('Escape');
    expect(document.querySelector('[aria-label="Line tools"]')).toBeNull();
    expect(objectMenu()).not.toBeNull();
    await press('Escape');
    expect(objectMenu()).toBeNull();
    expect(state.selected).toBe('sk:S1'); // Esc closed only the menu
  });
});

describe('right-click menus, phase 2: LV and ELV objects and the tools behind them', () => {
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const right = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); }); };
  const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => (rowLabel(b)) === label)!;
  const pickEntry = async (...path: string[]) => { for (const l of path) { const b = entry(l); expect(b, l).toBeTruthy(); await act(async () => { b.click(); }); } };
  const esc = () => act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  const lit: Project = {
    ...villa,
    boards: villa.boards.map((b) => (b.id === 'DB-GF1' ? { ...b, planPoint: { x: 1, y: 1 }, level: { building: 'V', level: 'GF' } } : b)),
    lvPoints: [
      { id: 'P1', type: 'ltg', feederId: 'DB-GF1-Y1', buildingId: 'V', levelId: 'GF', x: 3, y: 9 },
      { id: 'P2', type: 'ltg', feederId: 'DB-GF1-Y1', buildingId: 'V', levelId: 'GF', x: 6, y: 9 },
      { id: 'P3', type: 's13', feederId: 'DB-GF1-B6', buildingId: 'V', levelId: 'GF', x: 6, y: 4 }
    ]
  };
  const start = async (p: Project, show?: (s: CadShow) => void) => { project = p; act(() => root.render(<Host start={p} show={show} />)); await flush(); act(() => state.toggle('osnap')); };

  it('a light: Select same circuit, Circuit ▸ Draw home-run, Show in SLD and the load schedule; a board: Draw home-runs, Load schedule, riser', async () => {
    const show = vi.fn();
    await start(lit, show);
    await right(3000, 9000);
    await pickEntry('Select same circuit');
    expect(hist()).toBe('SEL  2 devices on DB-GF1/Y1 on this level');
    await right(3000, 9000);
    await pickEntry('Circuit', 'Draw home-run');
    expect(project.cadWiring).toEqual([{ feederId: 'DB-GF1-Y1' }]);
    await right(3000, 9000);
    await pickEntry('Show in SLD');
    expect(show).toHaveBeenLastCalledWith({ to: 'sld', feeder: 'DB-GF1-Y1', board: 'DB-GF1' });
    await right(3000, 9000);
    await pickEntry('Show in load schedule');
    expect(show).toHaveBeenLastCalledWith({ to: 'load-schedule', board: 'DB-GF1' });
    await esc();
    await right(1000, 1000);
    await pickEntry('Board tools', 'Draw home-runs');
    expect(project.cadWiring!.map((w) => w.feederId).sort()).toEqual(['DB-GF1-B6', 'DB-GF1-Y1']);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toMatch(/^1 circuit of DB-GF1 wired on /);
    await right(1000, 1000);
    await pickEntry('Show in riser');
    expect(show).toHaveBeenLastCalledWith({ to: 'riser', board: 'DB-GF1' });
    await right(1000, 1000);
    await pickEntry('Board tools', 'Select all fed devices');
    expect(hist()).toMatch(/^SEL {2}3 devices on DB-GF1's circuits/);
  });

  it('a room with an outline: Room ▸ Room loads, Select devices in room, Rename room… and Room type… on the command line', async () => {
    const outline: [number, number][] = [[100, 100], [104, 100], [104, 104], [100, 104]];
    const p: Project = { ...lit, building: { ...villa.building!, roomTypes: DEFAULT_ROOM_TYPES, rooms: [{ id: 'R9', buildingId: 'V', levelId: 'GF', name: 'Store', type: 'office', areaM2: 16, outline }] },
      lvPoints: [...lit.lvPoints!, { id: 'P9', type: 'ltg', feederId: 'DB-GF1-Y1', buildingId: 'V', levelId: 'GF', x: 101, y: 101 }] };
    await start(p);
    await right(102500, 102500);
    await pickEntry('Room Store', 'Room loads');
    expect(hist()).toBe('LOADS  Store: Office: 1.60 kW connected, 1.28 kW demand (100 W/m² × 16.0 m², ×0.8) · 1 Light');
    await right(102500, 102500);
    await pickEntry('Room Store', 'Select devices in room');
    expect(hist()).toBe('SEL  1 device in Store');
    await esc();
    await right(102500, 102500);
    await pickEntry('Room Store', 'Rename room…');
    await command('Plant room');
    expect(buildingInfoOf(project).rooms[0].name).toBe('Plant room');
    await right(102500, 102500);
    await pickEntry('Room Plant room', 'Room type…');
    expect(hist()).toMatch(/^ROOM TYPE {2}Plant room: type the room type \(.*\) <Office>:$/);
    await command('retail');
    expect(buildingInfoOf(project).rooms[0].type).toBe('retail');
    await right(102500, 102500);
    await pickEntry('Room Plant room', 'Light room…');
    expect(state.tool).toBe('lux');
  });

  it('checks the level (CHK): the list is in the side panel, a line says where it goes, Light room starts on that room', async () => {
    act(() => root.render(<Host />));
    await flush();
    act(() => state.actions.current.addFound());
    await command('CHK');
    expect(state.tool).toBe('check');
    expect(document.body.textContent).toContain('Check level');
    const lines = [...document.querySelectorAll('.cad-chk-line')] as HTMLButtonElement[];
    const none = lines.find((b) => / — no light$/.test(b.textContent ?? ''))!;
    expect(none).toBeDefined();
    await act(async () => { none.click(); });
    expect(hist()).toContain(`CHK  ${none.textContent}`);
    const fix = none.closest('.cad-chk-row')!.querySelector('.cad-chk-fix') as HTMLButtonElement;
    expect(fix.textContent).toBe('Light room');
    await act(async () => { fix.click(); });
    await flush();
    expect(state.tool).toBe('lux');
  });

  it('a cable route: Trace circuit picks its devices, Reverse direction; a tray: Size tray from cables, Fill ratio check, Cables in this route', async () => {
    const X = 200000;
    const route: SketchItem = { id: 'C1', kind: 'pline', layer: 'E-CABLE', pts: [[X, 0], [X + 4000, 0], [X + 4000, 3000]], cable: { feederId: 'DB-GF1-Y1' } };
    const tray: SketchItem = { id: 'T1', kind: 'pline', layer: 'E-TRAY', pts: [[X, 10000], [X + 6000, 10000]], tray: { widthMm: 50, service: 'Power', route: 'A' } };
    const bare: SketchItem = { ...tray, id: 'T2', pts: [[X, 20000], [X + 6000, 20000]], tray: { widthMm: 100 } };
    const p: Project = { ...lit, feeders: lit.feeders.map((f) => (f.id === 'INC-GF' || f.id === 'INC-FF' ? { ...f, trayRoute: 'A' } : f)),
      trays: { ...trayPlanOf(lit), routes: [{ id: 'RA', name: 'A', cables: [] }] }, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [route, tray, bare] }] };
    await start(p);
    await clickAt(X + 2000, 0);
    await right(X + 2000, 0);
    await pickEntry('Trace circuit');
    expect(hist()).toMatch(/^TRACE {2}DB-GF1\/Y1.*: 3 devices and boards on this level$/);
    await esc();
    await clickAt(X + 2000, 0);
    await right(X + 2000, 0);
    await pickEntry('Reverse direction');
    expect(sketchOf(project, 'sample-villa-gf.dxf').find((it) => it.id === 'C1')!.pts).toEqual([[X + 4000, 3000], [X + 4000, 0], [X, 0]]);
    await esc();
    await clickAt(X + 3000, 10000);
    await right(X + 3000, 10000);
    await pickEntry('Size tray from cables');
    const need = sizeRoute(p, trayPlanOf(p), { id: 'RA', name: 'A', cables: [] }).autoWidthMm;
    expect(need).toBeGreaterThan(50);
    expect(sketchOf(project, 'sample-villa-gf.dxf').find((it) => it.id === 'T1')!.tray!.widthMm).toBe(need);
    await right(X + 3000, 10000);
    await pickEntry('Fill ratio check');
    expect(hist()).toMatch(new RegExp(`^FILL  ${need} mm tray: [\\d.]+% full \\(limit \\d+%\\) — OK$`));
    await right(X + 3000, 10000);
    await pickEntry('Cables in this route');
    expect(hist()).toMatch(/^CABLES {2}Route A: 2 cables — MDB-1 → SMDB-GF/);
    await esc();
    await clickAt(X + 3000, 20000);
    await right(X + 3000, 20000);
    await pickEntry('Fill ratio check');
    expect(hist()).toMatch(/^TRAY {2}This tray is on no route/);
  });

  it('checks LV containment segments on demand, applies a one-tier recommendation and opens cable assignments', async () => {
    const X = 200000, show = vi.fn();
    const tray: SketchItem = { id: 'T1', kind: 'pline', layer: 'E-TRAY', pts: [[X, 10000], [X + 6000, 10000]], tray: { widthMm: 100, service: 'Power', route: 'A' } };
    const p: Project = { ...lit, trays: { ...trayPlanOf(lit), routes: [{ id: 'RA', name: 'A', cables: [{ id: 'M1', cores: 4, csaMm2: 240, qty: 1 }] }] }, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [tray] }] };
    await start(p, show);
    await command('CC');
    expect(state.tool).toBe('containment');
    expect(document.body.textContent).toContain('Containment check LV only');
    await clickAt(X + 3000, 10000);
    expect(hist()).toMatch(/^CONTAINMENTCHECK {2}S1 · Route A: overloaded\.$/);
    expect(document.body.textContent).toContain('Assigned LV cables1');
    const apply = button('Apply recommended size');
    expect(apply.disabled).toBe(false);
    await act(async () => { apply.click(); });
    expect(sketchOf(project, 'sample-villa-gf.dxf').find((item) => item.id === 'T1')!.tray!.widthMm).toBeGreaterThan(100);
    await act(async () => { button('Open cable assignments').click(); });
    expect(show).toHaveBeenCalledWith({ to: 'cable-tray' });
  });
});

describe('right-click menus, phase 3: blocks, references and layouts', () => {
  const X = 200000, F = 'sample-villa-gf.dxf';
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const right = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); }); };
  const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => (rowLabel(b)) === label)!;
  const pickEntry = async (...path: string[]) => { for (const l of path) { const b = entry(l); expect(b, l).toBeTruthy(); await act(async () => { b.click(); }); } };
  const esc = () => act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  const start = async (p: Project) => { project = p; act(() => root.render(<Host start={p} />)); await flush(); act(() => state.toggle('osnap')); };
  const line = { id: 'b1', kind: 'line' as const, layer: '0', pts: [[0, 0], [2000, 0]] as [number, number][] };
  const B1: CadBlockDef = { name: 'B1', items: [line] };
  const B2: CadBlockDef = { name: 'B2', items: [line, { id: 'b2', kind: 'attdef', layer: '0', pts: [[0, 500]], tag: 'TAG', text: 'X', h: 250 }] };
  const ins = (id: string, y: number, block: string, attrs?: Record<string, string>): SketchItem => ({ id, kind: 'insert', layer: '0', pts: [[X, y]], block, ...(attrs ? { attrs } : {}) });
  afterEach(() => dropRefGeometry('REF.dxf'));

  it('a block drawn here: Count instances, Replace with another block, Reset attributes, Explode', async () => {
    await start({ ...villa, cadBlockDefs: [{ file: F, defs: [B1, B2] }], cadSketch: [{ file: F, items: [ins('I1', 0, 'B1'), ins('I2', 5000, 'B1'), ins('I3', 10000, 'B2', { TAG: 'L1' })] }] });
    const item = (id: string) => sketchOf(project, F).find((x) => x.id === id);
    await clickAt(X + 1000, 0);
    await right(X + 1000, 0);
    await pickEntry('Block tools', 'Count instances');
    expect(hist()).toBe('COUNT  "B1": 2 in this drawing');
    await right(X + 1000, 0);
    await pickEntry('Block tools', 'Replace with another block', 'B2');
    expect(item('I1')!.block).toBe('B2');
    await esc();
    await clickAt(X + 1000, 10000);
    await right(X + 1000, 10000);
    await pickEntry('Block tools', 'Reset attributes');
    expect(item('I3')!.attrs).toBeUndefined();
    await right(X + 1000, 10000);
    await pickEntry('Block tools', 'Explode');
    expect(sketchOf(project, F).filter((x) => x.kind === 'insert').map((x) => x.id)).toEqual(['I1', 'I2']); // I3's first piece keeps its id
    expect(hist()).toMatch(/^EXPLODE {2}"B2": 2 objects/);
  });

  it('a reference drawing: Fade ▸, print on sheets, Open reference, Detach', async () => {
    keepRefGeometry({ file: 'REF.dxf', units: 4, segs: new Float64Array([0, 0, 5000, 0]), segLayers: new Uint16Array([0]), layers: [{ name: 'A-WALL', rgb: 0 }] });
    await start({ ...villa, cadRefs: { [F]: [{ name: 'REF', file: 'REF.dxf', type: 'overlay', at: [X, 50000], scale: 1, rot: 0, fade: 50, print: true }] } });
    const ref = () => project.cadRefs?.[F]?.[0];
    await right(X + 2500, 50000);
    await pickEntry('Fade', '25 %');
    expect(ref()!.fade).toBe(25);
    await right(X + 2500, 50000);
    await pickEntry('Do not print on sheets');
    expect(ref()!.print).toBe(false);
    await right(X + 2500, 50000);
    await pickEntry('Open reference');
    expect(hist()).toMatch(/^XREF {2}REF\.dxf: where it is on this computer is not known/);
    await right(X + 2500, 50000);
    await pickEntry('Detach');
    expect(ref()).toBeUndefined();
  });

  it('a layout: right-click in a viewport for its scale, lock and model space; on the paper for the issue status, MV and the Model tab', async () => {
    let p: Project = { ...villa, cadPlans: [{ building: 'V', level: 'GF', file: F, units: 4 }] };
    for (const [x, y] of [[3, 9], [6, 9.4], [9, 8.8]]) p = placeLvPoint(p, { building: 'V', level: 'GF' }, 'ltg', 'DB-GF1-B2', x, y).project;
    await start(p);
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.cad-ltab')].find((b) => b.textContent === 'Model')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 500 })));
    act(() => [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.startsWith('Lighting layout'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const sheet = () => project.drawingSet!.sheets.find((x) => x.kind === 'plan')!;
    await until(() => !!document.querySelector('.cad-vp'));
    const frame = document.querySelector<HTMLElement>('.cad-vp')!;
    const [l, t, w, h] = ['left', 'top', 'width', 'height'].map((k) => parseFloat(frame.style.getPropertyValue(k)));
    const paperRight = (x: number, y: number) => act(async () => { document.querySelector('.cad-vps')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })); });
    await paperRight(l + w / 2, t + h / 2);
    await pickEntry('Viewport scale', '1:50');
    expect(sheet().viewports![0].scale).toBe(50);
    await paperRight(l + w / 2, t + h / 2);
    await pickEntry('Unlock display');
    expect(sheet().viewports![0].locked).toBe(false);
    await paperRight(l + w / 2, t + h / 2);
    await pickEntry('Activate (model space)');
    expect(state.msVp).toBe('vp1');
    await command('PS');
    await paperRight(l + w + 40, t + h + 20);
    await pickEntry('Issue status', 'FOR APPROVAL');
    expect(sheet().status).toBe('FOR APPROVAL');
    await paperRight(l + w + 40, t + h + 20);
    await pickEntry('New viewport');
    expect(hist()).toMatch(/^MVIEW {2}Click two corners/);
    await esc();
    await paperRight(l + w / 2, t + h / 2);
    await pickEntry('Show on the Model tab');
    expect(state.layout).toBeNull();
  }, 20_000);
});

describe('right-click menus, phase 4: texts, dimensions, hatches, polylines, hot grips and FIND', () => {
  const X = 200000, F = 'sample-villa-gf.dxf';
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const right = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); }); };
  const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => (rowLabel(b)) === label)!;
  const pickEntry = async (...path: string[]) => { for (const l of path) { const b = entry(l); expect(b, l).toBeTruthy(); await act(async () => { b.click(); }); } };
  const esc = () => act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  /** A press and let go in place: on a grip of the object picked, it turns hot. */
  const press = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y), c = document.querySelector('canvas.cad-over')!;
    await act(async () => { for (const t of ['mousemove', 'mousedown', 'mouseup']) c.dispatchEvent(new MouseEvent(t, { clientX: sx, clientY: sy, button: 0, bubbles: true })); });
  };
  const start = async (items: SketchItem[]) => { const p = { ...villa, cadSketch: [{ file: F, items }] }; project = p; act(() => root.render(<Host start={p} />)); await flush(); act(() => state.toggle('osnap')); };
  const item = (id: string) => sketchOf(project, F).find((x) => x.id === id)!;

  it('a text: Justify, Text height, Case, Frame and Background mask; FIND replaces words in every text', async () => {
    await start([{ id: 'T1', kind: 'text', layer: '0', pts: [[X, 0]], text: 'Panel a', h: 250 }, { id: 'T2', kind: 'text', layer: '0', pts: [[X, 5000]], text: 'panel b', h: 250 }]);
    await clickAt(X + 300, 100);
    await right(X + 300, 100);
    await pickEntry('Text tools', 'Case', 'UPPER CASE');
    expect(item('T1').text).toBe('PANEL A');
    await right(X + 300, 100);
    await pickEntry('Text tools', 'Text height', '5 mm on paper');
    expect(item('T1').h).toBeCloseTo(5 * unitsPerPaperMm(annoOf(project), 0.001), 6);
    await right(X + 300, 100);
    await pickEntry('Text tools', 'Justify', 'Middle centre');
    expect(item('T1').just).toBe('MC');
    await right(X + 300, 100);
    await pickEntry('Text tools', 'Frame', 'Box');
    expect(item('T1').frame).toBe('box');
    await right(X + 300, 100);
    await pickEntry('Text tools', 'Background mask');
    expect(item('T1').mask).toBe(true);
    await esc();
    await command('FIND');
    await command('panel');
    expect(hist()).toBe('FIND  2 found for "panel". Replace with (Enter: leave them):');
    await command('Board');
    expect([item('T1').text, item('T2').text]).toEqual(['Board A', 'Board b']);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('FIND  2 replaced: "panel" → "Board" in 2 objects · ⌘Z to undo');
  });

  it('a dimension: Precision, Text position, Remove text override; a hatch: Hatch angle, Hatch scale, Recreate boundary', async () => {
    await start([
      { id: 'D1', kind: 'dim', layer: '0', pts: [[X, 20000], [X + 4000, 20000], [X + 2000, 21000]], text: 'TYP.', h: 250 },
      { id: 'H1', kind: 'pline', layer: '0', closed: true, pts: [[X, 40000], [X + 4000, 40000], [X + 4000, 44000], [X, 44000]], hatch: { pattern: 'ansi31', scale: 1, angle: 0 } }
    ]);
    await clickAt(X + 1000, 21000);
    await right(X + 1000, 21000);
    await pickEntry('Dimension tools', 'Precision', '0.0');
    expect(item('D1').look!.decimals).toBe(1);
    await right(X + 1000, 21000);
    await pickEntry('Dimension tools', 'Text position', 'Above');
    expect(item('D1').look!.textPos).toBe('above');
    await right(X + 1000, 21000);
    await pickEntry('Dimension tools', 'Remove text override');
    expect(item('D1').text).toBeUndefined();
    await esc();
    await clickAt(X + 1000, 40000);
    await right(X + 1000, 40000);
    await pickEntry('Hatch tools', 'Hatch angle', '45°');
    expect(item('H1').hatch!.angle).toBe(45);
    await right(X + 1000, 40000);
    await pickEntry('Hatch tools', 'Hatch scale', '× 2 (wider apart)');
    expect(item('H1').hatch!.scale).toBe(2);
    await right(X + 1000, 40000);
    await pickEntry('Hatch tools', 'Recreate boundary');
    const plain = sketchOf(project, F).filter((x) => x.kind === 'pline' && !x.hatch);
    expect(plain.map((x) => x.pts)).toEqual([item('H1').pts]);
    // The hatch follows the new outline from now on.
    expect(item('H1').assoc).toEqual([plain[0].id]);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('HATCH  Its boundary drawn as 1 closed polyline; the hatch is associative with it · ⌘Z to undo');
  });

  it('a hatch with islands: Edit hatch…, Set origin and Remove islands join Hatch scale, Hatch angle and Recreate boundary', async () => {
    const hole: [number, number][] = [[X + 1000, 41000], [X + 2000, 41000], [X + 2000, 42000]];
    await start([{ id: 'H1', kind: 'pline', layer: 'LV-HATCH', closed: true, pts: [[X, 40000], [X + 4000, 40000], [X + 4000, 44000], [X, 44000]], hatch: { pattern: 'ansi31', scale: 1, angle: 0 }, holes: [hole] }]);
    await clickAt(X + 4000, 42000);
    await right(X + 4000, 42000);
    const labels = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].map((b) => rowLabel(b) ?? '');
    await pickEntry('Hatch tools');
    expect(labels().filter((t) => /hatch|origin|islands|boundary/i.test(t))).toEqual(['Hatch tools', 'Edit hatch…', 'Hatch scale', 'Hatch angle', 'Set origin', 'Remove islands', 'Recreate boundary']);
    await pickEntry('Remove islands');
    expect(item('H1').holes).toBeUndefined();
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('HATCH  Islands removed · ⌘Z to undo');
    await right(X + 4000, 42000);
    await pickEntry('Hatch tools');
    expect(labels()).not.toContain('Remove islands');
    await pickEntry('Set origin');
    expect(hist()).toBe('HATCHEDIT  Click the pattern\'s origin:');
    await clickAt(X + 1500, 41500);
    expect(item('H1').hatch!.origin).toEqual([X + 1500, 41500]);
    await esc();
    await right(X + 4000, 42000);
    await pickEntry('Hatch tools', 'Edit hatch…');
    await until(() => !!document.querySelector('[role="toolbar"][aria-label="Edit hatch"]'));
  });

  it('a polyline: Close / Open, Reverse direction, Use as room boundary, Explode', async () => {
    await start([{ id: 'P1', kind: 'pline', layer: '0', pts: [[X, 60000], [X + 4000, 60000], [X + 4000, 63000]] }]);
    await clickAt(X + 1000, 60000);
    await right(X + 1000, 60000);
    await pickEntry('Polyline tools', 'Close');
    expect(item('P1').closed).toBe(true);
    await right(X + 1000, 60000);
    await pickEntry('Polyline tools', 'Reverse direction');
    expect(item('P1').pts).toEqual([[X + 4000, 63000], [X + 4000, 60000], [X, 60000]]);
    await right(X + 1000, 60000);
    await pickEntry('Polyline tools', 'Use as room boundary');
    expect(hist()).toMatch(/^Room area = 6(\.0+)? m² — add it as a room in the panel on the right$/);
    await right(X + 1000, 60000);
    await pickEntry('Polyline tools', 'Explode');
    expect(sketchOf(project, F).filter((x) => x.kind === 'line')).toHaveLength(3);
  });

  it('a hot grip: a click on it (no drag), then right-click: Add vertex, Remove vertex, Move from this point', async () => {
    await start([{ id: 'G1', kind: 'pline', layer: '0', pts: [[X, 80000], [X + 4000, 80000], [X + 4000, 83000]] }]);
    await clickAt(X + 1000, 80000);
    await right(X + 1000, 80000);
    expect(entry('Polyline tools')).toBeTruthy(); // not on a grip: the polyline's menu
    await esc();
    await clickAt(X + 1000, 80000);
    await press(X + 2000, 80000); // the first side's grip
    expect(hist()).toMatch(/^GRIP {2}Hot grip/);
    await right(X + 2000, 80000);
    await pickEntry('Add vertex');
    expect(item('G1').pts).toEqual([[X, 80000], [X + 2000, 80000], [X + 4000, 80000], [X + 4000, 83000]]);
    await press(X + 4000, 83000);
    await right(X + 4000, 83000);
    await pickEntry('Remove vertex');
    expect(item('G1').pts).toEqual([[X, 80000], [X + 2000, 80000], [X + 4000, 80000]]);
    await press(X, 80000);
    await right(X, 80000);
    await pickEntry('Move from this point');
    expect(state.tool).toBe('move');
    await clickAt(X, 90000);
    expect(item('G1').pts[0]).toEqual([X, 90000]);
  });
});

describe('right-click menus: fixes from the audit of 2026-11-11', () => {
  const X = 200000, F = 'sample-villa-gf.dxf';
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const right = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); }); };
  const labels = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] > button')].map((b) => rowLabel(b));
  const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => (rowLabel(b)) === label)!;
  const pickEntry = async (...path: string[]) => { for (const l of path) { const b = entry(l); expect(b, l).toBeTruthy(); await act(async () => { b.click(); }); } };
  const esc = () => act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  const start = async (p: Project) => { project = p; act(() => root.render(<Host start={p} />)); await flush(); act(() => state.toggle('osnap')); };
  const item = (id: string) => sketchOf(project, F).find((x) => x.id === id);
  const line: SketchItem = { id: 'L1', kind: 'line', layer: '0', pts: [[X, 0], [X + 4000, 0]] };

  it('a dimension: Dimension style lists the project\'s styles and applies one', async () => {
    const dim: SketchItem = { id: 'D1', kind: 'dim', layer: '0', pts: [[X, 20000], [X + 4000, 20000], [X + 2000, 21000]], h: 250 };
    await start({ ...villa, cadDimStyles: { styles: [{ name: 'Arch', textMm: 3.5 } as CadDimStyle], current: 'Standard' }, cadSketch: [{ file: F, items: [dim] }] });
    await clickAt(X + 1000, 21000);
    await right(X + 1000, 21000);
    await pickEntry('Dimension tools', 'Dimension style', 'Arch');
    expect(item('D1')!.h).toBeCloseTo(3.5 * unitsPerPaperMm(annoOf(project), 0.001), 6);
    expect(item('D1')!.look).toBeDefined();
  });

  it('drawn objects: Repeat the last command first, Properties and Options last; Cut (Ctrl+X) copies and erases, Paste brings it back', async () => {
    await start({ ...villa, cadSketch: [{ file: F, items: [line] }] });
    await command('COUNT');
    act(() => state.setShowProps(false));
    await clickAt(X + 1000, 0);
    await right(X + 1000, 0);
    expect(labels()[0]).toBe('Repeat COUNT');
    expect(labels().slice(-2)).toEqual(['Properties', 'Options…']);
    await pickEntry('Properties');
    expect(state.showProps).toBe(true);
    await right(X + 1000, 0);
    await pickEntry('Clipboard', 'Cut');
    expect(item('L1')).toBeUndefined();
    expect(hist()).toBe('CUTCLIP  1 object cut to the clipboard · ⌘Z to undo');
    await command('PASTEORIG');
    expect(hist()).toMatch(/^PASTEORIG {2}Not in the drawing the objects came from/); // the clipboard has it
  });

  it('a layout made with +: right-click inside its viewport for Viewport scale ▸ and Show on the Model tab, outside for the layout\'s own commands', async () => {
    await start(villa);
    act(() => (document.querySelector('[aria-label="New layout"]') as HTMLButtonElement).click());
    expect(state.layout).toBe('dwg:Layout2');
    await until(() => !!document.querySelector('.cad-filepaper'));
    const paperRight = (x: number, y: number) => act(async () => { document.querySelector('.cad-filepaper')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })); });
    // jsdom lays the pane out at 0 × 0: the paper is fitted round (0, 0), its viewport over that point.
    await paperRight(0, 0);
    expect(labels()).toEqual(['Activate (model space)', 'Show on the Model tab', 'Viewport scale', 'Lock display', 'Frame prints', 'Clip to an outline…', 'Erase viewport', 'Plot this layout…', 'Page setup…']);
    await pickEntry('Viewport scale', '1:50');
    const v = drawingLayoutsOf(project, F)[0].viewports[0];
    expect(v.vh).toBeCloseTo(v.h * 50, 6); // mm drawing: vh = h × 50 drawing units
    await paperRight(40, 0);
    expect(labels()).toEqual(['New viewport', 'Arrange viewports', 'Plot this layout…', 'Page setup…', 'New layout', 'From another drawing…', 'Layout manager…', 'Rename layout…', 'Copy layout', 'Delete layout', 'Model tab']);
    await esc();
    await paperRight(0, 0);
    await pickEntry('Show on the Model tab');
    expect(state.layout).toBeNull();
    // Back on the layout: Arrange viewports ▸ and Page setup… are in the paper's menu too.
    act(() => state.setLayout('dwg:Layout2'));
    await until(() => !!document.querySelector('.cad-filepaper'));
    await paperRight(40, 0);
    await pickEntry('Arrange viewports', 'Two: side by side');
    expect(drawingLayoutsOf(project, F)[0].viewports).toHaveLength(2);
    await paperRight(40, 0);
    await pickEntry('Page setup…');
    expect(document.querySelector('[aria-label="Page setup"]')).not.toBeNull();
    act(() => button('Cancel').click());
  });
});

describe('block editor (BEDIT, BSAVE, BCLOSE)', () => {
  const X = 200000, F = 'sample-villa-gf.dxf', ED = 'Block B1 = sample-villa-gf.dxf.dxf';
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const right = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); }); };
  const B1: CadBlockDef = { name: 'B1', items: [{ id: 'b1', kind: 'line', layer: '0', pts: [[0, 0], [2000, 0]] }] };
  const ins = (id: string, y: number): SketchItem => ({ id, kind: 'insert', layer: '0', pts: [[X, y]], block: 'B1' });
  const def = () => blockDefOf(blockDefsOf(project, F), 'B1')!;

  it('opens a block from its right-click menu, saves what is drawn into it (every insert follows), and closes it, asking to save', async () => {
    const p: Project = { ...villa, cadBlockDefs: [{ file: F, defs: [B1] }], cadSketch: [{ file: F, items: [ins('I1', 0), ins('I2', 5000)] }] };
    project = p; act(() => root.render(<Host start={p} />)); await flush(); act(() => state.toggle('osnap'));
    await clickAt(X + 1000, 0);
    await right(X + 1000, 0);
    await chooseMenu('Block tools', 'Open block editor');
    await until(() => state.view?.file === ED);
    expect(document.querySelector('.cad-tabs [role="tab"][aria-selected="true"]')!.textContent).toBe('Block editor · B1 (in sample-villa-gf.dxf)');
    expect(sketchOf(project, ED).map((it) => it.kind)).toEqual(['line']);
    // Draw in it: a second line, then BSAVE; both inserts show it.
    await command('L'); await clickAt(0, 500); await clickAt(2000, 500); await command('');
    await command('SAVE');
    expect(hist()).toBe('BSAVE  "B1" saved: 2 objects · 2 inserts in sample-villa-gf.dxf updated · ⌘Z to undo');
    expect(def().items[1].layer).toBe('0');
    expect(def().items.map((it) => it.pts.map(([x, y]) => [Math.round(x / 10) * 10 + 0, Math.round(y / 10) * 10 + 0]))).toEqual([[[0, 0], [2000, 0]], [[0, 500], [2000, 500]]]);
    // A change not saved: BCLOSE asks; No closes without it, back on the drawing.
    await command('L'); await clickAt(0, 900); await clickAt(1000, 900); await command('');
    await command('BCLOSE');
    expect(hist()).toBe('BCLOSE  Save the changes to "B1"? [Yes/No/Cancel] <Yes>:');
    await command('N');
    expect(state.view?.file).toBe(F);
    expect(def().items).toHaveLength(2);
    expect(sketchOf(project, ED)).toEqual([]);
    expect(blockDefsOf(project, ED)).toEqual([]);
  });

  it('BEDIT and a name opens it; BEDIT alone with nothing picked lists the blocks; BSAVE outside the editor says so', async () => {
    const p: Project = { ...villa, cadBlockDefs: [{ file: F, defs: [B1, { ...B1, name: 'B2' }] }] };
    project = p; act(() => root.render(<Host start={p} />)); await flush();
    await command('BEDIT');
    expect(hist()).toBe('BEDIT  Pick a block, or type BEDIT and its name: B1, B2');
    await command('BSAVE');
    expect(hist()).toBe('BSAVE  Not in the block editor (BEDIT opens a block in it).');
    await command('BEDIT b2');
    await until(() => state.view?.file === 'Block B2 = sample-villa-gf.dxf.dxf');
    await command('BCLOSE');
    expect(state.view?.file).toBe(F);
  });
});

describe('edit block in place (REFEDIT, REFCLOSE)', () => {
  const X = 200000, F = 'sample-villa-gf.dxf';
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const right = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); }); };
  const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => (rowLabel(b)) === label)!;
  const B1: CadBlockDef = { name: 'B1', items: [{ id: 'b1', kind: 'line', layer: '0', pts: [[0, 0], [2000, 0]] }] };
  const ins = (id: string, y: number): SketchItem => ({ id, kind: 'insert', layer: '0', pts: [[X, y]], block: 'B1' });
  const def = () => blockDefOf(blockDefsOf(project, F), 'B1')!;
  const items = () => sketchOf(project, F);
  const start = async () => {
    const p: Project = { ...villa, cadBlockDefs: [{ file: F, defs: [B1] }], cadSketch: [{ file: F, items: [ins('I1', 0), ins('I2', 5000)] }] };
    project = p; act(() => root.render(<Host start={p} />)); await flush(); act(() => state.toggle('osnap'));
  };
  const round = (pts: [number, number][]) => pts.map(([x, y]) => [Math.round(x / 10) * 10 + 0, Math.round(y / 10) * 10 + 0]);

  it('from a block\'s menu: its objects picked out where it stands, the rest locked; what is drawn joins it; REFCLOSE Save redefines it', async () => {
    await start();
    await clickAt(X + 1000, 0);
    await right(X + 1000, 0);
    await chooseMenu('Block tools', 'Edit block in place');
    expect(hist()).toMatch(/^REFEDIT {2}Editing "B1" in place: its 1 object picked out, the rest faded and locked/);
    expect(items().map((it) => it.kind)).toEqual(['insert', 'line']); // I2 stays; I1 is its line now
    expect(project.cadRefEdit).toMatchObject({ file: F, index: 0, others: ['I2'] });
    // The other insert is locked: a click on it picks nothing; the block's line can be picked.
    await clickAt(X + 1000, 5000);
    expect(state.selected).toBeNull();
    await command('L'); await clickAt(X, 500); await clickAt(X + 2000, 500); await command('');
    await command('SAVE');
    expect(hist()).toBe('SAVE  "B1" is being edited in place: REFCLOSE first (Save or Discard).');
    await command('REFCLOSE');
    expect(hist()).toBe('REFCLOSE  Save the changes to "B1"? [Save/Discard/Cancel] <Save>:');
    await command('');
    expect(project.cadRefEdit).toBeUndefined();
    expect(items().map((it) => it.id)).toEqual(['I1', 'I2']);
    expect(def().items.map((it) => round(it.pts))).toEqual([[[0, 0], [2000, 0]], [[0, 500], [2000, 500]]]);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('REFCLOSE  "B1" saved: 2 objects · 2 inserts in sample-villa-gf.dxf updated · ⌘Z to undo');
  });

  it('REFEDIT on the block picked, the line erased, then Discard changes on the blank menu: all as it was', async () => {
    await start();
    await clickAt(X + 1000, 0);
    await command('REFEDIT');
    await clickAt(X + 1000, 0);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
    expect(items().map((it) => it.id)).toEqual(['I2']);
    await right(X + 50000, 50000);
    await act(async () => { entry('Discard changes').click(); });
    expect(project.cadRefEdit).toBeUndefined();
    expect(items().map((it) => it.id)).toEqual(['I1', 'I2']);
    expect(def()).toEqual(B1);
  });
});

describe('Design CAD hatch package: islands, associative hatches, HATCHEDIT and BOUNDARY', () => {
  const X = 200000, F = 'sample-villa-gf.dxf';
  const sq = (id: string, x0: number, y0: number, x1: number, y1: number): SketchItem => ({ id, kind: 'pline', layer: 'LV-SKETCH', closed: true, pts: [[X + x0, y0], [X + x1, y0], [X + x1, y1], [X + x0, y1]] });
  const withItems = (...it: SketchItem[]): Project => ({ ...villa, cadSketch: [{ file: F, items: it }] });
  const items = () => project.cadSketch![0].items;
  const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][1];
  const hist = () => state.history[state.history.length - 1];
  const begin = async (p: Project) => { act(() => root.render(<Host start={p} />)); await flush(); await until(() => !!state.view && !!document.querySelector('canvas.cad-over')); act(() => state.toggle('osnap')); };
  const dblClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('dblclick', { clientX: sx, clientY: sy, button: 0, bubbles: true })); });
  };
  const press = async (label: string) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === label); expect(b, label).toBeTruthy(); await act(async () => { b!.click(); }); };
  const outer = sq('S1', 0, 0, 10000, 10000), island = sq('S2', 2000, 2000, 4000, 4000);
  /** The Hatch strip (H) or Edit hatch strip (HE), shown inline here: the ribbon is not part of this page. */
  const strip = (label = 'Hatch') => document.querySelector(`[role="toolbar"][aria-label="${label}"]`);
  const aria = async (label: string) => { const b = document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement; expect(b, label).toBeTruthy(); await act(async () => { b.click(); }); };
  const pickPattern = async (name: string) => { await aria('All patterns'); const o = [...document.querySelectorAll('[role="dialog"] [role="option"]')].find((x) => x.textContent === name) as HTMLElement; expect(o, name).toBeTruthy(); await act(async () => { o.click(); }); };
  const pressed = (label: string) => [...document.querySelectorAll('button')].find((x) => x.textContent === label)!.getAttribute('aria-pressed');

  it('HATCH leaves the closed objects inside clear as islands and follows the boundary; the message says so', async () => {
    await begin(withItems(outer, island));
    await command('H');
    expect(strip()).not.toBeNull();
    expect([pressed('Islands'), pressed('Follow boundary')]).toEqual(['true', 'true']);
    await clickAt(X + 6000, 1000);
    expect(last()).toBe('Hatch ANSI31, 96.00 m² · 1 island · associative · ⌘Z to undo');
    expect(items()[2]).toMatchObject({ kind: 'pline', layer: 'LV-HATCH', holes: [island.pts], assoc: ['S1', 'S2'] });
    // With both ticks off: the whole outline, tied to nothing.
    for (const l of ['Islands', 'Follow boundary']) await press(l);
    expect([pressed('Islands'), pressed('Follow boundary')]).toEqual(['false', 'false']);
    await clickAt(X + 6000, 1000);
    expect(last()).toBe('Hatch ANSI31, 100.00 m² · ⌘Z to undo');
    expect(items()[3].holes).toBeUndefined();
    expect(items()[3].assoc).toBeUndefined();
  });

  it('HATCH finds an area closed by drawn lines when there is no closed object or room', async () => {
    const line = (id: string, a: [number, number], b: [number, number]): SketchItem => ({ id, kind: 'line', layer: 'LV-SKETCH', pts: [[X + a[0], a[1]], [X + b[0], b[1]]] });
    await begin(withItems(line('L1', [0, 0], [10000, 0]), line('L2', [10000, 0], [10000, 10000]), line('L3', [10000, 10000], [0, 10000]), line('L4', [0, 10000], [0, 0])));
    await command('H');
    await clickAt(X + 5000, 5000);
    expect(last()).toMatch(/^Hatch ANSI31, 9\d\.\d\d m² · ⌘Z to undo$/); // the area the lines close (not a room), found a little inside them
    expect(items()[4].assoc).toBeUndefined();
  });

  it('HE edits the hatch clicked: pattern, then its islands removed, one undo step each; Enter ends', async () => {
    await begin(withItems(outer, island));
    await command('H');
    await clickAt(X + 6000, 1000);
    await command('HE');
    expect(hist()).toBe('Command: HATCHEDIT  Select a hatch (its settings are in the Hatch strip):');
    await clickAt(X + 6000, 1000);
    await until(() => !!strip('Edit hatch') && !!document.querySelector('[role="option"][aria-selected="true"]'));
    await aria('Remove: more');
    expect((document.querySelector('[role="menu"] [role="menuitem"]:last-child') as HTMLButtonElement).disabled).toBe(false); // one island to hatch again
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    const calls = onChange.mock.calls.length;
    await pickPattern('Brick');
    expect(onChange.mock.calls.length).toBe(calls + 1);
    expect(last()).toBe('HATCHEDIT  Pattern BRICK · ⌘Z to undo');
    expect(items()[2].hatch).toMatchObject({ pattern: 'brick', scale: 3 });
    expect(items()[2].assoc).toEqual(['S1', 'S2']);
    await aria('Remove: more');
    await press('Hatch an island again');
    expect(pressed('Remove')).toBe('true');
    expect(hist()).toBe('HATCHEDIT  Click inside an island to hatch it again (Enter ends):');
    await clickAt(X + 3000, 3000);
    expect(last()).toBe('HATCHEDIT  Island hatched again (0 left) · ⌘Z to undo');
    expect(items()[2].holes).toBeUndefined();
    expect(items()[2].assoc).toEqual(['S1']);
    expect((document.querySelector('button[aria-label="Remove: more"]') as HTMLButtonElement).disabled).toBe(false);
    await press('Remove');
    expect(hist()).toBe('HATCHEDIT  Click inside closed objects in the hatch to keep clear (Enter ends):');
    await clickAt(X + 3000, 3000);
    expect(last()).toBe('HATCHEDIT  Island added (1) · ⌘Z to undo');
    expect(items()[2].holes).toEqual([island.pts]);
    expect(items()[2].assoc).toEqual(['S1', 'S2']);
    await command('');
    expect(state.tool).toBe('hatchedit'); // the question ends first
    await command('');
    expect(state.tool).toBe('none');
  });

  it('HE sets the pattern\'s origin by a click; Associative can be turned off (it says so)', async () => {
    await begin(withItems(outer, island));
    await command('H');
    await clickAt(X + 6000, 1000);
    await command('HE');
    await clickAt(X + 6000, 1000);
    await until(() => !!strip('Edit hatch') && !!document.querySelector('[role="option"][aria-selected="true"]'));
    await press('Set point');
    expect(pressed('Set point')).toBe('true');
    expect(hist()).toBe('HATCHEDIT  Click the pattern\'s origin:');
    await clickAt(X + 5000, 5000);
    expect(items()[2].hatch!.origin).toEqual([X + 5000, 5000]);
    expect(last()).toMatch(/^HATCHEDIT {2}Origin .* · ⌘Z to undo$/);
    expect(pressed('Set point')).toBe('false');
    await press('Follow boundary');
    expect(items()[2].assoc).toBeUndefined();
    expect(last()).toBe('HATCHEDIT  No longer associative · ⌘Z to undo');
    expect([...document.querySelectorAll('button')].find((x) => x.textContent === 'Follow boundary')!.disabled).toBe(true);
  });

  it('a double-click on a hatch edits it; HE with a hatch picked first edits it at once', async () => {
    await begin(withItems(outer, island));
    await command('H');
    await clickAt(X + 6000, 1000);
    act(() => state.setTool('none'));
    await dblClickAt(X + 6000, 1000);
    expect(state.tool).toBe('hatchedit');
    await until(() => !!strip('Edit hatch'));
    await command('');
    expect(state.tool).toBe('none');
    // Picked first (in a window with the objects it was made from): the hatches among them are edited at once.
    await dragWindow([X - 500, -500], [X + 10500, 10500]);
    await command('HE');
    await until(() => !!strip('Edit hatch'));
  });

  it('the Hatch strip shows while H or HE runs (in the ribbon\'s place, inline here), and Done leaves it', async () => {
    await begin(withItems(outer, island));
    expect(strip()).toBeNull();
    expect(strip('Edit hatch')).toBeNull();
    await command('H');
    expect(strip()).not.toBeNull();
    expect(pressed('Pick point')).toBe('true');
    await press('Done');
    expect(state.tool).toBe('none');
    expect(strip()).toBeNull();
    await command('H');
    await clickAt(X + 6000, 1000);
    await command('HE');
    expect(strip()).toBeNull();
    expect(strip('Edit hatch')).not.toBeNull();
    expect(pressed('Select')).toBe('true'); // click a hatch to edit
    await press('Done');
    expect(state.tool).toBe('none');
    expect(strip('Edit hatch')).toBeNull();
    expect(document.querySelector('[role="toolbar"][aria-label="Hatch"]')).toBeNull();
  });

  it('H with Select hatches the closed object clicked on (its islands clear), and says so when there is none there', async () => {
    await begin(withItems(outer, island));
    await command('H');
    await press('Select');
    expect(pressed('Select')).toBe('true');
    expect(hist()).toBe('HATCH  Click a closed polyline, rectangle or circle to hatch it:');
    const calls = onChange.mock.calls.length;
    await clickAt(X + 5000, 7000); // inside, not on an object
    expect(hist()).toMatch(/^HATCH {2}No closed polyline, rectangle or circle there/);
    expect(onChange.mock.calls.length).toBe(calls);
    await clickAt(X + 10000, 5000); // on the outer's edge
    expect(last()).toBe('Hatch ANSI31, 96.00 m² · 1 island · associative · ⌘Z to undo');
    expect(items()[2]).toMatchObject({ kind: 'pline', layer: 'LV-HATCH', holes: [island.pts], assoc: ['S1', 'S2'] });
    expect(pressed('Select')).toBe('true'); // stays, to hatch the next one
    await clickAt(X + 4000, 3000); // the island's own edge: a hatch of just that
    expect(last()).toBe('Hatch ANSI31, 4.00 m² · associative · ⌘Z to undo');
    expect(items()[3].assoc).toEqual(['S2']);
  });

  it('H with Set point: the next click sets the origin of the hatches to come, then Pick point is back', async () => {
    await begin(withItems(outer, island));
    await command('H');
    await press('Set point');
    expect(pressed('Set point')).toBe('true');
    expect(hist()).toBe('HATCH  Click the pattern origin for the next hatches:');
    const calls = onChange.mock.calls.length;
    await clickAt(X + 5000, 5000);
    expect(onChange.mock.calls.length).toBe(calls); // no hatch made by that click
    expect(hist()).toMatch(/^HATCH {2}Pattern origin set at .* Pick an internal point:$/);
    expect([pressed('Set point'), pressed('Pick point')]).toEqual(['false', 'true']);
    await clickAt(X + 6000, 1000);
    expect(items()[2].hatch!.origin).toEqual([X + 5000, 5000]);
    // Reset to 0, 0 takes it away again.
    await aria('Origin: more');
    await press('Reset to 0, 0');
    await clickAt(X + 6000, 1000);
    expect(items()[3].hatch!.origin).toBeUndefined();
  });

  it('H with Match copies a hatch\'s pattern, scale, angle and origin to the next one; no hatch there says so', async () => {
    const other: SketchItem = { ...sq('S3', 20000, 0, 24000, 4000), layer: 'LV-HATCH', hatch: { pattern: 'brick', scale: 5, angle: 30, origin: [X + 21000, 1000] } };
    await begin(withItems(outer, island, other));
    await command('H');
    await press('Match');
    expect(pressed('Match')).toBe('true');
    await clickAt(X + 12000, 12000);
    expect(hist()).toMatch(/^HATCH {2}No hatch there/);
    expect(pressed('Match')).toBe('true');
    await clickAt(X + 22000, 2000);
    expect(hist()).toMatch(/^HATCH {2}Matched BRICK: scale 5 mm, angle 30°/);
    expect(pressed('Pick point')).toBe('true');
    await clickAt(X + 6000, 1000);
    expect(items()[3].hatch).toEqual({ pattern: 'brick', scale: 5, angle: 30, origin: [X + 21000, 1000] });
  });

  it('HE with Match copies another hatch onto the one edited, one undo step', async () => {
    const other: SketchItem = { ...sq('S3', 20000, 0, 24000, 4000), layer: 'LV-HATCH', hatch: { pattern: 'brick', scale: 5, angle: 30 } };
    await begin(withItems(outer, island, other));
    await command('H');
    await clickAt(X + 6000, 1000);
    await command('HE');
    await clickAt(X + 6000, 1000);
    await until(() => !!document.querySelector('[role="option"][aria-selected="true"]'));
    await press('Match');
    expect(hist()).toBe('HATCHEDIT  Click the hatch to copy the pattern from (Esc steps back):');
    const calls = onChange.mock.calls.length;
    await clickAt(X + 12000, 12000);
    expect(hist()).toMatch(/^HATCHEDIT {2}No hatch there/);
    expect(onChange.mock.calls.length).toBe(calls);
    await clickAt(X + 22000, 2000);
    expect(onChange.mock.calls.length).toBe(calls + 1);
    expect(last()).toBe('HATCHEDIT  Matched to BRICK: scale 5 mm, angle 30° · ⌘Z to undo');
    expect(items()[3].hatch).toEqual({ pattern: 'brick', scale: 5, angle: 30 });
    expect(pressed('Match')).toBe('false');
  });

  it('HE: Outline draws a closed polyline along the hatch on the current layer, one undo step, and says how many', async () => {
    await begin(withItems(outer, island));
    await command('H');
    await clickAt(X + 6000, 1000);
    await command('HE');
    await clickAt(X + 6000, 1000);
    await until(() => !!document.querySelector('[role="option"][aria-selected="true"]'));
    const calls = onChange.mock.calls.length, n = items().length;
    await press('Outline');
    expect(onChange.mock.calls.length).toBe(calls + 1);
    expect(items()).toHaveLength(n + 1);
    expect(items()[n]).toMatchObject({ kind: 'pline', closed: true, layer: 'LV-SKETCH', pts: outer.pts });
    expect(items()[n].hatch).toBeUndefined();
    expect(last()).toBe('HATCHEDIT  1 outline drawn on LV-SKETCH · ⌘Z to undo');
  });

  it('HE: Origin list sets the corner or centre of the boundary, and Reset takes it away, one step each', async () => {
    await begin(withItems(outer, island));
    await command('H');
    await clickAt(X + 6000, 1000);
    await command('HE');
    await clickAt(X + 6000, 1000);
    await until(() => !!document.querySelector('[role="option"][aria-selected="true"]'));
    await aria('Origin: more');
    await press('Centre of the boundary');
    expect(items()[2].hatch!.origin).toEqual([X + 5000, 5000]);
    await aria('Origin: more');
    await press('Bottom left of the boundary');
    expect(items()[2].hatch!.origin).toEqual([X, 0]);
    await aria('Origin: more');
    await press('Reset to 0, 0');
    expect(items()[2].hatch!.origin).toBeUndefined();
    expect(last()).toBe('HATCHEDIT  Origin reset to 0, 0 · ⌘Z to undo');
  });

  it('BOUNDARY makes a closed polyline round the area and one per island, and repeats; I turns islands off', async () => {
    await begin(withItems(outer, island));
    await command('BO');
    expect(hist()).toBe('Command: BOUNDARY  Pick internal point or [Islands] <Islands on>:');
    await clickAt(X + 6000, 1000);
    expect(last()).toBe('BOUNDARY  1 polyline and 1 island made · ⌘Z to undo');
    expect(items().slice(2).map((x) => [x.kind, x.closed, x.layer])).toEqual([['pline', true, 'LV-SKETCH'], ['pline', true, 'LV-SKETCH']]);
    expect(items()[2].pts).toEqual(outer.pts);
    expect(items()[3].pts).toEqual(island.pts);
    await command('I');
    expect(hist()).toBe('BOUNDARY  Pick internal point or [Islands] <Islands off>:');
    await clickAt(X + 6000, 1000);
    expect(last()).toBe('BOUNDARY  1 polyline made · ⌘Z to undo');
    expect(items()).toHaveLength(5);
    expect(state.tool).toBe('boundary');
    await command('');
    expect(state.tool).toBe('none');
  });
});

describe('Objects of an opened drawing edit like drawn ones (taken over on the first edit)', () => {
  const F = 'sample-villa-gf.dxf', WALL: [number, number] = [15900, 6000]; // a wall line (A-WALL)
  const last = () => state.history[state.history.length - 1];
  const items = () => project.cadSketch?.find((s) => s.file === F)?.items ?? [];
  const begin = async () => { act(() => root.render(<Host />)); await flush(); act(() => state.toggle('osnap')); };

  it('Move takes the picked object over as a drawn one (its layer, the handle erased) and the move joins that undo step', async () => {
    await begin();
    await clickAt(...WALL);
    await command('M');
    await until(() => onChange.mock.calls.length > 0);
    expect(onChange.mock.calls[0][1]).toBe(`MOVE  1 object of ${F} taken over as drawn objects`);
    expect(onChange.mock.calls[0][2]).toBeUndefined(); // the take-over is a step of its own
    expect(project.cadErased?.[F]).toHaveLength(1);
    expect(items().map((x) => [x.kind, x.layer])).toEqual([['line', 'A-WALL']]);
    const was = items()[0].pts[0];
    await until(() => state.tool === 'move' && !!state.selected);
    await clickAt(...WALL); await clickAt(WALL[0] + 500, WALL[1]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][1]).toMatch(/^Moved/);
    expect(onChange.mock.calls[1][2]).toBe(true); // joins the take-over: one ⌘Z for both
    expect(items()[0].pts[0][0]).toBeCloseTo(was[0] + 500, 3);
    expect(onUndo).not.toHaveBeenCalled();
  });

  /** The next explode answers with these pieces for the object asked about (the take-over asks for the exact ones). */
  const asPieces = (pieces: unknown[]) => vi.mocked(explodeObjects).mockImplementationOnce(async (_v, handles) => ({ pieces: { [handles[0]]: pieces as never }, truncated: false }));
  const L = { layer: 'A-WALL' }, sq = [[0, 0, 0], [3000, 0, 0], [3000, 3000, 0], [0, 3000, 0]];

  it('a paragraph text of the drawing is taken over as a note; the engine is asked for exact pieces', async () => {
    await begin();
    asPieces([{ ...L, kind: 'mtext', at: [100, 200], h: 250, rot: 0, w: 3000, attach: 5, lsp: 1, text: '{\\fArial|b1;Notes}\\PSecond' }]);
    await clickAt(...WALL);
    await command('M');
    await until(() => onChange.mock.calls.length > 0);
    const asked = vi.mocked(explodeObjects).mock.calls; expect(asked[asked.length - 1][2]).toEqual({ exact: true });
    expect(items().map((x) => [x.kind, x.layer, x.just, x.w, x.h])).toEqual([['mtext', 'A-WALL', 'MC', 3000, 250]]);
    expect(items()[0].note?.map((q) => q.runs.map((r) => r.s).join(''))).toEqual(['Notes', 'Second']);
    expect(items()[0].note?.[0].runs[0].b).toBe(true);
  });

  it('a patterned hatch keeps its pattern; splines taken over as polylines are counted in the message', async () => {
    await begin();
    asPieces([{ ...L, kind: 'hatch', loops: [sq], solid: false, pattern: 'ANSI31', scale: 1, angle: 0, origin: [0, 0], lines: [{ angle: Math.PI / 4, base: [0, 0], offset: [-300 / Math.SQRT2, 300 / Math.SQRT2], dashes: [] }] }, // 3 paper mm at 100 units per mm
      { ...L, kind: 'pline', pts: [[0, 0, 0], [10, 10, 0], [20, 0, 0]], closed: false, sampled: 'spline' }, { ...L, kind: 'pline', pts: [[0, 0, 0], [5, 5, 0]], closed: false, sampled: 'spline' }]);
    await clickAt(...WALL);
    await command('M');
    await until(() => onChange.mock.calls.length > 0);
    expect(onChange.mock.calls[0][1]).toBe(`MOVE  1 object of ${F} taken over as drawn objects · 2 splines as polylines`);
    expect(items().map((x) => [x.kind, x.hatch?.pattern, x.hatch?.custom])).toEqual([['pline', 'ansi31', undefined], ['pline', undefined, undefined], ['pline', undefined, undefined]]);
    expect(items()[0].hatch?.angle).toBeCloseTo(0, 6);
    expect(items()[0].hatch?.scale).toBeCloseTo(3, 6);
  });

  it('an aligned dimension of the drawing is taken over as one drawn dimension in the current style', async () => {
    await begin();
    asPieces([{ ...L, kind: 'group', items: [{ ...L, kind: 'line', a: [0, 0], b: [1, 0] }], dim: { kind: 'aligned', pts: [[0, 0], [5000, 0], [5000, 800]], text: '<> mm', height: 150, arrow: 120, decimals: 0 } }]);
    await clickAt(...WALL);
    await command('M');
    await until(() => onChange.mock.calls.length > 0);
    expect(items().map((x) => [x.kind, x.layer, x.pts, x.text, x.h, x.look?.size, x.look?.decimals])).toEqual([['dim', 'A-WALL', [[0, 0], [5000, 0], [5000, 800]], '<> mm', 150, 120, 0]]);
  });

  it('a tool given up after the take-over undoes it', async () => {
    await begin();
    await clickAt(...WALL);
    await command('M');
    await until(() => !!project.cadErased?.[F]?.length && state.tool === 'move' && !!state.selected);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await until(() => onUndo.mock.calls.length === 1);
    await until(() => last() === "MOVE  Cancelled: the drawing's objects are as they were.");
  });

  it('Copy keeps the original: the copy is a drawn object, nothing is erased', async () => {
    await begin();
    await clickAt(...WALL);
    await command('CO');
    await until(() => state.tool === 'copy');
    await flush();
    await clickAt(...WALL); await clickAt(WALL[0] + 500, WALL[1]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toMatch(/^COPY {2}1 object copied as drawn objects/);
    expect(onChange.mock.calls[0][2]).toBeUndefined();
    expect(project.cadErased?.[F] ?? []).toEqual([]);
    expect(items().map((x) => [x.kind, x.layer])).toEqual([['line', 'A-WALL']]);
  });

  it('refuses on a locked layer, with nothing changed', async () => {
    await begin();
    await clickAt(...WALL);
    await command('LAYLCK');
    expect(last()).toMatch(/^LAYLCK {2}Layer A-WALL locked/);
    await command('M');
    await until(() => /on locked layer A-WALL: unlock it first \(LAYULK\)\.$/.test(last()));
    expect(last()).toBe('MOVE  1 object on locked layer A-WALL: unlock it first (LAYULK).');
    expect(onChange).toHaveBeenCalledTimes(1); // the lock only
    expect(project.cadErased?.[F] ?? []).toEqual([]);
    await until(() => state.tool === 'none');
  });

  it('a window pick finds the drawing\'s objects, and Select similar asks the engine for the like ones', async () => {
    await begin();
    await dragWindow([16500, 12500], [-500, -500]); // right to left: crossing, so the walls and blocks all show
    expect(last()).toMatch(/^SEL {2}\d+ objects? selected/);
    const n = Number(/(\d+) object/.exec(last())![1]);
    expect(n).toBeGreaterThan(5);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await clickAt(...WALL);
    const like = vi.spyOn(state.view!, 'pickLike');
    await command('SELECTSIMILAR');
    await until(() => like.mock.calls.length > 0);
    expect(like.mock.calls[0].slice(0, 3)).toEqual(['Line', expect.any(Number), '']);
    await until(() => /^SELECTSIMILAR {2}\d+ objects? selected/.test(last()));
  });

  it('a grip dragged on an object of the drawing is one change: the handle erased, its stand-in moved', async () => {
    await begin();
    await clickAt(...WALL);
    await until(() => !!document.querySelector('[aria-label="Edit drawn objects"]')); // the toolbar shows for it, from its stand-in
    expect(onChange).not.toHaveBeenCalled();
    const [gx, gy] = screenOf(15900, 12000), [tx, ty] = screenOf(15900, 11000), c = document.querySelector('canvas.cad-over')!;
    await act(async () => {
      c.dispatchEvent(new MouseEvent('mousedown', { clientX: gx, clientY: gy, button: 0, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mousemove', { clientX: tx, clientY: ty, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mouseup', { clientX: tx, clientY: ty, button: 0, bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toMatch(/^GRIP {2}Line changed/);
    expect(onChange.mock.calls[0][2]).toBeUndefined();
    expect(project.cadErased?.[F]).toHaveLength(1);
    expect(items().map((x) => [x.kind, x.layer, x.pts.map((q) => q.map((v) => Math.round(v)))])).toEqual([['line', 'A-WALL', [[15900, 0], [15900, 11000]]]]);
  });

  it('a change in the Properties palette is one change: the object taken over with the new layer', async () => {
    await begin();
    await clickAt(...WALL);
    const layer = () => document.querySelector('[aria-label="Properties palette"] select[aria-label="Object layer"]') as HTMLSelectElement | null;
    await until(() => !!layer());
    expect(layer()!.value).toBe('A-WALL');
    const to = [...layer()!.options].map((o) => o.value).find((v) => v && v !== 'A-WALL')!;
    await act(async () => { layer()!.value = to; layer()!.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(project.cadErased?.[F]).toHaveLength(1);
    expect(items().map((x) => [x.kind, x.layer])).toEqual([['line', to]]);
  });
});

describe('CAD 2D gap plan: MLEADER, a multileader (several leaders, one note)', () => {
  const last = () => state.history[state.history.length - 1];
  const X = 200000, F = 'sample-villa-gf.dxf';
  const editor = () => document.querySelector('.cad-ntedit') as HTMLDivElement | null;
  const words = () => document.querySelector('[aria-label="Note text"]') as HTMLDivElement | null;
  /** The drawn items, their points rounded to the millimetre (a click goes through the screen and back). */
  const items = () => sketchOf(project, F).map((it) => ({ ...it, pts: it.pts.map(([x, y]): [number, number] => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]) }));
  const keyWords = (key: string, more: KeyboardEventInit = {}) => act(() => { words()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...more })); });
  const typeWords = (lines: string[]) => act(() => {
    const el = words()!;
    el.replaceChildren();
    for (const l of lines) { const d = document.createElement('div'); d.appendChild(document.createTextNode(l)); el.appendChild(d); }
  });
  const dblClickAt = async (x: number, y: number) => {
    const [sx, sy] = screenOf(x, y);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('dblclick', { clientX: sx, clientY: sy, button: 0, bubbles: true })); });
  };
  const ml = (id: string, land: [number, number], tips: [number, number][], text: string): SketchItem => ({
    id, kind: 'mleader', layer: 'LV-ANNO', pts: [land, ...tips], h: 250, note: [{ runs: [{ s: text }] }], ml: { style: 'Standard', arrow: 'filled', size: 300, land: 250, gap: 100 }
  });
  const M1 = ml('M1', [X + 2000, 7000], [[X, 7000]], 'L1-01'), M2 = ml('M2', [X + 2600, 5000], [[X + 400, 4600]], 'L1-02'), M3 = ml('M3', [X + 3400, 3000], [[X + 800, 3200]], 'L1-03');
  const start: Project = { ...villa, cadSketch: [{ file: F, items: [M1, M2, M3] }] };
  const open = async (p: Project = start) => { act(() => root.render(<Host start={p} />)); await flush(); project = p; act(() => state.toggle('osnap')); };
  const text = (it: SketchItem) => (it.note ?? []).map((q) => q.runs.map((r) => r.s).join('')).join('\n');

  it('MLD: the arrowhead, the landing, then the note editor; Ctrl/⌘+Enter draws it in one undo step, Esc draws nothing; Esc again ends', async () => {
    await open({ ...villa });
    await command('mld');
    expect(last()).toBe('Command: MLEADER  Specify leader arrowhead location:');
    await clickAt(X, 7000);
    expect(last()).toBe('MLEADER  Specify leader landing location:');
    await clickAt(X + 2000, 7500);
    expect(editor()).not.toBeNull();
    expect(last()).toBe('MTEXT  Type the note (Enter starts a new line); Ctrl/⌘+Enter or OK keeps it, Esc cancels:');
    await typeWords(['DB-L1-01/L3']);
    await keyWords('Enter', { metaKey: true });
    expect(editor()).toBeNull();
    expect(items()).toEqual([{
      id: 'S1', kind: 'mleader', layer: 'LV-ANNO', pts: [[X + 2000, 7500], [X, 7000]], h: 250, note: [{ runs: [{ s: 'DB-L1-01/L3' }] }],
      ml: { style: 'Standard', arrow: 'filled', size: 300, land: 250, gap: 100 }
    }]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('MLEADER  Multileader · ⌘Z to undo');
    expect(state.tool).toBe('mleader');
    expect(last()).toBe('MLEADER  Specify leader arrowhead location:'); // the next one
    // Esc in the editor: nothing drawn.
    await clickAt(X, 4000);
    await clickAt(X + 2000, 4000);
    expect(editor()).not.toBeNull();
    await keyWords('Escape');
    expect(editor()).toBeNull();
    expect(state.history.slice(-2)[0]).toBe('*Cancel*');
    expect(items()).toHaveLength(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(state.tool).toBe('none');
  });

  it('MLS: the style dialog saves a style, CMLEADERSTYLE (the ribbon\'s list) sets the current one; a style with no content draws at the landing click', async () => {
    await open({ ...villa });
    await command('mls');
    expect(document.querySelector('[role="dialog"][aria-label="Multileader style"]')).not.toBeNull();
    await act(async () => { button('New').click(); });
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === 'Content')!.click(); });
    await act(async () => {
      const el = document.querySelector('[aria-label="Content"]') as HTMLSelectElement;
      el.value = 'none'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { button('Set current').click(); });
    await act(async () => { (document.querySelector('.cad-dlg-ft .p') as HTMLButtonElement).click(); });
    expect(project.cadMleaderStyles).toEqual({ styles: [{ name: 'Style 1', arrow: 'filled', arrowMm: 3, landing: true, landingMm: 2.5, content: 'none', textMm: 0, gapMm: 1, frame: false, circuit: false }], current: 'Style 1' });
    expect(last()).toBe('MLEADERSTYLE  2 multileader styles, current "Style 1" · ⌘Z to undo');
    expect(state.ribbonInfo?.mleaderStyles).toEqual({ names: ['Standard', 'Style 1'], current: 'Style 1' });
    // Content None: made at the landing click, no editor.
    await command('mld');
    await clickAt(X, 7000);
    await clickAt(X + 2000, 7000);
    expect(editor()).toBeNull();
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ kind: 'mleader', pts: [[X + 2000, 7000], [X, 7000]], ml: { style: 'Style 1' } });
    expect(items()[0].note).toBeUndefined();
    // The ribbon's list.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await command('CMLEADERSTYLE Standard');
    expect(last()).toBe('CMLEADERSTYLE  Current multileader style: Standard · ⌘Z to undo');
    expect(state.ribbonInfo?.mleaderStyles?.current).toBe('Standard');
    await command('CMLEADERSTYLE Nope');
    expect(last()).toBe('CMLEADERSTYLE  There is no multileader style Nope. MLS opens the styles.');
  });

  it('a style with the circuit fill-in starts the words with the board and circuit of the device at the arrowhead', async () => {
    const gf = { building: 'V', level: 'GF' };
    const withDevice = placeLvPoint({ ...villa, cadMleaderStyles: { styles: [{ name: 'Circuit', arrow: 'filled', arrowMm: 3, landing: true, landingMm: 2.5, content: 'note', textMm: 0, gapMm: 1, frame: false, circuit: true }], current: 'Circuit' } }, gf, 'ltg', 'DB-GF1-Y1', 6, 4).project;
    await open(withDevice);
    await command('mld');
    await clickAt(6000, 4000);
    await clickAt(8000, 5000);
    expect(editor()).not.toBeNull();
    expect(words()!.textContent).toBe('DB-GF1/Y1');
    await keyWords('Escape');
    // Away from any device: empty.
    await command('mld');
    await clickAt(X, 7000);
    await clickAt(X + 2000, 7000);
    expect(words()!.textContent).toBe('');
    await keyWords('Escape');
  });

  it('MLEADERADD: with none selected it asks for one, then each click adds a leader (one undo step each); Enter ends', async () => {
    await open();
    await command('mleaderadd');
    expect(last()).toBe('Command: MLEADERADD  Select a multileader:');
    await clickAt(X + 1000, 7000);
    expect(last()).toBe('MLEADERADD  Specify leader arrowhead location:');
    await clickAt(X + 200, 8000);
    expect(items()[0].pts).toEqual([[X + 2000, 7000], [X, 7000], [X + 200, 8000]]);
    expect(onChange.mock.calls[0][1]).toBe('MLEADERADD  Leader added · ⌘Z to undo');
    await clickAt(X + 400, 6000);
    expect(items()[0].pts).toHaveLength(4);
    expect(onChange).toHaveBeenCalledTimes(2);
    await command('');
    expect(state.tool).toBe('none');
    // With one selected first, it goes straight to the arrowhead.
    act(() => state.setSelected('sk:M2'));
    await command('mleaderadd');
    expect(last()).toBe('MLEADERADD  Specify leader arrowhead location:');
  });

  it('MLEADERREMOVE: a click removes the nearest leader; the last one stays', async () => {
    const three = { ...M1, pts: [[X + 2000, 7000], [X, 7000], [X, 8500], [X + 200, 5500]] as [number, number][] };
    await open({ ...villa, cadSketch: [{ file: F, items: [three] }] });
    await command('mleaderremove');
    expect(last()).toBe('Command: MLEADERREMOVE  Select a multileader:');
    await clickAt(X + 1000, 7000);
    expect(last()).toBe('MLEADERREMOVE  Specify leaders to remove:');
    await clickAt(X + 1000, 7800); // nearest the leader up to (X, 8500)
    expect(items()[0].pts).toEqual([[X + 2000, 7000], [X, 7000], [X + 200, 5500]]);
    expect(onChange.mock.calls[0][1]).toBe('MLEADERREMOVE  Leader removed · ⌘Z to undo');
    await clickAt(X + 1000, 6200);
    expect(items()[0].pts).toEqual([[X + 2000, 7000], [X, 7000]]);
    await clickAt(X + 1000, 7000);
    expect(last()).toBe('MLEADERREMOVE  A multileader keeps at least one leader.');
    expect(items()[0].pts).toHaveLength(2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('MLA: pick multileaders, Enter, the one to align to, a direction (Enter: vertical); one undo step', async () => {
    await open();
    await command('mla');
    expect(last()).toBe('Command: MLEADERALIGN  Select multileaders:');
    await clickAt(X + 1600, 5000);
    await clickAt(X + 2600, 3000);
    await command('');
    expect(last()).toBe('MLEADERALIGN  Select multileader to align to:');
    await clickAt(X + 1000, 7000);
    expect(last()).toBe('MLEADERALIGN  Specify direction <vertical>:');
    await command('');
    expect(onChange.mock.calls[0][1]).toBe('MLEADERALIGN  2 multileaders aligned · ⌘Z to undo');
    expect(items().map((it) => it.pts[0])).toEqual([[X + 2000, 7000], [X + 2000, 5000], [X + 2000, 3000]]);
    expect(items().map((it) => it.pts[1])).toEqual([[X, 7000], [X + 400, 4600], [X + 800, 3200]]); // the arrowheads stay
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(state.tool).toBe('none');
  });

  it('MLA with a direction clicked lines them up along it', async () => {
    await open();
    await command('mla');
    await clickAt(X + 1600, 5000);
    await command('');
    await clickAt(X + 1000, 7000);
    await clickAt(X + 3000, 8000); // 45° up from the landing at (X + 2000, 7000)
    const [x, y] = items()[1].pts[0];
    expect(x - (X + 2000)).toBeCloseTo(y - 7000, 0);
    expect([Math.round(x), Math.round(y)]).toEqual([X + 1300, 6300]);
  });

  it('MLC: pick two or more, Enter, [Vertical/Horizontal], a click for the landing; one multileader with every arrowhead, the others erased', async () => {
    await open();
    await command('mlc');
    expect(last()).toBe('Command: MLEADERCOLLECT  Select multileaders:');
    await clickAt(X + 1000, 7000);
    await command('');
    expect(last()).toBe('MLEADERCOLLECT  Pick at least two multileaders.');
    await clickAt(X + 1600, 5000);
    await command('');
    expect(last()).toBe('MLEADERCOLLECT  Specify collected multileader location or [Vertical/Horizontal] <Vertical>:');
    await command('h');
    expect(last()).toBe('MLEADERCOLLECT  Horizontal. MLEADERCOLLECT  Specify collected multileader location or [Vertical/Horizontal] <Vertical>:');
    await clickAt(X + 5000, 6000);
    expect(onChange.mock.calls[0][1]).toBe('MLEADERCOLLECT  2 multileaders collected · ⌘Z to undo');
    expect(items().map((it) => it.id)).toEqual(['M3', 'S1']);
    expect(items()[1].pts).toEqual([[X + 5000, 6000], [X, 7000], [X + 400, 4600]]);
    expect(text(items()[1])).toBe('L1-01, L1-02');
    expect(items()[1].ml).toEqual(M1.ml);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('a double-click opens the words; OK keeps new ones in the multileader, Esc leaves it; ED opens them too', async () => {
    await open();
    await dblClickAt(X + 1000, 7000);
    expect(editor()).not.toBeNull();
    expect(words()!.textContent).toBe('L1-01');
    expect(state.selected).toBe('sk:M1');
    await keyWords('Escape');
    expect(editor()).toBeNull();
    expect(items()[0]).toEqual(M1);
    expect(onChange).toHaveBeenCalledTimes(0);
    await dblClickAt(X + 1000, 7000);
    await typeWords(['L2-07', 'spare']);
    await keyWords('Enter', { metaKey: true });
    expect(items()[0]).toEqual({ ...M1, note: [{ runs: [{ s: 'L2-07' }] }, { runs: [{ s: 'spare' }] }] });
    expect(onChange.mock.calls[0][1]).toBe('MLEADER  Multileader words changed · ⌘Z to undo');
    await command('ed');
    await clickAt(X + 3000, 3000);
    expect(words()!.textContent).toBe('L1-03');
    await keyWords('Escape');
  });

  it('right-click: Multileader tools with Edit text, Add leader, Remove leader, Align… and Collect…; Add leader skips the selecting', async () => {
    await open();
    const [sx, sy] = screenOf(X + 1000, 7000);
    await act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); });
    expect(menuRows('[aria-label="Edit drawn objects"]')).toContain('Multileader tools');
    expect(menuRows('[aria-label="Multileader tools"]')).toEqual([]);
    await chooseMenu('Multileader tools');
    const rows = [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].map((b) => rowLabel(b));
    expect(rows).toEqual(expect.arrayContaining(['Edit text', 'Add leader', 'Remove leader', 'Align…', 'Collect…', 'Find and replace…', 'Add selected', 'Make block…']));
    await chooseMenu('Add leader');
    expect(state.tool).toBe('mleaderadd');
    expect(last()).toBe('MLEADERADD  Specify leader arrowhead location:');
  });

  it('FIND and replace take the words of a multileader', async () => {
    await open();
    await command('find');
    await command('L1-0');
    await command('K9-');
    expect(items().map(text)).toEqual(['K9-1', 'K9-2', 'K9-3']);
  });
});

describe('compare a reference with a new revision (XCOMPARE)', () => {
  const X = 200000, F = 'sample-villa-gf.dxf';
  const hist = () => document.querySelector('.cad-hist')!.textContent;
  const right = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('contextmenu', { clientX: sx, clientY: sy, button: 2, bubbles: true, cancelable: true })); }); };
  const entry = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => rowLabel(b) === label)!;
  afterEach(() => { dropRefGeometry('REF.dxf'); dropRefGeometry('REF-B.dxf'); });

  it('from the reference\'s menu: the new revision chosen and compared; Next zooms to the change, Clouds marks it, Accept takes it', async () => {
    keepRefGeometry({ file: 'REF.dxf', units: 4, segs: new Float64Array([0, 0, 5000, 0, 0, 0, 0, 3000]), segLayers: new Uint16Array([0, 0]), layers: [{ name: 'A-WALL', rgb: 0 }] });
    // Rev B: the wall along the bottom kept, the one up the side gone, a new one 2 m up.
    const revB = toDxf([{ type: 'line', layer: 'A-WALL', x1: 0, y1: 0, x2: 5000, y2: 0 }, { type: 'line', layer: 'A-WALL', x1: 0, y1: 2000, x2: 5000, y2: 2000 }], {}, { insunits: 4 });
    (window as unknown as { lvds: { cadFile: { openBytes: ReturnType<typeof vi.fn> } } }).lvds.cadFile.openBytes.mockResolvedValueOnce({ file: 'REF-B.dxf', path: '/refs/REF-B.dxf', bytes: new TextEncoder().encode(revB) });
    const p: Project = { ...villa, cadRefs: { [F]: [{ name: 'REF', file: 'REF.dxf', type: 'overlay', at: [X, 50000], scale: 1, rot: 0, fade: 50, print: true }] } };
    project = p; act(() => root.render(<Host start={p} />)); await flush(); act(() => state.toggle('osnap'));
    await right(X + 2500, 50000);
    await act(async () => { entry('Compare with new revision…').click(); });
    await until(() => /^XCOMPARE {2}\[Next/.test(hist()));
    expect(state.history).toContain('XCOMPARE  REF: 1 line added (green), 1 removed (red), in 1 area · 1 the same');
    await command('N');
    expect(hist()).toBe('XCOMPARE  Area 1 of 1 · [Next/Clouds/Accept/Exit] <Next>:');
    await command('C');
    expect(sketchOf(project, F).filter((it) => it.cloud)).toHaveLength(1);
    await command('A');
    expect(project.cadRefs![F][0].file).toBe('REF-B.dxf');
    await command('L');
    expect(state.tool).toBe('line'); // the comparison is over: commands work again
  });

  it('XCOMPARE with no reference loaded says so', async () => {
    project = villa; act(() => root.render(<Host start={villa} />)); await flush();
    await command('XCOMPARE');
    expect(hist()).toBe('XCOMPARE  This drawing has no reference loaded (XA attaches one).');
  });
});

describe('detect rooms from walls (DETECTROOMS)', () => {
  it('finds the sample villa\'s rooms round their name texts from the wall lines, each once, named by the text; again it updates them', async () => {
    project = villa; act(() => root.render(<Host />)); await flush();
    await command('DETECTROOMS');
    const rooms = () => buildingInfoOf(project).rooms;
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][1];
    expect(last).toMatch(/^DETECTROOMS {2}\d+ rooms? found from the walls on Ground/);
    const names = rooms().map((r) => r.name.toLowerCase());
    expect(names).toEqual(expect.arrayContaining(['kitchen', 'majlis', 'guest bedroom', 'store'])); // two that have no outline for ROOMS
    expect(new Set(names).size).toBe(names.length); // each room once
    for (const r of rooms()) { expect(r.outline!.length).toBeGreaterThanOrEqual(3); expect(r.areaM2).toBeGreaterThan(0.5); }
    const n = rooms().length;
    await command('ROOMSW');
    expect(rooms()).toHaveLength(n);
  });
});
