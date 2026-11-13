import type { DrawingInfo, Project } from '../types';
import { svgToDxf } from '../diagram/exportSvg';
import { toDxf, type DxfPrimitive } from './dxf';
import { sheetBody, sheetTitleBlock, SHEET_MM, zoneFields, zonesOn, type SheetInfo } from './sldSheet';
import { LEGEND_LABEL_PX, LEGEND_TEXT_MM } from '../diagram/legendLayout';
import { TABLE_LINE_MM, TABLE_ROW_MM, TABLE_TITLE_MM, tableHeightMm, type SheetTable } from './sheetTable';
import { abbreviationsIn } from './sldNotes';
import { fillParams } from '../model/params';
import { FIRE_NOTE } from '../model/cableRefs';
import { MAX_REV_ROWS, revRowsIn, revRowValues, templateSize } from '../model/titleBlock';
import { drawnTitleBlockDxf, templateTitleBlockDxf, type TitleDetail } from './titleBlockDxf';
import { textInBox, textWidth, wrapDxfText, type DxfBox } from './dxfLayout';
import { MARKUP_LAYERS, markupDxf } from '../model/sheetMarkup';

/** Paper-sized, editable R12 drawings. Overflow is placed on additional
 * sheets, never discarded or drawn across the diagram. */
export const SHEET_LAYERS: Record<string, number> = {
  'E-FRAME': 7, 'E-TITLE': 7, 'E-LEGEND': 8, 'E-NOTES': 7, 'E-SYMBOL': 3, 'E-CABLE': 7, 'E-BUSBAR': 1, 'E-TEXT': 7, 'E-RESULT': 4, ...MARKUP_LAYERS
};
const LAYER_OF: Record<string, string> = { SYMBOL: 'E-SYMBOL', CABLE: 'E-CABLE', BUSBAR: 'E-BUSBAR', TEXT: 'E-TEXT', RESULT: 'E-RESULT' };
type SheetSize = NonNullable<DrawingInfo['sheet']>;
export interface DxfSheetPage { data: string; index: number; count: number; continuation: boolean; warnings: string[] }
const rect = (layer: string, b: DxfBox): DxfPrimitive => ({ type: 'polyline', layer, closed: true, points: [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]] });

function sizeOf(svg: string) {
  const match = svg.match(/viewBox=["']([^"']+)["']/);
  if (!match) return { x: 0, y: 0, w: 1000, h: 700 };
  const a = match[1].trim().split(/[\s,]+/).map(Number);
  if (a.length !== 4 || !a.every(Number.isFinite) || a[2] <= 0 || a[3] <= 0) throw new Error('The drawing has an invalid SVG viewBox.');
  return { x: a[0], y: a[1], w: a[2], h: a[3] };
}

function shift(p: DxfPrimitive, dx: number, dy = 0): DxfPrimitive {
  switch (p.type) {
    case 'line': return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
    case 'polyline': return { ...p, points: p.points.map(([x, y]) => [x + dx, y + dy]) };
    case 'insert': return { ...p, x: p.x + dx, y: p.y + dy, attribs: p.attribs.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })), ...(p.extent ? { extent: [[p.extent[0][0] + dx, p.extent[0][1] + dy], [p.extent[1][0] + dx, p.extent[1][1] + dy]] as [[number, number], [number, number]] } : {}) };
    default: return { ...p, x: p.x + dx, y: p.y + dy };
  }
}

function placeSvg(svg: string, box: DxfBox, layer?: string, centre = true): { items: DxfPrimitive[]; usedH: number; scale: number } {
  if (box.w <= 0 || box.h <= 0) throw new Error('The title block leaves no room for the drawing.');
  const source = sizeOf(svg);
  const s = Math.min(box.w / source.w, box.h / source.h);
  const dw = source.w * s, dh = source.h * s;
  const ox = box.x + (centre ? (box.w - dw) / 2 : 0);
  const oy = box.y + (centre ? (box.h - dh) / 2 : box.h - dh);
  const items = svgToDxf(svg, source.h).map((q): DxfPrimitive => {
    const L = layer ?? LAYER_OF[q.layer] ?? 'E-SYMBOL';
    // A dashed element keeps one entity; its linetype follows its length on paper (dash 3 mm, or 1.5 mm when short).
    const { dashed, ...p } = q as typeof q & { dashed?: boolean };
    const lt = (mm: number): { linetype?: string } => dashed ? { linetype: mm < 18 ? 'LV-DASHED2' : 'LV-DASHED' } : {};
    const run = (pts: [number, number][], closed?: boolean) => pts.reduce((a, c, j) => a + (j ? Math.hypot(c[0] - pts[j - 1][0], c[1] - pts[j - 1][1]) : 0), closed && pts.length ? Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) : 0) * s;
    const X = (x: number) => ox + (x - source.x) * s, Y = (y: number) => oy + (y + source.y) * s;
    switch (p.type) {
      case 'line': return { ...p, layer: L, x1: X(p.x1), y1: Y(p.y1), x2: X(p.x2), y2: Y(p.y2), ...lt(Math.hypot(p.x2 - p.x1, p.y2 - p.y1) * s), ...(p.width ? { width: p.width * s } : {}) };
      case 'polyline': return { ...p, layer: L, points: p.points.map(([a, b]) => [X(a), Y(b)]), ...lt(run(p.points, p.closed)), ...(p.width ? { width: p.width * s } : {}) };
      case 'circle': return { ...p, layer: L, x: X(p.x), y: Y(p.y), r: p.r * s, ...lt(2 * Math.PI * p.r * s) };
      case 'text': return { ...p, layer: L, x: X(p.x), y: Y(p.y), height: p.height * s, ...(p.width ? { width: p.width * s } : {}) };
      default: return p; // an SVG holds no block inserts
    }
  });
  return { items, usedH: dh, scale: s };
}

interface FlowLine { text: string; layer: string; heading?: boolean; section: string; blockLines?: number }

/** Lay out every physical sheet before serializing it, so file/ZIP export
 * and the single-file API share the same complete output. */
function sheetPages(project: Project, svg: string, size: SheetSize, one?: SheetInfo): { items: DxfPrimitive[][]; warnings: string[] } {
  const { w, h } = SHEET_MM[size];
  // A whole-border template for the paper: its block at the paper's origin in place of the frame, zone strip and title
  // band; everything else inside its drawing area (y up here).
  const lay = sheetBody(project, size, one?.kind), border = lay.border, custom = lay.custom, k = lay.k;
  const frame = border ? { x: lay.frame.x, y: h - lay.frame.y - lay.frame.h, w: lay.frame.w, h: lay.frame.h } : { x: 20, y: 10, w: w - 30, h: h - 20 };
  const t = sheetTitleBlock(project, one);
  const dims = custom ? templateSize(custom) : { w: 180, h: 44 };
  if (custom && [...custom.cols, ...custom.rows].some((v) => !Number.isFinite(v) || v <= 0)) throw new Error('The title block needs positive row heights and column widths.');
  const extra: Record<string, string> = {
    SheetNo: t.number, DrawingNo: t.number, SheetTitle: t.title, DrawingTitle: t.title,
    SheetCount: String(one?.count ?? 1), SheetIndex: String(one?.index ?? 1), SheetSize: size,
    Status: one?.status ?? '', Scale: t.scale, Rev: t.revision, RevDate: t.date,
    ...(one?.history?.length ? { RevDescription: t.history[0]?.description ?? '' } : {}),
    ...(one?.drawnBy ? { DrawnBy: t.drawnBy } : {}), ...(one?.checkedBy ? { CheckedBy: t.checkedBy } : {}), ...(one?.approvedBy ? { ApprovedBy: t.approvedBy } : {}),
    ...revRowValues(sheetTitleBlock(project, one, MAX_REV_ROWS).history)
  };
  const warnings: string[] = [], details: TitleDetail[] = [];
  const title: DxfPrimitive[] = [];
  const bounded = (b: DxfBox, value: string, height: number, label: string) => {
    let items = textInBox('E-TITLE', b, value, height);
    if (items.some((p) => p.type === 'text' && (p.width ?? 0) < textWidth(p.text, p.height) * 0.55)) {
      const reference = details.length + 1;
      details.push({ label: `[${reference}] ${label}`, value });
      items = textInBox('E-TITLE', b, `[${reference}]`, height);
    }
    title.push(...items);
  };
  const tbW = border ? 0 : dims.w * k;
  const tbx = frame.x + frame.w - tbW;
  const cells: [string, string, number][][] = [
    [['Company / consultant', t.company, 3]],
    [['Project', t.project, 2], ['Owner', t.owner, 1]],
    [[`Drawing title${one?.status ? ` - ${one.status}` : ''}`, t.title, 3]],
    [['Drawing no.', t.number, 1], ['Revision', t.revision, 1], ['Date', t.date, 1]],
    [['Drawn', t.drawnBy, 1], ['Checked', t.checkedBy, 1], ['Approved', t.approvedBy, 1]],
    [['Sheet', `${one?.index ?? 1} of ${one?.count ?? 1} - ${size} - Scale ${t.scale}`, 2], ['System', `${project.voltageV} V, 3Ph + N, ${project.frequencyHz} Hz`, 1]]
  ];
  // Grow ordinary rows to accommodate wrapped values; exceptionally large
  // values are listed in the additional-information area instead of crushed.
  const rows = cells.map((row, i) => Math.max([8, 8, 9, 7, 6, 6][i] * k, ...row.map(([, value, span]) => {
    const height = (i === 2 ? 3.2 : i >= 3 ? 1.9 : 2.4) * k;
    const count = Math.min(3, Math.max(1, wrapDxfText(value, tbW * span / 3 - 3 * k, height).length));
    return 3.5 * k + count * height * 1.5;
  })));
  // The revision lines: the issues (up to 4), or the fixed 6 or 8 of the sheet furniture, blank ones included.
  const issued = t.history.length ? t.history : [{ id: '-', date: '', description: 'Not issued' }];
  const revLines = one?.furniture?.revRows ?? issued.length;
  const history = [...issued.slice(0, revLines), ...Array.from({ length: Math.max(0, revLines - issued.length) }, () => ({ id: '', date: '', description: '' }))];
  // The band along the frame's foot is as high as the title block (a template too short for the revision table makes
  // it higher), and the revision table beside the block follows its rows. Every line is drawn once: the frame is the
  // band's foot and outer edges, one line its top.
  const titleH = border ? 0 : custom ? dims.h * k : rows.reduce((a, b) => a + b, 0);
  const band = border ? 0 : Math.max(titleH, (5 + history.length * 4.5) * k);
  if (!border && (!Number.isFinite(band) || band > frame.h * 0.65 || !Number.isFinite(tbW) || tbW <= 0 || tbW >= frame.w)) throw new Error('The title block is too large for the selected paper size.');
  const titleBox = { x: tbx, y: frame.y, w: tbW, h: titleH };
  const bandTop = frame.y + band, titleTop = frame.y + titleH;
  // A template draws its own grid, its top edge included; a revision table standing taller closes its side above it.
  if (!border) title.push({ type: 'line', layer: 'E-TITLE', x1: frame.x, y1: bandTop, x2: custom ? tbx : frame.x + frame.w, y2: bandTop });
  if (band > titleH + 1e-6) title.push({ type: 'line', layer: 'E-TITLE', x1: tbx, y1: titleTop, x2: tbx, y2: bandTop });
  if (border) {
    // The whole border as one block with attributes at the paper's origin, at its own size.
    const result = drawnTitleBlockDxf(border, project, { x: 0, y: 0, w, h }, extra);
    title.push(...result.items); warnings.push(...result.warnings);
  } else if (custom) {
    const result = templateTitleBlockDxf(custom, project, titleBox, extra, t.history);
    title.push(...result.items); warnings.push(...result.warnings); details.push(...result.details);
  } else {
    title.push({ type: 'line', layer: 'E-TITLE', x1: tbx, y1: frame.y, x2: tbx, y2: bandTop });
    let top = bandTop;
    cells.forEach((row, i) => {
      const rh = rows[i], bottom = top - rh;
      if (i) title.push({ type: 'line', layer: 'E-TITLE', x1: tbx, y1: top, x2: tbx + tbW, y2: top });
      let x = tbx;
      row.forEach(([label, value, span]) => {
        const cw = tbW * span / 3;
        if (x > tbx) title.push({ type: 'line', layer: 'E-TITLE', x1: x, y1: bottom, x2: x, y2: top });
        bounded({ x: x + 1.5 * k, y: top - 3 * k, w: cw - 3 * k, h: 2.5 * k }, label.toUpperCase(), 1.6 * k, `${label} caption`);
        bounded({ x: x + 1.5 * k, y: bottom + 0.6 * k, w: cw - 3 * k, h: rh - 3.6 * k }, value, (i === 2 ? 3.2 : i >= 3 ? 1.9 : 2.4) * k, label);
        x += cw;
      });
      top = bottom;
    });
    if (t.logo) warnings.push('DXF omits the raster logo; the logo is available in the PDF.');
  }
  const rvw = frame.w - tbW;
  const revCols = [0, 0.14, 0.36, 1];
  const blockRows = custom ? custom.rows.map((v) => v * k) : rows;
  const revRows = blockRows.length > history.length && band === titleH ? blockRows : [5 * k, ...Array<number>(history.length).fill((band - 5 * k) / history.length)];
  let revTop = bandTop;
  if (!border) [['REV', 'DATE', 'DESCRIPTION'], ...history.map((r) => [r.id, r.date, r.description])].forEach((row, i) => {
    const rh = revRows[i], bottom = revTop - rh;
    // The ruled line under the row, unless that is the frame's own foot.
    if (bottom > frame.y + 1e-6) title.push({ type: 'line', layer: 'E-TITLE', x1: frame.x, y1: bottom, x2: frame.x + rvw, y2: bottom });
    row.forEach((s, j) => bounded({ x: frame.x + rvw * revCols[j] + k, y: bottom + 0.5 * k, w: rvw * (revCols[j + 1] - revCols[j]) - 2 * k, h: rh - k }, s, i ? 2 * k : 1.8 * k,
      i ? `Revision ${row[0]}${j === 2 ? ' description' : j === 1 ? ' date' : ''}` : s));
    revTop = bottom;
  });

  const bodyBottom = frame.y + band + 3;
  const bodyTop = frame.y + frame.h - 3;
  const bodyH = bodyTop - bodyBottom;
  const colW = Math.min((one?.sideMm ?? 92) * k, frame.w * 0.4);
  const contentW = colW - 4 * k;
  // Column text at 2.5 mm (ISO 3098) or the set's 3.5 mm, as the PDF prints it; A4 alone shrinks it with the furniture.
  const fz = one?.furniture ?? {}, tm = fz.textMm ?? LEGEND_TEXT_MM;
  const cap = Math.max(1.5, tm * k), headingCap = Math.max(1.8, tm * k);
  const step = Math.max(3.1 * k, cap * 1.5), headingStep = Math.max(4 * k, headingCap * 1.5);
  const flow: FlowLine[] = [];
  const section = (heading: string, values: string[], layer = 'E-LEGEND') => {
    const content = values.flatMap((value) => {
      const lines = wrapDxfText(value, contentW, cap);
      return lines.map((text, i): FlowLine => ({ text, layer, section: heading, ...(i === 0 ? { blockLines: lines.length } : {}) }));
    });
    if (!content.length) return;
    flow.push({ text: heading, layer, heading: true, section: heading });
    flow.push(...content);
  };
  const cables = one?.cables ?? [];
  if (cables.length) section('CABLE SCHEDULE', [...cables.map((c) => `(${c.ref})${c.fireRated ? ' *' : ''}  ${c.text}`), ...(cables.some((c) => c.fireRated) ? [`NOTE: ${FIRE_NOTE}`] : [])]);
  const abbr = one?.abbreviations ?? (project.drawing?.abbreviations === false ? [] : abbreviationsIn(svg));
  if (abbr.length) section('ABBREVIATIONS', abbr.map(([a, d]) => `${a}   ${d}`));
  const notes = (one?.notesOff ? [] : [...(project.drawing?.notes ?? []), ...(one?.notes ?? [])]).filter((n) => n.trim()).map((n, i) => `${i + 1}. ${fillParams(n, project, extra)}`);
  if (notes.length) section('NOTES', notes, 'E-NOTES');
  if (details.length) section('TITLE BLOCK DETAILS', details.map((d) => `${d.label}: ${d.value}`), 'E-NOTES');
  if (one?.summary) section(one.summary.title, one.summary.rows.map(([a, v]) => `${a}   ${v}`));
  // A border without revision rows of its own: the app's revision table as lines of the column.
  if (border && !revRowsIn(border)) section('REVISIONS', history.filter((r) => r.id).map((r) => `${r.id}   ${r.date}   ${r.description}`), 'E-TITLE');
  const legend = one?.legendSvg ?? '';
  const legendSheet = !!one?.legendSheet;
  const side = !legendSheet && !!(legend || flow.length);
  // Sheet furniture outside the frame: zone references in a 5 mm strip (numbers along the top and bottom, letters down
  // the sides, fields of about 50 mm) and centring marks, on every page of the sheet.
  const outside: DxfPrimitive[] = [];
  if (!border && zonesOn(fz, size)) {
    const nx = zoneFields(frame.w), ny = zoneFields(frame.h), cw = frame.w / nx, ch = frame.h / ny, th = 2.5;
    outside.push(rect('E-FRAME', { x: frame.x - 5, y: frame.y - 5, w: frame.w + 10, h: frame.h + 10 }));
    for (let i = 0; i < nx; i++) {
      const x = frame.x + i * cw;
      if (i) outside.push({ type: 'line', layer: 'E-FRAME', x1: x, y1: frame.y - 5, x2: x, y2: frame.y }, { type: 'line', layer: 'E-FRAME', x1: x, y1: frame.y + frame.h, x2: x, y2: frame.y + frame.h + 5 });
      for (const y of [frame.y - 5, frame.y + frame.h]) outside.push({ type: 'text', layer: 'E-FRAME', x: x + cw / 2, y: y + (5 - th) / 2, height: th, text: String(i + 1), align: 'center' });
    }
    for (let i = 0; i < ny; i++) {
      const yTop = frame.y + frame.h - i * ch; // lettered from the top
      if (i) outside.push({ type: 'line', layer: 'E-FRAME', x1: frame.x - 5, y1: yTop, x2: frame.x, y2: yTop }, { type: 'line', layer: 'E-FRAME', x1: frame.x + frame.w, y1: yTop, x2: frame.x + frame.w + 5, y2: yTop });
      for (const x of [frame.x - 2.5, frame.x + frame.w + 2.5]) outside.push({ type: 'text', layer: 'E-FRAME', x, y: yTop - ch / 2 - th / 2, height: th, text: String.fromCharCode(65 + i), align: 'center' });
    }
  }
  if (fz.centring && !border) {
    const cx = frame.x + frame.w / 2, cy = h / 2;
    outside.push({ type: 'line', layer: 'E-FRAME', x1: cx, y1: h, x2: cx, y2: h - 10, width: 0.7 }, { type: 'line', layer: 'E-FRAME', x1: cx, y1: 0, x2: cx, y2: 10, width: 0.7 },
      { type: 'line', layer: 'E-FRAME', x1: 0, y1: cy, x2: 10, y2: cy, width: 0.7 }, { type: 'line', layer: 'E-FRAME', x1: w, y1: cy, x2: w - 10, y2: cy, width: 0.7 });
  }
  const pages: DxfPrimitive[][] = [];
  const base = () => [rect('E-FRAME', { x: 0, y: 0, w, h }), ...(border ? [] : [rect('E-FRAME', frame)]), ...outside, ...title];
  const first = base(); pages.push(first);
  const colX = frame.x + frame.w - colW;
  let cursor = 0;
  const writeColumn = (out: DxfPrimitive[], x: number, top: number, bottom: number) => {
    let y = top;
    if (cursor && cursor < flow.length && !flow[cursor].heading) {
      out.push(...textInBox(flow[cursor].layer, { x: x + 2 * k, y: y - headingStep, w: contentW, h: headingStep }, `${flow[cursor].section} - continued`, headingCap));
      y -= headingStep;
    }
    while (cursor < flow.length) {
      const line = flow[cursor], height = line.heading ? headingStep : step;
      const blockHeight = (line.blockLines ?? 1) * step;
      const nextHeight = (flow[cursor + 1]?.blockLines ?? 1) * step;
      // Keep ordinary schedule rows together. Exceptionally long paragraphs
      // can continue across columns without losing any of their lines.
      const needed = line.heading ? height + (nextHeight <= top - bottom - height ? nextHeight : step)
        : line.blockLines && blockHeight <= top - bottom - headingStep ? blockHeight : height;
      if (y - needed < bottom - 1e-8) break;
      out.push(...textInBox(line.layer, { x: x + 2 * k, y: y - height, w: contentW, h: height }, line.text, line.heading ? headingCap : cap));
      y -= height; cursor++;
    }
  };
  // The legend in a strip along the foot of the drawing area (as the PDF): as high as it was drawn, plus its padding.
  const strip = !!legend && !!one?.legendStrip;
  const stripH = strip ? (Number(legend.match(/data-h="([\d.]+)"/)?.[1] ?? 0) / (LEGEND_LABEL_PX / tm) + 4) * k : 0;
  if (strip) {
    first.push({ type: 'line', layer: 'E-LEGEND', x1: frame.x, y1: bodyBottom + stripH, x2: colX, y2: bodyBottom + stripH });
    first.push(...placeSvg(legend, { x: frame.x + 2 * k, y: bodyBottom + 2 * k, w: frame.w - (side ? colW : 0) - 4 * k, h: stripH - 4 * k }, 'E-LEGEND', false).items);
  }
  if (side) {
    // The legend column's edge runs from the title block's top line (the band's, when the column is wider) to the frame's.
    first.push({ type: 'line', layer: 'E-LEGEND', x1: colX, y1: colX >= tbx - 1e-6 ? titleTop : bandTop, x2: colX, y2: frame.y + frame.h });
    let top = bodyTop;
    if (legend && !strip) {
      // Drawn for the column's width (src/diagram/legendLayout.ts), so at that width its labels are 2.5 mm; the
      // schedules and notes take the room below, and what does not fit goes on a continuation sheet.
      const r = placeSvg(legend, { x: colX + 2 * k, y: bodyBottom, w: contentW, h: bodyH }, 'E-LEGEND', false);
      first.push(...r.items); top -= r.usedH + 3 * k;
    }
    writeColumn(first, colX, top, bodyBottom);
  }
  if (legendSheet) {
    // The legend across the sheet, then the abbreviations and notes in columns under it; nothing else is drawn.
    const legendH = legend ? Number(legend.match(/data-h="([\d.]+)"/)?.[1] ?? 0) / (LEGEND_LABEL_PX / tm) * k : 0;
    let top = bodyTop;
    if (legend) { first.push(...placeSvg(legend, { x: frame.x + 3, y: bodyTop - legendH, w: frame.w - 6, h: legendH }, 'E-LEGEND', false).items); top -= legendH + 3 * k; }
    const columns = Math.max(1, Math.floor((frame.w - 6) / colW));
    for (let j = 0; j < columns && cursor < flow.length; j++) writeColumn(first, frame.x + 3 + j * colW, top, bodyBottom);
  }
  // A table under the drawing (a board sheet's load schedule), as high as the PDF prints it.
  const table = one?.table, tableH = table ? tableHeightMm(table, tm) * k : 0;
  if (table) first.push(...tableDxf(table, { x: frame.x + 3, y: bodyBottom, w: frame.w - 6 - (side ? colW : 0), h: tableH }, tm * k, k));
  // Legend and notes tables placed on a plan sheet's layout, at their place over the drawing area (y down there).
  for (const pt of one?.tables ?? []) first.push(...placeSvg(pt.svg, { x: frame.x + 3 + pt.x, y: bodyTop - pt.y - pt.h, w: pt.w, h: pt.h }, pt.kind === 'notes' ? 'E-NOTES' : 'E-LEGEND', false).items);
  const hasContinuation = cursor < flow.length;
  const noticeH = hasContinuation ? Math.max(5, 4 * k) : 0;
  const drawing = legendSheet || !svg.trim() ? { items: [] as DxfPrimitive[] } : placeSvg(svg, { x: frame.x + 3, y: bodyBottom + noticeH + stripH + tableH, w: frame.w - 6 - (side ? colW : 0), h: bodyH - noticeH - stripH - tableH });
  first.push(...drawing.items);
  first.push(...markupDxf(one?.markups ?? [], h)); // after the drawing, so they sit on top
  if (drawing.items.some((p) => p.type === 'text' && p.text.trim() && p.height < 1.5)) warnings.push('Some diagram labels are smaller than 1.5 mm; use a larger paper size or split the drawing for readability.');
  if (hasContinuation) {
    const columns = Math.max(1, Math.floor((frame.w - 6) / colW));
    while (cursor < flow.length) {
      const page = base(), start = cursor;
      pages.push(page);
      for (let j = 0; j < columns && cursor < flow.length; j++) {
        const x = frame.x + 3 + j * colW;
        if (j) page.push({ type: 'line', layer: 'E-LEGEND', x1: x, y1: bodyBottom, x2: x, y2: bodyTop - noticeH });
        writeColumn(page, x, bodyTop - noticeH, bodyBottom);
      }
      if (cursor === start) throw new Error('The title block leaves too little space for notes and schedules. Choose a larger paper size.');
    }
    first.push(...textInBox('E-NOTES', { x: frame.x + 3, y: bodyBottom, w: frame.w - 6 - colW, h: noticeH }, `Additional information: ${pages.length - 1} continuation sheet${pages.length > 2 ? 's' : ''}`, Math.max(1.5, 1.9 * k)));
    pages.slice(1).forEach((page, i) => page.push(...textInBox('E-NOTES', { x: frame.x + 3, y: bodyTop - noticeH, w: frame.w - 6, h: noticeH }, `${t.number || 'SLD'} - CONTINUATION ${i + 1} OF ${pages.length - 1}`, headingCap)));
  }
  return { items: pages, warnings: [...new Set(warnings)] };
}

/** A sheet table (src/docs/sheetTable.ts) as lines and text: title and lines above, then the grid, from the top of
 * its box down. cap: the text height; k: the furniture scale. */
function tableDxf(t: SheetTable, box: DxfBox, cap: number, k: number): DxfPrimitive[] {
  const out: DxfPrimitive[] = [], layer = 'E-NOTES';
  const total = t.widths.reduce((a, b) => a + b, 0), widths = t.widths.map((w) => (w / total) * box.w);
  let y = box.y + box.h - 2 * k;
  out.push(...textInBox(layer, { x: box.x, y: y - TABLE_TITLE_MM * k, w: box.w, h: TABLE_TITLE_MM * k }, t.title, cap)); y -= TABLE_TITLE_MM * k;
  for (const l of t.lines) { out.push(...textInBox(layer, { x: box.x, y: y - TABLE_LINE_MM * k, w: box.w, h: TABLE_LINE_MM * k }, l, cap * 0.9)); y -= TABLE_LINE_MM * k; }
  const rh = TABLE_ROW_MM * (cap / (2.5 * k)) * k, rows = [t.head, ...t.rows, ...t.foot], top = y;
  rows.forEach((r) => {
    let x = box.x;
    r.forEach((v, i) => {
      if (v) out.push(...textInBox(layer, { x: x + 0.6 * k, y: y - rh + 0.4 * k, w: widths[i] - 1.2 * k, h: rh - 0.8 * k }, v, cap * 0.9, t.left.includes(i) ? 'left' : 'center'));
      x += widths[i];
    });
    y -= rh;
    out.push({ type: 'line', layer, x1: box.x, y1: y, x2: box.x + box.w, y2: y });
  });
  out.push({ type: 'line', layer, x1: box.x, y1: top, x2: box.x + box.w, y2: top });
  let x = box.x;
  for (const w of widths) { out.push({ type: 'line', layer, x1: x, y1: top, x2: x, y2: y }); x += w; }
  out.push({ type: 'line', layer, x1: box.x + box.w, y1: top, x2: box.x + box.w, y2: y });
  return out;
}

/** Frame, title block, notes and legend belong to no equipment: they are tagged with their sheet
 * ("sheet:1", …) so an update in CAD can refresh them too (revision, schedules). */
const sheetTagged = (items: DxfPrimitive[], index: number) => items.map((p) => (p.tag ? p : { ...p, tag: `sheet:${index}` }));

/** One portable DXF per paper sheet, suitable for ZIP export. */
export function buildSheetDxfPages(project: Project, svg: string, size: SheetSize, one?: SheetInfo): DxfSheetPage[] {
  const result = sheetPages(project, svg, size, one);
  return result.items.map((items, i) => ({ data: toDxf(sheetTagged(items, i + 1), SHEET_LAYERS), index: i + 1, count: result.items.length, continuation: i > 0, warnings: result.warnings }));
}

/** Compatibility API: a single DXF retains all continuation sheets arranged
 * side by side. User-facing exports use the individual paper sheets above. */
export function buildSheetDxf(project: Project, svg: string, size: SheetSize, one?: SheetInfo): string {
  const result = sheetPages(project, svg, size, one);
  return toDxf(result.items.flatMap((items, i) => sheetTagged(items, i + 1).map((p) => shift(p, i * (SHEET_MM[size].w + 20)))), SHEET_LAYERS);
}
