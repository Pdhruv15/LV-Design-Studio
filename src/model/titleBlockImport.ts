import type { CadPiece } from './cadCrop';
import { CAD_UNITS } from './cadUnits';
import { detectArea, MAX_REV_ROWS, paperOf, type DrawnShape, type DrawnText, type TitleTemplate } from './titleBlock';

/** A company title block or sheet border read from a DWG / DXF by the Design CAD engine, as a drawn template: its lines
 * and texts in mm from its top left corner, its attribute texts as fields mapped to the project's parameters. */

/** Millimetres in one drawing unit ($INSUNITS); an unknown code is taken as millimetres. */
export const mmPerUnit = (units: number | undefined) => { const m = CAD_UNITS.find((u) => u.code === units)?.m; return m ? m * 1000 : 1; };

/** Which parameter a tag or placeholder stands for, by its name: DWG_NO → {SheetNo}, REV → {Rev}, DRN → {DrawnBy} … */
const GUESSES: [RegExp, string][] = [
  [/^(DWG|DRG|DRAWING)[ _.-]*(NO|NUM|NUMBER)\.?$/i, '{SheetNo}'],
  [/^(SHEET|SHT)[ _.-]*(NO|NUM|NUMBER)\.?$/i, '{SheetNo}'],
  [/^(DWG|DRG|DRAWING)?[ _.-]*TITLE[ _.-]?1?$/i, '{SheetTitle}'],
  [/^(REV|REVISION|REV[ _.-]*NO)\.?$/i, '{Rev}'],
  [/^(REV[ _.-]*)?DATE$/i, '{RevDate}'],
  [/^(DRN|DRAWN|DRAWN[ _.-]*BY|DRW)$/i, '{DrawnBy}'],
  [/^(CHK|CHKD|CHECKED|CHECKED[ _.-]*BY)$/i, '{CheckedBy}'],
  [/^(APP|APPD|APPROVED|APPROVED[ _.-]*BY)$/i, '{ApprovedBy}'],
  [/^(DSN|DES|DESIGNED|DESIGNED[ _.-]*BY|DESIGN)$/i, '{DesignedBy}'],
  [/^SCALE$/i, '{Scale}'],
  [/^(SHEET|SHT)$/i, '{SheetIndex} of {SheetCount}'],
  [/^(PROJECT|PROJ|PROJECT[ _.-]*(NAME|TITLE))$/i, '{Project}'],
  [/^(CLIENT|OWNER|CLIENT[ _.-]*NAME)$/i, '{Owner}'],
  [/^(COMPANY|CONSULTANT|FIRM)$/i, '{Company}'],
  [/^(CONTRACTOR)$/i, '{Contractor}'],
  [/^(STATUS|ISSUE|ISSUED[ _.-]*FOR|PURPOSE)$/i, '{Status}'],
  [/^(PLOT|PLOT[ _.-]*NO)\.?$/i, '{Plot}'],
  [/^(AREA|LOCATION)$/i, '{Area}'],
  [/^(DISCIPLINE|DISC)$/i, '{Discipline}'],
  [/^(SIZE|PAPER|SHEET[ _.-]*SIZE)$/i, '{SheetSize}']
];
/** A numbered revision row tag: REV_1 / DATE_1 / DESC_1 (DESCRIPTION_1) / BY_1 (DRN_1) → {Rev1} {RevDate1} {RevText1} {RevBy1}. */
const REV_ROW_TAG = /^(REV|REVISION|REV[ _.-]*NO|DATE|REV[ _.-]*DATE|DESC|DESCRIPTION|REV[ _.-]*DESC(?:RIPTION)?|BY|REV[ _.-]*BY|DRN|DRAWN)[ _.-]*(\d{1,2})$/i;
export const guessField = (name: string): string | undefined => {
  const row = REV_ROW_TAG.exec(name.trim());
  if (row) {
    const n = Number(row[2]), kind = row[1].toUpperCase();
    return n >= 1 && n <= MAX_REV_ROWS ? `{${/DATE/.test(kind) ? 'RevDate' : /DESC/.test(kind) ? 'RevText' : /BY|DR/.test(kind) ? 'RevBy' : 'Rev'}${n}}` : undefined;
  }
  return GUESSES.find(([re]) => re.test(name.trim()))?.[1];
};

/** The placeholder the engine's texts show for an attribute: its tag between brackets, or the tag itself. */
const tagOfPlaceholder = (s: string) => s.match(/^[<[{(]\s*([A-Z0-9 _.-]{2,})\s*[>\]})]$/i)?.[1];

interface Box { minX: number; minY: number; maxX: number; maxY: number }
const grow = (b: Box, x: number, y: number) => { b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y); b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y); };
const emptyBox = (): Box => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

/** A text of the drawing as the engine lists it (src/engines/cad/cadEngine.ts CadText): rotation in radians, align 0 / 1 / 2. */
export interface SourceText { x: number; y: number; h: number; rot: number; s: string; align?: number; tag?: string }
export interface DrawingSource { units?: number; segs: ArrayLike<number>; texts: SourceText[] }

/** A whole drawing (its lines and texts) as a drawn template named `name`. */
export function drawnFromDrawing(src: DrawingSource, name: string): TitleTemplate {
  const s = mmPerUnit(src.units), box = emptyBox();
  const n = Math.floor(src.segs.length / 4);
  for (let i = 0; i < n; i++) { grow(box, src.segs[i * 4], src.segs[i * 4 + 1]); grow(box, src.segs[i * 4 + 2], src.segs[i * 4 + 3]); }
  for (const t of src.texts) grow(box, t.x, t.y);
  if (!Number.isFinite(box.minX)) throw new Error('The drawing has nothing to take as a title block.');
  const X = (x: number) => +((x - box.minX) * s).toFixed(3), Y = (y: number) => +((box.maxY - y) * s).toFixed(3);
  const shapes: DrawnShape[] = [];
  for (let i = 0; i < n; i++) shapes.push({ kind: 'line', x1: X(src.segs[i * 4]), y1: Y(src.segs[i * 4 + 1]), x2: X(src.segs[i * 4 + 2]), y2: Y(src.segs[i * 4 + 3]) });
  const texts = src.texts.map((t, i) => textOf(i, X(t.x), Y(t.y), t.h * s, t.rot, t.align === 1 ? 'center' : t.align === 2 ? 'right' : 'left', t.s, t.tag));
  return finish(name, { w: +((box.maxX - box.minX) * s).toFixed(2), h: +((box.maxY - box.minY) * s).toFixed(2) }, shapes, texts);
}

/** One inserted block, exploded by the engine (its lines, arcs, texts and attributes), as a drawn template. */
export function drawnFromPieces(pieces: CadPiece[], units: number | undefined, name: string): TitleTemplate {
  const s = mmPerUnit(units), box = emptyBox();
  const arcPts = (c: [number, number], r: number, a0: number, a1: number): [number, number][] => {
    let sweep = a1 - a0; while (sweep <= 0) sweep += 2 * Math.PI;
    const k = Math.max(4, Math.ceil(sweep / (Math.PI / 12)));
    return Array.from({ length: k + 1 }, (_, i) => { const a = a0 + (sweep * i) / k; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as [number, number]; });
  };
  type Raw = { kind: 'line'; pts: [number, number][] } | { kind: 'poly'; pts: [number, number][]; closed?: boolean; fill?: boolean } | { kind: 'circle'; c: [number, number]; r: number };
  const raws: Raw[] = [], rawTexts: { at: [number, number]; h: number; rot: number; s: string; align: DrawnText['align']; tag?: string }[] = [];
  for (const p of pieces) {
    if (p.kind === 'line') raws.push({ kind: 'line', pts: [p.a, p.b] });
    else if (p.kind === 'pline') raws.push({ kind: 'poly', pts: p.pts.map(([x, y]) => [x, y]), closed: p.closed });
    else if (p.kind === 'arc') raws.push({ kind: 'poly', pts: arcPts(p.c, p.r, p.a0, p.a1) });
    else if (p.kind === 'circle') raws.push({ kind: 'circle', c: p.c, r: p.r });
    else if (p.kind === 'solid') raws.push({ kind: 'poly', pts: p.pts, closed: true, fill: true });
    else if (p.kind === 'hatch') { if (p.solid) for (const loop of p.loops) raws.push({ kind: 'poly', pts: loop.map(([x, y]) => [x, y]), closed: true, fill: true }); }
    else if (p.kind === 'text') { const j = p.just ?? 'L'; rawTexts.push({ at: p.at, h: p.h, rot: p.rot, s: p.text, tag: p.tag, align: /C$/.test(j) ? 'center' : /R$/.test(j) ? 'right' : 'left' }); }
  }
  for (const r of raws) { if (r.kind === 'circle') { grow(box, r.c[0] - r.r, r.c[1] - r.r); grow(box, r.c[0] + r.r, r.c[1] + r.r); } else for (const [x, y] of r.pts) grow(box, x, y); }
  for (const t of rawTexts) grow(box, t.at[0], t.at[1]);
  if (!Number.isFinite(box.minX)) throw new Error('The block has nothing to take as a title block.');
  const X = (x: number) => +((x - box.minX) * s).toFixed(3), Y = (y: number) => +((box.maxY - y) * s).toFixed(3);
  const shapes: DrawnShape[] = raws.map((r): DrawnShape => r.kind === 'line' ? { kind: 'line', x1: X(r.pts[0][0]), y1: Y(r.pts[0][1]), x2: X(r.pts[1][0]), y2: Y(r.pts[1][1]) }
    : r.kind === 'circle' ? { kind: 'circle', cx: X(r.c[0]), cy: Y(r.c[1]), r: +(r.r * s).toFixed(3) }
    : { kind: 'poly', pts: r.pts.map(([x, y]) => [X(x), Y(y)] as [number, number]), ...(r.closed ? { closed: true } : {}), ...(r.fill ? { fill: true } : {}) });
  const texts = rawTexts.map((t, i) => textOf(i, X(t.at[0]), Y(t.at[1]), t.h * s, t.rot, t.align, t.s, t.tag));
  return finish(name, { w: +((box.maxX - box.minX) * s).toFixed(2), h: +((box.maxY - box.minY) * s).toFixed(2) }, shapes, texts);
}

/** A drawn text from the drawing's: an attribute (tag) or a placeholder becomes a field when its name is known. */
function textOf(i: number, x: number, y: number, h: number, rotRad: number, align: DrawnText['align'], s: string, tag?: string): DrawnText {
  const name = tag ?? tagOfPlaceholder(s);
  const guess = name ? guessField(name) : undefined;
  const rot = +((rotRad * 180) / Math.PI).toFixed(2);
  return { id: `t${i + 1}`, x, y, h: +h.toFixed(3), ...(Math.abs(rot) > 0.01 ? { rot } : {}), ...(align && align !== 'left' ? { align } : {}), text: guess ?? s, ...(tag ? { tag } : {}), ...(guess ? { orig: s } : {}) };
}

/** A drawing the size of a paper (within 2 mm) is taken as that paper's whole border, with its drawing area found. */
function finish(name: string, size: { w: number; h: number }, shapes: DrawnShape[], texts: DrawnText[]): TitleTemplate {
  if (!(size.w > 0 && size.h > 0)) throw new Error('The title block has no size.');
  const paper = paperOf(size);
  return { id: `tb-${Date.now().toString(36)}`, name, kind: 'drawn', cols: [], rows: [], cells: [], size, shapes, texts: fitTexts(shapes, texts, size.w), ...(paper ? { border: { paper, area: detectArea({ shapes, texts }, size) } } : {}) };
}

/** The width a field may take: up to the block's next vertical line (a cell edge) on the side the text grows towards,
 * less a margin, so a long value squeezes into its cell instead of running into the next. Fixed texts keep their width. */
export function fitTexts(shapes: DrawnShape[], texts: DrawnText[], blockW: number): DrawnText[] {
  const verticals: { x: number; y0: number; y1: number }[] = [];
  for (const s of shapes) {
    if (s.kind === 'line' && Math.abs(s.x1 - s.x2) < 0.05) verticals.push({ x: s.x1, y0: Math.min(s.y1, s.y2), y1: Math.max(s.y1, s.y2) });
    if (s.kind === 'poly') s.pts.forEach((p, i) => { const q = s.pts[i + 1] ?? (s.closed ? s.pts[0] : undefined); if (q && Math.abs(p[0] - q[0]) < 0.05) verticals.push({ x: p[0], y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) }); });
  }
  const m = 1;
  return texts.map((t) => {
    if (!/\{[^}]+\}/.test(t.text) || t.fit || (t.rot && Math.abs(t.rot) > 1)) return t;
    const yMid = t.y - t.h / 2;
    const across = verticals.filter((v) => v.y0 <= yMid && v.y1 >= yMid);
    const right = Math.min(blockW, ...across.filter((v) => v.x > t.x + 0.1).map((v) => v.x));
    const left = Math.max(0, ...across.filter((v) => v.x < t.x - 0.1).map((v) => v.x));
    const fit = t.align === 'center' ? 2 * Math.min(right - t.x, t.x - left) - 2 * m : t.align === 'right' ? t.x - left - m : right - t.x - m;
    return fit > t.h ? { ...t, fit: +fit.toFixed(2) } : t;
  });
}

/** The fields a drawn text can be mapped to, beside every project parameter. */
export const SHEET_FIELDS = ['{SheetNo}', '{SheetTitle}', '{Rev}', '{RevDate}', '{Status}', '{Scale}', '{SheetIndex} of {SheetCount}', '{SheetSize}', '{DrawnBy}', '{CheckedBy}', '{ApprovedBy}', '{DesignedBy}'];
/** The revision row fields a drawn block (a border) prints itself, rows 1 (newest) to 8, by row. */
export const REV_ROW_FIELD_LIST = Array.from({ length: 8 }, (_, i) => [`{Rev${i + 1}}`, `{RevDate${i + 1}}`, `{RevText${i + 1}}`, `{RevBy${i + 1}}`]).flat();
/** Maps a drawn text to a field ('' = back to the drawing's own words). */
export function mapText(t: TitleTemplate, id: string, field: string): TitleTemplate {
  return { ...t, texts: (t.texts ?? []).map((x) => (x.id !== id ? x : field ? { ...x, text: field, orig: x.orig ?? x.text } : { ...x, text: x.orig ?? x.text, orig: undefined })) };
}
/** How many texts of a drawn template are fields. */
export const fieldCount = (t: TitleTemplate) => (t.texts ?? []).filter((x) => /\{[^}]+\}/.test(x.text)).length;
