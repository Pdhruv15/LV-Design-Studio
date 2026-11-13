import { cellAt, cellName, colIndex, colName, evaluateSheet, shiftFormula, type CellResult } from '../calc/sheetFormula';

/** The built-in sheets (Sheets page): what a sheet holds and the edits the page makes to it. Every edit returns a
 * new sheet, so one edit is one undo step. Rows and columns are counted from 1, cells are named as in Excel. */

export type SheetAlign = 'left' | 'center' | 'right';
export type SheetNumberFormat = 'general' | 'dec2' | 'percent';
export interface SheetStyle { bold?: boolean; italic?: boolean; underline?: boolean; align?: SheetAlign; wrap?: boolean; fill?: boolean; accent?: boolean; fmt?: SheetNumberFormat }
export interface Sheet {
  id: string;
  name: string;
  /** What was typed in each cell: a number, a text, or a formula starting with "=". Blank cells are left out. */
  cells: Record<string, string>;
  styles?: Record<string, SheetStyle>;
  /** Column widths in px, by column letter; the rest are DEFAULT_WIDTH. */
  widths?: Record<string, number>;
  rows: number;
  cols: number;
}
export interface SheetBook { sheets: Sheet[] }
export interface Area { r0: number; c0: number; r1: number; c1: number }

export const DEFAULT_ROWS = 40, DEFAULT_COLS = 12, DEFAULT_WIDTH = 96, MAX_ROWS = 2000, MAX_COLS = 60;
export const WIDTH_STEPS = [64, 96, 140, 200, 280];

export const area = (a: { r: number; c: number }, b: { r: number; c: number }): Area => ({ r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) });
export function areaCells(a: Area): string[] {
  const out: string[] = [];
  for (let r = a.r0; r <= a.r1; r++) for (let c = a.c0; c <= a.c1; c++) out.push(cellName(c, r));
  return out;
}

export function newSheet(existing: Sheet[] = [], name?: string): Sheet {
  let n = existing.length + 1;
  const taken = new Set(existing.map((s) => s.name.toLowerCase()));
  while (taken.has(`sheet ${n}`)) n++;
  let id = existing.length + 1;
  while (existing.some((s) => s.id === `S${id}`)) id++;
  return { id: `S${id}`, name: name?.trim() || `Sheet ${n}`, cells: {}, rows: DEFAULT_ROWS, cols: DEFAULT_COLS };
}
/** A sheet name as the tab shows it: trimmed, 31 characters at most (Excel's limit), not one another sheet has. */
export function sheetNameError(name: string, others: Sheet[]): string | undefined {
  const t = name.trim();
  if (!t) return 'Give the sheet a name';
  if (t.length > 31) return 'A sheet name is 31 characters at most';
  if (/[\\/?*[\]:]/.test(t)) return 'A sheet name cannot have \\ / ? * [ ] :';
  if (others.some((s) => s.name.toLowerCase() === t.toLowerCase())) return 'Another sheet has this name';
  return undefined;
}

/** The sheet with cells set (a blank value clears the cell); grows to hold a cell beyond its edge. */
export function withCells(s: Sheet, edits: Record<string, string>): Sheet {
  const cells = { ...s.cells };
  let { rows, cols } = s;
  for (const [k0, v] of Object.entries(edits)) {
    const at = cellAt(k0);
    if (!at || at.row > MAX_ROWS || at.col > MAX_COLS) continue;
    const k = cellName(at.col, at.row);
    if (v === '' || v === undefined) delete cells[k];
    else { cells[k] = v; rows = Math.max(rows, at.row); cols = Math.max(cols, at.col); }
  }
  return { ...s, cells, rows, cols };
}

/** The sheet with a style change on every cell of an area; a key set to undefined is removed. */
export function withStyle(s: Sheet, a: Area, change: Partial<SheetStyle>): Sheet {
  const styles = { ...(s.styles ?? {}) };
  for (const k of areaCells(a)) {
    const next: SheetStyle = { ...(styles[k] ?? {}), ...change };
    for (const key of Object.keys(next) as (keyof SheetStyle)[]) if (next[key] === undefined || next[key] === false) delete next[key];
    if (Object.keys(next).length) styles[k] = next; else delete styles[k];
  }
  return { ...s, styles };
}
/** Whether every cell of an area has a style flag: the tool then turns it off, as in Excel. */
export const allStyled = (s: Sheet, a: Area, key: 'bold' | 'italic' | 'underline' | 'wrap' | 'fill' | 'accent') => areaCells(a).every((k) => !!s.styles?.[k]?.[key]);

// ---- rows and columns: the cells move, and every formula's references follow

const ONE = /(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]{0,6})/;
const REFS = new RegExp(`"(?:[^"]|"")*"|${ONE.source}(?::${ONE.source})?(?![A-Za-z0-9_(.])`, 'g');
/** A formula after rows (or columns) were inserted (count > 0) or deleted (count < 0) at `at`. A reference to a
 * deleted cell becomes #REF!; a range loses the deleted part and is #REF! only when nothing of it is left. */
export function adjustFormula(formula: string, axis: 'row' | 'col', at: number, count: number): string {
  if (!formula.startsWith('=')) return formula;
  const gone = (v: number) => count < 0 && v >= at && v < at - count;
  const moved = (v: number) => (v >= at ? Math.max(at, v + count) : v);
  const name = (ac: string, col: number, ar: string, row: number) => `${ac}${colName(col)}${ar}${row}`;
  return formula.replace(REFS, (m: string, ...g: (string | number | undefined)[]) => {
    const [ac, col, ar, row, bc, col2, br, row2] = g as (string | undefined)[];
    const offset = g[8] as number;
    if (col === undefined) return m;
    if (offset > 0 && /[A-Za-z0-9_.]/.test(formula[offset - 1])) return m;
    const a = { c: colIndex(col.toUpperCase()), r: Number(row) };
    const pick = (p: { c: number; r: number }) => (axis === 'row' ? p.r : p.c);
    const put = (p: { c: number; r: number }, v: number) => (axis === 'row' ? { c: p.c, r: v } : { c: v, r: p.r });
    if (col2 === undefined) {
      if (gone(pick(a))) return '#REF!';
      const q = put(a, moved(pick(a)));
      return name(ac ?? '', q.c, ar ?? '', q.r);
    }
    const b = { c: colIndex(col2.toUpperCase()), r: Number(row2) };
    let lo = Math.min(pick(a), pick(b)), hi = Math.max(pick(a), pick(b));
    if (count < 0) {
      const end = at - count - 1; // last deleted
      if (lo >= at && hi <= end) return '#REF!';
      lo = lo > end ? lo + count : Math.min(lo, at);
      hi = hi > end ? hi + count : hi >= at ? at - 1 : hi;
    } else { lo = moved(lo); hi = moved(hi); }
    const first = put(a, pick(a) <= pick(b) ? lo : hi), second = put(b, pick(a) <= pick(b) ? hi : lo);
    return `${name(ac ?? '', first.c, ar ?? '', first.r)}:${name(bc ?? '', second.c, br ?? '', second.r)}`;
  });
}

function reshape(s: Sheet, axis: 'row' | 'col', at: number, count: number): Sheet {
  const pick = (p: { col: number; row: number }) => (axis === 'row' ? p.row : p.col);
  const moveKey = (k: string): string | undefined => {
    const p = cellAt(k)!;
    const v = pick(p);
    if (count < 0 && v >= at && v < at - count) return undefined;
    const to = v >= at ? v + count : v;
    return axis === 'row' ? cellName(p.col, to) : cellName(to, p.row);
  };
  const cells: Record<string, string> = {}, styles: Record<string, SheetStyle> = {};
  for (const [k, v] of Object.entries(s.cells)) { const to = moveKey(k); if (to) cells[to] = adjustFormula(v, axis, at, count); }
  for (const [k, v] of Object.entries(s.styles ?? {})) { const to = moveKey(k); if (to) styles[to] = v; }
  let widths = s.widths;
  if (axis === 'col' && widths) {
    widths = {};
    for (const [letters, w] of Object.entries(s.widths!)) {
      const c = colIndex(letters);
      if (count < 0 && c >= at && c < at - count) continue;
      widths[colName(c >= at ? c + count : c)] = w;
    }
  }
  const rows = axis === 'row' ? Math.min(MAX_ROWS, Math.max(1, s.rows + count)) : s.rows;
  const cols = axis === 'col' ? Math.min(MAX_COLS, Math.max(1, s.cols + count)) : s.cols;
  return { ...s, cells, ...(Object.keys(styles).length || s.styles ? { styles } : {}), ...(widths ? { widths } : {}), rows, cols };
}
export const insertRows = (s: Sheet, at: number, count = 1): Sheet => (s.rows + count > MAX_ROWS ? s : reshape(s, 'row', at, count));
export const deleteRows = (s: Sheet, at: number, count = 1): Sheet => reshape(s, 'row', at, -Math.min(count, s.rows - at + 1));
export const insertCols = (s: Sheet, at: number, count = 1): Sheet => (s.cols + count > MAX_COLS ? s : reshape(s, 'col', at, count));
export const deleteCols = (s: Sheet, at: number, count = 1): Sheet => reshape(s, 'col', at, -Math.min(count, s.cols - at + 1));

/** The next width for the columns of an area: one step wider, and back to the narrowest after the widest. */
export function withNextWidth(s: Sheet, a: Area): Sheet {
  const widths = { ...(s.widths ?? {}) };
  const now = widths[colName(a.c0)] ?? DEFAULT_WIDTH;
  const next = WIDTH_STEPS.find((w) => w > now) ?? WIDTH_STEPS[0];
  for (let c = a.c0; c <= a.c1; c++) widths[colName(c)] = next;
  return { ...s, widths };
}

// ---- copy, paste, fill

/** The area as rows of what was typed (formulas as formulas). */
export const rawRows = (s: Sheet, a: Area): string[][] => Array.from({ length: a.r1 - a.r0 + 1 }, (_, r) => Array.from({ length: a.c1 - a.c0 + 1 }, (_, c) => s.cells[cellName(a.c0 + c, a.r0 + r)] ?? ''));
/** The area as rows of what is shown (formulas as their values), for the clipboard and Paste values. */
export function shownRows(s: Sheet, a: Area, values: Record<string, CellResult> = evaluateSheet(s.cells)): string[][] {
  return Array.from({ length: a.r1 - a.r0 + 1 }, (_, r) => Array.from({ length: a.c1 - a.c0 + 1 }, (_, c) => plain(values[cellName(a.c0 + c, a.r0 + r)])));
}
const plain = (r: CellResult | undefined): string => (!r ? '' : r.error ? r.error : r.value === null ? '' : typeof r.value === 'boolean' ? (r.value ? 'TRUE' : 'FALSE') : String(r.value));

/** Edits that paste a block with its top-left cell at (row, col). `from`: where the block was copied in this
 * sheet — its formulas then follow the move, as in Excel; without it the block is pasted as typed. One copied
 * cell pasted over a larger selection fills the selection. */
export function pasteEdits(block: string[][], at: Area, from?: { r: number; c: number }): Record<string, string> {
  const out: Record<string, string> = {};
  const h = block.length, w = Math.max(0, ...block.map((r) => r.length));
  if (!h || !w) return out;
  const single = h === 1 && w === 1;
  const rows = single ? at.r1 - at.r0 + 1 : h, cols = single ? at.c1 - at.c0 + 1 : w;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = block[single ? 0 : r]?.[single ? 0 : c] ?? '';
    const row = at.r0 + r, col = at.c0 + c;
    if (row > MAX_ROWS || col > MAX_COLS) continue;
    out[cellName(col, row)] = from ? shiftFormula(v, row - (from.r + (single ? 0 : r)), col - (from.c + (single ? 0 : c))) : v;
  }
  return out;
}

/** Edits that fill an area down from its first row (formulas follow). */
export function fillDownEdits(s: Sheet, a: Area): Record<string, string> {
  const out: Record<string, string> = {};
  for (let r = a.r0 + 1; r <= a.r1; r++) for (let c = a.c0; c <= a.c1; c++) out[cellName(c, r)] = shiftFormula(s.cells[cellName(c, a.r0)] ?? '', r - a.r0, 0);
  return out;
}

/** The Sum tool: a formula adding the run of numbers above the cell, or else to its left; none when there is no run. */
export function sumFormula(s: Sheet, r: number, c: number, values: Record<string, CellResult> = evaluateSheet(s.cells)): string | undefined {
  const isNum = (row: number, col: number) => typeof values[cellName(col, row)]?.value === 'number';
  let top = r;
  while (top > 1 && isNum(top - 1, c)) top--;
  if (top < r) return `=SUM(${cellName(c, top)}:${cellName(c, r - 1)})`;
  let left = c;
  while (left > 1 && isNum(r, left - 1)) left--;
  return left < c ? `=SUM(${cellName(left, r)}:${cellName(c - 1, r)})` : undefined;
}

/** A cell as the grid shows it. */
export function shown(r: CellResult | undefined, fmt: SheetNumberFormat = 'general'): string {
  if (!r) return '';
  if (r.error) return r.error;
  const v = r.value;
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  if (fmt === 'dec2') return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (fmt === 'percent') return `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
  return String(Number(v.toPrecision(10)));
}
