import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { INK, SNAP, SNAP_NAMES, type CadView } from '../../engines/cad/cadEngine';
import { ortho as orthoFrom } from '../../model/cadMeasure';
import { dimensionLines, segmentsOf, trayLabel, trayLine, TRAY_TEXT_MM } from '../../model/cadSketch';
import type { PlanCells, PlanCover } from '../elv/elvOverlay';
import { fittingLabel, trayFittings } from '../../model/cadTrayFittings';
import { cssRgb, dashArray, hatchLines, patternLength, screenColour, tileOf } from '../../model/cadDraw';
import type { SketchItem } from '../../types';
import { effective, styleOf, type LayerStyle } from '../../model/cadLayerStyle';
import { hatchFamilies, HATCH_PATTERNS } from '../../model/cadAnnotate';
import { onScreenThemeChange, screenAppearance } from '../../theme/theme';
import { isFitClick, isPanPress, KEY_STEP, PAN_STEP, useSpaceHeld, viewKey, wheelAction, ZoomChip } from '../drawingView';

type Pt = [number, number];

/** The status bar toggles; `dyn` (dynamic input at the cursor) is the page's, the drawing does not use it. */
export interface CadToggles { snap: boolean; osnap: boolean; ortho: boolean; grid: boolean; dyn?: boolean }
/** What a tool draws over the drawing: picked points (drawing units, absolute), and while `live` a rubber band to the
 * cursor; `closed` outlines are shaded. */
/** A device placed in the app, drawn over the drawing (drawing units, absolute): its symbol, letters and label. */
export interface CanvasDevice { key: string; x: number; y: number; r: number; shape: string; text: string; label: string; selected?: boolean; elv?: boolean; ghost?: boolean }
/** A wired circuit (drawing units, absolute): arcs between its devices, the home run to its DB (an arrow at the DB) and
 * its tag; `warn` when it has no home run. */
export interface CanvasWiring { arcs: { a: Pt; c: Pt; b: Pt }[]; home?: { a: Pt; c: Pt; b: Pt }; tag?: { at: Pt; s: string; warn: boolean } }
export interface CadMarks { points: Pt[]; live?: boolean; closed?: boolean; area?: boolean; label?: string }
/** View transform: screen = (world − origin − (ox, oy)) × scale, y up. */
interface ViewT { scale: number; ox: number; oy: number }
/** Where a drawing was zoomed or panned to: it stays there until Fit, also while its tab or the page is left. */
const placeOf = new WeakMap<CadView, ViewT>();

const OSNAP_ALL = SNAP.endpoint | SNAP.midpoint | SNAP.center | SNAP.intersection | SNAP.insertion | SNAP.node | SNAP.quadrant;
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
export default function CadCanvas({ view, layersOn, toggles, gridDots = false, fitKey, onCursor, onClick, marks, highlight, devices = [], wiring = [], sketch = [], selectedSketch, extraSnaps = [], preview = [], unitsPerMm = 1, labels = {}, covers = [], gaps, windowSelect = false, onWindow, onContext, overlay, grips = [], onGripStart, onGripEnd, layerStyle = {}, refs = [], refSnap, fitBox, fixed = false, onView }: {
  view: CadView;
  layersOn: Uint8Array;
  toggles: CadToggles;
  /** The grid (when on) as dots at the crossings instead of lines. */
  gridDots?: boolean;
  /** A click (left button, not panning): the snapped point, the size of one screen pixel in drawing units, and whether
   * Shift was held. */
  onClick?: (at: Pt, pixel: number, shift?: boolean) => void;
  /** A left drag picks with a window (Select): its corners (drawing units, absolute), `crossing` when dragged right to
   * left, `add` with Shift held. */
  windowSelect?: boolean;
  onWindow?: (a: Pt, b: Pt, crossing: boolean, add: boolean) => void;
  /** A right click: the point (not snapped), one pixel in drawing units, and where on the canvas (CSS pixels). */
  onContext?: (at: Pt, pixel: number, screen: Pt) => void;
  /** HTML over the drawing (the device toolbar): given drawing units → canvas pixels, and whether a window is being
   * dragged or the view panned (it hides meanwhile). */
  overlay?: (toScreen: (p: Pt) => Pt, moving: boolean) => ReactNode;
  marks?: CadMarks | null;
  /** Segments of the object picked (start, end), drawn highlighted. */
  highlight?: [number, number] | null;
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
  /** Grips of the drawn object selected (drawing units): pressed and dragged, they reach the page on release. */
  grips?: Pt[];
  onGripStart?: (i: number) => void;
  onGripEnd?: (i: number, at: Pt) => void;
  /** Layer manager styles by layer name (src/model/cadLayerStyle.ts): a screen colour for the drawing's layers; for
   * what is drawn here also on/off, linetype and lineweight (an object's own wins). */
  layerStyle?: Record<string, LayerStyle>;
  extraSnaps?: { x: number; y: number; kind: number }[];
  /** References under the plan (src/model/cadRefs.ts): their lines (drawing units, absolute) with each line's layer,
   * the screen colour of each layer, and how faded they show (%). Drawn under the drawing; never picked. */
  refs?: { segs: Float64Array; segLayers: Uint16Array; colours: (string | number)[]; fade: number }[];
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
  /** The cursor in drawing units (absolute), snapped, and the snap kind's name. */
  onCursor: (at: Pt | null, snapName?: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [t, setT] = useState<ViewT>({ scale: 1, ox: 0, oy: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const isSel = (id: string) => (Array.isArray(selectedSketch) ? selectedSketch.includes(id) : id === selectedSketch);
  // A grip being dragged (its index), and the grips as last drawn.
  const gripping = useRef<number | null>(null);
  const gripsRef = useRef(grips);
  gripsRef.current = grips;
  // A window being dragged (canvas pixels); `on` once it has moved far enough not to be a click.
  const win = useRef<{ x: number; y: number; x2: number; y2: number; on: boolean } | null>(null);
  const [moving, setMoving] = useState(false);
  const space = useSpaceHeld(); // Space + drag pans with any tool
  const mouse = useRef<Pt | null>(null);
  const lastAt = useRef<{ at: Pt; snap?: { p: Pt; kind: number } } | null>(null);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const [o0, o1] = view.info.origin;
  // Colours are read from CSS on each draw, so a palette or mode change redraws.
  const [theme, setTheme] = useState(screenAppearance);
  useEffect(() => onScreenThemeChange(() => setTheme(screenAppearance())), []);

  // Lines batched per layer, colour, linetype and tile of the drawing (so what is off screen is not drawn), in drawing
  // units relative to the origin; a segment that goes on from the last one continues its path (dashes run on).
  const batches = useMemo(() => {
    type Batch = { layer: number; rgb: number; lt: number; path: Path2D; box: [number, number, number, number]; end: [number, number] };
    const by = new Map<string, Batch>();
    const { segs, segLayers, segColors, segLinetypes } = view;
    const [e0, e1, e2, e3] = view.info.extents;
    const ext: [number, number, number, number] = [e0 - o0, e1 - o1, e2 - o0, e3 - o1];
    for (let i = 0; i < segLayers.length; i += 1) {
      const [x1, y1, x2, y2] = [segs[i * 4], segs[i * 4 + 1], segs[i * 4 + 2], segs[i * 4 + 3]];
      const lt = segLinetypes?.[i] ?? 0;
      const key = `${segLayers[i]}:${segColors[i]}:${lt}:${tileOf((x1 + x2) / 2, (y1 + y2) / 2, ext)}`;
      let b = by.get(key);
      if (!b) { b = { layer: segLayers[i], rgb: segColors[i], lt, path: new Path2D(), box: [x1, y1, x1, y1], end: [NaN, NaN] }; by.set(key, b); }
      if (b.end[0] !== x1 || b.end[1] !== y1) b.path.moveTo(x1, y1);
      b.path.lineTo(x2, y2);
      b.end = [x2, y2];
      b.box = [Math.min(b.box[0], x1, x2), Math.min(b.box[1], y1, y2), Math.max(b.box[2], x1, x2), Math.max(b.box[3], y1, y2)];
    }
    return [...by.values()];
  }, [view, o0, o1]);
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
  const fills = useMemo(() => (view.info.fills ?? []).map((f) => {
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
  }), [view]);

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
  const [b0, b1, b2, b3] = fitBox ?? [];
  useEffect(() => {
    if (b0 !== undefined) {
      const scale = Math.min(size.w / Math.max(1e-9, b2! - b0), size.h / Math.max(1e-9, b3! - b1!));
      setT({ scale, ox: (b0 + b2!) / 2 - o0 - size.w / 2 / scale, oy: (b1! + b3!) / 2 - o1 - size.h / 2 / scale });
      return;
    }
    if (fitted.current !== fitKey) { fitted.current = fitKey; placeOf.delete(view); }
    const [x0, y0, x1, y1] = view.info.extents;
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
    const bg = colour('--cad-bg', '#15171A'), ink = colour('--cad-ink', '#E6E8EB');
    // Stored colours too faint on this background are drawn lighter or darker (each worked out once per draw).
    const bgRgb = cssRgb(bg), shown = new Map<number, string>();
    // A layer given a colour in the layer manager shows in it.
    const layerColour: Record<number, string> = {};
    view.info.layers.forEach((l, i) => { const c = styleOf(layerStyle, l.name).color; if (c) layerColour[i] = c; });
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
      const step = gridStep(scale);
      const minor = colour('--cad-grid', '#16223a'), major = colour('--cad-grid-major', '#20304f');
      const x0 = Math.floor(ox / step), y0 = Math.floor(oy / step);
      ctx.lineWidth = Math.max(1, dpr * 0.5);
      if (gridDots) {
        for (let i = x0; i * step < ox + size.w / scale; i += 1) {
          const sx = Math.round((i * step - ox) * scale * dpr);
          for (let j = y0; j * step < oy + size.h / scale; j += 1) {
            const sy = Math.round((size.h - (j * step - oy) * scale) * dpr), big = i % 5 === 0 && j % 5 === 0, r = Math.max(1, Math.round(dpr * (big ? 1.5 : 1)));
            ctx.fillStyle = big ? major : minor;
            ctx.fillRect(sx - r, sy - r, 2 * r, 2 * r);
          }
        }
      }
      for (let i = x0; !gridDots && i * step < ox + size.w / scale; i += 1) {
        const sx = Math.round((i * step - ox) * scale * dpr) + 0.5;
        ctx.strokeStyle = i % 5 === 0 ? major : minor;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, c.height); ctx.stroke();
      }
      for (let j = y0; !gridDots && j * step < oy + size.h / scale; j += 1) {
        const sy = Math.round((size.h - (j * step - oy) * scale) * dpr) + 0.5;
        ctx.strokeStyle = j % 5 === 0 ? major : minor;
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
    for (const r of refPaths) {
      ctx.globalAlpha = r.alpha;
      for (const l of r.layers) { ctx.strokeStyle = typeof l.colour === 'string' ? l.colour : shade(l.colour); ctx.stroke(l.path); }
    }
    ctx.globalAlpha = 1;
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
        ctx.globalAlpha = 0.18; ctx.fillStyle = col; ctx.fill(f.path, 'evenodd'); ctx.globalAlpha = 1;
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
    const dashes = view.info.linetypes ?? [];
    for (const b of batches) {
      if (!layersOn[b.layer] || !onScreen(b.box)) continue;
      ctx.strokeStyle = layerColour[b.layer] ?? shade(b.rgb);
      // A linetype too fine to see at this zoom (repeat under 4 pixels) is drawn continuous, as CAD does.
      const dash = b.lt ? dashArray(dashes[b.lt] ?? [], px) : [];
      ctx.setLineDash(dash.length && patternLength(dash) * scale >= 4 ? dash : []);
      ctx.stroke(b.path);
    }
    ctx.setLineDash([]);
    if (highlight && highlight[1] > highlight[0]) {
      const p = new Path2D();
      for (let i = highlight[0]; i < highlight[1]; i += 1) { p.moveTo(view.segs[i * 4], view.segs[i * 4 + 1]); p.lineTo(view.segs[i * 4 + 2], view.segs[i * 4 + 3]); }
      ctx.strokeStyle = colour('--cad-snap', '#37d67a');
      ctx.lineWidth = 3 / scale;
      ctx.stroke(p);
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
    const skC = colour('--cad-sketch', '#7fd1ff'), selSk = colour('--cad-snap', '#37d67a');
    const trayH = TRAY_TEXT_MM * unitsPerMm, trayText = trayH * scale >= 4;
    const ltScale = 100 * unitsPerMm; // linetype dashes in paper mm at 1:100
    for (const it of sketch) {
      if (it.kind === 'text') continue;
      const ef = effective(it, layerStyle);
      if (ef.hidden) continue;
      if (it.hatch) {
        // A hatch: its outline filled solid (faint) or with its pattern's lines (or dots), clipped to the outline.
        const outline = new Path2D();
        if (it.kind === 'circle') outline.arc(it.pts[0][0] - o0, it.pts[0][1] - o1, it.r ?? 0, 0, 2 * Math.PI);
        else it.pts.forEach((q, i) => (i ? outline.lineTo(q[0] - o0, q[1] - o1) : outline.moveTo(q[0] - o0, q[1] - o1)));
        outline.closePath();
        const col = isSel(it.id) ? selSk : ef.color ?? skC;
        ctx.save();
        ctx.clip(outline);
        const xs = it.kind === 'circle' ? [it.pts[0][0] - (it.r ?? 0), it.pts[0][0] + (it.r ?? 0)] : it.pts.map((q) => q[0]);
        const ys = it.kind === 'circle' ? [it.pts[0][1] - (it.r ?? 0), it.pts[0][1] + (it.r ?? 0)] : it.pts.map((q) => q[1]);
        const bx: [number, number, number, number] = [Math.min(...xs) - o0, Math.min(...ys) - o1, Math.max(...xs) - o0, Math.max(...ys) - o1];
        const perMm = 100 * unitsPerMm;
        if (it.hatch.pattern === 'solid') { ctx.globalAlpha = 0.3; ctx.fillStyle = col; ctx.fill(outline); ctx.globalAlpha = 1; }
        else if (HATCH_PATTERNS[it.hatch.pattern].dots) {
          const st = Math.max(0.2, it.hatch.scale) * perMm, dsz = 2 / scale;
          if ((bx[2] - bx[0]) * (bx[3] - bx[1]) / (st * st) < 40000 && st * scale >= 3) {
            ctx.fillStyle = col;
            for (let x = Math.ceil(bx[0] / st) * st; x <= bx[2]; x += st) for (let y = Math.ceil(bx[1] / st) * st; y <= bx[3]; y += st) ctx.fillRect(x - dsz / 2, y - dsz / 2, dsz, dsz);
          }
        } else {
          ctx.strokeStyle = col; ctx.lineWidth = 1 / scale; ctx.beginPath();
          for (const f of hatchFamilies(it.hatch, perMm)) {
            for (const l of hatchLines({ angle: f.angle, base: [0, 0], offset: [-Math.sin(f.angle) * f.step, Math.cos(f.angle) * f.step] }, bx, 3 / scale)) { ctx.moveTo(l.a[0], l.a[1]); ctx.lineTo(l.b[0], l.b[1]); }
          }
          ctx.stroke();
        }
        ctx.restore();
        if (!isSel(it.id)) continue; // a hatch shows its outline only when picked
      }
      ctx.strokeStyle = isSel(it.id) ? selSk : ef.color ?? skC;
      ctx.lineWidth = (isSel(it.id) ? 3 : ef.lw ? Math.max(1.5, ef.lw * 6) : it.tray ? 2.5 : 1.5) / scale;
      ctx.beginPath();
      if (it.tray) for (const q of trayText ? trayLine(it, trayH).pieces : [it.pts]) q.forEach((p, i) => (i ? ctx.lineTo(p[0] - o0, p[1] - o1) : ctx.moveTo(p[0] - o0, p[1] - o1)));
      else for (const [a, b] of segmentsOf(it)) { ctx.moveTo(a[0] - o0, a[1] - o1); ctx.lineTo(b[0] - o0, b[1] - o1); }
      if (it.cable) ctx.setLineDash([10 / scale, 5 / scale]); // a cable route: dashed
      else if (ef.dash.length && ef.dash.reduce((t, v) => t + v, 0) * ltScale * scale >= 4) ctx.setLineDash(ef.dash.map((v) => v * ltScale));
      ctx.stroke();
      ctx.setLineDash([]);
      if (it.leader && it.pts.length > 1) {
        // The leader's arrow at its first point, 3 mm long on paper at 1:100.
        const [a, b] = [it.pts[0], it.pts[1]], ang = Math.atan2(a[1] - b[1], a[0] - b[0]), hd = 3 * ltScale;
        ctx.beginPath(); ctx.moveTo(a[0] - o0, a[1] - o1);
        ctx.lineTo(a[0] - o0 - hd * Math.cos(ang - 0.3), a[1] - o1 - hd * Math.sin(ang - 0.3));
        ctx.lineTo(a[0] - o0 - hd * Math.cos(ang + 0.3), a[1] - o1 - hd * Math.sin(ang + 0.3));
        ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      }
    }
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
      const x = d.x - o0, y = d.y - o1, r = d.r;
      ctx.strokeStyle = d.selected ? selC : d.elv ? elvC : lvC;
      ctx.lineWidth = (d.selected ? 3 : 1.5) / scale;
      ctx.globalAlpha = d.ghost ? 0.45 : 1; // a Fill room preview
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
    ctx.globalAlpha = 1;
    // Texts in screen space at their drawn height; too small to read: left out.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'alphabetic';
    let drawn = 0;
    for (const tx of view.info.texts) {
      if (!layersOn[tx.layer]) continue;
      const px = tx.h * scale;
      if (px < 4 || drawn > 6000) continue;
      const sx = (tx.x - o0 - ox) * scale, sy = size.h - (tx.y - o1 - oy) * scale;
      if (sx < -2000 || sx > size.w + 2000 || sy < -200 || sy > size.h + 200) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-tx.rot);
      ctx.font = `${Math.min(px, 200)}px system-ui, sans-serif`;
      ctx.textAlign = tx.align === 1 ? 'center' : tx.align === 2 ? 'right' : 'left';
      ctx.fillStyle = shade(tx.rgb);
      ctx.fillText(tx.s, 0, 0);
      ctx.restore();
      drawn += 1;
    }
    for (const d of devices) {
      const px = d.r * scale;
      if (px < 4) continue;
      const sx = (d.x - o0 - ox) * scale, sy = size.h - (d.y - o1 - oy) * scale;
      ctx.fillStyle = d.selected ? selC : d.elv ? elvC : lvC;
      if (d.text) { ctx.font = `600 ${Math.min(px * 0.8, 40)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(d.text, sx, sy + px * 0.3); }
      if (px >= 7 && d.label) { ctx.font = `${Math.min(Math.max(px * 0.6, 9), 16)}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.fillText(d.label, sx + px * 1.3, sy + px * 0.3); }
    }
    // Wiring tags, at screen size beside the home run (in red when it has none).
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
    for (const w of wiring) {
      if (!w.tag) continue;
      ctx.fillStyle = w.tag.warn ? bad : lvC;
      ctx.fillText(w.tag.s, (w.tag.at[0] - o0 - ox) * scale + 6, size.h - (w.tag.at[1] - o1 - oy) * scale - 6);
    }
    for (const it of sketch) {
      const label = it.kind === 'text' ? { at: it.pts[0], s: it.text ?? '', h: it.h ?? 0, rot: it.rot ?? 0, align: 'left' as CanvasTextAlign }
        : it.kind === 'dim' ? (() => { const d = dimensionLines(it.pts[0], it.pts[1], it.pts[2], it.look); return { at: d.text, s: it.text ?? '', h: it.h ?? d.length * 0.04, rot: d.angle, align: 'center' as CanvasTextAlign }; })()
        : it.tray ? (() => { const l = trayLabel(it); return { at: l.at, s: l.text, h: trayH, rot: l.rot, align: 'center' as CanvasTextAlign }; })()
        : it.cable && labels[it.id] ? (() => { const l = trayLabel(it); return { at: l.at, s: labels[it.id], h: 120 * unitsPerMm, rot: l.rot, align: 'center' as CanvasTextAlign }; })()
        : null;
      if (!label || !label.s) continue;
      const lef = effective(it, layerStyle);
      if (lef.hidden) continue;
      const px = label.h * scale;
      if (px < 4) continue;
      ctx.save();
      ctx.translate((label.at[0] - o0 - ox) * scale, size.h - (label.at[1] - o1 - oy) * scale);
      ctx.rotate(-label.rot);
      ctx.font = `${Math.min(px, 200)}px system-ui, sans-serif`;
      ctx.textAlign = label.align;
      if (it.tray) ctx.textBaseline = 'middle'; // in the gap of the tray's line
      ctx.fillStyle = isSel(it.id) ? selSk : lef.color ?? skC;
      ctx.fillText(label.s, 0, 0);
      ctx.restore();
    }
    // Tray fittings: a dot at the joint and its name beside it.
    const fpx = 100 * unitsPerMm * scale;
    if (fpx >= 4) {
      ctx.fillStyle = skC;
      ctx.font = `${Math.min(fpx, 40)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      for (const f of fittings) {
        const sx = (f.at[0] - o0 - ox) * scale, sy = size.h - (f.at[1] - o1 - oy) * scale;
        ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 2 * Math.PI); ctx.fill();
        ctx.fillText(fittingLabel(f), sx + fpx * 1.2, sy - fpx * 1.2);
      }
    }
  }, [t, size, batches, fills, layersOn, toggles.grid, view, highlight, devices, wiring, sketch, selectedSketch, unitsPerMm, labels, covers, gaps, theme, gridDots, layerStyle, refPaths]); // eslint-disable-line react-hooks/exhaustive-deps -- colours read from CSS each draw

  /** The cursor: crosshair and pick box, and the snap marker with its name. */
  function drawCursor(at: Pt | null, snap?: { p: Pt; kind: number }) {
    const c = over.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size.w * dpr)) { c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
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
      // The selection window: solid left to right (inside), dashed right to left (crossing).
      ctx.strokeStyle = snapC;
      ctx.lineWidth = 1;
      ctx.setLineDash(box.x2 < box.x ? [6, 4] : []);
      ctx.globalAlpha = 0.12; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(Math.min(box.x, box.x2), Math.min(box.y, box.y2), Math.abs(box.x2 - box.x), Math.abs(box.y2 - box.y)); ctx.globalAlpha = 1;
      ctx.strokeRect(Math.min(box.x, box.x2) + 0.5, Math.min(box.y, box.y2) + 0.5, Math.abs(box.x2 - box.x), Math.abs(box.y2 - box.y));
      ctx.setLineDash([]);
    }
    for (const g of gripsRef.current) {
      const gx = (g[0] - o0 - ox) * scale, gy = size.h - (g[1] - o1 - oy) * scale;
      ctx.fillStyle = snapC; ctx.fillRect(Math.round(gx) - 4, Math.round(gy) - 4, 8, 8);
    }
    const pv = previewRef.current;
    if (pv.length) {
      ctx.strokeStyle = colour('--cad-sketch', '#7fd1ff');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      for (const it of pv) for (const [a, b] of segmentsOf(it)) {
        ctx.moveTo((a[0] - o0 - ox) * scale, size.h - (a[1] - o1 - oy) * scale);
        ctx.lineTo((b[0] - o0 - ox) * scale, size.h - (b[1] - o1 - oy) * scale);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!at) return;
    const sx = (at[0] - o0 - ox) * scale, sy = size.h - (at[1] - o1 - oy) * scale;
    ctx.strokeStyle = colour('--cad-cross', '#dbe4f5');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(size.w, Math.round(sy) + 0.5);
    ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, size.h);
    ctx.stroke();
    ctx.strokeRect(Math.round(sx) - 4.5, Math.round(sy) - 4.5, 9, 9);
    if (!snap) return;
    const mx = (snap.p[0] - o0 - ox) * scale, my = size.h - (snap.p[1] - o1 - oy) * scale;
    ctx.strokeStyle = colour('--cad-snap', '#37d67a');
    ctx.lineWidth = 2;
    ctx.beginPath();
    const r = 7;
    if (snap.kind === SNAP.endpoint || snap.kind === SNAP.insertion) ctx.rect(mx - r, my - r, 2 * r, 2 * r);
    else if (snap.kind === SNAP.midpoint) { ctx.moveTo(mx, my - r); ctx.lineTo(mx + r, my + r * 0.8); ctx.lineTo(mx - r, my + r * 0.8); ctx.closePath(); }
    else if (snap.kind === SNAP.center) ctx.arc(mx, my, r, 0, 2 * Math.PI);
    else if (snap.kind === SNAP.intersection) { ctx.moveTo(mx - r, my - r); ctx.lineTo(mx + r, my + r); ctx.moveTo(mx + r, my - r); ctx.lineTo(mx - r, my + r); }
    else { ctx.moveTo(mx, my - r); ctx.lineTo(mx + r, my); ctx.lineTo(mx, my + r); ctx.lineTo(mx - r, my); ctx.closePath(); }
    ctx.stroke();
    const label = SNAP_NAMES[snap.kind] ?? '';
    ctx.font = '11px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = colour('--panel', '#1D2024');
    ctx.fillRect(mx + 12, my + 10, w, 18);
    ctx.fillStyle = colour('--tx', '#dbe4f5');
    ctx.fillText(label, mx + 17, my + 23);
  }

  const toWorld = (sx: number, sy: number, v = tRef.current): Pt => [o0 + v.ox + sx / v.scale, o1 + v.oy + (size.h - sy) / v.scale];
  /** Where the cursor lands at a drawing point, given the engine's snap point there (`s`: [x, y, kind], or none). */
  const landing = (raw: Pt, v: ViewT, s: ArrayLike<number> | null): { at: Pt; snap?: { p: Pt; kind: number } } => {
    let at = raw;
    let snap: { p: Pt; kind: number } | undefined;
    if (toggles.osnap) {
      const r = 10 / v.scale;
      if (s?.length === 3) snap = { p: [s[0], s[1]], kind: s[2] };
      const rs = refSnap?.(raw[0], raw[1], r);
      if (rs && (!snap || Math.hypot(rs.p[0] - raw[0], rs.p[1] - raw[1]) < Math.hypot(snap.p[0] - raw[0], snap.p[1] - raw[1]))) snap = rs;
      // Points on what was drawn in the app snap too; the nearer one wins.
      for (const e of extraSnaps) {
        const d = Math.hypot(e.x - raw[0], e.y - raw[1]);
        if (d <= r && (!snap || d < Math.hypot(snap.p[0] - raw[0], snap.p[1] - raw[1]))) snap = { p: [e.x, e.y], kind: e.kind };
      }
    }
    if (snap) at = snap.p;
    else if (toggles.snap) { const g = gridStep(v.scale); at = [Math.round(raw[0] / g) * g, Math.round(raw[1] / g) * g]; }
    // ORTHO: straight from the last picked point (a snap point wins, as in CAD).
    const mk = marksRef.current;
    if (!snap && toggles.ortho && mk?.live && mk.points.length) at = orthoFrom(mk.points[mk.points.length - 1], at);
    return { at, snap };
  };
  const show = (l: { at: Pt; snap?: { p: Pt; kind: number } }) => {
    lastAt.current = l;
    drawCursor(l.at, l.snap);
    onCursor(l.at, l.snap ? SNAP_NAMES[l.snap.kind] : undefined);
  };
  // The engine answers in its own worker, one question at a time. Moves made meanwhile keep only the newest question,
  // and the cursor follows them with the last answer, while that point is still within reach.
  const asking = useRef<{ busy: boolean; next: (() => void) | null; last: ArrayLike<number> | null }>({ busy: false, next: null, last: null });
  useEffect(() => { asking.current = { busy: false, next: null, last: null }; }, [view, layersOn]);
  function track(sx: number, sy: number) {
    const raw = toWorld(sx, sy);
    const v = tRef.current;
    if (!toggles.osnap) { show(landing(raw, v, null)); return; }
    const r = 10 / v.scale, q = asking.current;
    const ask = () => {
      q.busy = true;
      q.next = null;
      void view.snap(raw[0], raw[1], r, OSNAP_ALL, layersOn).then((s) => {
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
    if (toggles.osnap) void view.snap(raw[0], raw[1], 10 / v.scale, OSNAP_ALL, layersOn).then(done);
    else done(null);
  }
  // After zoom / pan: the cursor's drawing point moves, so it is tracked again. When only the marks change (a pick, the
  // cursor moving in a tool), they are redrawn without reporting the cursor back (that would loop).
  useEffect(() => { if (mouse.current) track(mouse.current[0], mouse.current[1]); else drawCursor(null); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { drawCursor(mouse.current ? lastAt.current?.at ?? null : null, mouse.current ? lastAt.current?.snap : undefined); }, [marks, preview, theme, grips]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The whole drawing in view, with a margin (FIT / ZE, 0, a double click of the wheel, the zoom chip). */
  const fitT = (): ViewT => {
    const [x0, y0, x1, y1] = view.info.extents;
    const scale = Math.min(size.w / Math.max(1e-9, x1 - x0), size.h / Math.max(1e-9, y1 - y0)) * 0.92;
    return { scale, ox: (x0 + x1) / 2 - o0 - size.w / 2 / scale, oy: (y0 + y1) / 2 - o1 - size.h / 2 / scale };
  };
  const fitNow = () => { if (fixed || b0 !== undefined) return; placeOf.delete(view); setT(fitT()); };
  // + / − zoom about the middle, 0 fits, arrows pan (letters go to the command line).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    const k = viewKey(e, false);
    if (!k || k === 'grid') return;
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

  const local = (e: React.MouseEvent | React.WheelEvent) => {
    const r = over.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const zoomAt = (sx: number, sy: number, k: number) => move((v) => {
    const [wx, wy] = [v.ox + sx / v.scale, v.oy + (size.h - sy) / v.scale];
    const scale = Math.min(1e6, Math.max(1e-6, v.scale * k));
    return { scale, ox: wx - sx / scale, oy: wy - (size.h - sy) / scale };
  });

  return (
    <div ref={host} className="cad-model">
      <canvas ref={base} className="cad-layer" style={{ width: size.w, height: size.h }} aria-hidden="true" />
      <canvas
        ref={over}
        className="cad-layer cad-over"
        style={{ width: size.w, height: size.h }}
        aria-label="Drawing"
        onWheel={(e) => {
          const [sx, sy] = local(e);
          // A mouse wheel and a pinch zoom; two fingers on a trackpad pan.
          const w = wheelAction(e.nativeEvent);
          if ('pan' in w) move((v) => ({ ...v, ox: v.ox + w.pan[0] / v.scale, oy: v.oy - w.pan[1] / v.scale }));
          else zoomAt(sx, sy, w.zoom);
        }}
        onMouseDown={(e) => {
          if (isPanPress(e, space.current)) {
            e.preventDefault();
            const [x, y] = local(e);
            drag.current = { x, y, ox: tRef.current.ox, oy: tRef.current.oy };
            setMoving(true);
          } else if (e.button === 0 && windowSelect) {
            const [x, y] = local(e), v = tRef.current;
            const g = gripsRef.current.findIndex((q) => Math.hypot((q[0] - o0 - v.ox) * v.scale - x, size.h - (q[1] - o1 - v.oy) * v.scale - y) <= 6);
            if (g >= 0 && onGripStart) { gripping.current = g; onGripStart(g); setMoving(true); return; }
            win.current = { x, y, x2: x, y2: y, on: false };
          }
        }}
        onMouseMove={(e) => {
          const [x, y] = local(e);
          mouse.current = [x, y];
          const d = drag.current;
          if (d) { move((v) => ({ ...v, ox: d.ox - (x - d.x) / v.scale, oy: d.oy + (y - d.y) / v.scale })); return; }
          const w = win.current;
          if (w) { w.x2 = x; w.y2 = y; if (!w.on && Math.hypot(x - w.x, y - w.y) > 4) { w.on = true; setMoving(true); } }
          track(x, y);
        }}
        onMouseUp={(e) => {
          const wasDrag = !!drag.current;
          drag.current = null;
          const w = win.current;
          win.current = null;
          const g = gripping.current;
          gripping.current = null;
          if (g !== null) { setMoving(false); const [x, y] = mouse.current ?? local(e); onGripEnd?.(g, lastAt.current?.at ?? toWorld(x, y)); return; }
          if (wasDrag || w?.on) setMoving(false);
          if (w?.on) { onWindow?.(toWorld(w.x, w.y), toWorld(w.x2, w.y2), w.x2 < w.x, e.shiftKey); drawCursor(lastAt.current?.at ?? null, lastAt.current?.snap); return; }
          if (!wasDrag && e.button === 0 && !space.current) { const [x, y] = mouse.current ?? local(e); clickAt(x, y, e.shiftKey); }
        }}
        onContextMenu={(e) => { if (!onContext) return; e.preventDefault(); const [x, y] = local(e); onContext(toWorld(x, y), 1 / tRef.current.scale, [x, y]); }}
        onDoubleClick={(e) => { if (e.button === 1) e.preventDefault(); }}
        onAuxClick={(e) => { if (isFitClick(e)) fitNow(); }}
        onMouseLeave={() => { drag.current = null; win.current = null; if (gripping.current !== null) { gripping.current = null; onGripEnd?.(-1, [0, 0]); } setMoving(false); mouse.current = null; drawCursor(null); onCursor(null); }}
      />
      {overlay?.((p) => [(p[0] - o0 - t.ox) * t.scale, size.h - (p[1] - o1 - t.oy) * t.scale], moving)}
      <ZoomChip pct={(t.scale / fitT().scale) * 100} onFit={fitNow} />
    </div>
  );
}
