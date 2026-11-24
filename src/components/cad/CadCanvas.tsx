import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { INK, SNAP, SNAP_NAMES, type CadView } from '../../engines/cad/cadEngine';
import type { ErasedParts } from '../../model/cadErased';
import { ortho as orthoFrom } from '../../model/cadMeasure';
import { DRAFT_DEFAULTS, otrack, pickRadiusPx, polarAngles, polarTrack, snapToSpacing, type CursorMode, type DraftSettings } from '../../model/cadDraft';
import { constructionSegment, dimOf, segmentsOf, trayLabel, trayLine, TRAY_TEXT_MM } from '../../model/cadSketch';
import { textBaseAt, textCorners } from '../../model/cadText';
import { SYMBOL_R_MM } from '../../model/cadAnnotate';
import { symbolBox, symbolGeom } from '../../model/planSymbols';
import { noteBox } from '../../model/cadMtext';
import { mleaderNote } from '../../model/cadMleader';
import { POINT_STYLE_DEFAULT, pointMark, pointRadius, type PointStyle } from '../../model/cadPoints';
import { attdefAsText, expandAll, type CadBlockDef } from '../../model/cadBlocks';
import type { PlanCells, PlanCover } from '../elv/elvOverlay';
import { fittingLabel, trayFittings } from '../../model/cadTrayFittings';
import { cssRgb, dashArray, hatchLines, lineBatches, mixCss, patternLength, screenColour } from '../../model/cadDraw';
import { BAR_ALPHA, emPerCap, READ_PX, SCREEN_FONT, textBar, widthPerPx } from '../../model/cadTextScreen';
import type { SketchItem } from '../../types';
import { effective, styleOf, type LayerStyle } from '../../model/cadLayerStyle';
import { colourCss } from '../../model/cadColours';
import { atOrigin, dotsOnly, hatchDots, hatchStrokes, defOf, placedLines } from '../../model/cadHatch';
import { onScreenThemeChange, screenAppearance } from '../../theme/theme';
import { isFitClick, isPanPress, KEY_STEP, PAN_STEP, useSpaceHeld, viewKey, wheelAction, ZoomChip, type ZoomMenuKey } from '../drawingView';
import { scaledView, windowView, type ViewT } from '../../model/cadView';
import { previousView, rememberView } from './cadViewHistory';

type Pt = [number, number];

/** The canvas colour when the theme gives none; the cursor's outline is drawn in it. */
const BG = '#15171A';
/** Segments from which a drawing also gets a zoomed-out copy with fewer corners (lineBatches minLen). */
export const COARSE_FROM = 1_000_000;
/** The font texts are drawn in. */
const FONT = SCREEN_FONT;

/** The status bar toggles; `dyn` (dynamic input at the cursor) is the page's, the drawing does not use it. */
/** `polar` tracking (F10), object snap tracking `otrack` (F11) and lineweights shown (`lwt`) default to off, off, on. */
export interface CadToggles { snap: boolean; osnap: boolean; ortho: boolean; grid: boolean; dyn?: boolean; polar?: boolean; otrack?: boolean; lwt?: boolean }
/** What a tool draws over the drawing: picked points (drawing units, absolute), and while `live` a rubber band to the
 * cursor; `closed` outlines are shaded. */
/** A device placed in the app, drawn over the drawing (drawing units, absolute): its symbol, letters and label. */
/** `plan`: a plan symbol (src/model/planSymbols.ts) drawn in place of `shape` and `text`, `r` the symbol radius (SYMBOL_R_MM on paper). */
export interface CanvasDevice { key: string; x: number; y: number; r: number; shape: string; text: string; label: string; plan?: string; tag?: string; rot?: number; selected?: boolean; elv?: boolean; ghost?: boolean }
/** A wired circuit (drawing units, absolute): arcs between its devices, the home run to its DB (an arrow at the DB) and
 * its tag; `warn` when it has no home run. */
export interface CanvasWiring { arcs: { a: Pt; c: Pt; b: Pt }[]; home?: { a: Pt; c: Pt; b: Pt }; tag?: { at: Pt; s: string; warn: boolean } }
/** What a click at the cursor would pick, marked before the click: a device (its key), a drawn object, or an object of
 * the opened drawing (its segments, start and end). `picked`: it is picked already (not marked; Shift shows −).
 * `label`: its kind and layer (a device: its name), named once the cursor rests (DS, Name tag after a pause). */
export interface CadHover { device?: string; sketch?: SketchItem; seg?: [number, number]; picked?: boolean; label?: string }
export interface CadMarks { points: Pt[]; live?: boolean; closed?: boolean; area?: boolean; label?: string }
/** Where the cursor lands: the point, the snap point it took, and the tracking line it follows (from where, its label). */
interface Landing { at: Pt; snap?: { p: Pt; kind: number }; guide?: { from: Pt[]; label: string } }
/** View transform: screen = (world − origin − (ox, oy)) × scale, y up. */
/** A zoom asked by the page (ZOOM Window / Scale / Previous, S2 of the 2D gap plan); each request once, by its number. */
export type ZoomReq = { n: number; do: { kind: 'window'; a: Pt; b: Pt } | { kind: 'scale'; k: number; relative: boolean } | { kind: 'previous' } };
/** Where a drawing was zoomed or panned to: it stays there until Fit, also while its tab or the page is left. */
const placeOf = new WeakMap<CadView, ViewT>();
/** A device's symbol in drawing units, at (x, y) from the drawing's origin under the view transform: a plan symbol's
 * lines and circles with its filled pieces, else its shape. The caller sets the colour, width and alpha. */
function strokeDevice(ctx: CanvasRenderingContext2D, d: CanvasDevice, x: number, y: number) {
  const r = d.r, g = d.plan ? symbolGeom(d.plan, x, y, r / SYMBOL_R_MM, d.tag, d.rot) : undefined;
  if (g) {
    // A plan symbol: its lines and circles, the filled pieces in the line's colour.
    ctx.beginPath();
    for (const p of g.paths) { if (p.fill) continue; p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); if (p.closed) ctx.closePath(); }
    for (const c of g.circles) { if (c.fill) continue; ctx.moveTo(c.c[0] + c.r, c.c[1]); ctx.arc(c.c[0], c.c[1], c.r, 0, 2 * Math.PI); }
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    for (const p of g.paths) { if (!p.fill) continue; p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); }
    for (const c of g.circles) { if (!c.fill) continue; ctx.moveTo(c.c[0] + c.r, c.c[1]); ctx.arc(c.c[0], c.c[1], c.r, 0, 2 * Math.PI); }
    ctx.fill();
    return;
  }
  ctx.beginPath();
  if (d.shape === 'square' || d.shape === 'rect') ctx.rect(x - r, y - (d.shape === 'rect' ? r * 0.6 : r), 2 * r, d.shape === 'rect' ? r * 1.2 : 2 * r);
  else if (d.shape === 'twin') { ctx.rect(x - r, y - r * 0.6, 2 * r, r * 1.2); ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x, y + r * 0.6); }
  else if (d.shape === 'triangle') { ctx.moveTo(x, y + r); ctx.lineTo(x + r, y - r * 0.8); ctx.lineTo(x - r, y - r * 0.8); ctx.closePath(); }
  else if (d.shape === 'diamond') { ctx.moveTo(x, y + r); ctx.lineTo(x + r, y); ctx.lineTo(x, y - r); ctx.lineTo(x - r, y); ctx.closePath(); }
  else if (d.shape === 'hexagon') { for (let k = 0; k < 6; k += 1) { const a = (k * Math.PI) / 3; if (k) ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); else ctx.moveTo(x + r, y); } ctx.closePath(); }
  else if (d.shape === 'camera') { ctx.rect(x - r, y - r * 0.5, r * 1.4, r); ctx.moveTo(x + r * 0.4, y); ctx.lineTo(x + r, y + r * 0.4); ctx.lineTo(x + r, y - r * 0.4); ctx.closePath(); }
  else if (d.shape === 'speaker') { ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.moveTo(x + r * 0.5, y); ctx.arc(x, y, r * 0.5, 0, 2 * Math.PI); }
  else { ctx.arc(x, y, r, 0, 2 * Math.PI); }
  if (d.shape === 'cross') { const k = r * 0.7; ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x - k, y + k); ctx.lineTo(x + k, y - k); }
  ctx.stroke();
}
/** A device's letters at screen point (sx, sy): a plan symbol's own texts, else its letter, and its label beside it
 * (none below 4 px). The caller sets the fill colour. */
function deviceText(ctx: CanvasRenderingContext2D, d: CanvasDevice, sx: number, sy: number, scale: number) {
  const px = d.r * scale;
  if (px < 4) return;
  const g = d.plan ? symbolGeom(d.plan, 0, 0, d.r / SYMBOL_R_MM, d.tag, d.rot) : undefined;
  // A plan symbol's own text, its capitals at the symbol's height.
  if (g) for (const t of g.texts) { const cap = t.h * scale; ctx.font = `${cap / 0.716}px system-ui, sans-serif`; ctx.textAlign = t.side ? 'left' : 'center'; ctx.fillText(t.s, sx + t.at[0] * scale, sy - t.at[1] * scale + cap / 2); }
  else if (d.text) { ctx.font = `600 ${Math.min(px * 0.8, 40)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(d.text, sx, sy + px * 0.3); }
  if (px >= 7 && d.label) { ctx.font = `${Math.min(Math.max(px * 0.6, 9), 16)}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.fillText(d.label, sx + (d.plan && g ? ((symbolBox(d.plan, d.tag, d.rot)!.x1 + 0.6) / SYMBOL_R_MM) * px : px * 1.3), sy + px * 0.3); }
}

/** Each drawing's texts' widths per px of font, measured once (for the bars of texts too small to read). */
const widthsOf = new WeakMap<CadView, Map<string, number>>();

const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;

/** Grid spacing for the zoom: the smallest of 1, 2, 5 × 10ⁿ drawing units that is at least 24 px on screen. */
export function gridStep(scale: number): number {
  const target = 24 / scale;
  const p = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= target) ?? 10 * p;
}

/** The drawing in a CAD model space: lines by layer and colour, texts at their height, a crosshair cursor with the snap
 * point under it, live coordinates. Wheel zooms at the cursor (two-finger scroll pans, pinch zooms), the middle button
 * or Space + drag pans, a middle double-click fits. */
export default function CadCanvas({ view, hidden, layersOn, toggles, gridDots = false, fitKey, onCursor, onClick, marks, highlight, devices = [], wiring = [], sketch: sketchIn = [], selectedSketch, extraSnaps = [], preview = [], unitsPerMm = 1, labels = {}, covers = [], gaps, numbersTyped = false, windowSelect = false, onWindow, onContext, panLeft = false, overlay, grips = [], hotGrip: hotGripIn = -1, pickedObjects, onGripStart, onGripEnd, layerStyle = {}, refs = [], refSnap, fitBox, fixed = false, onView, extents, draft = DRAFT_DEFAULTS, zoom, onZoomMenu, onDouble, pointStyle = POINT_STYLE_DEFAULT, blocks = [], onDrop, fadeExcept, cursorMode = 'ready', hover, cutAway, meets, shadowDevices, movingPoints }: {
  view: CadView;
  /** Objects of the drawing erased in the app (CROP): their lines, texts and fills are not drawn. */
  hidden?: ErasedParts;
  layersOn: Uint8Array;
  toggles: CadToggles;
  /** The grid (when on) as dots at the crossings instead of lines. */
  gridDots?: boolean;
  /** A click (left button, not panning): the snapped point, the size of one screen pixel in drawing units, and whether
   * Shift was held. */
  onClick?: (at: Pt, pixel: number, shift?: boolean) => void;
  /** Numbers are being typed on the command line (a tool is running, or something is typed there): 0 and − go there
   * rather than fit or zoom the view. */
  numbersTyped?: boolean;
  /** A left drag picks with a window (Select): its corners (drawing units, absolute), `crossing` when dragged right to
   * left, `add` with Shift held. */
  windowSelect?: boolean;
  onWindow?: (a: Pt, b: Pt, crossing: boolean, add: boolean) => void;
  /** A right click: the point (not snapped), one pixel in drawing units, and where on the canvas (CSS pixels). */
  /** A right click (`shift` held: the command menu even when the prompt has no options). */
  onContext?: (at: Pt, pixel: number, screen: Pt, shift: boolean) => void;
  /** PAN: the left button pans too (as the middle one does). */
  panLeft?: boolean;
  /** A left double-click (the wheel's still fits the view): where, in drawing units, and a pixel's size there. */
  onDouble?: (at: Pt, pixel: number) => void;
  /** HTML over the drawing (the device toolbar): given drawing units → canvas pixels, and whether a window is being
   * dragged or the view panned (it hides meanwhile). */
  overlay?: (toScreen: (p: Pt) => Pt, moving: boolean) => ReactNode;
  marks?: CadMarks | null;
  /** Segments of the objects picked (start, end each), drawn highlighted. */
  highlight?: [number, number][];
  devices?: CanvasDevice[];
  wiring?: CanvasWiring[];
  /** What the engineer drew (drawing units), the one selected, and their snap points. */
  sketch?: SketchItem[];
  /** Drawing units per millimetre, for the width of tray runs. */
  unitsPerMm?: number;
  /** Labels of drawn items by ID (a cable route's cable), shown along them. */
  labels?: Record<string, string>;
  /** ELV coverage (drawing units): what each device covers, cut at its room, and the squares not covered. */
  covers?: PlanCover[];
  gaps?: PlanCells;
  /** The drawn object(s) selected: one ID, or several. */
  selectedSketch?: string | string[] | null;
  /** Grips of the drawn objects picked (drawing units), each a square, a bar turned along `along` (a side's middle) or a
   * diamond (a size): pressed and dragged, they reach the page on release. `hotGrip`: the index of the one clicked. */
  grips?: { at: Pt; shape?: 'square' | 'bar' | 'diamond'; along?: Pt }[];
  hotGrip?: number;
  /** Ids of the objects of the opened drawing that are picked (their texts get the picked box). */
  pickedObjects?: number[];
  onGripStart?: (i: number) => void;
  /** A grip let go: where (`moved` false: pressed and let go in place, a click on it). */
  onGripEnd?: (i: number, at: Pt, moved?: boolean) => void;
  /** Layer manager styles by layer name (src/model/cadLayerStyle.ts): a screen colour for the drawing's layers; for
   * what is drawn here also on/off, linetype and lineweight (an object's own wins). */
  layerStyle?: Record<string, LayerStyle>;
  /** Zoom extents in place of the drawing's (frozen layers left out, src/model/cadLayerState.ts). */
  extents?: [number, number, number, number];
  extraSnaps?: { x: number; y: number; kind: number }[];
  /** References under the plan (src/model/cadRefs.ts): their lines (drawing units, absolute) with each line's layer,
   * the screen colour of each layer, and how faded they show (%). Drawn under the drawing; never picked. */
  refs?: { segs: Float64Array; segLayers: Uint16Array; colours: (string | number)[]; fade: number }[];
  /** Edit in place (REFEDIT): the drawn objects being edited (their ids); the drawing, its references and every other
   * drawn object show faded. */
  fadeExcept?: Set<string>;
  /** The nearest snap point of the references within `r` (drawing units, absolute). */
  refSnap?: (x: number, y: number, r: number) => { p: Pt; kind: number } | undefined;
  /** The object being drawn, following the cursor (drawn on the cursor layer). */
  preview?: SketchItem[];
  /** Changes to fit the drawing to the window. */
  fitKey: number;
  /** A layout's viewport (src/model/planViewports.ts): the drawing shows exactly this window (drawing units, absolute:
   * x0, y0, x1, y1), not where it was left; `fixed` (a locked viewport) leaves pan and zoom off; else each pan or zoom
   * reports the centre (drawing units, absolute) and the pixels per drawing unit. */
  fitBox?: [number, number, number, number];
  fixed?: boolean;
  onView?: (centre: Pt, pxPerUnit: number) => void;
  /** ZOOM Window / Scale / Previous (the model view only), and the zoom chip's menu. */
  zoom?: ZoomReq;
  onZoomMenu?: (k: ZoomMenuKey) => void;
  /** The cursor in drawing units (absolute), snapped, the snap kind's name, and one screen pixel in drawing units. */
  onCursor: (at: Pt | null, snapName?: string, pixel?: number) => void;
  /** Drafting settings (DS): snap modes and spacing, grid, polar angles, aperture, cursor and grip sizes. */
  draft?: DraftSettings;
  /** What the canvas waits for: no command (crosshair and pick box), a point (crosshair only), objects (pick box only). */
  cursorMode?: CursorMode;
  /** The object under the pick box, highlighted (the page finds it, as a click would). */
  hover?: CadHover;
  /** Trim before the click: the pieces a click would cut away, faded (each in its own colour, dashed, over a band in the
   * canvas colour that hides the line under it). Extend: where the new length shown in `preview` meets the line ahead
   * (`meets`, a small cross). Either takes the place of the hover mark. */
  cutAway?: SketchItem[];
  meets?: Pt[];
  /** Devices on the move (Move, Copy, Rotate, Stretch): their own symbol at 45 % where the click would put them, drawn
   * on the cursor layer so the plan is not redrawn on each move. */
  shadowDevices?: CanvasDevice[];
  /** Stretch: the points its window caught, which will move — squares in the grip look (not grips: a click there is
   * the base point). */
  movingPoints?: Pt[];
  /** How drawn points are shown (PTYPE). */
  pointStyle?: PointStyle;
  /** The drawing's own blocks: an insert among the drawn objects is drawn as what its block shows. */
  blocks?: CadBlockDef[];
  /** A block dragged from the Blocks palette dropped on the drawing: where, and its name. */
  onDrop?: (at: Pt, name: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [t, setT] = useState<ViewT>({ scale: 1, ox: 0, oy: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // The drawn objects with each insert replaced by what its block shows; a block's object carries the insert's id first.
  const sketch = useMemo(() => expandAll(sketchIn, blocks).map((it) => (it.kind === 'attdef' ? attdefAsText(it) : it)), [sketchIn, blocks]);
  const isSel = (id0: string) => { const id = id0.split(':')[0]; return Array.isArray(selectedSketch) ? selectedSketch.includes(id) : id === selectedSketch; };
  // A grip being dragged (its index), and the grips as last drawn.
  const gripping = useRef<number | null>(null);
  /** Where (screen px) the grip being dragged was pressed: let go there, it was clicked, not moved. */
  const gripFrom = useRef<[number, number] | null>(null);
  const gripsRef = useRef(grips);
  gripsRef.current = grips;
  const hotGripRef = useRef(hotGripIn);
  hotGripRef.current = hotGripIn;
  // A window being dragged (canvas pixels); `on` once it has moved far enough not to be a click.
  const win = useRef<{ x: number; y: number; x2: number; y2: number; on: boolean } | null>(null);
  const [moving, setMoving] = useState(false);
  const space = useSpaceHeld(); // Space + drag pans with any tool
  // The hand while panning: open while Space is held or the Pan tool is on, closed while dragging; no crosshair then.
  // Shift held: a + (or −) at the pick box when a click would add the object under it (or take it off).
  const [spaceOn, setSpaceOn] = useState(false), [shiftOn, setShiftOn] = useState(false), [panning, setPanning] = useState(false);
  useEffect(() => {
    const field = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, button, [contenteditable="true"]');
    const key = (on: boolean) => (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftOn(on);
      if (e.code === 'Space' && (!on || !field(e))) setSpaceOn(on);
    };
    const down = key(true), up = key(false), blur = () => { setSpaceOn(false); setShiftOn(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  const hand = panning ? 'grabbing' : panLeft || spaceOn ? 'grab' : undefined;
  const handRef = useRef(hand);
  handRef.current = hand;
  const shiftRef = useRef(shiftOn);
  shiftRef.current = shiftOn;
  // The cursor still for half a second (the name tag waits for it); any move starts the wait again.
  const [still, setStill] = useState(false);
  const stillTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stillRef = useRef(false);
  const waitStill = () => { stillRef.current = false; setStill(false); clearTimeout(stillTimer.current); stillTimer.current = setTimeout(() => { stillRef.current = true; setStill(true); }, 500); };
  useEffect(() => () => clearTimeout(stillTimer.current), []);
  const mouse = useRef<Pt | null>(null);
  const lastAt = useRef<Landing | null>(null);
  // Object snap tracking (OTRACK): snap points acquired by resting the cursor on them (again: let go), the newest last.
  const acquired = useRef<Pt[]>([]);
  const resting = useRef<{ p: Pt; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => { acquired.current = []; }, [view]);
  useEffect(() => () => { if (resting.current) clearTimeout(resting.current.timer); }, []);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const modeRef = useRef(cursorMode);
  modeRef.current = cursorMode;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const cutRef = useRef(cutAway), meetsRef = useRef(meets), shadowDevRef = useRef(shadowDevices), movingRef = useRef(movingPoints);
  cutRef.current = cutAway; meetsRef.current = meets; shadowDevRef.current = shadowDevices; movingRef.current = movingPoints;
  const [o0, o1] = view.info.origin;
  // Colours are read from CSS on each draw, so a palette or mode change redraws.
  const [theme, setTheme] = useState(screenAppearance);
  useEffect(() => onScreenThemeChange(() => setTheme(screenAppearance())), []);

  // Lines batched per layer, colour, linetype and tile of the drawing (so what is off screen is not drawn), in drawing
  // units relative to the origin; a segment that goes on from the last one continues its path (dashes run on).
  const gone = useMemo(() => {
    if (!hidden?.ranges.length) return null;
    const segs = new Uint8Array(view.segLayers.length);
    for (const [a, z] of hidden.ranges) segs.fill(1, a, z);
    return { segs, objects: new Set(hidden.objects) };
  }, [view, hidden]);
  const batches = useMemo(() => {
    const [e0, e1, e2, e3] = view.info.extents;
    return lineBatches(view.segs, view.segLayers, view.segColors, view.segLinetypes, [e0 - o0, e1 - o1, e2 - o0, e3 - o1], () => new Path2D(), gone?.segs);
  }, [view, gone, o0, o1]);
  // A large drawing also gets a zoomed-out copy: runs of short segments with fewer corners, drawn while each step left
  // out is under half a pixel (snaps and picks always use every segment).
  const coarse = useMemo(() => {
    if (view.segLayers.length < COARSE_FROM) return null;
    const [e0, e1, e2, e3] = view.info.extents, step = Math.max(e2 - e0, e3 - e1) / 4000;
    return step > 0 ? { step, batches: lineBatches(view.segs, view.segLayers, view.segColors, view.segLinetypes, [e0 - o0, e1 - o1, e2 - o0, e3 - o1], () => new Path2D(), gone?.segs, step) } : null;
  }, [view, gone, o0, o1]);
  // References: a path per reference and layer, relative to the origin.
  const refPaths = useMemo(() => refs.map((r) => {
    const by = new Map<number, Path2D>();
    for (let i = 0; i < r.segLayers.length; i += 1) {
      let p = by.get(r.segLayers[i]);
      if (!p) { p = new Path2D(); by.set(r.segLayers[i], p); }
      p.moveTo(r.segs[i * 4] - o0, r.segs[i * 4 + 1] - o1); p.lineTo(r.segs[i * 4 + 2] - o0, r.segs[i * 4 + 3] - o1);
    }
    return { alpha: 1 - Math.min(90, Math.max(0, r.fade)) / 100, layers: [...by].map(([l, path]) => ({ path, colour: r.colours[l] ?? INK })) };
  }), [refs, o0, o1]);
  // Filled areas (solid hatches and 2D solids, pattern hatches): their boundary paths and boxes, relative to the origin.
  const fills = useMemo(() => (view.info.fills ?? []).filter((f) => !gone || !f.loops.some(([a]) => gone.segs[a])).map((f) => {
    const path = new Path2D();
    let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [a, z] of f.loops) {
      for (let i = a; i < z; i += 1) {
        const [x1, y1, x2, y2] = [view.segs[i * 4], view.segs[i * 4 + 1], view.segs[i * 4 + 2], view.segs[i * 4 + 3]];
        if (i === a) path.moveTo(x1, y1);
        path.lineTo(x2, y2);
        box = [Math.min(box[0], x1, x2), Math.min(box[1], y1, y2), Math.max(box[2], x1, x2), Math.max(box[3], y1, y2)];
      }
      path.closePath();
    }
    return { ...f, path, box };
  }), [view, gone]);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit (on open, on Fit / ZE, and when the window size changes before anything was moved); a moved drawing goes back
  // to where it was left.
  const fitted = useRef(fitKey);
  // Read on a fit only: freezing a layer does not move the view.
  const fitExt = useRef(extents);
  fitExt.current = extents;
  const [b0, b1, b2, b3] = fitBox ?? [];
  useEffect(() => {
    if (b0 !== undefined) {
      const scale = Math.min(size.w / Math.max(1e-9, b2! - b0), size.h / Math.max(1e-9, b3! - b1!));
      setT({ scale, ox: (b0 + b2!) / 2 - o0 - size.w / 2 / scale, oy: (b1! + b3!) / 2 - o1 - size.h / 2 / scale });
      return;
    }
    if (fitted.current !== fitKey) { fitted.current = fitKey; placeOf.delete(view); }
    const [x0, y0, x1, y1] = fitExt.current ?? view.info.extents;
    const scale = Math.min(size.w / Math.max(1e-9, x1 - x0), size.h / Math.max(1e-9, y1 - y0)) * 0.92;
    setT(placeOf.get(view) ?? { scale, ox: (x0 + x1) / 2 - o0 - size.w / 2 / scale, oy: (y0 + y1) / 2 - o1 - size.h / 2 / scale });
  }, [view, fitKey, size.w, size.h, o0, o1, b0, b1, b2, b3]);
  /** A zoom or pan by the user: the drawing stays there (in a viewport: none when locked, else reported). */
  const moved = useRef(false);
  const move = (to: (v: ViewT) => ViewT) => {
    if (fixed) return;
    moved.current = true;
    setT((v) => { const next = to(v); if (b0 === undefined) placeOf.set(view, next); return next; });
  };
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  useEffect(() => {
    if (!moved.current || b0 === undefined) return;
    moved.current = false;
    onViewRef.current?.([t.ox + o0 + size.w / 2 / t.scale, t.oy + o1 + size.h / 2 / t.scale], t.scale);
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps -- reports the user's moves only

  const css = () => getComputedStyle(host.current ?? document.documentElement);
  const colour = (name: string, fallback: string) => css().getPropertyValue(name).trim() || fallback;

  // The drawing (redrawn when the view, layers or zoom change).
  useEffect(() => {
    const c = base.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
    const bg = colour('--cad-bg', BG), ink = colour('--cad-ink', '#E6E8EB');
    // Stored colours too faint on this background are drawn lighter or darker (each worked out once per draw).
    const bgRgb = cssRgb(bg), shown = new Map<number, string>();
    // A layer given a colour in the layer manager shows in it.
    const layerColour: Record<number, string> = {};
    view.info.layers.forEach((l, i) => { const c = colourCss(styleOf(layerStyle, l.name).color); if (c) layerColour[i] = c; });
    const shade = (rgb: number) => {
      if (rgb === INK) return ink;
      let v = shown.get(rgb);
      if (!v) { v = bgRgb ? screenColour(rgb, bgRgb) : hex(rgb); shown.set(rgb, v); }
      return v;
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    const { scale, ox, oy } = t;
    if (toggles.grid) {
      // Grid lines (or dots at the crossings): fine every step, stronger every fifth (in drawing units relative to the origin).
      // The spacing set (DS, Snap & grid), shown when its lines are at least 4 px apart; else adapting to the zoom.
      const set = draft.gridMm * unitsPerMm;
      const step = set > 0 && set * scale >= 4 ? set : gridStep(scale);
      const every = draft.gridMajor;
      const minor = colour('--cad-grid', '#16223a'), major = colour('--cad-grid-major', '#20304f');
      const x0 = Math.floor(ox / step), y0 = Math.floor(oy / step);
      ctx.lineWidth = Math.max(1, dpr * 0.5);
      if (gridDots) {
        for (let i = x0; i * step < ox + size.w / scale; i += 1) {
          const sx = Math.round((i * step - ox) * scale * dpr);
          for (let j = y0; j * step < oy + size.h / scale; j += 1) {
            const sy = Math.round((size.h - (j * step - oy) * scale) * dpr), big = i % every === 0 && j % every === 0, r = Math.max(1, Math.round(dpr * (big ? 1.5 : 1)));
            ctx.fillStyle = big ? major : minor;
            ctx.fillRect(sx - r, sy - r, 2 * r, 2 * r);
          }
        }
      }
      for (let i = x0; !gridDots && i * step < ox + size.w / scale; i += 1) {
        const sx = Math.round((i * step - ox) * scale * dpr) + 0.5;
        ctx.strokeStyle = i % every === 0 ? major : minor;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, c.height); ctx.stroke();
      }
      for (let j = y0; !gridDots && j * step < oy + size.h / scale; j += 1) {
        const sy = Math.round((size.h - (j * step - oy) * scale) * dpr) + 0.5;
        ctx.strokeStyle = j % every === 0 ? major : minor;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(c.width, sy); ctx.stroke();
      }
    }
    ctx.setTransform(dpr * scale, 0, 0, -dpr * scale, -dpr * ox * scale, dpr * (size.h + oy * scale));
    // What is on screen (drawing units relative to the origin), with a pixel of margin.
    const vx0 = ox - 2 / scale, vy0 = oy - 2 / scale, vx1 = ox + (size.w + 2) / scale, vy1 = oy + (size.h + 2) / scale;
    const onScreen = (bx: [number, number, number, number]) => bx[2] >= vx0 && bx[0] <= vx1 && bx[3] >= vy0 && bx[1] <= vy1;
    const px = 1 / scale;
    // References first, faded, under everything of the drawing.
    ctx.lineWidth = px;
    const fa = fadeExcept ? 0.35 : 1;
    for (const r of refPaths) {
      ctx.globalAlpha = r.alpha * fa;
      for (const l of r.layers) { ctx.strokeStyle = typeof l.colour === 'string' ? l.colour : shade(l.colour); ctx.stroke(l.path); }
    }
    ctx.globalAlpha = fa;
    // Hatches under the lines: solid ones filled; pattern lines clipped to the boundary, or a light fill when they would
    // be closer than 3 pixels (or too many to draw).
    for (const f of fills) {
      if (!layersOn[f.layer] || !onScreen(f.box)) continue;
      const col = shade(f.rgb);
      if (f.solid) { ctx.fillStyle = col; ctx.fill(f.path, 'evenodd'); continue; }
      const families = f.lines.map((l) => ({ l, lines: hatchLines({ angle: l.angle, base: [l.base[0] - o0, l.base[1] - o1], offset: l.offset }, f.box, 3 * px) }));
      ctx.save();
      ctx.clip(f.path, 'evenodd');
      if (!families.length || families.some((x) => !x.lines.length)) {
        ctx.globalAlpha = 0.18 * fa; ctx.fillStyle = col; ctx.fill(f.path, 'evenodd'); ctx.globalAlpha = fa;
      } else {
        ctx.strokeStyle = col; ctx.lineWidth = px;
        for (const { l, lines } of families) {
          const dash = dashArray(l.dashes, px), len = patternLength(dash);
          ctx.setLineDash(dash.length && len * scale >= 4 ? dash : []);
          ctx.beginPath();
          for (const x of lines) { ctx.lineDashOffset = len ? ((x.phase % len) + len) % len : 0; ctx.moveTo(x.a[0], x.a[1]); ctx.lineTo(x.b[0], x.b[1]); }
          ctx.stroke();
        }
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      ctx.restore();
    }
    ctx.lineWidth = px;
    // The selection colour (Drafting settings → Selection) and the look of what is picked.
    const look = draft.pickLook;
    const selSk = draft.selColor === 'accent' ? colour('--acc', ink) : draft.selColor === 'cyan' ? colour('--res-cur', ink) : draft.selColor === 'green' ? colour('--cad-snap', ink) : colour('--cad-sel', ink);
    /** The current path stroked as a drawn object: picked, in its own colour dashed over a halo (or thicker in the
     * selection colour, or dashed only); else plainly. Leaves the stroke colour set for what follows. */
    const strokeObject = (sel: boolean, own: string, w: number, ia: number, dash: number[]) => {
      if (sel && look === 'halo') {
        ctx.globalAlpha = 0.35 * ia; ctx.strokeStyle = selSk; ctx.lineWidth = 6 / scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]); ctx.stroke();
        ctx.globalAlpha = ia; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      }
      ctx.strokeStyle = sel && look === 'thick' ? selSk : own;
      ctx.lineWidth = sel && look === 'thick' ? 3 / scale : w;
      ctx.setLineDash(sel && look !== 'thick' ? [6 / scale, 4 / scale] : dash);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    /** The box round a picked text or note (screen pixels, 3 px clear all round): the selection colour faint inside, a dashed outline. */
    const pickBox = (x: number, y: number, w: number, h: number) => {
      const a = ctx.globalAlpha;
      ctx.fillStyle = selSk; ctx.globalAlpha = a * 0.18; ctx.fillRect(x - 3, y - 3, w + 6, h + 6); ctx.globalAlpha = a;
      ctx.strokeStyle = selSk; ctx.lineWidth = look === 'thick' ? 2 : 1; ctx.setLineDash(look === 'thick' ? [] : [4, 3]); ctx.strokeRect(x - 3, y - 3, w + 6, h + 6); ctx.setLineDash([]);
    };
    // What is picked of the opened drawing: its halo under the layers' lines, its gaps (the halo's colour, or the
    // background's) over them after.
    let hp: Path2D | null = null;
    if (highlight?.some(([a, z]) => z > a)) {
      hp = new Path2D();
      for (const [a, z] of highlight) for (let i = a; i < z; i += 1) { hp.moveTo(view.segs[i * 4], view.segs[i * 4 + 1]); hp.lineTo(view.segs[i * 4 + 2], view.segs[i * 4 + 3]); }
      if (look === 'halo') {
        ctx.globalAlpha = 0.35 * fa; ctx.strokeStyle = selSk; ctx.lineWidth = 6 / scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(hp);
        ctx.globalAlpha = fa; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      }
    }
    const dashes = view.info.linetypes ?? [];
    for (const b of coarse && coarse.step * scale <= 0.5 ? coarse.batches : batches) {
      if (!layersOn[b.layer] || !onScreen(b.box)) continue;
      ctx.strokeStyle = layerColour[b.layer] ?? shade(b.rgb);
      // A linetype too fine to see at this zoom (repeat under 4 pixels) is drawn continuous, as CAD does.
      const dash = b.lt ? dashArray(dashes[b.lt] ?? [], px) : [];
      ctx.setLineDash(dash.length && patternLength(dash) * scale >= 4 ? dash : []);
      ctx.stroke(b.path);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (hp) {
      if (look === 'thick') { ctx.strokeStyle = selSk; ctx.lineWidth = 3 / scale; ctx.stroke(hp); }
      else {
        // Drawn dashed: 6 px of the line, 4 px painted over.
        ctx.strokeStyle = look === 'halo' ? mixCss(bg, selSk, 0.35) : bg; ctx.lineWidth = 2 / scale;
        ctx.setLineDash([4 / scale, 6 / scale]); ctx.lineDashOffset = -6 / scale; ctx.stroke(hp); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
    }
    // ELV coverage: circles and camera views cut at their room, then the squares not covered.
    const bad = colour('--bad', '#ff5d6c');
    if (covers.length || gaps?.at.length) {
      const cov = colour('--cad-elv', '#4aa8ff');
      const poly = (pts: Pt[]) => { const q = new Path2D(); q.moveTo(pts[0][0] - o0, pts[0][1] - o1); for (const v of pts.slice(1)) q.lineTo(v[0] - o0, v[1] - o1); q.closePath(); return q; };
      for (const c of covers) {
        const [x, y] = [c.at[0] - o0, c.at[1] - o1];
        ctx.save();
        if (c.clip && c.clip.length >= 3) ctx.clip(poly(c.clip));
        ctx.fillStyle = cov;
        if (c.cone) {
          const a = (c.cone.rotationDeg * Math.PI) / 180, half = (c.cone.fovDeg * Math.PI) / 360;
          [...c.cone.bands].reverse().forEach((r, i, all) => {
            ctx.globalAlpha = 0.08 * (i + 1) + (i === all.length - 1 ? 0.04 : 0);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a - half, a + half); ctx.closePath(); ctx.fill();
          });
        } else {
          ctx.globalAlpha = 0.12;
          ctx.beginPath(); ctx.arc(x, y, c.r, 0, 2 * Math.PI); ctx.fill();
          ctx.globalAlpha = 0.6; ctx.strokeStyle = cov; ctx.lineWidth = 1 / scale; ctx.setLineDash([5 / scale, 4 / scale]); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.restore();
      }
      if (gaps?.at.length) {
        ctx.globalAlpha = 0.35; ctx.fillStyle = bad;
        for (const [gx, gy] of gaps.at) ctx.fillRect(gx - o0 - gaps.size / 2, gy - o1 - gaps.size / 2, gaps.size, gaps.size);
        ctx.globalAlpha = 1;
      }
    }
    // What the engineer drew, over the drawing; a tray run as one heavier line, broken at its label when the label shows.
    const { fittings } = trayFittings(sketch, unitsPerMm);
    const skC = colour('--cad-sketch', '#7fd1ff');
    const trayH = TRAY_TEXT_MM * unitsPerMm, trayText = trayH * scale >= 4;
    const ltScale = 100 * unitsPerMm; // linetype dashes in paper mm at 1:100
    const emK = emPerCap(ctx, FONT), widths = widthsOf.get(view) ?? new Map<string, number>();
    widthsOf.set(view, widths);
    /** A drawn object's words, in screen space: a note's lines, a text (its mask under it), a dimension's or a tray's or
     * cable's label. Called in the object's turn, so the draw order holds for words too. */
    // Always back to drawing units afterwards, also when the object has no words to show (else what is drawn after it
    // lands in screen pixels: fixed in size, its lines thickening as the view zooms out).
    const drawLabel = (it: SketchItem) => {
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textBaseline = 'alphabetic';
      try { drawWords(it); } finally { ctx.restore(); }
    };
    const drawWords = (it: SketchItem): void => {
      // A multileader's words are drawn as a note's.
      if (it.kind === 'mleader') { const n = mleaderNote(it); if (n) drawWords(n); return; }
      if (it.kind === 'mtext') {
        // A note: its lines from the top left of its box, each piece in its weight, underlined ones with a rule; the box
        // outlined while it is picked. Too small to read: a faint bar where each piece is.
        const nef = effective(it, layerStyle);
        if (nef.hidden) return;
        const b = noteBox(it);
        if (!(b.h * scale > 0)) return;
        ctx.save();
        ctx.translate((b.tl[0] - o0 - ox) * scale, size.h - (b.tl[1] - o1 - oy) * scale);
        ctx.rotate(-(it.rot ?? 0));
        ctx.fillStyle = nef.color ?? skC; ctx.textAlign = 'left';
        if (b.h * scale < READ_PX) {
          ctx.save(); ctx.globalAlpha *= BAR_ALPHA; ctx.beginPath();
          for (const line of b.lines) for (const seg of line.segs) textBar(ctx, seg.x * scale, line.y * scale, 0, seg.h * scale, seg.w * scale, 0);
          ctx.fill(); ctx.restore();
        } else for (const line of b.lines) for (const seg of line.segs) {
          // Its capitals at its height: the font no bigger than 200 px, scaled up past that.
          const em = seg.h * scale * emK, sp = Math.min(em, 200), up = em / sp;
          ctx.save(); ctx.translate(seg.x * scale, line.y * scale);
          if (up !== 1) ctx.scale(up, up);
          ctx.font = `${seg.b ? '700 ' : ''}${sp}px ${FONT}`;
          ctx.fillText(seg.s, 0, 0);
          if (seg.u) ctx.fillRect(0, sp * 0.12, (seg.w * scale) / up, Math.max(1 / up, sp * 0.06));
          ctx.restore();
        }
        if (isSel(it.id)) pickBox(0, 0, b.w * scale, b.H * scale);
        ctx.restore();
        return;
        }
        const label = it.kind === 'text' ? (() => { const b = textBaseAt(it); return { at: b.at, s: it.text ?? '', h: it.h ?? 0, rot: it.rot ?? 0, align: b.align as CanvasTextAlign }; })()
        : it.kind === 'dim' ? (() => { const d = dimOf(it, 0.001 / unitsPerMm); return { at: d.text, s: d.label, h: d.h, rot: d.angle, align: 'center' as CanvasTextAlign }; })()
        : it.tray ? (() => { const l = trayLabel(it); return { at: l.at, s: l.text, h: trayH, rot: l.rot, align: 'center' as CanvasTextAlign }; })()
        : it.cable && labels[it.id] ? (() => { const l = trayLabel(it); return { at: l.at, s: labels[it.id], h: 120 * unitsPerMm, rot: l.rot, align: 'center' as CanvasTextAlign }; })()
        : null;
        if (!label || !label.s) return;
        const lef = effective(it, layerStyle);
        if (lef.hidden) return;
        // Its capitals at its height, as CAD measures text (the font's em is emK times that).
        const cap = label.h * scale, em = cap * emK;
        if (!(cap > 0) || (it.tray && !trayText)) return;
        ctx.save();
        ctx.translate((label.at[0] - o0 - ox) * scale, size.h - (label.at[1] - o1 - oy) * scale);
        ctx.rotate(-label.rot);
        if (it.kind === 'text' && it.mask) {
        // The mask: its box in the background colour, under the text (over the lines and hatches drawn before).
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = bg; ctx.beginPath();
        textCorners(it).forEach((q, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (q[0] - o0 - ox) * scale, size.h - (q[1] - o1 - oy) * scale));
        ctx.closePath(); ctx.fill(); ctx.restore();
        }
        ctx.textAlign = label.align;
        if (it.tray) ctx.textBaseline = 'middle'; // in the gap of the tray's line
        ctx.fillStyle = lef.color ?? skC;
        // A text picked: its box, as wide as the words are drawn.
        if (it.kind === 'text' && isSel(it.id)) {
          const w = widthPerPx(ctx, FONT, label.s, widths) * em, a = ctx.fillStyle;
          pickBox(label.align === 'center' ? -w / 2 : label.align === 'right' ? -w : 0, -cap, w, cap);
          ctx.fillStyle = a;
        }
        if (cap < READ_PX) {
          // Too small to read: a faint bar where the words are.
          ctx.globalAlpha *= BAR_ALPHA; ctx.beginPath();
          textBar(ctx, 0, 0, 0, cap, widthPerPx(ctx, FONT, label.s, widths) * em, label.align === 'center' ? 1 : label.align === 'right' ? 2 : 0);
          ctx.fill();
        } else {
          // The font no bigger than 200 px, scaled up past that so the words keep their shape as the view zooms in.
          const fpx = Math.min(em, 200), up = em / fpx;
          ctx.font = `${fpx}px ${FONT}`;
          if (up !== 1) ctx.scale(up, up);
          ctx.fillText(label.s, 0, 0);
        }
        ctx.restore();
    };
    // What the engineer drew, in its draw order (later on top): lines and hatches in drawing units, each object's words in its turn.
    for (const it of sketch) {
      const ef = effective(it, layerStyle);
      if (ef.hidden) continue;
      const ia = fadeExcept && !fadeExcept.has(it.id.split(':')[0]) ? 0.35 : 1;
      ctx.globalAlpha = ia;
      if ((it.kind === 'text' && !it.frame) || it.kind === 'mtext') { drawLabel(it); continue; } // a framed text's frame is drawn with the lines first
      if (it.kind === 'point') {
        // A point: its style's marker about it, sized to the screen or in drawing units (never under 3 pixels).
        const r = Math.max(pointRadius(pointStyle, size.h / scale), 1.5 / scale), mk = pointMark(pointStyle.mode), px0 = it.pts[0][0] - o0, py0 = it.pts[0][1] - o1;
        ctx.beginPath();
        for (const [a, b] of mk.lines) { ctx.moveTo(px0 + a[0] * r, py0 + a[1] * r); ctx.lineTo(px0 + b[0] * r, py0 + b[1] * r); }
        if (mk.circle) { ctx.moveTo(px0 + r, py0); ctx.arc(px0, py0, r, 0, 2 * Math.PI); }
        strokeObject(isSel(it.id), ef.color ?? skC, 1.5 / scale, ia, []);
        ctx.fillStyle = ctx.strokeStyle;
        if (mk.dot) { ctx.beginPath(); ctx.arc(px0, py0, Math.max(r * 0.2, 2 / scale), 0, 2 * Math.PI); ctx.fill(); }
        continue;
      }
      if (it.hatch) {
        // A hatch: its outline filled solid (faint) or with its pattern's lines (or dots), clipped to the outline.
        const outline = new Path2D();
        if (it.kind === 'circle') outline.arc(it.pts[0][0] - o0, it.pts[0][1] - o1, it.r ?? 0, 0, 2 * Math.PI);
        else it.pts.forEach((q, i) => (i ? outline.lineTo(q[0] - o0, q[1] - o1) : outline.moveTo(q[0] - o0, q[1] - o1)));
        outline.closePath();
        // Its islands are part of the same path: filled and clipped even-odd, so they stay clear.
        for (const h of it.holes ?? []) { h.forEach((q, i) => (i ? outline.lineTo(q[0] - o0, q[1] - o1) : outline.moveTo(q[0] - o0, q[1] - o1))); outline.closePath(); }
        const col = ef.color ?? skC;
        ctx.save();
        ctx.clip(outline, 'evenodd');
        const xs = it.kind === 'circle' ? [it.pts[0][0] - (it.r ?? 0), it.pts[0][0] + (it.r ?? 0)] : it.pts.map((q) => q[0]);
        const ys = it.kind === 'circle' ? [it.pts[0][1] - (it.r ?? 0), it.pts[0][1] + (it.r ?? 0)] : it.pts.map((q) => q[1]);
        const bx: [number, number, number, number] = [Math.min(...xs) - o0, Math.min(...ys) - o1, Math.max(...xs) - o0, Math.max(...ys) - o1];
        const perMm = 100 * unitsPerMm;
        if (defOf(it.hatch).solid) { ctx.globalAlpha = 0.3 * ia; ctx.fillStyle = col; ctx.fill(outline, 'evenodd'); ctx.globalAlpha = ia; }
        else {
          // Each line family: dots as small squares, else lines (dashed when the dashes are 4 pixels or more).
          const dsz = 2 / scale;
          ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1 / scale;
          for (const f of atOrigin(placedLines(it.hatch, perMm), it.hatch.origin ? [it.hatch.origin[0] - o0, it.hatch.origin[1] - o1] : undefined)) {
            if (dotsOnly(f)) { for (const [x, y] of hatchDots(f, bx, 3 / scale, 40000)) ctx.fillRect(x - dsz / 2, y - dsz / 2, dsz, dsz); continue; }
            const { lines, dash } = hatchStrokes(f, bx, 3 / scale, 1500, 1 / scale);
            ctx.setLineDash(dash.length && patternLength(dash) * scale >= 4 ? dash : []);
            ctx.beginPath();
            for (const l of lines) { ctx.moveTo(l.a[0], l.a[1]); ctx.lineTo(l.b[0], l.b[1]); }
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
        ctx.restore();
        if (!isSel(it.id)) continue; // a hatch shows its outline only when picked, with the selection colour faint inside
        ctx.globalAlpha = 0.15 * ia; ctx.fillStyle = selSk; ctx.fill(outline, 'evenodd'); ctx.globalAlpha = ia;
      }
      ctx.beginPath();
      if (it.tray) for (const q of trayText ? trayLine(it, trayH).pieces : [it.pts]) q.forEach((p, i) => (i ? ctx.lineTo(p[0] - o0, p[1] - o1) : ctx.moveTo(p[0] - o0, p[1] - o1)));
      else if (it.infinite) {
        const s = constructionSegment(it, [vx0 + o0, vy0 + o1, vx1 + o0, vy1 + o1]);
        if (s) { ctx.moveTo(s[0][0] - o0, s[0][1] - o1); ctx.lineTo(s[1][0] - o0, s[1][1] - o1); }
      }
      else for (const [a, b] of segmentsOf(it, 0.001 / unitsPerMm)) { ctx.moveTo(a[0] - o0, a[1] - o1); ctx.lineTo(b[0] - o0, b[1] - o1); }
      // A cable route is dashed; so is a linetype that shows at this zoom.
      const dash = it.cable ? [10 / scale, 5 / scale] : ef.dash.length && ef.dash.reduce((t, v) => t + v, 0) * ltScale * scale >= 4 ? ef.dash.map((v) => v * ltScale) : [];
      strokeObject(isSel(it.id), ef.color ?? skC, (ef.lw && toggles.lwt !== false ? Math.max(1.5, ef.lw * 6) : it.tray ? 2.5 : 1.5) / scale, ia, dash);
      if (it.leader && it.pts.length > 1) {
        // The leader's arrow at its first point, 3 mm long on paper at 1:100.
        const [a, b] = [it.pts[0], it.pts[1]], ang = Math.atan2(a[1] - b[1], a[0] - b[0]), hd = 3 * ltScale;
        ctx.beginPath(); ctx.moveTo(a[0] - o0, a[1] - o1);
        ctx.lineTo(a[0] - o0 - hd * Math.cos(ang - 0.3), a[1] - o1 - hd * Math.sin(ang - 0.3));
        ctx.lineTo(a[0] - o0 - hd * Math.cos(ang + 0.3), a[1] - o1 - hd * Math.sin(ang + 0.3));
        ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      }
      drawLabel(it);
    }
    ctx.globalAlpha = 1;
    // Circuit wiring: arcs in the devices' colour, the home run ending in an arrow at the DB.
    const lvC = colour('--cad-dev', '#f5c04a');
    if (wiring.length) {
      ctx.strokeStyle = lvC; ctx.fillStyle = lvC;
      ctx.lineWidth = 1.3 / scale;
      ctx.beginPath();
      for (const w of wiring) for (const a of [...w.arcs, ...(w.home ? [w.home] : [])]) { ctx.moveTo(a.a[0] - o0, a.a[1] - o1); ctx.quadraticCurveTo(a.c[0] - o0, a.c[1] - o1, a.b[0] - o0, a.b[1] - o1); }
      ctx.stroke();
      const head = 9 / scale;
      for (const w of wiring) {
        if (!w.home) continue;
        const { b, c } = w.home, ang = Math.atan2(b[1] - c[1], b[0] - c[0]);
        ctx.beginPath(); ctx.moveTo(b[0] - o0, b[1] - o1);
        ctx.lineTo(b[0] - o0 - head * Math.cos(ang - 0.4), b[1] - o1 - head * Math.sin(ang - 0.4));
        ctx.lineTo(b[0] - o0 - head * Math.cos(ang + 0.4), b[1] - o1 - head * Math.sin(ang + 0.4));
        ctx.closePath(); ctx.fill();
      }
    }
    // Devices placed in the app: symbols in drawing units (they zoom with the plan), letters and labels below.
    const elvC = colour('--cad-elv', '#4aa8ff'), selC = colour('--cad-snap', '#37d67a');
    for (const d of devices) {
      const x = d.x - o0, y = d.y - o1;
      ctx.strokeStyle = d.selected ? selC : d.elv ? elvC : lvC;
      ctx.lineWidth = (d.selected ? 3 : 1.5) / scale;
      ctx.globalAlpha = d.ghost ? 0.45 : 1; // a Fill room preview
      strokeDevice(ctx, d, x, y);
    }
    ctx.globalAlpha = 1;
    // Texts in screen space, their capitals at the drawn height (as CAD measures text); too small to read (capitals
    // under READ_PX, or past 6000 words a draw): a faint bar where the words are, as CAD shows text zoomed out.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'alphabetic';
    const bars = new Map<string, Path2D>();
    const pickedTx = new Set(pickedObjects);
    let drawn = 0;
    for (const tx of view.info.texts) {
      if (!layersOn[tx.layer] || (gone && tx.o !== undefined && gone.objects.has(tx.o))) continue;
      const cap = tx.h * scale;
      if (!(cap > 0)) continue;
      const sx = (tx.x - o0 - ox) * scale, sy = size.h - (tx.y - o1 - oy) * scale;
      if (sx < -2000 || sx > size.w + 2000 || sy < -200 || sy > size.h + 200) continue;
      const em = cap * emK, fill = shade(tx.rgb);
      if (tx.o !== undefined && pickedTx.has(tx.o)) {
        // Picked: its box, as wide as the words are drawn (the bar, when too small to read).
        const w = tx.w ? tx.w * scale : widthPerPx(ctx, FONT, tx.s, widths) * em;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(-tx.rot); pickBox(tx.align === 1 ? -w / 2 : tx.align === 2 ? -w : 0, -cap, w, cap); ctx.restore();
      }
      if (cap < READ_PX || drawn >= 6000) {
        let bar = bars.get(fill);
        if (!bar) bars.set(fill, (bar = new Path2D()));
        textBar(bar, sx, sy, tx.rot, cap, tx.w ? tx.w * scale : widthPerPx(ctx, FONT, tx.s, widths) * em, tx.align);
        continue;
      }
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-tx.rot);
      // The font no bigger than 200 px, scaled up past that so the words keep their shape as the view zooms in.
      const fpx = Math.min(em, 200), up = em / fpx;
      ctx.font = `${fpx}px ${FONT}`;
      ctx.textAlign = tx.align === 1 ? 'center' : tx.align === 2 ? 'right' : 'left';
      ctx.fillStyle = fill;
      // Fitted between two points: squeezed or stretched to the width given.
      let kx = up;
      if (tx.w) { const nat = ctx.measureText(tx.s).width; if (nat > 0) kx = tx.w * scale / nat; }
      if (kx !== 1 || up !== 1) ctx.scale(kx, up);
      ctx.fillText(tx.s, 0, 0);
      ctx.restore();
      drawn += 1;
    }
    ctx.globalAlpha = BAR_ALPHA;
    for (const [fill, bar] of bars) { ctx.fillStyle = fill; ctx.fill(bar); }
    ctx.globalAlpha = 1;
    for (const d of devices) {
      if (d.r * scale < 4) continue;
      const sx = (d.x - o0 - ox) * scale, sy = size.h - (d.y - o1 - oy) * scale;
      ctx.fillStyle = d.selected ? selC : d.elv ? elvC : lvC;
      deviceText(ctx, d, sx, sy, scale);
    }
    // Wiring tags, at screen size beside the home run (in red when it has none).
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
    for (const w of wiring) {
      if (!w.tag) continue;
      ctx.fillStyle = w.tag.warn ? bad : lvC;
      ctx.fillText(w.tag.s, (w.tag.at[0] - o0 - ox) * scale + 6, size.h - (w.tag.at[1] - o1 - oy) * scale - 6);
    }
    // Tray fittings: a dot at the joint and its name beside it, its capitals 100 mm high (as Save DXF writes it) up to
    // 40 px.
    const fpx = 100 * unitsPerMm * scale;
    if (fpx >= 4) {
      ctx.fillStyle = skC;
      ctx.font = `${Math.min(fpx, 40) * emK}px ${FONT}`;
      ctx.textAlign = 'left';
      for (const f of fittings) {
        const sx = (f.at[0] - o0 - ox) * scale, sy = size.h - (f.at[1] - o1 - oy) * scale;
        ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 2 * Math.PI); ctx.fill();
        ctx.fillText(fittingLabel(f), sx + fpx * 1.2, sy - fpx * 1.2);
      }
    }
  }, [t, size, batches, coarse, fills, gone, layersOn, toggles.grid, toggles.lwt, draft.gridMm, draft.gridMajor, view, highlight, pickedObjects, draft.pickLook, draft.selColor, devices, wiring, sketch, selectedSketch, unitsPerMm, labels, covers, gaps, theme, gridDots, layerStyle, refPaths, pointStyle, fadeExcept]); // eslint-disable-line react-hooks/exhaustive-deps -- colours read from CSS each draw

  /** The cursor: crosshair and pick box, and the snap marker with its name. */
  function drawCursor(at: Pt | null, snap?: { p: Pt; kind: number }, guide?: Landing['guide']) {
    const ds = draftRef.current;
    const c = over.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Sized to the canvas on a change of height alone too, and cleared whole: rows left below a shorter canvas were never
    // cleared, so what crossed them while zooming (rubber bands, previews, grips) piled up as a smear along the bottom.
    const w = Math.round(size.w * dpr), h = Math.round(size.h * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { scale, ox, oy } = tRef.current;
    const snapC = colour('--cad-snap', '#37d67a');
    const mk = marksRef.current;
    if (mk && (mk.points.length || mk.live)) {
      const pts = mk.live && at ? [...mk.points, at] : mk.points;
      const scr = pts.map((p) => [(p[0] - o0 - ox) * scale, size.h - (p[1] - o1 - oy) * scale] as Pt);
      if (scr.length) {
        ctx.beginPath();
        ctx.moveTo(scr[0][0], scr[0][1]);
        for (const q of scr.slice(1)) ctx.lineTo(q[0], q[1]);
        if (mk.closed || (mk.area && scr.length > 2)) {
          ctx.closePath();
          ctx.globalAlpha = 0.2; ctx.fillStyle = snapC; ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = snapC; ctx.lineWidth = 2; ctx.stroke();
        for (const q of scr) { ctx.fillStyle = snapC; ctx.fillRect(q[0] - 2.5, q[1] - 2.5, 5, 5); }
        if (mk.label) {
          const q = scr[scr.length - 1];
          ctx.font = '600 13px system-ui, sans-serif';
          const w = ctx.measureText(mk.label).width + 12;
          ctx.fillStyle = colour('--panel', '#1D2024');
          ctx.fillRect(q[0] + 12, q[1] - 30, w, 20);
          ctx.fillStyle = snapC;
          ctx.fillText(mk.label, q[0] + 18, q[1] - 15);
        }
      }
    }
    const box = win.current;
    if (box?.on) {
      // The selection window: left to right picks what is inside (blue, solid), right to left what it crosses (green,
      // dashed); its name beside the cursor.
      const crossing = box.x2 < box.x;
      ctx.strokeStyle = crossing ? snapC : colour('--res-cur', snapC);
      ctx.lineWidth = 1;
      ctx.setLineDash(crossing ? [6, 4] : []);
      if (ds.windowFill) { ctx.globalAlpha = 0.12; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(Math.min(box.x, box.x2), Math.min(box.y, box.y2), Math.abs(box.x2 - box.x), Math.abs(box.y2 - box.y)); ctx.globalAlpha = 1; }
      ctx.strokeRect(Math.min(box.x, box.x2) + 0.5, Math.min(box.y, box.y2) + 0.5, Math.abs(box.x2 - box.x), Math.abs(box.y2 - box.y));
      ctx.setLineDash([]);
      tag(box.x2 + 12, box.y2 + 10, crossing ? 'Crossing' : 'Window');
    }
    // Grips; the one under the pick box (no command, or objects wanted) in the hover colour, and the box locks onto it.
    const underGrip = at && modeRef.current !== 'point' && mouse.current ? gripUnder(mouse.current[0], mouse.current[1]) : -1;
    const gripBg = colour('--cad-bg', BG), gripCol = ds.selColor === 'accent' ? colour('--acc', snapC) : ds.selColor === 'cyan' ? colour('--res-cur', snapC) : ds.selColor === 'green' ? snapC : colour('--cad-sel', snapC);
    gripsRef.current.forEach((g, i) => {
      const gx = Math.round((g.at[0] - o0 - ox) * scale), gy = Math.round(size.h - (g.at[1] - o1 - oy) * scale);
      ctx.fillStyle = i === hotGripRef.current || i === gripping.current ? colour('--bad', snapC) : i === underGrip ? colour('--warn', snapC) : gripCol;
      ctx.strokeStyle = gripBg; ctx.lineWidth = 1;
      if (!g.shape || g.shape === 'square') { const gh = ds.gripPx / 2; ctx.fillRect(gx - gh, gy - gh, ds.gripPx, ds.gripPx); ctx.strokeRect(gx - gh, gy - gh, ds.gripPx, ds.gripPx); return; }
      ctx.beginPath();
      if (g.shape === 'diamond') { const h = ds.gripPx * 0.6; ctx.moveTo(gx, gy - h); ctx.lineTo(gx + h, gy); ctx.lineTo(gx, gy + h); ctx.lineTo(gx - h, gy); ctx.closePath(); }
      else if (g.shape === 'bar') {
        // Long side along the side it moves (screen y is flipped).
        const a = g.along ? Math.atan2(-g.along[1], g.along[0]) : 0, hl = Math.round(ds.gripPx * 1.4) / 2, hs = Math.round(ds.gripPx * 0.6) / 2, cs = Math.cos(a), sn = Math.sin(a);
        ([[-hl, -hs], [hl, -hs], [hl, hs], [-hl, hs]] as Pt[]).forEach(([u, v], k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, gx + u * cs - v * sn, gy + u * sn + v * cs));
        ctx.closePath();
      }
      ctx.fill(); ctx.stroke();
    });
    for (const q of movingRef.current ?? []) {
      const gx = Math.round((q[0] - o0 - ox) * scale), gy = Math.round(size.h - (q[1] - o1 - oy) * scale), gh = ds.gripPx / 2;
      ctx.fillStyle = gripCol; ctx.strokeStyle = gripBg; ctx.lineWidth = 1;
      ctx.fillRect(gx - gh, gy - gh, ds.gripPx, ds.gripPx); ctx.strokeRect(gx - gh, gy - gh, ds.gripPx, ds.gripPx);
    }
    // What a click would pick: an amber outline at 40 % over it (not while a grip is under the box).
    const hv = hoverRef.current;
    if (ds.hoverMark && hv && !hv.picked && at && underGrip < 0 && modeRef.current !== 'point' && !handRef.current && !cutRef.current?.length && !meetsRef.current?.length) {
      ctx.save();
      ctx.globalAlpha = 0.4; ctx.strokeStyle = colour('--acc', snapC); ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      const scr = (p: Pt): Pt => [(p[0] - o0 - ox) * scale, size.h - (p[1] - o1 - oy) * scale];
      if (hv.seg) for (let i = hv.seg[0]; i < hv.seg[1]; i += 1) {
        const a = scr([view.segs[i * 4], view.segs[i * 4 + 1]]), b = scr([view.segs[i * 4 + 2], view.segs[i * 4 + 3]]);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      if (hv.sketch) {
        const box: [number, number, number, number] = [o0 + ox, o1 + oy, o0 + ox + size.w / scale, o1 + oy + size.h / scale];
        const infinite = constructionSegment(hv.sketch, box);
        for (const [a0, b0] of hv.sketch.infinite ? (infinite ? [infinite] : []) : segmentsOf(hv.sketch)) { const a = scr(a0), b = scr(b0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      }
      const d = hv.device ? devicesRef.current.find((x) => x.key === hv.device) : undefined;
      if (d) { const [dx, dy] = scr([d.x, d.y]), r = Math.max(d.r * scale, 6) + 3; ctx.moveTo(dx + r, dy); ctx.arc(dx, dy, r, 0, 2 * Math.PI); }
      ctx.stroke();
      ctx.restore();
    }
    // What a Trim click would cut away: hidden under a band in the canvas colour, then dashed in its own colour at 35 %.
    const sketchC = colour('--cad-sketch', '#7fd1ff');
    for (const it of cutRef.current ?? []) {
      const ef = effective(it, layerStyle), w = ef.lw && toggles.lwt !== false ? Math.max(1.5, ef.lw * 6) : it.tray ? 2.5 : 1.5;
      ctx.beginPath();
      for (const [a, b] of segmentsOf(it)) { ctx.moveTo((a[0] - o0 - ox) * scale, size.h - (a[1] - o1 - oy) * scale); ctx.lineTo((b[0] - o0 - ox) * scale, size.h - (b[1] - o1 - oy) * scale); }
      ctx.setLineDash([]); ctx.strokeStyle = colour('--cad-bg', BG); ctx.lineWidth = isSel(it.id) ? 8 : w + 3.5; ctx.stroke(); // a picked line's halo is 6 px
      ctx.globalAlpha = 0.35; ctx.strokeStyle = ef.color ?? sketchC; ctx.lineWidth = w; ctx.setLineDash([6, 4]); ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    }
    const pv = previewRef.current;
    if (pv.length) {
      ctx.strokeStyle = sketchC;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const box: [number, number, number, number] = [o0 + ox, o1 + oy, o0 + ox + size.w / scale, o1 + oy + size.h / scale];
      for (const it of pv) {
        const infinite = constructionSegment(it, box);
        for (const [a, b] of it.infinite ? (infinite ? [infinite] : []) : segmentsOf(it)) {
          ctx.moveTo((a[0] - o0 - ox) * scale, size.h - (a[1] - o1 - oy) * scale);
          ctx.lineTo((b[0] - o0 - ox) * scale, size.h - (b[1] - o1 - oy) * scale);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const sd = shadowDevRef.current;
    if (sd?.length) {
      const lvC = colour('--cad-dev', snapC), elvC = colour('--cad-elv', snapC);
      ctx.save(); ctx.globalAlpha = 0.45;
      ctx.setTransform(dpr * scale, 0, 0, -dpr * scale, -dpr * ox * scale, dpr * (size.h + oy * scale));
      for (const d of sd) { ctx.strokeStyle = d.elv ? elvC : lvC; ctx.lineWidth = 1.5 / scale; strokeDevice(ctx, d, d.x - o0, d.y - o1); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const d of sd) { ctx.fillStyle = d.elv ? elvC : lvC; deviceText(ctx, d, (d.x - o0 - ox) * scale, size.h - (d.y - o1 - oy) * scale, scale); }
      ctx.restore();
    }
    // Where an Extend click's new length meets the line ahead: a cross 8 px across.
    if (meetsRef.current?.length) {
      ctx.strokeStyle = snapC; ctx.lineWidth = 1.5; ctx.beginPath();
      for (const q of meetsRef.current) {
        const qx = (q[0] - o0 - ox) * scale, qy = size.h - (q[1] - o1 - oy) * scale;
        ctx.moveTo(qx - 4, qy - 4); ctx.lineTo(qx + 4, qy + 4); ctx.moveTo(qx + 4, qy - 4); ctx.lineTo(qx - 4, qy + 4);
      }
      ctx.stroke();
    }
    // Acquired points (OTRACK): a small cross at each.
    ctx.strokeStyle = snapC; ctx.lineWidth = 1;
    for (const q of acquired.current) {
      const qx = (q[0] - o0 - ox) * scale, qy = size.h - (q[1] - o1 - oy) * scale;
      ctx.beginPath(); ctx.moveTo(qx - 4, qy); ctx.lineTo(qx + 4, qy); ctx.moveTo(qx, qy - 4); ctx.lineTo(qx, qy + 4); ctx.stroke();
    }
    if (!at) return;
    const sx = (at[0] - o0 - ox) * scale, sy = size.h - (at[1] - o1 - oy) * scale;
    // Tracking: dotted lines from the point(s) tracked from to the cursor, and the angle.
    if (guide) {
      ctx.strokeStyle = snapC; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath();
      for (const q of guide.from) { ctx.moveTo((q[0] - o0 - ox) * scale, size.h - (q[1] - o1 - oy) * scale); ctx.lineTo(sx, sy); }
      ctx.stroke(); ctx.setLineDash([]);
      tag(sx + 12, sy - 30, guide.label);
    }
    // The crosshair (not while objects are wanted) and the pick box (not while a point is): 1 px lines over a 3 px
    // outline in the canvas colour, so they read over lines of any colour. The crosshair stops 2 px outside the box.
    if (handRef.current) return;
    const mode = modeRef.current;
    const lock = underGrip >= 0 ? gripsRef.current[underGrip]?.at : undefined;
    const [lx, ly] = lock ? [(lock[0] - o0 - ox) * scale, size.h - (lock[1] - o1 - oy) * scale] : [sx, sy];
    const cx = Math.round(lx) + 0.5, cy = Math.round(ly) + 0.5;
    const pb = ds.pickBoxPx, withBox = mode !== 'point';
    const gap = withBox ? pb / 2 + 2 : 0;
    // Across the view, or as long as the % set (DS, Cursor).
    const hx = ds.crossPct >= 100 ? Infinity : (Math.max(size.w, size.h) * ds.crossPct) / 200;
    const strokeCursor = (c: string, w: number) => {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath();
      if (mode !== 'objects') {
        const l = Math.max(0, cx - hx), r = Math.min(size.w, cx + hx), t = Math.max(0, cy - hx), b = Math.min(size.h, cy + hx);
        if (cx - gap > l) { ctx.moveTo(l, cy); ctx.lineTo(cx - gap, cy); }
        if (r > cx + gap) { ctx.moveTo(cx + gap, cy); ctx.lineTo(r, cy); }
        if (cy - gap > t) { ctx.moveTo(cx, t); ctx.lineTo(cx, cy - gap); }
        if (b > cy + gap) { ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, b); }
      }
      if (withBox) ctx.rect(cx - pb / 2, cy - pb / 2, pb, pb);
      ctx.stroke();
    };
    if (ds.cursorOutline) strokeCursor(colour('--cad-bg', BG), 3);
    const crossC = colour('--cad-cross', '#dbe4f5');
    strokeCursor(ds.crossColor === 'accent' ? colour('--acc', crossC) : ds.crossColor === 'cyan' ? colour('--res-cur', crossC) : crossC, 1);
    // Its kind and layer once the cursor has rested half a second on it (DS, Name tag after a pause).
    if (ds.hoverTag && stillRef.current && hv?.label && !lock) tag(cx + 12, cy - 28, hv.label);
    // Shift held with no command: + when a click would add the object under the box, − when it would take it off.
    if (shiftRef.current && mode === 'ready' && hv && !lock) {
      const bx = cx + pb / 2 + 2, by = cy - pb / 2 - 13;
      ctx.fillStyle = colour('--panel', BG); ctx.fillRect(bx, by, 11, 11);
      ctx.strokeStyle = colour('--line-strong', snapC); ctx.lineWidth = 1; ctx.strokeRect(bx, by, 11, 11);
      ctx.strokeStyle = hv.picked ? colour('--bad', snapC) : snapC; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx + 2.5, by + 5.5); ctx.lineTo(bx + 8.5, by + 5.5);
      if (!hv.picked) { ctx.moveTo(bx + 5.5, by + 2.5); ctx.lineTo(bx + 5.5, by + 8.5); }
      ctx.stroke();
    }
    if (!snap) return;
    const mx = (snap.p[0] - o0 - ox) * scale, my = size.h - (snap.p[1] - o1 - oy) * scale;
    ctx.beginPath();
    const r = ds.markerPx;
    if (snap.kind === SNAP.perpendicular) { ctx.moveTo(mx - r, my + r); ctx.lineTo(mx + r, my + r); ctx.moveTo(mx, my + r); ctx.lineTo(mx, my - r); }
    else if (snap.kind === SNAP.nearest) { ctx.moveTo(mx - r, my - r); ctx.lineTo(mx + r, my - r); ctx.lineTo(mx - r, my + r); ctx.lineTo(mx + r, my + r); ctx.closePath(); }
    else if (snap.kind === SNAP.endpoint || snap.kind === SNAP.insertion) ctx.rect(mx - r, my - r, 2 * r, 2 * r);
    else if (snap.kind === SNAP.midpoint) { ctx.moveTo(mx, my - r); ctx.lineTo(mx + r, my + r * 0.8); ctx.lineTo(mx - r, my + r * 0.8); ctx.closePath(); }
    else if (snap.kind === SNAP.center) ctx.arc(mx, my, r, 0, 2 * Math.PI);
    else if (snap.kind === SNAP.intersection) { ctx.moveTo(mx - r, my - r); ctx.lineTo(mx + r, my + r); ctx.moveTo(mx + r, my - r); ctx.lineTo(mx - r, my + r); }
    else { ctx.moveTo(mx, my - r); ctx.lineTo(mx + r, my); ctx.lineTo(mx, my + r); ctx.lineTo(mx - r, my); ctx.closePath(); }
    // A 2 px marker over a 4 px outline in the canvas colour.
    if (ds.cursorOutline) { ctx.strokeStyle = colour('--cad-bg', BG); ctx.lineWidth = 4; ctx.stroke(); }
    ctx.strokeStyle = colour('--cad-snap', '#37d67a'); ctx.lineWidth = 2; ctx.stroke();
    if (ds.snapTip) tag(mx + 12, my + 10, SNAP_NAMES[snap.kind] ?? '');
  }
  /** The grip under the pick box at a screen point (the nearest), or -1. */
  function gripUnder(x: number, y: number, v = tRef.current) {
    const r = pickRadiusPx(draftRef.current);
    let best = -1, bd = Infinity;
    gripsRef.current.forEach((q, i) => {
      const d = Math.max(Math.abs((q.at[0] - o0 - v.ox) * v.scale - x), Math.abs(size.h - (q.at[1] - o1 - v.oy) * v.scale - y));
      if (d <= r && d < bd) { best = i; bd = d; }
    });
    return best;
  }
  /** A small name tag on the cursor layer (the snap's, tracking's), its top-left at (x, y). */
  function tag(x: number, y: number, label: string) {
    const ctx = over.current?.getContext('2d');
    if (!ctx) return;
    ctx.font = '11px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = colour('--panel', '#1D2024');
    ctx.fillRect(x, y, w, 18);
    ctx.fillStyle = colour('--tx', '#dbe4f5');
    ctx.fillText(label, x + 5, y + 13);
  }

  const toWorld = (sx: number, sy: number, v = tRef.current): Pt => [o0 + v.ox + sx / v.scale, o1 + v.oy + (size.h - sy) / v.scale];
  /** The snap aperture (drawing units) at a zoom. */
  const aperture = (v: ViewT) => draftRef.current.aperturePx / v.scale;
  /** The last point picked by the tool in use, if any: perpendicular snaps and polar tracking start there. */
  const lastPicked = (): Pt | undefined => { const mk = marksRef.current; return mk?.live && mk.points.length ? mk.points[mk.points.length - 1] : undefined; };
  /** Where the cursor lands at a drawing point, given the engine's snap point there (`s`: [x, y, kind], or none). */
  const landing = (raw: Pt, v: ViewT, s: ArrayLike<number> | null): Landing => {
    let at = raw;
    let snap: { p: Pt; kind: number } | undefined;
    let guide: Landing['guide'];
    const ds = draftRef.current;
    if (toggles.osnap) {
      const r = aperture(v);
      if (s?.length === 3) snap = { p: [s[0], s[1]], kind: s[2] };
      const rs = refSnap?.(raw[0], raw[1], r);
      if (rs && (!snap || Math.hypot(rs.p[0] - raw[0], rs.p[1] - raw[1]) < Math.hypot(snap.p[0] - raw[0], snap.p[1] - raw[1]))) snap = rs;
      // Points on what was drawn in the app snap too; the nearer one wins.
      for (const e of extraSnaps) {
        const d = Math.hypot(e.x - raw[0], e.y - raw[1]);
        if (d <= r && (!snap || d < Math.hypot(snap.p[0] - raw[0], snap.p[1] - raw[1]))) snap = { p: [e.x, e.y], kind: e.kind };
      }
    }
    const from = lastPicked();
    const angles = polarAngles(ds.polarInc, ds.polarExtra);
    if (snap) at = snap.p;
    else {
      // Object snap tracking, then polar tracking from the last point, then the snap spacing (a snap point wins all).
      const tr = toggles.otrack && acquired.current.length ? otrack(acquired.current, raw, ds.trackAllPolar ? angles : [0, 90, 180, 270], 1 / v.scale) : null;
      const pl = !tr && toggles.polar && from ? polarTrack(from, raw, angles, 1 / v.scale) : null;
      if (tr) { at = tr.at; guide = { from: tr.from, label: 'Tracking' }; }
      else if (pl) { at = pl.at; guide = { from: [from!], label: `Polar ${+pl.angle.toFixed(2)}°` }; }
      else if (toggles.snap) {
        const sx = ds.snapX * unitsPerMm, sy = (ds.snapY || ds.snapX) * unitsPerMm, g = gridStep(v.scale);
        at = sx > 0 ? snapToSpacing(raw, sx, sy) : [Math.round(raw[0] / g) * g, Math.round(raw[1] / g) * g];
      }
    }
    // ORTHO: straight from the last picked point (a snap point and tracking win, as in CAD).
    if (!snap && !guide && toggles.ortho && from) at = orthoFrom(from, at);
    return { at, snap, guide };
  };
  const show = (l: Landing) => {
    lastAt.current = l;
    drawCursor(l.at, l.snap, l.guide);
    onCursor(l.at, l.snap ? SNAP_NAMES[l.snap.kind] : l.guide?.label, 1 / tRef.current.scale);
    // Resting on a snap point acquires it for tracking (or lets it go when it was acquired).
    const p = l.snap?.p;
    if (!toggles.otrack || !p) { if (resting.current) { clearTimeout(resting.current.timer); resting.current = null; } return; }
    if (resting.current && resting.current.p[0] === p[0] && resting.current.p[1] === p[1]) return;
    if (resting.current) clearTimeout(resting.current.timer);
    resting.current = { p, timer: setTimeout(() => {
      resting.current = null;
      const a = acquired.current, i = a.findIndex((q) => q[0] === p[0] && q[1] === p[1]);
      acquired.current = i >= 0 ? a.filter((_, k) => k !== i) : [...a, p].slice(-5);
      drawCursor(lastAt.current?.at ?? null, lastAt.current?.snap, lastAt.current?.guide);
    }, 400) };
  };
  // The engine answers in its own worker, one question at a time. Moves made meanwhile keep only the newest question,
  // and the cursor follows them with the last answer, while that point is still within reach.
  const asking = useRef<{ busy: boolean; next: (() => void) | null; last: ArrayLike<number> | null }>({ busy: false, next: null, last: null });
  useEffect(() => { asking.current = { busy: false, next: null, last: null }; }, [view, layersOn]);
  function track(sx: number, sy: number) {
    const raw = toWorld(sx, sy);
    const v = tRef.current;
    if (!toggles.osnap) { show(landing(raw, v, null)); return; }
    const r = aperture(v), q = asking.current;
    const ask = () => {
      q.busy = true;
      q.next = null;
      void view.snap(raw[0], raw[1], r, draftRef.current.osnap, layersOn, lastPicked()).then((s) => {
        if (asking.current !== q) return; // another drawing, or other layers, by now
        q.busy = false;
        q.last = s;
        if (q.next) q.next();
        else if (mouse.current) show(landing(raw, v, s));
      });
    };
    if (!q.busy) { ask(); return; }
    q.next = ask;
    const l = q.last;
    show(landing(raw, v, l?.length === 3 && Math.hypot(l[0] - raw[0], l[1] - raw[1]) <= r ? l : null));
  }
  // A click waits for the engine's answer for where it was made, and reaches the page as the page is by then.
  const onClickNow = useRef(onClick);
  onClickNow.current = onClick;
  function clickAt(sx: number, sy: number, shift = false) {
    const raw = toWorld(sx, sy);
    const v = tRef.current;
    const done = (s: ArrayLike<number> | null) => onClickNow.current?.(landing(raw, v, s).at, 1 / v.scale, shift);
    if (toggles.osnap) void view.snap(raw[0], raw[1], aperture(v), draftRef.current.osnap, layersOn, lastPicked()).then(done);
    else done(null);
  }
  // After zoom / pan, or the canvas resized: the cursor's drawing point moves, so it is tracked again. When only the
  // marks change (a pick, the cursor moving in a tool), they are redrawn without reporting the cursor back (that would loop).
  useEffect(() => { if (mouse.current) track(mouse.current[0], mouse.current[1]); else drawCursor(null); }, [t, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { drawCursor(mouse.current ? lastAt.current?.at ?? null : null, mouse.current ? lastAt.current?.snap : undefined, mouse.current ? lastAt.current?.guide : undefined); }, [marks, preview, cutAway, meets, shadowDevices, movingPoints, theme, grips, hotGripIn, draft, cursorMode, hover, hand, shiftOn, still]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The whole drawing in view, with a margin (FIT / ZE, 0, a double click of the wheel, the zoom chip). */
  const fitT = (): ViewT => {
    const [x0, y0, x1, y1] = view.info.extents;
    const scale = Math.min(size.w / Math.max(1e-9, x1 - x0), size.h / Math.max(1e-9, y1 - y0)) * 0.92;
    return { scale, ox: (x0 + x1) / 2 - o0 - size.w / 2 / scale, oy: (y0 + y1) / 2 - o1 - size.h / 2 / scale };
  };
  const fitNow = () => { if (fixed || b0 !== undefined) return; placeOf.delete(view); setT(fitT()); };
  // ZOOM Window / Scale / Previous asked by the page (src/model/cadView.ts): the model view only; a viewport's and a
  // locked view stay. Previous takes the view before from the drawing's history.
  const zoomDone = useRef(0);
  useEffect(() => {
    if (!zoom || zoom.n === zoomDone.current) return;
    zoomDone.current = zoom.n;
    if (fixed || b0 !== undefined) return;
    const d = zoom.do;
    if (d.kind === 'window') move(() => windowView([d.a[0] - o0, d.a[1] - o1], [d.b[0] - o0, d.b[1] - o1], size));
    else if (d.kind === 'scale') move((v) => scaledView(d.relative ? v : fitT(), d.k, size));
    else { const p = previousView(view); if (p) { placeOf.set(view, p); setT(p); } }
  }, [zoom?.n]); // eslint-disable-line react-hooks/exhaustive-deps -- each request once
  // Each view the model rests at goes into the drawing's history (ZOOM Previous): 400 ms after the last change, so a
  // wheel zoom or a pan counts once.
  useEffect(() => {
    if (b0 !== undefined) return;
    const id = setTimeout(() => rememberView(view, t), 400);
    return () => clearTimeout(id);
  }, [t, view, b0]);
  // + / − zoom about the middle, 0 fits, arrows pan (letters go to the command line, and 0 and − while numbers are typed).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    const k = viewKey(e, false);
    if (!k || k === 'grid' || (numbersTyped && (e.key === '0' || e.key === '-'))) return;
    e.preventDefault();
    if (k === 'fit') fitNow();
    else if (k === 'in' || k === 'out') zoomAt(size.w / 2, size.h / 2, k === 'in' ? KEY_STEP : 1 / KEY_STEP);
    else move((v) => ({ ...v, ox: v.ox + (k.pan[0] * size.w * PAN_STEP) / v.scale, oy: v.oy - (k.pan[1] * size.h * PAN_STEP) / v.scale }));
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const local = (e: React.MouseEvent | React.WheelEvent | React.DragEvent) => {
    const r = over.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const zoomAt = (sx: number, sy: number, k: number) => move((v) => {
    const [wx, wy] = [v.ox + sx / v.scale, v.oy + (size.h - sy) / v.scale];
    const scale = Math.min(1e6, Math.max(1e-6, v.scale * k));
    return { scale, ox: wx - sx / scale, oy: wy - (size.h - sy) / scale };
  });

  return (
    <div ref={host} className="cad-model" onDragOver={onDrop ? (e) => { if (e.dataTransfer.types.includes('text/lvds-block')) e.preventDefault(); } : undefined}
      onDrop={onDrop ? (e) => { const name = e.dataTransfer.getData('text/lvds-block'); if (!name) return; e.preventDefault(); const [x, y] = local(e); onDrop(toWorld(x, y), name); } : undefined}>
      <canvas ref={base} className="cad-layer" style={{ width: size.w, height: size.h }} aria-hidden="true" />
      <canvas
        ref={over}
        className="cad-layer cad-over"
        style={{ width: size.w, height: size.h, cursor: hand }}
        aria-label="Drawing"
        onWheel={(e) => {
          const [sx, sy] = local(e);
          // A mouse wheel and a pinch zoom; two fingers on a trackpad pan.
          const w = wheelAction(e.nativeEvent, 1 + draft.wheelPct / 100, draft.wheelReverse);
          if ('pan' in w) move((v) => ({ ...v, ox: v.ox + w.pan[0] / v.scale, oy: v.oy - w.pan[1] / v.scale }));
          else zoomAt(sx, sy, w.zoom);
        }}
        onMouseDown={(e) => {
          if (isPanPress(e, space.current || !!panLeft)) {
            e.preventDefault();
            const [x, y] = local(e);
            drag.current = { x, y, ox: tRef.current.ox, oy: tRef.current.oy };
            setMoving(true); setPanning(true);
          } else if (e.button === 0 && windowSelect) {
            const [x, y] = local(e), v = tRef.current;
            const g = gripUnder(x, y, v);
            if (g >= 0 && onGripStart) { gripping.current = g; gripFrom.current = [x, y]; onGripStart(g); setMoving(true); return; }
            win.current = { x, y, x2: x, y2: y, on: false };
          }
        }}
        onMouseMove={(e) => {
          const [x, y] = local(e);
          mouse.current = [x, y];
          waitStill();
          const d = drag.current;
          if (d) { move((v) => ({ ...v, ox: d.ox - (x - d.x) / v.scale, oy: d.oy + (y - d.y) / v.scale })); return; }
          const w = win.current;
          if (w) { w.x2 = x; w.y2 = y; if (!w.on && Math.hypot(x - w.x, y - w.y) > 4) { w.on = true; setMoving(true); } }
          track(x, y);
        }}
        onMouseUp={(e) => {
          const wasDrag = !!drag.current;
          drag.current = null;
          setPanning(false);
          const w = win.current;
          win.current = null;
          const g = gripping.current;
          gripping.current = null;
          if (g !== null) { setMoving(false); const [x, y] = mouse.current ?? local(e), f = gripFrom.current; onGripEnd?.(g, lastAt.current?.at ?? toWorld(x, y), !f || Math.hypot(x - f[0], y - f[1]) > 3); return; }
          if (wasDrag || w?.on) setMoving(false);
          if (w?.on) { onWindow?.(toWorld(w.x, w.y), toWorld(w.x2, w.y2), w.x2 < w.x, e.shiftKey); drawCursor(lastAt.current?.at ?? null, lastAt.current?.snap); return; }
          if (!wasDrag && e.button === 0 && !space.current) { const [x, y] = mouse.current ?? local(e); clickAt(x, y, e.shiftKey); }
        }}
        onContextMenu={(e) => { if (!onContext) return; e.preventDefault(); const [x, y] = local(e); onContext(toWorld(x, y), 1 / tRef.current.scale, [x, y], e.shiftKey); }}
        onDoubleClick={(e) => { if (e.button === 1) e.preventDefault(); else if (e.button === 0 && onDouble && !space.current) { const [x, y] = local(e); onDouble(toWorld(x, y), 1 / tRef.current.scale); } }}
        onAuxClick={(e) => { if (isFitClick(e)) fitNow(); }}
        onMouseLeave={() => { drag.current = null; setPanning(false); win.current = null; if (gripping.current !== null) { gripping.current = null; onGripEnd?.(-1, [0, 0]); } setMoving(false); mouse.current = null; drawCursor(null); onCursor(null); }}
      />
      {overlay?.((p) => [(p[0] - o0 - t.ox) * t.scale, size.h - (p[1] - o1 - t.oy) * t.scale], moving)}
      <ZoomChip pct={(t.scale / fitT().scale) * 100} onFit={fitNow} onZoom={onZoomMenu} />
    </div>
  );
}
