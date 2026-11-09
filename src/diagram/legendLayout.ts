/** Legend layout for the printed sheets' legend column.
 *
 * A sheet legend is drawn at LEGEND_PX_PER_MM px for every mm of the column it goes in, and the sheet shows it at that
 * width, so its 10.5 px labels print at 2.5 mm (ISO 3098 minimum) whatever the labels or the drawing's scale. Labels
 * wider than the column wrap; rows grow by a line. */

export const LEGEND_LABEL_PX = 10.5;
export const LEGEND_TEXT_MM = 2.5;
export const LEGEND_PX_PER_MM = LEGEND_LABEL_PX / LEGEND_TEXT_MM;
/** Header (LEGEND and its rule), a one-line row (≈ 6.2 mm), one more line, the foot. */
export const LEGEND_HEAD = 32, LEGEND_SHEET_ROW = 26, LEGEND_LINE = 13, LEGEND_FOOT = 8;
/** Average width of a 10.5 px Arial character; labels are mostly lower case. */
const CHAR_PX = 5.9;

/** The width of a sheet legend for a column of the given inner width (mm), its labels printing at textMm. */
export const legendPxFor = (widthMm: number, textMm = LEGEND_TEXT_MM) => Math.round(widthMm * (LEGEND_LABEL_PX / textMm) * 10) / 10;

/** Splits a label at spaces into lines no wider than maxPx; a single word longer than that stands alone. */
export function wrapLabel(label: string, maxPx: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && next.length * CHAR_PX > maxPx) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

export interface LegendRow<T> { entry: T; lines: string[]; y: number }

/** Rows of a legend of width W px whose labels start at textX: each entry's lines and the y its symbol is centred on,
 * and the legend's height. Labels fit when they wrap at the column's width; with a generous width nothing wraps. */
export function legendRows<T extends { label: string }>(entries: T[], W: number, textX: number): { rows: LegendRow<T>[]; h: number } {
  const maxPx = Math.max(CHAR_PX * 8, W - textX - 10);
  let top = LEGEND_HEAD;
  const rows = entries.map((entry) => {
    const lines = wrapLabel(entry.label, maxPx);
    const rowH = LEGEND_SHEET_ROW + (lines.length - 1) * LEGEND_LINE;
    const y = top + 17 + ((lines.length - 1) * LEGEND_LINE) / 2;
    top += rowH;
    return { entry, lines, y };
  });
  return { rows, h: top + LEGEND_FOOT };
}

/** Baseline of line j of a row whose symbol is centred on y. */
export const legendLineY = (y: number, lines: number, j: number) => y - ((lines - 1) * LEGEND_LINE) / 2 + 4 + j * LEGEND_LINE;
