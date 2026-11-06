import { useCallback, useEffect, useRef, useState } from 'react';
import type { CadView } from '../../engines/cad/cadEngine';
import type { CadToggles } from './CadCanvas';

/** The tool working on the drawing: none (Select: a click inspects the object under it, Shift-click or a window picks
 * several devices or drawn objects), a measuring tool, a room tool (`room`
 * click inside, `trace` its corners, `name` pick its name), drawing a cable tray run (`tray`) or a feeder's cable route
 * (`cable`, or `link` a line of the drawing as it), placing a device (or `fill` a room with an ELV device)
 * (`dev`), wiring a circuit (`wire`, Wire one), devices along a line (`arl`) or
 * matching another (`match`), modifying the selected object (`move`, `copy`, `rotate`, `mirror`, `scale`, `stretch`), editing what was drawn (`trim`,
 * `extend`, `offset`, `fillet`, `chamfer`, `break`, `join`, `explode`, `array`), drawing (`line`, `pline`, `rect`, `circle`, `arc`)
 * or annotating (`text`, `dim`). */
export type CadTool = 'none' | 'dist' | 'area' | 'room' | 'trace' | 'name' | 'tray' | 'cable' | 'link' | 'dev' | 'fill' | 'lux' | 'em' | 'arl' | 'match' | 'wire' | 'move' | 'copy' | 'rotate' | 'mirror' | 'scale' | 'stretch' | 'trim' | 'extend' | 'offset' | 'fillet' | 'chamfer' | 'break' | 'join' | 'explode' | 'array' | 'line' | 'pline' | 'rect' | 'circle' | 'arc' | 'text' | 'dim';

/** Sample plans shipped with the app (electron/samples, made by scripts/make-sample-villa-plans.mjs), shown while no
 * drawing is open — a test aid. To remove: empty this list and delete the files and cad:sampleBytes. */
export const SAMPLE_PLANS: { file: string; label: string }[] = [
  { file: 'sample-villa-gf.dxf', label: 'Sample villa · Ground floor' },
  { file: 'sample-villa-ff.dxf', label: 'Sample villa · First floor' }
];
export const isSample = (file: string) => SAMPLE_PLANS.some((x) => x.file === file);

const RECENT = (projectId: string | undefined) => `lvds.cad.${projectId ?? 'new'}`;
/** The drawing a project had open in the CAD view last time on this computer (its path stays out of the project file). */
export const rememberedDrawing = (projectId: string | undefined): string | undefined => { try { return localStorage.getItem(RECENT(projectId)) ?? undefined; } catch { return undefined; } };
const remember = (projectId: string | undefined, path?: string) => { try { if (path) localStorage.setItem(RECENT(projectId), path); } catch { /* not remembered */ } };
const PATHS = (projectId: string | undefined) => `lvds.cad.paths.${projectId ?? 'new'}`;
const paths = (projectId: string | undefined): Record<string, string> => { try { return JSON.parse(localStorage.getItem(PATHS(projectId)) ?? '{}') as Record<string, string>; } catch { return {}; } };
/** Where a plan file of the project was opened from on this computer, to open it again from Plans. */
export const pathOfPlan = (projectId: string | undefined, file: string): string | undefined => paths(projectId)[file.toLowerCase()];
const rememberPath = (projectId: string | undefined, file: string, path?: string) => {
  try { if (path) localStorage.setItem(PATHS(projectId), JSON.stringify({ ...paths(projectId), [file.toLowerCase()]: path })); } catch { /* not remembered */ }
};

/** What the ribbon asks of the page showing the drawing; nothing while the page is not shown. */
export interface CadActions { save: () => void; saveDwg: () => void; close: () => void; remove: () => void; addFound: () => void; schedules: () => void; copyTo: (levelKey: string) => void; wireAll: () => void }
export const NO_ACTIONS: CadActions = { save: () => {}, saveDwg: () => {}, close: () => {}, remove: () => {}, addFound: () => {}, schedules: () => {}, copyTo: () => {}, wireAll: () => {} };

/** A drawing open in a tab, with its layers as they were left (its zoom and pan stay with CadCanvas). */
interface OpenDrawing { view: CadView; layersOn: Uint8Array }
/** The drawings open, a tab each, and the one showing. */
interface Tabs { open: OpenDrawing[]; shown: CadView | null }
const NO_LAYERS = new Uint8Array();
const sameFile = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
/** Above this many lines open at once (about 1 GB of engine memory) the command line suggests closing some. */
const MANY_LINES = 1_000_000;

/** State of the CAD view, kept by the app so the drawings stay open while other pages are shown. */
export function useCad(projectId: string | undefined) {
  const [tabs, setTabsState] = useState<Tabs>({ open: [], shown: null });
  // The same, as of now: what opens and closes drawings may run between renders.
  const now = useRef(tabs);
  const setTabs = useCallback((next: Tabs) => { now.current = next; setTabsState(next); }, []);
  const view = tabs.shown;
  const layersOn = tabs.open.find((d) => d.view === view)?.layersOn ?? NO_LAYERS;
  const [toggles, setToggles] = useState<CadToggles>({ snap: false, osnap: true, ortho: false, grid: false });
  const [fitKey, setFitKey] = useState(0);
  const [showLayers, setShowLayers] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [tool, setTool] = useState<CadTool>('none');
  // Devices: what Add device places, on which circuit / board, the device selected (the level is the plan's: cadPlans).
  const [device, setDevice] = useState('ltg');
  const [feederId, setFeederId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [showDevices, setShowDevices] = useState(true);
  /** Cable tray runs: the width drawn, and the tray route (none until the engineer assigns one). */
  const [tray, setTray] = useState<{ widthMm: number; service: string; route: string }>({ widthMm: 300, service: 'Power', route: '' });
  /** ELV coverage shown (Devices → Coverage) for the system of the ELV device chosen. */
  const [coverage, setCoverage] = useState(false);
  /** Circuit wiring tags shown on the plan (Wiring → Tags). */
  const [wireTags, setWireTags] = useState(true);
  /** The feeder whose cable route is drawn or linked. */
  const [cableFeeder, setCableFeeder] = useState('');
  /** The Layer roles table in the side panel (File → Layer roles). */
  const [showRoles, setShowRoles] = useState(false);
  /** Save DXF, Delete, Add found rooms, Update schedules and Copy to level (ribbon), set by the page while it is shown. */
  const actions = useRef<CadActions>(NO_ACTIONS);
  /** Text being typed for the TEXT tool: where it goes (drawing units). */
  const [textAt, setTextAt] = useState<[number, number] | null>(null);

  const say = useCallback((line: string) => setHistory((h) => [...h.slice(-49), line]), []);
  // Each open drawing keeps its own engine; closing it gives back that memory.
  useEffect(() => () => { for (const d of now.current.open) d.view.close(); now.current = { open: [], shown: null }; }, []);
  /** A drawing has been open, or the sample villa offered, since the app started: it does not come back by itself. */
  const sampleDone = useRef(false);
  const changeTabs = useCallback((next: Tabs) => {
    if (next.shown !== now.current.shown) { setSelected(null); setTextAt(null); }
    setTabs(next);
    if (next.shown) remember(projectId, next.shown.path);
  }, [projectId, setTabs]);
  /** Shows the tab of an open drawing, as it was left. */
  const show = useCallback((v: CadView) => {
    if (now.current.open.some((d) => d.view === v)) changeTabs({ ...now.current, shown: v });
  }, [changeTabs]);
  /** The open drawing of a file, by name as the project keeps its plans. */
  const tabOf = useCallback((file: string) => now.current.open.find((d) => sameFile(d.view.file, file))?.view, []);
  /** Opens a drawing in a new tab; `replaces` (the plan it takes over from) gives up its tab. */
  const open = useCallback((v: CadView, replaces?: CadView) => {
    sampleDone.current = true;
    const list = now.current.open;
    if (list.some((d) => d.view === v)) { show(v); return; }
    const same = list.find((d) => sameFile(d.view.file, v.file));
    // Opened again and unchanged: its tab as it was left, and the copy just read gives back its memory.
    if (same && same.view.path === v.path && sameBytes(same.view.bytes, v.bytes)) {
      v.close();
      show(same.view);
      say(`${same.view.file} is already open`);
      return;
    }
    // A file of the same name (changed, or from another folder) takes over its tab.
    const gone = list.filter((d) => d === same || d.view === replaces);
    for (const d of gone) d.view.close();
    const next = list.filter((d) => !gone.includes(d));
    next.splice(gone.length ? list.indexOf(gone[0]) : next.length, 0, { view: v, layersOn: Uint8Array.from(v.info.layers.map((l) => (l.on ? 1 : 0))) });
    changeTabs({ open: next, shown: v });
    setFitKey((k) => k + 1);
    rememberPath(projectId, v.file, v.path);
    say(`Command: OPEN  ${v.file} — ${v.info.format}, ${v.info.layers.length} layers${v.info.truncated ? ' (very large: part of it shown)' : ''}`);
    const lines = next.reduce((n, d) => n + d.view.info.segments, 0);
    if (next.length > 1 && lines > MANY_LINES) say(`${next.length} drawings open use about ${(lines / MANY_LINES).toFixed(1)} GB of memory. Close the ones you do not need (CLOSE).`);
  }, [projectId, say, show, changeTabs]);
  /** Closes drawings (all of them when none are named), giving back their memory: the tab to the right shows next, else
   * the last one. What was drawn stays in the project, by file name. Returns what was done, for the status line. */
  const close = useCallback((views?: CadView[]) => {
    const { open: list, shown } = now.current;
    const going = list.filter((d) => !views || views.includes(d.view));
    if (!going.length) return undefined;
    const left = list.filter((d) => !going.includes(d));
    const after = list.slice(list.findIndex((d) => d.view === shown) + 1).find((d) => left.includes(d));
    const nextShown = left.some((d) => d.view === shown) ? shown : (after ?? left[left.length - 1])?.view ?? null;
    for (const d of going) d.view.close();
    changeTabs({ open: left, shown: nextShown });
    const done = `${going.length === 1 ? going[0].view.file : `${going.length} drawings`} closed. What you drew stays in the project.`;
    say(done);
    return done;
  }, [say, changeTabs]);
  /** Another project has been opened: the drawings open are the last one's plans, so none stays. The same project
   * opened again (its version on disk, recovered work) keeps them. */
  const projectOpened = useCallback((id: string | undefined) => { if (id !== projectId) close(); }, [projectId, close]);
  const changeLayers = useCallback((change: (l: Uint8Array) => Uint8Array) => {
    const t = now.current;
    setTabs({ ...t, open: t.open.map((d) => (d.view === t.shown ? { ...d, layersOn: change(d.layersOn) } : d)) });
  }, [setTabs]);
  const setLayer = useCallback((i: number, on: boolean) => changeLayers((l) => { const n = l.slice(); n[i] = on ? 1 : 0; return n; }), [changeLayers]);
  const allLayers = useCallback((on: boolean) => changeLayers((l) => new Uint8Array(l.length).fill(on ? 1 : 0)), [changeLayers]);
  const toggle = useCallback((k: keyof CadToggles) => setToggles((t) => ({ ...t, [k]: !t[k] })), []);
  // GRID (F7) steps lines → dots → off, like the SLD's grid.
  const [gridDots, setGridDots] = useState(false);
  const cycleGrid = () => {
    if (!toggles.grid) { setToggles((t) => ({ ...t, grid: true })); setGridDots(false); }
    else if (!gridDots) setGridDots(true);
    else { setToggles((t) => ({ ...t, grid: false })); setGridDots(false); }
  };

  return { view, drawings: tabs.open.map((d) => d.view), open, show, close, tabOf, projectOpened, sampleDone, layersOn, setLayer, allLayers, toggles, toggle, gridDots, cycleGrid, fitKey, fit: () => setFitKey((k) => k + 1), showLayers, setShowLayers, history, say, tool, setTool, device, setDevice, feederId, setFeederId, boardId, setBoardId, selected, setSelected, showDevices, setShowDevices, tray, setTray, cableFeeder, setCableFeeder, wireTags, setWireTags, coverage, setCoverage, showRoles, setShowRoles, actions, textAt, setTextAt };
}

export type CadState = ReturnType<typeof useCad>;
