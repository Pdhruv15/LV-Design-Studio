import type { FileLayout } from '../engines/cad/cadEngine';
import type { Project } from '../types';
import { DEFAULT_EDGE_MM, DEFAULT_PAPER } from './fileLayouts';
import { arrangeBoxes, keyScale, type VpArrangement } from './planViewports';
import { clipFromPaper, insidePolygon, type VpClip } from './viewportClip';

/** Layouts made in Design CAD on a drawing (+ under the drawing: Layout2, Layout3…), kept in the project by drawing file;
 * the drawing file is never changed. Each is a paper with viewports onto the model, shown as the file's own layouts are
 * (CadFilePaper), and is not a project sheet: plan sheets of a level are made from a tab's right-click menu. */

/** A viewport on the paper: its frame in mm from the paper's lower left corner, the model point at its centre and the
 * model height it shows (drawing units). `locked`: pan and zoom inside it leave its view alone (default: they move it).
 * `frame`: its frame prints (default: on screen only). */
export interface DrawingViewport { x: number; y: number; w: number; h: number; cx: number; cy: number; vh: number; locked?: boolean; frame?: boolean; /** Its outline when it is not its frame's rectangle (VPCLIP, src/model/viewportClip.ts). */ clip?: VpClip }
export interface DrawingLayout { name: string; paper: [number, number]; viewports: DrawingViewport[] }

/** Space left round a new layout's viewport (mm from each paper edge). */
export const VIEWPORT_INSET_MM = 10;
/** Scales a new viewport is set to (1:n): the largest that fits the whole drawing. */
const SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000];

/** The tab id of a drawing layout; never the id of a project sheet or of the file's own layout. */
export const drawingLayoutId = (name: string) => `dwg:${name}`;
export const isDrawingLayoutId = (id: string | null | undefined): id is string => !!id && id.startsWith('dwg:');
const key = (file: string) => file.toLowerCase();
export const drawingLayoutsOf = (p: Project, file: string | undefined): DrawingLayout[] => (file ? p.cadLayouts?.[key(file)] ?? [] : []);
export const drawingLayoutOf = (list: DrawingLayout[], id: string | null | undefined): DrawingLayout | undefined =>
  id?.startsWith('dwg:') ? list.find((l) => drawingLayoutId(l.name) === id) : undefined;

/** The project with the drawing's layouts replaced (none: the entry goes). */
export function withDrawingLayouts(p: Project, file: string, list: DrawingLayout[]): Project {
  const { [key(file)]: _gone, ...rest } = p.cadLayouts ?? {};
  const all = list.length ? { ...rest, [key(file)]: list } : rest;
  const { cadLayouts: _c, ...base } = p;
  return Object.keys(all).length ? { ...base, cadLayouts: all } : base;
}

/** The first "LayoutN" not taken (case ignored), from Layout1. */
export function nextLayoutName(taken: string[]): string {
  const t = new Set(taken.map((n) => n.toLowerCase()));
  let n = 1;
  while (t.has(`layout${n}`)) n += 1;
  return `Layout${n}`;
}

/** The standard scale 1:n at which the model extents fit a frame w × h mm (mmPerUnit: model mm per drawing unit). */
export function fitScale(ext: [number, number, number, number], w: number, h: number, mmPerUnit: number): number {
  const ew = (ext[2] - ext[0]) * mmPerUnit, eh = (ext[3] - ext[1]) * mmPerUnit;
  if (!(ew > 0) && !(eh > 0)) return 100;
  const need = Math.max(ew / w, eh / h);
  return SCALES.find((n) => n >= need) ?? Math.ceil(need / 1000) * 1000;
}

/** A new layout: a paper (A3 landscape unless given) with one viewport filling it inside a margin, the whole drawing in it at a standard scale. */
export function newDrawingLayout(name: string, ext: [number, number, number, number], mmPerUnit: number, paper: [number, number] = DEFAULT_PAPER): DrawingLayout {
  const [pw, ph] = paper, m = VIEWPORT_INSET_MM, w = pw - 2 * m, h = ph - 2 * m;
  const n = fitScale(ext, w, h, mmPerUnit), mpu = mmPerUnit > 0 ? mmPerUnit : 1;
  const ok = Number.isFinite(ext[0]) && ext[2] >= ext[0];
  return { name, paper: [pw, ph], viewports: [{ x: m, y: m, w, h, cx: ok ? (ext[0] + ext[2]) / 2 : 0, cy: ok ? (ext[1] + ext[3]) / 2 : 0, vh: (h * n) / mpu }] };
}

/** A drawing layout in the shape of the file's own, for CadFilePaper and the status bar: paper mm, nothing on the paper. */
export function asFileLayout(l: DrawingLayout, tab: number): FileLayout {
  const e = DEFAULT_EDGE_MM;
  return {
    name: l.name, tab, paper: l.paper, margins: [e, e, e, e], at: [0, 0], mm_per_unit: 1,
    viewports: l.viewports.map((v) => ({ ...v, locked: !!v.locked, on: true })),
    origin: [0, 0], segs: new Float32Array(0), segColors: new Uint32Array(0), segLayers: new Uint16Array(0), texts: [], layers: []
  };
}

/** Papers a layout can have (landscape, mm). */
export const LAYOUT_PAPERS: { id: string; mm: [number, number] }[] = [
  { id: 'A4', mm: [297, 210] }, { id: 'A3', mm: [420, 297] }, { id: 'A2', mm: [594, 420] }, { id: 'A1', mm: [841, 594] }, { id: 'A0', mm: [1189, 841] }
];
/** A paper of the list in mm, across (landscape, long side first) or upright (portrait); A3 when the id is not in the list. */
export function layoutPaperMm(id: string, portrait: boolean): [number, number] {
  const [w, h] = (LAYOUT_PAPERS.find((p) => p.id === id) ?? LAYOUT_PAPERS.find((p) => p.id === 'A3')!).mm;
  return portrait ? [Math.min(w, h), Math.max(w, h)] : [Math.max(w, h), Math.min(w, h)];
}
/** "A3 landscape", "A1 portrait", or "500 × 300 mm" for a paper not in the list (±1 mm). */
export function paperName(paper: [number, number]): string {
  for (const { id, mm } of LAYOUT_PAPERS) {
    if (Math.abs(paper[0] - mm[0]) <= 1 && Math.abs(paper[1] - mm[1]) <= 1) return `${id} landscape`;
    if (Math.abs(paper[0] - mm[1]) <= 1 && Math.abs(paper[1] - mm[0]) <= 1) return `${id} portrait`;
  }
  return `${Math.round(paper[0])} × ${Math.round(paper[1])} mm`;
}
const r1 = (x: number) => Math.round(x * 10) / 10;
/** The layout on another paper: its viewports keep their place in proportion, their centres and their scales. */
export function withPaper(l: DrawingLayout, paper: [number, number]): DrawingLayout {
  const sx = paper[0] / l.paper[0], sy = paper[1] / l.paper[1];
  return { ...l, paper, viewports: l.viewports.map((v) => ({ ...v, x: r1(v.x * sx), y: r1(v.y * sy), w: r1(v.w * sx), h: r1(v.h * sy), vh: v.vh * sy })) };
}
/** The layout's viewports in an arrangement (src/model/planViewports.ts), inside the paper's margin: those there keep their centre and scale; new ones show the whole drawing at the scale it fits (a key plan at keyScale of the first viewport's scale, as on a plan sheet). */
export function arrangeDrawingViewports(l: DrawingLayout, a: VpArrangement, ext: [number, number, number, number], mmPerUnit: number): DrawingLayout {
  const [pw, ph] = l.paper, I = VIEWPORT_INSET_MM, mpu = mmPerUnit > 0 ? mmPerUnit : 1;
  const ok = Number.isFinite(ext[0]) && ext[2] >= ext[0];
  const cx = ok ? (ext[0] + ext[2]) / 2 : 0, cy = ok ? (ext[1] + ext[3]) / 2 : 0;
  const boxes = arrangeBoxes(a, [I, I, pw - 2 * I, ph - 2 * I]);
  // The plan's scale: the first viewport's, as kept or as fitted to its frame.
  const first = l.viewports[0], main = first && first.h > 0 ? (first.vh * mpu) / first.h : boxes[0] ? fitScale(ext, boxes[0][2], boxes[0][3], mmPerUnit) : 100;
  const viewports = boxes.map(([bx, by, bw, bh], i): DrawingViewport => {
    const x = bx, y = r1(ph - (by + bh)), old = l.viewports[i];
    if (old) return { ...old, x, y, w: bw, h: bh, vh: old.h > 0 ? (old.vh * bh) / old.h : old.vh };
    const sc = a.id === 'KEY' && i === 1 ? keyScale(main) : fitScale(ext, bw, bh, mmPerUnit);
    return { x, y, w: bw, h: bh, cx, cy, vh: (bh * sc) / mpu };
  });
  return { ...l, viewports };
}
/** Every viewport (or the one at `only`) showing the whole drawing, centred, at the standard scale it fits. */
export function fitDrawingViewports(l: DrawingLayout, ext: [number, number, number, number], mmPerUnit: number, only = -1): DrawingLayout {
  const mpu = mmPerUnit > 0 ? mmPerUnit : 1, ok = Number.isFinite(ext[0]) && ext[2] >= ext[0];
  return { ...l, viewports: l.viewports.map((v, i) => (only >= 0 && i !== only ? v : { ...v, cx: ok ? (ext[0] + ext[2]) / 2 : v.cx, cy: ok ? (ext[1] + ext[3]) / 2 : v.cy, vh: (v.h * fitScale(ext, v.w, v.h, mmPerUnit)) / mpu })) };
}
/** A viewport's scale 1:n (rounded), from its frame and the model height it shows. */
export const viewportScaleN = (v: DrawingViewport, mmPerUnit: number) => (v.h > 0 ? Math.round((v.vh * mmPerUnit) / v.h) : 0);

/** Viewports picked, moved, resized, added and worked in on a layout made here (the file's own layouts stay as saved). A
 * viewport is named by its place in the layout's list: Viewport 1, 2 … */

type Box = [number, number, number, number];
/** A viewport's id for the pick and the one worked in (MS); never a plan sheet viewport's id (vpN). */
export const dvId = (i: number) => `dv${i}`;
/** The place of the viewport an id names in the layout, or -1. */
export function dvIndex(l: Pick<DrawingLayout, 'viewports'> | undefined, id: string | null | undefined): number {
  const m = /^dv(\d+)$/.exec(id ?? ''), i = m ? Number(m[1]) : -1;
  return l && i >= 0 && i < l.viewports.length ? i : -1;
}
/** Drawing units shown per paper mm. */
const perMm = (v: DrawingViewport) => (v.h > 0 ? v.vh / v.h : 0);
/** The model window a viewport shows (drawing units): x0, y0, x1, y1. */
export function viewportWindow(v: DrawingViewport): Box {
  const hw = (perMm(v) * v.w) / 2, hh = v.vh / 2;
  return [v.cx - hw, v.cy - hh, v.cx + hw, v.cy + hh];
}
/** A viewport's outline on the paper (mm from its lower left corner, y up): its clip's corners, else its frame's four. */
export const viewportOutline = (v: Pick<DrawingViewport, 'x' | 'y' | 'w' | 'h' | 'clip'>): [number, number][] =>
  (v.clip ? v.clip.map(([fx, fy]): [number, number] => [v.x + fx * v.w, v.y + v.h - fy * v.h]) : [[v.x, v.y + v.h], [v.x + v.w, v.y + v.h], [v.x + v.w, v.y], [v.x, v.y]]);
/** The topmost viewport that holds a paper point (mm from the paper's lower left corner) — inside its frame, and its
 * outline when it has one — or -1. */
export function viewportAt(l: Pick<DrawingLayout, 'viewports'>, [x, y]: [number, number]): number {
  for (let i = l.viewports.length - 1; i >= 0; i--) { const v = l.viewports[i]; if (x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h && (!v.clip || insidePolygon([x, y], viewportOutline(v)))) return i; }
  return -1;
}
const change = (l: DrawingLayout, i: number, f: (v: DrawingViewport) => DrawingViewport): DrawingLayout => ({ ...l, viewports: l.viewports.map((v, k) => (k === i ? f(v) : v)) });
/** A viewport changed; `undefined` in the patch clears a field. */
export function patchDrawingViewport(l: DrawingLayout, i: number, patch: Partial<DrawingViewport>): DrawingLayout {
  return change(l, i, (v) => {
    const next = { ...v, ...patch } as DrawingViewport & Record<string, unknown>;
    for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete next[k];
    return next;
  });
}
/** A viewport's frame moved (its view goes with it) or resized (the model stays where it is on the paper, at the same
 * scale). The frame: its lower left corner, width and height (mm). */
export function withViewportBox(l: DrawingLayout, i: number, [x, y, w, h]: Box, how: 'move' | 'resize'): DrawingLayout {
  return change(l, i, (v) => {
    if (how === 'move') return { ...v, x: r1(x), y: r1(y) };
    const s = perMm(v), b = { x: r1(x), y: r1(y), w: r1(w), h: r1(h) };
    return { ...v, ...b, cx: v.cx + (b.x + b.w / 2 - (v.x + v.w / 2)) * s, cy: v.cy + (b.y + b.h / 2 - (v.y + v.h / 2)) * s, vh: s * b.h };
  });
}
/** A viewport cut to a polygon picked on the paper (VPCLIP; mm from the paper's lower left corner, y up): its frame
 * becomes the polygon's bounding box and the model stays where it is on the paper, at the same scale. Undefined when the
 * points make no polygon. */
export function clipDrawingViewport(l: DrawingLayout, i: number, picked: [number, number][]): DrawingLayout | undefined {
  const c = clipFromPaper(picked.map(([x, y]): [number, number] => [x, -y])); // down the paper, as the outline is kept
  if (!c || !l.viewports[i]) return undefined;
  const [left, top, w, h] = c.box;
  return change(withViewportBox(l, i, [left, -(top + h), w, h], 'resize'), i, (v) => ({ ...v, clip: c.clip }));
}
/** The outline taken off: the viewport is its frame's rectangle again. */
export const unclipDrawingViewport = (l: DrawingLayout, i: number): DrawingLayout => change(l, i, (v) => { const { clip: _c, ...rest } = v; return rest; });
/** A new viewport in a frame picked on the paper (MV): the whole drawing in it, centred, at the standard scale it fits. It goes last. */
export function addDrawingViewport(l: DrawingLayout, [x, y, w, h]: Box, ext: [number, number, number, number], mmPerUnit: number): DrawingLayout {
  const mpu = mmPerUnit > 0 ? mmPerUnit : 1, ok = Number.isFinite(ext[0]) && ext[2] >= ext[0], b = { x: r1(x), y: r1(y), w: r1(w), h: r1(h) };
  return { ...l, viewports: [...l.viewports, { ...b, cx: ok ? (ext[0] + ext[2]) / 2 : 0, cy: ok ? (ext[1] + ext[3]) / 2 : 0, vh: (b.h * fitScale(ext, b.w, b.h, mmPerUnit)) / mpu }] };
}
export const removeDrawingViewport = (l: DrawingLayout, i: number): DrawingLayout => ({ ...l, viewports: l.viewports.filter((_, k) => k !== i) });
/** A copy of a viewport, 10 mm right and down, kept on the paper. It goes last. */
export function copyDrawingViewport(l: DrawingLayout, i: number): DrawingLayout {
  const v = l.viewports[i];
  if (!v) return l;
  const x = Math.max(0, Math.min(v.x + 10, l.paper[0] - v.w)), y = Math.max(0, Math.min(v.y - 10, l.paper[1] - v.h));
  return { ...l, viewports: [...l.viewports, { ...v, x: r1(x), y: r1(y) }] };
}
/** A viewport at 1:n. */
export const scaleDrawingViewport = (l: DrawingLayout, i: number, n: number, mmPerUnit: number): DrawingLayout =>
  change(l, i, (v) => ({ ...v, vh: (v.h * n) / (mmPerUnit > 0 ? mmPerUnit : 1) }));
/** A viewport's view lined up with the first viewport's: 'h' (side by side: the same model height on one paper line) or
 * 'v' (stacked: the same model x on one paper column). */
export function alignDrawingView(l: DrawingLayout, i: number, dir: 'h' | 'v'): DrawingLayout {
  const b = l.viewports[0], v = l.viewports[i];
  if (!b || !v || i === 0) return l;
  const s = perMm(v);
  return change(l, i, (q) => (dir === 'h' ? { ...q, cy: b.cy + (v.y + v.h / 2 - (b.y + b.h / 2)) * s } : { ...q, cx: b.cx + (v.x + v.w / 2 - (b.x + b.w / 2)) * s }));
}
/** A viewport's view zoomed by a factor (above 1: closer) about a paper point (mm), which keeps its model point. */
export function zoomDrawingView(v: DrawingViewport, f: number, [px, py]: [number, number]): Pick<DrawingViewport, 'cx' | 'cy' | 'vh'> {
  if (!(f > 0)) return { cx: v.cx, cy: v.cy, vh: v.vh };
  const s = perMm(v), dx = px - (v.x + v.w / 2), dy = py - (v.y + v.h / 2);
  return { cx: v.cx + dx * s - (dx * s) / f, cy: v.cy + dy * s - (dy * s) / f, vh: v.vh / f };
}
/** A viewport's view dragged by a distance on the paper (mm, y up): the model follows the pointer. */
export function panDrawingView(v: DrawingViewport, dx: number, dy: number): Pick<DrawingViewport, 'cx' | 'cy'> {
  const s = perMm(v);
  return { cx: v.cx - dx * s, cy: v.cy - dy * s };
}
