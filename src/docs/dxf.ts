/** Minimal DXF (R12, ASCII) writer: lines, polylines, solids, circles and
 * text on named layers. R12 opens in every CAD program. Coordinates are in drawing units, y up. */

/** Width is a physical stroke width for lines/polylines, and an exact fitted
 * baseline length for text. All widths are in the same drawing units as x/y. */
export type DxfPrimitive = (
  | { type: 'line'; layer: string; x1: number; y1: number; x2: number; y2: number; width?: number; linetype?: string; dashed?: boolean }
  | { type: 'polyline'; layer: string; points: [number, number][]; closed?: boolean; width?: number; linetype?: string; dashed?: boolean; /** Bulge of the segment that starts at each vertex (tan of a quarter of its arc angle). */ bulges?: number[] }
  | { type: 'circle'; layer: string; x: number; y: number; r: number; linetype?: string; dashed?: boolean }
  | { type: 'text'; layer: string; x: number; y: number; height: number; text: string; align?: 'left' | 'center' | 'right'; rotation?: number; width?: number }
  | { type: 'insert'; layer: string; name: string; x: number; y: number; scale?: number; rotation?: number; block: DxfBlock; attribs: DxfAttrib[]; extent?: [[number, number], [number, number]] }
) & {
  /** Equipment tag ("feeder:<id>", "board:<id>"), written as extended data under DXF_APP so a CAD
   * program can tell which board or feeder each object belongs to (and later update or measure it). */
  tag?: string;
};
/** A block definition written to the BLOCKS section (a company title block): its geometry about its base point (0, 0)
 * and its attribute definitions, so an INSERT of it carries editable ATTRIB values in CAD. */
export interface DxfBlock { name: string; items: DxfPrimitive[]; attdefs: DxfAttdef[] }
export interface DxfAttdef { tag: string; prompt: string; value: string; x: number; y: number; height: number; align?: 'left' | 'center' | 'right'; rotation?: number }
/** An attribute of an INSERT: its value where it prints (drawing coordinates). */
export interface DxfAttrib { tag: string; value: string; x: number; y: number; height: number; align?: 'left' | 'center' | 'right'; rotation?: number }
/** A block name as DXF allows it: letters, digits, _ - $, at most 31 characters. */
export const dxfBlockName = (name: string) => (name.toUpperCase().replace(/[^A-Z0-9_$-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31) || 'TITLE_BLOCK');

/** Registered application name of the extended data that carries equipment tags. */
export const DXF_APP = 'LVDS';

/** Layer → CAD colour index (ACI). */
export const DXF_LAYERS: Record<string, number> = {
  BUSBAR: 1, // red
  CABLE: 7, // white / black
  SYMBOL: 3, // green
  TEXT: 7,
  RESULT: 4, // cyan
  FRAME: 7,
  TITLE: 7
};

/** Linetypes the writer can define: dash and gap lengths in drawing units (mm on a sheet). `dashed` on a primitive
 * marks an element to be drawn dashed; the caller that knows the paper scale picks the name. */
export const LINETYPES: Record<string, { description: string; pattern: number[] }> = {
  'LV-DASHED': { description: 'Dashed', pattern: [3, -1.5] },
  'LV-DASHED2': { description: 'Dashed (short)', pattern: [1.5, -0.75] }
};

const n = (v: number) => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(4).replace(/\.?0+$/, ''));
/** DXF text can't hold newlines; R12 is not Unicode, so keep printable ASCII
 * and spell out the few symbols the diagram uses. */
export const dxfText = (s: string) =>
  s.replace(/²/g, '2').replace(/[×]/g, 'x').replace(/[·•]/g, '-').replace(/[–—−]/g, '-').replace(/±/g, '+/-').replace(/[″]/g, '"').replace(/Δ/g, 'd')
    .replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/→/g, '->').replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, '');

const positiveWidth = (width?: number) => typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : 0;
// Roman Duplex provides stronger lettering than the thin fallback font. The
// style name must match the font basename: LibreCAD resolves TEXT's style
// name as its font, while other CAD programs resolve the STYLE table's SHX filename.
const TEXT_STYLE = 'ROMAND';
type DxfTextPrimitive = Extract<DxfPrimitive, { type: 'text' }>;
type DxfStrokePrimitive = Extract<DxfPrimitive, { type: 'line' | 'polyline' }>;
type Point = [number, number];
type Quad = [Point, Point, Point, Point];

/** Physical strokes are filled SOLID strips. Some R12 readers (including
 * LibreCAD 2.2.1) discard polyline width; explicit geometry keeps the busbar
 * visible and editable without depending on CAD lineweight display settings. */
function strokeQuads(i: DxfStrokePrimitive): Quad[] {
  const halfWidth = positiveWidth(i.width) / 2;
  if (!halfWidth) return [];
  const input: Point[] = i.type === 'line' ? [[i.x1, i.y1], [i.x2, i.y2]] : i.points;
  const points: Point[] = [];
  const same = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
  for (const p of input) if (!points.length || !same(points[points.length - 1], p)) points.push(p);
  if (i.type === 'polyline' && i.closed && points.length > 1 && same(points[0], points[points.length - 1])) points.pop();
  if (points.length < 2) return [];
  const closed = i.type === 'polyline' && !!i.closed && points.length > 2;
  const segmentCount = closed ? points.length : points.length - 1;
  const normals: Point[] = Array.from({ length: segmentCount }, (_, j) => {
    const a = points[j], b = points[(j + 1) % points.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  });
  const bevels: Quad[] = [];
  const offset = (p: Point, normal: Point, sign = 1): Point => [p[0] + normal[0] * sign, p[1] + normal[1] * sign];
  const joins = points.map((p, j): { incoming: Point; outgoing: Point } => {
    const incoming = j > 0 ? normals[j - 1] : closed ? normals[normals.length - 1] : undefined;
    const outgoing = normals[j];
    if (!incoming || !outgoing) {
      const n = incoming ?? outgoing!;
      const normal: Point = [n[0] * halfWidth, n[1] * halfWidth];
      return { incoming: normal, outgoing: normal };
    }
    const divisor = 1 + incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
    // Normal joins share one exact offset edge. Limit sharp/reversing joins to
    // a bevel instead of producing enormous or crossed strip corners.
    if (divisor > 1e-9) {
      const miter: Point = [(incoming[0] + outgoing[0]) * halfWidth / divisor, (incoming[1] + outgoing[1]) * halfWidth / divisor];
      if (Math.hypot(miter[0], miter[1]) <= halfWidth * 4) return { incoming: miter, outgoing: miter };
    }
    const a: Point = [incoming[0] * halfWidth, incoming[1] * halfWidth], b: Point = [outgoing[0] * halfWidth, outgoing[1] * halfWidth];
    const turn = incoming[0] * outgoing[1] - incoming[1] * outgoing[0];
    if (Math.abs(turn) > 1e-9) {
      const side = turn > 0 ? -1 : 1, end = offset(p, b, side);
      bevels.push([p, offset(p, a, side), end, end]);
    }
    return { incoming: a, outgoing: b };
  });
  const strips: Quad[] = Array.from({ length: segmentCount }, (_, j) => {
    const end = (j + 1) % points.length;
    return [offset(points[j], joins[j].outgoing), offset(points[end], joins[end].incoming), offset(points[end], joins[end].incoming, -1), offset(points[j], joins[j].outgoing, -1)];
  });
  return strips.concat(bevels);
}

/** Fit is R12 TEXT justification 5. Its two baseline endpoints control the
 * rendered width independently of the CAD font, without changing text height.
 * Keep the original left/centre/right anchor when deriving those endpoints. */
function fittedBaseline(i: DxfTextPrimitive): { start: [number, number]; end: [number, number]; dx: number; dy: number } {
  const width = positiveWidth(i.width);
  const rotation = (i.rotation ?? 0) * Math.PI / 180;
  const dx = Math.cos(rotation), dy = Math.sin(rotation);
  const offset = width * (i.align === 'center' ? 0.5 : i.align === 'right' ? 1 : 0);
  const start: [number, number] = [i.x - dx * offset, i.y - dy * offset];
  return { start, end: [start[0] + dx * width, start[1] + dy * width], dx, dy };
}

function boundsPoints(i: DxfPrimitive): [number, number][] {
  if (i.type === 'insert') return i.extent ?? [[i.x, i.y]];
  if (i.type === 'line' || i.type === 'polyline') {
    const points: [number, number][] = i.type === 'line' ? [[i.x1, i.y1], [i.x2, i.y2]] : i.points;
    return positiveWidth(i.width) ? strokeQuads(i).flat() : points;
  }
  if (i.type === 'text' && positiveWidth(i.width) && dxfText(i.text).trim()) {
    const { start, end, dx, dy } = fittedBaseline(i);
    // Include a descender allowance as well as the nominal cap height. The
    // exact glyph envelope is font-dependent; the fitted baseline is exact.
    return [start, end].flatMap(([x, y]) => [-i.height * 0.25, i.height].map((h): [number, number] => [x - dy * h, y + dx * h]));
  }
  // Preserve legacy extents for unmeasured text and circle centre points.
  return [[i.x, i.y]];
}

export function toDxf(items: DxfPrimitive[], layerColours: Record<string, number> = DXF_LAYERS, opts: { /** $INSUNITS (4 = mm), so a reader knows the drawing's units. */ insunits?: number } = {}): string {
  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), typeof value === 'number' ? n(value) : value);
  const layers = [...new Set([...Object.keys(layerColours), ...items.map((i) => i.layer)])];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, hasPoints = false;
  // Accumulate per entity: large drawings must not pass every coordinate as
  // function arguments, or allocate drawing-wide point/x/y copies.
  for (const item of items) {
    for (const [x, y] of boundsPoints(item)) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      hasPoints = true;
    }
  }

  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$FILLMODE'); g(70, 1);
  // Linetypes used by entities, including those inside block definitions.
  const usedLinetypes = new Set<string>();
  const noteLinetype = (i: DxfPrimitive) => { if ('linetype' in i && i.linetype && LINETYPES[i.linetype]) usedLinetypes.add(i.linetype); };
  for (const i of items) { noteLinetype(i); if (i.type === 'insert') for (const b of i.block.items) noteLinetype(b); }
  if (usedLinetypes.size) { g(9, '$LTSCALE'); g(40, 1); }
  if (opts.insunits) { g(9, '$INSUNITS'); g(70, opts.insunits); }
  g(9, '$EXTMIN'); g(10, hasPoints ? minX : 0); g(20, hasPoints ? minY : 0); g(30, 0);
  g(9, '$EXTMAX'); g(10, hasPoints ? maxX : 0); g(20, hasPoints ? maxY : 0); g(30, 0);
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1 + usedLinetypes.size);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  for (const name of usedLinetypes) {
    const { description, pattern } = LINETYPES[name];
    g(0, 'LTYPE'); g(2, name); g(70, 0); g(3, description); g(72, 65); g(73, pattern.length); g(40, pattern.reduce((a, v) => a + Math.abs(v), 0));
    for (const v of pattern) g(49, v);
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
  for (const l of layers) { g(0, 'LAYER'); g(2, l); g(70, 0); g(62, layerColours[l] ?? 7); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  const textStyles = [['STANDARD', 'txt.shx'], [TEXT_STYLE, 'romand.shx']];
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, textStyles.length);
  for (const [name, font] of textStyles) {
    g(0, 'STYLE'); g(2, name); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, font); g(4, '');
  }
  g(0, 'ENDTAB');
  // Tagged drawings register the extended-data application; untagged output is unchanged.
  const tagged = items.some((i) => i.tag);
  if (tagged) {
    g(0, 'TABLE'); g(2, 'APPID'); g(70, 2);
    for (const app of ['ACAD', DXF_APP]) { g(0, 'APPID'); g(2, app); g(70, 0); }
    g(0, 'ENDTAB');
  }
  g(0, 'ENDSEC');

  // Extended data comes last in an entity's group codes.
  const xdata = (tag?: string) => { if (tag) { g(1001, DXF_APP); g(1000, tag); } };
  const ltype = (name?: string) => { if (name && LINETYPES[name]) g(6, name); };
  const polyline = (layer: string, vertices: [number, number][], closed: boolean, tag?: string, linetype?: string, bulges?: number[]) => {
    const patterned = !!linetype && !!LINETYPES[linetype];
    g(0, 'POLYLINE'); g(8, layer); ltype(linetype); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, (closed ? 1 : 0) | (patterned ? 128 : 0)); xdata(tag);
    vertices.forEach(([x, y], j) => {
      g(0, 'VERTEX'); g(8, layer); g(10, x); g(20, y); g(30, 0);
      if (bulges?.[j]) g(42, bulges[j]);
    });
    g(0, 'SEQEND'); g(8, layer);
  };
  const solids = (i: DxfStrokePrimitive) => {
    for (const quad of strokeQuads(i)) {
      g(0, 'SOLID'); g(8, i.layer);
      // DXF SOLID swaps the last two perimeter corners. A bevel triangle
      // repeats its last corner, as required for a three-point SOLID.
      [0, 1, 3, 2].forEach((corner, j) => {
        g(10 + j, quad[corner][0]); g(20 + j, quad[corner][1]); g(30 + j, 0);
      });
      xdata(i.tag);
    }
  };

  // Block definitions of the inserts, each once.
  const blocks = new Map<string, DxfBlock>();
  for (const i of items) if (i.type === 'insert' && !blocks.has(i.name)) blocks.set(i.name, i.block);
  const textEntity = (kind: 'TEXT' | 'ATTDEF' | 'ATTRIB', layer: string, x: number, y: number, height: number, value: string, align?: 'left' | 'center' | 'right', rotation?: number, tag?: string, prompt?: string) => {
    g(0, kind); g(8, layer); g(7, TEXT_STYLE); g(10, x); g(20, y); g(30, 0); g(40, height); g(1, dxfText(value));
    if (rotation) g(50, rotation);
    const h = align === 'center' ? 1 : align === 'right' ? 2 : 0;
    if (h) { g(72, h); g(11, x); g(21, y); g(31, 0); }
    if (kind !== 'TEXT') { if (kind === 'ATTDEF') g(3, prompt ?? tag ?? ''); g(2, tag ?? ''); g(70, 0); }
  };
  const entity = (i: DxfPrimitive) => {
    if (i.type === 'line') {
      if (positiveWidth(i.width)) solids(i);
      else { g(0, 'LINE'); g(8, i.layer); ltype(i.linetype); g(10, i.x1); g(20, i.y1); g(30, 0); g(11, i.x2); g(21, i.y2); g(31, 0); xdata(i.tag); }
    } else if (i.type === 'circle') {
      g(0, 'CIRCLE'); g(8, i.layer); ltype(i.linetype); g(10, i.x); g(20, i.y); g(30, 0); g(40, i.r); xdata(i.tag);
    } else if (i.type === 'polyline') {
      if (i.points.length < 2) return;
      if (positiveWidth(i.width)) solids(i);
      else polyline(i.layer, i.points, !!i.closed, i.tag, i.linetype, i.bulges);
    } else if (i.type === 'text') {
      if (!dxfText(i.text).trim()) return;
      const fit = positiveWidth(i.width) ? fittedBaseline(i) : undefined;
      g(0, 'TEXT'); g(8, i.layer); g(7, TEXT_STYLE); g(10, fit?.start[0] ?? i.x); g(20, fit?.start[1] ?? i.y); g(30, 0); g(40, i.height); g(1, dxfText(i.text));
      if (i.rotation) g(50, i.rotation);
      const h = i.align === 'center' ? 1 : i.align === 'right' ? 2 : 0;
      if (fit) { g(72, 5); g(73, 0); g(11, fit.end[0]); g(21, fit.end[1]); g(31, 0); }
      else if (h) { g(72, h); g(11, i.x); g(21, i.y); g(31, 0); }
      xdata(i.tag);
    } else {
      // INSERT with its attributes following (66 = 1), closed by SEQEND.
      g(0, 'INSERT'); g(8, i.layer); if (i.attribs.length) g(66, 1); g(2, i.name); g(10, i.x); g(20, i.y); g(30, 0);
      const sc = i.scale ?? 1; g(41, sc); g(42, sc); g(43, sc); if (i.rotation) g(50, i.rotation); xdata(i.tag);
      for (const a of i.attribs) textEntity('ATTRIB', i.layer, a.x, a.y, a.height, a.value, a.align, a.rotation, a.tag);
      if (i.attribs.length) { g(0, 'SEQEND'); g(8, i.layer); }
    }
  };
  if (blocks.size) {
    g(0, 'SECTION'); g(2, 'BLOCKS');
    for (const b of blocks.values()) {
      g(0, 'BLOCK'); g(8, '0'); g(2, b.name); g(70, b.attdefs.length ? 2 : 0); g(10, 0); g(20, 0); g(30, 0); g(3, b.name);
      for (const it of b.items) if (it.type !== 'insert') entity(it);
      for (const a of b.attdefs) textEntity('ATTDEF', 'E-TITLE', a.x, a.y, a.height, a.value, a.align, a.rotation, a.tag, a.prompt);
      g(0, 'ENDBLK'); g(8, '0');
    }
    g(0, 'ENDSEC');
  }

  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const i of items) entity(i);
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

/** Title block as DXF lines and text, bottom-right corner at (x, y), in
 * drawing units; rows of [label, value] cells. */
export function titleBlockDxf(x: number, y: number, width: number, rows: [string, string][][]): DxfPrimitive[] {
  const rowH = width / 12;
  const out: DxfPrimitive[] = [];
  const left = x - width;
  const top = y + rowH * rows.length;
  out.push({ type: 'polyline', layer: 'TITLE', closed: true, points: [[left, y], [x, y], [x, top], [left, top]] });
  rows.forEach((cells, i) => {
    const y0 = top - rowH * (i + 1);
    if (i > 0) out.push({ type: 'line', layer: 'TITLE', x1: left, y1: y0 + rowH, x2: x, y2: y0 + rowH });
    const cw = width / cells.length;
    cells.forEach(([k, v], j) => {
      const cx = left + cw * j;
      if (j > 0) out.push({ type: 'line', layer: 'TITLE', x1: cx, y1: y0, x2: cx, y2: y0 + rowH });
      const available = Math.max(0, cw - rowH * 0.24);
      const text = (value: string, height: number, baseline: number): DxfPrimitive => {
        // Manual title cells have no SVG/font measurement. Only constrain long
        // values: ordinary short labels keep their natural CAD text width.
        const estimate = dxfText(value).length * height * 0.8;
        return { type: 'text', layer: 'TITLE', x: cx + rowH * 0.12, y: y0 + rowH * baseline, height, text: value, ...(estimate > available && available > 0 ? { width: available } : {}) };
      };
      out.push(text(k.toUpperCase(), rowH * 0.18, 0.66));
      out.push(text(v, rowH * 0.3, 0.18));
    });
  });
  return out;
}
