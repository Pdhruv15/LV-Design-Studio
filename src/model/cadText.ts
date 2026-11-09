import type { SketchItem } from '../types';

/** Design CAD → text tools (drawing units): where a text's anchor sits on its box (justification), the point its
 * baseline starts from, its box for picking, and the ISO text heights offered on paper. A text is anchored at pts[0];
 * with no `just` that is the left end of its baseline, as texts were drawn before justification existed. */

type Pt = [number, number];

/** Where the anchor is on the text's box: L / C / R on the baseline, else the row (Top, Middle, Bottom) and the column. */
export type TextJust = 'L' | 'C' | 'R' | 'TL' | 'TC' | 'TR' | 'ML' | 'MC' | 'MR' | 'BL' | 'BC' | 'BR';
export const TEXT_JUSTS: { id: TextJust; label: string }[] = [
  { id: 'L', label: 'Left' }, { id: 'C', label: 'Centre' }, { id: 'R', label: 'Right' },
  { id: 'TL', label: 'Top left' }, { id: 'TC', label: 'Top centre' }, { id: 'TR', label: 'Top right' },
  { id: 'ML', label: 'Middle left' }, { id: 'MC', label: 'Middle centre' }, { id: 'MR', label: 'Middle right' },
  { id: 'BL', label: 'Bottom left' }, { id: 'BC', label: 'Bottom centre' }, { id: 'BR', label: 'Bottom right' }
];
export const justLabel = (j: TextJust | undefined) => TEXT_JUSTS.find((x) => x.id === (j ?? 'L'))?.label ?? 'Left';
/** The justification typed: its code (MC), or a word for the baseline ones (Left, Centre, Center, Right). */
export function parseJust(s: string): TextJust | undefined {
  const t = s.trim().toUpperCase();
  if (TEXT_JUSTS.some((x) => x.id === t)) return t as TextJust;
  return t === 'LEFT' ? 'L' : t === 'CENTRE' || t === 'CENTER' ? 'C' : t === 'RIGHT' ? 'R' : t === 'MIDDLE' ? 'MC' : undefined;
}

/** About how wide text of height h is (the sheets print it in Arial). */
export const textWidth = (s: string, h: number) => s.length * h * 0.6;

/** The text heights on paper (mm) offered: the ISO 3098 series. */
export const ISO_TEXT_MM = [1.8, 2.5, 3.5, 5, 7, 10, 14, 20];

/** The anchor's place on the box as fractions of its width (0 left … 1 right) and height (0 baseline … 1 top). Bottom
 * is the baseline: the box has no descender. */
export function justFractions(j: TextJust | undefined): { fx: number; fy: number } {
  const t = j ?? 'L', col = t.length === 1 ? t : t.slice(1), row = t.length === 1 ? 'B' : t[0];
  return { fx: col === 'C' ? 0.5 : col === 'R' ? 1 : 0, fy: row === 'T' ? 1 : row === 'M' ? 0.5 : 0 };
}
const along = (it: Pick<SketchItem, 'rot'>): [Pt, Pt] => { const a = it.rot ?? 0; return [[Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)]]; };
/** The text's box: the left end of its baseline (origin), its width and height, read along its rotation. */
export function textBox(it: SketchItem): { origin: Pt; w: number; h: number } {
  const h = it.h ?? 1, w = textWidth(it.text ?? '', h), { fx, fy } = justFractions(it.just), [u, v] = along(it), a = it.pts[0];
  return { origin: [a[0] - fx * w * u[0] - fy * h * v[0], a[1] - fx * w * u[1] - fy * h * v[1]], w, h };
}
/** The box's four corners, from the origin anticlockwise. */
export function textCorners(it: SketchItem): Pt[] {
  const { origin: o, w, h } = textBox(it), [u, v] = along(it);
  return [o, [o[0] + w * u[0], o[1] + w * u[1]], [o[0] + w * u[0] + h * v[0], o[1] + w * u[1] + h * v[1]], [o[0] + h * v[0], o[1] + h * v[1]]];
}
/** The anchor of the same box for another justification. */
export function anchorFor(it: SketchItem, j: TextJust): Pt {
  const { origin: o, w, h } = textBox(it), { fx, fy } = justFractions(j), [u, v] = along(it);
  return [o[0] + fx * w * u[0] + fy * h * v[0], o[1] + fx * w * u[1] + fy * h * v[1]];
}
/** The text justified another way without moving on the plan: its anchor moves to that place on its box. Left (the
 * default) is not stored. */
export function rejustified(it: SketchItem, j: TextJust): SketchItem {
  const { just: _j, ...rest } = it;
  return { ...rest, pts: [anchorFor(it, j)], ...(j === 'L' ? {} : { just: j }) };
}
/** Where the baseline passes under the anchor, and how the text is aligned to it: for drawing with a renderer that
 * aligns by the real font width (the canvas, the sheets' SVG). */
export function textBaseAt(it: SketchItem): { at: Pt; align: 'left' | 'center' | 'right' } {
  const h = it.h ?? 1, { fx, fy } = justFractions(it.just), [, v] = along(it), a = it.pts[0];
  return { at: [a[0] - fy * h * v[0], a[1] - fy * h * v[1]], align: fx === 0.5 ? 'center' : fx === 1 ? 'right' : 'left' };
}
/** The text at another height (drawing units), its anchor where it was. */
export const withTextHeight = (it: SketchItem, h: number): SketchItem => ({ ...it, h });
/** How a justification is written into a DXF: the horizontal (0 left, 1 centre, 2 right) and vertical (0 baseline,
 * 1 bottom, 2 middle, 3 top) alignment codes. */
export function justDxf(j: TextJust | undefined): { h: 0 | 1 | 2; v: 0 | 1 | 2 | 3 } {
  const t = j ?? 'L', col = t.length === 1 ? t : t.slice(1), row = t.length === 1 ? '' : t[0];
  return { h: col === 'C' ? 1 : col === 'R' ? 2 : 0, v: row === 'T' ? 3 : row === 'M' ? 2 : row === 'B' ? 1 : 0 };
}

// ---- the text tools on texts picked (TALIGN, TCASE, TORIENT, TCEN, TCOPY)

const movedBy = (it: SketchItem, dx: number, dy: number): SketchItem => ({ ...it, pts: it.pts.map((q): Pt => [q[0] + dx, q[1] + dy]) });
/** The text's box in the drawing's axes: the extremes of its corners. */
export function textBounds(it: SketchItem): { x0: number; y0: number; x1: number; y1: number } {
  const c = textCorners(it), xs = c.map((q) => q[0]), ys = c.map((q) => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
/** The centre of the text's box. */
export const textCentre = (it: SketchItem): Pt => anchorFor(it, 'MC');

export type CaseMode = 'upper' | 'lower' | 'title' | 'sentence';
/** The words in another case: Title capitalises each word, Sentence the first letter only. */
export function cased(s: string, mode: CaseMode): string {
  if (mode === 'upper') return s.toUpperCase();
  if (mode === 'lower') return s.toLowerCase();
  const low = s.toLowerCase();
  if (mode === 'sentence') return low.replace(/^(\s*)(\S)/, (_m, a: string, b: string) => a + b.toUpperCase());
  return low.replace(/(^|[\s(\-/]+)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

export type OrientMode = 'bottom' | 'right' | 'both';
/** The angle (radians) a text reads at: `bottom` 0, `right` up the page (90°), `both` the same line turned so it reads
 * from the bottom or the right (−90° < angle ≤ 90°), as drafting programs keep text readable. */
export function readableAngle(a: number, mode: OrientMode): number {
  if (mode === 'bottom') return 0;
  if (mode === 'right') return Math.PI / 2;
  let r = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (r > Math.PI / 2 + 1e-9 && r <= 1.5 * Math.PI + 1e-9) r -= Math.PI;
  else if (r > 1.5 * Math.PI) r -= 2 * Math.PI;
  return Math.abs(r) < 1e-12 ? 0 : r;
}
/** The text turned about its box's centre to a readable angle (the centre stays, the anchor follows). */
export function oriented(it: SketchItem, mode: OrientMode): SketchItem {
  const a = readableAngle(it.rot ?? 0, mode);
  if (Math.abs(a - (it.rot ?? 0)) < 1e-12) return it;
  const mc = rejustified(it, 'MC'), { rot: _r, ...rest } = mc;
  return rejustified({ ...rest, ...(a ? { rot: a } : {}) }, it.just ?? 'L');
}
/** The text moved so that its box's centre is at a point. */
export function centredAt(it: SketchItem, at: Pt): SketchItem {
  const c = textCentre(it);
  return movedBy(it, at[0] - c[0], at[1] - c[1]);
}

export type AlignMode = 'left' | 'right' | 'centre' | 'top' | 'bottom';
/** A text's edge for an alignment: its box's left, right or centre x, or its top or bottom y. */
export function alignEdge(it: SketchItem, mode: AlignMode): number {
  const b = textBounds(it);
  return mode === 'left' ? b.x0 : mode === 'right' ? b.x1 : mode === 'centre' ? (b.x0 + b.x1) / 2 : mode === 'top' ? b.y1 : b.y0;
}
/** The text moved so that its edge is at `ref` (an x for left / right / centre, a y for top / bottom). */
export function alignedTo(it: SketchItem, mode: AlignMode, ref: number): SketchItem {
  const d = ref - alignEdge(it, mode);
  return mode === 'top' || mode === 'bottom' ? movedBy(it, 0, d) : movedBy(it, d, 0);
}
/** Texts spaced evenly down the page: the topmost stays, each next one's centre `gap` below the one before (drawing
 * units), in the order of their centres from the top. */
export function spaced(texts: SketchItem[], gap: number): SketchItem[] {
  const order = [...texts].sort((a, b) => textCentre(b)[1] - textCentre(a)[1]);
  if (!order.length) return [];
  const top = textCentre(order[0])[1];
  return order.map((it, i) => movedBy(it, 0, top - i * gap - textCentre(it)[1]));
}
/** Rooms of a level (outlines in metres) that have no room tag yet: no drawn text with the room's name inside its
 * outline (the tag's anchor in drawing units × k = metres). */
export function untaggedRooms<R extends { name: string; outline?: Pt[] }>(rooms: R[], texts: SketchItem[], k: number, inside: (p: Pt, poly: Pt[]) => boolean): R[] {
  return rooms.filter((r) => (r.outline?.length ?? 0) >= 3 && !texts.some((it) => it.kind === 'text' && it.text === r.name.toUpperCase() && inside([it.pts[0][0] * k, it.pts[0][1] * k], r.outline!)));
}
