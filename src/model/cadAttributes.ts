import type { Feeder, SketchItem } from '../types';
import { attdefsOf, attrValue, blockDefOf, type CadBlockDef } from './cadBlocks';

/** Design CAD → block attributes (ATTDEF, ATTEDIT, ATTEXT; S11 of the 2D gap plan): the values on the inserts of a
 * drawing as a table, and the circuits they name matched to the project's feeders (a report, never a change to the
 * load schedule). */

/** One row of the attributes table: the insert's block, the tag and its value, the insert's layer and place (metres),
 * and the feeder a CIRCUIT value names, when asked for and found. */
export interface AttributeRow { block: string; tag: string; value: string; layer: string; x: number; y: number; feeder?: string }
export const ATTRIBUTE_HEAD = ['Block', 'Tag', 'Value', 'Layer', 'X (m)', 'Y (m)'];

/** The tags whose values name a circuit (any case): matched to a feeder by its id or its name. */
const CIRCUIT_TAGS = new Set(['CIRCUIT', 'CCT', 'CKT']);
/** The feeder a value names, by id or name, case aside; undefined when none does. */
export function feederFor(value: string, feeders: Pick<Feeder, 'id' | 'name'>[]): string | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  return feeders.find((f) => f.id.toLowerCase() === v)?.id ?? feeders.find((f) => f.name.trim().toLowerCase() === v)?.id;
}

/** Every attribute of every insert among the objects (constant ones with their fixed value), one row each. With
 * `feeders`, a CIRCUIT / CCT / CKT value is matched to a feeder (the Feeder column). */
export function attributeRows(items: SketchItem[], defs: CadBlockDef[], metresPerUnit: number, feeders?: Pick<Feeder, 'id' | 'name'>[]): AttributeRow[] {
  const out: AttributeRow[] = [];
  for (const it of items) {
    if (it.kind !== 'insert') continue;
    const def = blockDefOf(defs, it.block);
    for (const ad of attdefsOf(def)) {
      const value = attrValue(it, ad), tag = ad.tag ?? '';
      const row: AttributeRow = { block: def!.name, tag, value, layer: it.layer, x: it.pts[0][0] * metresPerUnit, y: it.pts[0][1] * metresPerUnit };
      if (feeders && CIRCUIT_TAGS.has(tag.toUpperCase())) { const f = feederFor(value, feeders); if (f) row.feeder = f; }
      out.push(row);
    }
  }
  return out;
}
const csvCell = (v: string | number) => { const s = typeof v === 'number' ? v.toFixed(3) : v; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** The table as CSV (a header row; the Feeder column when any row has one). */
export function attributesCsv(rows: AttributeRow[]): string {
  const withFeeder = rows.some((r) => r.feeder !== undefined);
  const head = withFeeder ? [...ATTRIBUTE_HEAD, 'Feeder'] : ATTRIBUTE_HEAD;
  return [head.join(','), ...rows.map((r) => [r.block, r.tag, r.value, r.layer, r.x, r.y, ...(withFeeder ? [r.feeder ?? ''] : [])].map(csvCell).join(','))].join('\r\n') + '\r\n';
}
/** A tag as a block keeps it: upper case, no spaces or the characters a block name refuses. */
export const cleanTag = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '_').replace(/[<>/\\":;?*|=`]/g, '');
