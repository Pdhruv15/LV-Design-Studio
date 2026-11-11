import type { FileLayout } from '../engines/cad/cadEngine';
import type { Project } from '../types';
import { DEFAULT_EDGE_MM, DEFAULT_PAPER } from './fileLayouts';

/** Layouts made in Design CAD on a drawing (+ under the drawing: Layout2, Layout3…), kept in the project by drawing file;
 * the drawing file is never changed. Each is a paper with viewports onto the model, shown as the file's own layouts are
 * (CadFilePaper), and is not a project sheet: plan sheets of a level are made from a tab's right-click menu. */

/** A viewport on the paper: its frame in mm from the paper's lower left corner, the model point at its centre and the
 * model height it shows (drawing units). */
export interface DrawingViewport { x: number; y: number; w: number; h: number; cx: number; cy: number; vh: number }
export interface DrawingLayout { name: string; paper: [number, number]; viewports: DrawingViewport[] }

/** Space left round a new layout's viewport (mm from each paper edge). */
export const VIEWPORT_INSET_MM = 10;
/** Scales a new viewport is set to (1:n): the largest that fits the whole drawing. */
const SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000];

/** The tab id of a drawing layout; never the id of a project sheet or of the file's own layout. */
export const drawingLayoutId = (name: string) => `dwg:${name}`;
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

/** A new layout: A3 landscape with one viewport filling it inside a margin, the whole drawing in it at a standard scale. */
export function newDrawingLayout(name: string, ext: [number, number, number, number], mmPerUnit: number): DrawingLayout {
  const [pw, ph] = DEFAULT_PAPER, m = VIEWPORT_INSET_MM, w = pw - 2 * m, h = ph - 2 * m;
  const n = fitScale(ext, w, h, mmPerUnit), mpu = mmPerUnit > 0 ? mmPerUnit : 1;
  const ok = Number.isFinite(ext[0]) && ext[2] >= ext[0];
  return { name, paper: [pw, ph], viewports: [{ x: m, y: m, w, h, cx: ok ? (ext[0] + ext[2]) / 2 : 0, cy: ok ? (ext[1] + ext[3]) / 2 : 0, vh: (h * n) / mpu }] };
}

/** A drawing layout in the shape of the file's own, for CadFilePaper and the status bar: paper mm, nothing on the paper. */
export function asFileLayout(l: DrawingLayout, tab: number): FileLayout {
  const e = DEFAULT_EDGE_MM;
  return {
    name: l.name, tab, paper: l.paper, margins: [e, e, e, e], at: [0, 0], mm_per_unit: 1,
    viewports: l.viewports.map((v) => ({ ...v, locked: false, on: true })),
    origin: [0, 0], segs: new Float32Array(0), segColors: new Uint32Array(0), segLayers: new Uint16Array(0), texts: [], layers: []
  };
}
