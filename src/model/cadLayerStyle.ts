import type { Project, SketchItem } from '../types';
import { colourCss } from './cadColours';

/** Design CAD → Layer manager and object properties: how each layer of a drawing shows (on, locked, colour, linetype,
 * lineweight), kept in the project per drawing file, and what a drawn object has of its own (ByLayer when blank). The
 * architect's layers can take another colour on screen or be locked; the app's drawn layers also a linetype and a
 * lineweight. Printing stays black-and-white. */

export type LinetypeId = 'continuous' | 'dashed' | 'hidden' | 'center' | 'dot' | 'phantom' | 'dashdot';
/** Dash patterns in paper mm (dash, gap, …), at the linetype scale. */
export const LINETYPES: Record<LinetypeId, { label: string; dash: number[] }> = {
  continuous: { label: 'Continuous', dash: [] },
  dashed: { label: 'Dashed', dash: [6, 3] },
  hidden: { label: 'Hidden', dash: [3, 1.5] },
  center: { label: 'Center', dash: [12, 3, 2, 3] },
  dot: { label: 'Dot', dash: [0.5, 2] },
  dashdot: { label: 'Dash dot', dash: [6, 2, 0.5, 2] },
  phantom: { label: 'Phantom', dash: [12, 2, 3, 2, 3, 2] }
};
export const LINETYPE_IDS = Object.keys(LINETYPES) as LinetypeId[];
/** Lineweights (mm); 0 = Default. */
export const LINEWEIGHTS = [0, 0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1];

/** `noPrint`: the layer shows on screen but stays off the sheets. `freeze`: hidden, not picked, left out of zoom extents
 * and the sheets (apart from Off, which only hides). */
/** `color`: '' / absent, a named or true colour (#rrggbb) or an index colour ('idx:8'), see cadColours.ts. */
export interface LayerStyle { color?: string; lock?: boolean; hidden?: boolean; freeze?: boolean; noPrint?: boolean; lt?: LinetypeId; lw?: number }
export interface ObjectProps { color?: string; lt?: LinetypeId; lw?: number }

const keyOf = (file: string) => file.trim().toLowerCase();
/** The styles of a drawing's layers, by layer name (as written; matched without case). */
export function layerStylesOf(p: Project, file: string | undefined): Record<string, LayerStyle> {
  return file ? p.cadLayerStyle?.[keyOf(file)] ?? {} : {};
}
export const styleOf = (styles: Record<string, LayerStyle>, layer: string): LayerStyle => styles[layer] ?? Object.entries(styles).find(([k]) => k.toLowerCase() === layer.toLowerCase())?.[1] ?? {};

/** The project with a layer's style changed (blank fields drop out; an empty style is removed). */
export function withLayerStyle(p: Project, file: string, layer: string, patch: LayerStyle): Project {
  const all = { ...(p.cadLayerStyle ?? {}) }, mine = { ...(all[keyOf(file)] ?? {}) };
  const next = Object.fromEntries(Object.entries({ ...styleOf(mine, layer), ...patch }).filter(([, v]) => v !== undefined && v !== '' && v !== false)) as LayerStyle;
  for (const k of Object.keys(mine)) if (k.toLowerCase() === layer.toLowerCase()) delete mine[k];
  if (Object.keys(next).length) mine[layer] = next;
  if (Object.keys(mine).length) all[keyOf(file)] = mine; else delete all[keyOf(file)];
  const { cadLayerStyle: _old, ...rest } = p;
  return Object.keys(all).length ? { ...rest, cadLayerStyle: all } : rest;
}

/** What a drawn object shows with: its own colour, linetype and lineweight, else its layer's. */
export function effective(it: SketchItem, styles: Record<string, LayerStyle>): { color?: string; dash: number[]; lw: number; hidden: boolean; lock: boolean } {
  const l = styleOf(styles, it.layer);
  const lt = it.lt ?? l.lt ?? 'continuous';
  return { color: colourCss(it.color ?? l.color), dash: LINETYPES[lt]?.dash ?? [], lw: it.lw ?? l.lw ?? 0, hidden: !!l.hidden || !!l.freeze, lock: !!l.lock };
}

/** Objects with their own properties set (blank = ByLayer); `undefined` in the patch clears one. */
export function withProps(it: SketchItem, patch: ObjectProps & { layer?: string }): SketchItem {
  const out: SketchItem = { ...it, ...(patch.layer ? { layer: patch.layer } : {}) };
  for (const k of ['color', 'lt', 'lw'] as const) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === undefined || v === '') delete out[k]; else (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}
/** Match properties: the target takes the source's layer, colour, linetype and lineweight. A tray or cable route keeps
 * its own layer (the schedules find them by it). */
export function matchedProps(from: SketchItem, to: SketchItem): SketchItem {
  const keepLayer = !!(to.tray || to.cable);
  return withProps(to, { ...(keepLayer ? {} : { layer: from.layer }), color: from.color, lt: from.lt, lw: from.lw });
}

/** The layers a drawing's objects can go on: those of what is drawn here, then the app's usual ones, then the layers
 * added in the layer palette that hold nothing yet (src/model/cadLayerState.ts). */
export function drawnLayers(items: SketchItem[], added: string[] = []): string[] {
  const out = [...new Set([...items.map((it) => it.layer), 'LV-SKETCH', 'LV-ANNO', 'LV-HATCH'])];
  for (const l of added) if (!out.some((x) => x.toLowerCase() === l.toLowerCase())) out.push(l);
  return out;
}
