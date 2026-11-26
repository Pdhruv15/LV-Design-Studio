import type { SketchItem } from '../types';
import type { CadPiece, PieceDim, PieceStyle } from './cadCrop';
import { blockDefOf, type CadBlockDef } from './cadBlocks';
import { defFromPieces } from './cadBlockLibrary';
import type { TextJust } from './cadText';
import { linetypeIdOf, lineweightOf } from './cadLayerStyle';
import { HATCH_PATTERNS, patternByName, placedLines, specFromLines, validCustom, type HatchSpec, type PlacedLine } from './cadHatch';
import { fromDxfMtext } from './cadMtext';
import type { DimLook } from './cadSketch';
import type { NoteAttach } from './cadMtext';

/** What the take-over needs from the project: the drawing units per paper mm (a patterned hatch's spacing is paper mm
 * at the annotation scale; 1 when left out) and the current dimension style's look and text height. */
export interface TakeOverCtx { unit?: number; dim?: { look: DimLook; textH: number } }

type PieceOf<K extends CadPiece['kind']> = Extract<CadPiece, { kind: K }>;
const DEG = 180 / Math.PI, ATTACH: NoteAttach[] = ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'];
const colinear = (a: number, b: number) => Math.abs(Math.sin(a - b)) < 1e-6 && Math.cos(a - b) > 0;
const area = (l: readonly number[][]) => Math.abs(l.reduce((t, q, i) => t + q[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * q[1], 0));

/** A patterned hatch of the drawing as the app's hatch spec: the built-in pattern of its name when the drawing's lines are
 * that pattern at some spacing and angle; else its own lines as a pattern of its own (`custom`); when those cannot be drawn,
 * ANSI31 at the first family's spacing and angle (`fallback`). Its origin is where the drawing's first line passes. */
function hatchSpecOf(p: PieceOf<'hatch'>, unit: number): { spec: HatchSpec; fallback: boolean } {
  const lines: PlacedLine[] = (p.lines ?? []).map((l) => ({ angle: l.angle, base: [l.base[0], l.base[1]], offset: [l.offset[0], l.offset[1]], dashes: l.dashes }));
  const id = patternByName(p.pattern);
  const origin = (spec: HatchSpec): HatchSpec => {
    const b = placedLines(spec, unit)[0]?.base ?? [0, 0], o: [number, number] = [lines[0].base[0] - b[0], lines[0].base[1] - b[1]];
    return o[0] || o[1] ? { ...spec, origin: o } : spec;
  };
  if (!lines.length) return { spec: { pattern: id && id !== 'solid' ? id : 'ansi31', scale: 3, angle: (p.angle ?? 0) * DEG }, fallback: !id || id === 'solid' };
  // The first family's spacing across it and its direction give the scale and angle of the built-in pattern of that name.
  const first = lines[0], step = Math.abs(first.offset[1] * Math.cos(first.angle) - first.offset[0] * Math.sin(first.angle));
  const fit = (pattern: string): HatchSpec | undefined => {
    const def = (HATCH_PATTERNS as Record<string, { lines: { angle: number; offset: [number, number] }[]; noAngle?: boolean }>)[pattern];
    if (!def?.lines.length || !(step > 1e-12) || !(Math.abs(def.lines[0].offset[1]) > 1e-12)) return undefined;
    const scale = step / Math.abs(def.lines[0].offset[1]) / unit;
    const spec: HatchSpec = { pattern, scale, angle: def.noAngle ? 0 : first.angle * DEG - def.lines[0].angle };
    const mine = placedLines(spec, unit), tol = 1e-6 * Math.max(step, 1e-9);
    const same = mine.length === lines.length && scale >= 0.2 && mine.every((m, i) => colinear(m.angle, lines[i].angle) && Math.hypot(m.offset[0] - lines[i].offset[0], m.offset[1] - lines[i].offset[1]) <= tol
      && m.dashes.length === lines[i].dashes.length && m.dashes.every((d, k) => Math.abs(d - lines[i].dashes[k]) <= tol));
    return same ? spec : undefined;
  };
  const builtIn = id && id !== 'solid' ? fit(id) : undefined;
  if (builtIn) return { spec: origin(builtIn), fallback: false };
  const own = specFromLines(p.pattern, lines, unit);
  if (own && validCustom(own.custom)) return { spec: origin(own), fallback: false };
  return { spec: origin({ pattern: 'ansi31', scale: Math.max(0.2, step / unit) || 3, angle: first.angle * DEG - 45 }), fallback: true };
}

/** A dimension of the drawing as one drawn dimension: its points, its text when overridden, and the look of the current
 * dimension style with the drawing's own text height, arrow size and decimals where it gives them. */
function dimItem(d: PieceDim, ctx: TakeOverCtx): Omit<SketchItem, 'id' | 'layer'> {
  const h = d.height ?? ctx.dim?.textH ?? 1;
  const base: DimLook = ctx.dim?.look ?? { arrow: 'closed', size: h * 0.8, off: h * 0.3, ext: h * 0.5 };
  const look: DimLook = { ...base, ...(d.arrow ? { size: d.arrow } : {}), ...(d.decimals !== undefined ? { decimals: d.decimals } : {}) };
  return {
    kind: 'dim', pts: d.pts.map(([x, y]): [number, number] => [x, y]),
    ...(d.kind === 'radius' || d.kind === 'diameter' || d.kind === 'angular' ? { dimKind: d.kind } : {}),
    ...(d.kind === 'linear' && d.dir !== undefined ? { dir: d.dir } : {}),
    ...(d.text ? { text: d.text } : {}), h, look
  };
}

/** What a take-over could not keep as it was: splines and partial ellipses came as polylines, and patterned hatches
 * whose lines the app cannot draw came as ANSI31. Read from the same pieces `drawnFromPieces` converts. */
export function takeOverSummary(pieces: CadPiece[], ctx: TakeOverCtx = {}): { splines: number; ellipses: number; hatches: number } {
  const r = { splines: 0, ellipses: 0, hatches: 0 };
  for (const p of pieces) {
    if (p.kind === 'group') { if (!p.dim) { const g = takeOverSummary(p.items, ctx); r.splines += g.splines; r.ellipses += g.ellipses; r.hatches += g.hatches; } }
    else if (p.kind === 'pline') { if (p.sampled === 'spline') r.splines += 1; else if (p.sampled === 'ellipse') r.ellipses += 1; }
    else if (p.kind === 'hatch' && !p.solid && p.scale !== undefined && p.loops.some((l) => l.length > 2) && hatchSpecOf(p, ctx.unit ?? 1).fallback) r.hatches += 1;
  }
  return r;
}
/** The take-over message's tail for what stayed approximate: "2 splines as polylines" and so on; blank when nothing did. */
export function takeOverNote(sum: ReturnType<typeof takeOverSummary>): string {
  const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
  return [sum.splines ? `${n(sum.splines, 'spline', 'splines')} as polylines` : '', sum.ellipses ? `${n(sum.ellipses, 'partial ellipse', 'partial ellipses')} as polylines` : '',
    sum.hatches ? `${n(sum.hatches, 'hatch pattern', 'hatch patterns')} not readable, ANSI31 used` : ''].filter(Boolean).join(' · ');
}

/** Taking over an opened drawing's object: the pieces the engine explodes it into become drawn objects of the app,
 * in world coordinates, keeping layer, colour, linetype, lineweight and exact geometry (a polyline keeps its arc
 * segments). Taken over whole (the engine's exact mode): an ellipse, a paragraph text (a note), a text with its
 * justification, a patterned hatch with its pattern, and a dimension of a known kind (a drawn dimension in the current
 * dimension style). Splines and partial ellipses are polylines (`takeOverSummary` counts them); any other dimension is
 * flattened into its pieces. Pure: no React. */
export function drawnFromPieces(pieces: CadPiece[], ctx: TakeOverCtx = {}): Omit<SketchItem, 'id'>[] {
  const flat = (ps: CadPiece[]): CadPiece[] => ps.flatMap((p) => (p.kind === 'group' && !p.dim ? flat(p.items) : [p]));
  const unit = ctx.unit && ctx.unit > 0 ? ctx.unit : 1;
  return flat(pieces).flatMap((p): Omit<SketchItem, 'id'>[] => {
    const lt = p.lt ? linetypeIdOf(p.lt) : undefined, lw = lineweightOf(p.lw);
    const s = { layer: p.layer, ...(p.color !== undefined && p.color !== 0xff000007 ? { color: `#${p.color.toString(16).padStart(6, '0')}` } : {}), ...(lt ? { lt } : {}), ...(p.lt ? { ltName: p.lt } : {}), ...(lw !== undefined ? { lw } : {}) };
    switch (p.kind) {
      case 'line': return [{ ...s, kind: 'line', pts: [[...p.a], [...p.b]] }];
      case 'arc': return [{ ...s, kind: 'arc', pts: [[...p.c]], r: p.r, a0: p.a0, a1: p.a1 }];
      case 'circle': return [{ ...s, kind: 'circle', pts: [[...p.c]], r: p.r }];
      case 'ellipse': return [{ ...s, kind: 'ellipse', pts: [[...p.c]], ax: [...p.axis], ratio: p.ratio }];
      case 'pline': return p.pts.length > 1 ? [{ ...s, kind: 'pline', pts: p.pts.map(([x, y]) => [x, y]), ...(p.pts.some((v) => v[2]) ? { bulges: p.pts.map((v) => v[2] ?? 0) } : {}), ...(p.closed ? { closed: true } : {}) }] : [];
      case 'text': return p.text.trim() ? [{ ...s, kind: 'text', pts: [[...p.at]], text: p.text, h: p.h, ...(p.rot ? { rot: p.rot } : {}), ...(p.just ? { just: p.just } : {}) }] : [];
      case 'mtext': {
        const note = fromDxfMtext(p.text, p.h), just = ATTACH[p.attach - 1];
        return note.some((q) => q.runs.length) ? [{ ...s, kind: 'mtext', pts: [[...p.at]], note, h: p.h, ...(p.rot ? { rot: p.rot } : {}), ...(p.w > 0 ? { w: p.w } : {}), ...(just && just !== 'TL' ? { just } : {}), ...(p.lsp && p.lsp !== 1 ? { lsp: p.lsp } : {}) }] : [];
      }
      case 'point': return [{ ...s, kind: 'point', pts: [[...p.at]] }];
      case 'solid': return p.pts.length > 2 ? [{ ...s, kind: 'pline', closed: true, pts: p.pts.map(([x, y]) => [x, y]), hatch: { pattern: 'solid', scale: 3, angle: 0 } }] : [];
      case 'hatch': {
        // One drawn hatch: its loop of the largest area is the outline, the others its islands (a patterned fill from a
        // drawing read the old way, without its lines, as outlines).
        const loops = p.loops.filter((l) => l.length > 2).map((l) => l.map(([x, y]): [number, number] => [x, y])).sort((a, b) => area(b) - area(a));
        if (!loops.length) return [];
        const holes = loops.length > 1 ? { holes: loops.slice(1) } : {};
        if (p.solid) return [{ ...s, kind: 'pline', closed: true, pts: loops[0], hatch: { pattern: 'solid', scale: 3, angle: 0 }, ...holes }];
        if (p.scale === undefined) return loops.map((l) => ({ ...s, kind: 'pline' as const, closed: true, pts: l }));
        return [{ ...s, kind: 'pline', closed: true, pts: loops[0], hatch: hatchSpecOf(p, unit).spec, ...holes }];
      }
      case 'group': return p.dim ? [{ ...s, ...dimItem(p.dim, ctx) }] : [];
      default: return [];
    }
  });
}

/** The stand-ins of one drawing object: its pieces as drawn objects, not in the project, with ids `dw:<handle>:<n>`.
 * They are what the right-click menu, the toolbar, Properties and the grips work on until an edit takes the object over. */
export function standInsFor(handle: string, pieces: CadPiece[], ctx: TakeOverCtx = {}): SketchItem[] {
  return drawnFromPieces(pieces, ctx).map((x, n) => ({ ...x, id: `dw:${handle}:${n}` }) as SketchItem);
}
/** The handle of the drawing object a stand-in stands for; none for a drawn object. */
export const standInHandle = (id: string): string | undefined => (id.startsWith('dw:') ? id.split(':')[1] : undefined);

/** An insert of the opened drawing with its block's definition (engines/cad-reader/src/doc/explode.rs `block_inserts`):
 * how it is placed, the block's items in block coordinates (the base point at the origin; layer 0 and ByBlock kept for
 * the insert to give), its attribute definitions (block coordinates) and its attributes (drawing coordinates). */
export interface BlockInfo {
  name: string; at: [number, number]; sx: number; sy: number; rot: number; flipped: boolean; rows: number; cols: number; base: [number, number];
  s: PieceStyle; items: CadPiece[];
  attdefs: { s: PieceStyle; tag: string; prompt: string; text: string; at: [number, number]; h: number; rot: number; just?: TextJust; invisible: boolean; constant: boolean; preset: boolean; verify: boolean }[];
  attribs: { tag: string; value: string; at: [number, number]; h: number; rot: number; just?: TextJust; invisible: boolean }[];
}

const keyed = (v: unknown): string => JSON.stringify(v, (k, x: unknown) => {
  if (k === 'id') return undefined;
  if (typeof x === 'number') return Math.round(x * 1e6) / 1e6 || 0;
  return x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x;
});
/** Whether two block definitions hold the same objects (ids aside, numbers to 1e-6). */
export const sameBlockItems = (a: CadBlockDef, b: CadBlockDef) => keyed(a.items) === keyed(b.items);

const flatPieces = (ps: CadPiece[]): CadPiece[] => ps.flatMap((p) => (p.kind === 'group' && !p.dim ? flatPieces(p.items) : [p]));
const turnsTo = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-3;

/** A block of the opened drawing as one app block: an insert (`dw:<handle>:0`) of a copy of the drawing's definition, so
 * it has one grip at its base point and stays a block when taken over. None (the object is taken as its pieces) when the
 * app's insert cannot show it exactly: an anonymous or dynamic block (`*` name), a MINSERT array, a mirrored or
 * unevenly scaled insert (an insert has one positive scale), an empty block, an attribute that does not sit where its
 * definition lands (or a changeable attribute definition with no attribute), pieces the definition cannot keep (their
 * own linetype or lineweight, a dimension, a patterned hatch), or another block of that name already in the project.
 * An equal block of that name in the project is reused. Pure: no React. */
export function blockStandIn(handle: string, info: BlockInfo, projectDefs: CadBlockDef[], units?: number): { insert: SketchItem; def: CadBlockDef } | null {
  const { sx, sy } = info;
  if (!info.name || info.name.startsWith('*') || info.rows * info.cols > 1) return null;
  if (!(sx > 0) || !(sy > 0) || info.flipped || Math.abs(sx - sy) > 1e-9 * Math.max(Math.abs(sx), Math.abs(sy))) return null;
  const pieces = flatPieces(info.items);
  if (pieces.some((p) => p.lt || p.lw !== undefined || p.kind === 'group' || (p.kind === 'hatch' && !p.solid && p.scale !== undefined))) return null;
  const tags = info.attdefs.map((d) => d.tag.toLowerCase());
  if (info.attdefs.some((d) => !d.tag.trim() || d.s.lt || d.s.lw !== undefined) || new Set(tags).size !== tags.length) return null;
  // Each attribute must sit where its definition lands on this insert; a changeable definition needs its attribute.
  const [c, r] = [Math.cos(info.rot), Math.sin(info.rot)];
  for (const a of info.attribs) {
    const d = info.attdefs[tags.indexOf(a.tag.toLowerCase())];
    if (!d) return null;
    const h = d.h * sx, at: [number, number] = [info.at[0] + sx * (d.at[0] * c - d.at[1] * r), info.at[1] + sx * (d.at[0] * r + d.at[1] * c)];
    if (Math.hypot(a.at[0] - at[0], a.at[1] - at[1]) > 0.01 * h || Math.abs(a.h - h) > 0.01 * h || a.invisible !== d.invisible || !turnsTo(a.rot, d.rot + info.rot) || a.just !== d.just) return null;
  }
  if (info.attdefs.some((d) => !d.constant && !info.attribs.some((a) => a.tag.toLowerCase() === d.tag.toLowerCase()))) return null;
  const made = defFromPieces(info.name, info.items, [0, 0], units);
  const flag = (d: BlockInfo['attdefs'][number]) => ({ ...(d.invisible ? { invisible: true as const } : {}), ...(d.constant ? { constant: true as const } : {}), ...(d.verify ? { verify: true as const } : {}), ...(d.preset ? { preset: true as const } : {}) });
  const def: CadBlockDef = {
    ...made, items: [...made.items, ...info.attdefs.map((d, i): SketchItem => {
      const [st] = drawnFromPieces([{ ...d.s, kind: 'point', at: [0, 0] }]);
      const att = flag(d);
      return { id: `a${i + 1}`, kind: 'attdef', layer: st.layer, ...(st.color ? { color: st.color } : {}), pts: [[d.at[0], d.at[1]]], tag: d.tag, prompt: d.prompt, text: d.text, h: d.h,
        ...(d.rot ? { rot: d.rot } : {}), ...(d.just ? { just: d.just } : {}), ...(Object.keys(att).length ? { att } : {}) };
    })]
  };
  if (!def.items.length) return null;
  const have = blockDefOf(projectDefs, info.name);
  if (have && !sameBlockItems(have, def)) return null;
  const [st] = drawnFromPieces([{ ...info.s, kind: 'point', at: [0, 0] }]);
  const attrs: Record<string, string> = {};
  for (const d of info.attdefs) { const a = info.attribs.find((q) => q.tag.toLowerCase() === d.tag.toLowerCase()); if (a && !d.constant) attrs[d.tag] = a.value; }
  const insert: SketchItem = {
    id: `dw:${handle}:0`, kind: 'insert', layer: st.layer, pts: [[info.at[0], info.at[1]]], block: info.name,
    ...(Math.abs(sx - 1) > 1e-12 ? { sc: sx } : {}), ...(info.rot ? { rot: info.rot } : {}), ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(st.color ? { color: st.color } : {}), ...(st.lt ? { lt: st.lt } : {}), ...(st.ltName ? { ltName: st.ltName } : {}), ...(st.lw !== undefined ? { lw: st.lw } : {})
  };
  return { insert, def: have ?? def };
}
