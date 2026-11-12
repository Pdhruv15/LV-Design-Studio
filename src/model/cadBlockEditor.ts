import { toDxf, type DxfPrimitive } from '../docs/dxf';
import { blockDefOf, blockDefsOf, withBlockDef, type CadBlockDef } from './cadBlocks';
import { withCurrentLayer } from './cadLayerState';
import { segmentsOf, sketchOf, withSketchItems } from './cadSketch';
import type { Project, SketchItem } from '../types';

/** Design CAD → Block editor (BEDIT): a block drawn here opened as a drawing of its own, its base point at the origin,
 * edited with every drawing tool, then saved back into the block (BSAVE): each insert of it shows the new objects.
 * The drawing it is edited in holds the block's objects as drawn objects; the other blocks of its drawing are copied
 * in, so blocks inside the block show and can be inserted; the base point and the block's extents as opened are drawn
 * on BE-REF, which is not part of the block. New objects go on layer 0, so in each insert they take the insert's layer.
 * BCLOSE closes it and takes the copies out of the project. */

type Pt = [number, number];
/** The layer of the base point mark (part of the editor's drawing, never of the block). */
export const BE_LAYER = 'BE-REF';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** The editor's drawing of a block: "Block NAME = DRAWING.dxf" (a block name has no "=", so the first " = " splits it). */
export const blockEditorFile = (name: string, host: string) => `Block ${name} = ${host}.dxf`;
/** The block and its drawing an editor's drawing is of; undefined for any other drawing. */
export function blockEditorOf(file: string | undefined): { name: string; host: string } | undefined {
  const m = file ? /^Block (.+?) = (.+)\.dxf$/i.exec(file) : null;
  return m ? { name: m[1], host: m[2] } : undefined;
}
export const isBlockEditorFile = (file: string | undefined) => !!blockEditorOf(file);

/** The block's objects without their ids, in their order (what BSAVE compares to see a change). */
const shape = (items: readonly SketchItem[]) => JSON.stringify(items.map(({ id: _id, ...rest }) => rest));

/** The extents of objects (drawing units), the base point included; a unit square round it when there are none. */
function extentsOf(items: readonly SketchItem[], defs: CadBlockDef[]): [number, number, number, number] {
  const pts: Pt[] = [[0, 0], ...items.flatMap((it) => { const s = segmentsOf(it, 0.001, defs); return s.length ? s.flat() : it.pts; })];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const b: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return b[2] - b[0] > 0 || b[3] - b[1] > 0 ? b : [-0.5, -0.5, 0.5, 0.5];
}

/** The editor's own drawing: a cross and a circle at the base point with its label, and the block's extents as opened
 * (dashed in grey on screen, for reference), on BE-REF, in the block's units. */
export function blockEditorDxf(def: CadBlockDef, defs: CadBlockDef[], hostUnits?: number): string {
  const [x0, y0, x1, y1] = extentsOf(def.items, defs), size = Math.max(x1 - x0, y1 - y0), r = size * 0.04, h = size * 0.03;
  const items: DxfPrimitive[] = [
    { type: 'line', layer: BE_LAYER, x1: -2 * r, y1: 0, x2: 2 * r, y2: 0 }, { type: 'line', layer: BE_LAYER, x1: 0, y1: -2 * r, x2: 0, y2: 2 * r },
    { type: 'circle', layer: BE_LAYER, x: 0, y: 0, r },
    { type: 'text', layer: BE_LAYER, x: 2.5 * r, y: -2.5 * r - h, height: h, text: `BASE POINT OF ${def.name.toUpperCase()} (0, 0) - BE-REF IS NOT PART OF THE BLOCK` },
    { type: 'polyline', layer: BE_LAYER, closed: true, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }
  ];
  return toDxf(items, { [BE_LAYER]: 8 }, { insunits: def.units ?? hostUnits ?? 4 });
}

/** Opens a block of a drawing in the block editor: its objects as the editor drawing's drawn objects (ids from S1), and
 * the drawing's other blocks copied in. Undefined when the drawing has no such block. */
export function openBlockEditor(p: Project, host: string, name: string, hostUnits?: number): { project: Project; file: string; dxf: string; def: CadBlockDef } | undefined {
  const defs = blockDefsOf(p, host), def = blockDefOf(defs, name);
  if (!def) return undefined;
  const file = blockEditorFile(def.name, host);
  let project = withSketchItems(p, file, def.items.map((it, i) => ({ ...it, id: `S${i + 1}` })));
  for (const d of defs) if (!same(d.name, def.name)) project = withBlockDef(project, file, d);
  project = withCurrentLayer(project, file, '0');
  return { project, file, dxf: blockEditorDxf(def, defs, hostUnits), def };
}

/** Whether the editor's objects differ from the block as it is saved. */
export function blockEditorChanged(p: Project, file: string): boolean {
  const be = blockEditorOf(file), def = be ? blockDefOf(blockDefsOf(p, be.host), be.name) : undefined;
  return !!def && shape(sketchOf(p, file)) !== shape(def.items);
}

/** BSAVE: the editor's objects saved into the block (its other fields kept), and any block inserted in the editor that
 * its drawing does not have yet added to it. The project, how many inserts of it the drawing has, and a line about it. */
export function saveBlockEditor(p: Project, file: string): { project: Project; message: string; changed: boolean } {
  const be = blockEditorOf(file), host = be?.host ?? '';
  const def = be ? blockDefOf(blockDefsOf(p, host), be.name) : undefined;
  if (!be || !def) return { project: p, message: 'BSAVE  Not a block editor drawing: open a block with BEDIT.', changed: false };
  const items = sketchOf(p, file).map((it, i) => ({ ...it, id: `b${i + 1}` }));
  if (shape(items) === shape(def.items)) return { project: p, message: `BSAVE  "${def.name}" has no changes to save.`, changed: false };
  if (items.some((it) => it.kind === 'insert' && it.block && same(it.block, def.name))) return { project: p, message: `BSAVE  "${def.name}" cannot hold an insert of itself: erase it first.`, changed: false };
  let project = withBlockDef(p, host, { ...def, items });
  const added: string[] = [];
  for (const d of blockDefsOf(p, file)) if (!blockDefOf(blockDefsOf(project, host), d.name)) { project = withBlockDef(project, host, d); added.push(d.name); }
  const n = sketchOf(p, host).filter((it) => it.kind === 'insert' && it.block && same(it.block, def.name)).length;
  return {
    project, changed: true,
    message: `BSAVE  "${def.name}" saved: ${items.length} object${items.length === 1 ? '' : 's'} · ${n} insert${n === 1 ? '' : 's'} in ${host} updated${added.length ? ` · block${added.length === 1 ? '' : 's'} ${added.map((x) => `"${x}"`).join(', ')} added to ${host}` : ''}`
  };
}

/** BCLOSE: the editor's copies taken out of the project: its objects, the blocks copied in, its layer settings. */
export function closeBlockEditor(p: Project, file: string): Project {
  const key = file.trim().toLowerCase(), drop = <T>(r: Record<string, T> | undefined) => (r && Object.keys(r).some((k) => k.toLowerCase() === key) ? Object.fromEntries(Object.entries(r).filter(([k]) => k.toLowerCase() !== key)) : r);
  const next = withSketchItems(p, file, []);
  const tables = (next.cadBlockDefs ?? []).filter((t) => !same(t.file, file));
  const { cadBlockDefs: _defs, cadLayerFile, cadLayerStyle, ...rest } = next;
  const lf = drop(cadLayerFile), ls = drop(cadLayerStyle);
  return { ...rest, ...(tables.length ? { cadBlockDefs: tables } : {}), ...(lf && Object.keys(lf).length ? { cadLayerFile: lf } : {}), ...(ls && Object.keys(ls).length ? { cadLayerStyle: ls } : {}) };
}
