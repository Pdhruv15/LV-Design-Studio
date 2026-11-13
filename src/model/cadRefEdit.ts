import { blockDefOf, blockDefsOf, placed, unplaced, withBlockDef } from './cadBlocks';
import { addSketch, sketchOf, withSketchItems } from './cadSketch';
import type { Project, SketchItem } from '../types';

/** Design CAD → Edit block in place (REFEDIT): one insert of a block drawn here taken apart where it stands, its
 * objects edited among the drawing's (the rest faded and locked), then put back as the block (REFCLOSE Save: every
 * insert of it shows the change) or as it was (Discard). Objects drawn meanwhile join the block. The session is kept in
 * the project, so it lasts through a save and an undo goes back over its start. One at a time in a project. */

type Pt = [number, number];
export interface RefEditSession {
  file: string;
  /** The insert taken out, as it was. */
  insert: SketchItem;
  /** Where it stood among the drawing's objects (its draw order). */
  index: number;
  /** The drawing's other objects (their ids): not part of the block, faded and not picked. */
  others: string[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const transformOf = (it: SketchItem) => ({ k: it.sc && it.sc > 0 ? it.sc : 1, a: it.rot ?? 0, at: it.pts[0] as Pt });

/** The session of a drawing, if one of its blocks is being edited in place. */
export const refEditOf = (p: Project, file: string | undefined): RefEditSession | undefined => (file && p.cadRefEdit && same(p.cadRefEdit.file, file) ? p.cadRefEdit : undefined);

/** The objects being edited: those of the drawing that were not there besides the block when it started. */
export function workingSet(p: Project, s: RefEditSession): SketchItem[] {
  const others = new Set(s.others);
  return sketchOf(p, s.file).filter((it) => !others.has(it.id));
}

/** REFEDIT on an insert: its block's objects placed where the insert shows them (scaled, turned, moved; their own
 * layers, colours and attribute definitions kept), the insert taken out, the session started. */
export function startRefEdit(p: Project, file: string, insertId: string): { project: Project; n: number; block: string } | { error: string } {
  if (p.cadRefEdit) return { error: `REFEDIT  "${p.cadRefEdit.insert.block}" is being edited in place${same(p.cadRefEdit.file, file) ? '' : ` in ${p.cadRefEdit.file}`}: REFCLOSE it first.` };
  const items = sketchOf(p, file), index = items.findIndex((it) => it.id === insertId), it = items[index];
  if (!it || it.kind !== 'insert') return { error: 'REFEDIT  Pick one block drawn here (an insert).' };
  const def = blockDefOf(blockDefsOf(p, file), it.block);
  if (!def) return { error: `REFEDIT  The block "${it.block ?? ''}" is not in this drawing.` };
  const { k, a, at } = transformOf(it);
  const others = items.filter((x) => x.id !== insertId).map((x) => x.id);
  let project = withSketchItems(p, file, items.filter((x) => x.id !== insertId));
  for (const child of def.items) { const { id: _id, ...rest } = placed(child, k, a, at); project = addSketch(project, file, rest).project; }
  return { project: { ...project, cadRefEdit: { file, insert: it, index, others } }, n: def.items.length, block: def.name };
}

/** REFCLOSE: the objects taken out of the drawing and the insert put back where it stood; with `save`, the block
 * redefined from them first (back in its own units about its base point; its other fields kept). */
export function closeRefEdit(p: Project, save: boolean): { project: Project; message: string } | { error: string } {
  const s = p.cadRefEdit;
  if (!s) return { error: 'REFCLOSE  No block is being edited in place (REFEDIT starts it).' };
  const name = s.insert.block ?? '', def = blockDefOf(blockDefsOf(p, s.file), name);
  const work = workingSet(p, s);
  if (save && work.some((it) => it.kind === 'insert' && it.block && same(it.block, name))) return { error: `REFCLOSE  "${name}" cannot hold an insert of itself: erase it first.` };
  const others = sketchOf(p, s.file).filter((it) => !work.includes(it));
  const back = [...others.slice(0, s.index), s.insert, ...others.slice(s.index)];
  let project = withSketchItems(p, s.file, back);
  const { cadRefEdit: _done, ...rest } = project;
  project = rest;
  if (!save || !def) return { project, message: `REFCLOSE  Edit of "${name}" discarded: the block is as it was` };
  const { k, a, at } = transformOf(s.insert);
  const items = work.map((it, i) => ({ ...unplaced(it, k, a, at), id: `b${i + 1}` }));
  project = withBlockDef(project, s.file, { ...def, items });
  const n = back.filter((it) => it.kind === 'insert' && it.block && same(it.block, name)).length;
  return { project, message: `REFCLOSE  "${name}" saved: ${items.length} object${items.length === 1 ? '' : 's'} · ${n} insert${n === 1 ? '' : 's'} in ${s.file} updated` };
}
