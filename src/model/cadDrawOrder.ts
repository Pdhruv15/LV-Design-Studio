import type { SketchItem } from '../types';

/** Design CAD → draw order (DRAWORDER, TEXTTOFRONT; S7 of the 2D gap plan): the order of a drawing's drawn objects is the
 * order they are painted in, on the canvas, on the plan sheets and in the DXF / DWG saved (its entities are written
 * in this order). Later in the list is on top. The objects moved keep their order among themselves. */

const split = (items: SketchItem[], ids: Set<string>) => ({ moved: items.filter((it) => ids.has(it.id)), rest: items.filter((it) => !ids.has(it.id)) });

/** The objects on top of everything else. */
export function toFront(items: SketchItem[], ids: string[]): SketchItem[] {
  const { moved, rest } = split(items, new Set(ids));
  return [...rest, ...moved];
}
/** The objects under everything else. */
export function toBack(items: SketchItem[], ids: string[]): SketchItem[] {
  const { moved, rest } = split(items, new Set(ids));
  return [...moved, ...rest];
}
/** The objects just over the reference object(s): after the last of them. A reference among the moved objects is left
 * where it is. */
export function above(items: SketchItem[], ids: string[], refIds: string[]): SketchItem[] {
  const refs = new Set(refIds), { moved, rest } = split(items, new Set(ids.filter((id) => !refs.has(id))));
  const at = rest.reduce((m, it, i) => (refs.has(it.id) ? i : m), -1);
  return at < 0 ? items : [...rest.slice(0, at + 1), ...moved, ...rest.slice(at + 1)];
}
/** The objects just under the reference object(s): before the first of them. */
export function under(items: SketchItem[], ids: string[], refIds: string[]): SketchItem[] {
  const refs = new Set(refIds), { moved, rest } = split(items, new Set(ids.filter((id) => !refs.has(id))));
  const at = rest.findIndex((it) => refs.has(it.id));
  return at < 0 ? items : [...rest.slice(0, at), ...moved, ...rest.slice(at)];
}

export type TextKind = 'text' | 'dims' | 'leaders' | 'all';
/** Whether an object is one TEXTTOFRONT brings up: texts and notes, dimensions, leaders (their line and arrow), or all. */
export const isTextLike = (it: SketchItem, which: TextKind): boolean =>
  (which === 'text' || which === 'all') && (it.kind === 'text' || it.kind === 'mtext') || (which === 'dims' || which === 'all') && it.kind === 'dim' || (which === 'leaders' || which === 'all') && !!it.leader;
/** TEXTTOFRONT: the texts, dimensions or leaders (or all three) over everything else, in their order. */
export function textToFront(items: SketchItem[], which: TextKind = 'all'): SketchItem[] {
  return toFront(items, items.filter((it) => isTextLike(it, which)).map((it) => it.id));
}
/** Whether an order change would change anything. */
export const sameOrder = (a: SketchItem[], b: SketchItem[]) => a.length === b.length && a.every((it, i) => it === b[i]);
