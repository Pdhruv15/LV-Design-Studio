import type { Project, SketchItem } from '../types';
import { styleOf, withLayerStyle, layerStylesOf, type LayerStyle, type LinetypeId } from './cadLayerStyle';
import { withRefLayer } from './cadRefs';
import { sketchOf, withSketchItems } from './cadSketch';
import { planOfLevel } from './cadPlans';

/** Design CAD → Layer palette: what is kept per drawing file besides the layer styles (src/model/cadLayerStyle.ts) —
 * the current layer, the drawn layers added that hold nothing yet, the layer states saved under a name, the layers
 * Isolate turned off (Unisolate turns them back on), and the architect's layers turned on or off in the app (`archOn`,
 * by name, over the drawing's own setting). Keeping On in the project makes every change one undo step, and a layer
 * turned off stays off when the drawing opens again; the drawing itself is never changed. Absent = as before:
 * LV-SKETCH current, no states, the architect's layers as the drawing has them. The architect's layers are never
 * renamed or deleted. */

export interface LayerSnap { on: boolean; freeze?: boolean; lock?: boolean; color?: string }
export interface LayerStateSet { name: string; layers: Record<string, LayerSnap> }
export interface CadLayerFile { current?: string; layers?: string[]; states?: LayerStateSet[]; iso?: string[]; archOn?: Record<string, boolean> }

/** Where a row of the palette comes from: a drawn layer, one of the architect's, or a reference's (NAME|LAYER). */
export type LayerGroup = 'drawn' | 'arch' | 'ref';
/** `drawingOn`: for the architect's layers, On as the drawing has it (a change back to it drops the app's own setting). */
export interface LayerRef { name: string; group: LayerGroup; ref?: string; layer?: string; drawingOn?: boolean }
/** A change from the palette; a key present with `undefined` (colour, linetype, lineweight) goes back to ByLayer. */
export interface LayerPatch { on?: boolean; freeze?: boolean; lock?: boolean; print?: boolean; color?: string; lt?: LinetypeId; lw?: number }

/** The app's own layers: they keep their names (the schedules and Save DXF find objects by them). */
export const APP_LAYERS = ['LV-SKETCH', 'LV-ANNO', 'LV-HATCH', 'E-TRAY', 'E-CABLE'];
export const DEFAULT_LAYER = 'LV-SKETCH';
const isApp = (name: string) => APP_LAYERS.some((a) => same(a, name));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const keyOf = (file: string) => file.trim().toLowerCase();

export const layerFileOf = (p: Project, file: string | undefined): CadLayerFile => (file ? p.cadLayerFile?.[keyOf(file)] ?? {} : {});
/** Which of the architect's layers show (1) or not (0), in the drawing's order: as turned on or off in the app, else as
 * the drawing has them. Frozen layers are left to the caller (they stay hidden whatever On says). */
export function archOnOf(p: Project, file: string | undefined, layers: { name: string; on: boolean }[]): Uint8Array {
  const set = layerFileOf(p, file).archOn;
  if (!set || !Object.keys(set).length) return Uint8Array.from(layers.map((l) => (l.on ? 1 : 0)));
  const byName = new Map(Object.entries(set).map(([k, v]) => [k.toLowerCase(), v]));
  return Uint8Array.from(layers.map((l) => ((byName.get(l.name.toLowerCase()) ?? l.on) ? 1 : 0)));
}
/** The project with the drawing's layer record changed (blank fields drop out; an empty record is removed). */
export function withLayerFile(p: Project, file: string, patch: Partial<CadLayerFile>): Project {
  const all = { ...(p.cadLayerFile ?? {}) };
  const next = Object.fromEntries(Object.entries({ ...(all[keyOf(file)] ?? {}), ...patch })
    .filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length))) as CadLayerFile;
  if (Object.keys(next).length) all[keyOf(file)] = next; else delete all[keyOf(file)];
  const { cadLayerFile: _old, ...rest } = p;
  return Object.keys(all).length ? { ...rest, cadLayerFile: all } : rest;
}

/** The layer new lines, polylines, rectangles, circles and arcs go on. */
export const currentLayerOf = (p: Project, file: string | undefined) => layerFileOf(p, file).current ?? DEFAULT_LAYER;
export const withCurrentLayer = (p: Project, file: string, name: string) => withLayerFile(p, file, { current: same(name, DEFAULT_LAYER) ? undefined : name });

/** A typed filter: * for any run of characters, ? for one; without either, the text anywhere in the name. Case ignored. */
export function matchesFilter(name: string, pattern: string): boolean {
  const f = pattern.trim();
  if (!f) return true;
  if (!/[*?]/.test(f)) return name.toLowerCase().includes(f.toLowerCase());
  const re = new RegExp(`^${f.split('').map((ch) => (ch === '*' ? '.*' : ch === '?' ? '.' : ch.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('')}$`, 'i');
  return re.test(name);
}

/** The first free name Layer1, Layer2 … */
export function newLayerName(taken: string[]): string {
  for (let i = 1; ; i++) if (!taken.some((t) => same(t, `Layer${i}`))) return `Layer${i}`;
}
/** A new, empty drawn layer (kept so it lists before anything is drawn on it). */
export function withNewLayer(p: Project, file: string, name: string): Project {
  const f = layerFileOf(p, file);
  return withLayerFile(p, file, { layers: [...(f.layers ?? []), name] });
}

/** Why a layer cannot be renamed, if it cannot. */
export function renameRefusal(r: LayerRef): string | undefined {
  if (r.group === 'arch') return 'The architect\'s layers keep their names.';
  if (r.group === 'ref') return 'A reference\'s layers keep their names.';
  if (isApp(r.name)) return `${r.name} is one of the app's own layers; it keeps its name.`;
  return undefined;
}
const BAD_CHARS = /[<>/\\":;?*|,=`]/;
/** A drawn layer renamed: the objects on it, its style, the current layer, the states, Isolate's set and the layouts'
 * viewport freezes follow. `taken`: every layer name of the drawing (the architect's and references' too). */
export function renameLayer(p: Project, file: string, from: string, to: string, taken: string[]): { project: Project } | { error: string } {
  const name = to.trim();
  const refused = renameRefusal({ name: from, group: 'drawn' });
  if (refused) return { error: refused };
  if (!name) return { error: 'A layer needs a name.' };
  if (BAD_CHARS.test(name)) return { error: 'A layer name cannot have < > / \\ " : ; ? * | , = or `.' };
  if (isApp(name) || taken.some((t) => same(t, name) && !same(t, from))) return { error: `There is already a layer ${name}.` };
  if (name === from) return { project: p };
  const ren = (l: string) => (same(l, from) ? name : l);
  let q = withSketchItems(p, file, sketchOf(p, file).map((it): SketchItem => (same(it.layer, from) ? { ...it, layer: name } : it)));
  const st = styleOf(layerStylesOf(q, file), from);
  if (Object.keys(st).length) q = withLayerStyle(withLayerStyle(q, file, from, { color: undefined, lock: undefined, hidden: undefined, noPrint: undefined, lt: undefined, lw: undefined, freeze: undefined }), file, name, st);
  const f = layerFileOf(q, file);
  const keys = <T>(o: Record<string, T> | undefined) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [ren(k), v])) : undefined);
  q = withLayerFile(q, file, {
    current: f.current && ren(f.current),
    layers: f.layers?.map(ren),
    states: f.states?.map((s) => ({ ...s, layers: keys(s.layers)! })),
    iso: Array.isArray(f.iso) ? f.iso.map(ren) : undefined
  });
  // The layouts of this plan: a layer frozen in one of their viewports stays frozen there.
  if (q.drawingSet?.sheets.some((s) => s.viewports?.some((v) => v.frozen?.some((l) => same(l, from))))) {
    q = { ...q, drawingSet: { ...q.drawingSet, sheets: q.drawingSet.sheets.map((s) => {
      if (!s.viewports || !same(planOfLevel(q, { building: s.buildingId ?? '', level: s.levelId ?? '' })?.file ?? '', file)) return s;
      return { ...s, viewports: s.viewports.map((v) => (v.frozen ? { ...v, frozen: v.frozen.map(ren) } : v)) };
    }) } };
  }
  return { project: q };
}

/** Why a layer cannot be deleted, if it cannot: only an empty drawn layer that is not current. */
export function deleteRefusal(r: LayerRef, objects: number, current: string): string | undefined {
  if (r.group !== 'drawn') return `${r.name}: ${r.group === 'arch' ? 'the architect\'s layers' : 'a reference\'s layers'} cannot be deleted.`;
  if (isApp(r.name)) return `${r.name} is one of the app's own layers.`;
  if (same(r.name, current)) return `${r.name} is the current layer; set another one current first.`;
  if (objects) return `${r.name} has ${objects} object${objects === 1 ? '' : 's'} on it; erase or move them first.`;
  return undefined;
}
export function withoutLayer(p: Project, file: string, name: string): Project {
  const f = layerFileOf(p, file);
  const q = withLayerStyle(p, file, name, { color: undefined, lock: undefined, hidden: undefined, noPrint: undefined, lt: undefined, lw: undefined, freeze: undefined });
  return withLayerFile(q, file, { layers: f.layers?.filter((l) => !same(l, name)), iso: Array.isArray(f.iso) ? f.iso.filter((l) => !same(l, name)) : undefined });
}

/** A change made on one or more rows at once. A reference's layers take On, Print and colour only; the architect's On,
 * Freeze, Lock and colour (their On kept in `archOn`). */
export function applyLayerPatch(p: Project, file: string, rows: LayerRef[], patch: LayerPatch): Project {
  let q = p;
  const has = (k: keyof LayerPatch) => k in patch;
  const archOn: Record<string, boolean | undefined> = {};
  for (const r of rows) {
    if (r.group === 'ref') {
      const s: Parameters<typeof withRefLayer>[4] = {};
      if (has('on')) s.hidden = !patch.on;
      if (has('print')) s.noPrint = !patch.print;
      if (has('color')) s.color = patch.color;
      if (Object.keys(s).length && r.ref) q = withRefLayer(q, file, r.ref, r.layer ?? r.name, s);
      continue;
    }
    const s: LayerStyle = {};
    if (has('on')) { if (r.group === 'arch') archOn[r.name] = r.drawingOn === !!patch.on ? undefined : !!patch.on; else s.hidden = !patch.on; }
    if (has('freeze')) s.freeze = patch.freeze;
    if (has('lock')) s.lock = patch.lock;
    if (has('color')) s.color = patch.color;
    if (r.group === 'drawn') {
      if (has('print')) s.noPrint = !patch.print;
      if (has('lt')) s.lt = patch.lt;
      if (has('lw')) s.lw = patch.lw;
    }
    if (Object.keys(s).length) q = withLayerStyle(q, file, r.name, s);
  }
  if (Object.keys(archOn).length) {
    const before = layerFileOf(q, file).archOn ?? {};
    const kept = Object.entries(before).filter(([k]) => !Object.keys(archOn).some((n) => same(n, k)));
    const set = [...kept, ...Object.entries(archOn).filter((e): e is [string, boolean] => e[1] !== undefined)];
    q = withLayerFile(q, file, { archOn: set.length ? Object.fromEntries(set) : undefined });
  }
  return q;
}

/** What a layer state keeps of each row: On, Freeze, Lock and colour. */
export const snapshotOf = (rows: (LayerRef & LayerSnap)[]): Record<string, LayerSnap> =>
  Object.fromEntries(rows.map((r) => [r.name, { on: r.on, ...(r.freeze ? { freeze: true } : {}), ...(r.lock ? { lock: true } : {}), ...(r.color ? { color: r.color } : {}) }]));
/** The rows put back as the snapshot has them (rows it does not name stay as they are). The current layer is never
 * frozen: it stays thawed, so new objects do not go on a layer that cannot be seen (`kept` names it). */
export function restoreSnapshot(p: Project, file: string, rows: LayerRef[], snap: Record<string, LayerSnap>): { project: Project; kept?: string } {
  let q = p, kept: string | undefined;
  const current = currentLayerOf(p, file);
  for (const r of rows) {
    const s = snap[r.name] ?? Object.entries(snap).find(([k]) => same(k, r.name))?.[1];
    if (!s) continue;
    const freeze = s.freeze && !(r.group === 'drawn' && same(r.name, current));
    if (s.freeze && !freeze) kept = r.name;
    q = applyLayerPatch(q, file, [r], { on: s.on, freeze, lock: s.lock, color: s.color });
  }
  return { project: q, kept };
}

/** Layer states: saved under a name (the same name replaces it), restored, deleted. */
export function withSavedState(p: Project, file: string, name: string, rows: (LayerRef & LayerSnap)[]): Project {
  const list = (layerFileOf(p, file).states ?? []).filter((s) => !same(s.name, name));
  return withLayerFile(p, file, { states: [...list, { name: name.trim(), layers: snapshotOf(rows) }] });
}
export function restoreState(p: Project, file: string, name: string, rows: LayerRef[]): { project: Project; kept?: string } | undefined {
  const s = layerFileOf(p, file).states?.find((x) => same(x.name, name));
  return s ? restoreSnapshot(p, file, rows, s.layers) : undefined;
}
export const withoutState = (p: Project, file: string, name: string) => withLayerFile(p, file, { states: layerFileOf(p, file).states?.filter((s) => !same(s.name, name)) });

/** Isolate: every layer but those kept turns off; the layers it turned off are kept for Unisolate. */
export function isolate(p: Project, file: string, rows: (LayerRef & LayerSnap)[], keep: string[]) {
  const others = rows.filter((r) => !keep.some((k) => same(k, r.name)) && r.on);
  const before = isoOf(p, file);
  const q = applyLayerPatch(p, file, others, { on: false });
  return { project: withLayerFile(q, file, { iso: [...before, ...others.map((r) => r.name).filter((n) => !before.some((b) => same(b, n)))] }), off: others.length };
}
/** Unisolate: the layers Isolate turned off back on — only those, and only their On (undefined when nothing was
 * isolated). What changed since (a colour, a lock, a layer turned off by hand) stays as it is. */
export function unisolate(p: Project, file: string, rows: LayerRef[]): Project | undefined {
  const iso = isoOf(p, file);
  if (!iso.length) return undefined;
  const back = rows.filter((r) => iso.some((n) => same(n, r.name)));
  return withLayerFile(applyLayerPatch(p, file, back, { on: true }), file, { iso: undefined });
}
/** The layers Isolate turned off (an older record that is not a list counts as none). */
const isoOf = (p: Project, file: string): string[] => { const v = layerFileOf(p, file).iso; return Array.isArray(v) ? v : []; };

/** Zoom extents without frozen layers: the box of the architect's lines on the layers kept, in drawing units (the
 * lines are relative to the origin). Undefined when none is kept. */
export function extentsOf(segs: ArrayLike<number>, segLayers: ArrayLike<number>, origin: [number, number], keep: (layer: number) => boolean): [number, number, number, number] | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < segLayers.length; i++) {
    if (!keep(segLayers[i])) continue;
    for (const k of [0, 2]) {
      const x = segs[i * 4 + k], y = segs[i * 4 + k + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x0 <= x1 ? [x0 + origin[0], y0 + origin[1], x1 + origin[0], y1 + origin[1]] : undefined;
}
