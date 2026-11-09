import { createRoot } from 'react-dom/client';
import { registerHtml, registerRows } from '../../docs/drawingRegister';
import { flushSync } from 'react-dom';
import type { Project } from '../../types';
import type { CalcRun } from '../../calc/runs';
import { evaluateProject } from '../../calc/electrical';
import { buildAnnotations, SHEET_LAYERS } from '../../diagram/annotations';
import { printableSvg } from '../../diagram/exportSvg';
import { autoSize, drawable, furnitureOf, LEGEND_RESERVE_MM, RISER_SIDE_MM, minMmPerPx, fromSheetLabels, scaleOn, sheetProject, sheetRev, type DrawingSet, type DrawingSheet, type SheetSize } from '../../model/drawingSet';
import { buildSldSheetHtml, legendColsFor, legendColumnFits, SIDE_MM, sideInnerMm, stripInnerMm, type SheetInfo } from '../../docs/sldSheet';
import { legendHeightMm, stringLegendSvg, stripColumns, type LegendItem } from '../../diagram/legendLayout';
import { legendEntries } from '../../diagram/IecSymbols';
import { RISER_LEGEND } from '../../diagram/RiserDiagram';
import { FEEDER_RISER_LEGEND } from '../../diagram/FeederRiserDiagram';
import { buildSheetDxfPages } from '../../docs/sheetDxf';
import { dxfExportNotice, namedDxfFiles, uniqueDxfFiles, type DxfFile } from '../../docs/dxfFiles';
import { currentRevision, revisionStamp } from '../../model/revisions';
import { cableRefsUsed } from '../../model/cableRefs';
import { safeFileName, saveBinary, savePdf } from '../../util/files';
import { SHEET_MM } from '../../docs/sldSheet';
import SystemDiagram, { LegendSvg } from '../SystemDiagram';
import { earthingDrawing } from '../../diagram/earthingDrawing';
import { earthFloorDrawing, earthRiserDrawing, earthSheetRefs } from '../../diagram/earthRiserDrawing';
import { dbRiserDrawing, dbRiserLegend, dbRiserSheetNos } from '../../diagram/dbRiserDrawing';
import { dbRiserLayout, dbRiserSummary } from '../../model/dbRiser';
import RiserDiagram, { RiserLegendSvg } from '../../diagram/RiserDiagram';
import { riserLayout } from '../../diagram/riserLayout';
import FeederRiserDiagram, { FeederRiserLegendSvg } from '../../diagram/FeederRiserDiagram';
import { feederRiserLayout } from '../../diagram/feederRiserLayout';
import { boardIncomerLabel, scheduleTable } from '../../docs/loadScheduleDoc';
import { tableHeightMm } from '../../docs/sheetTable';
import { abbreviationsIn } from '../../docs/sldNotes';
import SingleLineDiagram from '../SingleLineDiagram';
import { dxfToDwg } from '../../engines/cad/cadEngine';
import { planDrawing, planNotes, planScale } from '../../docs/planLayout';
import { readSheetRefs } from '../cad/refFiles';
import { diagramPenCss, inkOf, pensFor, plotOf, plotStamp } from '../../model/plotSetup';

const noop = () => {};

/** Draws one sheet off-screen and returns printable SVG with its size in px; a riser or earthing drawing whose legend
 * and notes the sheet's column takes (sheet furniture) returns them beside the SVG. */
export async function renderSheet(project: Project, set: DrawingSet, s: DrawingSheet, run?: CalcRun, cableRefs = false): Promise<{ svg: string; w: number; h: number; legendItems?: LegendItem[]; notes?: string[] } | undefined> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-30000px;top:0;width:2400px;height:1400px;pointer-events:none';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    if (s.kind === 'plan') { await readSheetRefs(project, s.buildingId, s.levelId); const d = planOf(project, set, s); return d && { svg: d.svg, w: SHEET_MM[d.size].w, h: SHEET_MM[d.size].h }; }
    const furniture = furnitureOf(set, s).riserFurniture === 'column' ? 'column' as const : undefined;
    if (s.kind === 'earthing') return earthingDrawing(project, undefined, true, { mono: true, furniture }); // printed sheet: black and white
    if (s.kind === 'earthRiser' || s.kind === 'earthFloor') {
      if (!s.buildingId) return undefined;
      const o = { mono: true, furniture, ...earthSheetRefs(project, set, s.buildingId) };
      return s.kind === 'earthRiser' ? earthRiserDrawing(project, s.buildingId, o, s.part ?? 0) : earthFloorDrawing(project, s.buildingId, o, s.part ?? 0);
    }
    if (s.kind === 'riser') {
      if (!s.buildingId) return undefined;
      if (s.riserStyle === 'byLevel') return dbRiserDrawing(project, s.buildingId, { sheetNos: dbRiserSheetNos(set, s.buildingId), furniture }, s.part ?? 0);
      flushSync(() => root.render(s.riserStyle === 'feeders' ? <FeederRiserDiagram project={project} buildingId={s.buildingId!} /> : <RiserDiagram project={project} buildingId={s.buildingId!} />));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const svg = host.querySelector<SVGSVGElement>('.sysdiag > svg');
      if (!svg) return undefined;
      const w = Number(svg.dataset.w), h = Number(svg.dataset.h);
      return { svg: printableSvg(svg, w, h), w, h };
    }
    if (s.kind === 'board') {
      const b = project.boards.find((x) => x.id === s.boards[0]);
      if (!b) return undefined;
      // Always the current design (a stored run may be older than the last edit).
      const results = evaluateProject(project).filter((r) => r.feeder.boardId === b.id);
      flushSync(() => root.render(<div className="sld-print"><SingleLineDiagram board={b} voltageV={project.voltageV} incomerLabel={boardIncomerLabel(project, b)} project={project} results={results} selected={null} onSelect={noop} /></div>));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const svg = host.querySelector<SVGSVGElement>('svg');
      if (!svg) return undefined;
      const [, , w, h] = (svg.getAttribute('viewBox') ?? '0 0 1000 345').split(' ').map(Number);
      return { svg: printableSvg(svg, w, h), w, h };
    }
    // Calculate the whole network (upstream voltage drop and source impedance
    // included), then draw only this sheet's panels with those results.
    const drawing = sheetProject(project, set, s);
    const full = evaluateProject(project);
    const onSheet = new Set(drawing.feeders.map((f) => f.id));
    const results = full.filter((r) => onSheet.has(r.feeder.id));
    flushSync(() => root.render(
      <SystemDiagram project={drawing} calcProject={drawing} results={results} annotations={buildAnnotations(project, full)} layers={s.tags ?? set.tags ?? SHEET_LAYERS} cableRefs={cableRefs} hideLegend clouds={s.clouds} arrows={s.arrows} anchors fromSheet={fromSheetLabels(project, set, s)}
        selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />
    ));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const svg = host.querySelector<SVGSVGElement>('.sysdiag > svg');
    if (!svg) return undefined;
    const w = Number(svg.dataset.w), h = Number(svg.dataset.h);
    return { svg: printableSvg(svg, w, h), w, h };
  } finally {
    root.unmount();
    host.remove();
  }
}


/** A plan sheet's drawing, its match lines naming the sheets of the level's other parts. */
const planOf = (project: Project, set: DrawingSet, s: DrawingSheet) => planDrawing(project, s, (part) =>
  set.sheets.find((x) => x.kind === 'plan' && x.plan === s.plan && x.buildingId === s.buildingId && x.levelId === s.levelId && (x.part ?? 0) === part)?.number);

/** Title block values of sheet i of the set. */
export const sheetInfo = (set: DrawingSet, s: DrawingSheet, i: number): SheetInfo => ({
  no: s.number, title: s.title, count: set.sheets.length, index: i + 1, status: s.status || set.status || undefined, kind: s.kind,
  rev: s.rev || undefined, date: s.date || undefined, drawnBy: s.drawnBy || undefined, checkedBy: s.checkedBy || undefined, approvedBy: s.approvedBy || undefined, scale: s.scale || undefined,
  history: s.history?.map((h) => ({ id: h.rev, date: h.date, description: h.description })),
  notes: s.notes?.filter((n) => n.trim())
});

/** The symbol legend of what's drawn on this sheet, as printable SVG drawn for the legend column's inner width (mm). */
async function legendOf(drawing: Project, widthMm: number, textMm?: number, cols = 1): Promise<string> {
  if (drawing.drawing?.symbols === 'simple' || drawing.drawing?.legend === false) return '';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<LegendSvg project={drawing} widthMm={widthMm} textMm={textMm} cols={cols} />));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const svg = host.querySelector<SVGSVGElement>('svg');
    return svg ? printableSvg(svg, Number(svg.dataset.w), Number(svg.dataset.h)) : '';
  } finally { root.unmount(); host.remove(); }
}

/** The riser symbols used on a building's riser sheet, as printable SVG drawn for the legend column's inner width (mm). */
async function riserLegendOf(project: Project, buildingId: string, feeders: boolean, widthMm: number, textMm?: number, cols = 1): Promise<string> {
  const used = feeders ? feederRiserLayout(project, buildingId).used : riserLayout(project, buildingId).used;
  if (!used.size) return '';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(feeders ? <FeederRiserLegendSvg used={used} widthMm={widthMm} textMm={textMm} cols={cols} /> : <RiserLegendSvg used={used} widthMm={widthMm} textMm={textMm} cols={cols} />));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const svg = host.querySelector<SVGSVGElement>('svg');
    return svg ? printableSvg(svg, Number(svg.dataset.w), Number(svg.dataset.h)) : '';
  } finally { root.unmount(); host.remove(); }
}

/** Cable text on a sheet: reference numbers (legend: CABLE SCHEDULE) when
 * chosen, or in Auto when the cable text would print smaller than ≈ 2.3 mm
 * (a large SLD squeezed onto the paper). */
export const REF_BELOW_MM_PER_PX = 0.25;
const reserveOf = (s: DrawingSheet) => (s.kind === 'board' ? 0 : s.kind === 'riser' && s.riserStyle === 'byLevel' ? RISER_SIDE_MM : LEGEND_RESERVE_MM);
/** The inner width of the sheet's legend column, which its legend is drawn for (labels at 2.5 mm). */
const legendColMm = (s: DrawingSheet) => sideInnerMm(s.kind === 'riser' && s.riserStyle === 'byLevel' ? RISER_SIDE_MM : undefined);
/** The labels of a sheet's legend, for its height before it is drawn (the DB riser's legend keeps its own column). */
function legendLabels(project: Project, set: DrawingSet, s: DrawingSheet): string[] {
  if (s.kind === 'system') return project.drawing?.symbols === 'simple' || project.drawing?.legend === false ? [] : legendEntries(sheetProject(project, set, s)).map((e) => e.label);
  if (s.kind === 'riser' && s.buildingId && s.riserStyle !== 'byLevel') {
    const used = s.riserStyle === 'feeders' ? feederRiserLayout(project, s.buildingId).used : riserLayout(project, s.buildingId).used;
    return (s.riserStyle === 'feeders' ? FEEDER_RISER_LEGEND : RISER_LEGEND).filter((e) => used.has(e.key)).map((e) => e.label);
  }
  return [];
}

/** The finished sheet (frame, drawing, title block) as HTML, with its size.
 * withLegend: show the CABLE SCHEDULE even if this sheet itself has full
 * cable text (another sheet of the set uses numbers). */
export async function sheetHtml(project: Project, set: DrawingSet, s: DrawingSheet, run?: CalcRun, withLegend = false, withMarkups = true): Promise<{ html: string; size: SheetSize; fits: boolean; columnFits: boolean; refs: boolean; svg: string; legendSvg: string; info?: SheetInfo } | undefined> {
  if (s.kind === 'plan') {
    // Drawn at its scale on the paper it needs (or the chosen one).
    const d = planOf(project, set, s);
    if (!d) return undefined;
    return { html: sheetHtmlFrom(project, set, s, d.svg, d.size, false, d.legendSvg, withMarkups), size: d.size, fits: true, columnFits: true, refs: false, svg: d.svg, legendSvg: d.legendSvg };
  }
  const fz = furnitureOf(set, s), min = minMmPerPx(fz), tm = fz.textMm;
  if (s.kind === 'legend') {
    // The set's legend sheet: every symbol of the project's SLD across the sheet, the abbreviations of the whole SLD,
    // the general notes; A3 unless chosen, A2 when the legend would take more than half of A3.
    const whole = { ...s, kind: 'system' as const, boards: project.boards.map((b) => b.id) };
    const drawn = await renderSheet(project, set, whole, run, false);
    const abbr = project.drawing?.abbreviations === false ? [] : abbreviationsIn(drawn?.svg ?? '');
    const labels = legendLabels(project, set, whole);
    const innerOf = (size: SheetSize) => SHEET_MM[size].w - 30 - 6 - 4;
    const tall = legendHeightMm(labels, innerOf('A3'), tm, stripColumns(innerOf('A3'))) > 0.5 * (SHEET_MM.A3.h - 70);
    const size: SheetSize = s.size === 'auto' ? (tall ? 'A2' : 'A3') : s.size;
    const legendSvg = labels.length ? await legendOf(project, innerOf(size), tm, stripColumns(innerOf(size))) : '';
    const info = fullSheetInfo(project, set, s, false, legendSvg, withMarkups);
    info.legendSheet = true; info.abbreviations = abbr;
    return { html: buildSldSheetHtml(project, '', size, info), size, fits: true, columnFits: true, refs: false, svg: '', legendSvg, info };
  }
  const mode = s.cableLabels ?? project.drawing?.cableLabels ?? 'auto';
  let refs = mode === 'ref' && s.kind === 'system';
  let r = await renderSheet(project, set, s, run, refs);
  if (!r) return undefined;
  // With a legend sheet in the set, the SLD and board sheets refer to it instead of carrying a legend and abbreviations.
  const legendSheet = s.kind === 'system' || s.kind === 'board' ? set.sheets.find((x) => x.kind === 'legend') : undefined;
  // A board sheet's load schedule under its diagram takes room from the drawing's height.
  const table = s.kind === 'board' && s.schedule && s.boards[0] && project.boards.some((b) => b.id === s.boards[0]) ? scheduleTable(project, s.boards[0]) : undefined;
  // The legend's place: a strip along the foot of the drawing area takes room from its height (as high as the legend
  // is on A3's width; a wider paper makes it shorter), two columns in the right column take room from its width.
  const labels = legendSheet ? [] : r.legendItems ? r.legendItems.map((e) => e.label) : legendLabels(project, set, s);
  const strip = fz.legendPlace === 'strip' && labels.length > 0;
  const reserveH = (strip ? legendHeightMm(labels, stripInnerMm('A3'), tm, stripColumns(stripInnerMm('A3'))) + 6 : 0) + (table ? tableHeightMm(table, tm) + 2 : 0);
  let a = autoSize(r.w, r.h, reserveOf(s), min, reserveH);
  let size = s.size === 'auto' ? a.size : s.size;
  const cols = strip ? 1 : legendColsFor(fz, size, labels);
  let reserveW = reserveOf(s);
  if (cols === 2) { reserveW += SIDE_MM; a = autoSize(r.w, r.h, reserveW, min); size = s.size === 'auto' ? a.size : s.size; }
  if (mode === 'auto' && s.kind === 'system' && (!a.fits || scaleOn(size, r.w, r.h, reserveW, reserveH) < REF_BELOW_MM_PER_PX)) {
    refs = true;
    r = (await renderSheet(project, set, s, run, true)) ?? r;
  }
  const colMm = strip ? stripInnerMm(size) : cols === 2 ? sideInnerMm(2 * SIDE_MM) : legendColMm(s), drawCols = strip ? stripColumns(colMm) : cols;
  const legendSvg = legendSheet ? '' : r.legendItems ? stringLegendSvg(r.legendItems, colMm, tm, drawCols) : s.kind === 'system' ? await legendOf(sheetProject(project, set, s), colMm, tm, drawCols) : s.kind === 'riser' && s.riserStyle === 'byLevel' && s.buildingId ? (project.drawing?.legend === false ? '' : dbRiserLegend(dbRiserLayout({ ...project, drawingSet: set }, s.buildingId), s.part ?? 0, colMm, tm)) : s.kind === 'riser' && s.buildingId ? await riserLegendOf(project, s.buildingId, s.riserStyle === 'feeders', colMm, tm, drawCols) : '';
  const info = fullSheetInfo(project, set, s, refs || withLegend, legendSvg, withMarkups);
  if (strip && legendSvg) info.legendStrip = true;
  if (cols === 2 && legendSvg) info.sideMm = 2 * SIDE_MM;
  // A drawing's notes handed to the sheet print first in its NOTES box, in the column unless the notes have a place.
  if (r.notes?.length) { info.notes = [...r.notes, ...(info.notes ?? [])]; if (!fz.notesPlace) info.furniture = { ...(info.furniture ?? {}), notesPlace: 'column' }; }
  if (legendSheet) { info.abbreviations = []; info.notes = [`LEGEND AND ABBREVIATIONS: SEE ${legendSheet.number}`, ...(info.notes ?? [])]; }
  if (table) info.table = table;
  const html = buildSldSheetHtml(project, r.svg, size, info);
  // Readable on the paper actually used (a chosen A3 can be too small too); and the legend column holds its contents.
  return { html, size, fits: scaleOn(size, r.w, r.h, reserveW, reserveH) >= min, columnFits: legendColumnFits(project, r.svg, size, info), refs, svg: r.svg, legendSvg, info };
}

/** Sheet HTML from a drawn SVG (legend: every cable number used in the set). */
export function sheetHtmlFrom(project: Project, set: DrawingSet, s: DrawingSheet, svg: string, size: SheetSize, legend: boolean, legendSvg = '', withMarkups = true): string {
  return buildSldSheetHtml(project, svg, size, fullSheetInfo(project, set, s, legend, legendSvg, withMarkups));
}

/** Title block values, legend and cable schedule of one sheet (PDF and DXF). */
export function fullSheetInfo(project: Project, set: DrawingSet, s: DrawingSheet, legend: boolean, legendSvg = '', withMarkups = true): SheetInfo {
  const info: SheetInfo = { ...sheetInfo(set, s, set.sheets.indexOf(s)), legendSvg, ...(withMarkups && s.markups?.length ? { markups: s.markups } : {}) };
  const fz = furnitureOf(set, s);
  if (Object.keys(fz).length) info.furniture = fz;
  if (s.kind === 'riser' && s.riserStyle === 'byLevel' && s.buildingId) { const L = dbRiserLayout({ ...project, drawingSet: set }, s.buildingId); info.sideMm = RISER_SIDE_MM; if (!L.empty) info.summary = dbRiserSummary(L); }
  if (s.kind === 'plan') { info.notes = [...planNotes(project, s), ...(info.notes ?? [])]; info.scale = `1:${planScale(s.scale)}`; }
  // Pens and plot stamp of the sheet's page setup; nothing changes with the default pens and no stamp.
  const pens = pensFor(project, s), setup = plotOf(project, s);
  const css = s.kind === 'plan' ? '' : diagramPenCss(pens);
  const plot = {
    ...(pens.frame.w !== 0.7 ? { frame: pens.frame.w } : {}), ...(pens.title.w !== 0.25 ? { lines: pens.title.w } : {}), ...(pens.frame.grey < 100 ? { ink: inkOf(pens.frame) } : {}),
    ...(css ? { css } : {}), ...(setup.stamp ? { stamp: plotStamp(s, s.rev || sheetRev(s) || undefined, project.drawing?.drawnBy || s.drawnBy || undefined) } : {})
  };
  if (Object.keys(plot).length) info.plot = plot;
  if (legend) info.cables = setCables(project, set);
  return info;
}
/** The CABLE SCHEDULE of the set: every cable number used on its SLD sheets. */
function setCables(project: Project, set: DrawingSet) {
  const boards = new Set(set.sheets.flatMap((x) => (x.kind === 'system' ? x.boards : [])));
  return cableRefsUsed(project, project.feeders.filter((f) => boards.has(f.boardId)));
}
/** A prepared sheet's title block values, legend and furniture as it was laid out, with the set's cable schedule when
 * asked (another sheet uses cable numbers). */
function infoOf(project: Project, set: DrawingSet, p: PreparedSheet, legend: boolean): SheetInfo {
  const info = p.info ? { ...p.info } : fullSheetInfo(project, set, p.s, legend, p.legendSvg);
  if (legend && !info.cables) info.cables = setCables(project, set);
  return info;
}

/** The sheets as DXF files (real paper size in mm, frame, title block,
 * legend column, layers): one file, or a ZIP of all when several. */
export async function dxfFiles(project: Project, set: DrawingSet, run: CalcRun | undefined, only?: string[]): Promise<DxfFile[]> {
  return dxfOf(project, set, await prepareSheets(project, set, run, only));
}

/** DXF files of prepared sheets (same cable-schedule rule as the PDFs). */
export function dxfOf(project: Project, set: DrawingSet, pages: PreparedSheet[]): DxfFile[] {
  const anyRefs = pages.some((p) => p.refs);
  return uniqueDxfFiles(pages.flatMap((p) => namedDxfFiles(
    safeFileName(`${p.s.number}${p.s.rev || sheetRev(p.s) ? `_Rev${p.s.rev || sheetRev(p.s)}` : ''}`),
    buildSheetDxfPages(project, p.svg, p.size, infoOf(project, set, p, anyRefs && p.s.kind === 'system'))
  )));
}

export async function exportSheetsDxf(project: Project, set: DrawingSet, run: CalcRun | undefined, onStatus: (m: string) => void, only?: string[]): Promise<void> {
  try {
    const files = await dxfFiles(project, set, run, only);
    if (!files.length) { onStatus('No sheets to export'); return; }
    const notice = dxfExportNotice(files);
    if (files.length === 1) {
      const m = await saveBinary(files[0].name, new TextEncoder().encode(files[0].data), 'DXF', 'dxf', 'application/dxf');
      if (m) onStatus(`${m}${notice ? ` — ${notice}` : ''}`);
      return;
    }
    const zip = new (await import('jszip')).default();
    for (const f of files) zip.file(f.name, f.data);
    const m = await saveBinary(`${safeFileName(`${project.name} drawings DXF`)}.zip`, await zip.generateAsync({ type: 'uint8array' }), 'ZIP', 'zip', 'application/zip');
    if (m) onStatus(`${m} — ${files.length} DXF sheets${notice ? ` — ${notice}` : ''}`);
  } catch (e) {
    onStatus(`DXF export failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The sheets as DWG (2018 format, by the Design CAD engine): the DXF sheets, each saved as DWG; a ZIP when several. */
export async function exportSheetsDwg(project: Project, set: DrawingSet, run: CalcRun | undefined, onStatus: (m: string) => void, only?: string[]): Promise<void> {
  try {
    const files = await dxfFiles(project, set, run, only);
    if (!files.length) { onStatus('No sheets to export'); return; }
    const dwg = await Promise.all(files.map(async (f) => ({ name: f.name.replace(/\.dxf$/i, '.dwg'), data: await dxfToDwg(f.data) })));
    const notice = dxfExportNotice(files);
    if (dwg.length === 1) {
      const m = await saveBinary(dwg[0].name, dwg[0].data, 'DWG drawing (2018 format)', 'dwg', 'application/acad');
      if (m) onStatus(`${m}${notice ? ` — ${notice}` : ''}`);
      return;
    }
    const zip = new (await import('jszip')).default();
    for (const f of dwg) zip.file(f.name, f.data);
    const m = await saveBinary(`${safeFileName(`${project.name} drawings DWG`)}.zip`, await zip.generateAsync({ type: 'uint8array' }), 'ZIP', 'zip', 'application/zip');
    if (m) onStatus(`${m} — ${dwg.length} DWG sheets${notice ? ` — ${notice}` : ''}`);
  } catch (e) {
    onStatus(`DWG export failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Everything for a submission in one ZIP: the set as one PDF (desktop),
 * a DXF per sheet, and the drawing register (Excel). */
export async function exportEverythingZip(project: Project, set: DrawingSet, run: CalcRun | undefined, onStatus: (m: string) => void): Promise<void> {
  try {
    const zip = new (await import('jszip')).default();
    const pages = await prepareSheets(project, set, run);
    const dxf = dxfOf(project, set, pages);
    for (const f of dxf) zip.file(`DXF/${f.name}`, f.data);
    const toBytes = window.lvds?.files?.pdfBytes;
    if (toBytes) {
      const parts: Uint8Array[] = [], titles: string[] = [];
      const rev = currentRevision(project);
      if (set.register) { parts.push(await toBytes({ html: registerHtml(project, registerRows(set, [], rev?.id), rev?.id ?? '—', rev?.date ?? new Date().toISOString().slice(0, 10), set.issues, project.drawing?.company ?? project.info?.consultant ?? ''), cssPages: true })); titles.push('Drawing register'); }
      for (const p of pages) {
        const one = await toBytes({ html: p.html, cssPages: true });
        parts.push(one); titles.push(`${p.s.number}  ${p.s.title}`);
        zip.file(`PDF/${safeFileName(`${p.s.number}${p.s.rev ? `_Rev${p.s.rev}` : ''}`)}.pdf`, one);
      }
      zip.file(`${safeFileName(`${project.name} drawing set`)}.pdf`, await (await import('../../docs/mergePdf')).mergePdfs(parts, `${project.name} · drawings · ${revisionStamp(project)}`, titles));
    }
    zip.file(`${safeFileName(`${project.name} drawing register`)}.xlsx`, await (await import('../../docs/formWorkbook')).workbookBytes((await import('../../docs/registerWorkbook')).buildRegisterWorkbook(project, set)));
    const m = await saveBinary(`${safeFileName(`${project.name} drawings`)}.zip`, await zip.generateAsync({ type: 'uint8array' }), 'ZIP', 'zip', 'application/zip');
    const notice = dxfExportNotice(dxf);
    if (m) onStatus(`${m} — ${dxf.length} DXF${toBytes ? ' + PDFs' : ' (PDFs need the desktop app)'} + register${notice ? ` — ${notice}` : ''}`);
  } catch (e) {
    onStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Every sheet as one PDF (register first, when on) or a PDF per sheet. */
export interface PreparedSheet { s: DrawingSheet; html: string; size: SheetSize; fits: boolean; columnFits: boolean; refs: boolean; svg: string; legendSvg: string; /** As laid out by sheetHtml (legend place, column width, drawing notes). */ info?: SheetInfo }
/** The sheets as they print, for every export (one PDF, PDF per sheet, DXF,
 * ZIP): drawn from the current design, and when any sheet uses cable
 * numbers the CABLE SCHEDULE goes on every SLD sheet. */
export async function prepareSheets(project: Project, set: DrawingSet, run?: CalcRun, only?: string[]): Promise<PreparedSheet[]> {
  const pages: PreparedSheet[] = [];
  for (const s of set.sheets) {
    if (!drawable(s) || (only && !only.includes(s.id))) continue;
    const r = await sheetHtml(project, set, s, run);
    if (r) pages.push({ s, ...r });
  }
  if (pages.some((p) => p.refs)) for (const p of pages) if (!p.refs && p.s.kind === 'system') p.html = buildSldSheetHtml(project, p.svg, p.size, infoOf(project, set, p, true));
  return pages;
}

/** The drawing set as PDF parts — the drawing register (when the set has one) and every drawable sheet, built from
 * the given calculation run — with a title for each part. Shared by Export set and the issue package, so both hold
 * exactly the same drawings. */
export async function drawingSetPdfParts(project: Project, set: DrawingSet, run: CalcRun | undefined, toBytes: (o: { html: string; cssPages?: boolean }) => Promise<Uint8Array>, only?: string[], withRegister = !only, prepare = prepareSheets): Promise<{ parts: Uint8Array[]; titles: string[]; sheets: number; register: boolean }> {
  const rev = currentRevision(project);
  const pages = await prepare(project, set, run, only);
  const parts: Uint8Array[] = [];
  const reg = !!set.register && withRegister && pages.length > 0;
  if (reg) {
    const sizes = pages.map((p) => [p.s.id, p.size] as [string, string]);
    const rows = registerRows(only ? { ...set, sheets: set.sheets.filter((s) => only.includes(s.id)) } : set, sizes, rev?.id);
    parts.push(await toBytes({ html: registerHtml(project, rows, rev?.id ?? '—', rev?.date ?? new Date().toISOString().slice(0, 10), set.issues, project.drawing?.company ?? project.info?.consultant ?? ''), cssPages: true }));
  }
  for (const p of pages) parts.push(await toBytes({ html: p.html, cssPages: true }));
  const titles = [...(reg ? ['Drawing register'] : []), ...pages.map((p) => `${p.s.number}  ${p.s.title}`)];
  return { parts, titles, sheets: pages.length, register: reg };
}

export async function exportDrawingSet(project: Project, set: DrawingSet, run: CalcRun | undefined, each: boolean, onStatus: (m: string) => void, only?: string[], withRegister = !only): Promise<void> {
  try {
    const toBytes = window.lvds?.files?.pdfBytes;
    if (each || !toBytes) {
      const pages = await prepareSheets(project, set, run, only);
      let n = 0;
      for (const p of pages) if (await savePdf(`${safeFileName(`${p.s.number} ${p.s.title}`)}.pdf`, p.html, { pageSize: p.size, landscape: true })) n++;
      onStatus(`Saved ${n} of ${pages.length} sheets${!toBytes && !each ? ' (one PDF per sheet — the combined set needs the desktop app)' : ''}`);
      return;
    }
    const d = await renderDrawingSetPdf(project, set, run, toBytes, only, withRegister);
    const m = await saveBinary(d.name, d.bytes, 'PDF', 'pdf', 'application/pdf');
    if (m) onStatus(`${m} — ${d.sheets} sheets${d.register ? ' + register' : ''}`);
  } catch (e) {
    onStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The sheets sent to a printer (Output → Plot, Batch plot), each on its own paper size, in the set's order. */
export async function printSheets(project: Project, set: DrawingSet, run: CalcRun | undefined, only: string[], deviceName: string, copies: number, onStatus: (m: string) => void): Promise<void> {
  const print = window.lvds?.files?.printHtml;
  if (!print) { onStatus('Printing needs the desktop app — plot to PDF instead'); return; }
  try {
    const pages = await prepareSheets(project, set, run, only);
    for (const p of pages) await print({ html: p.html, deviceName, copies, pageSize: p.size, landscape: p.size !== 'A3 portrait' });
    onStatus(`Sent ${pages.length} sheet${pages.length === 1 ? '' : 's'} to ${deviceName}${copies > 1 ? `, ${copies} copies` : ''}`);
  } catch (e) {
    onStatus(`Printing failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function renderDrawingSetPdf(project: Project, set: DrawingSet, run: CalcRun | undefined, toBytes: Parameters<typeof drawingSetPdfParts>[3], only?: string[], withRegister = !only) {
  const { parts, titles, sheets, register } = await drawingSetPdfParts(project, set, run, toBytes, only, withRegister);
  const bytes = await (await import('../../docs/mergePdf')).mergePdfs(parts, `${project.name} · SLD set · ${revisionStamp(project)}`, titles);
  return { bytes, name: `${safeFileName(`${project.name} SLD drawing set`)}.pdf`, sheets, register };
}

export { registerRows };

/** The finished sheet, scaled to fit the dialog. */
export function SheetPreview({ html, size }: { html: string; size: SheetSize }) {
  const { w, h } = SHEET_MM[size];
  const pxW = w * 3.78, pxH = h * 3.78;
  const scale = Math.min(1, 1100 / pxW, 600 / pxH);
  return (
    <div className="ds-sheet" style={{ width: pxW * scale, height: pxH * scale }}>
      <iframe title="Sheet preview" srcDoc={html} sandbox="" style={{ width: pxW, height: pxH, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0, background: '#fff' }} />
    </div>
  );
}
