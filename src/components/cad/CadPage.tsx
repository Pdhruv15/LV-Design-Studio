import { useEffect, useMemo, useRef, useState } from 'react';
import CadCanvas, { type CadMarks, type CadToggles, type CanvasDevice, type CanvasWiring } from './CadCanvas';
import { NO_ACTIONS, rememberedDrawing, SAMPLE_PLANS, type CadState, type CadTool } from './cadState';
import { cadCommand, type CadAction } from './cadCommands';
import CadCommandLine, { CadPromptMenu } from './CadCommandLine';
import { isNumber, promptOptions, shortPrompt, spaceEnters, type SpaceMode } from './cadPrompt';
import CadDynInput, { type DynBox } from './CadDynInput';
import { DIALOG_TOOLS, DimStyleDialog, EditDialog, TextStyleDialog } from './CadDialogs';
import { currentTextStyle, dimLookOf, dimStandardAsBefore, dimStylesOf, dimStylesToStore, textStylesOf, textStylesToStore } from '../../model/cadStyles';
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
import { fmtFixed, fmtUpTo } from '../../util/format';
import DeviceToolbar from './DeviceToolbar';
import { AnnoPanel, HatchPanel } from './AnnotatePanel';
import { annoOf, centreOf, hatchItem, hatchOutline, HATCH_START, leaderItems, northArrowItems, roomTagItems, textUnits, type HatchSpec } from '../../model/cadAnnotate';
import { LayerPalette, layerRows, ObjectPropertiesPanel, type LayerRow } from './CadLayerManager';
import { AttachDialog, RefLayersList, RefManager, useCadRefs } from './CadRefs';
import { refGeometry, type CadRef } from '../../model/cadRefs';
import { drawnLayers, effective, layerStylesOf, matchedProps, styleOf, withProps } from '../../model/cadLayerStyle';
import { applyLayerPatch, archOnOf, currentLayerOf, extentsOf, isolate, layerFileOf, newLayerName, renameLayer, restoreState, unisolate, withCurrentLayer, withNewLayer, withoutLayer, withoutState, withSavedState } from '../../model/cadLayerState';
import { DrawnSelectionPanel, ED_START, EditToolPanel, kindOf, SketchToolbar, type EditSettings, type EditTool, type SketchEdit } from './SketchEditPanel';
import { arrayPolar, arrayRect, breakAt, chamfer, edgesFor, explode, extend, fillet, gripMoved, gripsOf, isPath, join, mirrored, offset, scaled, sketchInWindow, stretched, throughDistance, trim, type Edit } from '../../model/cadEdit';
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
  { k: 'snap', label: 'SNAP', key: 'F9' }, { k: 'osnap', label: 'OSNAP', key: 'F3' }, { k: 'ortho', label: 'ORTHO', key: 'F8' }, { k: 'grid', label: 'GRID', key: 'F7' }, { k: 'dyn', label: 'DYN', key: 'F12' }
];
/** Tools whose next point has a length and angle from the last one: the boxes of dynamic input. */
const POINT_TOOLS: CadTool[] = ['line', 'pline', 'tray', 'cable', 'dim', 'move', 'copy', 'dist', 'area', 'trace', 'leader'];
const HELP = 'Commands: OPEN · CLOSE · CLOSEALL · SAVE (DXF) · SAVEDWG · ROOMS (add found rooms) · RA (click inside a room) · TR (trace a room) · PN (pick its name) · CT (cable tray run) · CR (cable route) · LR (link a line as a cable route) · SCHED (update schedules) · WC (wire circuits) · W1 (wire one) · TAGS · FILL (fill a room with an ELV device) · LUX (light a room by the lumen method) · EM (emergency lighting) · SEL (select devices: Shift-click, or a window) · ARL (array on line) · MA (match) · ALIGN / ALIGNV / SPACE (the devices selected) · TRIM (TM) · EX (extend) · O (offset) · F (fillet) · CHA (chamfer) · BR (break) · J (join) · X (explode) · MI (mirror) · SC (scale) · S (stretch) · AR (array) · MP (match properties) · H (hatch) · LE (leader) · RT (room tag) · NORTH · LM (layer palette) · CLAYER (current layer) · LAYISO / LAYUNISO · COV (coverage) · L (line) · PL (polyline, C closes) · REC · C (circle) · A (arc, 3 points) · T (text) · DIM · ST (text style) · D (dimension style) · M (move) · CO (copy) · RO (rotate) · E (erase) · DI (distance) · AREA (O = object) · RA (room area) · DEV (add device) · M (move) · E (delete) · LI (inspect) · FIT (ZE) · LA (layers panel) · OSNAP (F3) · GRID (F7) · ORTHO (F8) · SNAP (F9) · DYN (F12) · F2 history · Esc cancels, Enter or Space ends a step or repeats the last command.';
/** Device symbol size on the plan (radius, metres). */
const DEVICE_R_M = 0.2;
/** Bind's count in the Save line: reference lines, texts and hatches. */
const boundText = (shapes: { kind: string }[]) => {
  const n = (k: string) => shapes.filter((x) => x.kind === k).length, en = (v: number) => v.toLocaleString('en-GB');
  const [l, t, h] = [n('line'), n('text'), n('hatch')];
  return [`${en(l)} reference line${l === 1 ? '' : 's'}`, t ? `${en(t)} text${t === 1 ? '' : 's'}` : '', h ? `${en(h)} hatch${h === 1 ? '' : 'es'}` : ''].filter(Boolean).join(', ');
};
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
  mirror: 'MIRROR  Select objects (click them), then Enter:',
  scale: 'SCALE  Select objects (click them), then Enter:',
  stretch: 'STRETCH  Drag a window (right to left) round the points to move:',
  trim: 'TRIM  Click the part to cut away (Shift-click extends):',
  extend: 'EXTEND  Click near the end to lengthen (Shift-click trims):',
  offset: 'OFFSET  Select object to offset or [Exit]:',
  fillet: 'FILLET  Select first object or [Radius/Trim]:',
  chamfer: 'CHAMFER  Select first line or [Distance/Trim]:',
  break: 'BREAK  Select the object where it breaks:',
  join: 'JOIN  Select the lines and polylines to join, then Enter:',
  explode: 'EXPLODE  Select a polyline or rectangle:',
  array: 'ARRAY  Select objects (click them), then Enter:',
  line: 'LINE  Specify first point:',
  pline: 'PLINE  Specify start point:',
  rect: 'RECTANG  Specify first corner point:',
  circle: 'CIRCLE  Specify center point:',
  arc: 'ARC  Specify start point:',
  text: 'TEXT  Specify start point of text:',
  dim: 'DIM  Specify first extension line origin:',
  xattach: 'XATTACH  Specify insertion point:',
  xclip: 'XCLIP  Click the corners of the clip outline, Enter to finish (two corners: a rectangle), or [Object] to pick a closed outline:'
};
const f2 = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s).toFixed(2) : s);
/** The first prompt of a tool, with the edit tools' options and their values now (Enter takes the one in < >). */
function editPrompt(tool: CadTool, s: EditSettings): string {
  if (tool === 'offset') return `OFFSET  Specify offset distance or [Through/Erase/Layer] <${s.through ? 'Through' : f2(s.offset)}>:`;
  if (tool === 'fillet') return `FILLET  Select first object or [Radius/Trim] <R ${f2(s.radius)}${s.trim ? '' : ', No trim'}>:`;
  if (tool === 'chamfer') return `CHAMFER  Select first line or [Distance/Trim] <${f2(s.d1)}, ${f2(s.d2)}${s.trim ? '' : ', No trim'}>:`;
  return PROMPT[tool];
}
const OFFSET_SIDE = 'OFFSET  Specify point on side to offset:';
const arrayType = (s: EditSettings) => `ARRAY  Enter array type [Rectangular/Polar] <${s.polar ? 'Polar' : 'Rectangular'}>:`;
const mirrorAsk = (s: EditSettings) => `MIRROR  Erase source objects? [Yes/No] <${s.keep ? 'No' : 'Yes'}>:`;
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
  // The command line: the question an edit tool asks (a distance, a radius, Yes / No…), the height and rotation TEXT
  // asks after its point, the commands typed before (Up / Down), the recent commands (Enter with no tool repeats the
  // first), the taller history (F2) or the command list (F1), and the right-click menu of the prompt.
  const [edAsk, setEdAsk] = useState<'offset' | 'radius' | 'd1' | 'd2' | 'erase' | 'factor' | 'type' | null>(null);
  const [textAsk, setTextAsk] = useState<{ step: 'height' | 'rot' | null; mm: number; rot: number } | null>(null);
  const [typed, setTyped] = useState<string[]>([]);
  const [recent, setRecent] = useState<{ label: string; tool?: CadTool; text?: string }[]>([]);
  const [log, setLog] = useState<'history' | 'help' | null>(null);
  // Dynamic input at the cursor: what is typed in its boxes, and its options list open (with the one picked).
  const [dynVals, setDynVals] = useState<string[]>([]);
  const [dynMenu, setDynMenu] = useState<number | null>(null);
  const dynRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  // The settings dialog shown: the edit tool's, or the text or dimension styles.
  const [dlg, setDlg] = useState<'edit' | 'style' | 'dimstyle' | null>(null);
  const [promptMenu, setPromptMenu] = useState<{ at: Pt; items: { label: string; key?: string; run: () => void }[] } | null>(null);
  // Layer palette shown, and the object Match properties copies from.
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
    const pre = preset.current;
    setPoints([]); setObjectMode(false); setLuxRoom(null); setMenuAt(null); if (tool !== 'match') setMatchFrom(null); cad.setTextAt(null);
    setEdStep(pre); preset.current = null; setStretchBox(null); setMpFrom(null);
    const first = picked.some((k) => k.startsWith('sk:')) || !!cad.selected?.startsWith('sk:');
    setEdPhase(first ? 'points' : 'pick');
    setEdAsk(tool === 'offset' && !pre ? 'offset' : tool === 'array' && first ? 'type' : null); setTextAsk(null); setPromptMenu(null);
    setDlg((d) => (DIALOG_TOOLS.includes(tool as EditTool) ? 'edit' : d === 'edit' ? null : d));
    if (tool !== 'none' && tool !== 'xattach' && tool !== 'xclip') { const label = PROMPT[tool].split(' ')[0]; setRecent((r) => [{ label, tool }, ...r.filter((x) => x.label !== label)].slice(0, 8)); }
    cad.say(`Command: ${PICK_FIRST.includes(tool) && first ? (tool === 'array' ? arrayType(edSet) : `${tool.toUpperCase()}  ${tool === 'mirror' ? 'Specify first point of the mirror line:' : tool === 'scale' ? 'Specify base point:' : 'Enter to join them:'}`) : pre && tool === 'offset' ? OFFSET_SIDE : editPrompt(tool, edSet)}`);
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Layer palette styles. The architect's layers: On as turned on or off in the app (kept in the project, so each change is
  // one undo step), else as the drawing has them; shown: on and not frozen; picked: shown and not locked (snapped to still).
  const styles = useMemo(() => layerStylesOf(project, view?.file), [project, view]);
  const archStyle = useMemo(() => (view ? view.info.layers.map((l) => styleOf(styles, l.name)) : []), [view, styles]);
  const archOn = useMemo(() => (view ? archOnOf(project, view.file, view.info.layers) : new Uint8Array()), [view, project]);
  const layersOn = useMemo(() => (archStyle.some((st) => st.freeze) ? archOn.map((v, i) => (v && !archStyle[i]?.freeze ? 1 : 0)) : archOn), [archOn, archStyle]);
  const pickOn = useMemo(() => (archStyle.some((st) => st.lock) ? layersOn.map((v, i) => (v && !archStyle[i]?.lock ? 1 : 0)) : layersOn), [layersOn, archStyle]);
  // Zoom extents leave the frozen layers out.
  const fitExtents = useMemo(() => (view && archStyle.some((st) => st.freeze) ? extentsOf(view.segs, view.segLayers, view.info.origin, (i) => !archStyle[i]?.freeze) : undefined), [view, archStyle]);
  // Layer roles (File → Layer roles): the project's, else a guess from the layer's name and what it holds.
  const layerStats = useMemo(() => (view ? layerStatsOf(view) : []), [view]);
  const roles = useMemo(() => layerMapFor(project, layerStats), [project, layerStats]);
  // Walls for Room area: shown layers whose role is Wall, else every shown layer.
  const walls = useMemo(() => {
    if (!view) return [];
    const wallNames = layersWith(roles, 'wall');
    const shown = view.info.layers.map((_, i) => i).filter((i) => layersOn[i]);
    const named = shown.filter((i) => wallNames.has(view.info.layers[i].name.toLowerCase()));
    return segmentsOn(view.segs, view.segLayers, view.info.origin, new Set(named.length ? named : shown));
  }, [view, layersOn, roles]);

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
  // Snaps come from what shows: objects on layers that are off or frozen are not snapped to (locked ones are).
  const sketchSnaps = useMemo(() => snapPoints(sketch.filter((it) => !effective(it, styles).hidden)), [sketch, styles]);
  // Objects on locked, hidden or frozen layers cannot be picked.
  const pickable = useMemo(() => sketch.filter((it) => { const e = effective(it, styles); return !e.lock && !e.hidden; }), [sketch, styles]);
  const selSketch = sketch.find((it) => `sk:${it.id}` === cad.selected) ?? null;
  // The drawn objects picked: several, else the one selected; and everything picked.
  const pickedSk = useMemo(() => (picked.length ? sketch.filter((it) => picked.includes(`sk:${it.id}`)) : selSketch ? [selSketch] : []), [picked, sketch, selSketch]);
  const pickedKeys = new Set([...pickedItems.map((d) => d.key), ...pickedSk.map((it) => `sk:${it.id}`)]);
  const many = pickedItems.length + pickedSk.length > 1;
  // The architect's lines on shown layers: cutting edges and boundaries for Trim and Extend.
  const drawingSegs = useMemo(() => (view && (tool === 'trim' || tool === 'extend') ? segmentsOn(view.segs, view.segLayers, view.info.origin, new Set(view.info.layers.map((_, i) => i).filter((i) => layersOn[i]))) : []), [view, layersOn, tool]);
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

  // Layer palette (LM): the drawing's layer record (current layer, layers added, states), its rows, and the changes made
  // there — each one undo step; the architect's On stays with the drawing open.
  const layerFile = layerFileOf(project, view?.file);
  const curLayer = currentLayerOf(project, view?.file);
  const lRows = useMemo(() => (view ? layerRows({ view, layersOn: archOn, sketch, styles, added: layerFile.layers, current: curLayer, refs: xr.placed }) : []), [view, archOn, sketch, styles, layerFile.layers, curLayer, xr.placed]);
  const layerChange = (next: Project, what: string) => {
    if (!view) return;
    if (next !== project) change(next, `${what} · ⌘Z to undo`); else cad.say(what);
  };
  const layerNames = (list: { name: string }[]) => (list.length === 1 ? `Layer ${list[0].name}` : `${list.length} layers`);
  const isolateLayers = (keep: string[]) => {
    if (!view) return;
    const r = isolate(project, view.file, lRows, keep);
    layerChange(r.project, `LAYISO  ${keep.join(', ')} kept on, ${r.off} other layer${r.off === 1 ? '' : 's'} off (LAYUNISO puts them back)`);
  };
  const unisolateLayers = () => {
    const r = view && unisolate(project, view.file, lRows);
    if (!r) cad.say('LAYUNISO  Nothing is isolated.'); else layerChange(r, 'LAYUNISO  The layers Isolate turned off are back on');
  };
  // A frozen layer cannot be current (what is drawn on it would not show): every way of setting it comes here.
  const setCurrentLayer = (name: string) => {
    if (!view) return;
    if (styleOf(styles, name).freeze) { cad.say(`CLAYER  ${name} is frozen: thaw it first to make it current.`); return; }
    change(withCurrentLayer(project, view.file, name), `CLAYER  Current layer: ${name} · ⌘Z to undo`);
  };
  const addLayer = () => {
    const name = newLayerName(lRows.map((r) => r.name));
    if (view) change(withNewLayer(project, view.file, name), `LAYER  ${name} added · ⌘Z to undo`);
    return name;
  };

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
      if (msg) { cad.say(`SAVE  ${msg} (${placed.length} device${placed.length === 1 ? '' : 's'} on E-LV-POINTS / E-ELV-DEVICES / E-BOARDS, ${sketch.length} drawn object${sketch.length === 1 ? '' : 's'} on ${DRAW_LAYER} / ${ANNO_LAYER}${refLines.length ? `, ${boundText(refLines)} bound on NAME$0$LAYER layers` : ''}${wiring.length ? `, ${wiring.length} circuit${wiring.length === 1 ? '' : 's'} wired on ${WIRING_LAYER} / ${TAG_LAYER}` : ''})`); onStatus(msg); }
    } catch (e) { const msg = e instanceof Error ? e.message : String(e); cad.say(msg); onStatus(msg); }
  }
  cad.actions.current = { save: () => void saveDxf(), saveDwg: () => void saveDxf('dwg'), close: () => { if (view) closeDrawings([view]); }, remove: removeSelected, addFound: () => addFound(), schedules: () => schedules(), copyTo: (k) => copyLevel(k), wireAll: () => wireAll(), layerManager: () => { if (view) setShowLM((v) => !v); else cad.say('LAYER  Open a drawing first.'); }, refs: () => { if (view) setShowXR(true); else cad.say('XREF  Open a drawing first.'); }, layoutCmd: (c) => { if (!layoutCmd(c)) cad.say(`${c}  Open a layout tab first.`); } };
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
  /** Right click: with a tool running, Enter (with a short menu when the prompt has options); with none, the menu of
   * edits for the device or drawn object under it (or what is picked), else Repeat and the recent commands. */
  function contextAt(at: Pt, pixel: number, screen: Pt) {
    setPromptMenu(null);
    if (tool !== 'none') {
      const opts = promptOptions(cad.history[cad.history.length - 1] ?? '');
      if (!opts.length) { run(''); return; }
      setPromptMenu({ at: screen, items: [{ label: 'Enter', run: () => run('') }, ...opts.map((o) => ({ label: o.option, key: o.key, run: () => run(o.key) })), { label: 'Cancel', run: cancel }] });
      return;
    }
    const d = deviceAt(at, pixel), sk = d ? undefined : itemAt(pickable, at, 6 * pixel);
    if (d && !pickedKeys.has(d.key)) pick([d]);
    else if (sk && !pickedKeys.has(`sk:${sk.id}`)) pick([], [sk]);
    if (!d && !sk && !pickedItems.length && !pickedSk.length) {
      if (recent.length) setPromptMenu({ at: screen, items: recent.slice(0, 6).map((x, i) => ({ label: i ? x.label : `Repeat ${x.label}`, run: () => repeat(x) })) });
      return;
    }
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
  function applyArray(centre?: Pt, polar = edSet.polar) {
    const f = units.factor, n = (s: string, d: number) => (Number.isFinite(Number(s)) && s.trim() !== '' ? Number(s) : d);
    const copies = pickedSk.flatMap((it) => (polar ? arrayPolar(it, centre!, n(edSet.n, 6), n(edSet.angle, 360), edSet.rotate) : arrayRect(it, n(edSet.rows, 2), n(edSet.cols, 3), n(edSet.dx, 1) / f, n(edSet.dy, 1) / f)));
    if (!copies.length) { cad.say('ARRAY  Nothing to copy: more rows, columns or items.'); return; }
    change(added(project, copies), `ARRAY  ${copies.length} cop${copies.length === 1 ? 'y' : 'ies'} made · ⌘Z to undo`);
    pick([], []); cad.setTool('none');
  }
  /** Mirror: the drawn objects picked about the line from `a` to `b`, the originals erased or kept. */
  function applyMirror(a: Pt, b: Pt, erase: boolean) {
    const flipped = pickedSk.map((it) => mirrored(it, a, b));
    let next = project;
    pickedSk.forEach((it, i) => { next = erase ? updateSketch(next, fileOf(), { ...flipped[i], id: it.id } as SketchItem) : addSketch(next, fileOf(), flipped[i]).project; });
    change(next, `MIRROR  ${picks(pickedSk.length).replace(' selected', '')} mirrored${erase ? '' : ', originals kept'} · ⌘Z to undo`);
    setEdSet({ ...edSet, keep: !erase }); setEdAsk(null);
    setPoints([]); pick([], []); cad.setTool('none');
  }
  /** Scale: the drawn objects picked by a factor about the base point. */
  function applyScale(base: Pt, factor: string) {
    const k = Number(factor);
    if (!(k > 0)) { cad.say(`SCALE  The factor must be above 0. Specify scale factor <${edSet.factor}>:`); return; }
    change(pickedSk.reduce((q, it) => updateSketch(q, fileOf(), scaled(it, base, k)), project), `SCALE  ${picks(pickedSk.length).replace(' selected', '')} scaled × ${k} · ⌘Z to undo`);
    setEdSet({ ...edSet, factor }); setEdAsk(null);
    setPoints([]); pick([], []); cad.setTool('none');
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
        setEdStep({ id: sk.id, at }); setEdAsk(null);
        cad.say(tool === 'offset' ? (edSet.through ? 'OFFSET  Specify through point:' : OFFSET_SIDE) : tool === 'break' ? 'BREAK  Specify second break point <split here>:' : `${cmd}  Select second object:`);
        return;
      }
      const first = sketch.find((x) => x.id === edStep.id);
      setEdStep(null);
      if (!first) return;
      if (tool === 'offset') {
        const d = edSet.through ? throughDistance(first, at) : num(edSet.offset) / f;
        const r = offset(first, d, at);
        // On the current layer (where new drawing goes) unless a tray, which stays on its own. With Erase the source
        // itself moves: a cable route stays the route of its circuit, on its layer.
        const items = r.items?.map((x, i) => (edSet.erase && i === 0 && first.cable ? { ...x, cable: first.cable, layer: first.layer }
          : edSet.layer === 'current' && !x.tray ? { ...x, layer: DRAW_LAYER } : x));
        if (!failed(r, 'OFFSET')) change(edSet.erase ? replaced(project, first, items!) : added(project, items!), `OFFSET  ${first.tray ? `Cable tray ${first.tray.widthMm} mm` : kindOf(first)} ${edSet.erase ? 'moved' : 'copied'} ${m(toM(d))} to the side${edSet.through ? ' (through the point)' : ''} · ⌘Z to undo`);
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
      // No trim: the lines stay as they are, only the arc (or the chamfer line) is added.
      if (!edSet.trim && !extra.length) { cad.say(`${cmd}  Nothing to add with no trim at 0: set the ${tool === 'fillet' ? 'radius' : 'distances'} first.`); return; }
      change(edSet.trim ? added(replaced(replaced(project, first, [a]), sk, [b]), extra) : added(project, extra), `${cmd}  ${tool === 'fillet' ? (extra.length ? `radius ${m(num(edSet.radius))}` : 'sharp corner') : `${m(num(edSet.d1))} × ${m(num(edSet.d2))}`}${edSet.trim ? '' : ', lines not trimmed'}${r.note ? ` — ${r.note}` : ''} · ⌘Z to undo`);
      return;
    }
    if (tool === 'mirror') {
      if (!points.length) { setPoints([at]); cad.say('MIRROR  Specify second point of the mirror line:'); return; }
      // Then: erase the originals? A click takes the answer in < >, as Enter does.
      if (edAsk === 'erase') { applyMirror(points[0], points[1], !edSet.keep); return; }
      setPoints([points[0], at]); setEdAsk('erase'); cad.say(mirrorAsk(edSet)); return;
    }
    if (tool === 'scale') {
      if (edAsk === 'factor' && points.length) { applyScale(points[0], edSet.factor); return; }
      setPoints([at]); setEdAsk('factor'); cad.say(`SCALE  Specify scale factor <${edSet.factor}>:`); return;
    }
    if (tool === 'array') {
      if (edAsk === 'type') { cad.say(arrayType(edSet)); return; }
      if (edSet.polar) applyArray(at, true); else { setEdAsk('type'); cad.say(arrayType(edSet)); }
      return;
    }
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
    const texts = (view?.info.texts ?? []).filter((t) => layersOn[t.layer] && inside([t.x, t.y], poly));
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
    setPromptMenu(null);
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
      if (last) draw({ kind: 'line', layer: curLayer, pts: [last, at] }, `Line ${m(toM(distance(last, at)))}`);
      setPoints([at]); cad.say('LINE  Specify next point or Enter to stop:'); return;
    }
    if (tool === 'tray' || tool === 'cable') { setPoints((p) => [...p, at]); cad.say(`${tool === 'tray' ? 'TRAY' : 'ROUTE'}  Specify next point${points.length ? ', Enter to finish' : ''}:`); return; }
    if (tool === 'link') {
      const feeder = project.feeders.find((f) => f.id === cad.cableFeeder);
      if (!feeder) { cad.say('LINK  Choose the cable first (the panel on the right).'); return; }
      const o = await view.pick(at[0], at[1], 6 * pixel, pickOn);
      const pts = o ? objectPath(view, o) : [];
      if (pts.length < 2) { cad.say('LINK  That is not a line or polyline. Click a line of the drawing:'); return; }
      draw({ kind: 'pline', layer: CABLE_LAYER, pts, cable: { feederId: feeder.id } }, `Cable route of ${cableLabel(project, feeder)}: ${m(toM(pathLength(pts)))} (linked from ${view.info.layers[o!.layer]?.name ?? 'the drawing'})`);
      return;
    }
    if (tool === 'pline') {
      if (points.length >= 3 && distance(at, points[0]) <= 8 * pixel) { finishPline(true); return; }
      setPoints((p) => [...p, at]); cad.say('PLINE  Specify next point or [Close], Enter to finish:'); return;
    }
    if (tool === 'rect') {
      if (!last) { setPoints([at]); cad.say('RECTANG  Specify other corner point:'); return; }
      const pts = rectangle(last, at);
      draw({ kind: 'pline', layer: curLayer, pts, closed: true }, `Rectangle ${m(toM(Math.abs(at[0] - last[0])))} × ${m(toM(Math.abs(at[1] - last[1])))}`);
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
      else { draw({ ...a, layer: curLayer } as Omit<SketchItem, 'id'>, `Arc radius ${m(toM(a.r ?? 0))}`); setPoints([]); cad.say(PROMPT.arc); }
      return;
    }
    if (tool === 'text') {
      // The current text style's height, else (0) asked each time from the annotation text height.
      const style = currentTextStyle(project);
      cad.setTextAt(at);
      if (style.heightMm > 0) { setTextAsk({ step: 'rot', mm: style.heightMm, rot: 0 }); cad.say('TEXT  Specify rotation angle <0>:'); }
      else { setTextAsk({ step: 'height', mm: anno.textMm, rot: 0 }); cad.say(`TEXT  Specify height <${anno.textMm} mm>:`); }
      input.current?.focus(); return;
    }
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
      const ds = dimLookOf(project, units.factor);
      // A dimension of a style keeps no text: it is measured (in the style's unit) wherever it is drawn or saved.
      draw({ kind: 'dim', layer: ANNO_LAYER, pts: [points[0], points[1], at], ...(ds ? { h: ds.textH, look: ds.look } : { text: toM(len).toFixed(2), h: textH * 0.8 }) }, `Dimension ${m(toM(len))}`);
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
      const o = await view.pick(at[0], at[1], 6 * pixel, pickOn);
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
        const o = await view.pick(at[0], at[1], 6 * pixel, pickOn, true);
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
      const o = await view.pick(at[0], at[1], 6 * pixel, pickOn);
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
    const { rooms, zones } = roomsFromPlan(planOfView(view, code, layersOn), roles, project.cadLength);
    if (!rooms.length) { cad.say('ROOMS  No closed outlines on the room-outline layers that are shown. Use Click inside or Trace.'); return; }
    const { project: next } = putRooms(project, rooms.map((r) => ({ ...r, file: view.file })), floor.ref, roles);
    const label = floorLabel(project.building, floor);
    change(next, `${rooms.length} room${rooms.length === 1 ? '' : 's'} from the plan on ${label}${rooms.some((r) => !r.named) ? ` (${rooms.filter((r) => !r.named).length} without a name: Pick name)` : ''}${zones ? ` · ${zones} zone outline${zones === 1 ? '' : 's'} left out` : ''}${levelSet ? '' : ' — level not set: File → Level'} · ⌘Z to undo`);
  }

  function finishPline(closed: boolean) {
    if (points.length >= 2) draw({ kind: 'pline', layer: curLayer, pts: points, closed }, `Polyline (${points.length} points${closed ? ', closed' : ''})`);
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
    draw({ kind: 'circle', layer: curLayer, pts: [points[0]], r }, `Circle radius ${m(toM(r))}`);
    setPoints([]); cad.say(PROMPT.circle);
  }

  /** Typed input for an edit tool: an option of its prompt (the capital letters, or the word), a value, or Enter alone
   * (the value in < >, else the end of the step, then of the tool). True when it was one. */
  function editInput(typedC: string): boolean {
    const opt = promptOptions(cad.history[cad.history.length - 1] ?? '').find((o) => o.option.toUpperCase() === typedC);
    const c = opt ? opt.key : typedC, num = isNumber(c) && !c.startsWith('-') ? String(Number(c)) : undefined, CMD = tool.toUpperCase();
    if (tool === 'offset') {
      if (num) { setEdSet({ ...edSet, offset: num, through: false }); setEdAsk(null); cad.say(`OFFSET  Distance ${f2(num)} m`); if (!edStep) cad.say(PROMPT.offset); return true; }
      if (edStep) { if (c) return false; setEdStep(null); cad.say(PROMPT.offset); return true; }
      if (edAsk === 'offset') {
        if (!c) { setEdAsk(null); cad.say(PROMPT.offset); return true; }
        const s: EditSettings | undefined = c === 'T' ? { ...edSet, through: !edSet.through } : c === 'E' ? { ...edSet, erase: !edSet.erase } : c === 'L' ? { ...edSet, layer: edSet.layer === 'source' ? 'current' : 'source' } : undefined;
        if (!s) return false;
        setEdSet(s);
        cad.say(c === 'T' ? `OFFSET  Through point: ${s.through ? 'Yes' : 'No'}` : c === 'E' ? `OFFSET  Erase source after offsetting: ${s.erase ? 'Yes' : 'No'}` : `OFFSET  Copies on the ${s.layer === 'source' ? "source object's layer" : `current layer (${DRAW_LAYER})`}`);
        cad.say(editPrompt('offset', s)); return true;
      }
      if (!c || c === 'E') { cad.setTool('none'); return true; }
      return false;
    }
    if (tool === 'fillet' || tool === 'chamfer') {
      const fil = tool === 'fillet';
      if (edAsk === 'radius' || edAsk === 'd1' || edAsk === 'd2') {
        if (c && !num) return false;
        const s = num ? { ...edSet, [edAsk]: num } : edSet;
        setEdSet(s);
        if (edAsk === 'd1') { setEdAsk('d2'); cad.say(`CHAMFER  Specify second chamfer distance <${f2(s.d2)}>:`); return true; }
        setEdAsk(null); cad.say(editPrompt(tool, s)); return true;
      }
      if (num) { const s = fil ? { ...edSet, radius: num } : { ...edSet, d1: num, d2: num }; setEdSet(s); cad.say(edStep ? `${CMD}  ${fil ? 'Radius' : 'Distances'} ${f2(num)} m` : editPrompt(tool, s)); return true; }
      if (!edStep && c === (fil ? 'R' : 'D')) { setEdAsk(fil ? 'radius' : 'd1'); cad.say(fil ? `FILLET  Specify fillet radius <${f2(edSet.radius)}>:` : `CHAMFER  Specify first chamfer distance <${f2(edSet.d1)}>:`); return true; }
      if (!edStep && c === 'T') { const s = { ...edSet, trim: !edSet.trim }; setEdSet(s); cad.say(`${CMD}  Trim: ${s.trim ? 'Yes' : 'No'}`); cad.say(editPrompt(tool, s)); return true; }
      if (!c) { if (edStep) { setEdStep(null); cad.say(editPrompt(tool, edSet)); } else cad.setTool('none'); return true; }
      return false;
    }
    if (tool === 'mirror' && edAsk === 'erase' && points.length === 2) {
      if (c && c !== 'Y' && c !== 'N') return false;
      applyMirror(points[0], points[1], c ? c === 'Y' : !edSet.keep); return true;
    }
    if (tool === 'scale' && edAsk === 'factor' && points.length) {
      if (c && !num) return false;
      applyScale(points[0], num ?? edSet.factor); return true;
    }
    if (tool === 'array' && edAsk === 'type') {
      if (c === 'R' || (!c && !edSet.polar)) { setEdSet({ ...edSet, polar: false }); applyArray(undefined, false); return true; }
      if (c === 'P' || !c) { setEdSet({ ...edSet, polar: true }); setEdAsk(null); cad.say('ARRAY  Specify center point of array:'); return true; }
      return false;
    }
    if (c) return false;
    if (tool === 'break') {
      const it = edStep && sketch.find((x) => x.id === edStep.id);
      const r = it ? breakAt(it, edStep.at) : undefined;
      if (!edStep) { cad.setTool('none'); return true; }
      setEdStep(null);
      if (it && r && !failed(r, 'BREAK')) change(replaced(project, it, r.items!), `BREAK  ${kindOf(it)} split in two · ⌘Z to undo`);
      return true;
    }
    if (tool === 'join') { applyJoin(); return true; }
    if (PICK_FIRST.includes(tool) && edPhase === 'pick') {
      if (!pickedSk.length) { cad.say(`${CMD}  Pick the objects first.`); return true; }
      setEdPhase('points');
      if (tool === 'array') { setEdAsk('type'); cad.say(arrayType(edSet)); } else cad.say(tool === 'mirror' ? 'MIRROR  Specify first point of the mirror line:' : 'SCALE  Specify base point:');
      return true;
    }
    if (tool === 'array' && !edSet.polar && pickedSk.length) { applyArray(); return true; }
    if (tool === 'trim' || tool === 'extend' || tool === 'explode' || (tool === 'stretch' && !stretchBox)) { cad.setTool('none'); return true; }
    return false;
  }
  /** The edit tool's prompt as it is now, with the values in < > as they are now: the command line shows it in place
   * of the one said before, so a value changed in the dialog shows there at once. */
  const promptNow = (s: EditSettings): string | undefined => (tool === 'offset' ? (edStep ? undefined : edAsk === 'offset' ? editPrompt(tool, s) : PROMPT.offset)
    : tool === 'fillet' || tool === 'chamfer' ? (edStep ? undefined : edAsk === 'radius' ? `FILLET  Specify fillet radius <${f2(s.radius)}>:` : edAsk === 'd1' ? `CHAMFER  Specify first chamfer distance <${f2(s.d1)}>:`
      : edAsk === 'd2' ? `CHAMFER  Specify second chamfer distance <${f2(s.d2)}>:` : editPrompt(tool, s))
    : tool === 'mirror' && edAsk === 'erase' ? mirrorAsk(s) : tool === 'scale' && edAsk === 'factor' ? `SCALE  Specify scale factor <${s.factor}>:` : tool === 'array' && edAsk === 'type' ? arrayType(s) : undefined);
  /** Runs a recent command again (Enter or Space with no tool, Repeat in the right-click menu). */
  const repeat = (x: { tool?: CadTool; text?: string }) => { if (x.tool) cad.setTool(x.tool); else if (x.text) run(x.text); };

  function run(text: string) {
    const raw = text.trim();
    const c = raw.toUpperCase().replace(/\s+/g, ' ');
    setPromptMenu(null);
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
    // TEXT: its height (paper mm) and rotation (degrees) after the point, then the text. A word typed at either is the text.
    if (tool === 'text' && cad.textAt && textAsk?.step && (!c || isNumber(c))) {
      const n = c ? Number(c) : undefined;
      if (textAsk.step === 'height') { setTextAsk({ ...textAsk, step: 'rot', mm: n && n > 0 ? n : textAsk.mm }); cad.say(`TEXT  Specify rotation angle <${textAsk.rot}>:`); }
      else { setTextAsk({ ...textAsk, step: null, rot: n ?? textAsk.rot }); cad.say('TEXT  Enter text:'); }
      return;
    }
    if (tool === 'text' && cad.textAt && raw) {
      const t = textAsk ?? { mm: anno.textMm, rot: 0 };
      draw({ kind: 'text', layer: ANNO_LAYER, pts: [cad.textAt], text: raw, h: textUnits({ ...anno, textMm: t.mm }, units.factor), ...(t.rot ? { rot: (t.rot * Math.PI) / 180 } : {}) }, `Text "${raw}"`);
      cad.setTextAt(null); setTextAsk(null); cad.say(PROMPT.text); return;
    }
    if (!renaming && EDIT_TOOLS.includes(tool) && editInput(c)) return;
    if (c && layoutCmd(c)) { setTyped((t) => [...t.filter((x) => x !== c), c].slice(-30)); return; }
    // CLAYER and a layer's name: new lines, polylines, rectangles, circles and arcs go on it.
    const cl = /^CLAYER\s+(.+)$/i.exec(raw.trim());
    if (cl && view) {
      setTyped((t) => [...t.filter((x) => x !== c), c].slice(-30));
      const want = cl[1].trim(), row = lRows.find((r) => r.name.toLowerCase() === want.toLowerCase());
      cad.say(`Command: CLAYER ${want}`);
      if (!row) cad.say(`CLAYER  There is no layer ${want}. Add it with New layer in the layer palette (LM).`);
      else if (row.group !== 'drawn') cad.say(`CLAYER  ${row.name} is ${row.group === 'arch' ? 'the architect\'s' : 'a reference\'s'}; new objects go on the app's drawn layers.`);
      else if (row.freeze) cad.say(`CLAYER  ${row.name} is frozen; thaw it first.`);
      else setCurrentLayer(row.name);
      return;
    }
    if (!c) {
      if ((tool === 'area' || tool === 'trace') && points.length >= 3) finishArea(points);
      else if (tool === 'pline') finishPline(false);
      else if (tool === 'tray') finishTray();
      else if (tool === 'em') finishRoute();
      else if (tool === 'arl' && arlAt.length && points.length >= 2) placeArl();
      else if (renaming) { setRenaming(null); cad.say('*Cancel*'); }
      else if (tool === 'cable') finishCable();
      else if (tool === 'line') { setPoints([]); cad.say(PROMPT.line); }
      else if (tool === 'leader') { if (points.length >= 2 && view) change(addSketch(project, view.file, leaderItems(points, '', textH)[0]).project, 'Leader · ⌘Z to undo'); setPoints([]); cad.say(PROMPT.leader); }
      else if (tool === 'copy') { setPoints([]); cad.setSelected(null); setResult(null); cad.setTool('none'); }
      else if (tool === 'none' && recent[0]) repeat(recent[0]);
      return;
    }
    if (tool === 'pline' && c === 'C' && points.length >= 3) { finishPline(true); return; }
    if (tool === 'circle' && points.length === 1 && isNumber(c)) { finishCircle(Number(c)); return; }
    if (tool === 'rotate' && !selSketch && selectedItem?.what === 'elv' && isNumber(c)) {
      const r = rotateElv(project, selectedItem.id, Number(c));
      change(r.next, r.message); cad.setSelected(null); setResult(null); cad.setTool('none'); return;
    }
    if (tool === 'rotate' && selSketch && points.length === 1 && isNumber(c)) {
      const a = (Number(c) * Math.PI) / 180;
      if (view) change(updateSketch(project, view.file, rotated(selSketch, points[0], a)), `Rotated ${Number(c).toFixed(2)}° · ⌘Z to undo`);
      setPoints([]); cad.setSelected(null); setResult(null); cad.setTool('none'); return;
    }
    // A number typed with Scale (before its base point) sets the factor.
    if (tool === 'scale' && isNumber(c) && !c.startsWith('-')) { const k = String(Number(c)); setEdSet({ ...edSet, factor: k }); cad.say(`SCALE  Factor ${k}`); return; }
    if (DRAW_TOOLS.includes(tool) || tool === 'dist' || tool === 'area' || tool === 'trace') {
      const p = typedPoint(raw, points[points.length - 1], cursor.at);
      if (p) { cad.say(`  ${raw}`); click(p, 1e-9); return; }
    }
    cad.say(`Command: ${c}`);
    if (c === 'O' && tool === 'area') { setObjectMode(true); setPoints([]); cad.say('AREA  Select a closed object:'); return; }
    const act: Record<CadAction, () => void> = {
      open: () => openFile(),
      close: () => { if (view) closeDrawings(c === 'CLOSE' ? [view] : undefined); else cad.say('No drawing open.'); },
      fit: () => cad.fit(),
      addRooms: () => addFound(),
      schedules: () => schedules(),
      select: () => { cad.setTool('none'); cad.say('SEL  Click a device, Shift-click to add or remove, or drag a window (left to right: inside; right to left: crossing):'); },
      xref: () => { if (view) setShowXR(true); else cad.say('XREF  Open a drawing first.'); },
      xattach: () => { if (view) void startAttach(); else cad.say('XATTACH  Open a plan first.'); },
      xclip: () => { const one = xr.refs.filter((x) => !x.unloaded); if (one.length === 1) startClip(one[0]); else if (view) { setShowXR(true); cad.say('XCLIP  Choose the reference, then Clip.'); } },
      layerManager: () => { if (view) setShowLM((v) => !v); else cad.say('LAYER  Open a drawing first.'); },
      newLayer: () => { if (!view) { cad.say('LAYER  Open a drawing first.'); return; } setShowLM(true); const n = addLayer(); cad.say(`LAYER  ${n} added. Double-click its name in the layer palette (or F2) to rename it.`); },
      clayer: () => cad.say(`CLAYER  Current layer: ${curLayer}. Type CLAYER and a layer name to change it, e.g. CLAYER ${curLayer}.`),
      layiso: () => {
        const keep = [...new Set([...pickedSk.map((it) => it.layer), ...(result?.kind === 'object' && view?.info.layers[result.o.layer] ? [view.info.layers[result.o.layer].name] : [])])];
        if (!view) cad.say('LAYISO  Open a drawing first.'); else if (!keep.length) cad.say('LAYISO  Pick the objects whose layers stay on first (or select layers in the layer palette, then Iso).'); else isolateLayers(keep);
      },
      layuniso: () => unisolateLayers(),
      align: () => { if (pickedItems.length < 2) cad.say(`${c}  Select two or more devices first.`); else editDevices(c === 'ALIGN' ? 'row' : c === 'ALIGNV' ? 'column' : 'space'); },
      wireAll: () => wireAll(),
      wireTags: () => cad.setWireTags(!cad.wireTags),
      coverage: () => cad.setCoverage(!cad.coverage),
      erase: () => removeSelected(),
      save: () => void saveDxf(),
      saveDwg: () => void saveDxf('dwg'),
      layers: () => cad.setShowLayers(!cad.showLayers),
      osnap: () => cad.toggle('osnap'),
      grid: () => cad.cycleGrid(),
      ortho: () => cad.toggle('ortho'),
      snap: () => cad.toggle('snap'),
      help: () => { cad.say(HELP); setLog('help'); },
      textStyle: () => { setDlg('style'); cad.say(`STYLE  Current text style: "${currentTextStyle(project).name}"`); },
      dimStyle: () => { setDlg('dimstyle'); cad.say(`DIMSTYLE  Current dimension style: "${dimStylesOf(project).current}"`); }
    };
    const command = cadCommand(c);
    if (command) setTyped((t) => [...t.filter((x) => x !== c), c].slice(-30));
    if (command && 'action' in command && command.action !== 'help') setRecent((r) => [{ label: c, text: c }, ...r.filter((x) => x.label !== c)].slice(0, 8));
    if (!command) cad.say(`Unknown command "${c}". Press F1 for the list.`);
    else if ('tool' in command) cad.setTool(command.tool);
    else act[command.action]();
  }

  /** Esc: the step, then the tool, then what is picked (the history or command list, and a menu, close first). */
  function cancel() {
    setCmd(''); input.current?.blur(); setPromptMenu(null);
    if (points.length || objectMode || cad.textAt) { setPoints([]); setObjectMode(false); cad.setTextAt(null); setTextAsk(null); setEdAsk(null); cad.say('*Cancel*'); }
    else if (edStep || edAsk === 'radius' || edAsk === 'd1' || edAsk === 'd2') { setEdStep(null); setEdAsk(null); cad.say('*Cancel*'); cad.say(tool === 'offset' ? PROMPT.offset : editPrompt(tool, edSet)); }
    else if (menuAt) setMenuAt(null); else if (renaming) { setRenaming(null); cad.say('*Cancel*'); } else if (tool !== 'none') cad.setTool('none'); else { setResult(null); cad.setSelected(null); setPicked([]); }
  }
  /** What Space does in the command line: types a space in text (a name, TEXT contents, a leader's text); at TEXT's
   * height and rotation, where a word is the text, ends only an empty input or a number; else ends a whole word. */
  const spaceMode: SpaceMode = renaming || renamingLayout || (tool === 'text' && cad.textAt && !textAsk?.step) || (tool === 'leader' && points.length >= 2) ? 'text'
    : tool === 'text' && cad.textAt ? 'value' : 'command';
  /** Numbers typed go to the command line (or the box at the cursor) rather than the view's keys (0 fits, − zooms out):
   * while a tool is running or something is typed there. */
  const valuesTyped = tool !== 'none' || cmd !== '';
  // Space tapped on the drawing works as Enter when it is let go, unless it was held to pan (the mouse pressed while
  // it was down) or long enough to repeat.
  const spaceTap = useRef<{ dragged: boolean; repeated: boolean } | null>(null);

  // CAD keys while this page shows: function keys toggle, typing goes to the command line, Enter or Space ends the step
  // (with no tool, repeats the last command), Esc cancels the command (and the tool), F2 the taller history, F1 the
  // command list.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    const mods = e.metaKey || e.ctrlKey || e.altKey;
    const fn: Record<string, keyof CadToggles> = { F3: 'osnap', F7: 'grid', F8: 'ortho', F9: 'snap', F12: 'dyn' };
    if (fn[e.key]) { e.preventDefault(); if (fn[e.key] === 'grid') cad.cycleGrid(); else cad.toggle(fn[e.key]); return; }
    // Keys in a dialog over the page (the layer manager, references…) are the dialog's.
    if (e.defaultPrevented || (e.target instanceof Element && e.target.closest('[aria-modal="true"], [role="dialog"]'))) return;
    if ((e.key === 'F1' || e.key === 'F2') && !mods && !e.shiftKey && (!typing || e.target === input.current)) { e.preventDefault(); const k = e.key === 'F1' ? 'help' : 'history'; setLog(log === k ? null : k); return; }
    if (e.key === 'Escape' && (!typing || e.target === input.current)) {
      if (log) { setLog(null); return; }
      if (promptMenu) { setPromptMenu(null); return; }
      cancel();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && (selectedItem || selSketch || many)) { e.preventDefault(); removeSelected(); return; }
    // Enter or Space on the drawing (not on a button, a field or the layer palette) works as Enter on the empty command
    // line: Enter at once, Space when it is let go (see spaceTap); once per press.
    const onControl = e.target instanceof Element && !!e.target.closest('button, a, [role="tab"], [role="menuitem"], [contenteditable="true"], .cad-lpal');
    if (e.key === ' ' && spaceMode !== 'text' && !typing && !onControl && !mods) {
      e.preventDefault();
      if (!e.repeat) spaceTap.current = { dragged: false, repeated: false }; else if (spaceTap.current) spaceTap.current.repeated = true;
      return;
    }
    if (e.key === 'Enter' && !typing && !onControl && !mods) { e.preventDefault(); if (!e.repeat) run(''); return; }
    // A number (0 too: it fits the view only with no tool and nothing typed), a point or a minus goes to the first box
    // at the cursor (dynamic input), else to the command line, while a tool is running or something is typed there.
    if (!typing && !mods && /^[0-9.,-]$/.test(e.key) && valuesTyped) { (dynBoxes.length ? dynRefs[0] : input).current?.focus(); return; }
    if (!typing && !mods && /^[a-zA-Z?@]$/.test(e.key)) input.current?.focus();
  };
  const keyUpRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyUpRef.current = (e: KeyboardEvent) => {
    if (e.key !== ' ') return;
    const tap = spaceTap.current;
    spaceTap.current = null;
    if (tap && !tap.dragged && !tap.repeated) run('');
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => keyRef.current(e);
    const up = (e: KeyboardEvent) => keyUpRef.current(e);
    // A press of the mouse while Space is down pans: then Space is not Enter.
    const press = () => { if (spaceTap.current) spaceTap.current.dragged = true; };
    const blur = () => { spaceTap.current = null; };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', up);
    window.addEventListener('mousedown', press, true);
    window.addEventListener('pointerdown', press, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', up);
      window.removeEventListener('mousedown', press, true); window.removeEventListener('pointerdown', press, true); window.removeEventListener('blur', blur);
    };
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
    if (tool === 'dim' && points.length === 2) { const look = dimLookOf(project, units.factor)?.look; return [{ ...base, kind: 'dim', pts: [points[0], points[1], cur], ...(look ? { look } : {}) }]; }
    if ((tool === 'move' || tool === 'copy') && lastPt && selSketch) return [moved(selSketch, cur[0] - lastPt[0], cur[1] - lastPt[1])];
    if ((tool === 'move' || tool === 'copy') && lastPt) return [{ ...base, kind: 'line', pts: [lastPt, cur] }];
    if (tool === 'rotate' && lastPt && selSketch) return [rotated(selSketch, lastPt, Math.atan2(cur[1] - lastPt[1], cur[0] - lastPt[0]))];
    return [];
  })();
  const liveLabel = cur && lastPt && ['line', 'pline', 'tray', 'cable', 'dim', 'move', 'copy'].includes(tool) ? `${m(toM(distance(lastPt, cur)))}  ${angleDeg(lastPt, cur).toFixed(1)}°`
    : cur && lastPt && tool === 'circle' ? `R ${m(toM(distance(lastPt, cur)))}` : undefined;
  // Dynamic input (DYN, F12): length and angle while a point is asked for after a first one, a radius for a circle,
  // else the distance, radius or factor of Offset, Fillet and Scale; and the prompt in short form with its options.
  const dynOn = !!cad.toggles.dyn && tool !== 'none' && !!cur && spaceMode !== 'text';
  const dynBoxes: DynBox[] = !dynOn || !cur ? []
    : lastPt && POINT_TOOLS.includes(tool) ? [{ label: 'Length', live: fmtFixed(toM(distance(lastPt, cur)), 2), unit: 'm' }, { label: 'Angle', live: angleDeg(lastPt, cur).toFixed(1), unit: '°' }]
    : lastPt && tool === 'circle' ? [{ label: 'Radius', live: fmtFixed(toM(distance(lastPt, cur)), 2), unit: 'm' }]
    : tool === 'offset' && !edStep ? [{ label: 'Distance', live: edSet.through ? 'Through' : f2(edSet.offset), unit: 'm' }]
    : tool === 'fillet' && !edStep && !edAsk ? [{ label: 'Radius', live: f2(edSet.radius), unit: 'm' }]
    : tool === 'scale' && edAsk === 'factor' ? [{ label: 'Factor', live: edSet.factor, unit: '×' }] : [];
  const dynLine = cad.history[cad.history.length - 1] ?? '';
  const dynOptions = dynOn ? promptOptions(dynLine) : [];
  const marks: CadMarks | null = DRAW_TOOLS.includes(tool) && lastPt ? { points: [lastPt], live: true, label: dynBoxes.length ? undefined : liveLabel }
    : result?.kind === 'dist' ? { points: [result.a, result.b], label: m(toM(distance(result.a, result.b))) }
    : result?.kind === 'area' && result.how !== 'object' ? { points: result.points, closed: true, label: m2(toM2(areaOf(result.points).area)) }
    : points.length ? (() => {
      const live = cursor.at ? [...points, cursor.at] : points;
      const corners = tool === 'area' || tool === 'trace';
      const label = tool === 'dist' && live.length === 2 ? m(toM(distance(live[0], live[1]))) : corners && live.length >= 3 ? m2(toM2(areaOf(live).area)) : undefined;
      return { points, live: true, area: corners, label };
    })()
    : tool === 'dist' || tool === 'area' || tool === 'trace' ? { points: [], live: false } : null;
  useEffect(() => { setDynVals([]); setDynMenu(null); }, [tool, points.length, edStep, edAsk]);
  /** Enter in a box at the cursor: the point at the length and angle typed (the cursor's where not typed), as a typed
   * @length<angle; the circle's radius; or the distance, radius or factor, as typed on the command line. */
  function dynEnter() {
    const [a = '', b = ''] = dynVals.map((v) => v.trim());
    setDynVals([]); dynRefs.forEach((r) => r.current?.blur());
    if (!cur || (!a && !b)) { run(''); return; }
    const label = dynBoxes[0]?.label;
    // A point typed in a box ("x,y", "@dx,dy", "@d<angle") works as on the command line, in drawing units.
    if (/[,<@]/.test(a)) {
      const p = label === 'Length' || label === 'Radius' ? typedPoint(a, lastPt, cur) : undefined;
      if (p) { cad.say(`  ${a}`); void click(p, 1e-9); }
      else cad.say(label === 'Length' || label === 'Radius' ? `  ${a}: type a point as x,y, @dx,dy or @distance<angle (drawing units), or a length in metres.` : `${tool.toUpperCase()}  Type the ${label?.toLowerCase() ?? 'value'} as a number.`);
      return;
    }
    if (label === 'Length' && lastPt) {
      if ((a && !isNumber(a)) || (b && !isNumber(b))) { cad.say('Type a length in metres and an angle in degrees.'); return; }
      const d = a ? Number(a) / units.factor : distance(lastPt, cur), deg = b ? Number(b) : angleDeg(lastPt, cur);
      cad.say(`  ${fmtFixed(d * units.factor, 2)} m < ${fmtFixed(deg, 1)}°`);
      void click([lastPt[0] + d * Math.cos((deg * Math.PI) / 180), lastPt[1] + d * Math.sin((deg * Math.PI) / 180)], 1e-9);
      return;
    }
    if (label === 'Radius' && tool === 'circle') { const r = isNumber(a) ? Number(a) / units.factor : NaN; if (r > 0) finishCircle(r); else cad.say('CIRCLE  Type a radius above 0 (metres).'); return; }
    run(a);
  }
  /** Keys while the options under the prompt box are open: arrows move, Enter takes one, Esc closes. */
  function dynKey(e: { key: string; preventDefault: () => void }): boolean {
    if (dynMenu === null) return false;
    const n = dynOptions.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setDynMenu((dynMenu + (e.key === 'ArrowDown' ? 1 : n - 1)) % n); return true; }
    if (e.key === 'Enter') { e.preventDefault(); const o = dynOptions[dynMenu]; setDynMenu(null); if (o) run(o.key); return true; }
    if (e.key === 'Escape') { e.preventDefault(); setDynMenu(null); return true; }
    return false;
  }
  const highlight: [number, number] | null = result?.kind === 'object' ? [result.o.seg_start, result.o.seg_end] : null;
  const objectArea = result?.kind === 'area' && result.how === 'object';

  /** The drawing: on the Model tab, or inside the viewport worked in on a layout (fitted to its window). */
  const drawCanvas = (vpProps?: Pick<React.ComponentProps<typeof CadCanvas>, 'fitBox' | 'fixed' | 'onView'>) => (
            <CadCanvas view={view!} layersOn={layersOn} extents={fitExtents} toggles={cad.toggles} gridDots={cad.gridDots} fitKey={cad.fitKey} onCursor={(at, snap) => setCursor({ at, snap })} onClick={click} marks={objectArea ? { points: result.points, closed: true } : marks} highlight={highlight} devices={devices} wiring={canvasWiring} sketch={sketch} selectedSketch={pickedSk.map((it) => it.id)} extraSnaps={sketchSnaps} preview={[...preview, ...emRoutes, ...(gripIdx !== null && selSketch && cursor.at ? [gripMoved(selSketch, gripIdx, cursor.at)] : []), ...(arlLine.length === 2 ? [{ id: '_arl', layer: '', kind: 'line' as const, pts: arlLine }] : [])]} unitsPerMm={0.001 / units.factor} labels={cableLabels} covers={elv?.covers} gaps={elv?.gaps}
              numbersTyped={valuesTyped} layerStyle={styles} refs={xr.placed} refSnap={xr.snap} windowSelect={tool === 'none' || tool === 'stretch' || (PICK_FIRST.includes(tool) && edPhase === 'pick')} onWindow={pickWindow} onContext={contextAt}
              grips={tool === 'none' && selSketch && !many ? gripsOf(selSketch).map((g) => g.at) : []} onGripStart={setGripIdx}
              onGripEnd={(i, at) => {
                setGripIdx(null);
                if (i < 0 || !selSketch) return;
                const next = gripMoved(selSketch, i, at);
                change(updateSketch(project, fileOf(), next), `GRIP  ${kindOf(selSketch)} ${gripsOf(selSketch)[i]?.kind === 'mid' ? 'side moved' : 'changed'}${isPath(next) ? ` — now ${m(toM(next.pts.slice(1).reduce((t, q, k) => t + distance(next.pts[k], q), 0)))}` : ''} · ⌘Z to undo`);
              }}
              overlay={(toScreen, moving) => {
                const dyn = dynOn && cur && !moving && !promptMenu ? (() => {
                  const [x, y] = toScreen(cur);
                  return <CadDynInput left={x + 16} top={y + 16} boxes={dynBoxes} vals={dynVals} refs={dynRefs} prompt={shortPrompt(dynLine)} options={dynOptions} menu={dynMenu !== null} hi={dynMenu ?? 0}
                    onVals={setDynVals} onPick={(k) => { setDynMenu(null); run(k); }} onBlur={() => setDynMenu(null)}
                    onKey={(e, i) => {
                      if (dynKey(e)) return;
                      // Enter, or Space after a whole value (not inside a point being typed), once per press.
                      if (e.key === 'Enter' || (e.key === ' ' && spaceEnters(dynVals[i] ?? ''))) { e.preventDefault(); if (!e.repeat) dynEnter(); }
                      else if (e.key === 'Tab' && dynBoxes.length > 1) { e.preventDefault(); dynRefs[(i + 1) % dynBoxes.length].current?.focus(); }
                      else if (e.key === 'ArrowDown' && dynOptions.length) { e.preventDefault(); setDynMenu(0); }
                      else if (e.key === 'Escape') { e.preventDefault(); const typedAny = dynVals.some((v) => v); setDynVals([]); e.currentTarget.blur(); if (!typedAny) cancel(); }
                      else if (/^[a-zA-Z@]$/.test(e.key) && !e.metaKey && !e.ctrlKey) input.current?.focus();
                    }} />;
                })() : null;
                if (promptMenu && !moving) return <CadPromptMenu left={promptMenu.at[0] + 4} top={promptMenu.at[1] + 4} items={promptMenu.items} onPick={(i) => { const x = promptMenu.items[i]; setPromptMenu(null); x.run(); }} />;
                if (tool !== 'none' || moving || gripIdx !== null || (!pickedItems.length && !pickedSk.length)) return dyn;
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
        {showLM && view && (
          <LayerPalette file={view.file} rows={lRows} current={curLayer} states={layerFile.states ?? []} isolated={!!layerFile.iso}
            viewport={sheetL && vpTarget ? { name: vpName(vps, vpTarget.id), frozen: (l) => isFrozen(vpTarget, l), toggle: (l) => patchVp(vpTarget, toggleFrozen(vpTarget, l), `${l} ${isFrozen(vpTarget, l) ? 'thawed' : 'frozen'} here`) } : undefined}
            onApply={(rows, patch) => layerChange(applyLayerPatch(project, view.file, rows, patch), `${layerNames(rows)} changed`)}
            onNew={addLayer}
            onRename={(from, to) => {
              const r = renameLayer(project, view.file, from, to, lRows.map((x) => x.name));
              if ('error' in r) return r.error;
              change(r.project, `Layer ${from} renamed ${to} · ⌘Z to undo`);
              return undefined;
            }}
            onDelete={(rows) => change(rows.reduce((q, r) => withoutLayer(q, view.file, r.name), project), `${layerNames(rows)} deleted · ⌘Z to undo`)}
            onCurrent={setCurrentLayer}
            onIsolate={(rows: LayerRow[]) => isolateLayers(rows.map((r) => r.name))}
            onUnisolate={unisolateLayers}
            onSaveState={(name) => change(withSavedState(project, view.file, name, lRows), `Layer state ${name} saved · ⌘Z to undo`)}
            onRestoreState={(name) => { const r = restoreState(project, view.file, name, lRows); if (r) layerChange(r.project, `Layer state ${name} restored${r.kept ? ` (${r.kept} stays thawed: it is the current layer)` : ''}`); }}
            onDeleteState={(name) => change(withoutState(project, view.file, name), `Layer state ${name} deleted · ⌘Z to undo`)}
            onClose={() => setShowLM(false)} />
        )}
        {dlg === 'edit' && DIALOG_TOOLS.includes(tool as EditTool) && <EditDialog tool={tool as EditTool} settings={edSet} onPatch={(p) => setEdSet((x) => ({ ...x, ...p }))} onClose={() => setDlg(null)} />}
        {dlg === 'style' && <TextStyleDialog styles={textStylesOf(project)} annoMm={anno.textMm} onClose={() => setDlg(null)}
          onSave={(s) => {
            setDlg(null);
            // Standard unchanged is not kept; saved with nothing changed, nothing changes.
            const keep = textStylesToStore(s), { cadTextStyles: _t, ...rest } = project;
            if (JSON.stringify(keep) === JSON.stringify(project.cadTextStyles)) { cad.say('STYLE  No change.'); return; }
            change(keep ? { ...project, cadTextStyles: keep } : rest, `STYLE  ${s.styles.length} text style${s.styles.length === 1 ? '' : 's'}, current "${s.current}" · ⌘Z to undo`);
          }} />}
        {dlg === 'dimstyle' && <DimStyleDialog styles={dimStylesOf(project)} asBefore={dimStandardAsBefore(project)} onClose={() => setDlg(null)}
          onSave={(s) => {
            setDlg(null);
            const keep = dimStylesToStore(project, s), { cadDimStyles: _d, ...rest } = project;
            if (JSON.stringify(keep) === JSON.stringify(project.cadDimStyles)) { cad.say('DIMSTYLE  No change.'); return; }
            change(keep ? { ...project, cadDimStyles: keep } : rest, `DIMSTYLE  ${s.styles.length} dimension style${s.styles.length === 1 ? '' : 's'}, current "${s.current}" · ⌘Z to undo`);
          }} />}
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
                <>{view.file}<br /><span className="m">{view.info.format} · {units.label}{units.assumed ? ' (not set in the drawing: taken as mm)' : ''} · {fmtUpTo(view.info.segments, 0)} lines · {view.info.texts.length} texts</span><br /><span className="m">{editPrompt(tool, edSet)}</span></>
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
            {EDIT_TOOLS.includes(tool) && !DIALOG_TOOLS.includes(tool as EditTool) && view && (
              <EditToolPanel tool={tool as EditTool} settings={edSet} onSettings={setEdSet} picked={pickedSk.length}
                step={edStep ? `${kindOf(sketch.find((x) => x.id === edStep.id) ?? sketch[0])} picked — ${tool === 'offset' ? 'click the side' : tool === 'break' ? 'click the second point, or Enter' : 'click the second line'}` : stretchBox ? 'Window set — click the base point, then the second point' : PICK_FIRST.includes(tool) && edPhase === 'points' ? 'Objects picked — now the points' : undefined}
                onApply={tool === 'join' ? applyJoin : tool === 'array' && !edSet.polar ? () => applyArray() : undefined} />
            )}
            {tool === 'none' && view && pickedSk.length > 0 && (
              <ObjectPropertiesPanel items={pickedSk} layers={drawnLayers(sketch, [...(layerFile.layers ?? []), curLayer])} onApply={(patch) => change(pickedSk.reduce((q, it) => updateSketch(q, fileOf(), withProps(it, patch)), project), `${pickedSk.length === 1 ? kindOf(pickedSk[0]) : `${pickedSk.length} objects`}: properties changed · ⌘Z to undo`)} />
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
            <h4>Layers {view && <span className="cad-lyr-all"><button onClick={() => layerChange(applyLayerPatch(project, view.file, lRows.filter((r) => r.group === 'arch'), { on: true }), 'LAYER  All layers on')}>All on</button></span>}</h4>
            <div className="cad-layers">
              {view && placed.length > 0 && (
                <button className={`cad-lyr${cad.showDevices ? '' : ' off'}`} aria-pressed={cad.showDevices} onClick={() => cad.setShowDevices(!cad.showDevices)}>
                  <i style={{ background: 'var(--cad-dev)' }} />Devices placed in the app<span className="m">{cad.showDevices ? 'on' : 'off'}</span>
                </button>
              )}
              {view?.info.layers.map((l, i) => l.count > 0 || view.info.texts.some((t) => t.layer === i) ? (
                <button key={l.name} className={`cad-lyr${archOn[i] ? '' : ' off'}`} aria-pressed={!!archOn[i]} title={`${fmtUpTo(l.count, 0)} lines`} onClick={() => layerChange(applyLayerPatch(project, view.file, [{ name: l.name, group: 'arch', drawingOn: l.on }], { on: !archOn[i] }), `Layer ${l.name} ${archOn[i] ? 'off' : 'on'}`)}>
                  <i style={{ background: hex(l.rgb) }} />{l.name}<span className="m">{archOn[i] ? 'on' : 'off'}</span>
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
      <CadCommandLine history={cad.history} live={EDIT_TOOLS.includes(tool) ? promptNow(edSet) : undefined} cmd={cmd} setCmd={setCmd} inputRef={input} typed={typed} space={spaceMode} log={log} onLog={setLog} onRun={run} />
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
