import ExcelJS from 'exceljs';
import { scheduleCircuits } from '../calc/loadSchedule';
import { SCHEDULE_GROUPS, scheduleGroups } from '../model/scheduleGroups';
import type { Project } from '../types';
import { templateData, TEMPLATE_FIELDS, type Fields } from './scheduleFields';

export { TEMPLATE_FIELDS, templateData };

/** Your own Excel load schedule format: an .xlsx laid out as you like, with
 * placeholders the app fills in, e.g. {{board.id}} or {{row.mcb}}. The row
 * holding {{row.…}} placeholders is repeated for every circuit and spare of
 * the DB (its styles, row height and merges copied). The sheet that has that
 * row is copied once per DB; other sheets are kept as they are. A cell that
 * is only one placeholder gets a number where the value is one. Formulas
 * below the repeated row are moved down with it, and a range over that row
 * (e.g. SUM(N8:N8)) is stretched over all the rows. Unknown placeholders are
 * left in place and reported. */

const PH = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;
const ROW_PH = /\{\{\s*row\./;

/** Text of a cell as the template has it (plain or rich text). */
function cellText(cell: ExcelJS.Cell): string | undefined {
  const v = cell.value;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('');
  return undefined;
}

/** Replaces the placeholders in a cell; unknown keys are kept and collected. */
function fillCell(cell: ExcelJS.Cell, fields: Fields, unknown: Set<string>) {
  const text = cellText(cell);
  if (text === undefined || !text.includes('{{')) return;
  const only = /^\s*\{\{\s*([A-Za-z0-9_.]+)\s*\}\}\s*$/.exec(text);
  if (only && only[1] in fields) {
    const v = fields[only[1]];
    cell.value = v === '' ? null : v;
    return;
  }
  cell.value = text.replace(PH, (m, key: string) => {
    if (key in fields) return String(fields[key]);
    unknown.add(key);
    return m;
  });
}

/** The repeated row: the first with a {{row.…}} placeholder. */
function findRowTemplate(ws: ExcelJS.Worksheet): number | undefined {
  let found: number | undefined;
  ws.eachRow((row, r) => {
    if (found) return;
    row.eachCell((cell) => { if (!found && ROW_PH.test(cellText(cell) ?? '')) found = r; });
  });
  return found;
}

interface Range { top: number; left: number; bottom: number; right: number }
const parseRange = (s: string): Range => {
  const [a, b = a] = s.split(':');
  const cell = (x: string) => { const m = /^([A-Z]+)(\d+)$/.exec(x)!; return { col: colNumber(m[1]), row: Number(m[2]) }; };
  const p = cell(a), q = cell(b);
  return { top: Math.min(p.row, q.row), bottom: Math.max(p.row, q.row), left: Math.min(p.col, q.col), right: Math.max(p.col, q.col) };
};
const colNumber = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

/** Moves formula references when `extra` rows are inserted after row `at`:
 * rows below move down; a range that starts and ends on row `at` stretches. */
export function shiftFormula(f: string, at: number, extra: number): string {
  if (!extra) return f;
  const ref = (col: string, abs: string, row: string) => {
    const n = Number(row);
    return `${col}${abs}${n > at ? n + extra : n}`;
  };
  return f
    .replace(/(\$?[A-Z]{1,3})(\$?)(\d+):(\$?[A-Z]{1,3})(\$?)(\d+)/g, (_m, c1: string, a1: string, r1: string, c2: string, a2: string, r2: string) => {
      const end = Number(r2) === at && Number(r1) <= at ? `${c2}${a2}${at + extra}` : ref(c2, a2, r2);
      return `${ref(c1, a1, r1)}:${end}`;
    })
    .replace(/(?<![A-Z$:\d])(\$?[A-Z]{1,3})(\$?)(\d+)(?![\d:(])/g, (_m, c: string, a: string, r: string) => ref(c, a, r));
}

/** Fills one copy of the template sheet for one DB. */
function fillSheet(ws: ExcelJS.Worksheet, data: { fields: Fields; rows: Fields[] }, unknown: Set<string>) {
  const at = findRowTemplate(ws);
  if (at !== undefined) {
    const n = data.rows.length;
    const merges = ((ws.model as { merges?: string[] }).merges ?? []).map(parseRange);
    const inRow = merges.filter((m) => m.top === at && m.bottom === at);
    const below = merges.filter((m) => m.top > at);
    const spanning = merges.filter((m) => m.top <= at && m.bottom >= at && m.bottom > m.top);
    for (const m of [...inRow, ...below, ...spanning]) ws.unMergeCells(m.top, m.left, m.bottom, m.right);
    // Columns of the row to merge down: board-level placeholders over every
    // row, {{row.elcb}} over each ELCB group (as on the printed DEWA form).
    const tplRow = ws.getRow(at);
    const vertical: { col: number; by: 'all' | 'elcb' }[] = [];
    tplRow.eachCell((cell, col) => {
      const text = cellText(cell) ?? '';
      if (inRow.some((m) => col >= m.left && col <= m.right)) return;
      if (/^\s*\{\{\s*row\.elcb\s*\}\}\s*$/.test(text)) vertical.push({ col, by: 'elcb' });
      else if (text.includes('{{') && !ROW_PH.test(text)) vertical.push({ col, by: 'all' });
    });
    const extra = Math.max(n - 1, 0);
    if (extra) ws.duplicateRow(at, extra, true);
    if (!n) ws.spliceRows(at, 1, []); // a DB without circuits: no row
    const shift = n ? extra : -1;
    for (let i = 0; i < n; i++) {
      const row = ws.getRow(at + i);
      row.eachCell({ includeEmpty: true }, (cell) => fillCell(cell, { ...data.fields, ...data.rows[i] }, unknown));
    }
    for (const m of inRow) for (let i = 0; i < n; i++) ws.mergeCells(at + i, m.left, at + i, m.right);
    for (const v of vertical) {
      for (let i = 0; i < n;) {
        let j = i + 1;
        const group = data.rows[i]['row.elcbGroup'];
        if (v.by === 'all') j = n;
        else while (j < n && group && data.rows[j]['row.elcbGroup'] === group) j++;
        if (j - i > 1) {
          for (let k = i + 1; k < j; k++) ws.getCell(at + k, v.col).value = null;
          ws.mergeCells(at + i, v.col, at + j - 1, v.col);
        }
        i = j;
      }
    }
    for (const m of below) ws.mergeCells(m.top + shift, m.left, m.bottom + shift, m.right);
    for (const m of spanning) ws.mergeCells(m.top, m.left, Math.max(m.bottom + shift, m.top), m.right); // a side cell spanning the rows grows with them
    if (shift) {
      ws.eachRow((row) => row.eachCell((cell) => {
        const v = cell.value;
        if (v && typeof v === 'object' && 'formula' in v && typeof v.formula === 'string') cell.value = { formula: n ? shiftFormula(v.formula, at, extra) : v.formula } as ExcelJS.CellFormulaValue;
      }));
    }
  }
  ws.eachRow((row) => row.eachCell((cell) => fillCell(cell, data.fields, unknown)));
}

/** A sheet name Excel accepts, not yet used. */
function sheetName(wb: ExcelJS.Workbook, name: string): string {
  const base = name.replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'DB';
  let out = base;
  for (let i = 2; wb.worksheets.some((w) => w.name.toLowerCase() === out.toLowerCase()); i++) out = `${base.slice(0, 31 - String(i).length - 1)}-${i}`;
  return out;
}

/** The DBs a template is filled for: those with schedule circuits, in submission order. */
export function templateBoards(project: Project, boardIds?: string[]): string[] {
  const groups = scheduleGroups(project);
  return SCHEDULE_GROUPS.flatMap(({ key }) => groups[key])
    .filter((b) => (!boardIds || boardIds.includes(b.id)) && scheduleCircuits(project, b.id).length > 0)
    .map((b) => b.id);
}

export interface TemplateResult { workbook: ExcelJS.Workbook; boards: string[]; warnings: string[] }

/** Fills an .xlsx template with the load schedule of each DB. */
export async function fillLoadScheduleTemplate(project: Project, template: ArrayBuffer | Uint8Array, opts: { boardIds?: string[]; at?: Date } = {}): Promise<TemplateResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(template as ArrayBuffer);
  } catch {
    throw new Error('The template is not a readable .xlsx file.');
  }
  const tpl = wb.worksheets.find((w) => findRowTemplate(w) !== undefined) ?? wb.worksheets[0];
  if (!tpl) throw new Error('The template has no sheets.');
  const boards = templateBoards(project, opts.boardIds);
  if (!boards.length) throw new Error('No DB with schedule circuits to fill the template with.');
  const warnings: string[] = [];
  if (findRowTemplate(tpl) === undefined) warnings.push('No row with {{row.…}} placeholders: circuits are not listed.');
  const unknown = new Set<string>();
  const model = tpl.model;
  const made = new Set<number>();
  for (const id of boards) {
    const ws = wb.addWorksheet(sheetName(wb, id));
    made.add(ws.id);
    const copy = structuredClone(model) as ExcelJS.WorksheetModel & { merges?: string[] };
    // A sheet model takes its merges as mergeCells, though it gives them as merges.
    ws.model = { ...copy, mergeCells: copy.merges, name: ws.name, id: ws.id } as ExcelJS.WorksheetModel;
    fillSheet(ws, templateData(project, id, opts.at), unknown);
  }
  wb.removeWorksheet(tpl.id);
  // Other sheets (cover, notes …) get the project fields only.
  const fields = templateData(project, boards[0], opts.at).fields;
  const projectOnly = Object.fromEntries(Object.entries(fields).filter(([k]) => k.startsWith('project.') || k === 'date'));
  for (const ws of wb.worksheets) if (!made.has(ws.id)) ws.eachRow((row) => row.eachCell((cell) => fillCell(cell, projectOnly, unknown)));
  if (unknown.size) warnings.push(`Unknown placeholders left as they are: ${[...unknown].map((k) => `{{${k}}}`).join(', ')}.`);
  return { workbook: wb, boards, warnings };
}

/** The top of the template sheet as text, down to the repeated row (at most 8 rows and 8 columns), for a preview. */
export async function templatePreview(template: ArrayBuffer | Uint8Array): Promise<{ rows: string[][]; repeatRow?: number }> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(template as ArrayBuffer); } catch { throw new Error('The template is not a readable .xlsx file.'); }
  const ws = wb.worksheets.find((w) => findRowTemplate(w) !== undefined) ?? wb.worksheets[0];
  if (!ws) throw new Error('The template has no sheets.');
  const at = findRowTemplate(ws);
  const last = Math.min(at ?? ws.rowCount, 8);
  const first = Math.max(1, last - 7);
  const cols = Math.min(Math.max(ws.columnCount, 1), 8);
  const rows: string[][] = [];
  for (let r = first; r <= last; r++) rows.push(Array.from({ length: cols }, (_, c) => cellText(ws.getCell(r, c + 1)) ?? (ws.getCell(r, c + 1).value == null ? '' : String(ws.getCell(r, c + 1).value))));
  return { rows, ...(at !== undefined && { repeatRow: at - first }) };
}
