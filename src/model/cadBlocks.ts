import type { Project, SketchItem } from '../types';

/** Design CAD → the drawing's own blocks (BLOCK, S9 of the 2D gap plan): a block definition is a name and the drawn
 * objects it is made of, kept relative to its base point; an insert (`kind: 'insert'`) places a block at pts[0],
 * turned by `rot` and scaled by `sc`. Blocks are kept per drawing, like the drawn objects (`cadBlockDefs`). This
 * module depends on nothing of the sketch model, so the sketch model can expand inserts through it. */

type Pt = [number, number];

/** A block: its name (unique in the drawing, case aside), the drawing's units when it was made (INSUNITS), a note about
 * it, its objects relative to the base point, and whether it may be exploded. */
export interface CadBlockDef { name: string; units?: number; description?: string; items: SketchItem[]; explodable?: boolean }
export interface CadBlockTable { file: string; defs: CadBlockDef[] }

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const blockDefsOf = (p: Pick<Project, 'cadBlockDefs'>, file: string): CadBlockDef[] => p.cadBlockDefs?.find((t) => same(t.file, file))?.defs ?? [];
export const blockDefOf = (defs: CadBlockDef[], name: string | undefined) => (name ? defs.find((d) => same(d.name, name)) : undefined);
/** The project with a block defined (or redefined: the inserts of that name then show the new objects). */
export function withBlockDef(p: Project, file: string, def: CadBlockDef): Project {
  const rest = (p.cadBlockDefs ?? []).filter((t) => !same(t.file, file));
  const defs = [...blockDefsOf(p, file).filter((d) => !same(d.name, def.name)), def];
  return { ...p, cadBlockDefs: [...rest, { file, defs }] };
}

/** What a block name may not contain (as the drawing programs refuse them). */
export const BAD_NAME_CHARS = /[<>/\\":;?*|=`]/;
/** Why a name cannot be a block's: blank, too long, a forbidden character, or one of the architect's blocks (which the
 * app does not redefine). A name already defined here is allowed: the caller asks whether to redefine it. */
export function blockNameError(name: string, archNames: string[] = []): string | undefined {
  const t = name.trim();
  if (!t) return 'Type a name for the block.';
  if (t.length > 255) return 'A block name has at most 255 characters.';
  if (BAD_NAME_CHARS.test(t)) return 'A block name cannot contain < > / \\ " : ; ? * | = or `.';
  if (archNames.some((n) => same(n, t))) return `The drawing already has a block "${t}" of its own: choose another name.`;
  return undefined;
}
/** An attribute definition drawn as text: on the drawing it shows its tag (in a block, its value). */
export const attdefAsText = (it: SketchItem, value?: string): SketchItem => ({ ...it, kind: 'text', text: value ?? it.tag ?? '' });
/** The attribute definitions of a block, in the order they were drawn (the order of the prompts). */
export const attdefsOf = (def: CadBlockDef | undefined): SketchItem[] => (def?.items ?? []).filter((it) => it.kind === 'attdef' && !!it.tag);
/** Those asked for on insert: not constant, not preset. */
export const askedAttdefs = (def: CadBlockDef | undefined): SketchItem[] => attdefsOf(def).filter((it) => !it.att?.constant && !it.att?.preset);
/** An attribute's value on an insert: the one set, else the definition's default (a constant one is always its default). */
export const attrValue = (ins: Pick<SketchItem, 'attrs'>, ad: SketchItem): string => (ad.att?.constant ? ad.text ?? '' : ins.attrs?.[ad.tag ?? ''] ?? ad.text ?? '');
/** The insert's words (its attribute values), for FIND and the Properties palette. */
export const insertPlainText = (ins: SketchItem, def: CadBlockDef | undefined) => attdefsOf(def).map((ad) => attrValue(ins, ad)).filter(Boolean).join('\n');
/** Whether an object can go into a block: trays and cable routes cannot (they belong to the schedules). */
export const blockable = (it: SketchItem) => !it.tray && !it.cable;

const rot = (p: Pt, a: number): Pt => { const s = Math.sin(a), k = Math.cos(a); return [p[0] * k - p[1] * s, p[0] * s + p[1] * k]; };
/** An object scaled by `k` about the origin, turned by `a` about it, then moved by `to` (its sizes scale, its angles
 * turn). */
function placed(it: SketchItem, k: number, a: number, to: Pt): SketchItem {
  const map = (p: Pt): Pt => { const q = rot([p[0] * k, p[1] * k], a); return [q[0] + to[0], q[1] + to[1]]; };
  const out: SketchItem = { ...it, pts: it.pts.map(map) };
  if (it.r !== undefined) out.r = it.r * k;
  if (it.h !== undefined) out.h = it.h * k;
  if (it.w !== undefined) out.w = it.w * k;
  if (it.cloud !== undefined) out.cloud = it.cloud * k;
  if (it.ax) out.ax = rot([it.ax[0] * k, it.ax[1] * k], a);
  if (it.kind === 'insert' && k !== 1) out.sc = (it.sc ?? 1) * k;
  if (it.look) out.look = Object.fromEntries(Object.entries(it.look).map(([key, v]) => [key, typeof v === 'number' && key !== 'decimals' ? v * k : v])) as typeof it.look;
  if (a) {
    if (it.kind === 'arc') { out.a0 = (it.a0 ?? 0) + a; out.a1 = (it.a1 ?? 0) + a; }
    if (it.kind === 'text' || it.kind === 'mtext' || it.kind === 'insert') out.rot = (it.rot ?? 0) + a;
    if (it.kind === 'dim' && it.dir !== undefined) out.dir = it.dir + a;
  }
  return out;
}

/** A block defined from drawn objects: the objects moved so that `base` is the origin, trays and cable routes left out. */
export function defineBlock(name: string, items: SketchItem[], base: Pt, more: Partial<Pick<CadBlockDef, 'units' | 'description' | 'explodable'>> = {}): CadBlockDef {
  return { name: name.trim(), items: items.filter(blockable).map((it) => placed(it, 1, 0, [-base[0], -base[1]])), explodable: true, ...more };
}

const MAX_DEPTH = 8;
/** The objects an insert shows, on the drawing: the block's objects scaled, turned and moved to the insertion point;
 * those on layer "0" take the insert's layer, those with no colour, linetype or lineweight of their own take the
 * insert's. Each carries the insert's id before its own (`S12:S3`), so picking one picks the insert. A block inside a
 * block is expanded in turn (eight deep at most); an insert of a block the drawing does not have shows nothing. */
export function expandInsert(it: SketchItem, defs: CadBlockDef[], depth = 0): SketchItem[] {
  const def = blockDefOf(defs, it.block);
  if (!def || depth >= MAX_DEPTH) return [];
  const k = it.sc && it.sc > 0 ? it.sc : 1, a = it.rot ?? 0;
  return def.items.flatMap((child0) => {
    // An attribute: its value as text where the definition sits; an invisible one is not drawn.
    if (child0.kind === 'attdef') { if (child0.att?.invisible) return []; }
    const child = child0.kind === 'attdef' ? attdefAsText(child0, attrValue(it, child0)) : child0;
    const own = placed(child, k, a, it.pts[0]);
    const styled: SketchItem = {
      ...own, id: `${it.id}:${child.id}`, layer: child.layer === '0' ? it.layer : child.layer,
      ...(own.color === undefined && it.color !== undefined ? { color: it.color } : {}), ...(own.lt === undefined && it.lt !== undefined ? { lt: it.lt } : {}), ...(own.lw === undefined && it.lw !== undefined ? { lw: it.lw } : {})
    };
    return styled.kind === 'insert' ? expandInsert(styled, defs, depth + 1) : [styled];
  });
}
/** The attributes of an insert as placed on the drawing, invisible ones included: for the DXF's ATTRIB entities. */
export function attributePlacements(it: SketchItem, defs: CadBlockDef[]): { ad: SketchItem; value: string; at: SketchItem }[] {
  const def = blockDefOf(defs, it.block);
  if (!def) return [];
  const k = it.sc && it.sc > 0 ? it.sc : 1, a = it.rot ?? 0;
  return attdefsOf(def).map((ad) => ({ ad, value: attrValue(it, ad), at: placed({ ...ad, layer: ad.layer === '0' ? it.layer : ad.layer }, k, a, it.pts[0]) }));
}
/** The drawn objects with every insert replaced by what it shows (for the canvas and the sheets). */
export const expandAll = (items: SketchItem[], defs: CadBlockDef[]): SketchItem[] => (defs.length ? items.flatMap((it) => (it.kind === 'insert' ? expandInsert(it, defs) : [it])) : items);
/** EXPLODE: the insert's objects as drawn objects of their own (their ids dropped, so they are added anew). */
export function explodeInsert(it: SketchItem, defs: CadBlockDef[]): Omit<SketchItem, 'id'>[] {
  return expandInsert(it, defs).map(({ id: _id, ...rest }) => rest);
}
/** The names of the blocks used by inserts among the objects (for the DXF: a BLOCK record each). */
export const insertedNames = (items: SketchItem[]) => [...new Set(items.filter((it) => it.kind === 'insert' && it.block).map((it) => it.block!))];
