import { useEffect, useMemo, useRef, useState } from 'react';
import CadCanvas, { type CadMarks, type CadToggles, type CanvasDevice, type CanvasWiring } from './CadCanvas';
import { NO_ACTIONS, rememberedDrawing, SAMPLE_PLANS, type CadState, type CadTool } from './cadState';
import { chooseDrawing, drawingWithDevices, reopenDrawing, sampleDrawing, type CadObject, type CadView } from '../../engines/cad/cadEngine';
import { cableLabel, cablesOf, circuitLabel, finalCircuits, LV_PALETTE, moveItem, placedOn, placeItem, placeLvPoint, removeItem, type PaletteItem, type PlacedItem } from '../../model/cadDevices';
import { addSketch, arcThrough, dimensionLines, itemAt, moved, rectangle, removeSketch, rotated, segmentsOf, shapesOut, sketchOf, snapPoints, trayLength, TRAY_LAYER, TRAY_SERVICES, TRAY_WIDTHS, typedPoint, updateSketch } from '../../model/cadSketch';
import { trayPlanOf } from '../../calc/cableTray';
import { fittingCounts, trayFittings, type TrayFitting } from '../../model/cadTrayFittings';
import type { SketchItem } from '../../types';
import { ELV_PALETTE, elvPlacedOn, elvSystemOf, moveElv, placeElv, removeElv } from '../../components/elv/elvCadDevices';
import { copyTo, coverageNote, elvLayer, fillAt, rotate as rotateElv, SYSTEM_LABEL } from '../../components/elv/elvPlan';
import { saveBinary } from '../../util/files';
import { angleDeg, areaOf, distance, inside, m, m2, roomAround, segmentsOn } from '../../model/cadMeasure';
import { layerMapFor, layersWith, roomsFromPlan, withLayerMap } from '../../model/cadRooms';
import { layerStatsOf, objectPath, planOfView } from '../../model/cadViewPlan';
import { planDrawings, scheduleSummary, updateSchedules } from '../../model/cadPlanSchedules';
import { arcPoints, levelWiring, toggleWiring, wireLevel, type WiringArc } from '../../model/cadWiring';
import { buildingInfoOf } from '../../calc/building';
import { plansOf } from '../../model/cadPlans';
import { CAD_UNITS, planScale } from '../../model/cadUnits';
import CadLayerTable from '../CadLayerTable';
import CadTabs from './CadTabs';
import RoomLightingPanel, { lightingOf, LUX_START, type LuxSettings } from './RoomLightingPanel';
import { placeRoomLights } from '../../model/roomLights';
import EmergencyPanel, { EM_PROMPT, EM_START, emFitting, type EmSettings } from './EmergencyPanel';
import { EMPHASIS_LABEL, emergencyLayout, OPEN_AREA_M2, type EmphasisKind } from '../../calc/emergencyLighting';
import { placeEmergency } from '../../model/emergencyPlace';
import { EMERGENCY_ITEMS } from '../../model/cadDevices';
import { planLevel, setPlanLevel } from './cadFileMenu';
import { pathOfPlan } from './cadState';
import { changeViewports, layoutOverlay, layoutsOf, LayoutTabs, moveLayout, newLayout, patchViewport, ViewportPanel, vpId } from './CadLayouts';
import { layoutPaper, layoutViewports, PLAN_LABEL, PLAN_TYPES } from '../../docs/planLayout';
import { isFrozen, isLocked, toggleFrozen, vpName, vpToModel, vpWindow, type PlanViewport } from '../../model/planViewports';
import { renumber, setOf, type PlanType } from '../../model/drawingSet';
import { SheetWorkspace } from '../sld/SheetWorkspace';
import type { MarkupTool } from '../sld/markupTools';
import type { SheetUi } from '../sld/sheetUi';
import type { CalcRun } from '../../calc/runs';
import { exportDrawingSet } from '../docs/sheetRender';
import { pickedRoom, putRooms, renameRoom } from '../../model/floorPlanActions';
import { floorLabel, floorList } from '../../model/levels';
import type { CadLayerMap, CadLayerRole, Project } from '../../types';
import { fmtUpTo } from '../../util/format';
import DeviceToolbar from './DeviceToolbar';
import { AnnoPanel, HatchPanel } from './AnnotatePanel';
import { annoOf, centreOf, hatchItem, hatchOutline, HATCH_START, leaderItems, northArrowItems, roomTagItems, textUnits, type HatchSpec } from '../../model/cadAnnotate';
import { LayerManager, ObjectPropertiesPanel } from './CadLayerManager';
import { AttachDialog, RefLayersList, RefManager, useCadRefs } from './CadRefs';
import { refGeometry, type CadRef } from '../../model/cadRefs';
import { drawnLayers, effective, layerStylesOf, matchedProps, withLayerStyle, withProps } from '../../model/cadLayerStyle';
import { DrawnSelectionPanel, ED_START, EditToolPanel, kindOf, SketchToolbar, type EditSettings, type EditTool, type SketchEdit } from './SketchEditPanel';
import { arrayPolar, arrayRect, breakAt, chamfer, edgesFor, explode, extend, fillet, gripMoved, gripsOf, isPath, join, mirrored, offset, scaled, sketchInWindow, stretched, trim, type Edit } from '../../model/cadEdit';
import { ArrayPanel, ARL_START, MatchPanel, MATCH_START, SelectionPanel, type ArlSettings, type MatchSettings } from './DeviceEditPanel';
import { alongLine, arranged, circuitAfter, copyDevices, deleteDevices, editsFor, inWindow, matchDevice, moveDevices, onBoard, placeAlong, renameBoard, replaceDevices, toCircuit, typeOf, type DeviceEdit } from '../../model/deviceEdit';

type Pt = [number, number];
type Result =
  | { kind: 'dist'; a: Pt; b: Pt }
  | { kind: 'area'; points: Pt[]; how: 'corners' | 'object' | 'room' | 'trace'; name?: string }
  | { kind: 'object'; o: CadObject }
  | { kind: 'device'; it: PlacedItem }
  | { kind: 'sketch'; it: SketchItem };

const hex = (rgb: number) => (rgb === 0xff000007 ? 'var(--cad-ink)' : `#${rgb.toString(16).padStart(6, '0')}`);
const TOGGLES: { k: keyof CadToggles; label: string; key: string }[] = [
  { k: 'snap', label: 'SNAP', key: 'F9' }, { k: 'osnap', label: 'OSNAP', key: 'F3' }, { k: 'ortho', label: 'ORTHO', key: 'F8' }, { k: 'grid', label: 'GRID', key: 'F7' }
];
const HELP = 'Commands: OPEN · CLOSE · CLOSEALL · SAVE (DXF) · SAVEDWG · ROOMS (add found rooms) · RA (click inside a room) · TR (trace a room) · PN (pick its name) · CT (cable tray run) · CR (cable route) · LR (link a line as a cable route) · SCHED (update schedules) · WC (wire circuits) · W1 (wire one) · TAGS · FILL (fill a room with an ELV device) · LUX (light a room by the lumen method) · EM (emergency lighting) · SEL (select devices: Shift-click, or a window) · ARL (array on line) · MA (match) · ALIGN / ALIGNV / SPACE (the devices selected) · TRIM (TM) · EX (extend) · O (offset) · F (fillet) · CHA (chamfer) · BR (break) · J (join) · X (explode) · MI (mirror) · SC (scale) · S (stretch) · AR (array) · MP (match properties) · H (hatch) · LE (leader) · RT (room tag) · NORTH · LM (layer manager) · COV (coverage) · L (line) · PL (polyline, C closes) · REC · C (circle) · A (arc, 3 points) · T (text) · DIM · M (move) · CO (copy) · RO (rotate) · E (erase) · DI (distance) · AREA (O = object) · RA (room area) · DEV (add device) · M (move) · E (delete) · LI (inspect) · FIT (ZE) · LAYER · OSNAP (F3) · GRID (F7) · ORTHO (F8) · SNAP (F9) · Esc cancels, Enter closes an area.';
/** Device symbol size on the plan (radius, metres). */
const DEVICE_R_M = 0.2;
const PROMPT: Record<CadTool, string> = {
  none: 'Click an object to see what it is.',
  dist: 'DI  Specify first point:',
  area: 'AREA  Specify first corner point or [Object]:',
  room: 'ROOM  Click inside a room (its outline comes from the walls):',
  trace: 'TRACE  Specify first corner of the room:',
  name: 'NAME  Click the room name on the drawing:',
  tray: 'TRAY  Specify start point of the tray run:',
  cable: 'ROUTE  Specify start point of the cable route:',
  link: 'LINK  Click a line of the drawing: it becomes the cable route:',
  dev: 'DEV  Specify insertion point:',
  fill: 'FILL  Click inside a room: the ELV device chosen is placed at its coverage spacing:',
  lux: 'LUX  Point at a room to see its lights by the lumen method, click to keep them:',
  em: 'EM  Escape route: click its points from the far end to the exit, Enter to finish:',
  arl: 'ARL  Array on line: click the start of the line:',
  match: 'MA  Match: click the device to copy from:',
  matchprop: 'MATCHPROP  Select the source object:',
  hatch: 'HATCH  Pick an internal point (inside a closed object or a room):',
  leader: 'LEADER  Specify leader arrow point:',
  rtag: 'ROOMTAG  Click inside a room:',
  north: 'NORTH  Specify insertion point:',
  wire: 'WIRE  Click a device: its circuit is wired (or its wiring taken off):',
  move: 'MOVE  Select object, then specify base point:',
  copy: 'COPY  Select object, then specify base point:',
  rotate: 'ROTATE  Select object, then specify base point:',
  mirror: 'MIRROR  Select objects (click them), Enter, then the first point of the mirror line:',
  scale: 'SCALE  Select objects (click them), Enter, then the base point:',
  stretch: 'STRETCH  Drag a window (right to left) round the points to move:',
  trim: 'TRIM  Click the part to cut away (Shift-click extends):',
  extend: 'EXTEND  Click near the end to lengthen (Shift-click trims):',
  offset: 'OFFSET  Distance on the right; select the object to offset:',
  fillet: 'FILLET  Radius on the right; select the first line:',
  chamfer: 'CHAMFER  Distances on the right; select the first line:',
  break: 'BREAK  Select the object where it breaks:',
  join: 'JOIN  Select the lines and polylines to join, then Enter:',
  explode: 'EXPLODE  Select a polyline or rectangle:',
  array: 'ARRAY  Select objects (click them), Enter:',
  line: 'LINE  Specify first point:',
  pline: 'PLINE  Specify start point:',
  rect: 'RECTANG  Specify first corner point:',
  circle: 'CIRCLE  Specify center point:',
  arc: 'ARC  Specify start point:',
  text: 'TEXT  Specify start point of text:',
  dim: 'DIM  Specify first extension line origin:',
  xattach: 'XATTACH  Specify insertion point:',
  xclip: 'XCLIP  Click the corners of the clip outline, Enter to finish (two corners: a rectangle), or O to pick a closed outline:'
};
/** Layer of the cable routes drawn or linked in the app. */
const CABLE_LAYER = 'E-CABLE';
/** The smallest room of a level whose outline (metres) is around a point (drawing units, `k` metres per unit). */
function roomAtPointOf(p: Project, f: { ref: { building: string; level: string } }, at: Pt, k: number) {
  return buildingInfoOf(p).rooms
    .filter((r) => r.buildingId === f.ref.building && r.levelId === f.ref.level && (r.outline?.length ?? 0) >= 3 && inside([at[0] * k, at[1] * k], r.outline!))
    .sort((a, b) => a.areaM2 - b.areaM2)[0];
}
const pathLength = (pts: Pt[]) => pts.slice(1).reduce((t, q, i) => t + distance(pts[i], q), 0);
/** Layers for what is drawn in the app (written into the DXF on save). */
const DRAW_LAYER = 'LV-SKETCH', ANNO_LAYER = 'LV-ANNO';
/** Layers of the circuit wiring and its tags (written into the DXF / DWG on save). */
const WIRING_LAYER = 'E-LV-WIRING', TAG_LAYER = 'E-LV-TAGS';
/** The edit tools on what was drawn (Draw → Edit, Mirror / Scale / Stretch in Modify), and those that work on objects
 * picked first. */
const EDIT_TOOLS: CadTool[] = ['trim', 'extend', 'offset', 'fillet', 'chamfer', 'break', 'join', 'explode', 'mirror', 'scale', 'stretch', 'array'];
const PICK_FIRST: CadTool[] = ['join', 'mirror', 'scale', 'array'];
const DRAW_TOOLS: CadTool[] = ['line', 'pline', 'tray', 'cable', 'rect', 'circle', 'arc', 'text', 'dim', 'move', 'copy', 'rotate'];

/** The CAD view: a DWG / DXF drawing opened natively, as a CAD program shows it — model space, crosshair, snaps, layers,
 * a command line and a status bar. Engine in Rust (WebAssembly), desktop and web alike. Measure a distance, an area (by
 * corners, a closed object, or inside a room), and click any object to see what it is. */
export default function CadPage({ cad, project, onChange, onStatus, sheetUi, run: calcRun, onSheet }: {
  cad: CadState;
  project: Project;
  onChange: (next: Project, message: string) => void;
  onStatus: (m: string) => void;
  /** The sheets' markup tools (shared with the Sheets ribbon): a layout tab's paper markups use them. */
  sheetUi?: SheetUi;
  /** The calculation run the sheets print. */
  run?: CalcRun;
  /** Page setup: the layout's sheet in Sheets. */
  onSheet?: (sheetId: string) => void;
}) {
  const paperTool = sheetUi?.setTool;
  const onPlot = (id: string) => void exportDrawingSet(project, setOf(project), calcRun, false, onStatus, [id], false);
  const { view, tool } = cad;
  const [cursor, setCursor] = useState<{ at: Pt | null; snap?: string }>({ at: null });
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [objectMode, setObjectMode] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // Another drawing showing (its tab, one opened or closed): what was picked or being drawn on the last one goes.
  const [pickedOn, setPickedOn] = useState(view);
  // Light room (LUX): the room kept (its lights stay previewed while the panel is edited) and the panel's settings.
  const [luxRoom, setLuxRoom] = useState<string | null>(null);
  const [luxSet, setLuxSet] = useState<LuxSettings>(LUX_START);
  // Emergency (EM): the escape routes, points of emphasis and open-area rooms marked (metres), kept until Place or Cancel.
  const [em, setEm] = useState<{ routes: Pt[][]; points: { at: Pt; kind: EmphasisKind }[]; rooms: string[] }>({ routes: [], points: [], rooms: [] });
  const [emSet, setEmSet] = useState<EmSettings>(EM_START);
  // Edit devices: several devices picked (Shift-click or a window; one device is cad.selected), the menu at the cursor
  // after a right click (canvas pixels), Array on line and Match settings, and the board being renamed.
  const [picked, setPicked] = useState<string[]>([]);
  const [menuAt, setMenuAt] = useState<Pt | null>(null);
  const [arlSet, setArlSet] = useState<ArlSettings>(ARL_START);
  const [matchFrom, setMatchFrom] = useState<string | null>(null);
  const [matchSet, setMatchSet] = useState<MatchSettings>(MATCH_START);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Edit tools: their settings, the first object picked (and where), objects picked first or points next, the Stretch
  // window, the grip being dragged, and a first pick set by the toolbar before the tool starts.
  const [edSet, setEdSet] = useState<EditSettings>(ED_START);
  const [edStep, setEdStep] = useState<{ id: string; at: Pt } | null>(null);
  const [edPhase, setEdPhase] = useState<'pick' | 'points'>('pick');
  const [stretchBox, setStretchBox] = useState<[Pt, Pt] | null>(null);
  const [gripIdx, setGripIdx] = useState<number | null>(null);
  const preset = useRef<{ id: string; at: Pt } | null>(null);
  // Layer manager shown, and the object Match properties copies from.
  const [showLM, setShowLM] = useState(false);
  const [mpFrom, setMpFrom] = useState<string | null>(null);
  const [hatchSet, setHatchSet] = useState<HatchSpec>(HATCH_START);
  // References: the manager shown, the reference being attached (its dialog, or a point being picked for it), the one
  // being clipped and whether its clip is a closed outline picked on the plan.
  const [showXR, setShowXR] = useState(false);
  const [xDraft, setXDraft] = useState<CadRef | null>(null);
  const [xClip, setXClip] = useState<{ name: string; outline: boolean } | null>(null);
  if (pickedOn !== view) { setPickedOn(view); setResult(null); setPoints([]); setObjectMode(false); setLuxRoom(null); setEm({ routes: [], points: [], rooms: [] }); setPicked([]); setMenuAt(null); }
  const input = useRef<HTMLInputElement>(null);
  const last = rememberedDrawing(project.id);
  const units = planScale(project, view?.file, view?.info.units);
  const toM = (v: number) => v * units.factor;
  const toM2 = (v: number) => v * units.factor * units.factor;

  async function load(read: () => Promise<CadView | null>, missing?: string) {
    setBusy(true);
    try {
      const v = await read();
      if (v) { cad.open(v); onStatus(`${v.file} opened`); } else if (missing) cad.say(missing);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      cad.say(msg); onStatus(msg);
    } finally { setBusy(false); }
  }
  const openFile = () => void load(() => chooseDrawing());
  /** Shows the tab of a file already open, else reads it into a new one. */
  const showOrLoad = (file: string, read: () => Promise<CadView | null>, missing?: string) => {
    const tab = cad.tabOf(file);
    if (tab) cad.show(tab); else void load(read, missing);
  };
  const closeDrawings = (views?: CadView[]) => { const done = cad.close(views); if (done) onStatus(done); };

  // Until a drawing has been open (and with none to reopen), the sample villa is shown — a test aid (SAMPLE_PLANS). Once
  // closed it stays closed.
  useEffect(() => {
    if (view || cad.sampleDone.current || last || !SAMPLE_PLANS.length) return;
    cad.sampleDone.current = true;
    void load(() => sampleDrawing(SAMPLE_PLANS[0].file));
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the page first shows no drawing

  // A tool chosen (ribbon or command line): start it afresh and say what it asks for.
  useEffect(() => {
    setPoints([]); setObjectMode(false); setLuxRoom(null); setMenuAt(null); if (tool !== 'match') setMatchFrom(null); cad.setTextAt(null);
    setEdStep(preset.current); preset.current = null; setStretchBox(null); setMpFrom(null);
    const first = picked.some((k) => k.startsWith('sk:')) || !!cad.selected?.startsWith('sk:');
    setEdPhase(first ? 'points' : 'pick');
    cad.say(`Command: ${PICK_FIRST.includes(tool) && first ? `${tool.toUpperCase()}  ${tool === 'mirror' ? 'Specify first point of the mirror line:' : tool === 'scale' ? 'Specify base point:' : tool === 'join' ? 'Enter to join them:' : 'Apply on the right, or the centre for a polar array:'}` : PROMPT[tool]}`);
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Layer roles (File → Layer roles): the project's, else a guess from the layer's name and what it holds.
  const layerStats = useMemo(() => (view ? layerStatsOf(view) : []), [view]);
  const roles = useMemo(() => layerMapFor(project, layerStats), [project, layerStats]);
  // Walls for Room area: shown layers whose role is Wall, else every shown layer.
  const walls = useMemo(() => {
    if (!view) return [];
    const wallNames = layersWith(roles, 'wall');
    const shown = view.info.layers.map((_, i) => i).filter((i) => cad.layersOn[i]);
    const named = shown.filter((i) => wallNames.has(view.info.layers[i].name.toLowerCase()));
    return segmentsOn(view.segs, view.segLayers, view.info.origin, new Set(named.length ? named : shown));
  }, [view, cad.layersOn, roles]);

  // Devices are kept per level, in metres on its plan: the level this drawing shows, and what is placed on it.
  const floors = floorList(project.building).filter((f) => !f.ref.index);
  const { floor, set: levelSet } = planLevel(project, view?.file);
  const plans = plansOf(project);
  const placed: PlacedItem[] = useMemo(() => (floor ? [...placedOn(project, floor.ref), ...elvPlacedOn(project, floor.ref)] : []), [project, floor]);
  const palette: PaletteItem[] = [...LV_PALETTE, ...ELV_PALETTE];
  const item = palette.find((x) => x.id === cad.device) ?? palette[0];
  const circuits = useMemo(() => finalCircuits(project), [project]);
  const selectedItem = placed.find((d) => d.key === cad.selected) ?? null;
  // The devices picked: several (Shift-click or a window), else the one selected.
  const pickedItems = useMemo(() => (picked.length ? placed.filter((d) => picked.includes(d.key)) : selectedItem ? [selectedItem] : []), [picked, placed, selectedItem]);
  // What the engineer drew on this drawing (drawing units), its snap points, and the drawn object selected.
  const sketch = useMemo(() => (view ? sketchOf(project, view.file) : []), [project, view]);
  const sketchSnaps = useMemo(() => snapPoints(sketch), [sketch]);
  // Layer manager styles; objects on locked or hidden layers cannot be picked.
  const styles = useMemo(() => layerStylesOf(project, view?.file), [project, view]);
  const pickable = useMemo(() => sketch.filter((it) => { const e = effective(it, styles); return !e.lock && !e.hidden; }), [sketch, styles]);
  const selSketch = sketch.find((it) => `sk:${it.id}` === cad.selected) ?? null;
  // The drawn objects picked: several, else the one selected; and everything picked.
  const pickedSk = useMemo(() => (picked.length ? sketch.filter((it) => picked.includes(`sk:${it.id}`)) : selSketch ? [selSketch] : []), [picked, sketch, selSketch]);
  const pickedKeys = new Set([...pickedItems.map((d) => d.key), ...pickedSk.map((it) => `sk:${it.id}`)]);
  const many = pickedItems.length + pickedSk.length > 1;
  // The architect's lines on shown layers: cutting edges and boundaries for Trim and Extend.
  const drawingSegs = useMemo(() => (view && (tool === 'trim' || tool === 'extend') ? segmentsOn(view.segs, view.segLayers, view.info.origin, new Set(view.info.layers.map((_, i) => i).filter((i) => cad.layersOn[i]))) : []), [view, cad.layersOn, tool]);
  const fittings = useMemo(() => trayFittings(sketch, 0.001 / units.factor).fittings, [sketch, units.factor]);
  const cables = useMemo(() => cablesOf(project), [project]);
  // ELV: the device chosen (if an ELV one), its system for coverage and Copy to level, and the coverage / Fill preview.
  const elvItem = ELV_PALETTE.find((e) => e.id === cad.device);
  const elvSystem = elvSystemOf(elvItem?.kind.elv ?? 'smoke-detector');
  const fillRoom = tool === 'fill' && cursor.at && floor ? roomAtPointOf(project, floor, cursor.at, units.factor)?.id : undefined;
  const elv = useMemo(() => (floor && (cad.coverage || fillRoom) ? elvLayer(project, { building: floor.ref.building, level: floor.ref.level }, units.factor, {
    system: elvSystem, coverage: cad.coverage, selected: null,
    ...(fillRoom && elvItem && cursor.at ? { preview: { type: elvItem.kind.elv, at: [cursor.at[0] * units.factor, cursor.at[1] * units.factor] as Pt } } : {})
  }) : undefined), [project, floor?.key, elvSystem, cad.coverage, fillRoom, elvItem?.id, units.factor]); // eslint-disable-line react-hooks/exhaustive-deps -- the preview follows the room under the pointer, not every move
  const cableLabels = useMemo(() => Object.fromEntries(sketch.filter((it) => it.cable).map((it) => {
    const f = project.feeders.find((x) => x.id === it.cable!.feederId);
    return [it.id, f ? cableLabel(project, f).split(' · ')[0] : `${it.cable!.feederId} (removed)`];
  })), [sketch, project]);
  // Annotation text height: paper mm at the annotation scale (2.5 mm at 1:100 = 0.25 m), in drawing units.
  const anno = annoOf(project);
  const textH = textUnits(anno, units.factor);
  const rUnits = DEVICE_R_M / units.factor;
  // Light room: the room kept, else the one under the pointer, with its lights by the lumen method.
  const luxHover = tool === 'lux' && !luxRoom && cursor.at && floor ? roomAtPointOf(project, floor, cursor.at, units.factor)?.id : undefined;
  const luxOf = tool === 'lux' ? buildingInfoOf(project).rooms.find((r) => r.id === (luxRoom ?? luxHover)) : undefined;
  const lit = useMemo(() => (luxOf ? lightingOf(project, luxOf, luxSet) : undefined), [project, luxOf?.id, luxSet]); // eslint-disable-line react-hooks/exhaustive-deps -- follows the room, not every pointer move
  // Emergency: the layout of what is marked, previewed until placed.
  const emRooms = useMemo(() => buildingInfoOf(project).rooms.filter((r) => em.rooms.includes(r.id) && r.outline), [project, em.rooms]);
  const emLayout = useMemo(() => { const f = emFitting(emSet); return emergencyLayout(em.routes, em.points, emRooms.map((r) => ({ name: r.name, outline: r.outline! })), f.fitting, f.signViewM); }, [em, emRooms, emSet]);
  const emGhost = (x: number, y: number, it: { symbol: { shape: string; text: string } }, key: string): CanvasDevice => ({ key, x: x / units.factor, y: y / units.factor, r: rUnits, shape: it.symbol.shape, text: it.symbol.text, label: '', ghost: true });
  const emGhosts: CanvasDevice[] = tool !== 'em' ? [] : [
    ...emLayout.fittings.map((f, i) => emGhost(f.at[0], f.at[1], EMERGENCY_ITEMS.fitting, `emf${i}`)),
    ...emLayout.signs.map((g, i) => emGhost(g.at[0], g.at[1], EMERGENCY_ITEMS[g.kind === 'exit' ? 'exit-sign' : 'direction-sign'], `ems${i}`)),
    ...em.points.map((q, i) => emGhost(q.at[0], q.at[1], { symbol: { shape: 'square', text: 'P' } }, `emp${i}`))
  ];
  // Array on line: the line clicked (to the cursor until its end is clicked) and the devices along it (metres).
  const arlItem = palette.find((x) => x.id === arlSet.device);
  const arlLine: Pt[] = tool !== 'arl' ? [] : points.length >= 2 ? points.slice(0, 2) : points.length === 1 && cursor.at ? [points[0], cursor.at] : [];
  const arlAt: Pt[] = arlLine.length === 2 ? alongLine(arlLine[0].map((v) => v * units.factor) as Pt, arlLine[1].map((v) => v * units.factor) as Pt,
    arlSet.by === 'n' ? { count: Number(arlSet.value) || 0 } : { spacing: Number(arlSet.value) || 0 }, arlSet.ends) : [];
  const emRoutes: SketchItem[] = tool !== 'em' ? [] : em.routes.map((r, i) => ({ id: `_em${i}`, layer: '', kind: 'pline', pts: r.map(([x, y]): Pt => [x / units.factor, y / units.factor]) }));
  const ghosts: CanvasDevice[] = [
    ...(elv?.symbols ?? []).filter((x) => x.ghost).map((x, i) => ({ key: `ghost${i}`, x: x.at[0], y: x.at[1], r: rUnits, shape: x.shape, text: x.text, label: '', elv: true, ghost: true })),
    ...(lit?.result.points ?? []).map(([x, y], i) => ({ key: `lux${i}`, x: x / units.factor, y: y / units.factor, r: rUnits, shape: 'cross', text: '', label: '', ghost: true })),
    ...emGhosts,
    ...arlAt.map(([x, y], i) => ({ key: `arl${i}`, x: x / units.factor, y: y / units.factor, r: rUnits, shape: arlItem?.symbol.shape ?? 'cross', text: arlItem?.symbol.text ?? '', label: '', ghost: true }))
  ];
  const devices: CanvasDevice[] = cad.showDevices ? [...ghosts, ...placed.map((d) => ({
    key: d.key, x: d.x / units.factor, y: d.y / units.factor, r: d.what === 'board' ? rUnits * 2 : rUnits, shape: d.symbol.shape, text: d.symbol.text,
    label: d.what === 'lv' ? d.detail.split(' · ')[0] : d.what === 'board' ? d.label : '', selected: pickedKeys.has(d.key), elv: d.what === 'elv'
  }))] : ghosts;
  // Circuit wiring on this level (metres), and as the canvas draws it (drawing units).
  const wiring = useMemo(() => (floor ? levelWiring(project, floor.ref) : []), [project, floor]);
  const toUnits = (w: WiringArc): WiringArc => ({ a: [w.a[0] / units.factor, w.a[1] / units.factor], c: [w.c[0] / units.factor, w.c[1] / units.factor], b: [w.b[0] / units.factor, w.b[1] / units.factor] });
  const canvasWiring: CanvasWiring[] = cad.showDevices ? wiring.map((w) => ({
    arcs: w.arcs.map(toUnits), ...(w.home ? { home: toUnits(w.home) } : {}),
    tag: cad.wireTags ? { at: [w.tagAt[0] / units.factor, w.tagAt[1] / units.factor] as Pt, s: w.warning ? `${w.tag.split(' · ')[0]} · ${w.warning}` : w.tag, warn: !!w.warning } : undefined
  })) : [];
  const deviceAt = (at: Pt, pixel: number) => {
    let best: { d: PlacedItem; dist: number } | undefined;
    for (const d of placed) {
      const dist = distance(at, [d.x / units.factor, d.y / units.factor]);
      if (dist <= Math.max(rUnits * (d.what === 'board' ? 2 : 1), 8 * pixel) && (!best || dist < best.dist)) best = { d, dist };
    }
    return best?.d;
  };
  const change = (next: Project, message: string) => { onChange(next, message); cad.say(message); };
  const xr = useCadRefs({ project, view, tabOf: cad.tabOf, change, say: cad.say });

  // Model and layouts (paper space, src/components/cad/CadLayouts.tsx): the level's layouts, the one showing, its
  // viewports, the one picked and the one worked in (MS).
  const [mv, setMv] = useState(false);
  const [renamingLayout, setRenamingLayout] = useState<string | null>(null);
  const lv = floor ? { buildingId: floor.ref.building, levelId: floor.ref.level, name: floor.name } : undefined;
  const layouts = layoutsOf(project, lv);
  const sheetL = cad.layout ? layouts.find((s) => s.id === cad.layout) : undefined;
  useEffect(() => { if (cad.layout && !sheetL) cad.setLayout(null); }, [cad.layout, sheetL]); // eslint-disable-line react-hooks/exhaustive-deps -- a layout gone (deleted, another level)
  useEffect(() => { if (!sheetL) setMv(false); }, [sheetL]);
  const vps = sheetL ? layoutViewports(project, sheetL) : [];
  const msV = vps.find((v) => v.id === cad.msVp), selV = vps.find((v) => v.id === cad.vpSel);
  /** The viewport a command acts on: the one worked in, else the one picked, else the only one. */
  const vpTarget = msV ?? selV ?? (vps.length === 1 ? vps[0] : undefined);
  const setVps = (f: (list: PlanViewport[]) => PlanViewport[], what: string) => { if (sheetL) change(changeViewports(project, sheetL, f), `${sheetL.number || 'Layout'}  ${what} · ⌘Z to undo`); };
  const patchVp = (v: PlanViewport, patch: Partial<PlanViewport>, what: string) => setVps((l) => patchViewport(l, v.id, patch), `${vpName(vps, v.id)}: ${what}`);
  const addLayout = (type: PlanType) => {
    if (!lv) { cad.say('LAYOUT  Choose the level this drawing is the plan of first (ribbon: Level).'); return; }
    const r = newLayout(setOf(project), lv, type);
    change({ ...project, drawingSet: r.set }, `LAYOUT  ${r.set.sheets.find((x) => x.id === r.id)?.number ?? ''} ${lv.name} · ${PLAN_LABEL[type]} — a new layout and plan sheet · ⌘Z to undo`);
    cad.setLayout(r.id);
  };
  const PAPER_TOOLS: Record<string, MarkupTool> = { T: 'text', TEXT: 'text', NOTE: 'text', CLOUD: 'cloud', REVCLOUD: 'cloud', LE: 'callout', LEADER: 'callout', CALLOUT: 'callout', ARROW: 'arrow', L: 'line', LINE: 'line', REC: 'rect', RECTANG: 'rect' };
  /** Layout commands (and LAYOUT / MODEL from the Model tab); true when the command was one. */
  function layoutCmd(c: string): boolean {
    const [w, arg] = c.split(' ');
    if (w === 'LAYOUT' || w === 'LO') { addLayout(PLAN_TYPES.find((t) => t.toUpperCase().startsWith(arg ?? 'L')) ?? 'lighting'); return true; }
    if (w === 'MODEL') { cad.setLayout(null); return true; }
    if (!sheetL) return false;
    if (w === 'MV' || w === 'MVIEW') { cad.setMsVp(null); setMv(true); cad.say('MVIEW  Click two corners of the new viewport on the paper:'); return true; }
    if (w === 'MS' || w === 'MSPACE') { const v = vpTarget ?? vps[0]; if (v) { cad.setMsVp(v.id); cad.say(`MSPACE  Working in the model through ${vpName(vps, v.id)} (1:${v.scale}${isLocked(v) ? ', locked' : ''}). PS or a double-click outside returns to the paper.`); } return true; }
    if (w === 'PS' || w === 'PSPACE') { cad.setMsVp(null); cad.say('PSPACE  On the paper.'); return true; }
    if (w === 'VPSCALE') {
      const v = vpTarget, k = Math.round(Number(/^(?:1:)?(\d+(?:\.\d+)?)$/.exec(arg ?? '')?.[1]));
      if (!v) cad.say('VPSCALE  Pick a viewport first (click its frame).');
      else if (!(k > 0)) cad.say(`VPSCALE  ${vpName(vps, v.id)} is at 1:${v.scale}. Type VPSCALE and a scale, e.g. VPSCALE 50.`);
      else patchVp(v, { scale: k }, `scale 1:${k}`);
      return true;
    }
    if (w === 'VPLOCK') { const v = vpTarget; if (!v) cad.say('VPLOCK  Pick a viewport first (click its frame).'); else patchVp(v, isLocked(v) ? { locked: false } : { locked: undefined }, isLocked(v) ? 'unlocked: pan and zoom inside it move its view' : 'locked'); return true; }
    if (w === 'PAGESETUP') { onSheet?.(sheetL.id); return true; }
    if (w === 'PLOT') { onPlot(sheetL.id); return true; }
    if (!msV && PAPER_TOOLS[w] && !arg) {
      if (!paperTool) return false;
      paperTool(PAPER_TOOLS[w]);
      cad.say(`${w}  On the paper: drag where it goes (Esc stops).`);
      return true;
    }
    return false;
  }
  const unitName = (insunits?: number) => CAD_UNITS.find((u) => u.code === insunits)?.id;
  async function startAttach() {
    setShowXR(false);
    const d = await xr.actions.attach();
    if (d) { setXDraft(d); cad.say(`XATTACH  ${d.file}: choose where it goes, then Attach.`); }
  }
  function startClip(r: CadRef) { setShowXR(false); setXClip({ name: r.name, outline: false }); setPoints([]); cad.setTool('xclip'); }
  function finishClip(pts: Pt[]) {
    const r = xr.refs.find((x) => x.name === xClip?.name);
    if (!r) { cad.setTool('none'); return; }
    const outline = pts.length === 2 ? rectangle(pts[0], pts[1]) : pts;
    if (outline.length < 3) { cad.say('XCLIP  Click two corners (a rectangle) or three or more, then Enter:'); return; }
    xr.actions.update(r, { clip: outline }, `clipped to ${pts.length === 2 ? 'a rectangle' : `an outline of ${outline.length} corners`}`);
    setPoints([]); setXClip(null); cad.setTool('none');
  }
  function removeSelected() {
    if (selSketch && view) { change(removeSketch(project, view.file, selSketch.id), `${selSketch.tray ? 'Cable tray' : selSketch.cable ? 'Cable route' : selSketch.kind === 'pline' ? 'Polyline' : selSketch.kind[0].toUpperCase() + selSketch.kind.slice(1)} erased · ⌘Z to undo`); cad.setSelected(null); setResult(null); return; }
    if (many) {
      let next = pickedItems.length ? deleteDevices(project, pickedItems) : project;
      if (view) for (const it of pickedSk) next = removeSketch(next, view.file, it.id);
      change(next, `${pickedItems.length + pickedSk.length} objects erased${pickedItems.length ? ' — point counts updated' : ''} · ⌘Z to undo`);
      setPicked([]); cad.setSelected(null); setResult(null); return;
    }
    if (!selectedItem) { cad.say('ERASE  Select an object first (click it).'); return; }
    change(selectedItem.what === 'elv' ? removeElv(project, selectedItem.id) : removeItem(project, selectedItem), `${selectedItem.label} deleted${selectedItem.what === 'lv' ? ` — taken off ${selectedItem.detail.split(' · ')[0]}` : ''} · ⌘Z to undo`);
    cad.setSelected(null); setResult(null);
  }
  /** Save DXF / Save DWG: the drawing as received with what was drawn and the devices placed, as a new file. */
  async function saveDxf(as: 'dxf' | 'dwg' = 'dxf', bind = false) {
    if (!view) return;
    try {
      const out = placed.map((d) => ({ layer: d.what === 'lv' ? 'E-LV-POINTS' : d.what === 'elv' ? 'E-ELV-DEVICES' : 'E-BOARDS', x: d.x / units.factor, y: d.y / units.factor, r: rUnits * (d.what === 'board' ? 2 : 1), text: d.symbol.text, label: d.what === 'lv' ? d.detail.split(' · ')[0] : d.label }));
      const wires = wiring.flatMap((w) => [...w.arcs, ...(w.home ? [w.home] : [])].map((a) => ({ layer: WIRING_LAYER, kind: 'pline' as const, pts: arcPoints(toUnits(a)) })));
      const tags = wiring.map((w) => ({ layer: TAG_LAYER, kind: 'text' as const, pts: [[w.tagAt[0] / units.factor, w.tagAt[1] / units.factor] as Pt], text: w.tag, h: textH * 0.6, rot: 0 }));
      const refLines = bind ? xr.bound() : [];
      const bytes = await drawingWithDevices(view, out, [...shapesOut(sketch, units.factor), ...wires, ...tags, ...refLines], as);
      const name = `${view.file.replace(/\.(dwg|dxf)$/i, '')} - with devices${bind ? ' and references' : ''}.${as}`;
      const msg = await saveBinary(name, bytes, as === 'dwg' ? 'DWG drawing' : 'DXF drawing', as, as === 'dwg' ? 'application/acad' : 'application/dxf');
      if (msg) { cad.say(`SAVE  ${msg} (${placed.length} device${placed.length === 1 ? '' : 's'} on E-LV-POINTS / E-ELV-DEVICES / E-BOARDS, ${sketch.length} drawn object${sketch.length === 1 ? '' : 's'} on ${DRAW_LAYER} / ${ANNO_LAYER}${refLines.length ? `, ${refLines.length.toLocaleString('en-GB')} reference lines bound on NAME$0$LAYER layers` : ''}${wiring.length ? `, ${wiring.length} circuit${wiring.length === 1 ? '' : 's'} wired on ${WIRING_LAYER} / ${TAG_LAYER}` : ''})`); onStatus(msg); }
    } catch (e) { const msg = e instanceof Error ? e.message : String(e); cad.say(msg); onStatus(msg); }
  }
  cad.actions.current = { save: () => void saveDxf(), saveDwg: () => void saveDxf('dwg'), close: () => { if (view) closeDrawings([view]); }, remove: removeSelected, addFound: () => addFound(), schedules: () => schedules(), copyTo: (k) => copyLevel(k), wireAll: () => wireAll(), layerManager: () => { if (view) setShowLM(true); else cad.say('LAYER  Open a drawing first.'); }, refs: () => { if (view) setShowXR(true); else cad.say('XREF  Open a drawing first.'); }, layoutCmd: (c) => { if (!layoutCmd(c)) cad.say(`${c}  Open a layout tab first.`); } };
  // While the page is not shown the ribbon's actions do nothing (they would work on a project as it was).
  useEffect(() => () => { cad.actions.current = NO_ACTIONS; }, []); // eslint-disable-line react-hooks/exhaustive-deps -- on leaving the page

  /** Light room: places the kept room's lights on the circuit chosen. */
  function placeLux() {
    if (!floor || !luxOf || !lit) return;
    try {
      const r = placeRoomLights(project, floor.ref, luxOf.id, cad.feederId, lit.result.points, luxSet.replace);
      const f = project.feeders.find((x) => x.id === cad.feederId)!;
      change(r.project, `${r.ids.length} light${r.ids.length === 1 ? '' : 's'} placed in ${luxOf.name} on ${circuitLabel(project, f).split(' · ')[0]} — ${Math.round(lit.result.achievedLux)} lx${r.removed ? ` (${r.removed} taken off first)` : ''} · ⌘Z to undo`);
      setLuxRoom(null);
    } catch (e) { cad.say(`LUX  ${e instanceof Error ? e.message : String(e)}`); }
  }
  /** Emergency: the escape route being drawn becomes one of the routes. */
  function finishRoute() {
    if (points.length >= 2) {
      const r = points.map(([x, y]): Pt => [x * units.factor, y * units.factor]);
      setEm((e) => ({ ...e, routes: [...e.routes, r] }));
      cad.say(`EM  Escape route ${em.routes.length + 1}, ${m(pathLength(points) * units.factor)} — draw another, mark points of emphasis or open areas, then Place.`);
    } else cad.say(EM_PROMPT.route);
    setPoints([]);
  }
  /** Emergency: places the fittings and signs on the circuit chosen. */
  function placeEm() {
    if (!floor) return;
    try {
      const r = placeEmergency(project, floor.ref, cad.feederId, emLayout);
      const f = project.feeders.find((x) => x.id === cad.feederId)!;
      change(r.project, `${r.fittings} emergency light${r.fittings === 1 ? '' : 's'} and ${r.signs} sign${r.signs === 1 ? '' : 's'} placed on ${circuitLabel(project, f).split(' · ')[0]} · ⌘Z to undo`);
      setEm({ routes: [], points: [], rooms: [] }); setPoints([]);
    } catch (e) { cad.say(`EM  ${e instanceof Error ? e.message : String(e)}`); }
  }
  /** Wire circuits: every circuit with devices on this level, with a home run to its DB. */
  function wireAll() {
    if (!floor) { cad.say('WIRE  Add the building and its levels in Building information first; devices are kept per level.'); return; }
    const r = wireLevel(project, floor.ref);
    if (!r.added.length) { cad.say(wiring.length ? `WIRE  Every circuit on this level is wired (${wiring.length}).` : 'WIRE  No circuit has devices on this level: place lights or sockets on circuits first.'); return; }
    const missing = levelWiring(r.project, floor.ref).filter((w) => r.added.includes(w.feederId) && w.warning).length;
    change(r.project, `${r.added.length} circuit${r.added.length === 1 ? '' : 's'} wired on ${floorLabel(project.building, floor)}${missing ? ` (${missing} without a home run: place the DB on this level)` : ''} · Update schedules sends the lengths to the cable schedule · ⌘Z to undo`);
  }
  /** Wire one: the circuit of the device clicked, on or off. */
  function wireOne(at: Pt, pixel: number) {
    const d = deviceAt(at, pixel);
    const pt = d?.what === 'lv' ? (project.lvPoints ?? []).find((x) => x.id === d.id) : undefined;
    const f = pt && project.feeders.find((x) => x.id === pt.feederId);
    if (!f || !floor) { cad.say('WIRE  Click a light, socket or other device on a circuit:'); return; }
    const r = toggleWiring(project, f.id);
    const w = r.wired ? levelWiring(r.project, floor.ref).find((x) => x.feederId === f.id) : undefined;
    change(r.project, r.wired ? `${w?.tag ?? circuitLabel(project, f)} wired${w?.warning ? ` — ${w.warning}` : ''} · ⌘Z to undo` : `Wiring of ${circuitLabel(project, f).split(' · ')[0]} taken off · ⌘Z to undo`);
  }

  /** Copy to level: this level's devices of the chosen ELV device's system, at the same plan positions. */
  function copyLevel(key: string) {
    const to = floors.find((f) => f.key === key);
    if (!floor || !to || to.key === floor.key) return;
    const r = copyTo(project, { building: floor.ref.building, level: floor.ref.level }, { building: to.ref.building, level: to.ref.level }, elvSystem, floorLabel(project.building, to));
    if (r.next) change(r.next, r.message); else cad.say(`COPY  ${r.message}`);
  }

  /** Picks devices and drawn objects: one (it is the selected object, its details on the right), several, or none. */
  function pick(items: PlacedItem[], sks: SketchItem[] = []) {
    setMenuAt(null);
    if (items.length + sks.length === 1) {
      setPicked([]);
      if (items.length) { cad.setSelected(items[0].key); setResult({ kind: 'device', it: items[0] }); } else { cad.setSelected(`sk:${sks[0].id}`); setResult({ kind: 'sketch', it: sks[0] }); }
      return;
    }
    setPicked([...items.map((d) => d.key), ...sks.map((it) => `sk:${it.id}`)]); cad.setSelected(null); setResult(null);
  }
  const picks = (n: number) => `${n} object${n === 1 ? '' : 's'} selected`;
  /** A window (drawing units): the devices and drawn objects in it, added to those picked with Shift. Stretch keeps it
   * as the points to move. */
  function pickWindow(a: Pt, b: Pt, crossing: boolean, add: boolean) {
    if (tool === 'stretch') { setStretchBox([a, b]); setPoints([]); cad.say('STRETCH  Specify base point:'); return; }
    const found = inWindow(placed, [a[0] * units.factor, a[1] * units.factor], [b[0] * units.factor, b[1] * units.factor], crossing, DEVICE_R_M);
    const foundSk = sketchInWindow(pickable, a, b, crossing);
    const items = add || tool !== 'none' ? [...pickedItems, ...found.filter((d) => !pickedKeys.has(d.key))] : found;
    const sks = add || tool !== 'none' ? [...pickedSk, ...foundSk.filter((it) => !pickedKeys.has(`sk:${it.id}`))] : foundSk;
    pick(tool === 'none' ? items : [], sks);
    const n = (tool === 'none' ? items.length : 0) + sks.length;
    cad.say(n ? `SEL  ${picks(n)}${tool !== 'none' ? ' — Enter when done' : ''}` : 'SEL  Nothing in the window.');
  }
  /** Right click: the menu of edits at the cursor, for the device or drawn object under it (or what is picked). */
  function contextAt(at: Pt, pixel: number, screen: Pt) {
    if (tool !== 'none') return;
    const d = deviceAt(at, pixel), sk = d ? undefined : itemAt(pickable, at, 6 * pixel);
    if (d && !pickedKeys.has(d.key)) pick([d]);
    else if (sk && !pickedKeys.has(`sk:${sk.id}`)) pick([], [sk]);
    if (!d && !sk && !pickedItems.length && !pickedSk.length) return;
    setMenuAt(screen);
  }
  const fileOf = () => view?.file ?? '';
  /** The project with a drawn item replaced by what an edit made of it: the first keeps its ID, the rest are added. */
  const replaced = (p: Project, it: SketchItem, items: Omit<SketchItem, 'id'>[]) => {
    if (!items.length) return removeSketch(p, fileOf(), it.id);
    let next = updateSketch(p, fileOf(), { ...items[0], id: it.id } as SketchItem);
    for (const x of items.slice(1)) next = addSketch(next, fileOf(), x).project;
    return next;
  };
  const added = (p: Project, items: Omit<SketchItem, 'id'>[]) => items.reduce((q, x) => addSketch(q, fileOf(), x).project, p);
  const failed = (r: Edit, cmd: string) => { if (r.error) cad.say(`${cmd}  ${r.error}`); return !!r.error; };
  /** An edit from the toolbar, the menu or the side panel, on the drawn objects picked. */
  function editSketch(e: SketchEdit, arg?: string) {
    setMenuAt(null);
    const sks = pickedSk, one = sks.length === 1 && !pickedItems.length ? sks[0] : undefined;
    if (e === 'filter' && arg) {
      if (arg === 'devices') pick(pickedItems); else if (arg === 'drawn') pick([], sks); else pick([], sks.filter((it) => kindOf(it) === arg));
      return;
    }
    if (e === 'width' && one?.tray && arg) { change(updateSketch(project, fileOf(), { ...one, tray: { ...one.tray, widthMm: Number(arg) } }), `Cable tray ${arg} mm · ⌘Z to undo`); return; }
    if (e === 'erase') { removeSelected(); return; }
    if (e === 'join') { applyJoin(); return; }
    if (e === 'rotate' && !one) { cad.say('ROTATE  One object at a time.'); return; }
    if (e === 'filter' || e === 'width') return;
    if ((e === 'offset' || e === 'fillet') && one) preset.current = { id: one.id, at: gripsOf(one).find((g) => g.kind === 'mid')?.at ?? one.pts[0] };
    cad.setTool(e);
  }
  /** Join: the drawn objects picked that meet end to end become one. */
  function applyJoin() {
    const r = join(pickedSk, 0.01 / units.factor);
    if (failed(r, 'JOIN')) return;
    const [first, ...rest] = pickedSk.filter((it) => r.joined!.includes(it.id));
    let next = replaced(project, first, r.items!);
    for (const it of rest) next = removeSketch(next, fileOf(), it.id);
    change(next, `JOIN  ${r.joined!.length} objects joined into one polyline${pickedSk.length > r.joined!.length ? ` (${pickedSk.length - r.joined!.length} did not meet the others)` : ''} · ⌘Z to undo`);
    pick([], []); cad.setTool('none');
  }
  /** Array: copies of the drawn objects picked (rectangular, or polar round `centre`). */
  function applyArray(centre?: Pt) {
    const f = units.factor, n = (s: string, d: number) => (Number.isFinite(Number(s)) && s.trim() !== '' ? Number(s) : d);
    const copies = pickedSk.flatMap((it) => (edSet.polar ? arrayPolar(it, centre!, n(edSet.n, 6), n(edSet.angle, 360)) : arrayRect(it, n(edSet.rows, 2), n(edSet.cols, 3), n(edSet.dx, 1) / f, n(edSet.dy, 1) / f)));
    if (!copies.length) { cad.say('ARRAY  Nothing to copy: more rows, columns or items.'); return; }
    change(added(project, copies), `ARRAY  ${copies.length} cop${copies.length === 1 ? 'y' : 'ies'} made · ⌘Z to undo`);
    pick([], []); cad.setTool('none');
  }
  /** A click with an edit tool (drawing units). */
  function editClick(at: Pt, pixel: number, shiftKey: boolean) {
    const sk = itemAt(pickable, at, 6 * pixel), f = units.factor, num = (s: string) => Number(s);
    const cmd = tool.toUpperCase();
    if (PICK_FIRST.includes(tool) && edPhase === 'pick') {
      if (!sk) { cad.say(`${cmd}  Click a drawn object (the architect's drawing is not changed):`); return; }
      const sks = pickedKeys.has(`sk:${sk.id}`) ? pickedSk.filter((x) => x.id !== sk.id) : [...pickedSk, sk];
      pick([], sks); cad.say(`${cmd}  ${picks(sks.length)} — Enter when done`); return;
    }
    if (tool === 'trim' || tool === 'extend') {
      if (!sk) { cad.say(`${cmd}  Click a drawn line (the architect's lines are not changed):`); return; }
      const asTrim = (tool === 'trim') !== shiftKey, edges = edgesFor(sketch, sk.id, drawingSegs);
      const r = asTrim ? trim(sk, at, edges) : extend(sk, at, edges);
      if (failed(r, asTrim ? 'TRIM' : 'EXTEND')) return;
      change(replaced(project, sk, r.items!), asTrim ? `TRIM  ${m(toM((r as { cut?: number }).cut ?? 0))} cut off · ⌘Z to undo` : `EXTEND  ${m(toM((r as { gain?: number }).gain ?? 0))} longer · ⌘Z to undo`);
      return;
    }
    if (tool === 'explode') {
      if (!sk) { cad.say('EXPLODE  Click a polyline or rectangle:'); return; }
      const r = explode(sk);
      if (!failed(r, 'EXPLODE')) change(replaced(project, sk, r.items!), `EXPLODE  ${r.items!.length} lines · ⌘Z to undo`);
      return;
    }
    if (tool === 'offset' || tool === 'fillet' || tool === 'chamfer' || tool === 'break') {
      if (!edStep) {
        if (!sk) { cad.say(`${cmd}  Click a drawn object:`); return; }
        setEdStep({ id: sk.id, at });
        cad.say(tool === 'offset' ? 'OFFSET  Specify point on the side to offset:' : tool === 'break' ? 'BREAK  Specify second break point, or Enter to break here:' : `${cmd}  Select the second line:`);
        return;
      }
      const first = sketch.find((x) => x.id === edStep.id);
      setEdStep(null);
      if (!first) return;
      if (tool === 'offset') {
        const r = offset(first, num(edSet.offset) / f, at);
        if (!failed(r, 'OFFSET')) change(added(project, r.items!), `OFFSET  ${first.tray ? `Cable tray ${first.tray.widthMm} mm` : kindOf(first)} copied ${m(num(edSet.offset))} to the side · ⌘Z to undo`);
        cad.say(PROMPT.offset); return;
      }
      if (tool === 'break') {
        const r = breakAt(first, edStep.at, at);
        if (!failed(r, 'BREAK')) change(replaced(project, first, r.items!), `BREAK  ${kindOf(first)} broken · ⌘Z to undo`);
        return;
      }
      if (!sk) { cad.say(`${cmd}  Click the second line:`); setEdStep(edStep); return; }
      const r = tool === 'fillet' ? fillet(first, edStep.at, sk, at, num(edSet.radius) / f) : chamfer(first, edStep.at, sk, at, num(edSet.d1) / f, num(edSet.d2) / f);
      if (failed(r, cmd)) return;
      const [a, b, ...extra] = r.items!;
      change(added(replaced(replaced(project, first, [a]), sk, [b]), extra), `${cmd}  ${tool === 'fillet' ? (extra.length ? `radius ${m(num(edSet.radius))}` : 'sharp corner') : `${m(num(edSet.d1))} × ${m(num(edSet.d2))}`}${r.note ? ` — ${r.note}` : ''} · ⌘Z to undo`);
      return;
    }
    if (tool === 'mirror') {
      if (!points.length) { setPoints([at]); cad.say('MIRROR  Specify second point of the mirror line:'); return; }
      const [a] = points, flipped = pickedSk.map((it) => mirrored(it, a, at));
      let next = project;
      pickedSk.forEach((it, i) => { next = edSet.keep ? addSketch(next, fileOf(), flipped[i]).project : updateSketch(next, fileOf(), { ...flipped[i], id: it.id } as SketchItem); });
      change(next, `MIRROR  ${picks(pickedSk.length).replace(' selected', '')} mirrored${edSet.keep ? ', originals kept' : ''} · ⌘Z to undo`);
      setPoints([]); pick([], []); cad.setTool('none'); return;
    }
    if (tool === 'scale') {
      const k = num(edSet.factor);
      if (!(k > 0)) { cad.say('SCALE  Type a factor above 0 on the right.'); return; }
      change(pickedSk.reduce((q, it) => updateSketch(q, fileOf(), scaled(it, at, k)), project), `SCALE  ${picks(pickedSk.length).replace(' selected', '')} scaled × ${k} · ⌘Z to undo`);
      pick([], []); cad.setTool('none'); return;
    }
    if (tool === 'array') { if (edSet.polar) applyArray(at); else cad.say('ARRAY  Rectangular: Apply on the right.'); return; }
    if (tool === 'stretch') {
      if (!stretchBox) { cad.say(PROMPT.stretch); return; }
      if (!points.length) { setPoints([at]); cad.say('STRETCH  Specify second point:'); return; }
      const [dx, dy] = [at[0] - points[0][0], at[1] - points[0][1]], [a, b] = stretchBox;
      let next = project, n = 0;
      for (const it of sketch) { const st = stretched(it, a, b, dx, dy); if (st) { next = updateSketch(next, fileOf(), st); n += 1; } }
      const inBox = inWindow(placed, [a[0] * f, a[1] * f], [b[0] * f, b[1] * f], false, 0);
      if (inBox.length && floor) next = moveDevices(next, inBox, new Map(inBox.map((d): [string, Pt] => [d.key, [d.x + dx * f, d.y + dy * f]])), floor.ref);
      if (!n && !inBox.length) cad.say('STRETCH  Nothing has points in the window.');
      else change(next, `STRETCH  ${n} drawn object${n === 1 ? '' : 's'}${inBox.length ? ` and ${inBox.length} device${inBox.length === 1 ? '' : 's'}` : ''} by ${m(toM(Math.hypot(dx, dy)))} · ⌘Z to undo`);
      setPoints([]); setStretchBox(null); cad.setTool('none');
    }
  }
  /** An edit from the toolbar, the menu or the side panel, on the devices picked. */
  function editDevices(e: DeviceEdit, arg?: string) {
    const items = pickedItems;
    setMenuAt(null);
    if (!floor || !items.length) return;
    const what = items.length === 1 ? items[0].label : `${items.length} devices`;
    try {
      if (e === 'filter' && arg) { const keep = items.filter((d) => typeOf(project, d) === arg); pick(keep); cad.say(`SEL  ${keep.length} × ${keep[0]?.label ?? arg} kept`); }
      else if (e === 'row' || e === 'column' || e === 'space') {
        const to = arranged(items, e);
        change(moveDevices(project, items, to, floor.ref), `${e === 'space' ? `SPACE  ${items.length} devices spaced equally` : `ALIGN  ${items.length} devices in a ${e}`} · ⌘Z to undo`);
      } else if (e === 'array') {
        const d = (project.lvPoints ?? []).find((x) => x.id === items[0].id);
        setArlSet((s) => ({ ...s, device: typeOf(project, items[0]) }));
        if (d) cad.setFeederId(d.feederId);
        cad.setTool('arl');
      } else if (e === 'replace' && arg) {
        const r = replaceDevices(project, items, arg);
        const to = palette.find((x) => x.id === arg)?.label ?? arg;
        const lighting = items.some((d) => /^ltg$/.test(typeOf(project, d))) && arg !== 'ltg' && items[0].what === 'lv';
        if (r.changed) change(r.project, `REPLACE  ${what} → ${to}${lighting ? ' — check the circuit: it was a lighting point' : ''} · ⌘Z to undo`); else cad.say(`REPLACE  Nothing to change: already ${to}, or an emergency light or sign.`);
      } else if (e === 'circuit' && arg) {
        const f = project.feeders.find((x) => x.id === arg);
        const after = circuitAfter(project, items, arg);
        const r = toCircuit(project, items, arg);
        if (r.changed && f) change(r.project, `CIRCUIT  ${what} on ${circuitLabel(project, f).split(' · ')[0]} (${after.points} points${after.over ? `; ${after.over.n} of this type, over the ${after.over.max} allowed` : ''}) · ⌘Z to undo`);
        else cad.say('CIRCUIT  Already on that circuit.');
      } else if (e === 'coverage') {
        cad.setDevice(typeOf(project, items[0]));
        if (!cad.coverage) cad.setCoverage(true);
      } else if (e === 'match') {
        setMatchFrom(items[0].key); cad.setTool('match');
        setTimeout(() => cad.say(`MA  From ${items[0].label}: click each device to change.`));
      } else if (e === 'move' || e === 'copy') {
        if (items.length === 1) cad.setSelected(items[0].key);
        cad.setTool(e);
        setTimeout(() => cad.say(`${e.toUpperCase()}  ${what}: specify base point:`));
      } else if (e === 'delete') removeSelected();
      else if (e === 'rename') {
        setRenaming(items[0].id); cad.say(`RENAME  Type the new name of ${items[0].id} (now ${items[0].detail || 'none'}), Enter:`); input.current?.focus();
      } else if (e === 'circuits') {
        const on = onBoard(project, placed, items[0].id);
        pick(on); cad.say(`SEL  ${on.length} device${on.length === 1 ? '' : 's'} on ${items[0].id}'s circuits on this level`);
      }
    } catch (err) { cad.say(err instanceof Error ? err.message : String(err)); }
  }
  /** Array on line: places the devices along the line. */
  function placeArl() {
    if (!floor || !arlItem) return;
    try {
      const r = placeAlong(project, floor.ref, arlSet.device, cad.feederId, arlAt);
      const f = 'lv' in arlItem.kind ? project.feeders.find((x) => x.id === cad.feederId) : undefined;
      change(r.project, `ARL  ${r.placed} × ${arlItem.label} placed${f ? ` on ${circuitLabel(project, f).split(' · ')[0]}` : ''} · ⌘Z to undo`);
      setPoints([]);
    } catch (err) { cad.say(`ARL  ${err instanceof Error ? err.message : String(err)}`); }
  }

  /** The room name inside an outline: a text on a layer named like room names, else any text inside. */
  const nameInside = (poly: Pt[]) => {
    const texts = (view?.info.texts ?? []).filter((t) => cad.layersOn[t.layer] && inside([t.x, t.y], poly));
    const named = texts.find((t) => /ROOM|RM|NAME|SPACE/i.test(view!.info.layers[t.layer]?.name ?? ''));
    return (named ?? texts[0])?.s.trim();
  };

  function finishArea(pts: Pt[]) {
    if (pts.length < 3) { cad.say('An area needs at least 3 corners.'); return; }
    setResult({ kind: 'area', points: pts, how: tool === 'trace' ? 'trace' : 'corners', name: nameInside(pts) });
    const { area, perimeter } = areaOf(pts);
    cad.say(`Area = ${m2(toM2(area))}, Perimeter = ${m(toM(perimeter))}`);
    setPoints([]);
  }

  const draw = (item: Omit<SketchItem, 'id'>, what: string) => {
    if (!view) return;
    const { project: next, id } = addSketch(project, view.file, item);
    change(next, `${what} · ⌘Z to undo`);
    return id;
  };
  /** The object a modify tool works on: the drawn object or the device under the click. */
  const selectAt = (at: Pt, pixel: number): boolean => {
    const d = deviceAt(at, pixel);
    if (d) { cad.setSelected(d.key); setResult({ kind: 'device', it: d }); return true; }
    const sk = itemAt(pickable, at, 6 * pixel);
    if (sk) { cad.setSelected(`sk:${sk.id}`); setResult({ kind: 'sketch', it: sk }); return true; }
    return false;
  };
  /** Moves (or copies) the selected object by (dx, dy) drawing units. */
  function shift(dx: number, dy: number, copy: boolean) {
    if (!view || !floor && !selSketch) return;
    if (selSketch) {
      if (copy) draw({ ...moved(selSketch, dx, dy), id: undefined } as Omit<SketchItem, 'id'>, 'Copied');
      else change(updateSketch(project, view.file, moved(selSketch, dx, dy)), 'Moved · ⌘Z to undo');
      return;
    }
    if (!selectedItem || !floor) return;
    const [x, y] = [selectedItem.x + dx * units.factor, selectedItem.y + dy * units.factor];
    if (!copy) { change(selectedItem.what === 'elv' ? moveElv(project, selectedItem.id, x, y) : moveItem(project, selectedItem, x, y, floor.ref), `${selectedItem.label} moved · ⌘Z to undo`); return; }
    if (selectedItem.what === 'lv') {
      const src = (project.lvPoints ?? []).find((p) => p.id === selectedItem.id)!;
      change(placeLvPoint(project, floor.ref, src.type, src.feederId, x, y).project, `${selectedItem.label} copied onto ${selectedItem.detail.split(' · ')[0]} · ⌘Z to undo`);
    } else if (selectedItem.what === 'elv') {
      const src = (project.elvDevices ?? []).find((p) => p.id === selectedItem.id)!;
      change(placeElv(project, src.type, floor.ref, x, y).project, `${selectedItem.label} copied · ⌘Z to undo`);
    } else cad.say('COPY  A board is one item; place another board with Add device.');
  }

  async function click(at: Pt, pixel: number, shiftKey = false) {
    if (!view) return;
    const last = points[points.length - 1];
    if (tool === 'xattach') { if (xDraft) setXDraft({ ...xDraft, at }); cad.setTool('none'); return; }
    if (tool === 'xclip') {
      if (xClip?.outline) {
        const rooms = floor ? buildingInfoOf(project).rooms.filter((q) => q.buildingId === floor.ref.building && q.levelId === floor.ref.level && (q.outline?.length ?? 0) > 2).map((q) => q.outline!.map(([x, y]): Pt => [x / units.factor, y / units.factor])) : [];
        const o = hatchOutline(pickable, at, rooms) ?? (() => { const q = roomAround(walls, at, units.factor); return q ? { pts: q.points } : undefined; })();
        if (!o) { cad.say('XCLIP  No closed outline around that point. Click inside one, or Esc:'); return; }
        finishClip(o.pts); return;
      }
      setPoints((p) => [...p, at]); cad.say(`XCLIP  Next corner${points.length ? ', Enter to finish' : ''}:`); return;
    }
    if (tool === 'matchprop') {
      const sk = itemAt(pickable, at, 6 * pixel), from = sketch.find((x) => x.id === mpFrom);
      if (!sk) { cad.say(from ? 'MATCHPROP  Select destination object:' : PROMPT.matchprop); return; }
      if (!from || sk.id === from.id) { setMpFrom(sk.id); cad.say('MATCHPROP  Select destination object(s):'); return; }
      change(updateSketch(project, fileOf(), matchedProps(from, sk)), `MATCHPROP  Properties copied to the ${kindOf(sk).toLowerCase()} · ⌘Z to undo`);
      return;
    }
    if (EDIT_TOOLS.includes(tool)) { editClick(at, pixel, shiftKey); return; }
    if ((tool === 'move' || tool === 'copy') && many && (floor || !pickedItems.length)) {
      if (!points.length) { setPoints([at]); cad.say(`${tool.toUpperCase()}  Specify second point:`); return; }
      const [ux, uy] = [at[0] - points[0][0], at[1] - points[0][1]], [dx, dy] = [ux * units.factor, uy * units.factor];
      const n = pickedItems.length + pickedSk.length;
      if (tool === 'move') {
        let next = pickedItems.length && floor ? moveDevices(project, pickedItems, new Map(pickedItems.map((d): [string, Pt] => [d.key, [d.x + dx, d.y + dy]])), floor.ref) : project;
        for (const it of pickedSk) next = updateSketch(next, fileOf(), moved(it, ux, uy));
        change(next, `${n} objects moved · ⌘Z to undo`);
        setPoints([]); cad.setTool('none');
      } else {
        const r = pickedItems.length && floor ? copyDevices(project, pickedItems, dx, dy, floor.ref) : { project, copied: 0 };
        const next = added(r.project, pickedSk.map((it) => { const { id: _id, ...rest } = moved(it, ux, uy); return rest; }));
        change(next, `${r.copied + pickedSk.length} object${r.copied + pickedSk.length === 1 ? '' : 's'} copied${r.copied ? ' — point counts updated' : ''} · Enter stops · ⌘Z to undo`);
      }
      return;
    }
    if (tool === 'arl') {
      if (!floor) { cad.say('ARL  Add the building and its levels in Building information first.'); return; }
      setPoints(points.length >= 2 ? [at] : [...points, at]);
      cad.say(points.length === 1 ? 'ARL  Set the device, number or spacing and circuit on the right, then Place (or Enter).' : 'ARL  Click the end of the line:');
      return;
    }
    if (tool === 'match') {
      const d = deviceAt(at, pixel);
      const from = placed.find((x) => x.key === matchFrom);
      if (!d) { cad.say(from ? 'MA  Click a device to change:' : PROMPT.match); return; }
      if (!from || d.key === from.key) { setMatchFrom(d.key); cad.say(`MA  From ${d.label}${d.detail ? ` · ${d.detail.split(' · ')[0]}` : ''}: click each device to change.`); return; }
      const next = matchDevice(project, from, d, matchSet);
      if (next === project) cad.say(`MA  ${d.label}: nothing to take from ${from.label}.`);
      else change(next, `MA  ${d.label} matched to ${from.label}${from.what === 'lv' && matchSet.circuit ? ` on ${from.detail.split(' · ')[0]}` : ''} · ⌘Z to undo`);
      return;
    }
    if (tool === 'move' || tool === 'copy' || tool === 'rotate') {
      if (!selSketch && !selectedItem) {
        if (selectAt(at, pixel)) cad.say(tool === 'rotate' && !itemAt(pickable, at, 6 * pixel) ? 'ROTATE  Click where it faces:' : `${tool.toUpperCase()}  Specify base point:`); else cad.say(`${tool.toUpperCase()}  Select object:`);
        return;
      }
      if (tool === 'rotate' && !selSketch) {
        // A camera or speaker turns to face the point clicked (its coverage follows); other devices keep their way.
        if (selectedItem?.what !== 'elv') { cad.say('ROTATE  Drawn objects, cameras and speakers only (other devices keep their orientation).'); return; }
        const deg = (Math.atan2(at[1] - selectedItem.y / units.factor, at[0] - selectedItem.x / units.factor) * 180) / Math.PI;
        const r = rotateElv(project, selectedItem.id, deg);
        change(r.next, r.message); setPoints([]); cad.setSelected(null); setResult(null); cad.setTool('none'); return;
      }
      if (!points.length) { setPoints([at]); cad.say(tool === 'rotate' ? 'ROTATE  Specify rotation angle (degrees) or a point:' : `${tool.toUpperCase()}  Specify second point:`); return; }
      const base = points[0];
      if (tool === 'rotate') {
        const a = Math.atan2(at[1] - base[1], at[0] - base[0]);
        change(updateSketch(project, view.file, rotated(selSketch!, base, a)), `Rotated ${(a * 180 / Math.PI).toFixed(2)}° · ⌘Z to undo`);
        setPoints([]); cad.setSelected(null); setResult(null); cad.setTool('none'); return;
      }
      shift(at[0] - base[0], at[1] - base[1], tool === 'copy');
      if (tool === 'move') { setPoints([]); cad.setSelected(null); setResult(null); cad.setTool('none'); }
      return;
    }
    if (tool === 'line') {
      if (last) draw({ kind: 'line', layer: DRAW_LAYER, pts: [last, at] }, `Line ${m(toM(distance(last, at)))}`);
      setPoints([at]); cad.say('LINE  Specify next point or Enter to stop:'); return;
    }
    if (tool === 'tray' || tool === 'cable') { setPoints((p) => [...p, at]); cad.say(`${tool === 'tray' ? 'TRAY' : 'ROUTE'}  Specify next point${points.length ? ', Enter to finish' : ''}:`); return; }
    if (tool === 'link') {
      const feeder = project.feeders.find((f) => f.id === cad.cableFeeder);
      if (!feeder) { cad.say('LINK  Choose the cable first (the panel on the right).'); return; }
      const o = await view.pick(at[0], at[1], 6 * pixel, cad.layersOn);
      const pts = o ? objectPath(view, o) : [];
      if (pts.length < 2) { cad.say('LINK  That is not a line or polyline. Click a line of the drawing:'); return; }
      draw({ kind: 'pline', layer: CABLE_LAYER, pts, cable: { feederId: feeder.id } }, `Cable route of ${cableLabel(project, feeder)}: ${m(toM(pathLength(pts)))} (linked from ${view.info.layers[o!.layer]?.name ?? 'the drawing'})`);
      return;
    }
    if (tool === 'pline') {
      if (points.length >= 3 && distance(at, points[0]) <= 8 * pixel) { finishPline(true); return; }
      setPoints((p) => [...p, at]); cad.say('PLINE  Specify next point, C to close, Enter to finish:'); return;
    }
    if (tool === 'rect') {
      if (!last) { setPoints([at]); cad.say('RECTANG  Specify other corner point:'); return; }
      const pts = rectangle(last, at);
      draw({ kind: 'pline', layer: DRAW_LAYER, pts, closed: true }, `Rectangle ${m(toM(Math.abs(at[0] - last[0])))} × ${m(toM(Math.abs(at[1] - last[1])))}`);
      setPoints([]); cad.say(PROMPT.rect); return;
    }
    if (tool === 'circle') {
      if (!last) { setPoints([at]); cad.say('CIRCLE  Specify radius (a point, or type it):'); return; }
      finishCircle(distance(last, at)); return;
    }
    if (tool === 'arc') {
      if (points.length < 2) { setPoints((p) => [...p, at]); cad.say(points.length ? 'ARC  Specify end point:' : 'ARC  Specify second point:'); return; }
      const a = arcThrough(points[0], points[1], at);
      if (!a) cad.say('ARC  The three points are in line; pick another end point.');
      else { draw({ ...a, layer: DRAW_LAYER } as Omit<SketchItem, 'id'>, `Arc radius ${m(toM(a.r ?? 0))}`); setPoints([]); cad.say(PROMPT.arc); }
      return;
    }
    if (tool === 'text') { cad.setTextAt(at); cad.say('TEXT  Enter text (then Enter):'); input.current?.focus(); return; }
    if (tool === 'hatch') {
      const rooms = floor ? buildingInfoOf(project).rooms.filter((r) => r.buildingId === floor.ref.building && r.levelId === floor.ref.level && (r.outline?.length ?? 0) > 2).map((r) => r.outline!.map(([x, y]): Pt => [x / units.factor, y / units.factor])) : [];
      const o = hatchOutline(pickable, at, rooms) ?? (() => { const r = roomAround(walls, at, units.factor); return r ? { pts: r.points, from: 'room' as const } : undefined; })();
      if (!o) { cad.say('HATCH  No closed object or room around that point: draw a closed polyline first.'); return; }
      draw(hatchItem(o, hatchSet), `Hatch ${hatchSet.pattern.toUpperCase()}${o.from === 'room' ? ' in the room' : ''}${'circle' in o && o.circle ? '' : `, ${m2(toM2(areaOf(o.pts).area))}`}`);
      return;
    }
    if (tool === 'leader') { setPoints((p) => [...p, at]); cad.say(points.length ? 'LEADER  Next point, or type the text and Enter:' : 'LEADER  Specify next point:'); if (points.length) input.current?.focus(); return; }
    if (tool === 'rtag') {
      const room = roomAtPoint(at);
      if (!room) { cad.say('ROOMTAG  No room with an outline there: add it first (Room area, Trace or Rooms).'); return; }
      const c = centreOf(room.outline!.map(([x, y]): Pt => [x / units.factor, y / units.factor]));
      if (view) change(roomTagItems(room.name, room.areaM2, c, textH).reduce((q, x) => addSketch(q, view.file, x).project, project), `Room tag ${room.name} · ⌘Z to undo`);
      return;
    }
    if (tool === 'north') { if (view) change(northArrowItems(at, textH).reduce((q, x) => addSketch(q, view.file, x).project, project), 'North arrow · ⌘Z to undo'); cad.setTool('none'); return; }
    if (tool === 'dim') {
      if (points.length < 2) { setPoints((p) => [...p, at]); cad.say(points.length ? 'DIM  Specify dimension line location:' : 'DIM  Specify second extension line origin:'); return; }
      const len = distance(points[0], points[1]);
      draw({ kind: 'dim', layer: ANNO_LAYER, pts: [points[0], points[1], at], text: toM(len).toFixed(2), h: textH * 0.8 }, `Dimension ${m(toM(len))}`);
      setPoints([]); cad.say(PROMPT.dim); return;
    }
    if (tool === 'none') {
      const d = deviceAt(at, pixel);
      setMenuAt(null);
      const skHit = shiftKey && !d ? itemAt(pickable, at, 6 * pixel) : undefined;
      if (d && shiftKey) {
        const items = pickedKeys.has(d.key) ? pickedItems.filter((x) => x.key !== d.key) : [...pickedItems, d];
        pick(items, pickedSk); cad.say(`SEL  ${picks(items.length + pickedSk.length)}`); return;
      }
      if (skHit) {
        const sks = pickedKeys.has(`sk:${skHit.id}`) ? pickedSk.filter((x) => x.id !== skHit.id) : [...pickedSk, skHit];
        pick(pickedItems, sks); cad.say(`SEL  ${picks(pickedItems.length + sks.length)}`); return;
      }
      setPicked([]);
      if (d) { cad.setSelected(d.key); setResult({ kind: 'device', it: d }); cad.say(`LIST  ${d.label}${d.detail ? ` · ${d.detail}` : ''}${d.room ? ` · ${d.room}` : ''}`); return; }
      cad.setSelected(null);
      const sk = itemAt(pickable, at, 6 * pixel);
      if (sk) { cad.setSelected(`sk:${sk.id}`); setResult({ kind: 'sketch', it: sk }); cad.say(`LIST  ${sk.tray ? `Cable tray ${sk.tray.widthMm} mm, ${m(toM(trayLength(sk)))}${sk.tray.route ? ` on route ${sk.tray.route}` : ', no route'}` : sk.cable ? `Cable route of ${cableLabels[sk.id] ?? sk.cable.feederId}, ${m(toM(pathLength(sk.pts)))}` : sk.kind === 'pline' ? 'Polyline' : sk.kind} on ${sk.layer} (drawn here)`); return; }
      const o = await view.pick(at[0], at[1], 6 * pixel, cad.layersOn);
      setResult(o ? { kind: 'object', o } : null);
      if (o) cad.say(`LIST  ${o.kind}${o.block ? ` ${o.block}` : ''} on ${view.info.layers[o.layer]?.name ?? '?'}${o.length !== undefined && !o.closed ? `, length ${m(toM(o.length))}` : ''}${o.area !== undefined ? `, area ${m2(toM2(o.area))}` : ''}`);
    } else if (tool === 'dist') {
      if (points.length === 0) { setPoints([at]); setResult(null); cad.say('DI  Specify second point:'); return; }
      const a = points[0];
      setResult({ kind: 'dist', a, b: at });
      cad.say(`Distance = ${m(toM(distance(a, at)))}, Angle = ${angleDeg(a, at).toFixed(2)}°, ΔX = ${m(toM(at[0] - a[0]))}, ΔY = ${m(toM(at[1] - a[1]))}`);
      setPoints([]);
    } else if (tool === 'area' || tool === 'trace') {
      if (objectMode && tool === 'area') {
        const o = await view.pick(at[0], at[1], 6 * pixel, cad.layersOn, true);
        if (!o || o.area === undefined) { cad.say('AREA  That is not a closed object (polyline, circle, hatch). Select a closed object:'); return; }
        const segs: Pt[] = [];
        for (let i = o.seg_start; i < o.seg_end; i += 1) segs.push([view.segs[i * 4] + view.info.origin[0], view.segs[i * 4 + 1] + view.info.origin[1]]);
        setResult({ kind: 'area', points: segs, how: 'object' });
        cad.say(`Area = ${m2(toM2(o.area))}${o.length !== undefined ? `, Perimeter = ${m(toM(o.length))}` : ''}`);
        return;
      }
      if (points.length >= 3 && distance(at, points[0]) <= 8 * pixel) { finishArea(points); return; }
      if (points.length === 0) setResult(null);
      setPoints((p) => [...p, at]);
      cad.say(`${tool === 'trace' ? 'TRACE' : 'AREA'}  Specify next corner point or press Enter to close:`);
    } else if (tool === 'dev') {
      if (!floor) { cad.say('DEV  Add the building and its levels in Building information first; devices are kept per level.'); return; }
      try {
        const [x, y] = [at[0] * units.factor, at[1] * units.factor];
        const r = 'elv' in item.kind ? placeElv(project, (ELV_PALETTE.find((e) => e.id === item.id) ?? ELV_PALETTE[0]).kind.elv, floor.ref, x, y)
          : placeItem(project, item, floor.ref, x, y, { feederId: cad.feederId, boardId: cad.boardId });
        change(r.project, `${r.message} · ⌘Z to undo`);
      } catch (e) { cad.say(`DEV  ${e instanceof Error ? e.message : String(e)}`); }
    } else if (tool === 'wire') {
      wireOne(at, pixel);
    } else if (tool === 'fill') {
      if (!floor) { cad.say('FILL  Add the building and its levels in Building information first.'); return; }
      if (!elvItem) { cad.say('FILL  Choose an ELV device first (a detector, speaker, data outlet…) in the Devices panel.'); return; }
      const r = fillAt(project, { building: floor.ref.building, level: floor.ref.level }, elvItem.kind.elv, [at[0] * units.factor, at[1] * units.factor]);
      if (r.next) change(r.next, r.message); else cad.say(`FILL  ${r.message}`);
    } else if (tool === 'lux') {
      if (!floor) { cad.say('LUX  Add the building and its levels in Building information first.'); return; }
      const room = roomAtPointOf(project, floor, at, units.factor);
      if (!room) { cad.say('LUX  No room with an outline there: add it first (Room area, Trace or Rooms).'); return; }
      const r = lightingOf(project, room, { ...luxSet, lux: undefined, ceil: undefined, wp: undefined });
      setLuxRoom(room.id); setLuxSet((s) => ({ ...s, lux: undefined, ceil: undefined, wp: undefined }));
      cad.say(r.result.invalid ? `LUX  ${room.name}: ${r.result.invalid}` : `LUX  ${room.name}: ${r.result.count} light${r.result.count === 1 ? '' : 's'} for ${r.input.targetLux} lx — set the luminaire and circuit, then Place.`);
    } else if (tool === 'em') {
      if (!floor) { cad.say('EM  Add the building and its levels in Building information first.'); return; }
      const atM: Pt = [at[0] * units.factor, at[1] * units.factor];
      if (emSet.mode === 'route') { setPoints((p) => [...p, at]); cad.say(`EM  Specify next point of the escape route${points.length ? ', Enter to finish' : ''}:`); return; }
      if (emSet.mode === 'point') { setEm((e) => ({ ...e, points: [...e.points, { at: atM, kind: emSet.kind }] })); cad.say(`EM  ${EMPHASIS_LABEL[emSet.kind]} marked.`); return; }
      const room = roomAtPointOf(project, floor, at, units.factor);
      if (!room) { cad.say('EM  No room with an outline there: add it first (Room area, Trace or Rooms).'); return; }
      const on = em.rooms.includes(room.id);
      setEm((e) => ({ ...e, rooms: on ? e.rooms.filter((x) => x !== room.id) : [...e.rooms, room.id] }));
      cad.say(on ? `EM  ${room.name}: open area taken off.` : `EM  ${room.name} (${m2(room.areaM2)}): open area${room.areaM2 > OPEN_AREA_M2 ? '' : ' — 60 m² or less: needed only when an escape route passes through it'}.`);
    } else if (tool === 'room') {
      const r = roomAround(walls, at, units.factor);
      if (!r) { cad.say('ROOM AREA  No closed room around that point (open to the outside, or over 50 m across). Use AREA and click its corners.'); return; }
      setResult({ kind: 'area', points: r.points, how: 'room', name: nameInside(r.points) });
      cad.say(`Room area = ${m2(toM2(r.area))}`);
    } else if (tool === 'name') {
      const o = await view.pick(at[0], at[1], 6 * pixel, cad.layersOn);
      const text = o?.text?.trim();
      if (!text) { cad.say('NAME  That is not a text. Click the room name on the drawing:'); return; }
      if (result?.kind === 'area' && result.how !== 'object') { setResult({ ...result, name: text }); cad.say(`NAME  ${text} — Add as room… to add it`); return; }
      const room = floor && roomAtPoint(at);
      if (!room) { cad.say(`NAME  “${text}” is not inside a room yet: find the room first (Click inside or Trace).`); return; }
      if (room.name.toLowerCase() === text.toLowerCase()) { cad.say(`NAME  ${room.name} already`); return; }
      change(renameRoom(project, room.id, text), `${room.name} renamed ${text} · ⌘Z to undo`);
    }
  }

  /** The smallest room of the plan's level whose outline (metres) is around a point (drawing units). */
  const roomAtPoint = (at: Pt) => (floor ? roomAtPointOf(project, floor, at, units.factor) : undefined);

  /** Add found rooms: the closed outlines on the room-outline layers (Layer roles), named by the text inside, added to
   * Building information on the plan's level (a room found again keeps its ID; one undo step). */
  function addFound() {
    if (!view) return;
    if (!floor) { cad.say('ROOMS  Add the building and its levels in Building information first; rooms are kept per level.'); return; }
    if (!roles.some((r) => r.role === 'room')) { cad.say('ROOMS  No layer has the role Room outline: set it in File → Layer roles, or use Click inside / Trace.'); cad.setShowRoles(true); return; }
    const code = CAD_UNITS.find((u) => u.id === units.unit)!.code;
    const { rooms, zones } = roomsFromPlan(planOfView(view, code, cad.layersOn), roles, project.cadLength);
    if (!rooms.length) { cad.say('ROOMS  No closed outlines on the room-outline layers that are shown. Use Click inside or Trace.'); return; }
    const { project: next } = putRooms(project, rooms.map((r) => ({ ...r, file: view.file })), floor.ref, roles);
    const label = floorLabel(project.building, floor);
    change(next, `${rooms.length} room${rooms.length === 1 ? '' : 's'} from the plan on ${label}${rooms.some((r) => !r.named) ? ` (${rooms.filter((r) => !r.named).length} without a name: Pick name)` : ''}${zones ? ` · ${zones} zone outline${zones === 1 ? '' : 's'} left out` : ''}${levelSet ? '' : ' — level not set: File → Level'} · ⌘Z to undo`);
  }

  function finishPline(closed: boolean) {
    if (points.length >= 2) draw({ kind: 'pline', layer: DRAW_LAYER, pts: points, closed }, `Polyline (${points.length} points${closed ? ', closed' : ''})`);
    setPoints([]); cad.say(PROMPT.pline);
  }
  /** A cable route along the points clicked, for the cable chosen. */
  function finishCable() {
    const feeder = project.feeders.find((f) => f.id === cad.cableFeeder);
    if (!feeder) cad.say('ROUTE  Choose the cable first (the panel on the right).');
    else if (points.length >= 2) draw({ kind: 'pline', layer: CABLE_LAYER, pts: points, cable: { feederId: feeder.id } }, `Cable route of ${cableLabel(project, feeder)}: ${m(toM(pathLength(points)))}`);
    setPoints([]); cad.say(PROMPT.cable);
  }
  /** Update schedules: tray route lengths and fittings, feeder lengths and tray routes, from every level's plan. */
  function schedules() {
    if (!view) return;
    const u = updateSchedules(project, planDrawings(project, { file: view.file, insunits: view.info.units }));
    const same = JSON.stringify([u.project.trays, u.project.feeders]) === JSON.stringify([project.trays, project.feeders]);
    if (same) { cad.say(`SCHED  Up to date: ${scheduleSummary(u)}`); return; }
    change(u.project, `Schedules updated: ${scheduleSummary(u)} · ⌘Z to undo`);
  }
  /** A cable tray run along the points clicked, at the chosen width; on a tray route only once one is chosen. */
  function finishTray() {
    if (points.length >= 2) {
      const { widthMm, service, route } = cad.tray;
      const it = { kind: 'pline' as const, layer: TRAY_LAYER, pts: points, tray: { widthMm, service, ...(route ? { route } : {}) } };
      draw(it, `Cable tray ${widthMm} mm ${service.toLowerCase()}, ${m(toM(trayLength({ ...it, id: '' })))}${route ? ` on route ${route}` : ' (no route: assign one when you know it)'}`);
    }
    setPoints([]); cad.say(PROMPT.tray);
  }
  function finishCircle(r: number) {
    if (!points[0] || r <= 0) return;
    draw({ kind: 'circle', layer: DRAW_LAYER, pts: [points[0]], r }, `Circle radius ${m(toM(r))}`);
    setPoints([]); cad.say(PROMPT.circle);
  }

  function run(text: string) {
    const raw = text.trim();
    const c = raw.toUpperCase().replace(/\s+/g, ' ');
    // Typed input for the tool in use: the text of TEXT, a radius, an angle, a point or a distance.
    if (renamingLayout && raw) {
      const id = renamingLayout, set = setOf(project);
      setRenamingLayout(null);
      change({ ...project, drawingSet: { ...set, sheets: set.sheets.map((x) => (x.id === id ? { ...x, title: raw } : x)) } }, `LAYOUT  renamed "${raw}" · ⌘Z to undo`);
      return;
    }
    if (renaming && raw) {
      const id = renaming;
      setRenaming(null);
      try { change(renameBoard(project, id, raw), `${id} renamed ${raw} · ⌘Z to undo`); } catch (e) { cad.say(`RENAME  ${e instanceof Error ? e.message : String(e)}`); }
      return;
    }
    if (tool === 'xclip' && (c === '' || c === 'C')) { finishClip(points); return; }
    if (tool === 'xclip' && c === 'O' && xClip) { setXClip({ ...xClip, outline: true }); setPoints([]); cad.say('XCLIP  Click inside a closed outline (a closed polyline, or a room):'); return; }
    if (tool === 'leader' && points.length >= 2 && raw) {
      if (view) change(leaderItems(points, raw, textH).reduce((q, x) => addSketch(q, view.file, x).project, project), `Leader "${raw}" · ⌘Z to undo`);
      setPoints([]); cad.say(PROMPT.leader); return;
    }
    if (tool === 'text' && cad.textAt && raw) {
      draw({ kind: 'text', layer: ANNO_LAYER, pts: [cad.textAt], text: raw, h: textH }, `Text "${raw}"`);
      cad.setTextAt(null); cad.say(PROMPT.text); return;
    }
    if (c && layoutCmd(c)) return;
    if (!c) {
      if ((tool === 'area' || tool === 'trace') && points.length >= 3) finishArea(points);
      else if (tool === 'pline') finishPline(false);
      else if (tool === 'tray') finishTray();
      else if (tool === 'em') finishRoute();
      else if (tool === 'arl' && arlAt.length && points.length >= 2) placeArl();
      else if (renaming) { setRenaming(null); cad.say('*Cancel*'); }
      else if (tool === 'break' && edStep) {
        const it = sketch.find((x) => x.id === edStep.id);
        const r = it ? breakAt(it, edStep.at) : undefined;
        setEdStep(null);
        if (it && r && !failed(r, 'BREAK')) change(replaced(project, it, r.items!), `BREAK  ${kindOf(it)} split in two · ⌘Z to undo`);
      }
      else if (tool === 'join') applyJoin();
      else if (PICK_FIRST.includes(tool) && edPhase === 'pick') {
        if (!pickedSk.length) { cad.say(`${tool.toUpperCase()}  Pick the objects first.`); return; }
        setEdPhase('points');
        cad.say(tool === 'mirror' ? 'MIRROR  Specify first point of the mirror line:' : tool === 'scale' ? 'SCALE  Specify base point:' : edSet.polar ? 'ARRAY  Specify the centre:' : 'ARRAY  Apply on the right.');
      }
      else if (tool === 'array' && !edSet.polar && pickedSk.length) applyArray();
      else if (tool === 'cable') finishCable();
      else if (tool === 'line') { setPoints([]); cad.say(PROMPT.line); }
      else if (tool === 'leader') { if (points.length >= 2 && view) change(addSketch(project, view.file, leaderItems(points, '', textH)[0]).project, 'Leader · ⌘Z to undo'); setPoints([]); cad.say(PROMPT.leader); }
      else if (tool === 'copy') { setPoints([]); cad.setSelected(null); setResult(null); cad.setTool('none'); }
      return;
    }
    if (tool === 'pline' && c === 'C' && points.length >= 3) { finishPline(true); return; }
    if (tool === 'circle' && points.length === 1 && /^-?[\d.]+$/.test(c)) { finishCircle(Number(c)); return; }
    if (tool === 'rotate' && !selSketch && selectedItem?.what === 'elv' && /^-?[\d.]+$/.test(c)) {
      const r = rotateElv(project, selectedItem.id, Number(c));
      change(r.next, r.message); cad.setSelected(null); setResult(null); cad.setTool('none'); return;
    }
    if (tool === 'rotate' && selSketch && points.length === 1 && /^-?[\d.]+$/.test(c)) {
      const a = (Number(c) * Math.PI) / 180;
      if (view) change(updateSketch(project, view.file, rotated(selSketch, points[0], a)), `Rotated ${Number(c).toFixed(2)}° · ⌘Z to undo`);
      setPoints([]); cad.setSelected(null); setResult(null); cad.setTool('none'); return;
    }
    // A number typed with Offset, Fillet or Scale sets its distance, radius or factor.
    const field: Partial<Record<CadTool, keyof EditSettings>> = { offset: 'offset', fillet: 'radius', scale: 'factor' };
    if (field[tool] && /^\d+(\.\d+)?$/.test(c)) { setEdSet({ ...edSet, [field[tool]!]: c }); cad.say(`${tool.toUpperCase()}  ${c}`); return; }
    if (DRAW_TOOLS.includes(tool) || tool === 'dist' || tool === 'area' || tool === 'trace') {
      const p = typedPoint(raw, points[points.length - 1], cursor.at);
      if (p) { cad.say(`  ${raw}`); click(p, 1e-9); return; }
    }
    cad.say(`Command: ${c}`);
    if (c === 'OPEN') openFile();
    else if (c === 'CLOSE' || c === 'CLOSEALL') { if (view) closeDrawings(c === 'CLOSE' ? [view] : undefined); else cad.say('No drawing open.'); }
    else if (['FIT', 'ZE', 'Z E', 'ZOOM E', 'ZOOM EXTENTS'].includes(c)) cad.fit();
    else if (c === 'DI' || c === 'DIST' || c === 'DISTANCE') cad.setTool('dist');
    else if (c === 'AREA' || c === 'AA') cad.setTool('area');
    else if (c === 'O' && tool === 'area') { setObjectMode(true); setPoints([]); cad.say('AREA  Select a closed object:'); }
    else if (c === 'RA' || c === 'ROOM' || c === 'ROOMAREA') cad.setTool('room');
    else if (c === 'ROOMS' || c === 'ADDROOMS') addFound();
    else if (c === 'TR' || c === 'TRACE') cad.setTool('trace');
    else if (c === 'PN' || c === 'NAME') cad.setTool('name');
    else if (c === 'LI' || c === 'LIST') cad.setTool('none');
    else if (c === 'DEV' || c === 'DEVICE' || c === 'INSERT' || c === 'I') cad.setTool('dev');
    else if (c === 'M' || c === 'MOVE') cad.setTool('move');
    else if (c === 'CO' || c === 'CP' || c === 'COPY') cad.setTool('copy');
    else if (c === 'RO' || c === 'ROTATE') cad.setTool('rotate');
    else if (c === 'L' || c === 'LINE') cad.setTool('line');
    else if (c === 'PL' || c === 'PLINE' || c === 'POLYLINE') cad.setTool('pline');
    else if (c === 'CT' || c === 'TRAY' || c === 'CABLETRAY') cad.setTool('tray');
    else if (c === 'CR' || c === 'ROUTE' || c === 'CABLEROUTE') cad.setTool('cable');
    else if (c === 'LR' || c === 'LINK') cad.setTool('link');
    else if (c === 'SCHED' || c === 'SCHEDULES' || c === 'UPDATE') schedules();
    else if (c === 'FILL' || c === 'FR') cad.setTool('fill');
    else if (c === 'LUX' || c === 'LIGHTROOM') cad.setTool('lux');
    else if (c === 'EM' || c === 'EMERGENCY') cad.setTool('em');
    else if (c === 'SEL' || c === 'SELECT') { cad.setTool('none'); cad.say('SEL  Click a device, Shift-click to add or remove, or drag a window (left to right: inside; right to left: crossing):'); }
    else if (c === 'ARL' || c === 'ARRAYLINE') cad.setTool('arl');
    else if (c === 'MA' || c === 'MATCH' || c === 'MATCHPROP') cad.setTool('match');
    else if (c === 'TRIM' || c === 'TM') cad.setTool('trim');
    else if (c === 'EX' || c === 'EXTEND') cad.setTool('extend');
    else if (c === 'O' || c === 'OFFSET') cad.setTool('offset');
    else if (c === 'F' || c === 'FILLET') cad.setTool('fillet');
    else if (c === 'CHA' || c === 'CHAMFER') cad.setTool('chamfer');
    else if (c === 'BR' || c === 'BREAK') cad.setTool('break');
    else if (c === 'J' || c === 'JOIN') cad.setTool('join');
    else if (c === 'X' || c === 'EXPLODE') cad.setTool('explode');
    else if (c === 'MI' || c === 'MIRROR') cad.setTool('mirror');
    else if (c === 'SC' || c === 'SCALE') cad.setTool('scale');
    else if (c === 'S' || c === 'STRETCH') cad.setTool('stretch');
    else if (c === 'AR' || c === 'ARRAY') cad.setTool('array');
    else if (c === 'MP' || c === 'MATCHPROP' || c === 'PAINTER') cad.setTool('matchprop');
    else if (c === 'H' || c === 'HATCH' || c === 'BH') cad.setTool('hatch');
    else if (c === 'LE' || c === 'LEADER' || c === 'QLEADER') cad.setTool('leader');
    else if (c === 'RT' || c === 'ROOMTAG') cad.setTool('rtag');
    else if (c === 'NORTH') cad.setTool('north');
    else if (c === 'XR' || c === 'XREF' || c === 'XREFS' || c === 'ER' || c === 'EXTERNALREFERENCES') { if (view) setShowXR(true); else cad.say('XREF  Open a drawing first.'); }
    else if (c === 'XA' || c === 'XATTACH') { if (view) void startAttach(); else cad.say('XATTACH  Open a plan first.'); }
    else if (c === 'XCLIP' || c === 'XC') { const one = xr.refs.filter((x) => !x.unloaded); if (one.length === 1) startClip(one[0]); else if (view) { setShowXR(true); cad.say('XCLIP  Choose the reference, then Clip.'); } }
    else if (c === 'LM' || c === 'LAYERMANAGER' || c === 'LAYMAN') { if (view) setShowLM(true); else cad.say('LAYER  Open a drawing first.'); }
    else if (c === 'ALIGN' || c === 'ALIGNV' || c === 'SPACE') { if (pickedItems.length < 2) cad.say(`${c}  Select two or more devices first.`); else editDevices(c === 'ALIGN' ? 'row' : c === 'ALIGNV' ? 'column' : 'space'); }
    else if (c === 'WC' || c === 'WIRE' || c === 'WIRECIRCUITS') wireAll();
    else if (c === 'W1' || c === 'WIREONE') cad.setTool('wire');
    else if (c === 'TAGS') cad.setWireTags(!cad.wireTags);
    else if (c === 'COV' || c === 'COVERAGE') cad.setCoverage(!cad.coverage);
    else if (c === 'REC' || c === 'RECTANG' || c === 'RECTANGLE') cad.setTool('rect');
    else if (c === 'C' || c === 'CIRCLE') cad.setTool('circle');
    else if (c === 'A' || c === 'ARC') cad.setTool('arc');
    else if (c === 'T' || c === 'DT' || c === 'TEXT' || c === 'MT') cad.setTool('text');
    else if (c === 'DIM' || c === 'DIMALIGNED' || c === 'DAL' || c === 'DLI') cad.setTool('dim');
    else if (c === 'E' || c === 'ERASE' || c === 'DEL' || c === 'DELETE') removeSelected();
    else if (c === 'SAVE' || c === 'DXFOUT' || c === 'SAVEAS') void saveDxf();
    else if (c === 'SAVEDWG' || c === 'DWGOUT') void saveDxf('dwg');
    else if (c === 'LA' || c === 'LAYER' || c === 'LAYERS') cad.setShowLayers(!cad.showLayers);
    else if (c === 'OS' || c === 'OSNAP') cad.toggle('osnap');
    else if (c === 'GRID') cad.cycleGrid();
    else if (c === 'ORTHO') cad.toggle('ortho');
    else if (c === 'SNAP') cad.toggle('snap');
    else if (c === 'HELP' || c === '?') cad.say(HELP);
    else cad.say(`Unknown command "${c}". ${HELP}`);
  }

  // CAD keys while this page shows: function keys toggle, typing goes to the command line, Enter closes an area, Esc
  // cancels the command (and the tool).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    const fn: Record<string, keyof CadToggles> = { F3: 'osnap', F7: 'grid', F8: 'ortho', F9: 'snap' };
    if (fn[e.key]) { e.preventDefault(); if (fn[e.key] === 'grid') cad.cycleGrid(); else cad.toggle(fn[e.key]); return; }
    if (e.key === 'Escape' && (!typing || e.target === input.current)) {
      setCmd(''); input.current?.blur();
      if (points.length || objectMode || cad.textAt) { setPoints([]); setObjectMode(false); cad.setTextAt(null); cad.say('*Cancel*'); } else if (menuAt) setMenuAt(null); else if (renaming) { setRenaming(null); cad.say('*Cancel*'); } else if (tool !== 'none') cad.setTool('none'); else { setResult(null); cad.setSelected(null); setPicked([]); }
      return;
    }
    if (e.key === 'Enter' && !typing && (tool === 'area' || tool === 'trace') && points.length >= 3) { finishArea(points); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && (selectedItem || selSketch || many)) { e.preventDefault(); removeSelected(); return; }
    if (e.key === 'Enter' && !typing && (tool === 'pline' || tool === 'tray' || tool === 'cable' || tool === 'line' || tool === 'copy' || tool === 'em' || tool === 'arl' || tool === 'break' || tool === 'leader' || tool === 'xclip' || PICK_FIRST.includes(tool))) { run(''); return; }
    if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && /^[a-zA-Z?]$/.test(e.key)) input.current?.focus();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  // The object being drawn (or moved / copied / rotated), following the cursor.
  const cur = cursor.at;
  const lastPt = points[points.length - 1];
  const preview: SketchItem[] = !cur ? [] : (() => {
    const base = { id: '_', layer: '' };
    if (tool === 'line' && lastPt) return [{ ...base, kind: 'line', pts: [lastPt, cur] }];
    if (tool === 'leader' && points.length) return [{ ...base, kind: 'line', pts: [...points, cur] }];
    if (tool === 'pline' && points.length) return [{ ...base, kind: 'line', pts: [...points, cur] }];
    if (tool === 'cable' && points.length) return [{ ...base, kind: 'line', pts: [...points, cur] }];
    if (tool === 'tray' && points.length) return [{ ...base, kind: 'pline', pts: [...points, cur], tray: { widthMm: cad.tray.widthMm, service: cad.tray.service } }];
    if (tool === 'em' && emSet.mode === 'route' && points.length) return [{ ...base, kind: 'line', pts: [...points, cur] }];
    if (tool === 'rect' && lastPt) return [{ ...base, kind: 'pline', pts: rectangle(lastPt, cur), closed: true }];
    if (tool === 'circle' && lastPt) return [{ ...base, kind: 'circle', pts: [lastPt], r: distance(lastPt, cur) }];
    if (tool === 'arc' && points.length === 1) return [{ ...base, kind: 'line', pts: [points[0], cur] }];
    if (tool === 'arc' && points.length === 2) { const a = arcThrough(points[0], points[1], cur); return a ? [{ ...base, ...a } as SketchItem] : []; }
    if (tool === 'dim' && points.length === 1) return [{ ...base, kind: 'line', pts: [points[0], cur] }];
    if (tool === 'dim' && points.length === 2) return [{ ...base, kind: 'dim', pts: [points[0], points[1], cur] }];
    if ((tool === 'move' || tool === 'copy') && lastPt && selSketch) return [moved(selSketch, cur[0] - lastPt[0], cur[1] - lastPt[1])];
    if ((tool === 'move' || tool === 'copy') && lastPt) return [{ ...base, kind: 'line', pts: [lastPt, cur] }];
    if (tool === 'rotate' && lastPt && selSketch) return [rotated(selSketch, lastPt, Math.atan2(cur[1] - lastPt[1], cur[0] - lastPt[0]))];
    return [];
  })();
  const liveLabel = cur && lastPt && ['line', 'pline', 'tray', 'cable', 'dim', 'move', 'copy'].includes(tool) ? `${m(toM(distance(lastPt, cur)))}  ${angleDeg(lastPt, cur).toFixed(1)}°`
    : cur && lastPt && tool === 'circle' ? `R ${m(toM(distance(lastPt, cur)))}` : undefined;
  const marks: CadMarks | null = DRAW_TOOLS.includes(tool) && lastPt ? { points: [lastPt], live: true, label: liveLabel }
    : result?.kind === 'dist' ? { points: [result.a, result.b], label: m(toM(distance(result.a, result.b))) }
    : result?.kind === 'area' && result.how !== 'object' ? { points: result.points, closed: true, label: m2(toM2(areaOf(result.points).area)) }
    : points.length ? (() => {
      const live = cursor.at ? [...points, cursor.at] : points;
      const corners = tool === 'area' || tool === 'trace';
      const label = tool === 'dist' && live.length === 2 ? m(toM(distance(live[0], live[1]))) : corners && live.length >= 3 ? m2(toM2(areaOf(live).area)) : undefined;
      return { points, live: true, area: corners, label };
    })()
    : tool === 'dist' || tool === 'area' || tool === 'trace' ? { points: [], live: false } : null;
  const highlight: [number, number] | null = result?.kind === 'object' ? [result.o.seg_start, result.o.seg_end] : null;
  const objectArea = result?.kind === 'area' && result.how === 'object';

  /** The drawing: on the Model tab, or inside the viewport worked in on a layout (fitted to its window). */
  const drawCanvas = (vpProps?: Pick<React.ComponentProps<typeof CadCanvas>, 'fitBox' | 'fixed' | 'onView'>) => (
            <CadCanvas view={view!} layersOn={cad.layersOn} toggles={cad.toggles} gridDots={cad.gridDots} fitKey={cad.fitKey} onCursor={(at, snap) => setCursor({ at, snap })} onClick={click} marks={objectArea ? { points: result.points, closed: true } : marks} highlight={highlight} devices={devices} wiring={canvasWiring} sketch={sketch} selectedSketch={pickedSk.map((it) => it.id)} extraSnaps={sketchSnaps} preview={[...preview, ...emRoutes, ...(gripIdx !== null && selSketch && cursor.at ? [gripMoved(selSketch, gripIdx, cursor.at)] : []), ...(arlLine.length === 2 ? [{ id: '_arl', layer: '', kind: 'line' as const, pts: arlLine }] : [])]} unitsPerMm={0.001 / units.factor} labels={cableLabels} covers={elv?.covers} gaps={elv?.gaps}
              layerStyle={styles} refs={xr.placed} refSnap={xr.snap} windowSelect={tool === 'none' || tool === 'stretch' || (PICK_FIRST.includes(tool) && edPhase === 'pick')} onWindow={pickWindow} onContext={contextAt}
              grips={tool === 'none' && selSketch && !many ? gripsOf(selSketch).map((g) => g.at) : []} onGripStart={setGripIdx}
              onGripEnd={(i, at) => {
                setGripIdx(null);
                if (i < 0 || !selSketch) return;
                const next = gripMoved(selSketch, i, at);
                change(updateSketch(project, fileOf(), next), `GRIP  ${kindOf(selSketch)} ${gripsOf(selSketch)[i]?.kind === 'mid' ? 'side moved' : 'changed'}${isPath(next) ? ` — now ${m(toM(next.pts.slice(1).reduce((t, q, k) => t + distance(next.pts[k], q), 0)))}` : ''} · ⌘Z to undo`);
              }}
              overlay={(toScreen, moving) => {
                if (tool !== 'none' || moving || gripIdx !== null || (!pickedItems.length && !pickedSk.length)) return null;
                if (!pickedSk.length && (!floor || !cad.showDevices)) return null;
                const skPts = pickedSk.flatMap((it) => { const sg = segmentsOf(it); return sg.length ? sg.flat() : it.pts; });
                const xs = [...pickedItems.map((d) => d.x / units.factor), ...skPts.map((q) => q[0])], ys = [...pickedItems.map((d) => d.y / units.factor), ...skPts.map((q) => q[1])], pad = rUnits * 2;
                const [l, t] = toScreen([Math.min(...xs) - pad, Math.max(...ys) + pad]), [, b] = toScreen([0, Math.min(...ys) - pad]);
                const at = menuAt ? { left: menuAt[0] + 4, top: menuAt[1] + 4, place: 'menu' as const } : t < 60 ? { left: Math.max(4, l), top: b + 8, place: 'below' as const } : { left: Math.max(4, l), top: t - 8, place: 'above' as const };
                if (pickedSk.length) {
                  const one = pickedSk.length === 1 && !pickedItems.length && isPath(pickedSk[0]) ? pickedSk[0] : undefined;
                  return <SketchToolbar key={[...pickedKeys].join()} items={pickedSk} devices={pickedItems.length} lengthM={one ? toM(pathLength(one.pts)) : undefined} {...at} onEdit={editSketch} />;
                }
                return <DeviceToolbar key={[...pickedKeys].join()} project={project} items={pickedItems} edits={editsFor(project, pickedItems)} circuits={circuits} {...at} onEdit={editDevices} />;
              }} {...vpProps} />
  );

  return (
    <section className="cad">
      <CadTabs cad={cad} project={project} busy={busy} onOpen={openFile} onClose={closeDrawings} />
      <div className="cad-work">
        {view && sheetL ? (
          <div className="cad-stage cad-paper">
            {sheetUi ? <SheetWorkspace bare project={project} run={calcRun} sheetId={sheetL.id} design={null} ui={sheetUi} onChange={(next) => change(next, `${sheetL.number || 'Layout'}  paper changed · ⌘Z to undo`)} onStatus={onStatus} onActive={() => {}} overlay={layoutOverlay({
              project, sheet: sheetL, sel: cad.vpSel, ms: cad.msVp, mv,
              onSelect: cad.setVpSel,
              onMs: (id) => { cad.setMsVp(id); if (id) cad.setVpSel(id); cad.say(id ? `MSPACE  Working in the model through ${vpName(vps, id)}. A double-click outside (or PS) returns to the paper.` : 'PSPACE  On the paper.'); },
              onBox: (id, box) => setVps((l) => patchViewport(l, id, { box }), `${vpName(vps, id)} moved or resized`),
              onNew: (box) => {
                setMv(false);
                const base = vpTarget ?? vps[0], id = vpId(vps);
                const at = base ? vpToModel(base, [box[0] + box[2] / 2, box[1] + box[3] / 2]) : [0, 0] as [number, number];
                setVps((l) => [...l, { id, box, at, scale: base?.scale ?? 100 }], `${vpName([...vps, { id } as PlanViewport], id)} added at 1:${base?.scale ?? 100}`);
                cad.setVpSel(id);
              },
              canvas: (v, pxPerMm) => {
                const w = vpWindow(v), k = units.factor;
                return drawCanvas({
                  fitBox: [w.x0 / k, w.y0 / k, w.x1 / k, w.y1 / k], fixed: isLocked(v),
                  onView: (c, pxPerUnit) => {
                    const scale = Math.max(1, Math.round((1000 * pxPerMm * k) / pxPerUnit));
                    patchVp(v, { at: [+(c[0] * k).toFixed(3), +(c[1] * k).toFixed(3)], scale }, `view moved (1:${scale})`);
                  }
                });
              }
            })} /> : <p className="m">Layouts open from the app's sheets.</p>}
          </div>
        ) : view ? (
          <div className="cad-stage">
            {drawCanvas()}
            <div className="cad-coords">{cursor.at ? `X ${cursor.at[0].toFixed(2)}   Y ${cursor.at[1].toFixed(2)}   ${units.label}` : units.label}</div>
          </div>
        ) : (
          <div className="cad-stage cad-empty">
            <p className="m">Open a DWG or DXF drawing. It opens here as in a CAD program — read by the app's own engine, no CAD program needed.</p>
            <div className="cad-actions">
              <button className="chip primary" disabled={busy} onClick={openFile}>{busy ? 'Opening…' : 'Open drawing…'}</button>
              {last && window.lvds?.cadFile?.readBytes && <button className="chip" disabled={busy} onClick={() => void load(() => reopenDrawing(last), 'That drawing is no longer where it was. Open it again.')}>Reopen {last.split(/[\\/]/).pop()}</button>}
              {SAMPLE_PLANS.map((x) => <button key={x.file} className="chip" disabled={busy} onClick={() => void load(() => sampleDrawing(x.file))}>{x.label}</button>)}
            </div>
          </div>
        )}
        {cad.showLayers && (
          <aside className="cad-side">
            {sheetL && selV && <ViewportPanel project={project} sheet={sheetL} vp={selV} refs={xr.refs.map((r) => r.name)} onChange={(patch, what) => patchVp(selV, patch, what)}
              onDelete={() => { setVps((l) => l.filter((x) => x.id !== selV.id), `${vpName(vps, selV.id)} deleted${vps.length === 1 ? ' (the layout shows the level as worked out again)' : ''}`); cad.setVpSel(null); cad.setMsVp(null); }}
              onLayers={() => setShowLM(true)} />}
            <h4>Result</h4>
            <div className="cad-res">
              {many && pickedSk.length ? <DrawnSelectionPanel items={pickedSk} devices={pickedItems.length} onEdit={editSketch} /> : many ? <SelectionPanel key={[...pickedKeys].join()} project={project} items={pickedItems} circuits={circuits} level={floor ? floorLabel(project.building, floor) : undefined} onEdit={editDevices} /> : result ? <ResultView r={result.kind === 'sketch' && selSketch ? { kind: 'sketch', it: selSketch } : result} view={view!} toM={toM} toM2={toM2} project={project} onChange={onChange} onMove={() => cad.setTool('move')} onRemove={removeSelected} onCopy={() => cad.setTool('copy')} onRotate={() => cad.setTool('rotate')} onAdded={() => setResult(null)} fittings={fittings} /> : view ? (
                <>{view.file}<br /><span className="m">{view.info.format} · {units.label}{units.assumed ? ' (not set in the drawing: taken as mm)' : ''} · {fmtUpTo(view.info.segments, 0)} lines · {view.info.texts.length} texts</span><br /><span className="m">{PROMPT[tool]}</span></>
              ) : <span className="m">No drawing open.</span>}
              {view && SAMPLE_PLANS.some((x) => x.file === view.file) && (
                <div className="cad-sample">
                  Sample plan for testing{' '}
                  <select aria-label="Sample floor" value={view.file} onChange={(e) => { const file = e.target.value; showOrLoad(file, () => sampleDrawing(file)); }}>
                    {SAMPLE_PLANS.map((x) => <option key={x.file} value={x.file}>{x.label}</option>)}
                  </select>
                </div>
              )}
            </div>
            {tool === 'tray' && view && (
              <>
                <h4>Cable tray</h4>
                <div className="cad-devform">
                  <TrayFields project={project} widthMm={cad.tray.widthMm} service={cad.tray.service} route={cad.tray.route} onChange={(t) => cad.setTray({ ...cad.tray, ...t })} />
                  <span className="m">Click the run's points, Enter to finish. The route can be left for later. End a run on another tray for a tee; a run of another width in line makes a reducer.</span>
                </div>
                <Fittings fittings={fittings} title="Fittings on this plan" />
              </>
            )}
            {(tool === 'cable' || tool === 'link') && view && (
              <>
                <h4>Cable route</h4>
                <div className="cad-devform">
                  <label>Cable<select aria-label="Cable" value={cad.cableFeeder} onChange={(e) => cad.setCableFeeder(e.target.value)}>
                    <option value="">Choose a cable…</option>
                    {cables.map((f) => <option key={f.id} value={f.id}>{cableLabel(project, f)}</option>)}
                  </select></label>
                  <span className="m">{tool === 'cable' ? 'Click the route\'s points, Enter to finish.' : 'Click a line or polyline of the drawing (e.g. on a cable layer).'} Update schedules then gives the cable its length, and the tray routes it runs along.</span>
                </div>
              </>
            )}
            {tool === 'wire' && view && (
              <>
                <h4>Wiring</h4>
                <div className="cad-devform">
                  {wiring.map((w) => <span key={w.feederId} className="m">{w.tag}{w.warning ? ` — ${w.warning}` : ''}</span>)}
                  <span className="m">{wiring.length ? `${wiring.length} circuit${wiring.length === 1 ? '' : 's'} wired on this level. Update schedules sends the lengths to the cable schedule.` : 'No circuit wired on this level yet: click a device, or use Wire circuits.'}</span>
                </div>
              </>
            )}
            {tool === 'lux' && view && (
              <RoomLightingPanel project={project} room={luxOf} lit={lit} settings={luxSet} onSettings={setLuxSet} circuits={circuits} feederId={cad.feederId} onFeeder={cad.setFeederId} onPlace={placeLux} onCancel={() => { setLuxRoom(null); cad.say(`Command: ${PROMPT.lux}`); }} />
            )}
            {tool === 'arl' && view && (
              <ArrayPanel project={project} settings={arlSet} onSettings={setArlSet} palette={palette} circuits={circuits} feederId={cad.feederId} onFeeder={cad.setFeederId}
                lengthM={points.length >= 2 ? distance(points[0], points[1]) * units.factor : undefined} at={points.length >= 2 ? arlAt : []} onPlace={placeArl} onCancel={() => { setPoints([]); cad.say(`Command: ${PROMPT.arl}`); }} />
            )}
            {EDIT_TOOLS.includes(tool) && view && (
              <EditToolPanel tool={tool as EditTool} settings={edSet} onSettings={setEdSet} picked={pickedSk.length}
                step={edStep ? `${kindOf(sketch.find((x) => x.id === edStep.id) ?? sketch[0])} picked — ${tool === 'offset' ? 'click the side' : tool === 'break' ? 'click the second point, or Enter' : 'click the second line'}` : stretchBox ? 'Window set — click the base point, then the second point' : PICK_FIRST.includes(tool) && edPhase === 'points' ? 'Objects picked — now the points' : undefined}
                onApply={tool === 'join' ? applyJoin : tool === 'array' && !edSet.polar ? () => applyArray() : undefined} />
            )}
            {tool === 'none' && view && pickedSk.length > 0 && (
              <ObjectPropertiesPanel items={pickedSk} layers={drawnLayers(sketch)} onApply={(patch) => change(pickedSk.reduce((q, it) => updateSketch(q, fileOf(), withProps(it, patch)), project), `${pickedSk.length === 1 ? kindOf(pickedSk[0]) : `${pickedSk.length} objects`}: properties changed · ⌘Z to undo`)} />
            )}
            {tool === 'hatch' && view && <HatchPanel spec={hatchSet} onSpec={setHatchSet} />}
            {(tool === 'text' || tool === 'dim' || tool === 'leader' || tool === 'rtag' || tool === 'north') && view && (
              <AnnoPanel anno={anno} onAnno={(a) => onChange({ ...project, cadAnno: a }, `Annotation: ${a.textMm} mm text at 1:${a.scale}`)}
                {...({ text: { title: 'Text', cmd: 'T', help: 'Click where it goes, type it on the command line, Enter.' }, dim: { title: 'Dimension', cmd: 'DIM', help: 'Two points, then where the dimension line goes.' }, leader: { title: 'Leader', cmd: 'LE', help: 'Click the arrow point, then the text point (more points bend it); type the text and Enter.' }, rtag: { title: 'Room tag', cmd: 'RT', help: 'Click inside a room: its name and area at its centre.' }, north: { title: 'North arrow', cmd: 'NORTH', help: 'Click where it goes; it points up the plan.' } } as const)[tool]} />
            )}
            {tool === 'matchprop' && view && <><h4>Match properties <span className="m">MP</span></h4><div className="cad-devform"><span className="m">{mpFrom ? 'Click each object to give it the layer, colour, linetype and lineweight of the first; Esc stops. Trays and cable routes keep their layers.' : 'Click the object to copy from.'}</span></div></>}
            {tool === 'match' && view && <MatchPanel from={placed.find((x) => x.key === matchFrom)} settings={matchSet} onSettings={setMatchSet} />}
            {tool === 'em' && view && (
              <EmergencyPanel project={project} settings={emSet} onSettings={(s) => { if (s.mode !== emSet.mode) { setPoints([]); cad.say(EM_PROMPT[s.mode]); } setEmSet(s); }} layout={emLayout} routes={em.routes.length} openRooms={emRooms.map((r) => r.name)} circuits={circuits} feederId={cad.feederId} onFeeder={cad.setFeederId} onPlace={placeEm} onCancel={() => { setEm({ routes: [], points: [], rooms: [] }); setPoints([]); cad.say(`Command: ${PROMPT.em}`); }} />
            )}
            {(tool === 'dev' || tool === 'move' || tool === 'fill') && view && (
              <>
                <h4>Devices</h4>
                <div className="cad-pal" role="group" aria-label="Device to place">
                  {palette.map((x) => (
                    <button key={x.id} aria-pressed={cad.device === x.id} className={'elv' in x.kind ? 'elv' : 'lv'} onClick={() => { cad.setDevice(x.id); if (tool !== 'fill' || !('elv' in x.kind)) cad.setTool('dev'); }}>{x.symbol.text || '●'}<span>{x.label}</span></button>
                  ))}
                </div>
                <div className="cad-devform">
                  {floors.length > 0 && (
                    <label>This drawing shows<select aria-label="Level of this drawing" value={floor?.key} onChange={(e) => { const f = floors.find((x) => x.key === e.target.value); if (f && view) setPlanLevel(project, view.file, f, change, view.info.units); }}>{floors.map((f) => <option key={f.key} value={f.key}>{floorLabel(project.building, f)}</option>)}</select></label>
                  )}
                  {'lv' in item.kind && (
                    <label>Circuit<select aria-label="Circuit" value={cad.feederId} onChange={(e) => cad.setFeederId(e.target.value)}>
                      <option value="">Choose a circuit…</option>
                      {circuits.map((f) => <option key={f.id} value={f.id}>{circuitLabel(project, f)}</option>)}
                    </select></label>
                  )}
                  {'board' in item.kind && (
                    <label>Board<select aria-label="Board" value={cad.boardId} onChange={(e) => cad.setBoardId(e.target.value)}>
                      <option value="">Choose a board…</option>
                      {project.boards.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
                    </select></label>
                  )}
                  {!floors.length && <p className="m">Add the building and its levels in Building information first; devices are kept per level.</p>}
                  <span className="m">{placed.length} device{placed.length === 1 ? '' : 's'} on this level</span>
                  {elvItem && <span className="m">{elvItem.label}{coverageNote(elvItem.kind.elv)} · {SYSTEM_LABEL[elvSystem]}{cad.coverage && elv ? ` · ${elv.coverage.filter((c) => c.gaps.length).length} room${elv.coverage.filter((c) => c.gaps.length).length === 1 ? '' : 's'} not fully covered` : ''}</span>}
                </div>
              </>
            )}
            {plans.length > 0 && (
              <>
                <h4>Plans</h4>
                <div className="cad-layers" role="list" aria-label="Plans of this project">
                  {plans.map((x) => {
                    const here = !!view && levelSet && floor?.key === x.floor.key;
                    const inTab = !!x.file && !!cad.tabOf(x.file);
                    const canOpen = !!x.file && (inTab || SAMPLE_PLANS.some((s) => s.file === x.file) || (!!pathOfPlan(project.id, x.file) && !!window.lvds?.cadFile?.readBytes));
                    return (
                      <button key={x.floor.key} role="listitem" className={`cad-lyr${x.file ? '' : ' off'}`} aria-current={here || undefined} disabled={busy || here || (!!x.file && !canOpen)}
                        title={x.file ? (canOpen ? `Open ${x.file}` : `${x.file}: open it from Plans (its folder is not known on this computer)`) : `Open a drawing as the plan of ${x.label}`}
                        onClick={() => showOrLoad(x.file ?? '', async () => {
                          const v = !x.file ? await chooseDrawing() : SAMPLE_PLANS.some((s) => s.file === x.file) ? await sampleDrawing(x.file) : await reopenDrawing(pathOfPlan(project.id, x.file)!);
                          if (v && !x.file) setPlanLevel(project, v.file, x.floor, change, v.info.units);
                          return v;
                        }, 'That drawing is no longer where it was. Open it from Plans.')}>
                        <b>{x.label}</b>{x.file ?? 'no plan'}<span className="m">{here || inTab ? 'open' : x.file ? '' : 'open…'}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {view && cad.showRoles && (
              <>
                <h4>Layer roles</h4>
                <div>
                  <CadLayerTable layers={layerStats} roles={roles}
                    onChange={(layer: string, role: CadLayerRole) => change(withLayerMap(project, roles.map((x) => (x.layer === layer ? { ...x, role } : x))), `Layer ${layer}: ${role} · ⌘Z to undo`)}
                    onApplyMap={(m: CadLayerMap[]) => change(withLayerMap(project, m), 'Layer template applied · ⌘Z to undo')} />
                </div>
              </>
            )}
            <h4>Layers {view && <span className="cad-lyr-all"><button onClick={() => cad.allLayers(true)}>All on</button></span>}</h4>
            <div className="cad-layers">
              {view && placed.length > 0 && (
                <button className={`cad-lyr${cad.showDevices ? '' : ' off'}`} aria-pressed={cad.showDevices} onClick={() => cad.setShowDevices(!cad.showDevices)}>
                  <i style={{ background: 'var(--cad-dev)' }} />Devices placed in the app<span className="m">{cad.showDevices ? 'on' : 'off'}</span>
                </button>
              )}
              {view?.info.layers.map((l, i) => l.count > 0 || view.info.texts.some((t) => t.layer === i) ? (
                <button key={l.name} className={`cad-lyr${cad.layersOn[i] ? '' : ' off'}`} aria-pressed={!!cad.layersOn[i]} title={`${fmtUpTo(l.count, 0)} lines`} onClick={() => cad.setLayer(i, !cad.layersOn[i])}>
                  <i style={{ background: hex(l.rgb) }} />{l.name}<span className="m">{cad.layersOn[i] ? 'on' : 'off'}</span>
                </button>
              ) : null)}
              {view && <RefLayersList x={xr} />}
            </div>
          </aside>
        )}
      </div>
      {view && lv && <LayoutTabs layouts={layouts} active={sheetL?.id ?? null} onPick={(id) => { cad.setLayout(id); if (id) cad.say(`LAYOUT  ${layouts.find((x) => x.id === id)?.number ?? ''} — the paper; double-click inside a viewport to work in it, MV adds one.`); }}
        onNew={addLayout} onRename={(x) => { setRenamingLayout(x.id); cad.say(`RENAME  Type the new title of ${x.number} (now "${x.title}"):`); input.current?.focus(); }}
        onCopy={(x) => { const r = newLayout(setOf(project), lv, x.plan ?? 'lighting', x); change({ ...project, drawingSet: r.set }, `LAYOUT  ${x.number} copied · ⌘Z to undo`); cad.setLayout(r.id); }}
        onMove={(x, dir) => change({ ...project, drawingSet: renumber(moveLayout(setOf(project), x.id, dir)) }, `LAYOUT  ${x.number} moved ${dir < 0 ? 'left' : 'right'} · ⌘Z to undo`)}
        onDelete={(x) => { const set = setOf(project); change({ ...project, drawingSet: { ...set, sheets: set.sheets.filter((y) => y.id !== x.id) } }, `LAYOUT  ${x.number} ${x.title} deleted (its sheet too) · ⌘Z to undo`); if (cad.layout === x.id) cad.setLayout(null); }}
        onPageSetup={(x) => onSheet?.(x.id)} />}
      <form className="cad-cmd" onSubmit={(e) => { e.preventDefault(); run(cmd); setCmd(''); }}>
        <span className="m cad-hist">{cad.history[cad.history.length - 1] ?? 'Command: type OPEN, DI, AREA… or use the CAD ribbon'}</span>
        <span>›</span>
        <input ref={input} aria-label="Command" value={cmd} placeholder="Type a command" onChange={(e) => setCmd(e.target.value)} />
      </form>
      <div className="cad-status">
        {TOGGLES.map((x) => (
          <button key={x.k} className={`cad-tg${cad.toggles[x.k] ? ' on' : ''}`} aria-pressed={cad.toggles[x.k]}
            title={x.k === 'grid' ? `Grid: ${!cad.toggles.grid ? 'off' : cad.gridDots ? 'dots' : 'lines'} (${x.key}: lines, dots, off)` : `${x.label} (${x.key})`}
            onClick={() => (x.k === 'grid' ? cad.cycleGrid() : cad.toggle(x.k))}>{x.k === 'grid' && cad.toggles.grid && cad.gridDots ? 'GRID · DOTS' : x.label}</button>
        ))}
        <span className="sp" />
        {sheetL ? <>
          <button className={`cad-tg on`} aria-label={msV ? 'Model space in a viewport' : 'Paper space'} title={msV ? 'In the model through a viewport: click for the paper (PS)' : 'On the paper: click to work in a viewport (MS)'} onClick={() => run(msV ? 'PS' : 'MS')}>{msV ? 'MODEL' : 'PAPER'}</button>
          {vpTarget && <span>{`${vpName(vps, vpTarget.id)} · 1:${vpTarget.scale}${isLocked(vpTarget) ? ' · locked' : ''}`}</span>}
          <span>{`${sheetL.number} · ${layoutPaper(project, sheetL)?.size ?? ''} · mm`}</span>
        </> : <>
          <span>{cursor.snap ?? ''}</span>
          <span>{view ? `${view.file} · ${view.info.format} · ${units.label} · 1 : 1` : ''}</span>
        </>}
      </div>
      {showLM && view && <LayerManager viewport={sheetL && vpTarget ? { name: vpName(vps, vpTarget.id), frozen: (l) => isFrozen(vpTarget, l), toggle: (l) => patchVp(vpTarget, toggleFrozen(vpTarget, l), `${l} ${isFrozen(vpTarget, l) ? 'thawed' : 'frozen'} here`) } : undefined} view={view} layersOn={cad.layersOn} sketch={sketch} styles={styles} onLayer={cad.setLayer} onStyle={(layer, patch) => change(withLayerStyle(project, view.file, layer, patch), `Layer ${layer} changed · ⌘Z to undo`)} onClose={() => setShowLM(false)} refs={xr} />}
      {showXR && view && <RefManager file={view.file} level={floor ? floorLabel(project.building, floor) : undefined} x={xr} onAttach={() => void startAttach()} onClip={startClip} onBind={() => { setShowXR(false); void saveDxf(view.info.format === 'DWG' ? 'dwg' : 'dxf', true); }} onClose={() => setShowXR(false)} />}
      {xDraft && tool !== 'xattach' && view && (
        <AttachDialog key={`${xDraft.at[0]},${xDraft.at[1]}`} draft={xDraft} level={floor ? floorLabel(project.building, floor) : undefined} units={{ ref: unitName(refGeometry(xDraft.file)?.units), plan: unitName(view.info.units) }}
          onPick={(d) => { setXDraft(d); cad.setTool('xattach'); }} onCancel={() => { setXDraft(null); cad.say('*Cancel*'); }} onAttach={(d) => { setXDraft(null); xr.actions.confirm(d); }} />
      )}
    </section>
  );
}

/** The Result panel: a distance, an area (with Add as room…), or what the clicked object is. */
function ResultView({ r, view, toM, toM2, project, onChange, onMove, onRemove, onCopy, onRotate, onAdded, fittings }: {
  r: Result; view: CadView; toM: (v: number) => number; toM2: (v: number) => number; project: Project; onChange: (next: Project, message: string) => void;
  onMove: () => void; onRemove: () => void; onCopy: () => void; onRotate: () => void; onAdded: () => void; fittings: TrayFitting[];
}) {
  if (r.kind === 'sketch' && r.it.cable) {
    const it = r.it, cable = r.it.cable;
    const f = project.feeders.find((x) => x.id === cable.feederId);
    return (
      <>
        <div><b>Cable route</b> <span className="m">drawn here · {it.layer}</span></div>
        <dl className="cad-props">
          <dt>Cable</dt><dd>{f ? cableLabel(project, f) : `${cable.feederId} (no longer in the design)`}</dd>
          <dt>Route</dt><dd>{m(toM(pathLength(it.pts)))}</dd>
          {f?.lengthM !== undefined && <><dt>Cable length</dt><dd>{f.lengthM} m</dd></>}
        </dl>
        <div className="cad-devform">
          <label>Cable<select aria-label="Cable of this route" value={cable.feederId} onChange={(e) => {
            const g = project.feeders.find((x) => x.id === e.target.value);
            if (g) onChange(updateSketch(project, view.file, { ...it, cable: { feederId: g.id } }), `Cable route now for ${cableLabel(project, g)} · ⌘Z to undo`);
          }}>{cablesOf(project).map((x) => <option key={x.id} value={x.id}>{cableLabel(project, x)}</option>)}</select></label>
        </div>
        <div className="cad-devbtns"><button className="chip" onClick={onMove}>Move</button><button className="chip" onClick={onCopy}>Copy</button><button className="chip" onClick={onRotate}>Rotate</button><button className="chip" onClick={onRemove}>Erase</button></div>
      </>
    );
  }
  if (r.kind === 'sketch' && r.it.tray) {
    const it = r.it, tray = r.it.tray;
    return (
      <>
        <div><b>Cable tray</b> <span className="m">drawn here · {it.layer}</span></div>
        <dl className="cad-props">
          <dt>Length</dt><dd>{m(toM(trayLength(it)))}</dd>
          <dt>Carries</dt><dd>{tray.service ?? 'not set'}</dd>
          <dt>Route</dt><dd>{tray.route ?? 'not assigned'}</dd>
        </dl>
        <div className="cad-devform">
          <TrayFields project={project} widthMm={tray.widthMm} service={tray.service ?? ''} route={tray.route ?? ''} onChange={(t) => {
            const next = { ...tray, ...t };
            const { route, service, ...rest } = next;
            onChange(updateSketch(project, view.file, { ...it, tray: { ...rest, ...(service ? { service } : {}), ...(route ? { route } : {}) } }), `Cable tray ${next.widthMm} mm${service ? ` ${service.toLowerCase()}` : ''}${route ? ` on route ${route}` : ', no route'} · ⌘Z to undo`);
          }} />
        </div>
        <Fittings fittings={fittings.filter((f) => f.runs.includes(it.id))} title="Fittings on this run" />
        <div className="cad-devbtns"><button className="chip" onClick={onMove}>Move</button><button className="chip" onClick={onCopy}>Copy</button><button className="chip" onClick={onRotate}>Rotate</button><button className="chip" onClick={onRemove}>Erase</button></div>
      </>
    );
  }
  if (r.kind === 'sketch') {
    const it = r.it;
    const len = segmentsOf(it).reduce((t, [a, b]) => t + distance(a, b), 0);
    const name = { line: 'Line', pline: it.closed ? 'Closed polyline' : 'Polyline', circle: 'Circle', arc: 'Arc', text: 'Text', dim: 'Dimension' }[it.kind];
    return (
      <>
        <div><b>{name}</b> <span className="m">drawn here · {it.layer}</span></div>
        <dl className="cad-props">
          {it.kind === 'text' && <><dt>Text</dt><dd>{it.text}</dd></>}
          {it.kind === 'dim' && <><dt>Measures</dt><dd>{m(toM(dimensionLines(it.pts[0], it.pts[1], it.pts[2]).length))}</dd></>}
          {it.r !== undefined && <><dt>Radius</dt><dd>{m(toM(it.r))}</dd></>}
          {it.kind !== 'text' && it.kind !== 'dim' && <><dt>{it.closed || it.kind === 'circle' ? 'Perimeter' : 'Length'}</dt><dd>{m(toM(len))}</dd></>}
          {it.closed && <><dt>Area</dt><dd>{m2(toM2(areaOf(it.pts).area))}</dd></>}
        </dl>
        <div className="cad-devbtns"><button className="chip" onClick={onMove}>Move</button><button className="chip" onClick={onCopy}>Copy</button><button className="chip" onClick={onRotate}>Rotate</button><button className="chip" onClick={onRemove}>Erase</button></div>
      </>
    );
  }
  if (r.kind === 'device') {
    const it = r.it;
    return (
      <>
        <div><b>{it.label}</b> <span className="m">{it.what === 'lv' ? 'LV point' : it.what === 'elv' ? 'ELV device' : 'Board'}</span></div>
        <dl className="cad-props">
          {it.detail && <><dt>{it.what === 'lv' ? 'Circuit' : it.what === 'elv' ? 'System' : 'Name'}</dt><dd>{it.detail}</dd></>}
          <dt>Room</dt><dd>{it.room ?? '—'}</dd>
          <dt>Position</dt><dd>{it.x.toFixed(2)}, {it.y.toFixed(2)} m</dd>
        </dl>
        <div className="cad-devbtns"><button className="chip" onClick={onMove}>Move</button><button className="chip" onClick={onCopy}>Copy</button><button className="chip" onClick={onRemove}>Delete</button></div>
      </>
    );
  }
  if (r.kind === 'dist') {
    const d = distance(r.a, r.b);
    return <><div>Distance <b className="cad-big">{m(toM(d))}</b></div><div className="m">ΔX {m(toM(r.b[0] - r.a[0]))} · ΔY {m(toM(r.b[1] - r.a[1]))} · angle {angleDeg(r.a, r.b).toFixed(2)}°</div></>;
  }
  if (r.kind === 'area') {
    const { area, perimeter } = areaOf(r.points);
    return (
      <>
        <div>{r.how === 'room' || r.how === 'trace' ? 'Room area' : 'Area'} <b className="cad-big">{m2(toM2(area))}</b></div>
        <div className="m">Perimeter {m(toM(perimeter))}{r.how === 'object' ? ' · of the object picked' : ''}</div>
        <AddRoom key={`${area}:${r.name ?? ''}`} project={project} areaM2={toM2(area)} name={r.name ?? ''} file={view.file} level={planLevel(project, view.file).floor?.key} onChange={onChange}
          outline={r.points.map(([x, y]): Pt => [Math.round(toM(x) * 1000) / 1000, Math.round(toM(y) * 1000) / 1000])} startOpen={r.how === 'trace' || r.how === 'room'} onAdded={onAdded} />
      </>
    );
  }
  const o = r.o;
  const layer = view.info.layers[o.layer];
  return (
    <>
      <div><b>{o.kind}{o.block ? ` · ${o.block}` : ''}</b></div>
      <dl className="cad-props">
        <dt>Layer</dt><dd><i style={{ background: hex(layer?.rgb ?? 0) }} />{layer?.name ?? '—'}</dd>
        <dt>Handle</dt><dd>{o.handle}</dd>
        {o.text !== undefined && <><dt>Text</dt><dd>{o.text}</dd></>}
        {o.radius !== undefined && <><dt>Radius</dt><dd>{m(toM(o.radius))}</dd></>}
        {o.length !== undefined && <><dt>{o.closed ? 'Perimeter' : 'Length'}</dt><dd>{m(toM(o.length))}</dd></>}
        {o.area !== undefined && <><dt>Area</dt><dd>{m2(toM2(o.area))}</dd></>}
        {o.vertices !== undefined && <><dt>Vertices</dt><dd>{o.vertices}{o.closed ? ' · closed' : ''}</dd></>}
        {Object.entries(o.attrs ?? {}).map(([k, v]) => <><dt key={`k${k}`}>{k}</dt><dd key={`v${k}`}>{v || '—'}</dd></>)}
      </dl>
    </>
  );
}

/** Tray fittings counted by kind and size ("2 × Bend 90° 300"). */
function Fittings({ fittings, title }: { fittings: TrayFitting[]; title: string }) {
  if (!fittings.length) return null;
  return (
    <dl className="cad-props" aria-label={title}>
      <dt>{title}</dt><dd>{fittingCounts(fittings).map(([label, n]) => `${n} × ${label}`).join(', ')}</dd>
    </dl>
  );
}

/** Width, service and tray route of a cable tray run: the route is optional (Not assigned), chosen from the project's
 * tray routes. */
function TrayFields({ project, widthMm, service, route, onChange }: { project: Project; widthMm: number; service: string; route: string; onChange: (t: { widthMm?: number; service?: string; route?: string }) => void }) {
  const routes = trayPlanOf(project).routes;
  return (
    <>
      <label>Width<select aria-label="Tray width" value={widthMm} onChange={(e) => onChange({ widthMm: Number(e.target.value) })}>
        {TRAY_WIDTHS.map((w) => <option key={w} value={w}>{w} mm</option>)}
      </select></label>
      <label>Carries<select aria-label="Tray service" value={service} onChange={(e) => onChange({ service: e.target.value })}>
        {!service && <option value="">Not set</option>}
        {TRAY_SERVICES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select></label>
      <label>Route<select aria-label="Tray route" value={route} onChange={(e) => onChange({ route: e.target.value })}>
        <option value="">Not assigned</option>
        {routes.map((r) => <option key={r.id} value={r.name}>{r.name}{r.from || r.to ? ` · ${r.from ?? ''} → ${r.to ?? ''}` : ''}</option>)}
        {route && !routes.some((r) => r.name === route) && <option value={route}>{route}</option>}
      </select></label>
    </>
  );
}

/** Sends a measured area to Building information as a room on a level. */
function AddRoom({ project, areaM2, name: initial, file, level, outline, startOpen, onChange, onAdded }: {
  project: Project; areaM2: number; name: string; file: string; level?: string; outline: Pt[]; startOpen?: boolean; onChange: (next: Project, message: string) => void; onAdded: () => void;
}) {
  const floors = floorList(project.building).filter((f) => !f.ref.index);
  const [open, setOpen] = useState(!!startOpen);
  const [name, setName] = useState(initial);
  const [levelKey, setLevelKey] = useState(level ?? floors[0]?.key ?? '');
  const floor = floors.find((f) => f.key === levelKey);
  if (!open) return <button className="chip cad-addroom" onClick={() => setOpen(true)}>Add as room…</button>;
  if (!floors.length) return <p className="m">Add the building and its levels in Building information first; rooms are kept per level.</p>;
  return (
    <div className="cad-roomform">
      <label>Name<input value={name} placeholder="e.g. Majlis" onChange={(e) => setName(e.target.value)} /></label>
      <label>Level<select value={levelKey} onChange={(e) => setLevelKey(e.target.value)}>{floors.map((f) => <option key={f.key} value={f.key}>{floorLabel(project.building, f)}</option>)}</select></label>
      <button className="chip primary" disabled={!floor} onClick={() => {
        const room = pickedRoom(project, name.trim(), areaM2, file, floor!.ref, outline);
        const { project: next } = putRooms(project, [room], floor!.ref, []);
        onChange(next, `${room.name} · ${m2(room.areaM2)} added to ${floorLabel(project.building, floor!)} · ⌘Z to undo`);
        setOpen(false); onAdded();
      }}>Add</button>
    </div>
  );
}
