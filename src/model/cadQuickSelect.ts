import type { SketchItem } from '../types';
import { geometryRows, geomKind, kindChoices, kindLabel, propValue, textRows, type PropKey } from './cadProps';

/** Design CAD → Quick select (QSELECT) and Select similar (SELECTSIMILAR), S3 of the 2D gap plan: drawn objects picked
 * by kind and a property, or like the ones picked. Values are compared as the Properties palette shows them: metres
 * and degrees for geometry (k = metres per drawing unit), text otherwise. */

export type QsOp = '=' | '≠' | '>' | '<' | '*' | 'all';
export const QS_OPS: { op: QsOp; label: string }[] = [
  { op: '=', label: '= Equals' }, { op: '≠', label: '≠ Not equal' }, { op: '>', label: '> Greater than' }, { op: '<', label: '< Less than' },
  { op: '*', label: '* Wildcard match' }, { op: 'all', label: 'Select all' }
];
export type QsKey = 'layer' | 'color' | 'lt' | 'lw' | PropKey;
/** A property offered: `list` when its value is picked from those present (layer, colour, linetype, lineweight). */
export interface QsField { key: QsKey; label: string; unit?: 'm' | 'deg'; list?: true }
/** What to select: the kind (the palette's name; blank for every kind), the property and how its value compares;
 * `exclude` keeps the objects that do not match instead. */
export interface QsFilter { kind: string; key: QsKey; op: QsOp; value: string; exclude?: boolean }

const GENERAL: QsField[] = [{ key: 'layer', label: 'Layer', list: true }, { key: 'color', label: 'Colour', list: true }, { key: 'lt', label: 'Linetype', list: true }, { key: 'lw', label: 'Lineweight', list: true }];

/** The kinds among the objects (as the palette names them) with how many of each; the blank id means every kind. */
export const qsKinds = (items: SketchItem[]) => kindChoices(items);

/** The properties of a kind: layer, colour, linetype and lineweight for every kind, then the geometry and text rows the
 * palette shows for that kind (a polyline's vertex rows left out: they need a vertex). */
export function qsFields(kind: string, items: SketchItem[]): QsField[] {
  const sel = kind ? items.filter((it) => kindLabel(it) === kind) : items;
  const gks = new Set(sel.map(geomKind));
  if (!kind || gks.size !== 1) return GENERAL;
  const gk = [...gks][0];
  const rows = [...geometryRows(gk, sel), ...textRows(gk)].filter((r) => r.key !== 'vx' && r.key !== 'vy');
  return [...GENERAL, ...rows.map((r): QsField => ({ key: r.key, label: r.label, ...(r.unit ? { unit: r.unit } : {}) }))];
}

/** An object's value for a property: text, or a number in metres or degrees; undefined when it has none. */
export function qsValue(it: SketchItem, key: QsKey, k: number): string | number | undefined {
  switch (key) {
    case 'layer': return it.layer;
    case 'color': return it.color ?? 'ByLayer';
    case 'lt': return it.lt ?? 'ByLayer';
    case 'lw': return it.lw !== undefined ? `${it.lw} mm` : 'ByLayer';
    default: return propValue(it, key, k);
  }
}
const asText = (v: string | number) => (typeof v === 'number' ? String(+v.toFixed(4)) : v);

/** The values present for a property, each once, in order, for the dialog's list. */
export function qsValues(items: SketchItem[], key: QsKey, k: number): string[] {
  const s = new Set<string>();
  for (const it of items) { const v = qsValue(it, key, k); if (v !== undefined) s.add(asText(v)); }
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** A wildcard pattern (* any run of characters, ? one) as a test, case ignored. */
export function wildcard(pattern: string): (s: string) => boolean {
  const re = new RegExp(`^${pattern.split(/([*?])/).map((p) => (p === '*' ? '.*' : p === '?' ? '.' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`, 'i');
  return (s) => re.test(s);
}

/** The objects the filter picks: those of the kind (any kind when blank) whose property compares as asked; with
 * `exclude`, those of the kind that do not. Numbers compare within a millionth; text without regard to case. */
export function quickSelect(pool: SketchItem[], f: QsFilter, k: number): SketchItem[] {
  const ofKind = f.kind ? pool.filter((it) => kindLabel(it) === f.kind) : pool;
  if (f.op === 'all') return f.exclude ? [] : ofKind;
  const want = f.value.trim(), num = Number(want.replace(',', '.').replace(/\s*(mm|m|°|deg)$/i, ''));
  const match = (it: SketchItem): boolean => {
    const v = qsValue(it, f.key, k);
    if (v === undefined) return false;
    if (typeof v === 'number') {
      if (f.op === '*') return wildcard(want)(asText(v));
      if (!want || !Number.isFinite(num)) return false;
      const eq = Math.abs(v - num) <= 1e-6 * Math.max(1, Math.abs(num));
      return f.op === '=' ? eq : f.op === '≠' ? !eq : f.op === '>' ? v > num && !eq : v < num && !eq;
    }
    if (f.op === '*') return wildcard(want)(v);
    const c = v.localeCompare(want, undefined, { numeric: true, sensitivity: 'accent' });
    return f.op === '=' ? c === 0 : f.op === '≠' ? c !== 0 : f.op === '>' ? c > 0 : c < 0;
  };
  return ofKind.filter((it) => match(it) !== !!f.exclude);
}

/** What SELECTSIMILAR matches besides the kind and layer. */
export interface SimilarOpts { colour: boolean; linetype: boolean }
/** The objects like any of those picked: the same kind and layer (a cable tray: its width and service too; a cable
 * route: its feeder), and the same colour and linetype when asked. */
export function selectSimilar(pool: SketchItem[], picked: SketchItem[], opts: SimilarOpts = { colour: false, linetype: false }): SketchItem[] {
  const sig = (it: SketchItem) => [kindLabel(it), it.layer.toLowerCase(), it.tray ? `${it.tray.widthMm}|${it.tray.service ?? ''}` : '', it.cable?.feederId ?? '',
    opts.colour ? it.color ?? '' : '', opts.linetype ? it.lt ?? '' : ''].join('\u0000');
  const want = new Set(picked.map(sig));
  return pool.filter((it) => want.has(sig(it)));
}
