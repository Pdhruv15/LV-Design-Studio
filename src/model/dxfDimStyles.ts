import { DIM_DEFAULTS, newStyleName, STANDARD, type CadDimStyle, type DimArrow, type DimUnit } from './cadStyles';

/** Dimension styles read from a DXF drawing made in another CAD program (its DIMSTYLE table), as Design CAD styles.
 * Sizes are taken as paper mm (inches in an imperial drawing), as the drawing's dimension variables give them before
 * DIMSCALE: the annotation scale is the project's own. The length is written as the drawing would: its units times
 * DIMLFAC, in m, cm or mm (with a measurement scale when it is none of these). */

/** One style as read, and what of it could not be kept. */
export interface ImportedDimStyle { style: CadDimStyle; notes: string[] }
export interface DxfDimStyles { styles: ImportedDimStyle[]; current?: string }

/** The arrowheads by their block name (the DIMBLK names, without the leading "_"). A blank name is the closed filled
 * arrow. */
const ARROWS: Record<string, DimArrow> = {
  '': 'filled', closedfilled: 'filled', closedblank: 'closed', closed: 'closed', open: 'open', open30: 'open30', open90: 'open90',
  oblique: 'tick', archtick: 'archTick', dot: 'dotFilled', dotsmall: 'dotSmall', dotblank: 'dot', small: 'dotSmall', origin: 'dot', origin2: 'dot',
  boxfilled: 'boxFilled', boxblank: 'box', datumfilled: 'filled', datumblank: 'closed', integral: 'open', none: 'none'
};
/** Millimetres in one drawing unit, by $INSUNITS. */
const MM_PER_UNIT: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

type Pair = [number, string];
/** The group code / value pairs of an ASCII DXF. */
function pairsOf(text: string): Pair[] {
  const lines = text.split(/\r?\n/), out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) throw new Error(`The DXF could not be read (line ${i + 1} is not a group code).`);
    out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

/** Each record of a TABLES table, as its group codes (the first value of each code; XDATA left out). */
function tableRecords(pairs: Pair[], table: string): Map<number, string>[] {
  const out: Map<number, string>[] = [];
  let inTables = false, inTable = false, rec: Map<number, string> | undefined, xdata = false;
  for (let i = 0; i < pairs.length; i += 1) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION' && pairs[i + 1]?.[0] === 2) { inTables = pairs[i + 1][1] === 'TABLES'; continue; }
    if (!inTables) continue;
    if (c === 0 && v === 'ENDSEC') break;
    if (c === 0 && v === 'TABLE') { inTable = pairs[i + 1]?.[0] === 2 && pairs[i + 1][1] === table; rec = undefined; continue; }
    if (!inTable) continue;
    if (c === 0) { rec = v === table ? new Map() : undefined; xdata = false; if (rec) out.push(rec); if (v === 'ENDTAB') inTable = false; continue; }
    if (c >= 1000) xdata = true;
    if (rec && !xdata && !rec.has(c)) rec.set(c, v);
  }
  return out;
}

/** A header variable's first value. */
function headerVar(pairs: Pair[], name: string): string | undefined {
  const i = pairs.findIndex(([c, v]) => c === 9 && v === name);
  return i >= 0 ? pairs[i + 1]?.[1] : undefined;
}

/** Reads the dimension styles of a DXF drawing's text. Throws, with what to do, for a DWG or binary DXF and for a
 * file that is not a DXF. */
export function readDxfDimStyles(text: string): DxfDimStyles {
  if (text.startsWith('AC10')) throw new Error('This is a DWG drawing. Save it as DXF in its CAD program (or with Save As here), then import that.');
  if (text.startsWith('AutoCAD Binary DXF')) throw new Error('Binary DXF cannot be read. Save the drawing as ASCII DXF, then import that.');
  const pairs = pairsOf(text);
  if (!pairs.some(([c, v]) => c === 0 && v === 'SECTION')) throw new Error('This is not a DXF drawing.');
  const insunits = Number(headerVar(pairs, '$INSUNITS') ?? 0), metric = headerVar(pairs, '$MEASUREMENT') !== '0';
  const mmPerUnit = MM_PER_UNIT[insunits] ?? (metric ? 1 : 25.4);
  // Paper sizes: as given in a metric drawing, from inches in an imperial one.
  const paper = insunits === 1 || insunits === 2 || (!insunits && !metric) ? 25.4 : 1;
  const blocks = new Map(tableRecords(pairs, 'BLOCK_RECORD').map((r) => [r.get(5) ?? '', r.get(2) ?? '']));
  const styles = tableRecords(pairs, 'DIMSTYLE').filter((r) => r.get(2)).map((r) => toStyle(r, blocks, metric, paper, mmPerUnit));
  return { styles, current: headerVar(pairs, '$DIMSTYLE') };
}

function toStyle(r: Map<number, string>, blocks: Map<string, string>, metric: boolean, paper: number, mmPerUnit: number): ImportedDimStyle {
  const notes: string[] = [];
  // The drawing's own defaults where it leaves a variable out: ISO-25 in a metric drawing, Standard in an imperial one.
  const num = (c: number, metricDef: number, imperialDef = metricDef) => { const v = Number(r.get(c)); return Number.isFinite(v) && r.has(c) ? v : metric ? metricDef : imperialDef; };
  const round2 = (v: number) => Math.round(v * 1000) / 1000;
  const mm = (v: number) => round2(Math.abs(v) * paper);
  const arrowOf = (nameCode: number, handleCode: number): DimArrow => {
    const name = (r.get(nameCode) ?? (r.has(handleCode) ? blocks.get(r.get(handleCode) ?? '') ?? '' : '')).replace(/^_/, '').toLowerCase();
    const a = ARROWS[name];
    if (a) return a;
    notes.push(`arrow block "${name}" drawn as closed filled`);
    return 'filled';
  };
  const tick = num(142, 0);
  let arrow: DimArrow, arrow2: DimArrow | 'same' = 'same';
  if (tick > 0) arrow = 'tick';
  else if (num(173, 0) === 1) { arrow = arrowOf(6, 343); const b = arrowOf(7, 344); if (b !== arrow) arrow2 = b; }
  else arrow = arrowOf(5, 342);
  const tad = num(77, 1, 0), just = num(280, 0);
  // The length: the drawing's units times DIMLFAC, per metre.
  const perM = (1000 / mmPerUnit) * (num(144, 1) || 1);
  const unitOf = (): { unit: DimUnit; scale: number } => {
    for (const [u, f] of [['m', 1], ['cm', 100], ['mm', 1000]] as const) if (Math.abs(perM / f - 1) < 1e-6) return { unit: u, scale: 1 };
    return { unit: 'mm', scale: perM / 1000 };
  };
  const post = r.get(3) ?? '', at = post.indexOf('<>');
  if (num(40, 1) !== 1) notes.push(`DIMSCALE ${num(40, 1)} left to the annotation scale`);
  if (num(147, 0.625, 0.09) < 0) notes.push('box round the text not drawn');
  return {
    notes,
    style: {
      ...DIM_DEFAULTS,
      name: r.get(2) ?? STANDARD,
      arrow, arrow2,
      arrowMm: mm(tick > 0 ? tick * 2 * Math.SQRT2 : num(41, 2.5, 0.18)),
      textMm: mm(num(140, 2.5, 0.18)),
      offsetMm: mm(num(42, 0.625, 0.0625)),
      extendMm: mm(num(44, 1.25, 0.18)),
      dleMm: mm(num(46, 0)),
      gapMm: mm(num(147, 0.625, 0.09)),
      hideExt1: num(75, 0) === 1, hideExt2: num(76, 0) === 1,
      textPos: tad === 0 ? 'centered' : tad === 4 ? 'below' : 'above',
      textAlong: just === 1 ? 'first' : just === 2 ? 'second' : 'centre',
      textFlat: num(73, 0, 1) === 1,
      decimals: Math.max(0, Math.min(4, Math.round(num(271, 2, 4)))),
      ...unitOf(),
      round: Math.max(0, num(45, 0)),
      trimZeros: (num(78, 8, 0) & 8) !== 0,
      comma: num(278, 44, 46) === 44,
      prefix: at >= 0 ? post.slice(0, at) : '',
      suffix: at >= 0 ? post.slice(at + 2) : post
    }
  };
}

/** The styles imported into those there are: each under its own name, or, when that is taken, with the file's name
 * after it ("ISO-25 (plan)"), numbered if that is taken too. */
export function mergeImported(existing: string[], imported: CadDimStyle[], file: string): CadDimStyle[] {
  const names = [...existing], stem = file.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  return imported.map((s) => {
    const taken = (n: string) => names.some((x) => x.toLowerCase() === n.toLowerCase());
    let name = s.name.trim() || 'Imported';
    if (taken(name)) { const b = `${name} (${stem})`; name = taken(b) ? newStyleName(names, b) : b; }
    names.push(name);
    return { ...s, name };
  });
}
