import { CAD_UNITS } from './cadUnits';
import type { LayerStyle } from './cadLayerStyle';
import type { Project } from '../types';

/** Design CAD → References: other drawings (structure, other services, a site plan) shown under a level's plan without
 * being copied in. Each plan file keeps its references: the file, where it sits (insertion point and rotation, in the
 * plan's drawing units, and a scale from the reference's units), how faded it shows, a clip outline, whether it prints
 * on the plan sheets, and its layers' styles (FILE|LAYER). The reference file is never changed, and its path stays on
 * this computer (src/components/cad/cadState.ts) like a plan's. 2D only.
 * - Overlay: shown on this plan only. Attach: the same here; the type is kept for when a saved drawing names it.
 * - Bind: only into Save DXF / DWG (the saved copy gets the lines on NAME$0$LAYER layers), never into the project. */

type Pt = [number, number];
export type RefType = 'overlay' | 'attach';
export interface CadRef {
  /** Unique on its plan; its layers show as NAME|LAYER. */
  name: string;
  file: string;
  type: RefType;
  /** Insertion point (plan drawing units), scale (reference units → plan units) and rotation (degrees). */
  at: Pt;
  scale: number;
  rot: number;
  /** Fade on screen, % (0–90). */
  fade: number;
  /** Prints on the plan sheets (References pen). */
  print: boolean;
  /** Kept in the list but not drawn. */
  unloaded?: boolean;
  /** Clip outline (plan drawing units, 3 or more corners): only what is inside shows. */
  clip?: Pt[];
  /** Its layers' styles by the reference's own layer name: on / off, screen colour, print. */
  layers?: Record<string, Pick<LayerStyle, 'hidden' | 'color' | 'noPrint'>>;
  /** Listed from an external reference inside the plan's own drawing. */
  found?: boolean;
}

const keyOf = (file: string) => file.trim().toLowerCase();
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The references of a plan file. */
export const refsOf = (p: Project, file: string | undefined): CadRef[] => (file ? p.cadRefs?.[keyOf(file)] ?? [] : []);

function withList(p: Project, file: string, list: CadRef[]): Project {
  const all = { ...(p.cadRefs ?? {}) };
  if (list.length) all[keyOf(file)] = list; else delete all[keyOf(file)];
  const { cadRefs: _old, ...rest } = p;
  return Object.keys(all).length ? { ...rest, cadRefs: all } : rest;
}

/** A name for a reference of `file` not yet used on the plan: the file's name without its extension, else with a number. */
export function refName(p: Project, host: string, file: string): string {
  const base = file.replace(/^.*[\\/]/, '').replace(/\.(dwg|dxf)$/i, '').trim().replace(/[|$<>/\\":;?*=`]/g, '_') || 'REF';
  const used = new Set(refsOf(p, host).map((r) => r.name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; ; i += 1) if (!used.has(`${base}-${i}`.toLowerCase())) return `${base}-${i}`;
}

/** The project with `ref` on the plan `host` (one of the same name is replaced). */
export function withRef(p: Project, host: string, ref: CadRef): Project {
  const list = refsOf(p, host);
  const i = list.findIndex((r) => same(r.name, ref.name));
  return withList(p, host, i < 0 ? [...list, ref] : list.map((r, k) => (k === i ? ref : r)));
}
/** The project with a reference changed; `undefined` in the patch clears a field. */
export function updateRef(p: Project, host: string, name: string, patch: Partial<CadRef>): Project {
  const r = refsOf(p, host).find((x) => same(x.name, name));
  if (!r) return p;
  const next = { ...r, ...patch } as CadRef & Record<string, unknown>;
  for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete next[k];
  return withRef(p, host, next);
}
/** Detach: the project without the reference (the file is not touched). */
export const withoutRef = (p: Project, host: string, name: string): Project => withList(p, host, refsOf(p, host).filter((r) => !same(r.name, name)));

/** The style of one of a reference's layers (by its own name, without case). */
export function refLayerStyle(r: CadRef, layer: string): Pick<LayerStyle, 'hidden' | 'color' | 'noPrint'> {
  const l = r.layers ?? {};
  return l[layer] ?? Object.entries(l).find(([k]) => k.toLowerCase() === layer.toLowerCase())?.[1] ?? {};
}
/** The project with a reference layer's style changed (blank fields drop out). */
export function withRefLayer(p: Project, host: string, name: string, layer: string, patch: Pick<LayerStyle, 'hidden' | 'color' | 'noPrint'>): Project {
  const r = refsOf(p, host).find((x) => same(x.name, name));
  if (!r) return p;
  const layers = { ...(r.layers ?? {}) };
  const merged = Object.fromEntries(Object.entries({ ...refLayerStyle(r, layer), ...patch }).filter(([, v]) => v !== undefined && v !== '' && v !== false));
  for (const k of Object.keys(layers)) if (k.toLowerCase() === layer.toLowerCase()) delete layers[k];
  if (Object.keys(merged).length) layers[layer] = merged;
  const { layers: _old, ...rest } = r;
  return withRef(p, host, Object.keys(layers).length ? { ...rest, layers } : rest);
}

/** How a reference's layer shows on the plan: NAME|LAYER. Bound into a saved drawing: NAME$0$LAYER. */
export const refLayerName = (r: Pick<CadRef, 'name'>, layer: string) => `${r.name}|${layer}`;
export const boundLayerName = (r: Pick<CadRef, 'name'>, layer: string) => `${r.name}$0$${layer}`;

/** Metres per drawing unit of an INSUNITS code; undefined when the drawing does not say. */
const metresOf = (insunits: number | undefined) => CAD_UNITS.find((u) => u.code === insunits)?.m;
/** The scale from a reference's units to the plan's (m → mm gives 1000); 1 when either does not say its units. */
export function unitScale(refUnits: number | undefined, hostUnits: number | undefined): number {
  const a = metresOf(refUnits), b = metresOf(hostUnits);
  return a && b ? +(a / b).toPrecision(12) : 1;
}

/** Whether a reference prints by default: the structure (and the architect's background) yes, other services no. */
export const printsByDefault = (file: string) => /(^|[^a-z])(str|struct|grid|column|arch)/i.test(file.replace(/\.(dwg|dxf)$/i, ''));

/** A new reference as Attach (XA) sets it up: at the same origin, scaled from the units, not rotated, faded 50 %. */
export function newRef(p: Project, host: string, file: string, refUnits?: number, hostUnits?: number): CadRef {
  return { name: refName(p, host, file), file, type: 'overlay', at: [0, 0], scale: unitScale(refUnits, hostUnits), rot: 0, fade: 50, print: printsByDefault(file) };
}

/** The file name of a reference found inside the plan's drawing: from its saved path, else its name (.dwg added). */
export function xrefFile(saved: string, name: string): string {
  const file = saved.trim().split(/[\\/]+/).filter(Boolean).pop() || name.trim();
  return !file || /\.(dwg|dxf)$/i.test(file) ? file : `${file}.dwg`;
}

/** Where to look for a reference found inside the plan's own drawing, first to last: the path saved in the drawing,
 * that path from the plan's folder when it is relative (./ or ../), the file in the plan's folder, then in a folder of
 * the plan's folder named like the saved path's last folder (e.g. Xref). Paths saved on Windows (\) work from a Mac. */
export function xrefCandidates(saved: string, name: string, hostPath?: string): string[] {
  const s = saved.trim(), parts = s.split(/[\\/]+/).filter(Boolean), file = xrefFile(saved, name);
  if (!file) return [];
  const absolute = /^([a-z]:[\\/]|[\\/])/i.test(s);
  const out: string[] = [];
  if (absolute && /\.(dwg|dxf)$/i.test(s)) out.push(s);
  if (hostPath) {
    const sep = /^[a-z]:\\|^\\\\/i.test(hostPath) || (hostPath.includes('\\') && !hostPath.startsWith('/')) ? '\\' : '/';
    const dir = hostPath.split(/[\\/]/).slice(0, -1);
    const at = (rel: string[]) => {
      const d = [...dir];
      for (const x of rel) { if (x === '..') { if (d.length > 1) d.pop(); } else if (x !== '.') d.push(x); }
      return d.join(sep);
    };
    if (!absolute && parts.length > 1) out.push(at([...parts.slice(0, -1), file]));
    out.push(at([file]));
    const folder = parts.length > 1 ? parts[parts.length - 2] : '';
    if (folder && folder !== '.' && folder !== '..') out.push(at([folder, file]));
  }
  const seen = new Set<string>();
  return out.filter((x) => !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase()));
}

/** A reference found inside the plan's own drawing, set up as the drawing places it (its first insert), from the file
 * that was read for it (`file`, `refUnits`). */
export function refFromXref(p: Project, host: string, x: { name: string; overlay: boolean; inserts: { x: number; y: number; sx: number; rot: number }[] }, file: string, refUnits?: number, hostUnits?: number): CadRef {
  const ins = x.inserts[0] ?? { x: 0, y: 0, sx: 1, rot: 0 };
  return { ...newRef(p, host, file, refUnits, hostUnits), name: x.name, type: x.overlay ? 'overlay' : 'attach', at: [ins.x, ins.y], scale: +(ins.sx * unitScale(refUnits, hostUnits)).toPrecision(12), rot: +((ins.rot * 180) / Math.PI).toFixed(6), found: true };
}

/** A point of the reference (its own units) on the plan (plan units): scaled, rotated, then moved to the insertion point. */
export function refTransform(r: Pick<CadRef, 'at' | 'scale' | 'rot'>): (x: number, y: number) => Pt {
  const a = (r.rot * Math.PI) / 180, c = Math.cos(a) * r.scale, s = Math.sin(a) * r.scale;
  return (x, y) => [r.at[0] + c * x - s * y, r.at[1] + s * x + c * y];
}

/** Whether a point is inside an outline (even-odd). */
export function insideOutline([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The pieces of a segment inside an outline: it is cut where it crosses the outline's sides. */
export function clipToOutline(a: Pt, b: Pt, poly: Pt[]): [Pt, Pt][] {
  const dx = b[0] - a[0], dy = b[1] - a[1], ts = [0, 1];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[j], [x2, y2] = poly[i], ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((x1 - a[0]) * ey - (y1 - a[1]) * ex) / den, u = ((x1 - a[0]) * dy - (y1 - a[1]) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((m, n) => m - n);
  const at = (t: number): Pt => [a[0] + dx * t, a[1] + dy * t], out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    if (ts[i + 1] - ts[i] < 1e-9) continue;
    if (!insideOutline(at((ts[i] + ts[i + 1]) / 2), poly)) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1][0] - at(ts[i])[0]) < 1e-9 && Math.abs(last[1][1] - at(ts[i])[1]) < 1e-9) last[1] = at(ts[i + 1]);
    else out.push([at(ts[i]), at(ts[i + 1])]);
  }
  return out;
}

/** A reference drawing as read: its lines (x1, y1, x2, y2 in its own units, absolute), the layer of each, its layers
 * (name and colour) and units. Kept in memory while the app runs (a reference is read again after a restart). */
export interface RefGeometry {
  file: string;
  units: number;
  segs: Float64Array;
  segLayers: Uint16Array;
  layers: { name: string; rgb: number }[];
  /** When the file was last changed, where the desktop app can tell; the size as a fallback. */
  stamp?: string;
}
/** A reference placed on its plan: lines in plan units (absolute), clipped, on the layers that show; the layer of each
 * (an index into the geometry's layers). */
export interface PlacedRef { segs: Float64Array; segLayers: Uint16Array }

/** The reference's lines on the plan: transformed, clipped to its outline, without layers that are off (or, `forPrint`,
 * set not to print). */
export function placeRef(g: RefGeometry, r: CadRef, forPrint = false): PlacedRef {
  const T = refTransform(r), clip = r.clip && r.clip.length >= 3 ? r.clip : undefined;
  const off = g.layers.map((l) => { const st = refLayerStyle(r, l.name); return !!st.hidden || (forPrint && !!st.noPrint); });
  const out: number[] = [], lay: number[] = [];
  for (let i = 0; i < g.segLayers.length; i++) {
    const li = g.segLayers[i];
    if (off[li]) continue;
    const a = T(g.segs[i * 4], g.segs[i * 4 + 1]), b = T(g.segs[i * 4 + 2], g.segs[i * 4 + 3]);
    for (const [p, q] of clip ? clipToOutline(a, b, clip) : [[a, b] as [Pt, Pt]]) { out.push(p[0], p[1], q[0], q[1]); lay.push(li); }
  }
  return { segs: Float64Array.from(out), segLayers: Uint16Array.from(lay) };
}

/** References read in this session, by file (lower case), so the plan sheets can print them. */
const geometry = new Map<string, RefGeometry>();
export const refGeometry = (file: string) => geometry.get(keyOf(file));
export const keepRefGeometry = (g: RefGeometry) => { geometry.set(keyOf(g.file), g); };
export const dropRefGeometry = (file: string) => { geometry.delete(keyOf(file)); };

/** A reference's status in the manager: drawn, changed on disk since it was read, unloaded, or its file not found. */
export type RefStatus = 'loaded' | 'changed' | 'unloaded' | 'missing';
export const REF_STATUS: Record<RefStatus, string> = { loaded: 'Loaded', changed: 'Changed — reload', unloaded: 'Unloaded', missing: 'Not found' };

/** The references of a plan that print on its sheets, each with its lines (metres) or why it cannot print. */
export function printedRefs(p: Project, host: string, metresPerUnit: number): { ref: CadRef; segs?: Float64Array; segLayers?: Uint16Array; layerNames?: string[]; missing?: boolean }[] {
  return refsOf(p, host).filter((r) => r.print && !r.unloaded).map((ref) => {
    const g = refGeometry(ref.file);
    if (!g) return { ref, missing: true };
    const placed = placeRef(g, ref, true);
    return { ref, segs: placed.segs.map((v) => v * metresPerUnit), segLayers: placed.segLayers, layerNames: g.layers.map((l) => l.name) };
  });
}

/** Snap points of references on the plan (endpoints 1, midpoints 2, as the engine numbers them), indexed on a grid:
 * the nearest within `r` of (x, y) (plan units, absolute). References cannot be picked, but they can be snapped to. */
export function refSnaps(list: PlacedRef[]): (x: number, y: number, r: number) => { p: Pt; kind: number } | undefined {
  const pts: number[] = [];
  for (const { segs } of list) {
    for (let i = 0; i + 3 < segs.length; i += 4) pts.push(segs[i], segs[i + 1], 1, segs[i + 2], segs[i + 3], 1, (segs[i] + segs[i + 2]) / 2, (segs[i + 1] + segs[i + 3]) / 2, 2);
  }
  if (!pts.length) return () => undefined;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 3) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  const cell = Math.max(x1 - x0, y1 - y0, 1e-9) / 256, cells = new Map<number, number[]>();
  const key = (cx: number, cy: number) => cx * 1024 + cy;
  for (let i = 0; i < pts.length; i += 3) {
    const k = key(Math.floor((pts[i] - x0) / cell), Math.floor((pts[i + 1] - y0) / cell));
    const c = cells.get(k);
    if (c) c.push(i); else cells.set(k, [i]);
  }
  return (x, y, r) => {
    const reach = Math.ceil(r / cell), cx = Math.floor((x - x0) / cell), cy = Math.floor((y - y0) / cell);
    let best: { p: Pt; kind: number } | undefined, bd = r;
    const look = (list: number[] | undefined) => {
      for (const k of list ?? []) {
        const d = Math.hypot(pts[k] - x, pts[k + 1] - y);
        if (d <= bd) { bd = d; best = { p: [pts[k], pts[k + 1]], kind: pts[k + 2] }; }
      }
    };
    // Zoomed far out the reach covers many cells: then every cell is looked at once.
    if ((2 * reach + 1) ** 2 > cells.size) { for (const list of cells.values()) look(list); return best; }
    for (let i = Math.max(0, cx - reach); i <= Math.min(256, cx + reach); i++) for (let j = Math.max(0, cy - reach); j <= Math.min(256, cy + reach); j++) look(cells.get(key(i, j)));
    return best;
  };
}
