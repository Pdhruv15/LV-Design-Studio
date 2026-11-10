import type { SketchItem } from '../types';
import type { CadBlockDef } from './cadBlocks';
import { expandAll } from './cadBlocks';
import { segmentsOf } from './cadSketch';
import type { CadPiece } from './cadCrop';
import type { RefGeometry } from './cadRefs';

/** Design CAD → the Blocks palette (INSERT, S10 of the 2D gap plan): the blocks inserted lately (kept on this
 * computer), a block made of a whole drawing file (the library folder), a block made of one of the architect's
 * blocks (exploded by the engine), the small previews, and the search. */

type Pt = [number, number];

// ---- recent blocks

/** How many blocks Recent keeps. */
export const RECENT_MAX = 12;
export const RECENT_KEY = 'lvds.cad.recentBlocks';
interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }
const store = (): Store | undefined => { try { return typeof localStorage !== 'undefined' ? localStorage : undefined; } catch { return undefined; } };
/** The blocks inserted lately, newest first (none when nothing is kept or the storage is not there). */
export function loadRecentBlocks(s: Store | undefined = store()): CadBlockDef[] {
  try {
    const v = s?.getItem(RECENT_KEY);
    const list = v ? (JSON.parse(v) as unknown) : [];
    return Array.isArray(list) ? list.filter((d): d is CadBlockDef => !!d && typeof d === 'object' && typeof (d as CadBlockDef).name === 'string' && Array.isArray((d as CadBlockDef).items)).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
/** The list with a block put first (one of the same name, case aside, replaced), twelve at most; kept when it can be. */
export function pushRecentBlock(def: CadBlockDef, list: CadBlockDef[], s: Store | undefined = store()): CadBlockDef[] {
  const next = [def, ...list.filter((d) => d.name.toLowerCase() !== def.name.toLowerCase())].slice(0, RECENT_MAX);
  try { s?.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* not kept */ }
  return next;
}

// ---- blocks from elsewhere

/** A block's name from a drawing file's name: "DB-TYPE-A.dwg" → "DB-TYPE-A". */
export const blockNameFromFile = (file: string) => file.replace(/^.*[\\/]/, '').replace(/\.(dwg|dxf)$/i, '').trim() || 'BLOCK';

/** A whole drawing as a block: each line of its model space a line, its texts as texts, its solid fills as hatches
 * (patterned fills as their outlines), on their own layers, about the drawing's origin. */
export function defFromGeometry(name: string, g: RefGeometry): CadBlockDef {
  const layer = (i: number) => g.layers[i]?.name ?? '0';
  const items: SketchItem[] = [];
  let n = 0;
  const id = () => `b${(n += 1)}`;
  for (let i = 0; i + 3 < g.segs.length; i += 4) items.push({ id: id(), kind: 'line', layer: layer(g.segLayers[i / 4]), pts: [[g.segs[i], g.segs[i + 1]], [g.segs[i + 2], g.segs[i + 3]]] });
  for (const t of g.texts ?? []) if (t.s && t.h > 0) items.push({ id: id(), kind: 'text', layer: layer(t.layer), pts: [[t.x, t.y]], text: t.s, h: t.h, ...(t.rot ? { rot: t.rot } : {}) });
  for (const f of g.fills ?? []) for (const loop of f.loops) {
    if (loop.length < 3) continue;
    items.push({ id: id(), kind: 'pline', layer: layer(f.layer), closed: true, pts: loop, ...(f.solid ? { hatch: { pattern: 'solid', scale: 3, angle: 0 } } : {}) });
  }
  return { name, units: g.units, items, explodable: true };
}

/** One of the architect's blocks as a block of the app's own: the pieces the engine explodes an insert of it into,
 * moved so that `base` (the insert's place, or the pieces' lowest left corner) is the origin. */
export function defFromPieces(name: string, pieces0: CadPiece[], base?: Pt, units?: number): CadBlockDef {
  // Groups of pieces (nested blocks) flattened.
  const flat = (ps: CadPiece[]): Exclude<CadPiece, { kind: 'group' }>[] => ps.flatMap((p) => (p.kind === 'group' ? flat(p.items) : [p]));
  const pieces = flat(pieces0);
  const pts: Pt[] = pieces.flatMap((p): Pt[] => p.kind === 'line' ? [p.a, p.b] : p.kind === 'arc' || p.kind === 'circle' ? [[p.c[0] - p.r, p.c[1] - p.r]] : p.kind === 'pline' ? p.pts.map(([x, y]) => [x, y]) : p.kind === 'text' || p.kind === 'point' ? [p.at] : p.kind === 'solid' ? p.pts : p.loops.flat().map(([x, y]) => [x, y]));
  const b: Pt = base ?? (pts.length ? [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1]))] : [0, 0]);
  const at = (q: readonly number[]): Pt => [q[0] - b[0], q[1] - b[1]];
  let n = 0;
  const items = pieces.flatMap((p): SketchItem[] => {
    const s = { id: `b${(n += 1)}`, layer: p.layer, ...(p.color !== undefined && p.color !== 0xff000007 ? { color: `#${p.color.toString(16).padStart(6, '0')}` } : {}) };
    switch (p.kind) {
      case 'line': return [{ ...s, kind: 'line', pts: [at(p.a), at(p.b)] }];
      case 'arc': return [{ ...s, kind: 'arc', pts: [at(p.c)], r: p.r, a0: p.a0, a1: p.a1 }];
      case 'circle': return [{ ...s, kind: 'circle', pts: [at(p.c)], r: p.r }];
      case 'pline': return p.pts.length > 1 ? [{ ...s, kind: 'pline', pts: p.pts.map(at), ...(p.closed ? { closed: true } : {}) }] : [];
      case 'text': return p.text.trim() ? [{ ...s, kind: 'text', pts: [at(p.at)], text: p.text, h: p.h, ...(p.rot ? { rot: p.rot } : {}), ...(p.just ? { just: p.just } : {}) }] : [];
      case 'point': return [{ ...s, kind: 'point', pts: [at(p.at)] }];
      case 'solid': return p.pts.length > 2 ? [{ ...s, kind: 'pline', closed: true, pts: p.pts.map(at), hatch: { pattern: 'solid', scale: 3, angle: 0 } }] : [];
      case 'hatch': return p.loops.filter((l) => l.length > 2).map((l) => ({ ...s, kind: 'pline' as const, closed: true, pts: l.map(at), ...(p.solid ? { hatch: { pattern: 'solid' as const, scale: 3, angle: 0 } } : {}) }));
      default: return [];
    }
  });
  return { name, units, items, explodable: true };
}

// ---- the palette's previews and search

/** A block's picture: its lines (texts as their baseline, a note's as its box) in a box 1 × `aspect` wide, scaled to
 * fit; empty for a block with nothing to draw. */
export function blockThumb(def: CadBlockDef, defs: CadBlockDef[] = [], aspect = 4 / 3): { lines: [Pt, Pt][]; texts: { at: Pt; s: string; h: number }[] } {
  const items = expandAll(def.items, [def, ...defs]);
  const lines: [Pt, Pt][] = [], texts: { at: Pt; s: string; h: number }[] = [];
  for (const it of items) {
    if (it.kind === 'text') texts.push({ at: it.pts[0], s: it.text ?? '', h: it.h ?? 1 });
    else if (it.kind === 'point') lines.push([[it.pts[0][0] - 1, it.pts[0][1]], [it.pts[0][0] + 1, it.pts[0][1]]]);
    else lines.push(...segmentsOf(it, 0.001, defs));
  }
  const all = [...lines.flat(), ...texts.flatMap((t) => [t.at, [t.at[0] + 0.6 * t.h * t.s.length, t.at[1] + t.h] as Pt])];
  if (!all.length) return { lines: [], texts: [] };
  const x0 = Math.min(...all.map((q) => q[0])), x1 = Math.max(...all.map((q) => q[0])), y0 = Math.min(...all.map((q) => q[1])), y1 = Math.max(...all.map((q) => q[1]));
  const w = Math.max(x1 - x0, 1e-9), h = Math.max(y1 - y0, 1e-9), k = Math.min((aspect * 0.9) / w, 0.9 / h);
  const ox = (aspect - w * k) / 2 - x0 * k, oy = (1 - h * k) / 2 - y0 * k;
  const map = (q: Pt): Pt => [q[0] * k + ox, 1 - (q[1] * k + oy)];
  return { lines: lines.map(([a, b]) => [map(a), map(b)]), texts: texts.map((t) => ({ at: map(t.at), s: t.s, h: t.h * k })) };
}
/** The blocks whose names contain the words typed (any order, case aside). */
export function filterBlocks<T extends { name: string }>(list: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? list.filter((d) => words.every((w) => d.name.toLowerCase().includes(w))) : list;
}
