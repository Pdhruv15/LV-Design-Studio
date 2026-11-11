import type { FileLayout, FileViewport } from '../engines/cad/cadEngine';

/** A drawing file's own paper-space layouts (Layout1, A1 Lighting…) in Design CAD: their tab ids, their paper, and where
 * paper space and the model seen through a viewport land on the paper (mm from its lower left corner). */

type Pt = [number, number];

/** Paper used when the file does not say (an empty Layout1): A3 landscape. */
export const DEFAULT_PAPER: Pt = [420, 297];
/** The printable area drawn when the file gives no printer margins (mm in from each edge; on screen only). */
export const DEFAULT_EDGE_MM = 5;

/** The tab id of a file layout (its name is unique in the file); never the id of a project sheet. */
export const fileLayoutId = (name: string) => `file:${name}`;
export const isFileLayoutId = (id: string | null | undefined): id is string => !!id && id.startsWith('file:');
export const fileLayoutOf = (list: FileLayout[] | undefined, id: string | null | undefined): FileLayout | undefined =>
  isFileLayoutId(id) ? list?.find((l) => fileLayoutId(l.name) === id) : undefined;

export interface PaperGeom {
  /** Paper size in mm, and whether the file gave it. */
  w: number;
  h: number;
  known: boolean;
  /** The printable area in mm from the lower left corner: x, y, width, height. */
  printable: [number, number, number, number];
  /** Paper-space point → paper mm from the lower left corner. */
  mm: (x: number, y: number) => Pt;
}

export function paperOf(l: Pick<FileLayout, 'paper' | 'margins' | 'at' | 'mm_per_unit'>): PaperGeom {
  const known = l.paper[0] > 0 && l.paper[1] > 0;
  const [w, h] = known ? l.paper : DEFAULT_PAPER;
  const m = l.margins.some((v) => v > 0) ? l.margins : [DEFAULT_EDGE_MM, DEFAULT_EDGE_MM, DEFAULT_EDGE_MM, DEFAULT_EDGE_MM];
  // A layout with no paper set up: its (0, 0) at the printable area's corner, as a new layout puts it.
  const at: Pt = known ? l.at : [m[0], m[1]];
  const k = l.mm_per_unit > 0 ? l.mm_per_unit : 1;
  return { w, h, known, printable: [m[0], m[1], Math.max(0, w - m[0] - m[2]), Math.max(0, h - m[1] - m[3])], mm: (x, y) => [at[0] + x * k, at[1] + y * k] };
}

/** What a file layout is, in a few words: its paper and its viewports with their scales. */
export function fileLayoutTitle(l: FileLayout, mmPerDrawingUnit = 1): string {
  const p = paperOf(l), vps = l.viewports.filter((v) => v.on);
  const scales = [...new Set(vps.map((v) => viewportScale(v, l.mm_per_unit, mmPerDrawingUnit)).filter(Boolean))];
  return `${Math.round(p.w)} × ${Math.round(p.h)} mm${p.known ? '' : ' (paper not set up: A3 shown)'} · ${vps.length ? `${vps.length} viewport${vps.length === 1 ? '' : 's'}${scales.length ? ` at ${scales.join(', ')}` : ''}` : 'no viewports'}`;
}

/** A viewport's model view: model point → paper-space point, and its scale as paper-space units per drawing unit. */
export function viewportMap(v: FileViewport): { scale: number; ps: (x: number, y: number) => Pt } {
  const scale = v.vh > 0 ? v.h / v.vh : 1;
  const [px, py] = [v.x + v.w / 2, v.y + v.h / 2];
  return { scale, ps: (x, y) => [px + (x - v.cx) * scale, py + (y - v.cy) * scale] };
}

/** A viewport's scale as the status bar shows it ("1:100"), from paper mm per drawing unit and mm per drawing unit. */
export function viewportScale(v: FileViewport, mmPerUnit: number, mmPerDrawingUnit: number): string {
  const paperMmPerModelMm = (viewportMap(v).scale * mmPerUnit) / (mmPerDrawingUnit || 1);
  if (!(paperMmPerModelMm > 0)) return '';
  const n = 1 / paperMmPerModelMm;
  return n >= 1 ? `1:${+n.toFixed(n < 10 ? 2 : 0)}` : `${+(1 / n).toFixed(2)}:1`;
}
