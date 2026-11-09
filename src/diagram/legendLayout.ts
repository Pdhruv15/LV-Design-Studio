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

export interface LegendRow<T> { entry: T; lines: string[]; y: number; x: number }
/** The gap between legend columns (px) when a legend has more than one. */
export const LEGEND_GAP = 16;

/** Rows of a legend of width W px whose labels start at textX: each entry's lines, the y its symbol is centred on and
 * the x its column starts at, and the legend's height. Labels fit when they wrap at the column's width; with a generous
 * width nothing wraps. With cols > 1 the entries fill the columns side by side, as evenly as whole rows allow. */
export function legendRows<T extends { label: string; h?: number }>(entries: T[], W: number, textX: number, cols = 1): { rows: LegendRow<T>[]; h: number } {
  const colW = cols > 1 ? (W - (cols - 1) * LEGEND_GAP) / cols : W;
  const maxPx = Math.max(CHAR_PX * 8, colW - textX - 10);
  const sized = entries.map((entry) => {
    const lines = wrapLabel(entry.label, maxPx);
    return { entry, lines, rowH: Math.max(entry.h ?? 0, LEGEND_SHEET_ROW + (lines.length - 1) * LEGEND_LINE) }; // a tall symbol asks for a taller row
  });
  const total = sized.reduce((a, r) => a + r.rowH, 0), share = total / cols;
  const rows: LegendRow<T>[] = [];
  let col = 0, top = LEGEND_HEAD, filled = 0, h = LEGEND_HEAD;
  for (const r of sized) {
    // Start the next column once this one holds its share (the last column takes the rest).
    if (cols > 1 && col < cols - 1 && filled > 0 && filled + r.rowH / 2 > share) { col++; top = LEGEND_HEAD; filled = 0; }
    rows.push({ entry: r.entry, lines: r.lines, y: top + 17 + ((r.lines.length - 1) * LEGEND_LINE) / 2, x: col * (colW + LEGEND_GAP) });
    top += r.rowH; filled += r.rowH; h = Math.max(h, top);
  }
  return { rows, h: h + LEGEND_FOOT };
}

/** The height (mm) a legend of these labels prints at in a column of the given inner width, without drawing it. */
export function legendHeightMm(labels: string[], widthMm: number, textMm = LEGEND_TEXT_MM, cols = 1, textX = 64): number {
  if (!labels.length) return 0;
  return legendRows(labels.map((label) => ({ label })), legendPxFor(widthMm, textMm), textX, cols).h / (LEGEND_LABEL_PX / textMm);
}
/** A legend entry drawn as an SVG string (the earthing and riser drawings): its symbol centred on (x, y). h: the row
 * height a tall symbol needs (px). */
export interface LegendItem { key: string; label: string; draw: (x: number, y: number) => string; h?: number }
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A sheet legend of string-drawn items, for a column of the given inner width: the same box, header, rows and label
 * size as the SLD's (LegendSvg); symX and textX place the symbols and labels. */
export function stringLegendSvg(items: LegendItem[], widthMm: number, textMm = LEGEND_TEXT_MM, cols = 1, symX = 34, textX = 64): string {
  if (!items.length) return '';
  const W = legendPxFor(widthMm, textMm);
  const { rows, h } = legendRows(items, W, textX, cols);
  const body = rows.map(({ entry: e, lines, y, x }) => e.draw(symX + x, y) + lines.map((l, j) => `<text x="${textX + x}" y="${legendLineY(y, lines.length, j)}">${escText(l)}</text>`).join('')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" data-w="${W}" data-h="${h}" font-family="Arial" font-size="${LEGEND_LABEL_PX}" fill="#111"><rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" fill="#fff" stroke="#111" stroke-width="1"/><text x="12" y="22" font-weight="bold">LEGEND</text><line x1="0" y1="${LEGEND_HEAD}" x2="${W}" y2="${LEGEND_HEAD}" stroke="#111" stroke-width="1"/>${body}</svg>`;
}
/** Drawing notes as the sheet's NOTES box takes them: the NOTES heading and the numbering off. */
export const plainNotes = (notes: string[]) => notes.filter((n) => n.trim() && n.trim() !== 'NOTES').map((n) => n.replace(/^\s*\d+\.\s*/, ''));
/** Legend columns that fit a strip of the given inner width: one for every 88 mm and its gap. */
export const stripColumns = (widthMm: number) => Math.max(1, Math.floor((widthMm + 4) / 92));

/** Baseline of line j of a row whose symbol is centred on y. */
export const legendLineY = (y: number, lines: number, j: number) => y - ((lines - 1) * LEGEND_LINE) / 2 + 4 + j * LEGEND_LINE;
