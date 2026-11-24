import type { Project, SketchItem } from '../types';
import { layerFileOf, withLayerFile } from './cadLayerState';
import { dimMeasure, linearDir } from './cadSketch';
import { dimStylesOf, fullDimStyle, lookOf, STANDARD, type CadDimStyle } from './cadStyles';

/** Design CAD → Annotate → Dimensions: the layer new dimensions go on (DIMLAYER), the style a dimension was drawn with
 * (the ribbon's style list; DIMSTYLE A gives the dimensions picked the current one), and what DIM makes of a click. */

/** The app's annotation layer, where new dimensions go until another is set. */
export const ANNO_LAYER = 'LV-ANNO';
/** DIMLAYER's value for "the current layer". */
export const USE_CURRENT = '.';
type Pt = [number, number];
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The drawing's DIMLAYER: a layer's name, USE_CURRENT, or undefined for the annotation layer (as before). */
export const dimLayerSetting = (p: Project, file: string | undefined): string | undefined => layerFileOf(p, file).dimLayer;
/** The layer a new dimension goes on, with `current` the drawing's current layer. */
export function dimLayerOf(p: Project, file: string | undefined, current: string): string {
  const s = dimLayerSetting(p, file);
  return !s ? ANNO_LAYER : s === USE_CURRENT ? current : s;
}
/** The project with the drawing's DIMLAYER set; the annotation layer (or blank) is kept as no setting. */
export const withDimLayer = (p: Project, file: string, value: string | undefined): Project =>
  withLayerFile(p, file, { dimLayer: value && value.trim() && !same(value.trim(), ANNO_LAYER) ? value.trim() : undefined });

/** The style a dimension was drawn with (Standard when it records none). */
export const styleOfDim = (it: Pick<SketchItem, 'dimStyle'>): string => it.dimStyle ?? STANDARD;
/** The style of the dimensions among the objects picked: its name, 'varies' when they differ, or undefined with none. */
export function pickedDimStyle(items: readonly SketchItem[]): string | undefined {
  const names = new Set(items.filter((it) => it.kind === 'dim').map(styleOfDim));
  return names.size === 0 ? undefined : names.size === 1 ? [...names][0] : 'varies';
}
/** A dimension redrawn in a style at k drawing units per paper mm: its look, text height and the style's name. A text
 * it was drawn with before styles (its length in metres) goes, so the style measures it; words typed over it stay. */
export function restyledDim(it: SketchItem, style: CadDimStyle, k: number, metresPerUnit: number): SketchItem {
  const { dimStyle: _s, ...rest } = it;
  const legacy = !it.look && !it.dimKind && it.text !== undefined && it.text === (dimMeasure(it) * metresPerUnit).toFixed(2);
  const { text: _t, ...noText } = rest;
  return { ...(legacy ? noText : rest), look: lookOf(style, k), h: style.textMm * k, ...(style.name !== STANDARD ? { dimStyle: style.name } : {}) } as SketchItem;
}
/** The dimensions picked given a style by name (others are left as they are); undefined when there is no such style. */
export function restyledDims(p: Project, items: readonly SketchItem[], name: string, k: number, metresPerUnit: number): SketchItem[] | undefined {
  const st = dimStylesOf(p).styles.find((x) => same(x.name, name));
  if (!st) return undefined;
  const full = fullDimStyle(st, p);
  return items.filter((it) => it.kind === 'dim').map((it) => restyledDim(it, full, k, metresPerUnit));
}

/** DIM's first click: a snap (endpoint, midpoint, centre…) is a point to measure from; a click with no snap, or only
 * Nearest, picks the line, arc or circle under it. */
export const dimPicksObject = (snap: string | undefined): boolean => !snap || snap === 'Nearest';
/** The direction of a dimension between two points placed through `at`: aligned with them while `at` is beside an
 * oblique pair (between the lines square to it through each point), else horizontal or vertical as DIMLINEAR places it.
 * Undefined means aligned. */
export function dimDirFor(a: Pt, b: Pt, at: Pt): number | undefined {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const oblique = l2 > 0 && Math.abs(dx) > 1e-9 * Math.sqrt(l2) && Math.abs(dy) > 1e-9 * Math.sqrt(l2);
  if (oblique) {
    const t = ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / l2;
    if (t >= 0 && t <= 1) return undefined;
  }
  return linearDir(a, b, at);
}
