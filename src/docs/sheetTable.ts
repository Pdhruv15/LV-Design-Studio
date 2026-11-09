/** A table printed on a drawing sheet under the drawing (a DB's load schedule on its board sheet): the same rows for
 * the PDF (HTML) and the DXF / DWG (lines and text), at the sheet furniture's text height. */
export interface SheetTable {
  title: string;
  /** Lines above the table (incomer, location, watt per unit). */
  lines: string[];
  head: string[];
  rows: string[][];
  /** Total rows, printed bold. */
  foot: string[][];
  /** Column widths, relative (they are scaled to the table's width). */
  widths: number[];
  /** Columns aligned left (the rest centred). */
  left: number[];
}
/** Row height and line height (mm) at 2.5 mm text; the title's height. */
export const TABLE_ROW_MM = 4.4, TABLE_LINE_MM = 3.6, TABLE_TITLE_MM = 5;
/** The height a table takes on the sheet (mm at scale 1), its padding included. */
export const tableHeightMm = (t: SheetTable, textMm = 2.5) => (TABLE_TITLE_MM + t.lines.length * TABLE_LINE_MM + (2 + t.rows.length + t.foot.length) * TABLE_ROW_MM) * (textMm / 2.5) + 4; // the head may take two lines
