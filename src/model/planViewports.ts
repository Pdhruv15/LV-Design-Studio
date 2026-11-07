import type { DrawingSet, DrawingSheet, PlanType } from './drawingSet';

/** Design CAD → layouts (paper space): a plan sheet is a layout of its level's model, a paper with its title block and
 * one or more viewports. A viewport is a rectangle on the paper (mm, in the sheet's drawing area, y down) showing the
 * model around a centre (metres) at a scale: the plan at 1:100, a key plan at 1:500. It can show another plan type,
 * freeze layers and hide references for itself only, and its frame does not print unless asked. A plan sheet without
 * viewports has one, worked out from the level (src/docs/planLayout.ts layoutViewports), and prints as before. 2D only. */

type Pt = [number, number];
export interface PlanViewport {
  id: string;
  /** On the paper: left, top, width, height (mm, in the drawing area). */
  box: [number, number, number, number];
  /** The model point at the viewport's centre (metres). */
  at: Pt;
  /** 1:scale. */
  scale: number;
  /** Pan and zoom inside it leave its view alone (default). */
  locked?: boolean;
  /** Another plan type than the sheet's (blank = the sheet's). */
  shows?: PlanType;
  /** Layers frozen in this viewport only: drawn layers, and reference layers as NAME|LAYER. */
  frozen?: string[];
  /** References not shown in this viewport (by name). */
  refsOff?: string[];
  /** Its frame prints (default: on screen only). */
  frame?: boolean;
}

/** Scales offered for a viewport. */
export const VP_SCALES = [20, 50, 100, 200, 500, 1000];

export const isLocked = (v: PlanViewport) => v.locked !== false;

/** The model window a viewport shows (metres). */
export function vpWindow(v: PlanViewport): { x0: number; y0: number; x1: number; y1: number } {
  const hw = (v.box[2] * v.scale) / 2000, hh = (v.box[3] * v.scale) / 2000;
  return { x0: v.at[0] - hw, x1: v.at[0] + hw, y0: v.at[1] - hh, y1: v.at[1] + hh };
}
/** A model point (metres) on the paper (mm, drawing area). */
export function vpToPaper(v: PlanViewport, [x, y]: Pt): Pt {
  const f = 1000 / v.scale;
  return [v.box[0] + v.box[2] / 2 + (x - v.at[0]) * f, v.box[1] + v.box[3] / 2 - (y - v.at[1]) * f];
}
/** A paper point (mm, drawing area) in the model (metres). */
export function vpToModel(v: PlanViewport, [x, y]: Pt): Pt {
  const k = v.scale / 1000;
  return [v.at[0] + (x - v.box[0] - v.box[2] / 2) * k, v.at[1] - (y - v.box[1] - v.box[3] / 2) * k];
}
/** Whether a paper point is inside the viewport's frame. */
export const insideVp = (v: PlanViewport, [x, y]: Pt) => x >= v.box[0] && x <= v.box[0] + v.box[2] && y >= v.box[1] && y <= v.box[1] + v.box[3];

/** A rectangle from two corners picked on the paper (mm). */
export const boxFrom = (a: Pt, b: Pt): PlanViewport['box'] => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];

/** A new viewport id on the sheet. */
export function vpId(list: PlanViewport[]): string {
  for (let i = 1; ; i++) if (!list.some((v) => v.id === `vp${i}`)) return `vp${i}`;
}
/** Its name on screen: Viewport 1, 2 … in the sheet's order. */
export const vpName = (list: PlanViewport[], id: string) => `Viewport ${list.findIndex((v) => v.id === id) + 1}`;

/** The set with the sheet's viewports replaced (none left: back to the worked-out one). */
export function withViewports(set: DrawingSet, sheetId: string, list: PlanViewport[] | undefined): DrawingSet {
  return { ...set, sheets: set.sheets.map((s): DrawingSheet => {
    if (s.id !== sheetId) return s;
    const { viewports: _old, ...rest } = s;
    return list && list.length ? { ...rest, viewports: list } : rest;
  }) };
}
/** A viewport changed; `undefined` in the patch clears a field. */
export function patchViewport(list: PlanViewport[], id: string, patch: Partial<PlanViewport>): PlanViewport[] {
  return list.map((v) => {
    if (v.id !== id) return v;
    const next = { ...v, ...patch } as PlanViewport & Record<string, unknown>;
    for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete next[k];
    return next;
  });
}
/** A layer frozen in the viewport, or thawed (case ignored). */
export function toggleFrozen(v: PlanViewport, layer: string): Partial<PlanViewport> {
  const has = (v.frozen ?? []).some((l) => l.toLowerCase() === layer.toLowerCase());
  const frozen = has ? (v.frozen ?? []).filter((l) => l.toLowerCase() !== layer.toLowerCase()) : [...(v.frozen ?? []), layer];
  return { frozen: frozen.length ? frozen : undefined };
}
export const isFrozen = (v: Pick<PlanViewport, 'frozen'>, layer: string) => (v.frozen ?? []).some((l) => l.toLowerCase() === layer.toLowerCase());
