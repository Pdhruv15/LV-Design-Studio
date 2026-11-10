import { currentRevision } from '../model/revisions';
import { cableDataNotice } from '../calc/cableTable';
import type { DrawingInfo, Project } from '../types';
import type { SheetFurniture } from '../model/drawingSet';
import { tableHeightMm, type SheetTable } from './sheetTable';
import { esc } from './report';
import { borderOf, drawnTitleBlockHtml, MAX_REV_ROWS, PAPER_MM, revRowsIn, revRowValues, templateKindOf, templateOf, templateSize, titleBlockHtml, type Border, type Paper, type TitleTemplate } from '../model/titleBlock';
import { fillParams } from '../model/params';
import { abbreviationsIn } from './sldNotes';
import { LEGEND_LABEL_PX, LEGEND_TEXT_MM, legendHeightMm } from '../diagram/legendLayout';
import { FIRE_NOTE } from '../model/cableRefs';
import { markupLayerHtml, type SheetMarkup } from '../model/sheetMarkup';
import { isRasterDataUrl, num } from '../util/escape';
import { fmtDate } from '../util/format';

/** The SLD as a drawing sheet: frame, the diagram scaled to fit, and a
 * title block (company, project, owner, consultant, title, drawing no.,
 * revision, date, scale, drawn / checked / approved, revision history). */

export const SHEET_MM: Record<NonNullable<DrawingInfo['sheet']>, { w: number; h: number }> = PAPER_MM;

export const DEFAULT_DRAWING_TITLE = 'SINGLE LINE DIAGRAM';

export interface TitleBlock {
  company: string;
  project: string;
  owner: string;
  consultant: string;
  title: string;
  number: string;
  revision: string;
  date: string;
  scale: string;
  drawnBy: string;
  checkedBy: string;
  approvedBy: string;
  logo?: string; // data: URL
  history: { id: string; date: string; description: string; by?: string }[];
}

export function titleBlockOf(project: Project, date = new Date().toISOString().slice(0, 10), revRows = 4): TitleBlock {
  const d = project.drawing ?? {};
  const rev = currentRevision(project);
  return {
    company: d.company ?? project.info?.consultant ?? '',
    project: project.name,
    owner: project.info?.owner ?? '',
    consultant: project.info?.consultant ?? '',
    title: d.title || DEFAULT_DRAWING_TITLE,
    number: d.number ?? '',
    revision: rev?.id ?? '—',
    date: fmtDate(rev?.date ?? date),
    scale: 'NTS',
    drawnBy: d.drawnBy ?? '',
    checkedBy: d.checkedBy ?? '',
    approvedBy: d.approvedBy ?? '',
    logo: isRasterDataUrl(d.logo) ? d.logo : undefined,
    history: (project.revisions ?? []).slice(-revRows).reverse().map((r) => ({ id: r.id, date: fmtDate(r.date), description: r.description, ...(r.by ? { by: r.by } : {}) }))
  };
}

/** The title block of one sheet of a set (the project's, with the sheet's own values). */
export function sheetTitleBlock(project: Project, one?: SheetInfo, revRows = one?.furniture?.revRows ?? 4): TitleBlock {
  const t = titleBlockOf(project, undefined, revRows);
  if (one) {
    t.number = one.no; t.title = one.title;
    if (one.rev) t.revision = one.rev;
    if (one.date) t.date = fmtDate(one.date);
    if (one.drawnBy) t.drawnBy = one.drawnBy;
    if (one.checkedBy) t.checkedBy = one.checkedBy;
    if (one.approvedBy) t.approvedBy = one.approvedBy;
    if (one.scale) t.scale = one.scale;
    if (one.history?.length) t.history = one.history.slice(-revRows).reverse().map((r) => ({ ...r, date: fmtDate(r.date) }));
  }
  return t;
}

/** Print-ready HTML for one sheet (the PDF export renders it). svg is the
 * diagram as standalone SVG markup. */
/** One sheet of a set: number, title, position and its own title block values. */
export interface SheetInfo { no: string; title: string; count: number; index: number; status?: string; rev?: string; date?: string; drawnBy?: string; checkedBy?: string; approvedBy?: string; scale?: string; history?: { id: string; date: string; description: string }[];
  /** CABLE SCHEDULE legend: reference numbers used on the drawings. */
  cables?: { ref: number; text: string; fireRated?: boolean }[];
  /** Symbol legend as SVG: goes in the legend column with the cable schedule and abbreviations. */
  legendSvg?: string;
  /** A short table at the foot of the legend column, just above the title block. */
  summary?: { title: string; rows: [string, string][] };
  /** Width of the legend column (mm at scale 1), when narrower than the usual one. */
  sideMm?: number;
  /** Notes on this sheet only (after the project's SLD notes). */
  notes?: string[];
  /** Markups drawn on this sheet (paper mm). */
  markups?: SheetMarkup[];
  /** Pens (src/model/plotSetup.ts): the frame's width, the title block and table lines (mm), extra CSS for the
   * drawing's lines, and the plot stamp printed in the margin. Blank: as always. */
  plot?: { frame?: number; lines?: number; ink?: string; css?: string; stamp?: string };
  /** What prints around the drawing (src/model/drawingSet.ts SheetFurniture): zone references, centring marks, the
   * column's text height, where the notes go, the revision table's rows. Blank: as always. */
  furniture?: SheetFurniture;
  /** The sheet's kind (src/model/drawingSet.ts DrawingSheet), for a title block chosen per kind of sheet. */
  kind?: string;
  /** The legend goes in a strip along the foot of the drawing area (drawn for stripInnerMm), not in the column. */
  legendStrip?: boolean;
  /** The set's legend sheet: no drawing; the legend across the sheet, then the abbreviations and the general notes. */
  legendSheet?: boolean;
  /** The abbreviations to print, when not those found in the drawing (the legend sheet's, or none on a sheet that refers to it). */
  abbreviations?: [string, string][];
  /** A table under the drawing (a board sheet's load schedule, src/docs/sheetTable.ts). */
  table?: SheetTable;
  /** Legend and notes tables placed on a plan sheet's layout (src/model/sheetTables.ts), drawn: where each goes (mm,
   * drawing area, from its top left corner), its width and height, and its SVG. */
  tables?: { id: string; kind: 'legend' | 'notes'; x: number; y: number; w: number; h: number; svg: string }[];
  /** A placed notes table holds the notes: no notes box, the project's notes included. */
  notesOff?: boolean }

/** The legend column (legend, cable schedule, abbreviations, summary): its width and padding, mm at scale 1. A DB riser
 * sheet's narrower column is RISER_SIDE_MM (src/model/drawingSet.ts). */
export const SIDE_MM = 92, SIDE_PAD_MM = 2;
/** The inner width of the legend column a legend is drawn for (src/diagram/legendLayout.ts). */
export const sideInnerMm = (sideMm = SIDE_MM) => sideMm - 2 * SIDE_PAD_MM;
/** The inner width of a legend strip along the foot of the drawing area, beside the legend column, on a paper. */
export const stripInnerMm = (sheet: NonNullable<DrawingInfo['sheet']>, sideMm = SIDE_MM) => SHEET_MM[sheet].w - 30 - sideMm - 2 * SIDE_PAD_MM;
/** Legend columns in the right column: the setting, else two on A2 and A1 when one column would be taller than half the
 * drawing area, else one. */
export function legendColsFor(fz: SheetFurniture, sheet: NonNullable<DrawingInfo['sheet']>, labels: string[], widthMm = sideInnerMm()): 1 | 2 {
  if (fz.legendCols) return fz.legendCols;
  if (!labels.length || !(sheet === 'A2' || sheet === 'A1')) return 1;
  return legendHeightMm(labels, widthMm, fz.textMm) > 0.5 * (SHEET_MM[sheet].h - FRAME_H - BAND - 6) ? 2 : 1;
}

/** The standard block's three equal columns (60 mm at full size). */
const titleCols = (k: number) => `<col style="width:${+(60 * k).toFixed(2)}mm">`.repeat(3);

/** The standard block's six rows of cells over three equal columns. A cell on the block's left edge is `l`, on its right
 * edge `e`: the block sits in the sheet frame's corner, so the frame draws its right and bottom edges (never twice). */
function standardTitleRows(project: Project, t: TitleBlock, one: SheetInfo | undefined, sheet: NonNullable<DrawingInfo['sheet']>, status = one?.status ?? ''): string[] {
  const td = (edge: string, span: number, key: string, value: string, extra = '') =>
    `<td class="t${edge}${extra}"${span > 1 ? ` colspan="${span}"` : ''}><span class="k">${key}</span>${value}</td>`;
  const v = (s: string) => `<span class="v">${esc(s)}</span>`;
  return [
    td(' l e', 3, 'Company / consultant', `${isRasterDataUrl(t.logo) ? `<img class="logo" src="${esc(t.logo)}" alt="">` : ''}${v(t.company)}`),
    td(' l', 2, 'Project', v(t.project)) + td(' e', 1, 'Owner', v(t.owner)),
    td(' l e', 3, `Drawing title${status ? ` — <b>${esc(status)}</b>` : ''}`, v(t.title), ' title'),
    td(' l', 1, 'Drawing no.', v(t.number)) + td('', 1, 'Revision', v(t.revision)) + td(' e', 1, 'Date', v(t.date)),
    td(' l', 1, 'Drawn', v(t.drawnBy)) + td('', 1, 'Checked', v(t.checkedBy)) + td(' e', 1, 'Approved', v(t.approvedBy)),
    td(' l', 2, 'Sheet', v(`${one ? `${one.index} of ${one.count} · ` : ''}${sheet} · Scale ${t.scale}`)) + td(' e', 1, 'System', v(`${project.voltageV} V, 3Ph + N, ${project.frequencyHz} Hz`))
  ];
}

/** The title block as CSS and HTML, placed bottom right of its positioned parent: the project's own template when it has
 * one, otherwise the standard block. Shared by the drawing sheets and the SLD pages of the study reports. k scales it. */
export function titleBlockFragment(project: Project, t: TitleBlock, custom: ReturnType<typeof templateOf>, extra: Record<string, string>, one: SheetInfo | undefined, sheet: NonNullable<DrawingInfo['sheet']>, k: number, status = one?.status ?? ''): { css: string; html: string } {
  const mm = (v: number) => `${+(v * k).toFixed(2)}mm`;
  const px = (v: number) => `${+(v * k).toFixed(2)}px`;
  const lw = lineScale(one), ink = one?.plot?.ink ?? '#000';
  // Heavier top and left edges; the frame's own border is the right and bottom ones.
  const css = `    .tb { position: absolute; right: 0; bottom: 0; width: ${mm(180)}; border-collapse: collapse; table-layout: fixed; }
    .tb td.t { border: ${mm(0.25 * lw)} solid ${ink}; padding: ${mm(1)} ${mm(1.5)}; vertical-align: top; }
    .tb tr:first-child td { border-top: ${mm(0.5 * lw)} solid ${ink}; }
    .tb td.l { border-left: ${mm(0.5 * lw)} solid ${ink}; }
    .tb td.e { border-right: 0; }
    .tb tr:last-child td { border-bottom: 0; }
    .tb .k { display: block; font-size: ${px(6.5)}; color: #333; text-transform: uppercase; letter-spacing: .03em; }
    .tb .v { font-size: ${px(9.5)}; font-weight: 600; }
    .tb .title .v { font-size: ${px(13)}; }
    .tb .logo { float: right; max-height: ${mm(11)}; max-width: ${mm(45)}; margin-left: ${mm(2)}; }
    .tbx { position: absolute; right: 0; bottom: 0; }
`;
  const html = custom ? `<div class="tbx" style="transform:scale(${k});transform-origin:100% 100%">${titleBlockHtml(custom, project, extra, true)}</div>`
    : `    <table class="tb"><colgroup>${titleCols(k)}</colgroup>${standardTitleRows(project, t, one, sheet, status).map((r) => `<tr>${r}</tr>`).join('')}</table>`;
  return { css, html };
}

/** How much heavier (or lighter) the title block and table lines print than their standard 0.25 mm. */
const lineScale = (one?: SheetInfo) => (one?.plot?.lines ? one.plot.lines / 0.25 : 1);

export function buildSldSheetHtml(project: Project, svg: string, sheet: NonNullable<DrawingInfo['sheet']> = 'A3', one?: SheetInfo): string {
  const { w, h } = SHEET_MM[sheet];
  const t = sheetTitleBlock(project, one);
  const status = one?.status ?? '';
  const extra: Record<string, string> = one
    ? { SheetNo: one.no, SheetTitle: one.title, SheetCount: String(one.count), SheetIndex: String(one.index), SheetSize: sheet, DrawingNo: one.no, DrawingTitle: one.title, Status: status, Scale: t.scale,
      ...(one.rev ? { Rev: one.rev } : {}), ...(one.date ? { RevDate: fmtDate(one.date) } : {}), ...(one.drawnBy ? { DrawnBy: one.drawnBy } : {}), ...(one.checkedBy ? { CheckedBy: one.checkedBy } : {}), ...(one.approvedBy ? { ApprovedBy: one.approvedBy } : {}) }
    : { SheetNo: t.number, SheetTitle: t.title, SheetCount: '1', SheetIndex: '1', SheetSize: sheet, Status: '', Scale: t.scale };
  // A whole-border template for the paper stands in for the frame, the zone strip and the title band; the sheet's
  // furniture then works inside its drawing area (sheetBody), at full size, and the border's own revision rows
  // ({Rev1} …) fill from the issues, newest first.
  const { border, frame, k, custom } = sheetBody(project, sheet, one?.kind);
  Object.assign(extra, revRowValues(sheetTitleBlock(project, one, MAX_REV_ROWS).history));
  const notes = one?.notesOff ? [] : [...(project.drawing?.notes ?? []), ...(one?.notes ?? [])];
  const abbr = one?.abbreviations ?? (project.drawing?.abbreviations === false ? [] : abbreviationsIn(svg));
  const history = t.history.length ? t.history : [{ id: '—', date: '', description: 'Not issued' }];
  // Sheet furniture (title block, revision table, abbreviations, notes) at its standard size.
  const mm = (v: number) => `${+(v * k).toFixed(2)}mm`;
  const px = (v: number) => `${+(v * k).toFixed(2)}px`;
  const lw = lineScale(one); // title block, legend and table lines at the pen width
  const tbW = custom ? templateSize(custom).w : 180;
  const cables = one?.cables ?? [];
  const legendSvg = one?.legendSvg ?? '';
  // Legend column on the right (top to bottom): LEGEND, CABLE SCHEDULE,
  // ABBREVIATIONS — one width, one alignment. Without a column (single
  // SLD export) the abbreviations stay bottom left.
  const summary = one?.summary;
  const legendSheet = !!one?.legendSheet;
  const side = !!one && !legendSheet && (!!legendSvg || cables.length > 0 || abbr.length > 0 || !!summary);
  const csW = side ? one?.sideMm ?? SIDE_MM : 0; // legend column width (mm at scale 1)
  const fz = one?.furniture ?? {}, tm = fz.textMm ?? LEGEND_TEXT_MM; // the column's text height
  const zones = !border && zonesOn(fz, sheet), nx = zoneFields(w - FRAME_W), ny = zoneFields(h - FRAME_H);
  // The legend in a strip along the foot of the drawing area: as high as the legend was drawn (its data-h at its px per
  // mm), plus its padding; the notes then go in the column, out of its way.
  const strip = !!one?.legendStrip && !!legendSvg;
  const stripH = strip ? (Number(legendSvg.match(/data-h="([\d.]+)"/)?.[1] ?? 0) / (LEGEND_LABEL_PX / tm)) + 2 * SIDE_PAD_MM : 0;
  const revBox = !!border && !revRowsIn(border);
  const notesInColumn = (fz.notesPlace === 'column' || strip || revBox) && side; // the notes join the column above the app's revision table in a border
  const notesW = Math.min(fz.notesWidthMm ?? tbW, (w - FRAME_W - 6) / k);
  // A table under the drawing (a board sheet's load schedule): the drawing moves up by its height.
  const table = one?.table, tableH = table ? tableHeightMm(table, tm) : 0;
  const fire = cables.some((c) => c.fireRated);
  const { css: tbCss, html: tbHtml } = titleBlockFragment(project, t, custom, extra, one, sheet, k);
  // The revision table and the title block share the band along the frame's foot, row for row, so each line of one runs
  // on into the other: the standard block in the same table, a template beside a table of its own row heights.
  const gen = `Generated by LV Design Studio${cableDataNotice(project) ? ` — ${esc(cableDataNotice(project))}` : ''}`;
  const revCells = (i: number, rows: number) => (i === 0 ? '<td class="r u h">Rev</td><td class="r u h">Date</td><td class="r u h">Description</td>'
    : i === rows - 1 ? `<td class="r gen" colspan="3">${gen}</td>`
    : i <= history.length ? `<td class="r u">${esc(history[i - 1].id)}</td><td class="r u">${esc(history[i - 1].date)}</td><td class="r u">${esc(history[i - 1].description)}</td>`
    : fz.revRows ? '<td class="r u"></td><td class="r u"></td><td class="r u"></td>' // a fixed table rules its blank lines too
    : '<td class="r" colspan="3"></td>');
  // A template too short for the revision table: the table stands taller, closed by a line on the template's left edge
  // (a collapsed table border lies half outside the table), and the legend column comes down to the template. A fixed
  // number of revision lines (6 or 8, blank ones included) gets a table of its own rows beside the standard block too.
  const revLines = fz.revRows ?? history.length;
  const own = custom || !!fz.revRows;
  const tooShort = own ? Math.max(0, 9 + revLines * 4.5 - (custom ? templateSize(custom).h : BAND)) : 0;
  // In a border without revision rows of its own, the app's revision table stands at the foot of the legend column, or
  // over the body's bottom right corner when the sheet has no column.
  const revH = revBox ? 9 + revLines * 4.5 : 0;
  const revBoxHtml = revBox ? `<div class="rvb"><table><colgroup><col style="width:10%"><col style="width:18%"><col></colgroup>${[5, ...Array<number>(revLines).fill(4.5), 4].map((rh, i, all) => `<tr style="height:${mm(rh)}">${revCells(i, all.length)}</tr>`).join('')}</table></div>` : '';
  const band = border ? '' : own ? (() => {
    const { w: cw, h: ch } = custom ? templateSize(custom) : { w: 180, h: BAND };
    const n = revLines + 2;
    const rows = tooShort ? [5, ...Array<number>(revLines).fill(4.5), 4] : custom && custom.rows.length >= n ? custom.rows : Array<number>(n).fill(ch / n);
    return `<div class="band cb" style="height:${mm(ch + tooShort)}"><table class="rv" style="width:calc(100% - ${mm(cw)})"><colgroup><col style="width:10%"><col style="width:18%"><col></colgroup>${rows.map((rh, i) => `<tr style="height:${mm(num(rh))}">${revCells(i, rows.length)}</tr>`).join('')}</table>${tooShort ? `<div class="rvx" style="left:calc(100% - ${mm(cw + 0.25)});bottom:${mm(ch)};height:${mm(tooShort)}"></div>` : ''}${tbHtml}</div>`;
  })() : (() => {
    const revW = w - 31.4 - 180 * k; // inside the frame's 0.7 mm border, less the title block
    const col = (v: number) => `<col style="width:${+v.toFixed(2)}mm">`;
    return `<table class="tb band"><colgroup>${col(revW * 0.1)}${col(revW * 0.18)}<col>${titleCols(k)}</colgroup>${standardTitleRows(project, t, one, sheet, status).map((r, i, all) => `<tr>${revCells(i, all.length)}${r}</tr>`).join('')}</table>`;
  })();
  const notesHtml = notes.length ? `<div class="notes"${notesInColumn || legendSheet ? '' : ` style="width:${mm(notesW)}${revBox && !side ? `;bottom:${mm(3 + stripH + tableH + revH + 2)}` : ''}"`}><b>NOTES</b><ol>${notes.map((n) => `<li>${esc(fillParams(n, project))}</li>`).join('')}</ol></div>` : '';
  const abbrHtml = `<div class="abbr"><b>ABBREVIATIONS</b>${abbr.map(([a, d]) => `<div><span>${esc(a)}</span>${esc(d)}</div>`).join('')}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.number || t.title)}</title><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${w}mm; height: ${h}mm; font: ${px(9)} Arial, sans-serif; color: #000; background: #fff; }
    .frame { position: absolute; inset: ${border ? `${num(frame.y)}mm ${+(w - frame.x - frame.w).toFixed(2)}mm ${+(h - frame.y - frame.h).toFixed(2)}mm ${num(frame.x)}mm; border: 0` : `10mm 10mm 10mm 20mm; border: ${+(one?.plot?.frame ?? 0.7).toFixed(2)}mm solid ${one?.plot?.ink ?? '#000'}`}; display: flex; flex-direction: column; }
    .brd { position: absolute; left: 0; top: 0; width: ${w}mm; height: ${h}mm; }
    .stamp { position: absolute; left: ${num(frame.x)}mm; bottom: ${zones ? 1.5 : 4}mm; font-size: 2mm; color: #000; white-space: nowrap; }${one?.plot?.css ? `
    ${one.plot.css}` : ''}
    .body { position: relative; flex: 1; min-height: 0; }
    .drawing { position: absolute; inset: 3mm; right: calc(3mm + ${mm(csW)}); bottom: ${mm(3 + stripH + tableH)}; display: flex; align-items: center; justify-content: center; }
    .tbl { position: absolute; left: 3mm; right: calc(3mm + ${mm(csW)}); bottom: ${mm(3 + stripH)}; height: ${mm(tableH)}; font-size: ${mm(tm)}; overflow: hidden; }
    .tbl h5 { margin: 0 0 ${mm(1)}; font-size: ${mm(tm)}; font-weight: 700; } .tbl p { margin: 0; line-height: ${mm(3.6 * tm / 2.5)}; }
    .tbl table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: ${mm(1)}; } .tbl th, .tbl td { border: ${mm(0.18 * lw)} solid #000; padding: 0 ${mm(0.8)}; height: ${mm(4.4 * tm / 2.5)}; text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 400; }
    .tbl th { font-weight: 700; white-space: normal; height: auto; line-height: 1.1; padding-top: ${mm(0.4)}; padding-bottom: ${mm(0.4)}; } .tbl td.l { text-align: left; } .tbl tr.f td { font-weight: 700; }
    .lgsheet { position: absolute; inset: 3mm; display: flex; flex-direction: column; gap: ${mm(3)}; overflow: hidden; }
    .lgsheet .abbr, .lgsheet .notes { position: static; width: auto; border: ${mm(0.25 * lw)} solid #000; }
    .lgsheet .abbr { column-count: ${abbr.length > 24 ? 3 : abbr.length > 8 ? 2 : 1}; }
    .strip { position: absolute; left: 0; right: ${mm(csW)}; bottom: 0; height: ${mm(stripH)}; padding: ${mm(SIDE_PAD_MM)}; border-top: ${mm(0.25 * lw)} solid #000; background: #fff; }
    .lg svg { width: 100%; height: auto; display: block; }
    .ptab { position: absolute; } .ptab svg { display: block; width: 100%; height: auto; }
    .drawing svg { width: 100%; height: 100%; }
    ${tbCss}
    .band { position: relative; flex: none; width: 100%; font-size: ${mm(tm)}; }
    .tb.band { position: static; }
    .rv { position: absolute; left: 0; top: 0; height: 100%; border-collapse: collapse; table-layout: fixed; }
    .rvx { position: absolute; border-left: ${mm(0.5 * lw)} solid #000; }
    .band td.r, .rvb td.r { border: 0; padding: ${mm(0.8)} ${mm(1.5)}; text-align: left; vertical-align: middle; }
    .band tr:first-child td.r { border-top: ${mm(0.5 * lw)} solid #000; }
    .band td.u, .rvb td.u { border-bottom: ${mm(0.2)} solid #999; }
    .band td.h, .rvb td.h { font-size: ${px(7)}; font-weight: 700; text-transform: uppercase; }
    .band td.gen, .rvb td.gen { vertical-align: bottom; font-size: ${px(6.5)}; color: #555; }
    .rvb { position: absolute; right: 0; bottom: ${mm(3 + stripH + tableH)}; width: ${mm(tbW)}; border: ${mm(0.25 * lw)} solid #000; background: #fff; font-size: ${mm(tm)}; }
    .rvb table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .side .rvb, .lgsheet .rvb { position: static; width: auto; margin-top: auto; flex: none; }
    .side .sum + .rvb { margin-top: 0; }
    .notes { position: absolute; right: 0; bottom: ${mm(3 + stripH + tableH)}; font-size: ${mm(tm)}; border: ${mm(0.25 * lw)} solid #000; border-right: 0; padding: ${mm(1)} ${mm(2)}; background: #fff; }
    .side .notes { position: static; border-right: ${mm(0.25 * lw)} solid #000; }
    .notes ol { margin: ${mm(0.5)} 0 0; padding-left: ${mm(4)}; }
    .side { position: absolute; right: 0; top: 0; width: ${mm(csW)}; bottom: ${tooShort && csW <= tbW ? `-${mm(tooShort)}` : 0}; display: flex; flex-direction: column; gap: ${mm(2)}; overflow: hidden; border-left: ${mm(0.25 * lw)} solid #000; padding: ${mm(SIDE_PAD_MM)}; }
    .side .sum { margin-top: auto; flex: none; border: ${mm(0.25 * lw)} solid #000; font-size: ${mm(tm)}; }
    .sum b { display: block; font-size: ${mm(tm)}; padding: ${mm(1)} ${mm(2)}; border-bottom: ${mm(0.25 * lw)} solid #000; }
    .sum table { width: 100%; border-collapse: collapse; } .sum td { padding: ${mm(0.3)} ${mm(2)}; border-bottom: ${mm(0.15 * lw)} solid #000; } .sum tr:last-child td { border-bottom: 0; } .sum td + td { text-align: right; font-weight: 600; width: ${mm(16)}; }
    .side .abbr, .side .cs { position: static; width: auto; max-height: none; border: ${mm(0.25 * lw)} solid #000; column-count: 1; }
    .side .abbr { column-count: ${csW >= 150 ? 2 : 1}; }
    .abbr { position: absolute; left: 0; bottom: 0; font-size: ${mm(tm)}; border: ${mm(0.25 * lw)} solid #000; border-left: 0; border-bottom: 0; padding: ${mm(1)} ${mm(2)}; background: #fff; column-count: ${abbr.length > 12 ? 2 : 1}; column-gap: ${mm(4)}; }
    .abbr b { display: block; column-span: all; font-size: ${mm(tm)}; margin-bottom: ${mm(0.5)}; }
    .abbr div { break-inside: avoid; white-space: nowrap; } .abbr span { display: inline-block; min-width: ${mm(9)}; font-weight: 600; }
    .cs { position: absolute; right: 0; top: 0; width: ${mm(csW)}; max-height: 100%; overflow: hidden; border-left: ${mm(0.25 * lw)} solid #000; border-bottom: ${mm(0.25 * lw)} solid #000; background: #fff; font-size: ${mm(tm)}; }
    .cs h5 { margin: 0; padding: ${mm(1)} ${mm(2)}; font-size: ${mm(tm)}; text-align: center; text-decoration: underline; border-bottom: ${mm(0.25 * lw)} solid #000; }
    .cs table { width: 100%; border-collapse: collapse; } .cs td { border-bottom: ${mm(0.15 * lw)} solid #000; padding: ${mm(0.6)} ${mm(1)}; vertical-align: middle; }
    .cs .n { width: ${mm(8)}; text-align: center; } .cs .n span { display: inline-block; min-width: ${mm(4.6)}; line-height: ${mm(4.2)}; border: ${mm(0.25 * lw)} solid #000; border-radius: 50%; font-weight: 700; }
    .cs p { margin: 0; padding: ${mm(1)} ${mm(2)}; font-size: ${mm(tm)}; }
    .zn { position: absolute; display: flex; font-size: 2.5mm; line-height: 1; color: #000; }
    .zt { left: ${FRAME_W - 10}mm; right: 10mm; top: 5mm; height: 5mm; border-top: 0.35mm solid #000; } .zb { left: ${FRAME_W - 10}mm; right: 10mm; bottom: 5mm; height: 5mm; border-bottom: 0.35mm solid #000; }
    .zl { top: 10mm; bottom: 10mm; left: ${FRAME_W - 15}mm; width: 5mm; flex-direction: column; border-left: 0.35mm solid #000; } .zr { top: 10mm; bottom: 10mm; right: 5mm; width: 5mm; flex-direction: column; border-right: 0.35mm solid #000; }
    .zn span { flex: 1; display: flex; align-items: center; justify-content: center; border-left: 0.35mm solid #000; } .zn span:first-child { border-left: 0; }
    .zl span, .zr span { border-left: 0; border-top: 0.35mm solid #000; } .zl span:first-child, .zr span:first-child { border-top: 0; }
    .cm { position: absolute; background: #000; }
  </style></head><body>${border ? `
  <div class="brd">${drawnTitleBlockHtml(border, project, extra, false)}</div>` : ''}
  <div class="frame"><div class="body">${legendSheet ? `
    <div class="lgsheet">${legendSvg ? `<div class="lg">${legendSvg}</div>` : ''}${abbr.length ? abbrHtml : ''}${notesHtml}${revBoxHtml}</div>` : `
    <div class="drawing">${svg}</div>${table ? tableHtml(table) : ''}${(one?.tables ?? []).map((pt) => `<div class="ptab" data-id="${esc(pt.id)}" style="left:${num(3 + pt.x)}mm;top:${num(3 + pt.y)}mm;width:${num(pt.w)}mm">${pt.svg}</div>`).join('')}`}
    ${strip ? `<div class="strip"><div class="lg">${legendSvg}</div></div>` : ''}
    ${side ? `<div class="side">${legendSvg && !strip ? `<div class="lg">${legendSvg}</div>` : ''}` : ''}
    ${cables.length ? `<div class="cs"><h5>CABLE SCHEDULE</h5><table>${cables.map((c) => `<tr><td class="n"><span>${c.ref}</span></td><td>${esc(c.text)}</td></tr>`).join('')}</table>${fire ? `<p><b>NOTE:</b> ${esc(FIRE_NOTE)}</p>` : ''}</div>` : ''}
    ${abbr.length && !legendSheet ? abbrHtml : ''}
    ${notesInColumn ? notesHtml : ''}
    ${summary ? `<div class="sum"><b>${esc(summary.title)}</b><table>${summary.rows.map(([a, v]) => `<tr><td>${esc(a)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>` : ''}
    ${legendSheet ? '' : revBoxHtml}
    ${side ? '</div>' : ''}
    ${notesInColumn || legendSheet ? '' : notesHtml}
  </div>
    ${band}
  </div>
  ${zones ? `<div class="zn zt">${zoneCells(nx)}</div><div class="zn zb">${zoneCells(nx)}</div><div class="zn zl">${zoneCells(ny, true)}</div><div class="zn zr">${zoneCells(ny, true)}</div>` : ''}${fz.centring && !border ? centringHtml(w, h) : ''}
  ${markupLayerHtml(one?.markups ?? [], w, h)}${one?.plot?.stamp ? `
  <div class="stamp">${esc(one.plot.stamp)}</div>` : ''}
  </body></html>`;
}

const FRAME_W = 30, FRAME_H = 20, BAND = 44;

/** A sheet table (src/docs/sheetTable.ts) as HTML: title, lines, head, rows and totals. */
function tableHtml(t: SheetTable): string {
  const total = t.widths.reduce((a, b) => a + b, 0);
  const cell = (v: string, i: number, tag = 'td') => `<${tag}${t.left.includes(i) ? ' class="l"' : ''}>${esc(v)}</${tag}>`;
  return `<div class="tbl"><h5>${esc(t.title)}</h5>${t.lines.map((l) => `<p>${esc(l)}</p>`).join('')}<table><colgroup>${t.widths.map((w) => `<col style="width:${+((w / total) * 100).toFixed(2)}%">`).join('')}</colgroup><thead><tr>${t.head.map((h, i) => cell(h, i, 'th')).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((v, i) => cell(v, i)).join('')}</tr>`).join('')}${t.foot.map((r) => `<tr class="f">${r.map((v, i) => cell(v, i)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Zone references (ISO 5457): fields of about 50 mm along the frame, numbered along the top and bottom, lettered down
 * the sides, in a 5 mm strip outside the frame. */
export const zoneFields = (frameMm: number) => Math.max(2, Math.round(frameMm / 50));
export const zonesOn = (f: SheetFurniture, sheet: NonNullable<DrawingInfo['sheet']>) => f.zones === 'all' || (f.zones === 'large' && (sheet === 'A2' || sheet === 'A1'));
const zoneCells = (n: number, letters = false) => Array.from({ length: n }, (_, i) => `<span>${letters ? String.fromCharCode(65 + i) : i + 1}</span>`).join('');
/** Centring marks: 10 mm lines in from the paper's edges at the frame's middle. */
function centringHtml(w: number, h: number): string {
  const cx = +(FRAME_W - 10 + (w - FRAME_W) / 2).toFixed(2), cy = +(h / 2).toFixed(2);
  return `<div class="cm" style="left:${cx}mm;top:0;width:0.7mm;height:10mm"></div><div class="cm" style="left:${cx}mm;bottom:0;width:0.7mm;height:10mm"></div><div class="cm" style="top:${cy}mm;left:0;height:0.7mm;width:10mm"></div><div class="cm" style="top:${cy}mm;right:0;height:0.7mm;width:10mm"></div>`;
}

/** Whether the legend column's contents fit the paper: the legend (drawn at LEGEND_PX_PER_MM, so its height is known),
 * the cable schedule, the abbreviations and the summary, each at 2.5 mm text, against the drawing area's height. The
 * column clips what does not fit (overflow hidden), so a sheet whose column is full wants a larger paper. */
export function legendColumnFits(project: Project, svg: string, sheet: NonNullable<DrawingInfo['sheet']>, one: SheetInfo): boolean {
  if (one.legendSheet) return true;
  const fz = one.furniture ?? {}, tm = fz.textMm ?? LEGEND_TEXT_MM, r = tm / LEGEND_TEXT_MM; // rows grow with the text
  const legendH = one.legendStrip ? 0 : Number(one.legendSvg?.match(/data-h="([\d.]+)"/)?.[1] ?? 0) / (LEGEND_LABEL_PX / tm);
  const cables = one.cables ?? [], abbr = one.abbreviations ?? (project.drawing?.abbreviations === false ? [] : abbreviationsIn(svg));
  const notes = fz.notesPlace === 'column' || (one.legendStrip && one.legendSvg) ? [...(project.drawing?.notes ?? []), ...(one.notes ?? [])].filter((n) => n.trim()).length : 0;
  const parts = [legendH, cables.length ? (7 + cables.length * 5.2 + (cables.some((c) => c.fireRated) ? 5 : 0)) * r : 0, abbr.length ? (6 + abbr.length * 3.6) * r : 0, one.summary ? (6 + one.summary.rows.length * 3.6) * r : 0, notes ? (6 + notes * 4) * r : 0];
  const need = parts.reduce((a, b) => a + b, 0) + parts.filter(Boolean).length * 2 + 2 * SIDE_PAD_MM;
  const { body, k } = sheetBody(project, sheet, one.kind);
  return need * k <= body.h - 6;
}

/** What a sheet of this paper is laid out in (paper mm from the top left): its frame and the room inside it above the
 * title band (body), the furniture scale and the block chosen for the kind of sheet; or, when the paper has a
 * whole-border template (src/model/titleBlock.ts borderOf), the border and its drawing area as frame and body, at
 * full size and with no block of its own. */
export function sheetBody(project: Project, sheet: Paper, kind?: string): { border?: TitleTemplate & { border: Border }; frame: { x: number; y: number; w: number; h: number }; body: { w: number; h: number }; k: number; custom?: TitleTemplate } {
  const { w, h } = SHEET_MM[sheet];
  const border = borderOf(project, sheet);
  if (border) return { border, frame: border.border.area, body: { w: border.border.area.w, h: border.border.area.h }, k: 1 };
  const custom = templateOf(project, templateKindOf(kind));
  const k = furnitureScale(sheet, custom ? templateSize(custom) : undefined);
  const frame = { x: FRAME_W - 10, y: 10, w: w - FRAME_W, h: h - FRAME_H };
  return { frame, body: { w: frame.w, h: +(frame.h - (custom ? templateSize(custom).h : BAND) * k).toFixed(2) }, k, custom };
}

/** One scale for everything around the drawing (title block, revision table, abbreviations, notes). The title block
 * keeps its standard size on every paper from A3 to A1 (180 mm wide, ISO 7200), so its values print at 2.5 mm, the
 * ISO 3098 minimum, and it never grows with the paper or the drawing. On A4 it shrinks only as far as it must to fit
 * (within ≈ 60 % of the width and 30 % of the height). */
export function furnitureScale(sheet: NonNullable<DrawingInfo['sheet']>, tb?: { w: number; h: number }): number {
  const { w, h } = SHEET_MM[sheet];
  const tbW = tb?.w ?? 180, tbH = tb?.h ?? BAND;
  return +Math.min(1, ((w - FRAME_W) * 0.6) / tbW, ((h - FRAME_H) * 0.3) / tbH).toFixed(3);
}

/** The title block for one SLD page of a report, with the same fields, template and look as a drawing sheet. */
export function pageTitleBlock(project: Project, one: SheetInfo, sheet: NonNullable<DrawingInfo['sheet']> = 'A3', k = 1): { css: string; html: string; w: number; h: number } {
  const t = sheetTitleBlock(project, one);
  const custom = templateOf(project, 'report');
  const extra: Record<string, string> = { SheetNo: one.no, SheetTitle: one.title, SheetCount: String(one.count), SheetIndex: String(one.index), SheetSize: sheet, DrawingNo: one.no, DrawingTitle: one.title, Status: one.status ?? '', Scale: t.scale,
    ...(one.rev ? { Rev: one.rev } : {}), ...(one.date ? { RevDate: fmtDate(one.date) } : {}), ...(one.drawnBy ? { DrawnBy: one.drawnBy } : {}), ...(one.checkedBy ? { CheckedBy: one.checkedBy } : {}) };
  const size = custom ? templateSize(custom) : { w: 180, h: 55 }; // the standard block's rows need ≈ 53 mm at full size
  return { ...titleBlockFragment(project, t, custom, extra, one, sheet, k), w: size.w * k, h: size.h * k };
}
