import ExcelJS from 'exceljs';
import { cellAt, cellName, colName, formulaFunctions, SHEET_FUNCTIONS, type CellValue } from '../calc/sheetFormula';
import { areaCells, DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_WIDTH, MAX_COLS, MAX_ROWS, newSheet, sheetNameError, sheetValues, type Area, type Sheet, type SheetStyle } from '../model/sheets';

// ExcelJS loads only when a file is opened or saved (the page imports this file on demand).
/** Excel files for the Sheets page: an .xlsx read into the app's sheets and written back. Kept: values, formulas,
 * bold / italic / underline, alignment, wrap, the 0.00 and percent formats, column widths and sheet names. A
 * formula the app cannot work out keeps its value from the file and goes back into the saved file unchanged.
 * Merged cells and borders (thin or thick) are kept too; border colours and dash patterns, and fill and text colours
 * are not (a filled cell becomes the app's one highlight). Not kept: charts, images, comments and anything else Excel-only. */

export interface XlsxReport {
  sheets: number;
  cells: number;
  formulas: number;
  /** Formulas kept with their last value, and the functions (or "another sheet", "a name") that caused it. */
  keptFormulas: number;
  keptBecause: string[];
  mergedAreas: number;
  /** Sheets cut at the app's limit of rows or columns. */
  cut: string[];
}

const PX_PER_CHAR = 7, PX_PAD = 5;
const text = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: unknown; error?: string; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (o.error) return o.error;
    if (o.text !== undefined) return text(o.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v);
};
/** A text from Excel as the sheet holds it: one that would read as a number or a formula gets Excel's apostrophe. */
const asTyped = (s: string) => (s !== '' && (s.startsWith('=') || s.startsWith("'") || (s.trim() !== '' && Number.isFinite(Number(s.trim())))) ? `'${s}` : s);
const THICK = new Set(['medium', 'thick', 'double', 'mediumDashed', 'mediumDashDot', 'mediumDashDotDot']);
/** The sides of a cell with a line, as the sheet's border letters (t r b l; upper case for a thick line). */
function borderOf(c: ExcelJS.Cell): string {
  const b = c.border;
  if (!b) return '';
  return (['top', 'right', 'bottom', 'left'] as const).map((side) => { const st = b[side]?.style; return st ? (THICK.has(st) ? side[0].toUpperCase() : side[0]) : ''; }).join('');
}
const value = (v: unknown): CellValue => (typeof v === 'number' || typeof v === 'boolean' ? v : v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : text(v) || null);

function styleOf(c: ExcelJS.Cell): SheetStyle | undefined {
  const st: SheetStyle = {};
  if (c.font?.bold) st.bold = true;
  if (c.font?.italic) st.italic = true;
  if (c.font?.underline) st.underline = true;
  const h = c.alignment?.horizontal;
  if (h === 'left' || h === 'center' || h === 'right') st.align = h;
  if (c.alignment?.wrapText) st.wrap = true;
  const fill = c.fill as ExcelJS.FillPattern | undefined;
  if (fill?.type === 'pattern' && fill.pattern === 'solid' && fill.fgColor && (fill.fgColor.argb ?? '').toUpperCase() !== 'FFFFFFFF') st.fill = true;
  const f = typeof c.numFmt === 'string' ? c.numFmt : '';
  if (f.includes('%')) st.fmt = 'percent'; else if (/0\.00(?!0)/.test(f)) st.fmt = 'dec2';
  const border = borderOf(c);
  if (border) st.border = border;
  return Object.keys(st).length ? st : undefined;
}

/** What in a formula the app does not have, for the message after a file is opened. */
function beyond(formula: string): string {
  const bare = formula.replace(/"(?:[^"]|"")*"/g, '');
  if (bare.includes('!')) return 'another sheet';
  if (/[[\]{}]/.test(bare)) return 'a table or array';
  const unknown = formulaFunctions(formula).filter((f) => !SHEET_FUNCTIONS.includes(f));
  return unknown.length ? unknown.join(', ') : 'a name';
}

/** The sheets of an .xlsx file. `existing`: the book's sheets, so the new ones get ids and names of their own. */
export async function readXlsx(data: ArrayBuffer, fileName: string, existing: Sheet[] = []): Promise<{ sheets: Sheet[]; report: XlsxReport }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const out: Sheet[] = [];
  const report: XlsxReport = { sheets: 0, cells: 0, formulas: 0, keptFormulas: 0, keptBecause: [], mergedAreas: 0, cut: [] };
  const why = new Set<string>();
  for (const ws of wb.worksheets) {
    const all = [...existing, ...out];
    let name = ws.name.trim().slice(0, 31) || 'Sheet';
    for (let n = 2; sheetNameError(name, all); n++) name = `${ws.name.trim().slice(0, 27) || 'Sheet'} (${n})`;
    const s: Sheet = { ...newSheet(all, name), source: fileName };
    const cells: Record<string, string> = {}, styles: Record<string, SheetStyle> = {}, results: Record<string, CellValue> = {};
    let rows = 0, cols = 0, cut = false;
    // A cell with no value but a border or another style is kept too, so the loops walk the rows and cells themselves
    // (eachRow / eachCell with includeEmpty: false skip them), and stop at the app's limits.
    const filled = (c: ExcelJS.Cell | undefined) => !!c && c.type !== ExcelJS.ValueType.Null;
    for (let r = 1; r <= Math.min(ws.rowCount, MAX_ROWS); r++) {
      const row = ws.findRow(r);
      if (!row) continue;
      for (let col = 1; col <= Math.min(row.cellCount, MAX_COLS); col++) {
        const c = row.findCell(col);
        if (!c) continue;
        if (c.isMerged && c.master.address !== c.address) continue; // the value is in the area's first cell
        const k = cellName(col, r);
        const st = styleOf(c);
        if (st) styles[k] = st;
        const f = c.formula;
        let typed = '';
        if (f) {
          typed = `=${f}`;
          report.formulas++;
          results[k] = value(c.result);
        } else if (typeof c.value === 'number') typed = String(c.value);
        else if (typeof c.value === 'boolean') typed = c.value ? 'TRUE' : 'FALSE';
        else typed = asTyped(text(c.value));
        if (typed === '' && !st) continue;
        if (typed !== '') { cells[k] = typed; report.cells++; }
        rows = Math.max(rows, r); cols = Math.max(cols, col);
      }
      for (let col = MAX_COLS + 1; col <= row.cellCount && !cut; col++) if (filled(row.findCell(col))) cut = true;
    }
    for (let r = MAX_ROWS + 1; r <= ws.rowCount && !cut; r++) if (ws.findRow(r)?.hasValues) cut = true;
    // Merged areas: the area's outline is read from its corner cells and kept on its first cell.
    const merges: Area[] = [];
    for (const m of (ws.model as { merges?: string[] }).merges ?? []) {
      const [p, q = p] = m.split(':').map((x) => cellAt(x));
      if (!p || !q) continue;
      const a: Area = { r0: Math.min(p.row, q.row), c0: Math.min(p.col, q.col), r1: Math.min(MAX_ROWS, Math.max(p.row, q.row)), c1: Math.min(MAX_COLS, Math.max(p.col, q.col)) };
      if (a.r0 > MAX_ROWS || a.c0 > MAX_COLS || (a.r0 === a.r1 && a.c0 === a.c1)) continue;
      const line = (rr: number, cc: number, side: 't' | 'r' | 'b' | 'l') => { const b = borderOf(ws.getCell(rr, cc)); return b.includes(side) ? side : b.includes(side.toUpperCase()) ? side.toUpperCase() : ''; };
      const border = line(a.r0, a.c0, 't') + line(a.r0, a.c1, 'r') + line(a.r1, a.c0, 'b') + line(a.r0, a.c0, 'l');
      const k = cellName(a.c0, a.r0), st: SheetStyle = { ...(styles[k] ?? {}) };
      delete st.border;
      if (border) st.border = border;
      if (Object.keys(st).length) styles[k] = st; else delete styles[k];
      for (const kk of areaCells(a).slice(1)) delete styles[kk];
      merges.push(a);
      rows = Math.max(rows, a.r1); cols = Math.max(cols, a.c1);
    }
    const widths: Record<string, number> = {};
    for (let c = 1; c <= Math.min(cols, MAX_COLS); c++) {
      const w = ws.getColumn(c).width;
      if (w) { const px = Math.round(Math.min(400, Math.max(40, w * PX_PER_CHAR + PX_PAD))); if (px !== DEFAULT_WIDTH) widths[colName(c)] = px; }
    }
    // Formulas the app cannot read or has no function for keep the file's value. Found by working the sheet out:
    // first with every file value at hand, then keeping only the ones that were needed.
    const all0: NonNullable<Sheet['kept']> = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { f: cells[k], v }]));
    const tried = sheetValues({ ...s, cells, kept: all0 });
    const kept: NonNullable<Sheet['kept']> = {};
    for (const [k, r] of Object.entries(tried)) if (r.unsupported && all0[k]) { kept[k] = all0[k]; report.keptFormulas++; why.add(beyond(cells[k])); }
    report.mergedAreas += merges.length;
    if (cut) report.cut.push(name);
    out.push({ ...s, cells, ...(Object.keys(styles).length ? { styles } : {}), ...(Object.keys(widths).length ? { widths } : {}), ...(Object.keys(kept).length ? { kept } : {}), ...(merges.length ? { merges } : {}),
      rows: Math.max(DEFAULT_ROWS, rows + 5), cols: Math.max(DEFAULT_COLS, Math.min(MAX_COLS, cols + 2)) });
  }
  report.sheets = out.length;
  report.keptBecause = [...why].sort();
  return { sheets: out, report };
}

/** One line for the status bar after a file is opened. */
export function reportText(fileName: string, r: XlsxReport): string {
  const parts = [`Opened ${fileName}: ${r.sheets} sheet${r.sheets === 1 ? '' : 's'}, ${r.cells} cells, ${r.formulas} formula${r.formulas === 1 ? '' : 's'}`];
  if (r.keptFormulas) parts.push(`${r.keptFormulas} kept with the file's value (${r.keptBecause.join('; ')})`);
  if (r.mergedAreas) parts.push(`${r.mergedAreas} merged area${r.mergedAreas === 1 ? '' : 's'}`);
  if (r.cut.length) parts.push(`cut at ${MAX_ROWS} rows / ${MAX_COLS} columns: ${r.cut.join(', ')}`);
  return `${parts.join(' · ')}.`;
}

/** The book as an Excel workbook: formulas as formulas, with the app's values as their saved results. */
export function buildXlsx(sheets: Sheet[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LV Design Studio';
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    const values = sheetValues(s);
    for (const [k, typed] of Object.entries(s.cells)) {
      const c = ws.getCell(k), r = values[k];
      if (typed.startsWith('=') && typed.length > 1) {
        const result = r?.error ? { error: r.error } : r?.value ?? undefined;
        c.value = { formula: typed.slice(1), ...(result !== undefined && result !== null ? { result } : {}) } as ExcelJS.CellValue;
      } else if (typed.startsWith("'")) c.value = typed.slice(1);
      else c.value = (r?.value ?? typed) as ExcelJS.CellValue;
    }
    for (const [k, st] of Object.entries(s.styles ?? {})) {
      const c = ws.getCell(k);
      if (st.bold || st.italic || st.underline || st.accent) c.font = { ...(st.bold ? { bold: true } : {}), ...(st.italic ? { italic: true } : {}), ...(st.underline ? { underline: true } : {}), ...(st.accent ? { color: { argb: 'FF9C5700' } } : {}) };
      if (st.align || st.wrap) c.alignment = { ...(st.align ? { horizontal: st.align } : {}), ...(st.wrap ? { wrapText: true } : {}) };
      if (st.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      if (st.border) c.border = Object.fromEntries((['top', 'right', 'bottom', 'left'] as const).map((side) => [side, st.border!.includes(side[0]) ? { style: 'thin' } : st.border!.includes(side[0].toUpperCase()) ? { style: 'medium' } : undefined]).filter((e) => e[1])) as Partial<ExcelJS.Borders>;
      if (st.fmt === 'dec2') c.numFmt = '#,##0.00'; else if (st.fmt === 'percent') c.numFmt = '0.##%';
    }
    for (const m of s.merges ?? []) ws.mergeCells(m.r0, m.c0, m.r1, m.c1);
    for (let c = 1; c <= s.cols; c++) ws.getColumn(c).width = Math.round((((s.widths?.[colName(c)] ?? DEFAULT_WIDTH) - PX_PAD) / PX_PER_CHAR) * 100) / 100;
  }
  return wb;
}
