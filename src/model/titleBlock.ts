import { pushLibrary } from '../database/librarySync';
import type { Project } from '../types';
import { fillParams, paramList } from './params';
import { escapeHtmlAttr, isRasterDataUrl, num } from '../util/escape';
import { fmtDate } from '../util/format';

/** Title block templates: a grid (column widths, row heights in mm) of
 * cells that can span rows and columns. A cell holds text with {Parameters},
 * the company logo, or the revision table. Templates are saved with the
 * project, can be kept as your library on this computer and shared as a file. */

export interface TbCell {
  id: string;
  r: number;
  c: number;
  rs?: number;
  cs?: number;
  kind: 'text' | 'logo' | 'revisions';
  caption?: string; // small heading in the corner, e.g. "DRAWN BY"
  text: string;
  size?: number; // pt
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

/** A shape of a drawn template (mm from the block's top left corner, y down; w = line weight in mm, default 0.25). */
export type DrawnShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; w?: number }
  | { kind: 'poly'; pts: [number, number][]; closed?: boolean; w?: number; fill?: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number; w?: number };
/** A text of a drawn template: its insertion point (mm, y down), cap height (mm), rotation (degrees, anticlockwise) and
 * alignment about the point. text holds fixed words or {Parameters}; tag is the attribute it came from (and the ATTRIB it
 * is written back as); orig the drawing's own words, kept when the text is mapped to a parameter; fit a width (mm) a
 * long value shrinks to. */
export interface DrawnText { id: string; x: number; y: number; h: number; rot?: number; align?: 'left' | 'center' | 'right'; text: string; tag?: string; orig?: string; fit?: number; bold?: boolean }

export interface TitleTemplate {
  id: string;
  name: string;
  cols: number[]; // mm
  rows: number[]; // mm
  cells: TbCell[];
  /** grid (the designer's cells, default) or drawn: a company block imported from DWG / DXF, as lines and texts. */
  kind?: 'grid' | 'drawn';
  size?: { w: number; h: number }; // mm, drawn templates
  shapes?: DrawnShape[];
  texts?: DrawnText[];
}
export const isDrawn = (t: TitleTemplate) => t.kind === 'drawn';

let n = 0;
const cell = (r: number, c: number, text: string, o: Partial<TbCell> = {}): TbCell => ({ id: `c${++n}`, r, c, kind: 'text', text, size: 8, ...o });

/** The standard block (the one the app draws), as a starting template. */
export function standardTemplate(): TitleTemplate {
  n = 0;
  return {
    id: 'standard', name: 'Standard (180 mm)',
    cols: [45, 45, 45, 45],
    rows: [12, 9, 11, 9, 9, 8],
    cells: [
      cell(0, 0, '', { kind: 'logo', rs: 1 }),
      cell(0, 1, '{Company}', { cs: 3, caption: 'COMPANY / CONSULTANT', bold: true, size: 9 }),
      cell(1, 0, '{Project}', { cs: 3, caption: 'PROJECT', bold: true }),
      cell(1, 3, '{Owner}', { caption: 'OWNER' }),
      cell(2, 0, '{DrawingTitle}', { cs: 4, caption: 'DRAWING TITLE', bold: true, size: 12 }),
      cell(3, 0, '{DrawingNo}', { cs: 2, caption: 'DRAWING NO.', bold: true }),
      cell(3, 2, '{Rev}', { caption: 'REV', bold: true }),
      cell(3, 3, '{RevDate}', { caption: 'DATE' }),
      cell(4, 0, '{DesignedBy}', { caption: 'DESIGNED' }),
      cell(4, 1, '{DrawnBy}', { caption: 'DRAWN' }),
      cell(4, 2, '{CheckedBy}', { caption: 'CHECKED' }),
      cell(4, 3, '{ApprovedBy}', { caption: 'APPROVED' }),
      cell(5, 0, 'Scale NTS · {Voltage}, 3Ph + N, {Frequency}', { cs: 2, caption: 'SHEET' }),
      cell(5, 2, '{SubmissionDate}', { caption: 'SUBMISSION' }),
      cell(5, 3, '{AuthorityRef}', { caption: 'AUTHORITY REF.' })
    ]
  };
}

/** The sheets a title block can be chosen for apart from the rest: SLD and board sheets, riser and earthing sheets,
 * plan sheets, the SLD pages of the reports. */
export type TemplateKind = 'sld' | 'riser' | 'plan' | 'report';
export const TEMPLATE_KINDS: [TemplateKind, string][] = [['sld', 'SLD and board sheets'], ['riser', 'Riser and earthing sheets'], ['plan', 'Plan sheets'], ['report', 'Report pages']];
export const templateKindOf = (kind?: string): TemplateKind => (kind === 'plan' ? 'plan' : kind === 'riser' || kind === 'earthing' || kind === 'earthRiser' || kind === 'earthFloor' ? 'riser' : 'sld');
/** In titleTemplateByKind: the standard block for this kind of sheet (the starting template's own id is 'standard'). */
export const STANDARD_BLOCK = 'standard-block';
/** The template the sheets use: the one chosen for this kind of sheet (STANDARD_BLOCK for the standard block), else the
 * project's. */
export function templateOf(p: Project, kind?: TemplateKind): TitleTemplate | undefined {
  const own = kind ? p.drawing?.titleTemplateByKind?.[kind] : undefined;
  const id = own ?? p.drawing?.titleTemplateId;
  return id && id !== STANDARD_BLOCK ? p.titleTemplates?.find((t) => t.id === id) : undefined;
}

/** Escaped for text and quoted attributes (project data is untrusted). */
const esc = escapeHtmlAttr;

/** The block as HTML (mm units) for the drawing sheet and the preview. `framed`: it sits in the sheet frame's corner,
 * so its right and bottom edges are the frame's (not drawn twice) and its top and left edges are as heavy as the
 * standard block's. */
export function titleBlockHtml(t: TitleTemplate, p: Project, extra: Record<string, string> = {}, framed = false): string {
  if (isDrawn(t)) return drawnTitleBlockHtml(t, p, extra);
  const list = paramList(p);
  const covered = new Set<string>();
  for (const c of t.cells) for (let r = c.r; r < c.r + (c.rs ?? 1); r++) for (let k = c.c; k < c.c + (c.cs ?? 1); k++) if (r !== c.r || k !== c.c) covered.add(`${r},${k}`);
  const at = new Map(t.cells.map((c) => [`${c.r},${c.c}`, c]));
  const body = (c: TbCell) => {
    if (c.kind === 'logo') return isRasterDataUrl(p.drawing?.logo) ? `<img src="${esc(p.drawing!.logo)}" style="max-width:100%;max-height:100%;object-fit:contain" alt="">` : '';
    if (c.kind === 'revisions') {
      const revs = (p.revisions ?? []).slice(-4).reverse();
      return `<table style="width:100%;border-collapse:collapse;font-size:6.5pt">${revs.length ? revs.map((r) => `<tr><td style="border:0;padding:0 1mm">${esc(r.id)}</td><td style="border:0;padding:0 1mm">${esc(fmtDate(r.date))}</td><td style="border:0;padding:0 1mm">${esc(r.description)}</td></tr>`).join('') : '<tr><td style="border:0">Not issued</td></tr>'}</table>`;
    }
    return esc(fillParams(c.text, p, extra, list)).replace(/\n/g, '<br>');
  };
  // Sizes and alignment come from a saved template (project data): numbers and a fixed set of words only.
  const span = (v: unknown) => Math.max(1, Math.min(99, Math.round(num(v, 1))));
  const align = (v: unknown) => (v === 'center' || v === 'right' ? v : 'left');
  const border = (r: number, k: number, rs: number, cs: number) => `border:0.25mm solid #000${framed
    ? `${r === 0 ? ';border-top-width:0.5mm' : ''}${k === 0 ? ';border-left-width:0.5mm' : ''}${k + cs >= t.cols.length ? ';border-right:0' : ''}${r + rs >= t.rows.length ? ';border-bottom:0' : ''}` : ''}`;
  const rows = t.rows.map((h, r) => `<tr style="height:${num(h)}mm">${t.cols.map((_, k) => {
    if (covered.has(`${r},${k}`)) return '';
    const c = at.get(`${r},${k}`);
    if (!c) return `<td style="${border(r, k, 1, 1)}"></td>`;
    return `<td rowspan="${span(c.rs)}" colspan="${span(c.cs)}" style="${border(r, k, span(c.rs), span(c.cs))};padding:0.6mm 1.2mm;vertical-align:top;text-align:${align(c.align)};overflow:hidden">${c.caption ? `<div style="font-size:5.5pt;color:#333;text-transform:uppercase;letter-spacing:.03em;text-align:left">${esc(c.caption)}</div>` : ''}<div style="font-size:${num(c.size, 8)}pt;font-weight:${c.bold ? 700 : 400};line-height:1.15">${body(c)}</div></td>`;
  }).join('')}</tr>`).join('');
  const w = t.cols.reduce((a, b) => a + num(b), 0);
  return `<table style="width:${w}mm;border-collapse:collapse;table-layout:fixed;font-family:Arial,sans-serif;color:#000;background:#fff"><colgroup>${t.cols.map((c) => `<col style="width:${num(c)}mm">`).join('')}</colgroup>${rows}</table>`;
}

export const templateSize = (t: TitleTemplate) => (isDrawn(t) && t.size ? { w: t.size.w, h: t.size.h } : { w: t.cols.reduce((a, b) => a + b, 0), h: t.rows.reduce((a, b) => a + b, 0) });

/** Average width of a character as a share of the cap height (Arial, mixed case). */
export const DRAWN_CHAR = 0.78;
/** A drawn text's words as printed: its parameters filled. */
export const drawnTextValue = (x: DrawnText, p: Project, extra: Record<string, string>, list = paramList(p)) => fillParams(x.text, p, extra, list);
/** A drawn template as SVG (mm), the company block's lines and texts with the project's values in its fields; a value
 * wider than its field (fit) is squeezed to it. Shared by the drawing sheets, the report pages and the designer's print. */
export function drawnTitleBlockHtml(t: TitleTemplate, p: Project, extra: Record<string, string> = {}): string {
  const { w, h } = templateSize(t);
  const list = paramList(p);
  const f = (v: number) => +v.toFixed(3);
  const shapes = (t.shapes ?? []).map((s) => {
    const sw = f(s.w ?? 0.25);
    if (s.kind === 'line') return `<line x1="${f(s.x1)}" y1="${f(s.y1)}" x2="${f(s.x2)}" y2="${f(s.y2)}" stroke="#000" stroke-width="${sw}"/>`;
    if (s.kind === 'circle') return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}" fill="none" stroke="#000" stroke-width="${sw}"/>`;
    const d = s.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ') + (s.closed || s.fill ? ' Z' : '');
    return `<path d="${d}" fill="${s.fill ? '#000' : 'none'}" stroke="#000" stroke-width="${sw}" stroke-linejoin="round"/>`;
  });
  const texts = (t.texts ?? []).map((x) => {
    const value = drawnTextValue(x, p, extra, list);
    if (!value.trim()) return '';
    const size = f(x.h / 0.72), anchor = x.align === 'center' ? 'middle' : x.align === 'right' ? 'end' : 'start';
    const width = value.length * x.h * DRAWN_CHAR, fit = x.fit && width > x.fit ? ` textLength="${f(x.fit)}" lengthAdjust="spacingAndGlyphs"` : '';
    const rot = x.rot ? ` transform="rotate(${f(-x.rot)} ${f(x.x)} ${f(x.y)})"` : '';
    return `<text x="${f(x.x)}" y="${f(x.y)}" font-size="${size}" text-anchor="${anchor}"${x.bold ? ' font-weight="700"' : ''}${fit}${rot}>${esc(value)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}" style="display:block;background:#fff" font-family="Arial, Helvetica, sans-serif" fill="#000">${shapes.join('')}${texts.join('')}</svg>`;
}

// ---- Editing helpers -----------------------------------------------------------

/** The cell covering a grid position. */
export const cellAt = (t: TitleTemplate, r: number, c: number) =>
  t.cells.find((x) => r >= x.r && r < x.r + (x.rs ?? 1) && c >= x.c && c < x.c + (x.cs ?? 1));

/** Fill empty grid positions with blank cells (after adding rows / columns or splitting). */
export function fillGaps(t: TitleTemplate): TitleTemplate {
  const cells = [...t.cells];
  let k = cells.length;
  for (let r = 0; r < t.rows.length; r++) for (let c = 0; c < t.cols.length; c++) {
    if (!cells.some((x) => r >= x.r && r < x.r + (x.rs ?? 1) && c >= x.c && c < x.c + (x.cs ?? 1))) cells.push({ id: `n${Date.now().toString(36)}${++k}`, r, c, kind: 'text', text: '', size: 8 });
  }
  return { ...t, cells };
}

export function mergeRight(t: TitleTemplate, id: string): TitleTemplate {
  const c = t.cells.find((x) => x.id === id);
  if (!c) return t;
  const nextC = c.c + (c.cs ?? 1);
  if (nextC >= t.cols.length) return t;
  const rs = c.rs ?? 1;
  // Everything in the next column band is absorbed, if it fits inside this cell's rows.
  const victims = t.cells.filter((x) => x.c === nextC && x.r >= c.r && x.r + (x.rs ?? 1) <= c.r + rs);
  const need = rs;
  if (victims.reduce((a, x) => a + (x.rs ?? 1), 0) !== need) return t;
  const w = Math.max(...victims.map((x) => x.cs ?? 1));
  if (victims.some((x) => (x.cs ?? 1) !== w)) return t;
  return { ...t, cells: t.cells.filter((x) => !victims.includes(x)).map((x) => (x.id === id ? { ...x, cs: (x.cs ?? 1) + w } : x)) };
}

export function mergeDown(t: TitleTemplate, id: string): TitleTemplate {
  const c = t.cells.find((x) => x.id === id);
  if (!c) return t;
  const nextR = c.r + (c.rs ?? 1);
  if (nextR >= t.rows.length) return t;
  const cs = c.cs ?? 1;
  const victims = t.cells.filter((x) => x.r === nextR && x.c >= c.c && x.c + (x.cs ?? 1) <= c.c + cs);
  if (victims.reduce((a, x) => a + (x.cs ?? 1), 0) !== cs) return t;
  const h = Math.max(...victims.map((x) => x.rs ?? 1));
  if (victims.some((x) => (x.rs ?? 1) !== h)) return t;
  return { ...t, cells: t.cells.filter((x) => !victims.includes(x)).map((x) => (x.id === id ? { ...x, rs: (x.rs ?? 1) + h } : x)) };
}

export const split = (t: TitleTemplate, id: string): TitleTemplate =>
  fillGaps({ ...t, cells: t.cells.map((x) => (x.id === id ? { ...x, rs: undefined, cs: undefined } : x)) });

export function addRow(t: TitleTemplate, after: number): TitleTemplate {
  const cells = t.cells.map((x) => (x.r > after ? { ...x, r: x.r + 1 } : x.r <= after && x.r + (x.rs ?? 1) - 1 > after ? { ...x, rs: (x.rs ?? 1) + 1 } : x));
  return fillGaps({ ...t, rows: [...t.rows.slice(0, after + 1), 8, ...t.rows.slice(after + 1)], cells });
}
export function addCol(t: TitleTemplate, after: number): TitleTemplate {
  const cells = t.cells.map((x) => (x.c > after ? { ...x, c: x.c + 1 } : x.c <= after && x.c + (x.cs ?? 1) - 1 > after ? { ...x, cs: (x.cs ?? 1) + 1 } : x));
  return fillGaps({ ...t, cols: [...t.cols.slice(0, after + 1), 30, ...t.cols.slice(after + 1)], cells });
}
export function removeRow(t: TitleTemplate, r: number): TitleTemplate {
  if (t.rows.length <= 1) return t;
  const cells = t.cells.flatMap((x) => {
    const end = x.r + (x.rs ?? 1) - 1;
    if (x.r === r && (x.rs ?? 1) === 1) return [];
    if (x.r <= r && end >= r) return [{ ...x, rs: (x.rs ?? 1) - 1 }];
    return [x.r > r ? { ...x, r: x.r - 1 } : x];
  });
  return fillGaps({ ...t, rows: t.rows.filter((_, i) => i !== r), cells });
}
export function removeCol(t: TitleTemplate, c: number): TitleTemplate {
  if (t.cols.length <= 1) return t;
  const cells = t.cells.flatMap((x) => {
    const end = x.c + (x.cs ?? 1) - 1;
    if (x.c === c && (x.cs ?? 1) === 1) return [];
    if (x.c <= c && end >= c) return [{ ...x, cs: (x.cs ?? 1) - 1 }];
    return [x.c > c ? { ...x, c: x.c - 1 } : x];
  });
  return fillGaps({ ...t, cols: t.cols.filter((_, i) => i !== c), cells });
}

const LIB = 'lvds.titleTemplates';
export function loadTemplateLibrary(): TitleTemplate[] {
  try { const v = JSON.parse(localStorage.getItem(LIB) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveTemplateLibrary(list: TitleTemplate[]): boolean {
  try { localStorage.setItem(LIB, JSON.stringify(list)); void pushLibrary(); return true; } catch { return false; }
}
