import { isPath } from '../../model/cadEdit';
import type { SketchItem } from '../../types';
import { tidy, type CtxEntry, type CtxItem } from './cadContextMenu';

/** Design CAD: phase 4 of the context-menu plan (docs/notes/Future development/UI UX proposals - 2026-11-11 -
 * Context-aware right-click menus.md): the menu of a grip right-clicked, polyline vertices, and FIND (find and replace
 * in the texts drawn here). The drawn-object menus themselves are in SketchEditPanel.tsx. */

type Pt = [number, number];

/** The grip right-clicked on the object picked: its index in gripsOf, and what it is. */
export interface GripMenuState { index: number; kind: 'point' | 'mid' | 'radius' | 'width'; it: SketchItem }

/** Right-click on a grip of the object picked: move, copy or rotate from that point, and a polyline's vertices. */
export function gripMenu(s: GripMenuState): CtxEntry[] {
  const g = (label: string, action: string, key?: string): CtxItem => ({ label, act: 'grip', arg: `${action}|${s.index}`, ...(key ? { key } : {}) });
  const path = isPath(s.it), n = s.it.pts.length;
  return tidy([
    g('Move from this point', 'move', 'M'), g('Copy from this point', 'copy', 'CO'), ...(s.it.kind !== 'circle' ? [g('Rotate about this point', 'rotate', 'RO')] : []), '-',
    ...(path && s.kind === 'mid' ? [g('Add vertex', 'add')] : []),
    ...(path && s.kind === 'point' && n > (s.it.closed ? 3 : 2) ? [g('Remove vertex', 'remove')] : []),
    ...(s.it.kind === 'pline' && n > 2 ? [g(s.it.closed ? 'Open' : 'Close', 'close')] : []), '-',
    { label: 'Undo', key: 'Ctrl+Z', cmd: 'UNDO' },
    { label: 'Exit', key: 'Esc', act: 'deselect' }
  ]);
}

/** A vertex added at the middle of a side (grip `i` of gripsOf: the sides' grips follow the points); a line becomes a
 * polyline. */
export function withVertexAdded(it: SketchItem, i: number): SketchItem {
  const n = it.pts.length, s = i - n;
  if (!isPath(it) || s < 0) return it;
  const a = it.pts[s], b = it.pts[(s + 1) % n], mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return { ...it, kind: 'pline', pts: [...it.pts.slice(0, s + 1), mid, ...it.pts.slice(s + 1)] };
}

/** The vertex of grip `i` taken out (a path keeps two points, a closed one three). */
export function withVertexRemoved(it: SketchItem, i: number): SketchItem {
  if (!isPath(it) || i >= it.pts.length || it.pts.length <= (it.closed ? 3 : 2)) return it;
  return { ...it, pts: it.pts.filter((_, k) => k !== i) };
}

/** A polyline closed, or opened (its closing side taken off). */
export function closedToggled(it: SketchItem): SketchItem {
  if (it.kind !== 'pline' || it.pts.length < 3) return it;
  if (it.closed) { const { closed: _c, ...rest } = it; return rest as SketchItem; }
  return { ...it, closed: true };
}

/** FIND: every match of `find` (any case) in the texts drawn here replaced by `repl`: texts, notes, attribute defaults,
 * block attribute values and dimension texts typed over the measurement. The items changed and how many matches. */
export function findReplace(items: readonly SketchItem[], find: string, repl: string): { changed: SketchItem[]; n: number } {
  if (!find) return { changed: [], n: 0 };
  const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let n = 0;
  const swap = (s: string) => s.replace(re, () => { n += 1; return repl; });
  const changed: SketchItem[] = [];
  for (const it of items) {
    const before = n;
    let next: SketchItem = it;
    if ((it.kind === 'text' || it.kind === 'attdef' || it.kind === 'dim') && it.text) next = { ...it, text: swap(it.text) };
    else if (it.kind === 'mtext' && it.note) next = { ...it, note: it.note.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, s: swap(r.s) })) })) };
    else if (it.kind === 'mtext' && it.text) next = { ...it, text: swap(it.text) };
    else if (it.kind === 'insert' && it.attrs) next = { ...it, attrs: Object.fromEntries(Object.entries(it.attrs).map(([k, v]) => [k, swap(v)])) };
    if (n > before) changed.push(next);
  }
  return { changed, n };
}

/** How many matches FIND finds, without changing anything. */
export const findCount = (items: readonly SketchItem[], find: string) => findReplace(items, find, find).n;
