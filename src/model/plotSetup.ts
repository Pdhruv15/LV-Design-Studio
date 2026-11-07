import type { DrawingSheet } from './drawingSet';
import type { Project } from '../types';

/** Design CAD → Sheets → Plot: how sheets print. A pen table gives each kind of line its width (mm on paper) and ink
 * (black, or a grey); each sheet has a page setup (its paper and scale are the sheet's own size and scale), and the set
 * a default. Printing stays black-and-white. A CTB (colour-dependent plot style table) can be imported: the
 * pens then take the widths it gives the colours the app's DXF layers use. */

export type PenKey = 'frame' | 'title' | 'arch' | 'refs' | 'devices' | 'trays' | 'routes' | 'sketch' | 'hatch' | 'sld' | 'bus';
/** A pen: width in mm (0 = as the drawing has it), ink in % of black (100 = black). */
export interface Pen { w: number; grey: number }
export interface PenTable { id: string; name: string; pens: Record<PenKey, Pen>; ctb?: string }
/** A sheet's page setup (blank = the set's default): the pen table, whether lineweights print, the plot stamp, and
 * whether a plan sheet prints the drawn work (Design CAD lines, hatches and text; blank = it does). */
export interface PlotSetup { pens?: string; weights?: 'pens' | 'thin'; stamp?: boolean; drawn?: boolean }
export interface ProjectPlot { tables?: PenTable[]; defaults?: PlotSetup }

/** ISO pen widths (mm). */
export const PEN_WIDTHS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2];
export const PEN_INKS = [100, 80, 60, 45, 30];
export const PEN_LABEL: Record<PenKey, string> = {
  frame: 'Sheet frame and title block outline', title: 'Title block, legend and table lines', arch: "Architect's plan (room outlines)", refs: 'References (other drawings under the plan)',
  devices: 'Devices and DBs', trays: 'Cable trays', routes: 'Cable routes and wiring',
  sketch: 'Your drawn lines (text, dimensions, leaders)', hatch: 'Hatch (pattern lines; Solid prints 30 %)', sld: 'SLD and diagram lines', bus: 'Busbars'
};
/** The colour each kind of line has on the app's DXF layers (src/docs/sheetDxf.ts): a CTB's widths go by it. */
export const PEN_ACI: Record<PenKey, number> = { frame: 7, title: 7, arch: 8, refs: 9, devices: 3, trays: 3, routes: 7, sketch: 7, hatch: 8, sld: 7, bus: 1 };

/** What the sheets print today; SLD lines and busbars as drawn. */
export const DEFAULT_PENS: PenTable = {
  id: 'lvds', name: 'LVDS Electrical',
  pens: { frame: { w: 0.7, grey: 100 }, title: { w: 0.25, grey: 100 }, arch: { w: 0.18, grey: 45 }, refs: { w: 0.13, grey: 30 }, devices: { w: 0.25, grey: 100 }, trays: { w: 0.5, grey: 100 }, routes: { w: 0.25, grey: 100 }, sketch: { w: 0.25, grey: 100 }, hatch: { w: 0.13, grey: 60 }, sld: { w: 0, grey: 100 }, bus: { w: 0, grey: 100 } }
};
export const PEN_KEYS = Object.keys(DEFAULT_PENS.pens) as PenKey[];
/** The thinnest pen: "All one thin line". */
const THIN = 0.13;

/** The project's pen tables: the default (as edited, if it was) and those added or imported. */
export function tablesOf(p: Project): PenTable[] {
  const own = (p.plot?.tables ?? []).map((t) => ({ ...t, pens: { ...DEFAULT_PENS.pens, ...t.pens } })); // a table saved before a pen was added takes its default
  return [own.find((t) => t.id === DEFAULT_PENS.id) ?? DEFAULT_PENS, ...own.filter((t) => t.id !== DEFAULT_PENS.id)];
}
/** A sheet's page setup: its own, else the set's default. */
export const plotOf = (p: Project, s?: Pick<DrawingSheet, 'plot'>): PlotSetup => ({ ...(p.plot?.defaults ?? {}), ...(s?.plot ?? {}) });
/** The pens a sheet prints with. */
export function pensFor(p: Project, s?: Pick<DrawingSheet, 'plot'>): Record<PenKey, Pen> {
  const setup = plotOf(p, s);
  const t = tablesOf(p).find((x) => x.id === setup.pens) ?? tablesOf(p)[0];
  if (setup.weights !== 'thin') return t.pens;
  return Object.fromEntries(PEN_KEYS.map((k) => [k, { ...t.pens[k], w: THIN }])) as Record<PenKey, Pen>;
}
/** A pen's ink as a CSS colour: black, or a grey. */
export function inkOf(pen: Pen): string {
  if (pen.grey >= 100) return '#000';
  const v = Math.round(255 * (1 - Math.max(0, pen.grey) / 100));
  return `#${v.toString(16).padStart(2, '0').repeat(3)}`;
}
const PX_PER_MM = 96 / 25.4;
/** SLD and diagram sheets: their lines and busbars at the pen widths on paper whatever the diagram's scale (none when
 * both print as drawn). */
export function diagramPenCss(pens: Record<PenKey, Pen>): string {
  const rule = (sel: string, pen: Pen) => (pen.w > 0 ? `${sel}{stroke-width:${+(pen.w * PX_PER_MM).toFixed(3)}px!important;vector-effect:non-scaling-stroke;${pen.grey < 100 ? `stroke:${inkOf(pen)}!important;` : ''}}` : '');
  return rule('.drawing svg .ln,.drawing svg .load,.drawing svg .tie-ln,.drawing svg line,.drawing svg path,.drawing svg polyline,.drawing svg rect,.drawing svg circle', pens.sld) + rule('.drawing svg .bus', pens.bus);
}

/** The plot stamp: file, date, revision and user, printed in the sheet's margin. */
export function plotStamp(s: Pick<DrawingSheet, 'number' | 'title'>, rev: string | undefined, user: string | undefined, now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return [`${s.number} - ${s.title}`, d, rev ? `Rev ${rev}` : '', user ?? ''].filter(Boolean).join(' · ');
}

/** The lineweights a CTB file can give (its lineweight index → mm), as CAD programs list them. */
const CTB_WEIGHTS = [0, 0.05, 0.09, 0.1, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.53, 0.6, 0.65, 0.7, 0.8, 0.9, 1, 1.06, 1.2, 1.4, 1.58, 2, 2.11];
export interface Ctb { /** By ACI colour 1–255: width in mm (undefined: the object's own) and screening (% ink). */ colours: Record<number, { w?: number; grey: number }> }

/** Reads a CTB file: a short text header, then the plot styles compressed with zlib. */
export async function parseCtb(bytes: Uint8Array): Promise<Ctb> {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 48));
  if (!/^PIAFILEVERSION/.test(head) || !/CTB/i.test(head)) throw new Error('Not a CTB plot style table (colour-dependent). STB files are not read yet.');
  let at = 48;
  while (at < Math.min(bytes.length - 1, 80) && !(bytes[at] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(bytes[at + 1]))) at += 1;
  if (at >= Math.min(bytes.length - 1, 80)) throw new Error('The CTB file could not be read (no compressed data).');
  const stream = new Blob([bytes.slice(at) as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  const text = await new Response(stream).text();
  const custom = /custom_lineweight_table\s*\{([^}]*)\}/.exec(text)?.[1];
  const table = custom ? [...custom.matchAll(/(\d+)\s*=\s*([\d.]+)/g)].reduce<number[]>((t, m) => { t[Number(m[1])] = Number(m[2]); return t; }, []) : CTB_WEIGHTS;
  const colours: Ctb['colours'] = {};
  const body = /plot_style\s*\{([\s\S]*)\}\s*custom_lineweight_table/.exec(text)?.[1] ?? text;
  for (const m of body.matchAll(/(\d+)\s*\{([^}]*)\}/g)) {
    const i = Number(m[1]) + 1, f = m[2];
    const lw = Number(/lineweight\s*=\s*(\d+)/.exec(f)?.[1] ?? 255), scr = Number(/screening\s*=\s*(\d+)/.exec(f)?.[1] ?? 100);
    if (i >= 1 && i <= 255) colours[i] = { ...(lw !== 255 && table[lw] !== undefined ? { w: table[lw] } : {}), grey: scr };
  }
  if (!Object.keys(colours).length) throw new Error('The CTB file has no plot styles.');
  return { colours };
}
/** A pen table from a CTB: each kind of line takes the width and screening of its layer's colour; a colour that uses the
 * object's own lineweight keeps the default pen. */
export function tableFromCtb(id: string, name: string, ctb: Ctb): PenTable {
  const pens = Object.fromEntries(PEN_KEYS.map((k) => {
    const c = ctb.colours[PEN_ACI[k]], d = DEFAULT_PENS.pens[k];
    return [k, { w: c?.w !== undefined && c.w > 0 ? c.w : d.w, grey: c ? Math.min(d.grey, c.grey) : d.grey }];
  })) as Record<PenKey, Pen>;
  return { id, name, pens, ctb: name };
}

/** The project with a pen table saved (added, or in place of the one with its ID); the default saved unchanged drops
 * out again. */
export function withTable(p: Project, t: PenTable): Project {
  const rest = (p.plot?.tables ?? []).filter((x) => x.id !== t.id);
  const same = t.id === DEFAULT_PENS.id && JSON.stringify(t.pens) === JSON.stringify(DEFAULT_PENS.pens) && t.name === DEFAULT_PENS.name;
  return { ...p, plot: { ...(p.plot ?? {}), tables: same ? rest : [...rest, t] } };
}
export const withDefaults = (p: Project, d: PlotSetup): Project => ({ ...p, plot: { ...(p.plot ?? {}), defaults: d } });
/** An ID for a new table. */
export const newTableId = (p: Project) => `pt${(p.plot?.tables ?? []).reduce((m, t) => Math.max(m, Number(/^pt(\d+)$/.exec(t.id)?.[1] ?? 0)), 0) + 1}`;
