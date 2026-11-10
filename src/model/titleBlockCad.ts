import type { Project, SketchItem } from '../types';
import { toDxf, type DxfPrimitive } from '../docs/dxf';
import { sketchOf, withSketchItems } from './cadSketch';
import { withLayerStyle } from './cadLayerStyle';
import { withCurrentLayer, withNewLayer } from './cadLayerState';
import { detectArea, isBorder, isDrawn, PAPER_MM, templateSize, type DrawnShape, type DrawnText, type TitleTemplate } from './titleBlock';
import { fitTexts, SHEET_FIELDS } from './titleBlockImport';

/** A title block edited in Design CAD: the template opens as a drawing of its own at 1 : 1 mm, an A3 frame as the
 * reference (the file's own lines), the block's lines and texts as the app's drawn objects on the TB layers so every
 * draw and modify tool works on them; a field is a text that holds a {Field}. Save as template (TBSAVE) turns the
 * drawn objects back into the template. */

export const TB_LAYERS = { frame: 'TB-FRAME', grid: 'TB-GRID', text: 'TB-TEXT', field: 'TB-FIELD', ref: 'TB-REF' } as const;
/** The A3 frame (390 × 277 mm inside the sheet's margins) the block is shown in; it sits in the bottom right corner. */
export const TB_FRAME = { w: 390, h: 277 };
/** The fields a placed text may hold, beside every project parameter. */
export const TB_FIELDS = [...SHEET_FIELDS, '{Project}', '{Owner}', '{Company}', '{Contractor}', '{Plot}', '{Area}', '{Discipline}', '{Voltage}', '{Frequency}'];
const FIELD = /\{[^}]+\}/;

export const tbFile = (t: Pick<TitleTemplate, 'id'>) => `Title block ${t.id}.dxf`;
export const tbIdOf = (file?: string) => file?.match(/^Title block (.+)\.dxf$/i)?.[1];
export const isTbFile = (file?: string) => !!tbIdOf(file);

/** The drawing the block is edited in, in millimetres: the A3 frame on TB-REF; for a whole border, its paper's outline
 * (the border is its own frame; the dashed rectangle on TB-REF, a drawn object, is its drawing area). */
export function tbDrawingDxf(t?: TitleTemplate): string {
  const paper = t && isBorder(t) ? PAPER_MM[t.border.paper] : undefined;
  const items: DxfPrimitive[] = paper ? [
    { type: 'polyline', layer: TB_LAYERS.ref, closed: true, points: [[0, 0], [paper.w, 0], [paper.w, paper.h], [0, paper.h]] },
    { type: 'text', layer: TB_LAYERS.ref, x: 3, y: paper.h - 6, height: 2.5, text: `${t!.border!.paper.toUpperCase()} PAPER (${paper.w} x ${paper.h} mm) - THE DASHED RECTANGLE ON TB-REF IS THE DRAWING AREA: MOVE OR STRETCH IT` }
  ] : [
    { type: 'polyline', layer: TB_LAYERS.ref, closed: true, points: [[0, 0], [TB_FRAME.w, 0], [TB_FRAME.w, TB_FRAME.h], [0, TB_FRAME.h]] },
    { type: 'text', layer: TB_LAYERS.ref, x: 3, y: TB_FRAME.h - 6, height: 2.5, text: 'A3 FRAME (390 x 277 mm) - FOR REFERENCE: THE TITLE BLOCK SITS IN ITS BOTTOM RIGHT CORNER' }
  ];
  return toDxf(items, { [TB_LAYERS.ref]: 8 }, { insunits: 4 });
}

/** A grid template (the standard block included) as a drawn one: its cell borders as lines (each once), its captions and
 * texts as texts, a logo cell as the word LOGO. The revision table has no place in a drawn block (it stands beside it). */
export function gridToDrawn(t: TitleTemplate): TitleTemplate {
  const xs = [0], ys = [0];
  for (const c of t.cols) xs.push(xs[xs.length - 1] + c);
  for (const r of t.rows) ys.push(ys[ys.length - 1] + r);
  const edges = new Map<string, DrawnShape>();
  const edge = (x1: number, y1: number, x2: number, y2: number) => { const k = [x1, y1, x2, y2].map((v) => v.toFixed(2)).join(); if (!edges.has(k)) edges.set(k, { kind: 'line', x1, y1, x2, y2 }); };
  const texts: DrawnText[] = [];
  let n = 0;
  for (const c of t.cells) {
    const rs = c.rs ?? 1, cs = c.cs ?? 1;
    const x0 = xs[c.c], x1 = xs[Math.min(c.c + cs, xs.length - 1)], y0 = ys[c.r], y1 = ys[Math.min(c.r + rs, ys.length - 1)];
    edge(x0, y0, x1, y0); edge(x1, y0, x1, y1); edge(x0, y1, x1, y1); edge(x0, y0, x0, y1);
    let y = y0 + 0.6;
    if (c.caption) { texts.push({ id: `t${++n}`, x: x0 + 1.2, y: y + 1.4, h: 1.4, text: c.caption.toUpperCase() }); y += 2.4; }
    if (c.kind === 'logo') texts.push({ id: `t${++n}`, x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 1.2, h: 2.5, align: 'center', text: 'LOGO' });
    else if (c.kind === 'text' && c.text.trim()) {
      const h = +((c.size ?? 8) * 0.254).toFixed(2); // pt → cap height (mm)
      c.text.split('\n').forEach((line, i) => texts.push({ id: `t${++n}`, x: c.align === 'center' ? (x0 + x1) / 2 : c.align === 'right' ? x1 - 1.2 : x0 + 1.2, y: y + h + i * h * 1.4, h, ...(c.align && c.align !== 'left' ? { align: c.align } : {}), ...(c.bold ? { bold: true } : {}), text: line }));
    }
  }
  const size = templateSize(t);
  return { ...t, kind: 'drawn', cols: [], rows: [], cells: [], size, shapes: [...edges.values()], texts: fitTexts([...edges.values()], texts, size.w) };
}

/** The block's shapes and texts as the app's drawn objects in the drawing (mm, y up), in the frame's bottom right corner
 * (a whole border at the paper's origin, its drawing area a dashed rectangle on TB-REF): the outline on TB-FRAME, the
 * rest on TB-GRID, fields on TB-FIELD, other texts on TB-TEXT. */
export function tbSketchItems(t: TitleTemplate, firstId = 1): SketchItem[] {
  const { w, h } = templateSize(t);
  const ox = isBorder(t) ? 0 : TB_FRAME.w - w;
  const X = (x: number) => +(ox + x).toFixed(3), Y = (y: number) => +(h - y).toFixed(3);
  const onEdge = (a: [number, number], b: [number, number]) => (Math.abs(a[0] - b[0]) < 0.05 && (Math.abs(a[0]) < 0.05 || Math.abs(a[0] - w) < 0.05)) || (Math.abs(a[1] - b[1]) < 0.05 && (Math.abs(a[1]) < 0.05 || Math.abs(a[1] - h) < 0.05));
  let n = firstId;
  const id = () => `S${n++}`;
  const items: SketchItem[] = [];
  for (const s of t.shapes ?? []) {
    const own = s.w && s.w !== 0.25 ? { lw: s.w } : {};
    if (s.kind === 'line') items.push({ id: id(), kind: 'line', layer: onEdge([s.x1, s.y1], [s.x2, s.y2]) ? TB_LAYERS.frame : TB_LAYERS.grid, pts: [[X(s.x1), Y(s.y1)], [X(s.x2), Y(s.y2)]], ...own });
    else if (s.kind === 'circle') items.push({ id: id(), kind: 'circle', layer: TB_LAYERS.grid, pts: [[X(s.cx), Y(s.cy)]], r: s.r, ...own });
    else if (s.pts.length >= 2) items.push({ id: id(), kind: 'pline', layer: TB_LAYERS.grid, pts: s.pts.map(([x, y]) => [X(x), Y(y)] as [number, number]), ...(s.closed || s.fill ? { closed: true } : {}), ...own });
  }
  for (const x of t.texts ?? []) {
    items.push({ id: id(), kind: 'text', layer: FIELD.test(x.text) ? TB_LAYERS.field : TB_LAYERS.text, pts: [[X(x.x), Y(x.y)]], text: x.text, h: x.h, ...(x.rot ? { rot: (x.rot * Math.PI) / 180 } : {}), just: x.align === 'center' ? 'C' : x.align === 'right' ? 'R' : 'L' });
  }
  if (isBorder(t)) { const a = t.border.area; items.push({ id: id(), kind: 'pline', layer: TB_LAYERS.ref, closed: true, lt: 'dashed', pts: [[X(a.x), Y(a.y)], [X(a.x + a.w), Y(a.y)], [X(a.x + a.w), Y(a.y + a.h)], [X(a.x), Y(a.y + a.h)]] }); }
  return items;
}

/** Opens a template for editing in Design CAD: a drawn copy of a grid template (the standard block included) is made first.
 * Answers the project with the drawing's objects and TB layers seeded, the drawing's file name and its DXF. */
export function openTitleBlockInCad(p: Project, t: TitleTemplate): { project: Project; file: string; dxf: string; template: TitleTemplate } {
  let project = p, template = t;
  if (!isDrawn(t)) {
    template = { ...gridToDrawn(t), id: `tb-${Date.now().toString(36)}`, name: `${t.name} (CAD)` };
    project = { ...p, titleTemplates: [...(p.titleTemplates ?? []), template] };
  }
  const file = tbFile(template);
  const first = (project.cadSketch ?? []).flatMap((s) => s.items).reduce((m, it) => Math.max(m, Number(/^S(\d+)$/.exec(it.id)?.[1] ?? 0)), 0) + 1;
  project = withSketchItems(project, file, tbSketchItems(template, first));
  for (const layer of [TB_LAYERS.frame, TB_LAYERS.grid, TB_LAYERS.text, TB_LAYERS.field, ...(isBorder(template) ? [TB_LAYERS.ref] : [])]) project = withNewLayer(project, file, layer);
  if (isBorder(template)) project = withLayerStyle(project, file, TB_LAYERS.ref, { color: '8', lt: 'dashed' });
  project = withLayerStyle(project, file, TB_LAYERS.frame, { lw: 0.5 });
  project = withLayerStyle(project, file, TB_LAYERS.grid, { lw: 0.25 });
  project = withLayerStyle(project, file, TB_LAYERS.field, { color: '4' }); // index colour 4 (cyan) marks the fields on screen; prints stay black
  project = withCurrentLayer(project, file, TB_LAYERS.grid);
  return { project, file, dxf: tbDrawingDxf(template), template };
}

/** The drawing's objects back as the template: its size from their extents (a whole border keeps its paper and origin,
 * and takes its drawing area from the rectangle on TB-REF, or finds it again), lines, polylines, circles and arcs (as
 * polylines) as shapes with their own lineweights, texts as texts, a text holding a {Field} as a field (its tag kept
 * when the template had it). Dimensions, leaders and the TB-REF layer are left out. */
export function drawnFromSketch(items: SketchItem[], t: TitleTemplate): TitleTemplate {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (x: number, y: number) => { box.minX = Math.min(box.minX, x); box.minY = Math.min(box.minY, y); box.maxX = Math.max(box.maxX, x); box.maxY = Math.max(box.maxY, y); };
  const arcPts = (c: [number, number], r: number, a0: number, a1: number): [number, number][] => {
    let sweep = a1 - a0; while (sweep <= 0) sweep += 2 * Math.PI;
    const k = Math.max(4, Math.ceil(sweep / (Math.PI / 12)));
    return Array.from({ length: k + 1 }, (_, i) => { const a = a0 + (sweep * i) / k; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as [number, number]; });
  };
  const isRef = (it: SketchItem) => it.layer.toLowerCase() === TB_LAYERS.ref.toLowerCase();
  const drawn = items.filter((it) => !it.cable && !it.tray && !isRef(it) && (it.kind === 'line' || it.kind === 'pline' || it.kind === 'circle' || it.kind === 'arc' || it.kind === 'text'));
  for (const it of drawn) {
    if (it.kind === 'circle') { grow(it.pts[0][0] - (it.r ?? 0), it.pts[0][1] - (it.r ?? 0)); grow(it.pts[0][0] + (it.r ?? 0), it.pts[0][1] + (it.r ?? 0)); }
    else if (it.kind === 'arc') for (const [x, y] of arcPts(it.pts[0], it.r ?? 0, it.a0 ?? 0, it.a1 ?? 0)) grow(x, y);
    else for (const [x, y] of it.pts) grow(x, y);
  }
  if (!Number.isFinite(box.minX)) throw new Error('The drawing has no objects to save as the title block.');
  const paper = isBorder(t) ? PAPER_MM[t.border.paper] : undefined;
  if (paper) { box.minX = 0; box.maxY = paper.h; box.maxX = paper.w; box.minY = 0; }
  const X = (x: number) => +(x - box.minX).toFixed(3), Y = (y: number) => +(box.maxY - y).toFixed(3);
  const shapes: DrawnShape[] = [], texts: DrawnText[] = [];
  const tagOf = new Map((t.texts ?? []).filter((x) => x.tag).map((x) => [x.text, x.tag!]));
  let n = 0;
  for (const it of drawn) {
    const w = it.lw && it.lw !== 0.25 ? { w: it.lw } : {};
    if (it.kind === 'line') shapes.push({ kind: 'line', x1: X(it.pts[0][0]), y1: Y(it.pts[0][1]), x2: X(it.pts[1][0]), y2: Y(it.pts[1][1]), ...w });
    else if (it.kind === 'circle') shapes.push({ kind: 'circle', cx: X(it.pts[0][0]), cy: Y(it.pts[0][1]), r: +(it.r ?? 0).toFixed(3), ...w });
    else if (it.kind === 'arc') shapes.push({ kind: 'poly', pts: arcPts(it.pts[0], it.r ?? 0, it.a0 ?? 0, it.a1 ?? 0).map(([x, y]) => [X(x), Y(y)] as [number, number]), ...w });
    else if (it.kind === 'pline') shapes.push({ kind: 'poly', pts: it.pts.map(([x, y]) => [X(x), Y(y)] as [number, number]), ...(it.closed ? { closed: true } : {}), ...(it.hatch ? { fill: true } : {}), ...w });
    else if (it.text?.trim()) {
      const j = it.just ?? 'L', align = /C$/.test(j) ? 'center' as const : /R$/.test(j) ? 'right' as const : 'left' as const;
      const rot = it.rot ? +((it.rot * 180) / Math.PI).toFixed(2) : 0;
      const tag = tagOf.get(it.text);
      texts.push({ id: `t${++n}`, x: X(it.pts[0][0]), y: Y(it.pts[0][1]), h: +(it.h ?? 2.5).toFixed(3), ...(rot ? { rot } : {}), ...(align !== 'left' ? { align } : {}), text: it.text, ...(tag ? { tag } : {}) });
    }
  }
  const size = { w: +(box.maxX - box.minX).toFixed(2), h: +(box.maxY - box.minY).toFixed(2) };
  const next: TitleTemplate = { ...t, kind: 'drawn', cols: [], rows: [], cells: [], size, shapes, texts: fitTexts(shapes, texts, size.w) };
  if (isBorder(t)) {
    // The drawing area: the closed rectangle drawn on TB-REF (moved or stretched), else found again from the lines.
    const ref = items.find((it) => isRef(it) && it.kind === 'pline' && it.closed && it.pts.length >= 4);
    if (ref) {
      const xs = ref.pts.map((q) => q[0]), ys = ref.pts.map((q) => q[1]);
      next.border = { ...t.border, area: { x: X(Math.min(...xs)), y: Y(Math.max(...ys)), w: +(Math.max(...xs) - Math.min(...xs)).toFixed(2), h: +(Math.max(...ys) - Math.min(...ys)).toFixed(2) } };
    } else next.border = { ...t.border, area: detectArea(next, size) };
  }
  return next;
}

/** Saves the drawing's objects into its template; answers the project and a line about it, or why not. */
export function saveTitleBlockFromCad(p: Project, file: string): { project: Project; message: string } {
  const id = tbIdOf(file), t = id ? p.titleTemplates?.find((x) => x.id === id) : undefined;
  if (!t) return { project: p, message: 'This drawing is not a title block (open one with Project → Title block → Edit in CAD).' };
  const next = drawnFromSketch(sketchOf(p, file), t);
  const fields = (next.texts ?? []).filter((x) => FIELD.test(x.text));
  const border = next.border ? ` · whole border of ${next.border.paper}, drawing area ${next.border.area.w} × ${next.border.area.h} mm` : '';
  return { project: { ...p, titleTemplates: (p.titleTemplates ?? []).map((x) => (x.id === t.id ? next : x)) }, message: `Title block “${t.name}” saved: ${next.size!.w} × ${next.size!.h} mm, ${next.shapes?.length ?? 0} lines and shapes, ${fields.length} field(s)${border} · it prints on the sheets that use it` };
}
