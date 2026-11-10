import type { DrawingSet, DrawingSheet } from './drawingSet';

/** Legend and notes tables placed by hand on a plan sheet's layout (Design CAD → layout tab, LEGEND / NOTES): paper
 * objects of the sheet, like its viewports, in mm of the drawing area (y down) from their top left corner. A legend
 * table is live: its rows are the symbols, trays, routes and references on the sheet (src/docs/planLayout.ts), less the
 * rows hidden, plus rows typed by hand; a notes table holds the sheet's notes (the project's and the plan's, with
 * {Parameters}). A sheet with a legend table has no legend in its column; one with a notes table no notes box. */

export type TableKind = 'legend' | 'notes';
export interface PlacedTable {
  id: string;
  kind: TableKind;
  /** Top left corner on the paper (mm, drawing area). */
  at: [number, number];
  /** Width (mm); the height follows the rows. */
  widthMm: number;
  /** Text height (mm); blank = 2.5. */
  textMm?: 2.5 | 3.5;
  /** Legend rows in one or two columns. */
  cols?: 1 | 2;
  /** Its heading (blank: LEGEND · <layout>, or NOTES). */
  title?: string;
  /** Legend rows hidden, by their label. */
  hidden?: string[];
  /** Legend rows added by hand (a label each, no symbol). */
  extra?: string[];
}

/** Widths offered for a table (mm): the legend column's, and wider. */
export const TABLE_WIDTHS = [92, 120, 150, 180];
export const TABLE_WIDTH = 92;

export const tablesOf = (s: Pick<DrawingSheet, 'tables'>): PlacedTable[] => s.tables ?? [];
export const hasTable = (s: Pick<DrawingSheet, 'tables'>, kind: TableKind) => tablesOf(s).some((t) => t.kind === kind);
/** "Legend 1", "Notes 2" …: a table's name, numbered among those of its kind on the sheet. */
export const tableName = (list: PlacedTable[], id: string) => {
  const t = list.find((x) => x.id === id);
  if (!t) return 'Table';
  const same = list.filter((x) => x.kind === t.kind);
  return `${t.kind === 'legend' ? 'Legend' : 'Notes'}${same.length > 1 ? ` ${same.indexOf(t) + 1}` : ''}`;
};
/** A new table's id: tb1, tb2 … */
export const tableId = (list: PlacedTable[]) => { let k = 1; while (list.some((t) => t.id === `tb${k}`)) k++; return `tb${k}`; };

/** The set with a sheet's tables replaced (none: the key goes). */
export function withTables(set: DrawingSet, sheetId: string, list: PlacedTable[] | undefined): DrawingSet {
  return { ...set, sheets: set.sheets.map((s): DrawingSheet => {
    if (s.id !== sheetId) return s;
    const { tables: _old, ...rest } = s;
    return list && list.length ? { ...rest, tables: list } : rest;
  }) };
}
export const patchTable = (list: PlacedTable[], id: string, patch: Partial<PlacedTable>): PlacedTable[] =>
  list.map((t) => (t.id === id ? Object.fromEntries(Object.entries({ ...t, ...patch }).filter(([, v]) => v !== undefined)) as unknown as PlacedTable : t));
