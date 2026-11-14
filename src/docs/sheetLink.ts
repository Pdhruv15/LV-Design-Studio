import { cellAt, cellName, colName, shiftFormula } from '../calc/sheetFormula';
import { deleteRows, insertRows, MAX_ROWS, mergeAt, type Area, type Sheet, type SheetLink, type SheetStyle } from '../model/sheets';
import { POINT_TYPES, type Project } from '../types';
import { scheduleRowKeys, templateData } from './scheduleFields';

/** Fills a sheet linked to a DB (Sheet.link) from the project: the cells that hold one value, and one row per circuit
 * and spare under the pattern row. The keys are those of the Excel load schedule template (scheduleFields.ts). No ExcelJS here. */

/** What a sheet can link to, for the pick list. `typed`: the user may type this value in the sheet. */
export const LINK_FIELDS: { key: string; label: string; kind: 'cell' | 'row'; typed: boolean }[] = [
  ...([
    ['project.name', 'Project name'], ['board.id', 'Board number'], ['board.name', 'Board name'], ['board.fedFrom', 'Fed from'], ['board.incomer', 'Incomer'],
    ['board.incomerCable', 'Incoming cable'], ['board.location', 'Location'], ['project.reference', 'Authority set'], ['project.revision', 'Revision'], ['date', 'Date'],
    ['total.R', 'Connected load R, W'], ['total.Y', 'Connected load Y, W'], ['total.B', 'Connected load B, W'], ['total.all', 'Connected load, W'],
    ['md.R', 'Maximum demand R, W'], ['md.Y', 'Maximum demand Y, W'], ['md.B', 'Maximum demand B, W'], ['md.all', 'Maximum demand, W'], ['imbalance', 'Phase imbalance, %']
  ] as const).map(([key, label]) => ({ key, label, kind: 'cell' as const, typed: false })),
  ...([
    ['row.sl', 'Serial number', false], ['row.ref', 'Circuit reference', false], ['row.phase', 'Phase', false], ['row.room', 'Room / area', true], ['row.watts', 'Circuit load, W', true],
    ['row.mcb', 'MCB rating, A', true], ['row.wire', 'Circuit wire, mm²', true], ['row.ecc', 'Earth wire, mm²', true], ['row.length', 'Length, m', true],
    ['row.R', 'Load on R, W', false], ['row.Y', 'Load on Y, W', false], ['row.B', 'Load on B, W', false], ['row.elcb', 'ELCB, first row of its group', false], ['row.elcbGroup', 'ELCB', false],
    ['row.remarks', 'Remarks', true], ['row.status', 'Check', false],
    ...POINT_TYPES.map((t) => [`row.points.${t.value}`, `Points: ${t.label}`, true] as const),
    ['own', 'Your column · kept with each circuit', true]
  ] as const).map(([key, label, typed]) => ({ key, label, kind: 'row' as const, typed }))
];
const KNOWN = new Set(LINK_FIELDS.map((f) => f.key));

/** What a sheet needs so the app can build the board and the single line diagram from it. */
export function linkNeeds(link: SheetLink): { key: 'board' | 'fedFrom' | 'row'; label: string; ok: boolean }[] {
  const cellOf = (field: string) => Object.values(link.cells).some((c) => c.field === field);
  return [
    { key: 'board', label: 'Board number', ok: cellOf('board.id') },
    { key: 'fedFrom', label: 'Fed from', ok: cellOf('board.fedFrom') },
    { key: 'row', label: 'A description or a load on each row', ok: Object.values(link.columns).some((f) => f === 'row.room' || f === 'row.watts' || f.startsWith('row.points.')) }
  ];
}

const PH = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;
const ONLY_ROW = /^\s*\{\{\s*(row\.[A-Za-z0-9_.]+)\s*\}\}\s*$/;

/** A sheet that carries the template's {{key}} placeholders, linked: the first row with a {{row.…}} cell is the pattern row,
 * a cell with one other placeholder is a linked cell. Keys the link does not know stay as they are and are listed. */
export function linkFromPlaceholders(sheet: Sheet): { sheet: Sheet; unknown: string[] } | undefined {
  const at = Object.keys(sheet.cells).map((k) => ({ k, ...cellAt(k)! })).sort((a, b) => a.row - b.row || a.col - b.col);
  const first = at.find((c) => ONLY_ROW.test(sheet.cells[c.k]))?.row;
  if (first === undefined) return undefined;
  const cells = { ...sheet.cells }, columns: SheetLink['columns'] = {}, linked: SheetLink['cells'] = {}, unknown: string[] = [];
  const note = (key: string) => { if (!unknown.includes(key)) unknown.push(key); };
  for (const c of at) {
    const text = sheet.cells[c.k], only = c.row === first ? ONLY_ROW.exec(text) : null;
    if (only) {
      if (KNOWN.has(only[1])) { columns[colName(c.col)] = only[1]; delete cells[c.k]; } else note(only[1]);
      continue;
    }
    const found = [...text.matchAll(PH)];
    if (found.length === 1 && !found[0][1].startsWith('row.') && KNOWN.has(found[0][1])) {
      const m = found[0], before = text.slice(0, m.index), after = text.slice(m.index! + m[0].length);
      linked[c.k] = { field: m[1], ...(before && { before }), ...(after && { after }) };
      if (before + after) cells[c.k] = before + after; else delete cells[c.k];
    } else for (const m of found) if (!KNOWN.has(m[1])) note(m[1]);
  }
  return { sheet: { ...sheet, cells, link: { category: 'db', cells: linked, firstRow: first, rows: [], columns } }, unknown };
}

/** A text from the project as the sheet holds it: one that would read as a number or a formula gets Excel's apostrophe (as in docs/sheetXlsx.ts). */
const asTyped = (s: string) => (s !== '' && (s.startsWith('=') || s.startsWith("'") || (s.trim() !== '' && Number.isFinite(Number(s.trim())))) ? `'${s}` : s);

/** A formula with the ranges that end on `row` (and start on or above it) stretched down by `extra` rows. */
const stretchRanges = (f: string, row: number, extra: number) => (!f.startsWith('=') ? f : f.replace(/"(?:[^"]|"")*"|(\$?[A-Za-z]{1,3}\$?)([1-9][0-9]{0,6}):(\$?[A-Za-z]{1,3}\$?)([1-9][0-9]{0,6})(?![A-Za-z0-9_(.])/g,
  (m, c1?: string, r1?: string, c2?: string, r2?: string) => (c1 !== undefined && Number(r2) === row && Number(r1) <= row ? `${c1}${r1}:${c2}${row + extra}` : m)));

/** The sheet filled from the project: header cells, then one row per circuit and spare of the board. The block of rows is
 * resized by inserting or deleting rows inside it, so the cells below move and formulas follow. The sheet itself when it has no
 * link, no board, or the board is not in the project. */
export function fillLinked(project: Project, sheet: Sheet, at?: Date): Sheet {
  const link = sheet.link, boardId = link?.boardId;
  if (!link || !boardId || !project.boards.some((b) => b.id === boardId)) return sheet;
  const data = templateData(project, boardId, at), keys = scheduleRowKeys(project, boardId);
  const first = link.firstRow, have = Math.max(1, link.rows.length);
  const want = Math.min(Math.max(1, keys.length), have + MAX_ROWS - sheet.rows);
  const own = Object.keys(link.columns).filter((c) => link.columns[c] === 'own');
  // Own text, by the key of the row it was typed beside, read before the block changes.
  const kept = new Map<string, Record<string, string>>();
  link.rows.forEach((key, i) => { if (key !== '') kept.set(key, Object.fromEntries(own.map((c) => [c, sheet.cells[`${c}${first + i}`] ?? '']))); });

  // Resize. A range over the block stretches when rows are inserted before its last row, and when rows below the first are deleted;
  // a block of one row has no row to insert before, so its ranges are stretched here.
  let s = sheet, added: number[] = [];
  const d = want - have;
  if (d > 0) {
    const grown = insertRows(s, have > 1 ? first + have - 1 : first + 1, d);
    if (have === 1) {
      const cells = { ...grown.cells };
      for (const [k, v] of Object.entries(cells)) { const p = cellAt(k)!; if (p.row < first || p.row >= first + want) cells[k] = stretchRanges(v, first, d); }
      s = { ...grown, cells };
    } else s = grown;
    added = Array.from({ length: d }, (_, i) => (have > 1 ? have - 1 : 1) + i);
  } else if (d < 0) s = deleteRows(s, first + want, -d);

  const cells = { ...s.cells }, styles = { ...(s.styles ?? {}) };
  const rowStyles = Object.entries(styles).filter(([k]) => cellAt(k)!.row === first).map(([k, v]) => [cellAt(k)!.col, v] as [number, SheetStyle]);
  for (const i of added) for (const [col, st] of rowStyles) styles[cellName(col, first + i)] = st;
  // A merged area one row high in the first row is repeated on every row.
  const last = first + want - 1;
  const own1 = (m: Area) => m.r0 === m.r1 && m.r0 >= first && m.r0 <= last;
  const merges = (s.merges ?? []).filter((m) => !(own1(m) && m.r0 > first));
  for (const m of merges.filter((m) => own1(m) && m.r0 === first)) for (let r = first + 1; r <= last; r++) merges.push({ ...m, r0: r, r1: r });
  const sheetNow: Sheet = { ...s, merges: merges.length ? merges : undefined };
  const put = (k: string, v: string) => {
    const p = cellAt(k)!, m = mergeAt(sheetNow, p.row, p.col);
    if (m && (m.r0 !== p.row || m.c0 !== p.col)) return;
    if (v === '') delete cells[k]; else cells[k] = v;
  };
  const filled = new Set([...Object.keys(link.columns)]);
  for (let c = 1; c <= s.cols; c++) {
    const letters = colName(c), top = s.cells[`${letters}${first}`];
    if (!filled.has(letters) && top?.startsWith('=')) for (let i = 1; i < want; i++) put(`${letters}${first + i}`, shiftFormula(top, i, 0));
  }
  for (let i = 0; i < want; i++) {
    const row = data.rows[i], mine = kept.get(keys[i]);
    for (const [letters, field] of Object.entries(link.columns)) {
      const k = `${letters}${first + i}`;
      if (field === 'own') put(k, mine?.[letters] ?? '');
      else { const v = row?.[field]; put(k, v === undefined || v === '' ? '' : typeof v === 'number' ? String(v) : asTyped(v)); }
    }
  }
  for (const [k, c] of Object.entries(s.link?.cells ?? link.cells)) { // a linked cell below the block moved with the rows; the resize kept the link in step
    const v = data.fields[c.field], text = `${c.before ?? ''}${v === undefined ? '' : String(v)}${c.after ?? ''}`;
    cells[k] = typeof v === 'string' && !c.before && !c.after ? asTyped(text) : text;
    if (cells[k] === '') delete cells[k];
  }
  const out: Sheet = { ...s, cells, ...(Object.keys(styles).length || s.styles ? { styles } : {}), link: { ...link, ...(s.link ?? {}), rows: keys.slice(0, want) } };
  const { merges: _m, ...bare } = out;
  return { ...bare, ...(merges.length ? { merges } : {}), rows: Math.max(s.rows, last) };
}

/** The sheet linked to a board; its rows are read again from the project. The sheet itself when it has no link. */
export function linkToBoard(sheet: Sheet, boardId: string): Sheet {
  if (!sheet.link) return sheet;
  return { ...sheet, link: { ...sheet.link, boardId, ...(sheet.link.boardId !== boardId && { rows: [] }) } };
}
