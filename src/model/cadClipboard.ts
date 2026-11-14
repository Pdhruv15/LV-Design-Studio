import { scaled } from './cadEdit';
import { validCustom } from './cadHatch';
import { layerFileOf, withNewLayer } from './cadLayerState';
import { drawnLayers, layerStylesOf, LINETYPE_IDS, styleOf, withLayerStyle, type LayerStyle } from './cadLayerStyle';
import { moved, sketchOf, withSketchItems } from './cadSketch';
import { DIM_ARROWS } from './cadStyles';
import { TEXT_FRAMES, TEXT_JUSTS } from './cadText';
import { CAD_UNITS } from './cadUnits';
import type { Project, SketchItem } from '../types';

type Pt = [number, number];

/** Design CAD's clipboard (COPYCLIP, COPYBASE, PASTECLIP, PASTEORIG): drawn objects with a base point, as versioned
 * JSON, so they paste into another drawing, level or project. Read back strictly: an unknown kind or a bad field
 * refuses the whole payload; fields the app does not know are dropped. Devices are not drawn objects and do not come. */

export interface ClipPayload {
  app: 'lvds-cad';
  v: 1;
  /** INSUNITS code of the drawing copied from (4 mm, 5 cm, 6 m, 1 in, 2 ft). */
  units: number;
  base: Pt;
  /** The drawing copied from: PASTEORIG is refused there, and only there trays and cable routes keep their data. */
  file: string;
  items: Omit<SketchItem, 'id'>[];
  /** Colour, linetype, lineweight and print setting of the layers used, for a layer the target drawing lacks. */
  layers?: Record<string, Pick<LayerStyle, 'color' | 'lt' | 'lw' | 'noPrint'>>;
}

const KINDS = new Set<SketchItem['kind']>(['line', 'pline', 'circle', 'arc', 'text', 'dim', 'ellipse']);
const MAX_ITEMS = 20000, MAX_PTS = 100000, MAX_HOLES = 1000, MAX_TEXT = 10000, MAX_JSON = 20_000_000;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max = 255): v is string => typeof v === 'string' && v.length <= max;
const pt = (v: unknown): v is Pt => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The lower-left corner of the objects (circles and arcs by their radius): COPYCLIP's base point. */
export function lowerLeft(items: Pick<SketchItem, 'pts' | 'r'>[]): Pt {
  let x = Infinity, y = Infinity;
  for (const it of items) for (const q of it.pts) { x = Math.min(x, q[0] - (it.r ?? 0)); y = Math.min(y, q[1] - (it.r ?? 0)); }
  return Number.isFinite(x) ? [x, y] : [0, 0];
}

/** The payload for drawn objects copied from a drawing (in `insunits`), with the base point given. */
export function clipPayload(p: Project, file: string, items: SketchItem[], base: Pt, insunits: number): ClipPayload {
  const styles = layerStylesOf(p, file), layers: ClipPayload['layers'] = {};
  for (const name of new Set(items.map((it) => it.layer))) {
    const s = styleOf(styles, name), keep = { color: s.color, lt: s.lt, lw: s.lw, noPrint: s.noPrint };
    const set = Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined));
    if (Object.keys(set).length) layers[name] = set;
  }
  return { app: 'lvds-cad', v: 1, units: insunits, base, file, items: items.map(({ id: _id, ...rest }) => rest), ...(Object.keys(layers).length ? { layers } : {}) };
}

export const clipText = (c: ClipPayload) => JSON.stringify(c);

// ---- reading back

/** A dimension's look: the known fields of their types (src/model/cadSketch.ts DimLook). */
const LOOK_NUM = ['size', 'off', 'ext', 'decimals', 'scale', 'round', 'gap', 'dle'];
const LOOK_BOOL = ['trimZeros', 'comma', 'textFlat', 'hideExt1', 'hideExt2'];
const LOOK_ENUM: Record<string, readonly string[]> = {
  arrow: DIM_ARROWS.map((a) => a.id), arrow2: DIM_ARROWS.map((a) => a.id), unit: ['m', 'cm', 'mm'], textPos: ['above', 'centered', 'below'], textAlong: ['first', 'second']
};
function lookOf(v: unknown): SketchItem['look'] | null {
  if (!obj(v) || !LOOK_ENUM.arrow.includes(v.arrow as string) || !num(v.size) || !num(v.off) || !num(v.ext)) return null;
  const out: Record<string, unknown> = {};
  for (const k of LOOK_NUM) if (k in v) { if (!num(v[k])) return null; out[k] = v[k]; }
  for (const k of LOOK_BOOL) if (k in v) { if (typeof v[k] !== 'boolean') return null; out[k] = v[k]; }
  for (const [k, ok] of Object.entries(LOOK_ENUM)) if (k in v) { if (!ok.includes(v[k] as string)) return null; out[k] = v[k]; }
  for (const k of ['prefix', 'suffix']) if (k in v) { if (!str(v[k], 64)) return null; out[k] = v[k]; }
  return out as unknown as SketchItem['look'];
}

/** One drawn object read back, or null when anything in it is wrong. */
function itemOf(v: unknown): Omit<SketchItem, 'id'> | null {
  if (!obj(v) || !KINDS.has(v.kind as SketchItem['kind']) || !str(v.layer) || !(v.layer as string).trim()) return null;
  if (!Array.isArray(v.pts) || !v.pts.length || v.pts.length > MAX_PTS || !v.pts.every(pt)) return null;
  const out: Record<string, unknown> = { kind: v.kind, layer: v.layer, pts: v.pts.map((q: Pt) => [q[0], q[1]]) };
  const take = (k: string, ok: (x: unknown) => boolean) => { if (!(k in v) || v[k] === undefined) return true; if (!ok(v[k])) return false; out[k] = v[k]; return true; };
  const fine = ['r', 'a0', 'a1', 'h', 'rot', 'dir', 'ratio', 'cloud', 'lw'].every((k) => take(k, num))
    && ['closed', 'mask', 'leader'].every((k) => take(k, (x) => typeof x === 'boolean'))
    && take('text', (x) => str(x, MAX_TEXT)) && take('color', (x) => str(x, 64))
    && take('just', (x) => TEXT_JUSTS.some((j) => j.id === x)) && take('frame', (x) => TEXT_FRAMES.some((f) => f.id !== 'none' && f.id === x))
    && take('lt', (x) => LINETYPE_IDS.includes(x as never)) && take('ax', pt)
    && take('kn', (x) => obj(x) && Number.isInteger(x.n) && (x.legend === undefined || x.legend === true))
    && take('tray', (x) => obj(x) && num(x.widthMm) && x.widthMm > 0 && (x.service === undefined || str(x.service)) && (x.route === undefined || str(x.route)))
    && take('cable', (x) => obj(x) && str(x.feederId) && !!x.feederId)
    && take('hatch', (x) => obj(x) && str(x.pattern, 64) && num(x.scale) && num(x.angle) && (x.custom === undefined || validCustom(x.custom as never)) && (x.origin === undefined || pt(x.origin)))
    && take('holes', (x) => Array.isArray(x) && x.length <= MAX_HOLES && x.every((h) => Array.isArray(h) && h.length >= 3 && h.length <= MAX_PTS && h.every(pt)));
  // `assoc` is never read: a pasted hatch is not tied to the objects the copied one followed.
  if (!fine) return null;
  if ('look' in v && v.look !== undefined) { const l = lookOf(v.look); if (!l) return null; out.look = l; }
  const n = (out.pts as Pt[]).length;
  if ((v.kind === 'circle' || v.kind === 'arc') && !(num(out.r) && (out.r as number) > 0)) return null;
  if ((v.kind === 'line' || v.kind === 'pline' || v.kind === 'dim') && n < 2) return null;
  if (v.kind === 'text' && typeof out.text !== 'string') return null;
  return out as unknown as Omit<SketchItem, 'id'>;
}

function layerStyleOf(v: unknown): Pick<LayerStyle, 'color' | 'lt' | 'lw' | 'noPrint'> | null {
  if (!obj(v)) return null;
  const out: Record<string, unknown> = {};
  if (v.color !== undefined) { if (!str(v.color, 64)) return null; out.color = v.color; }
  if (v.lt !== undefined) { if (!LINETYPE_IDS.includes(v.lt as never)) return null; out.lt = v.lt; }
  if (v.lw !== undefined) { if (!num(v.lw)) return null; out.lw = v.lw; }
  if (v.noPrint !== undefined) { if (typeof v.noPrint !== 'boolean') return null; out.noPrint = v.noPrint; }
  return out;
}

/** The payload in clipboard text, or why it is not one (text from elsewhere is simply "not drawn objects"). */
export function parseClip(text: string): { clip: ClipPayload } | { error: string } {
  if (text.length > MAX_JSON) return { error: 'The clipboard holds too much to paste.' };
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { error: 'The clipboard holds no drawn objects.' }; }
  if (!obj(v) || v.app !== 'lvds-cad') return { error: 'The clipboard holds no drawn objects.' };
  if (v.v !== 1) return { error: 'The objects were copied by a newer version of the app.' };
  if (!CAD_UNITS.some((u) => u.code === v.units) || !pt(v.base) || !str(v.file, 1024)) return { error: 'The clipboard data is damaged.' };
  if (!Array.isArray(v.items) || !v.items.length || v.items.length > MAX_ITEMS) return { error: 'The clipboard data is damaged.' };
  const items = v.items.map(itemOf);
  if (items.some((x) => !x)) return { error: 'The clipboard holds an object the app cannot read; nothing pasted.' };
  const layers: NonNullable<ClipPayload['layers']> = {};
  if (v.layers !== undefined) {
    if (!obj(v.layers)) return { error: 'The clipboard data is damaged.' };
    for (const [k, s] of Object.entries(v.layers)) { const l = layerStyleOf(s); if (!str(k) || !l) return { error: 'The clipboard data is damaged.' }; layers[k] = l; }
  }
  return { clip: { app: 'lvds-cad', v: 1, units: v.units as number, base: [v.base[0], v.base[1]], file: v.file as string, items: items as Omit<SketchItem, 'id'>[], ...(Object.keys(layers).length ? { layers } : {}) } };
}

// ---- pasting

/** Metres per unit of an INSUNITS code (one the app uses). */
const metresOf = (code: number) => CAD_UNITS.find((u) => u.code === code)?.m ?? 0.001;

/** The objects as they go into a drawing in `insunits`: converted from the source units, with the base point at `at`
 * (`'orig'`: the same coordinates). In another drawing trays and cable routes become plain polylines (`plain`). */
export function pastedItems(c: ClipPayload, file: string, insunits: number, at: Pt | 'orig'): { items: Omit<SketchItem, 'id'>[]; plain: number } {
  const k = metresOf(c.units) / metresOf(insunits), other = !same(c.file, file);
  const centre: Pt = at === 'orig' ? [0, 0] : c.base, to: Pt = at === 'orig' ? [0, 0] : at;
  let plain = 0;
  const items = c.items.map((it) => {
    let x = { ...it, id: '_' } as SketchItem;
    if (k !== 1) x = scaled(x, centre, k);
    x = moved(x, to[0] - centre[0], to[1] - centre[1]);
    const { id: _id, ...rest } = x;
    if (other && (rest.tray || rest.cable)) { plain += 1; delete rest.tray; delete rest.cable; }
    return rest;
  });
  return { items, plain };
}

/** The project with the objects pasted into a drawing as one change: new IDs, and a layer the drawing lacks added with
 * the style it had where it came from. */
export function withPasted(p: Project, file: string, c: ClipPayload, items: Omit<SketchItem, 'id'>[]): { project: Project; layersAdded: string[] } {
  let next = p;
  const have = drawnLayers(sketchOf(p, file), layerFileOf(p, file).layers), styles = layerStylesOf(p, file), layersAdded: string[] = [];
  for (const name of new Set(items.map((it) => it.layer))) {
    if (have.some((h) => same(h, name)) || Object.keys(styles).some((s) => same(s, name))) continue;
    next = withNewLayer(next, file, name);
    const st = c.layers?.[name];
    if (st) next = withLayerStyle(next, file, name, st);
    layersAdded.push(name);
  }
  const start = (next.cadSketch ?? []).flatMap((s) => s.items).reduce((m, it) => Math.max(m, Number(/^S(\d+)$/.exec(it.id)?.[1] ?? 0)), 0) + 1;
  const added = items.map((it, i) => ({ ...it, id: `S${start + i}` }) as SketchItem);
  return { project: withSketchItems(next, file, [...sketchOf(next, file), ...added]), layersAdded };
}
