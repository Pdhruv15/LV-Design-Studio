import type { Project } from '../types';
import { toDxf } from '../docs/dxf';

/** File → New (NEW): a blank drawing in millimetres to draw from scratch. Saved the first time with Save As, as any
 * drawing opened without a path. */

/** Drawing1.dxf, Drawing2.dxf…: the first name no open drawing has and the project keeps nothing for, since what was
 * drawn, layers, units, plans and references are all kept by file name. */
export function newDrawingName(p: Project, open: readonly string[]): string {
  const used = new Set([
    ...open,
    ...(p.cadSketch ?? []).map((s) => s.file),
    ...(p.cadPlans ?? []).map((x) => x.file),
    ...Object.keys(p.cadLayerFile ?? {}),
    ...Object.keys(p.cadLayerStyle ?? {}),
    ...Object.keys(p.cadPlanUnits ?? {}),
    ...Object.keys(p.cadRefs ?? {}),
    ...Object.keys(p.cadErased ?? {})
  ].map((f) => f.toLowerCase()));
  for (let n = 1; ; n++) {
    const file = `Drawing${n}.dxf`;
    if (!used.has(file.toLowerCase())) return file;
  }
}

/** The blank drawing: layer 0 only, in millimetres ($INSUNITS 4). */
export const newDrawingDxf = (): string => toDxf([], { '0': 7 }, { insunits: 4 });
