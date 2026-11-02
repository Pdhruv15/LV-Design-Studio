import { currentRevision } from '../model/revisions';
import { cableDataNotice } from '../calc/cableTable';
import type { DrawingInfo, Project } from '../types';
import { esc } from './report';
import { templateOf, templateSize, titleBlockHtml } from '../model/titleBlock';
import { fillParams } from '../model/params';
import { abbreviationsIn } from './sldNotes';
import { FIRE_NOTE } from '../model/cableRefs';
import { markupLayerHtml, type SheetMarkup } from '../model/sheetMarkup';
import { isRasterDataUrl, num } from '../util/escape';
import { fmtDate } from '../util/format';

/** The SLD as a drawing sheet: frame, the diagram scaled to fit, and a
 * title block (company, project, owner, consultant, title, drawing no.,
 * revision, date, scale, drawn / checked / approved, revision history). */

export const SHEET_MM: Record<NonNullable<DrawingInfo['sheet']>, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  'A3 portrait': { w: 297, h: 420 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 }
};

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
  history: { id: string; date: string; description: string }[];
}

export function titleBlockOf(project: Project, date = new Date().toISOString().slice(0, 10)): TitleBlock {
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
    history: (project.revisions ?? []).slice(-4).reverse().map((r) => ({ id: r.id, date: fmtDate(r.date), description: r.description }))
  };
}

/** The title block of one sheet of a set (the project's, with the sheet's own values). */
export function sheetTitleBlock(project: Project, one?: SheetInfo): TitleBlock {
  const t = titleBlockOf(project);
  if (one) {
    t.number = one.no; t.title = one.title;
    if (one.rev) t.revision = one.rev;
    if (one.date) t.date = fmtDate(one.date);
    if (one.drawnBy) t.drawnBy = one.drawnBy;
    if (one.checkedBy) t.checkedBy = one.checkedBy;
    if (one.approvedBy) t.approvedBy = one.approvedBy;
    if (one.scale) t.scale = one.scale;
    if (one.history?.length) t.history = one.history.slice(-4).reverse().map((r) => ({ ...r, date: fmtDate(r.date) }));
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
  markups?: SheetMarkup[] }

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
  // Heavier top and left edges; the frame's own border is the right and bottom ones.
  const css = `    .tb { position: absolute; right: 0; bottom: 0; width: ${mm(180)}; border-collapse: collapse; table-layout: fixed; }
    .tb td.t { border: ${mm(0.25)} solid #000; padding: ${mm(1)} ${mm(1.5)}; vertical-align: top; }
    .tb tr:first-child td { border-top: ${mm(0.5)} solid #000; }
    .tb td.l { border-left: ${mm(0.5)} solid #000; }
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

export function buildSldSheetHtml(project: Project, svg: string, sheet: NonNullable<DrawingInfo['sheet']> = 'A3', one?: SheetInfo): string {
  const { w, h } = SHEET_MM[sheet];
  const t = sheetTitleBlock(project, one);
  const status = one?.status ?? '';
  const extra: Record<string, string> = one
    ? { SheetNo: one.no, SheetTitle: one.title, SheetCount: String(one.count), SheetIndex: String(one.index), SheetSize: sheet, DrawingNo: one.no, DrawingTitle: one.title, Status: status, Scale: t.scale,
      ...(one.rev ? { Rev: one.rev } : {}), ...(one.date ? { RevDate: fmtDate(one.date) } : {}), ...(one.drawnBy ? { DrawnBy: one.drawnBy } : {}), ...(one.checkedBy ? { CheckedBy: one.checkedBy } : {}), ...(one.approvedBy ? { ApprovedBy: one.approvedBy } : {}) }
    : { SheetNo: t.number, SheetTitle: t.title, SheetCount: '1', SheetIndex: '1', SheetSize: sheet, Status: '', Scale: t.scale };
  const custom = templateOf(project);
  const notes = [...(project.drawing?.notes ?? []), ...(one?.notes ?? [])];
  const abbr = project.drawing?.abbreviations === false ? [] : abbreviationsIn(svg);
  const history = t.history.length ? t.history : [{ id: '—', date: '', description: 'Not issued' }];
  // Sheet furniture (title block, revision table, abbreviations, notes) at its standard size.
  const k = furnitureScale(sheet, custom ? templateSize(custom) : undefined);
  const mm = (v: number) => `${+(v * k).toFixed(2)}mm`;
  const px = (v: number) => `${+(v * k).toFixed(2)}px`;
  const tbW = custom ? templateSize(custom).w : 180;
  const cables = one?.cables ?? [];
  const legendSvg = one?.legendSvg ?? '';
  // Legend column on the right (top to bottom): LEGEND, CABLE SCHEDULE,
  // ABBREVIATIONS — one width, one alignment. Without a column (single
  // SLD export) the abbreviations stay bottom left.
  const summary = one?.summary;
  const side = !!one && (!!legendSvg || cables.length > 0 || abbr.length > 0 || !!summary);
  const csW = side ? one?.sideMm ?? 92 : 0; // legend column width (mm at scale 1)
  const fire = cables.some((c) => c.fireRated);
  const { css: tbCss, html: tbHtml } = titleBlockFragment(project, t, custom, extra, one, sheet, k);
  // The revision table and the title block share the band along the frame's foot, row for row, so each line of one runs
  // on into the other: the standard block in the same table, a template beside a table of its own row heights.
  const gen = `Generated by LV Design Studio${cableDataNotice(project) ? ` — ${esc(cableDataNotice(project))}` : ''}`;
  const revCells = (i: number, rows: number) => (i === 0 ? '<td class="r u h">Rev</td><td class="r u h">Date</td><td class="r u h">Description</td>'
    : i === rows - 1 ? `<td class="r gen" colspan="3">${gen}</td>`
    : i <= history.length ? `<td class="r u">${esc(history[i - 1].id)}</td><td class="r u">${esc(history[i - 1].date)}</td><td class="r u">${esc(history[i - 1].description)}</td>`
    : '<td class="r" colspan="3"></td>');
  // A template too short for the revision table: the table stands taller, closed by a line on the template's left edge
  // (a collapsed table border lies half outside the table), and the legend column comes down to the template.
  const tooShort = custom ? Math.max(0, 9 + history.length * 4.5 - templateSize(custom).h) : 0;
  const band = custom ? (() => {
    const { w: cw, h: ch } = templateSize(custom);
    const n = history.length + 2;
    const rows = tooShort ? [5, ...Array<number>(history.length).fill(4.5), 4] : custom.rows.length >= n ? custom.rows : Array<number>(n).fill(ch / n);
    return `<div class="band cb" style="height:${mm(ch + tooShort)}"><table class="rv" style="width:calc(100% - ${mm(cw)})"><colgroup><col style="width:10%"><col style="width:18%"><col></colgroup>${rows.map((rh, i) => `<tr style="height:${mm(num(rh))}">${revCells(i, rows.length)}</tr>`).join('')}</table>${tooShort ? `<div class="rvx" style="left:calc(100% - ${mm(cw + 0.25)});bottom:${mm(ch)};height:${mm(tooShort)}"></div>` : ''}${tbHtml}</div>`;
  })() : (() => {
    const revW = w - 31.4 - 180 * k; // inside the frame's 0.7 mm border, less the title block
    const col = (v: number) => `<col style="width:${+v.toFixed(2)}mm">`;
    return `<table class="tb band"><colgroup>${col(revW * 0.1)}${col(revW * 0.18)}<col>${titleCols(k)}</colgroup>${standardTitleRows(project, t, one, sheet, status).map((r, i, all) => `<tr>${revCells(i, all.length)}${r}</tr>`).join('')}</table>`;
  })();
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.number || t.title)}</title><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${w}mm; height: ${h}mm; font: ${px(9)} Arial, sans-serif; color: #000; background: #fff; }
    .frame { position: absolute; inset: 10mm 10mm 10mm 20mm; border: 0.7mm solid #000; display: flex; flex-direction: column; }
    .body { position: relative; flex: 1; min-height: 0; }
    .drawing { position: absolute; inset: 3mm; right: calc(3mm + ${mm(csW)}); display: flex; align-items: center; justify-content: center; }
    .drawing svg { width: 100%; height: 100%; }
    ${tbCss}
    .band { position: relative; flex: none; width: 100%; font-size: ${px(8)}; }
    .tb.band { position: static; }
    .rv { position: absolute; left: 0; top: 0; height: 100%; border-collapse: collapse; table-layout: fixed; }
    .rvx { position: absolute; border-left: ${mm(0.5)} solid #000; }
    .band td.r { border: 0; padding: ${mm(0.8)} ${mm(1.5)}; text-align: left; vertical-align: middle; }
    .band tr:first-child td.r { border-top: ${mm(0.5)} solid #000; }
    .band td.u { border-bottom: ${mm(0.2)} solid #999; }
    .band td.h { font-size: ${px(7)}; font-weight: 700; text-transform: uppercase; }
    .band td.gen { vertical-align: bottom; font-size: ${px(6.5)}; color: #555; }
    .notes { position: absolute; right: 0; bottom: ${mm(3)}; font-size: ${px(8)}; border: ${mm(0.25)} solid #000; border-right: 0; padding: ${mm(1)} ${mm(2)}; background: #fff; }
    .notes ol { margin: ${mm(0.5)} 0 0; padding-left: ${mm(4)}; }
    .side { position: absolute; right: 0; top: 0; width: ${mm(csW)}; bottom: ${tooShort && csW <= tbW ? `-${mm(tooShort)}` : 0}; display: flex; flex-direction: column; gap: ${mm(2)}; overflow: hidden; border-left: ${mm(0.25)} solid #000; padding: ${mm(2)}; }
    .side .lg svg { width: 100%; height: auto; display: block; }
    .side .sum { margin-top: auto; flex: none; border: ${mm(0.25)} solid #000; font-size: ${px(7)}; }
    .sum b { display: block; font-size: ${px(8)}; padding: ${mm(1)} ${mm(2)}; border-bottom: ${mm(0.25)} solid #000; }
    .sum table { width: 100%; border-collapse: collapse; } .sum td { padding: ${mm(0.3)} ${mm(2)}; border-bottom: ${mm(0.15)} solid #000; } .sum tr:last-child td { border-bottom: 0; } .sum td + td { text-align: right; font-weight: 600; width: ${mm(16)}; }
    .side .abbr, .side .cs { position: static; width: auto; max-height: none; border: ${mm(0.25)} solid #000; column-count: 1; }
    .abbr { position: absolute; left: 0; bottom: 0; font-size: ${px(7)}; border: ${mm(0.25)} solid #000; border-left: 0; border-bottom: 0; padding: ${mm(1)} ${mm(2)}; background: #fff; column-count: ${abbr.length > 12 ? 2 : 1}; column-gap: ${mm(4)}; }
    .abbr b { display: block; column-span: all; font-size: ${px(8)}; margin-bottom: ${mm(0.5)}; }
    .abbr div { break-inside: avoid; white-space: nowrap; } .abbr span { display: inline-block; min-width: ${mm(9)}; font-weight: 600; }
    .cs { position: absolute; right: 0; top: 0; width: ${mm(csW)}; max-height: 100%; overflow: hidden; border-left: ${mm(0.25)} solid #000; border-bottom: ${mm(0.25)} solid #000; background: #fff; font-size: ${px(7)}; }
    .cs h5 { margin: 0; padding: ${mm(1)} ${mm(2)}; font-size: ${px(9)}; text-align: center; text-decoration: underline; border-bottom: ${mm(0.25)} solid #000; }
    .cs table { width: 100%; border-collapse: collapse; } .cs td { border-bottom: ${mm(0.15)} solid #000; padding: ${mm(0.6)} ${mm(1)}; vertical-align: middle; }
    .cs .n { width: ${mm(8)}; text-align: center; } .cs .n span { display: inline-block; min-width: ${mm(4.6)}; line-height: ${mm(4.2)}; border: ${mm(0.25)} solid #000; border-radius: 50%; font-weight: 700; }
    .cs p { margin: 0; padding: ${mm(1)} ${mm(2)}; font-size: ${px(7)}; }
  </style></head><body>
  <div class="frame"><div class="body">
    <div class="drawing">${svg}</div>
    ${side ? `<div class="side">${legendSvg ? `<div class="lg">${legendSvg}</div>` : ''}` : ''}
    ${cables.length ? `<div class="cs"><h5>CABLE SCHEDULE</h5><table>${cables.map((c) => `<tr><td class="n"><span>${c.ref}</span></td><td>${esc(c.text)}</td></tr>`).join('')}</table>${fire ? `<p><b>NOTE:</b> ${esc(FIRE_NOTE)}</p>` : ''}</div>` : ''}
    ${abbr.length ? `<div class="abbr"><b>ABBREVIATIONS</b>${abbr.map(([a, d]) => `<div><span>${esc(a)}</span>${esc(d)}</div>`).join('')}</div>` : ''}
    ${summary ? `<div class="sum"><b>${esc(summary.title)}</b><table>${summary.rows.map(([a, v]) => `<tr><td>${esc(a)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>` : ''}
    ${side ? '</div>' : ''}
    ${notes.length ? `<div class="notes" style="width:${mm(tbW)}"><b>NOTES</b><ol>${notes.map((n) => `<li>${esc(fillParams(n, project))}</li>`).join('')}</ol></div>` : ''}
  </div>
    ${band}
  </div>
  ${markupLayerHtml(one?.markups ?? [], w, h)}
  </body></html>`;
}

const FRAME_W = 30, FRAME_H = 20, BAND = 44;

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
  const custom = templateOf(project);
  const extra: Record<string, string> = { SheetNo: one.no, SheetTitle: one.title, SheetCount: String(one.count), SheetIndex: String(one.index), SheetSize: sheet, DrawingNo: one.no, DrawingTitle: one.title, Status: one.status ?? '', Scale: t.scale,
    ...(one.rev ? { Rev: one.rev } : {}), ...(one.date ? { RevDate: fmtDate(one.date) } : {}), ...(one.drawnBy ? { DrawnBy: one.drawnBy } : {}), ...(one.checkedBy ? { CheckedBy: one.checkedBy } : {}) };
  const size = custom ? templateSize(custom) : { w: 180, h: 55 }; // the standard block's rows need ≈ 53 mm at full size
  return { ...titleBlockFragment(project, t, custom, extra, one, sheet, k), w: size.w * k, h: size.h * k };
}
